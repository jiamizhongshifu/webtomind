import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  enqueueVisualImageTask,
  getVisualImageTaskStatus,
  importGenerationAsReference,
  loadVisualImageHistoryBlobUrl,
  uploadImageReference,
  type VisualGeneratedImage,
  type VisualImageHistoryItem
} from '@/services/agent-api';
import { IMAGE_TOOL_MODELS, isPublishedImageToolModel } from '@/shared/image-tool-models';
import { runImageUpscale, type ImageUpscaleTarget } from '@/web/lib/image-upscale';
import { decodeImageFile, releaseDecodedImage, supportsWebGpu } from '@/web/lib/image-tools';
import { imageBlobToDataUrl, loadEditorImageBlob, renderEditorImageInputs, selectionMaskToEditMask } from './editor-image-input';
import type { ImageCreatorModelOption } from '../../data/image-creator-options';
import {
  buildAdjustmentFilter,
  buildAdjustmentInstruction,
  buildAnnotateInstructions,
  buildCameraInstruction,
  buildDrawInstructions,
  buildRegionInstructions,
  composeEditorInstruction,
  DEFAULT_CAMERA_ANGLE,
  type CameraAngleState,
  type BrushStroke,
  type EditorRegion,
  type EditorToolId
} from './editor-tools';

export interface EditorSource {
  kind: 'upload' | 'asset';
  label: string;
  referenceId: string;
  displayUrl: string;
  generationId?: string;
  width?: number;
  height?: number;
}

export interface ImageAdjustments {
  brightness: number; // 0-100, 50 = 中性
  contrast: number;
  saturation: number;
  colorTemp: number;
}

export const DEFAULT_IMAGE_ADJUSTMENTS: ImageAdjustments = {
  brightness: 50,
  contrast: 50,
  saturation: 50,
  colorTemp: 50
};

interface EditorSnapshot {
  imageUrl: string;
  versions: EditorVersion[];
  activeVersionId: string;
  regions: EditorRegion[];
  strokes: BrushStroke[];
  adjustments: ImageAdjustments;
}

const MAX_HISTORY = 50;

export interface EditorVersion {
  id: string;
  label: string;
  url: string;
  generationId?: string;
  referenceId?: string;
}

export interface EditorExtraReference {
  id: string;
  kind: 'upload' | 'asset';
  label: string;
  displayUrl: string;
  referenceId: string;
}

export function isEditorBusy(status: EditorGenerationState['status']) {
  return status === 'queued' || status === 'running';
}

export interface EditorGenerationState {
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'idle';
  progress: number;
  label: string;
}

const EDITOR_APP_SLUG = 'image-editor';
const DEFAULT_MAX_EXTRA_REFERENCES = 3;
const MAX_POLL_ATTEMPTS = 150; // 约 10 分钟上限（与 waitForVisualImageTask 对齐）
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 与上传接口限制对齐
const MAX_IMAGE_PIXELS = 64_000_000; // 约 8000×8000
const MAX_CROP_PIXELS = 40_000_000; // 裁剪输出上限，避免超大 canvas 内存压力

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('图片读取失败。'));
    reader.readAsDataURL(file);
  });
}

function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.includes(',')
    ? dataUrl.slice(dataUrl.indexOf(',') + 1)
    : dataUrl;
}

function imageSizeFromFile(
  file: File
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 0, height: 0 });
    };
    image.src = url;
  });
}

export function useImageEditor(
  models: ImageCreatorModelOption[],
  isEnglish: boolean
) {
  const [source, setSource] = useState<EditorSource | null>(null);
  const [versions, setVersions] = useState<EditorVersion[]>([]);
  const [activeVersionId, setActiveVersionId] = useState('');
  const [extraReferences, setExtraReferences] = useState<
    EditorExtraReference[]
  >([]);
  const [currentImageUrl, setCurrentImageUrl] = useState('');
  const [prompt, setPrompt] = useState('');
  const [adjustments, setAdjustments] = useState<ImageAdjustments>(
    DEFAULT_IMAGE_ADJUSTMENTS
  );
  const [camera, setCamera] = useState<CameraAngleState>(DEFAULT_CAMERA_ANGLE);
  const [model, setModel] = useState<string>('nano-banana-2');
  const [regions, setRegions] = useState<EditorRegion[]>([]);
  const [regionMode, setRegionMode] = useState<'select' | 'draw' | 'auto'>(
    'select'
  );
  const [activeRegionId, setActiveRegionId] = useState<string | null>(null);
  const [autoMask, setAutoMask] = useState<{
    maskImageId?: string;
    maskUrl?: string;
    selectionBlob?: Blob;
    pending?: boolean;
    error?: string;
  }>({});
  const [strokes, setStrokes] = useState<BrushStroke[]>([]);
  const [brushSize, setBrushSize] = useState(8);
  const [brushColor, setBrushColor] = useState('#FF6B6B');
  const [drawPrompt, setDrawPrompt] = useState('');
  const [cropExpand, setCropExpand] = useState<{
    aspect: string | null;
    prompt: string;
  }>({ aspect: null, prompt: '' });
  const [activeTool, setActiveTool] = useState<EditorToolId | null>(null);
  const [generation, setGeneration] = useState<EditorGenerationState>({
    status: 'idle',
    progress: 0,
    label: ''
  });
  const needsVisualGuide = Boolean(strokes.length || ((regions.length || autoMask.maskUrl) && !model.startsWith('gpt-image')));
  const [error, setError] = useState('');
  const [resultCount, setResultCount] = useState(0);
  const [history, setHistory] = useState<EditorSnapshot[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const historyRef = useRef<EditorSnapshot[]>([]);
  const historyIndexRef = useRef(-1);
  const pollTimerRef = useRef<number | null>(null);
  const generationRef = useRef<{ taskId: string } | null>(null);
  // 画布扩展框的实际宽高比（画布组件写入，生成时读取，不触发渲染）
  const cropExtentRef = useRef<number | null>(null);
  const versionSwitchInFlightRef = useRef(false);
  const submissionRef = useRef(false);
  const enhanceControllerRef = useRef<AbortController | null>(null);
  const autoMaskEpochRef = useRef(0);

  useEffect(() => {
    autoMaskEpochRef.current += 1;
    setAutoMask((current) => {
      if (current.maskUrl) URL.revokeObjectURL(current.maskUrl);
      return {};
    });
  }, [activeVersionId, source]);

  const applySnapshot = useCallback((snapshot: EditorSnapshot) => {
    setVersions(snapshot.versions);
    setActiveVersionId(snapshot.activeVersionId);
    setCurrentImageUrl(snapshot.imageUrl);
    setRegions(snapshot.regions);
    setStrokes(snapshot.strokes);
    setAdjustments(snapshot.adjustments);
  }, []);

  const commitSnapshot = useCallback((snapshot: EditorSnapshot) => {
    const index = historyIndexRef.current;
    const nextHistory = historyRef.current
      .slice(0, index + 1)
      .concat(snapshot)
      .slice(-MAX_HISTORY);
    historyRef.current = nextHistory;
    historyIndexRef.current = nextHistory.length - 1;
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
  }, []);

  const undo = useCallback(() => {
    const index = historyIndexRef.current;
    if (index <= 0) return;
    applySnapshot(historyRef.current[index - 1]);
    historyIndexRef.current = index - 1;
    setHistoryIndex(index - 1);
  }, [applySnapshot]);

  const redo = useCallback(() => {
    const index = historyIndexRef.current;
    if (index < 0 || index >= historyRef.current.length - 1) return;
    applySnapshot(historyRef.current[index + 1]);
    historyIndexRef.current = index + 1;
    setHistoryIndex(index + 1);
  }, [applySnapshot]);

  const availableModels = useMemo(
    () =>
      models.filter(
        (item) =>
          item.supportsReferenceImage && item.status !== 'unavailable'
      ),
    [models]
  );

  const maxExtraReferences = useMemo(() => {
    const config = availableModels.find((item) => item.value === model);
    if (typeof config?.maxReferenceImages !== 'number') {
      return DEFAULT_MAX_EXTRA_REFERENCES;
    }
    return Math.max(0, config.maxReferenceImages - 1);
  }, [availableModels, model]);

  const copy = {
    readFailed: isEnglish ? 'Could not read the image.' : '图片读取失败。',
    uploadFailed: isEnglish
      ? 'Image upload failed. Try again.'
      : '图片上传失败，请稍后重试。',
    importFailed: isEnglish
      ? 'Asset import failed. Try again.'
      : '资产导入失败，请稍后重试。',
    referenceLimit: isEnglish
      ? `Up to ${maxExtraReferences} extra reference images.`
      : `最多添加 ${maxExtraReferences} 张补充参考图。`,
    fileTooLarge: isEnglish
      ? 'Image is larger than 20 MB. Compress it and try again.'
      : '图片超过 20 MB，请压缩后重试。',
    pixelsTooLarge: isEnglish
      ? 'Image is larger than 64 megapixels.'
      : '图片超过 6400 万像素，请压缩后重试。',
    cropping: isEnglish ? 'Cropping…' : '正在裁剪…',
    cropReadFailed: isEnglish
      ? 'Could not read the image for cropping.'
      : '裁剪图片读取失败。',
    cropExpired: isEnglish
      ? 'The image link may have expired. Go back to the source or upload the image again.'
      : '图片链接可能已过期，请回到源图或重新上传图片。',
    cropUnsupported: isEnglish
      ? 'Canvas cropping is not supported in this browser.'
      : '当前浏览器不支持画布裁剪。',
    cropFailed: isEnglish
      ? 'Could not create the cropped result.'
      : '裁剪结果生成失败。',
    cropError: isEnglish ? 'Crop failed. Try again.' : '裁剪失败，请重试。',    cropOutOfBounds: isEnglish
      ? 'The frame extends beyond the image. Use Generate to expand the canvas instead of Apply crop.'
      : '裁剪框超出图片范围，扩展画幅请使用「生成」完成，本地裁剪仅支持图片范围内。',
    needSource: isEnglish
      ? 'Upload an image or pick one from your library first.'
      : '请先上传图片或从资产库选择一张图片。',
    needPrompt: isEnglish
      ? 'Describe the change first, or pick an edit tool.'
      : '请先描述你想修改的内容，或选择一个编辑工具。',
    submitting: isEnglish ? 'Submitting…' : '提交中…',
    queued: isEnglish ? 'Submitted, queued…' : '已提交，排队中…',
    submitFailed: isEnglish
      ? 'Could not submit the edit. Try again.'
      : '图片编辑提交失败，请稍后重试。',
    editFailed: isEnglish
      ? 'Image edit failed. Try again.'
      : '图片编辑失败，请稍后重试。',
    importing: isEnglish ? 'Loading image…' : '正在载入图片…',
    restoring: isEnglish ? 'Preparing version…' : '正在准备版本…',
    versionNotEditable: isEnglish
      ? 'This version has no generation record and cannot be used as an edit baseline. Go back to the source or pick another version.'
      : '该版本缺少生成记录，无法作为编辑基线。请回到源图或选择其它版本。',
    emptyResult: isEnglish
      ? 'Generation finished but returned no image. Try again.'
      : '生成完成但没有返回图片，请重试。'
  };

  useEffect(() => {
    if (!model || availableModels.some((item) => item.value === model)) return;
    const preferred =
      availableModels.find((item) => item.value === 'nano-banana-2') ||
      availableModels[0];
    if (preferred) setModel(preferred.value);
  }, [availableModels, model]);

  useEffect(
    () => () => {
      if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
      generationRef.current = null;
      enhanceControllerRef.current?.abort();
    },
    []
  );

  const setSourceAndPreview = useCallback(
    (next: EditorSource, keepReferences = false) => {
      setSource(next);
      const sourceVersion: EditorVersion = {
        id: 'source',
        label: next.label,
        url: next.displayUrl,
        referenceId: next.referenceId,
        generationId: next.generationId
      };
      setVersions([sourceVersion]);
      setActiveVersionId('source');
      if (!keepReferences) setExtraReferences([]);
      setCurrentImageUrl(next.displayUrl);
      setRegions([]);
      setStrokes([]);
      setActiveRegionId(null);
      setError('');
      setResultCount(0);
      commitSnapshot({
        imageUrl: next.displayUrl,
        versions: [sourceVersion],
        activeVersionId: 'source',
        regions: [],
        strokes: [],
        adjustments
      });
    },
    [adjustments, commitSnapshot]
  );

  const acceptFile = useCallback(
    async (file: File, keepReferences = false) => {
      setError('');
      try {
        if (file.size > MAX_FILE_BYTES) {
          setError(copy.fileTooLarge);
          return;
        }
        const dataUrl = await fileToDataUrl(file);
        const size = await imageSizeFromFile(file);
        if (size.width * size.height > MAX_IMAGE_PIXELS) {
          setError(copy.pixelsTooLarge);
          return;
        }
        const uploaded = await uploadImageReference({
          imageBase64: dataUrlToBase64(dataUrl),
          mimeType: file.type || 'image/png',
          role: 'scene',
          label: '编辑源图',
          sourceApp: EDITOR_APP_SLUG
        });
        setSourceAndPreview(
          {
            kind: 'upload',
            label: file.name,
            referenceId: uploaded.id,
            displayUrl: dataUrl,
            width: size.width,
            height: size.height
          },
          keepReferences
        );
      } catch (uploadError) {
        setError(
          uploadError instanceof Error
            ? uploadError.message
            : copy.uploadFailed
        );
      }
    },
    [
      copy.fileTooLarge,
      copy.pixelsTooLarge,
      copy.uploadFailed,
      setSourceAndPreview
    ]
  );

  const acceptReferenceFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const oversized = files.find((file) => file.size > MAX_FILE_BYTES);
      if (oversized) {
        setError(copy.fileTooLarge);
        return;
      }
      const remaining = maxExtraReferences - extraReferences.length;
      if (remaining <= 0) {
        setError(copy.referenceLimit);
        return;
      }
      setError('');
      const batch = files.slice(0, remaining);
      const added: EditorExtraReference[] = [];
      for (const file of batch) {
        try {
          const dataUrl = await fileToDataUrl(file);
          const uploaded = await uploadImageReference({
            imageBase64: dataUrlToBase64(dataUrl),
            mimeType: file.type || 'image/png',
            role: 'style',
            label: '参考图',
            sourceApp: EDITOR_APP_SLUG
          });
          added.push({
            id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            kind: 'upload',
            label: file.name,
            displayUrl: dataUrl,
            referenceId: uploaded.id
          });
        } catch (referenceError) {
          setError(
            referenceError instanceof Error
              ? referenceError.message
              : copy.uploadFailed
          );
        }
      }
      setExtraReferences((current) => [...current, ...added]);
      if (batch.length < files.length) setError(copy.referenceLimit);
    },
    [
      copy.referenceLimit,
      copy.fileTooLarge,
      copy.uploadFailed,
      extraReferences.length,
      maxExtraReferences
    ]
  );

  const pickAsset = useCallback(
    async (item: VisualImageHistoryItem) => {
      setError('');
      try {
        const imported = await importGenerationAsReference({
          generationId: item.id,
          role: 'scene',
          label: '编辑源图'
        });
        setSourceAndPreview({
          kind: 'asset',
          label: item.prompt?.slice(0, 40) || '资产库图片',
          referenceId: imported.id,
          displayUrl: item.previewUrl || item.imageUrl || imported.thumbnailUrl,
          generationId: item.id,
          width: item.width,
          height: item.height
        });
      } catch (importError) {
        setError(
          importError instanceof Error
            ? importError.message
            : copy.importFailed
        );
      }
    },
    [copy.importFailed, setSourceAndPreview]
  );

  const importGenerationSource = useCallback(
    async (
      generationId: string,
      imageUrl: string,
      label?: string
    ): Promise<boolean> => {
      if (!generationId) return false;
      setError('');
      setGeneration({ status: 'running', progress: 10, label: copy.importing });
      try {
        const imported = await importGenerationAsReference({
          generationId,
          role: 'scene',
          label: '编辑源图'
        });
        setSourceAndPreview({
          kind: 'asset',
          label: label || '资产库图片',
          referenceId: imported.id,
          displayUrl: imageUrl || imported.thumbnailUrl,
          generationId,
          width: undefined,
          height: undefined
        });
        return true;
      } catch (importError) {
        setError(
          importError instanceof Error
            ? importError.message
            : copy.importFailed
        );
        return false;
      } finally {
        setGeneration({ status: 'idle', progress: 0, label: '' });
      }
    },
    [copy.importFailed, copy.importing, setSourceAndPreview]
  );

  const pickReferenceAssets = useCallback(
    async (items: VisualImageHistoryItem[]) => {
      if (items.length === 0) return;
      const remaining = maxExtraReferences - extraReferences.length;
      if (remaining <= 0) {
        setError(copy.referenceLimit);
        return;
      }
      setError('');
      const batch = items.slice(0, remaining);
      const added: EditorExtraReference[] = [];
      for (const item of batch) {
        try {
          const imported = await importGenerationAsReference({
            generationId: item.id,
            role: 'style',
            label: '参考图'
          });
          added.push({
            id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            kind: 'asset',
            label: item.prompt?.slice(0, 24) || '资产库图片',
            displayUrl:
              item.previewUrl || item.imageUrl || imported.thumbnailUrl,
            referenceId: imported.id
          });
        } catch (importError) {
          setError(
            importError instanceof Error
              ? importError.message
              : copy.importFailed
          );
        }
      }
      setExtraReferences((current) => [...current, ...added]);
      if (batch.length < items.length) setError(copy.referenceLimit);
    },
    [
      copy.importFailed,
      copy.referenceLimit,
      extraReferences.length,
      maxExtraReferences
    ]
  );

  const removeExtraReference = useCallback((id: string) => {
    setExtraReferences((current) => {
      const index = current.findIndex((reference) => reference.id === id);
      if (index < 0) return current;
      const next = current.filter((reference) => reference.id !== id);
      // 删除中间参考图后，把提示词中的 @图片N / @Image N 引用重新编号，
      // 避免编号漂移导致语义错位。
      const removedImageIndex = index + 2; // 1 = 源图
      setPrompt((prompt) => {
        if (isEnglish) {
          return prompt.replace(
            /@Image\s*(\d+)/gi,
            (match, number: string) =>
              Number(number) > removedImageIndex
                ? `@Image ${Number(number) - 1}`
                : match
          );
        }
        return prompt.replace(
          /@(?:图片|参考图)\s*(\d+)/gi,
          (match, number: string) =>
            Number(number) > removedImageIndex
              ? `@图片${Number(number) - 1}`
              : match
        );
      });
      return next;
    });
  }, [isEnglish]);

  const mentionReference = useCallback(
    (index: number) => {
      const token = isEnglish ? `@Image ${index}` : `@图片${index}`;
      setPrompt((current) => {
        if (current.includes(token)) return current;
        return current.trim()
          ? `${current.trimEnd()}\n${token} `
          : `${token} `;
      });
    },
    [isEnglish]
  );

  const selectVersion = useCallback(
    async (versionId: string) => {
      if (
        generationRef.current ||
        versionSwitchInFlightRef.current ||
        isEditorBusy(generation.status)
      ) {
        return;
      }
      const version = versions.find((item) => item.id === versionId);
      if (!version || version.id === activeVersionId) return;
      setActiveVersionId(version.id);
      setCurrentImageUrl(version.url);
      setRegions([]);
      setStrokes([]);
      setActiveTool(null);
      setError('');
      commitSnapshot({
        imageUrl: version.url,
        versions,
        activeVersionId: version.id,
        regions: [],
        strokes: [],
        adjustments
      });
      if (version.referenceId || !version.generationId) return;
      versionSwitchInFlightRef.current = true;
      setGeneration({
        status: 'running',
        progress: 10,
        label: copy.restoring
      });
      try {
        const imported = await importGenerationAsReference({
          generationId: version.generationId,
          role: 'scene',
          label: '编辑参考'
        });
        setVersions((current) =>
          current.map((item) =>
            item.id === version.id
              ? { ...item, referenceId: imported.id }
              : item
          )
        );
      } catch (versionError) {
        setError(
          versionError instanceof Error
            ? versionError.message
            : copy.importFailed
        );
      } finally {
        versionSwitchInFlightRef.current = false;
        setGeneration({ status: 'idle', progress: 0, label: '' });
      }
    },
    [
      activeVersionId,
      adjustments,
      commitSnapshot,
      copy.importFailed,
      copy.restoring,
      generation.status,
      versions
    ]
  );

  const applyCrop = useCallback(
    async (region: EditorRegion) => {
      if (!source || !currentImageUrl) return;
      if (
        generationRef.current ||
        versionSwitchInFlightRef.current ||
        isEditorBusy(generation.status)
      ) {
        return;
      }
      // 裁剪框超出图片范围时禁用本地裁剪（扩图请走生成）
      const outOfBounds =
        region.x < -0.001 ||
        region.y < -0.001 ||
        region.x + region.width > 1.001 ||
        region.y + region.height > 1.001;
      if (outOfBounds) {
        setError(copy.cropOutOfBounds);
        return;
      }
      setError('');
      setGeneration({ status: 'running', progress: 20, label: copy.cropping });
      let objectUrl: string | null = null;
      try {
        const image = new Image();
        let sourceUrl = currentImageUrl;
        if (!/^(data:|blob:)/i.test(currentImageUrl)) {
          // 优先走历史 blob 代理（同源 + 后端重签），避免签名 URL 的 CORS 问题。
          const activeVersion = versions.find(
            (item) => item.id === activeVersionId
          );
          const generationId =
            activeVersion && activeVersion.id !== 'source'
              ? activeVersion.generationId
              : source.generationId;
          if (generationId) {
            try {
              objectUrl = await loadVisualImageHistoryBlobUrl(
                generationId,
                'original'
              );
              sourceUrl = objectUrl;
            } catch {
              // 回退到直接 fetch
            }
          }
        }
        if (!/^(data:|blob:)/i.test(sourceUrl)) {
          const response = await fetch(sourceUrl, { mode: 'cors' });
          if (!response.ok) {
            throw new Error(copy.cropExpired);
          }
          const blob = await response.blob();
          if (!blob.type.startsWith('image/')) {
            throw new Error(copy.cropExpired);
          }
          objectUrl = URL.createObjectURL(blob);
          sourceUrl = objectUrl;
        }
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error(copy.cropReadFailed));
          image.src = sourceUrl;
        });
        const canvas = document.createElement('canvas');
        let cropWidth = Math.max(
          1,
          Math.round(image.naturalWidth * region.width)
        );
        let cropHeight = Math.max(
          1,
          Math.round(image.naturalHeight * region.height)
        );
        const cropScale = Math.min(
          1,
          Math.sqrt(MAX_CROP_PIXELS / (cropWidth * cropHeight))
        );
        cropWidth = Math.max(1, Math.round(cropWidth * cropScale));
        cropHeight = Math.max(1, Math.round(cropHeight * cropScale));
        canvas.width = cropWidth;
        canvas.height = cropHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error(copy.cropUnsupported);
        context.drawImage(
          image,
          Math.round(image.naturalWidth * region.x),
          Math.round(image.naturalHeight * region.y),
          Math.round(image.naturalWidth * region.width),
          Math.round(image.naturalHeight * region.height),
          0,
          0,
          cropWidth,
          cropHeight
        );
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/png')
        );
        if (!blob) throw new Error(copy.cropFailed);
        const file = new File([blob], 'cropped.png', { type: 'image/png' });
        await acceptFile(file, true);
        setRegions([]);
        setActiveTool(null);
      } catch (cropError) {
        setError(
          cropError instanceof Error ? cropError.message : copy.cropError
        );
      } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        setGeneration({ status: 'idle', progress: 0, label: '' });
      }
    },
    [
      acceptFile,
      copy.cropping,
      copy.cropExpired,
      copy.cropReadFailed,
      copy.cropUnsupported,
      copy.cropFailed,
      copy.cropError,
      copy.cropOutOfBounds,
      currentImageUrl,
      generation.status,
      source,
      versions,
      activeVersionId
    ]
  );

  const finalizePoll = useCallback(() => {
    generationRef.current = null;
    setGeneration({ status: 'idle', progress: 0, label: '' });
  }, []);

  const pollTask = useCallback(
    (taskId: string) => {
      let attempts = 0;
      const attempt = async () => {
        attempts += 1;
        if (attempts > MAX_POLL_ATTEMPTS) {
          setError(copy.editFailed);
          finalizePoll();
          return;
        }
        let result: Awaited<ReturnType<typeof getVisualImageTaskStatus>>;
        try {
          result = await getVisualImageTaskStatus(taskId);
        } catch {
          if (generationRef.current?.taskId !== taskId) return;
          pollTimerRef.current = window.setTimeout(
            () => void attempt(),
            5000
          );
          return;
        }
        if (generationRef.current?.taskId !== taskId) return;
        const taskStatus = result.status;
        if (taskStatus === 'succeeded') {
          const images: VisualGeneratedImage[] = result.images || [];
          const primary = images[0] ||
            (result.imageUrl
              ? {
                  generationId: result.generationId || null,
                  imageUrl: result.imageUrl,
                  imageUrlExpiresIn: result.imageUrlExpiresIn
                }
              : null);
          if (primary?.imageUrl) {
            const nextVersion: EditorVersion = {
              id: primary.generationId || `version-${Date.now()}`,
              label: isEnglish
                ? `Version ${versions.length + 1}`
                : `版本 ${versions.length + 1}`,
              url: primary.imageUrl,
              generationId: primary.generationId || undefined
            };
            const nextVersions = versions.some(
              (item) => item.id === nextVersion.id
            )
              ? versions
              : [...versions, nextVersion];
            setVersions(nextVersions);
            setActiveVersionId(nextVersion.id);
            setCurrentImageUrl(primary.imageUrl);
            setResultCount((count) => count + 1);
            // 生成成功后清空画笔遮罩，避免旧笔触叠加到新结果上
            setStrokes([]);
            setRegions([]);
            setPrompt('');
            setDrawPrompt('');
            setAdjustments(DEFAULT_IMAGE_ADJUSTMENTS);
            setError('');
            commitSnapshot({
              imageUrl: primary.imageUrl,
              versions: nextVersions,
              activeVersionId: nextVersion.id,
              regions: [],
              strokes: [],
              adjustments: DEFAULT_IMAGE_ADJUSTMENTS
            });
          } else {
            setError(copy.emptyResult);
          }
          finalizePoll();
          return;
        }
        if (taskStatus === 'failed' || taskStatus === 'cancelled') {
          setError(result.message || copy.editFailed);
          finalizePoll();
          return;
        }
        setGeneration((current) => ({
          ...current,
          status: taskStatus,
          progress:
            taskStatus === 'running'
              ? Math.min(92, current.progress + 12)
              : current.progress,
          label:
            taskStatus === 'queued'
              ? isEnglish
                ? 'Queued…'
                : '排队中'
              : isEnglish
                ? `Generating${result.currentStage?.model ? ` · ${result.currentStage.model}` : ''}`
                : `正在生成${result.currentStage?.model ? ` · ${result.currentStage.model}` : ''}`
        }));
        pollTimerRef.current = window.setTimeout(() => void attempt(), 4000);
      };
      pollTimerRef.current = window.setTimeout(() => void attempt(), 1200);
    },
    [
      copy.editFailed,
      copy.emptyResult,
      commitSnapshot,
      finalizePoll,
      isEnglish,
      versions
    ]
  );

  const currentOriginalBlob = useCallback(async () => {
    const version = versions.find((item) => item.id === activeVersionId);
    return loadEditorImageBlob(currentImageUrl, version?.generationId || (version?.id === 'source' ? source?.generationId : undefined));
  }, [activeVersionId, currentImageUrl, source, versions]);

  const uploadBlob = async (blob: Blob, label: string) => {
    const dataUrl = await imageBlobToDataUrl(blob);
    return uploadImageReference({ imageBase64: dataUrlToBase64(dataUrl), mimeType: blob.type || 'image/png', label, sourceApp: EDITOR_APP_SLUG });
  };

  const generate = useCallback(async () => {
    if (submissionRef.current || generationRef.current || isEditorBusy(generation.status)) return;
    if (!source) { setError(copy.needSource); return; }
    const instruction = composeEditorInstruction(
      [prompt.trim(), buildAdjustmentInstruction(adjustments, isEnglish), buildCameraInstruction(camera, isEnglish),
        strokes.length ? buildDrawInstructions(strokes, drawPrompt, isEnglish) : '',
        cropExpand.prompt.trim() ? `${isEnglish ? 'Expand the canvas, preserve the source. Aspect ratio' : '扩展画布并保留原图，目标比例'}: ${cropExpand.aspect || cropExtentRef.current || 'auto'}. ${cropExpand.prompt.trim()}` : ''
      ].filter(Boolean).join('\n'),
      buildRegionInstructions(regions, isEnglish), buildAnnotateInstructions(regions, isEnglish), 1 + extraReferences.length, isEnglish
    );
    if (!instruction) { setError(copy.needPrompt); return; }
    if (autoMask.pending || autoMask.error) {
      setError(autoMask.pending ? (isEnglish ? 'Preparing selection…' : '选区仍在准备中，请稍候。') : autoMask.error || '');
      return;
    }
    submissionRef.current = true;
    setError('');
    setGeneration({ status: 'running', progress: 2, label: copy.submitting });
    try {
      const activeVersion = versions.find((item) => item.id === activeVersionId) || versions[0];
      let primaryReferenceId = activeVersion?.referenceId || (activeVersion?.id === 'source' ? source.referenceId : undefined);
      if (!primaryReferenceId) {
        const imported = activeVersion?.generationId
          ? await importGenerationAsReference({ generationId: activeVersion.generationId, role: 'scene', label: '编辑参考' })
          : await uploadBlob(await currentOriginalBlob(), '编辑参考');
        primaryReferenceId = imported.id;
        setVersions((current) => current.map((item) => item.id === activeVersion?.id ? { ...item, referenceId: imported.id } : item));
      }
      const referenceIds = Array.from(new Set([primaryReferenceId, ...extraReferences.map((item) => item.referenceId)]));
      let maskImageId = autoMask.maskImageId;
      let visualInstruction = '';
      if (regions.length || strokes.length || autoMask.maskUrl) {
        const needsGuide = needsVisualGuide;
        const maxReferences = availableModels.find((item) => item.value === model)?.maxReferenceImages;
        if (needsGuide && typeof maxReferences === 'number' && referenceIds.length >= maxReferences) {
          throw new Error(isEnglish ? 'Remove one extra reference to attach your selection guide.' : '请移除一张补充参考图，为选区示意图留出位置。');
        }
        const selection = autoMask.selectionBlob;
        const inputs = await renderEditorImageInputs(await currentOriginalBlob(), regions, strokes, 'none', selection);
        if (inputs.mask) maskImageId = (await uploadBlob(inputs.mask, '选区蒙版')).id;
        if (needsGuide && inputs.guide) {
          referenceIds.push((await uploadBlob(inputs.guide, '编辑位置与草图引导')).id);
          visualInstruction = isEnglish
            ? `Image ${referenceIds.length} is an editing guide over Image 1. Follow the exact highlighted shapes and numbered regions, and the drawn sketch. Do not copy selection tint or number labels into the result. Preserve unmarked areas of Image 1.`
            : `参考图 ${referenceIds.length} 是参考图 1 的编辑示意图：请依据精确高亮形状、编号区域和草图进行修改。选区底色和编号不属于最终画面，不要复制到结果；保留参考图 1 未标记的内容。`;
        }
      }
      const finalPrompt = [instruction, visualInstruction].filter(Boolean).join('\n');
      const queued = await enqueueVisualImageTask({
        prompt: finalPrompt, model, aspectRatio: 'auto', imageSize: 'auto', quality: 'auto', outputFormat: 'png',
        assetIds: [], imageCount: 1, referenceImageIds: referenceIds, maskImageId,
        referenceMode: 'image_reference', editInstruction: finalPrompt, editMode: 'context_locked',
        appSlug: EDITOR_APP_SLUG, appOperation: 'ai_edit', sourceApp: EDITOR_APP_SLUG
      });
      generationRef.current = { taskId: queued.taskId };
      setGeneration({ status: 'queued', progress: 10, label: copy.queued });
      pollTask(queued.taskId);
    } catch (submitError) {
      setGeneration({ status: 'failed', progress: 0, label: '' });
      setError(submitError instanceof Error ? submitError.message : copy.submitFailed);
    } finally {
      submissionRef.current = false;
    }
  }, [activeVersionId, adjustments, autoMask, availableModels, camera, copy.needPrompt, copy.needSource, copy.queued, copy.submitFailed, copy.submitting, cropExpand, currentOriginalBlob, drawPrompt, extraReferences, generation.status, isEnglish, model, needsVisualGuide, pollTask, prompt, regions, source, strokes, versions]);

  const enhance = useCallback(async (target: ImageUpscaleTarget, useAi = true) => {
    if (submissionRef.current || generationRef.current || isEditorBusy(generation.status) || !source) return;
    submissionRef.current = true;
    const controller = new AbortController();
    enhanceControllerRef.current = controller;
    let decoded: Awaited<ReturnType<typeof decodeImageFile>> | null = null;
    setError('');
    setGeneration({ status: 'running', progress: 1, label: isEnglish ? 'Loading original…' : '正在读取原图…' });
    try {
      const original = await currentOriginalBlob();
      const filter = buildAdjustmentFilter(adjustments);
      const blob = filter && filter !== 'none'
        ? (await renderEditorImageInputs(original, [], [], filter)).image : original;
      decoded = await decodeImageFile(new File([blob], 'editor-original.png', { type: blob.type }));
      const modelAsset = IMAGE_TOOL_MODELS['real-esrgan-x4plus'];
      if (useAi && (!supportsWebGpu() || !isPublishedImageToolModel(modelAsset))) {
        throw new Error(isEnglish ? 'AI is unavailable here. Choose Standard upscale or use a WebGPU browser.' : '当前环境无法使用 AI 超分，请选择普通放大或使用支持 WebGPU 的浏览器。');
      }
      const result = await runImageUpscale({ source: decoded, target, format: 'image/png', canUseAi: useAi, modelUrl: modelAsset.route, signal: controller.signal,
        onProgress: (progress, label) => setGeneration({ status: 'running', progress, label }) });
      const url = await imageBlobToDataUrl(result.blob);
      if (controller.signal.aborted) return;
      const version: EditorVersion = { id: `upscale-${crypto.randomUUID()}`, label: `${target === 2048 ? '2K' : '4K'} · ${useAi ? 'AI' : isEnglish ? 'Standard' : '普通放大'}`, url };
      const nextVersions = [...versions, version];
      setVersions(nextVersions); setActiveVersionId(version.id); setCurrentImageUrl(url);
      setRegions([]); setStrokes([]); setAdjustments(DEFAULT_IMAGE_ADJUSTMENTS);
      commitSnapshot({ imageUrl: url, versions: nextVersions, activeVersionId: version.id, regions: [], strokes: [], adjustments: DEFAULT_IMAGE_ADJUSTMENTS });
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : '放大失败，请重试。');
    } finally {
      releaseDecodedImage(decoded);
      if (enhanceControllerRef.current === controller) enhanceControllerRef.current = null;
      submissionRef.current = false;
      setGeneration({ status: 'idle', progress: 0, label: '' });
    }
  }, [adjustments, commitSnapshot, currentOriginalBlob, generation.status, isEnglish, source, versions]);

  const cancelEnhance = useCallback(() => enhanceControllerRef.current?.abort(), []);

  const clearSource = useCallback(() => {
    if (generationRef.current) return;
    setSource(null);
    setVersions([]);
    setActiveVersionId('');
    setExtraReferences([]);
    setCurrentImageUrl('');
    setRegions([]);
    setPrompt('');
    setError('');
    setResultCount(0);
  }, []);

  const commitAdjustmentsDone = useCallback(() => {
    commitSnapshot({
      imageUrl: currentImageUrl,
      versions,
      activeVersionId,
      regions,
      strokes,
      adjustments
    });
  }, [
    activeVersionId,
    adjustments,
    commitSnapshot,
    currentImageUrl,
    regions,
    strokes,
    versions
  ]);

  const addRegion = useCallback(
    (
      region: Omit<EditorRegion, 'id' | 'kind'> & {
        kind?: EditorRegion['kind'];
      }
    ) => {
      const nextRegion: EditorRegion = {
        ...region,
        id: `region-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        kind: region.kind || 'rect'
      };
      const nextRegions = [...regions, nextRegion];
      setRegions(nextRegions);
      setActiveRegionId(nextRegion.id);
      commitSnapshot({
        imageUrl: currentImageUrl,
        versions,
        activeVersionId,
        regions: nextRegions,
        strokes,
        adjustments
      });
    },
    [
      activeVersionId,
      adjustments,
      commitSnapshot,
      currentImageUrl,
      strokes,
      regions,
      versions
    ]
  );

  // 自动蒙版：展示蒙版覆盖层并把蒙版图上传为参考图，随生成请求透传给模型
  const applyAutoMask = useCallback(async (maskBlob: Blob) => {
    const epoch = ++autoMaskEpochRef.current;
    const maskUrl = URL.createObjectURL(maskBlob);
    setAutoMask((current) => { if (current.maskUrl) URL.revokeObjectURL(current.maskUrl); return { maskUrl, selectionBlob: maskBlob, pending: true }; });
    try {
      const buffer = await (await selectionMaskToEditMask(maskBlob)).arrayBuffer();
      const binary = new Uint8Array(buffer).reduce(
        (acc, byte) => acc + String.fromCharCode(byte),
        ''
      );
      const imageBase64 = btoa(binary);
      const reference = await uploadImageReference({
        imageBase64,
        mimeType: 'image/png',
        label: 'Auto mask',
        sourceApp: EDITOR_APP_SLUG
      });
      if (autoMaskEpochRef.current === epoch) setAutoMask({ maskUrl, selectionBlob: maskBlob, maskImageId: reference.id });
    } catch (error) {
      console.warn('[ImageEditor] auto-mask upload failed', error);
      if (autoMaskEpochRef.current === epoch) setAutoMask({ maskUrl, selectionBlob: maskBlob, error: '选区上传失败，请重新选择区域后重试。' });
    }
  }, []);

  const clearAutoMask = useCallback(() => {
    autoMaskEpochRef.current += 1;
    setAutoMask((current) => {
      if (current.maskUrl) URL.revokeObjectURL(current.maskUrl);
      return {};
    });
  }, []);

  const removeRegion = useCallback((id: string) => {
    const nextRegions = regions.filter((region) => region.id !== id);
    setRegions(nextRegions);
    setActiveRegionId((current) => (current === id ? null : current));
    commitSnapshot({
      imageUrl: currentImageUrl,
      versions,
      activeVersionId,
      regions: nextRegions,
      strokes,
      adjustments
    });
  }, [
    activeVersionId,
    adjustments,
    commitSnapshot,
    currentImageUrl,
    strokes,
    regions,
    versions
  ]);

  const updateRegionPrompt = useCallback((id: string, value: string) => {
    const nextRegions = regions.map((region) =>
      region.id === id ? { ...region, prompt: value } : region
    );
    setRegions(nextRegions);
    commitSnapshot({
      imageUrl: currentImageUrl,
      versions,
      activeVersionId,
      regions: nextRegions,
      strokes,
      adjustments
    });
  }, [
    activeVersionId,
    adjustments,
    commitSnapshot,
    currentImageUrl,
    strokes,
    regions,
    versions
  ]);

  const addStroke = useCallback(
    (stroke: BrushStroke) => {
      const nextStrokes = [...strokes, stroke];
      setStrokes(nextStrokes);
      commitSnapshot({
        imageUrl: currentImageUrl,
        versions,
        activeVersionId,
        regions,
        strokes: nextStrokes,
        adjustments
      });
    },
    [
      activeVersionId,
      adjustments,
      commitSnapshot,
      currentImageUrl,
      regions,
      strokes,
      versions
    ]
  );

  const clearStrokes = useCallback(() => {
    if (strokes.length === 0) return;
    setStrokes([]);
    commitSnapshot({
      imageUrl: currentImageUrl,
      versions,
      activeVersionId,
      regions,
      strokes: [],
      adjustments
    });
  }, [
    activeVersionId,
    adjustments,
    commitSnapshot,
    currentImageUrl,
    regions,
    strokes,
    versions
  ]);

  return {
    source,
    versions,
    activeVersionId,
    selectVersion,
    extraReferences,
    acceptReferenceFiles,
    pickReferenceAssets,
    removeExtraReference,
    mentionReference,
    maxExtraReferences,
    generationReferenceImageCount: 1 + extraReferences.length + (needsVisualGuide ? 1 : 0),
    currentImageUrl,
    prompt,
    setPrompt,
    adjustments,
    setAdjustments,
    camera,
    setCamera,
    adjustmentFilter: buildAdjustmentFilter(adjustments),
    model,
    setModel,
    availableModels,
    regions,
    regionMode,
    setRegionMode,
    autoMask,
    applyAutoMask,
    clearAutoMask,
    activeRegionId,
    setActiveRegionId,
    addRegion,
    removeRegion,
    updateRegionPrompt,
    strokes,
    addStroke,
    clearStrokes,
    brushSize,
    setBrushSize,
    brushColor,
    setBrushColor,
    drawPrompt,
    setDrawPrompt,
    cropExpand,
    setCropExpand,
    cropExtentRef,
    activeTool,
    setActiveTool,
    generation,
    error,
    setError,
    resultCount,
    acceptFile,
    pickAsset,
    importGenerationSource,
    commitAdjustmentsDone,
    applyCrop,
    generate,
    enhance,
    cancelEnhance,
    enhancing: Boolean(enhanceControllerRef.current),
    clearSource,
    undo,
    redo,
    canUndo: historyIndex > 0,
    canRedo: historyIndex >= 0 && historyIndex < history.length - 1
  };
}
