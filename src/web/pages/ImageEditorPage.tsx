import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Redo2, Undo2, Upload } from 'lucide-react';
import { CreateWorkspaceFrame } from '@/web/components/image-create/CreateWorkspaceFrame';
import { ImageEditorAssetPicker } from '@/web/components/image-editor/ImageEditorAssetPicker';
import { ImageEditorCanvas } from '@/web/components/image-editor/ImageEditorCanvas';
import { useAutoMaskWorker } from '@/web/hooks/useAutoMaskWorker';
import { ImageEditorLanding } from '@/web/components/image-editor/ImageEditorLanding';
import { ImageEditorPanel } from '@/web/components/image-editor/ImageEditorPanel';
import { isEditorBusy, useImageEditor } from '@/web/components/image-editor/useImageEditor';
import { getToolOption, type EditorToolId } from '@/web/components/image-editor/editor-tools';
import '@/web/components/image-editor/image-editor.css';
import { useAuth } from '@/web/contexts/AuthContext';
import { useRuntimeImageModels } from '@/web/hooks/useRuntimeImageModels';
import { localizeCreateHref } from '../data/create-workspace';
import { applySeo } from '@/web/lib/seo';
import { useRouteLocale } from '@/web/lib/route-locale';
import { triggerImageDownload } from '@/web/components/image-create/downloadImage';
import { estimateImageGenerationCreditCost } from '@/shared/image-generation-pricing';
import { getLocalizedCreateAppContent } from '@/shared/create-apps';
import { getCreditsBalance } from '@/services/credits-api';
import { loadVisualImageHistoryBlobUrl } from '@/services/agent-api';
import type { ImageEditorEntryState } from '@/web/components/image-editor/editor-entry';

const COPY = {
  zh: {
    back: '全部图片工具',
    seoTitle: 'AI 图片编辑工具 | WebToMind',
    changeImage: '更换图片',
    upload: '上传新图片',
    resultLabel: '编辑结果',
    sourceLabel: '源图',
    downloadName: 'webtomind-edit',
    videoPrompt: '把这张图片作为首帧，制作一段连贯的动态视频。'
  },
  en: {
    back: 'All image tools',
    seoTitle: 'AI Image Editor | WebToMind',
    changeImage: 'Change image',
    upload: 'Upload new image',
    resultLabel: 'Edit result',
    sourceLabel: 'Source',
    downloadName: 'webtomind-edit',
    videoPrompt:
      'Use this image as the first frame and create a coherent motion video.'
  }
} as const;

export function ImageEditorPage() {
  const { locale, isZh } = useRouteLocale();
  const isEnglish = !isZh;
  const copy = isEnglish ? COPY.en : COPY.zh;
  const tool = getLocalizedCreateAppContent('image-editor', locale);
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { models } = useRuntimeImageModels();
  const editor = useImageEditor(models, isEnglish);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const referenceFileInputRef = useRef<HTMLInputElement | null>(null);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [assetPickerMode, setAssetPickerMode] = useState<
    'single' | 'multi'
  >('single');
  const [cropAspect, setCropAspect] = useState<string | null>(null);
  const [cropResetSignal, setCropResetSignal] = useState(0);
  const localePrefix = locale === 'en-US' ? '/en-US' : '/zh-CN';
  const [creditsBalance, setCreditsBalance] = useState<number | null>(null);
  const [creditsBalanceLoaded, setCreditsBalanceLoaded] = useState(false);

  const busy = isEditorBusy(editor.generation.status);
  const estimatedCost = estimateImageGenerationCreditCost({
    model: editor.model,
    imageSize: 'auto',
    quality: 'auto',
    referenceImageCount: editor.generationReferenceImageCount,
    referenceMode: 'image_reference'
  }).cost;
  const insufficientCredits =
    isAuthenticated &&
    creditsBalanceLoaded &&
    creditsBalance !== null &&
    creditsBalance < estimatedCost;
  const modelsUnavailable = editor.availableModels.length === 0;

  useEffect(() => {
    if (!isAuthenticated) {
      setCreditsBalance(null);
      setCreditsBalanceLoaded(false);
      return;
    }
    let cancelled = false;
    const refresh = () => {
      void getCreditsBalance()
        .then((result) => {
          if (!cancelled) {
            setCreditsBalance(result.credits.total);
            setCreditsBalanceLoaded(true);
          }
        })
        .catch(() => {
          if (!cancelled) setCreditsBalanceLoaded(true);
        });
    };
    refresh();
    window.addEventListener('credits-changed', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('credits-changed', refresh);
    };
  }, [isAuthenticated]);

  useEffect(
    () =>
      applySeo({
        title: copy.seoTitle,
        description: tool?.description || '',
        htmlLang: isZh ? 'zh-CN' : 'en'
      }),
    [copy.seoTitle, isZh, tool?.description]
  );

  // 从会话结果或资产库预览带着图片进入编辑模式。
  useEffect(() => {
    const routeState = location.state as Partial<ImageEditorEntryState> | null;
    if (!routeState) return;
    const generationId =
      typeof routeState.generationId === 'string'
        ? routeState.generationId
        : '';
    if (!generationId) return;
    let cancelled = false;
    void editor
      .importGenerationSource(
        generationId,
        typeof routeState.imageUrl === 'string' ? routeState.imageUrl : '',
        typeof routeState.label === 'string' ? routeState.label : undefined
      )
      .then((loaded) => {
        if (loaded && !cancelled && routeState.initialTool === 'region') editor.setActiveTool('region');
      })
      .finally(() => {
        if (cancelled) return;
        navigate(location.pathname, { replace: true, state: null });
      });
    return () => {
      cancelled = true;
    };
    // 仅在首次进入时消费一次入口状态
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requireLogin = () => {
    navigate(
      `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`
    );
  };

  const handlePickFile = async (file: File | undefined) => {
    if (!file) return;
    if (busy) return;
    await editor.acceptFile(file);
  };

  const handlePickReferenceFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (busy) return;
    await editor.acceptReferenceFiles(Array.from(files));
  };

  const handleApplyOption = (toolId: EditorToolId, optionId: string) => {
    const option = getToolOption(toolId, optionId);
    if (toolId === 'crop' && optionId === 'crop-local') {
      editor.setActiveTool('crop');
      return;
    }
    if (!option || !option.instruction) return;
    const instruction = isEnglish ? option.instructionEn : option.instruction;
    editor.setPrompt((current) => {
      if (current.includes(instruction)) return current;
      return current.trim()
        ? `${current.trimEnd()}\n${instruction}`
        : instruction;
    });
  };

  const handleDownload = async () => {
    if (!editor.currentImageUrl) return;
    const activeVersion = editor.versions.find(
      (version) => version.id === editor.activeVersionId
    );
    if (activeVersion?.generationId) {
      try {
        const blobUrl = await loadVisualImageHistoryBlobUrl(
          activeVersion.generationId,
          'original'
        );
        triggerImageDownload(
          blobUrl,
          `${copy.downloadName}-${Date.now()}.png`
        );
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
        return;
      } catch {
        // 直连 URL 兜底
      }
    }
    triggerImageDownload(
      editor.currentImageUrl,
      `${copy.downloadName}-${Date.now()}.png`
    );
  };

  const handleSendToBackgroundRemover = () => {
    if (!editor.currentImageUrl) return;
    navigate(localizeCreateHref('/tools/background-remover', localePrefix), {
      state: {
        sourceUrl: editor.currentImageUrl,
        sourceReferenceId: editor.source?.referenceId
      }
    });
  };

  const handleTurnIntoVideo = () => {
    if (!editor.currentImageUrl) return;
    navigate(localizeCreateHref('/video', localePrefix), {
      state: {
        imageUrl: editor.currentImageUrl,
        prompt: copy.videoPrompt
      }
    });
  };

  const handleSelectTool = (toolId: EditorToolId | null) => {
    if (busy) return;
    if (toolId !== 'region') editor.clearAutoMask();
    editor.setActiveTool(toolId);
  };

  const autoMaskWorker = useAutoMaskWorker(
    editor.currentImageUrl,
    editor.versions.find((version) => version.id === editor.activeVersionId)?.referenceId,
    editor.versions.find((version) => version.id === editor.activeVersionId)?.generationId
  );

  // 进入「自动蒙版」模式时，先用当前图片完成一次图像编码
  useEffect(() => {
    if (editor.activeTool === 'region' && editor.regionMode === 'auto') {
      if (!autoMaskWorker.encoded && autoMaskWorker.status === 'idle') void autoMaskWorker.encode();
    }
  }, [editor.activeTool, editor.regionMode, autoMaskWorker]);

  const handleAutoMaskPoint = (point: { x: number; y: number }) => {
    void autoMaskWorker
      .segment(point)
      .then((blob) => editor.applyAutoMask(blob))
      .catch((error: unknown) => {
        editor.setError(
          error instanceof Error ? error.message : '自动蒙版生成失败'
        );
      });
  };

  return (
    <CreateWorkspaceFrame className="image-editor-page image-tool-workspace-route">
      <div className="image-editor-main">
        {!editor.source ? (
          <ImageEditorLanding
            isEnglish={isEnglish}
            importing={editor.generation.status === 'running'}
            error={editor.error || (editor.regionMode === 'auto' && autoMaskWorker.status === 'error' ? autoMaskWorker.message : '')}
            onUpload={() => fileInputRef.current?.click()}
            onSelectAsset={() => setAssetPickerOpen(true)}
          />
        ) : (
          <div className="image-editor-workspace">
            <section className="image-editor-canvas-column">
              <div className="image-editor-canvas-toolbar">
                <div className="image-editor-canvas-history">
                  <button
                    type="button"
                    aria-label={isEnglish ? 'Undo' : '撤销'}
                    title={isEnglish ? 'Undo' : '撤销'}
                    disabled={!editor.canUndo || busy}
                    onClick={editor.undo}
                  >
                    <Undo2 aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={isEnglish ? 'Redo' : '重做'}
                    title={isEnglish ? 'Redo' : '重做'}
                    disabled={!editor.canRedo || busy}
                    onClick={editor.redo}
                  >
                    <Redo2 aria-hidden="true" />
                  </button>
                </div>
                <div className="image-editor-canvas-toolbar-right">
                  <span>
                    {isEnglish ? 'Source' : '源图'} · {editor.source.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={busy}
                  >
                    <Upload aria-hidden="true" />
                    {copy.changeImage}
                  </button>
                </div>
              </div>
              <ImageEditorCanvas
                imageUrl={editor.currentImageUrl}
                sourceLabel={editor.source.label}
                isEnglish={isEnglish}
                versions={editor.versions}
                activeVersionId={editor.activeVersionId}
                regions={editor.regions}
                regionMode={editor.regionMode}
                activeRegionId={editor.activeRegionId}
                onSelectRegion={editor.setActiveRegionId}
                autoMaskUrl={editor.autoMask.maskUrl}
                onAutoMaskPoint={handleAutoMaskPoint}
                cropExtentRef={editor.cropExtentRef}
                strokes={editor.strokes}
                brushSize={editor.brushSize}
                brushColor={editor.brushColor}
                activeTool={editor.activeTool}
                cropAspect={cropAspect}
                cropResetSignal={cropResetSignal}
                adjustmentFilter={editor.adjustmentFilter}
                busy={busy}
                generationLabel={
                  editor.generation.status === 'queued'
                    ? isEnglish
                      ? 'Queued…'
                      : '排队中…'
                    : editor.generation.status === 'running'
                      ? editor.generation.label || (isEnglish ? 'Generating…' : '正在生成…')
                      : ''
                }
                onSelectVersion={(versionId) => {
                  void editor.selectVersion(versionId);
                }}
                onAddRegion={editor.addRegion}
                onAddStroke={editor.addStroke}
                onRemoveRegion={editor.removeRegion}
                onApplyCrop={editor.applyCrop}
              />
            </section>
            <ImageEditorPanel
              sourceLabel={editor.source.label}
              sourceThumbnailUrl={editor.currentImageUrl}
              extraReferences={editor.extraReferences}
              maxExtraReferences={editor.maxExtraReferences}
              onRemoveExtraReference={editor.removeExtraReference}
              onMentionReference={editor.mentionReference}
              onAddReferenceUpload={() => referenceFileInputRef.current?.click()}
              onAddReferenceAsset={() => {
                setAssetPickerMode('multi');
                setAssetPickerOpen(true);
              }}
              isEnglish={isEnglish}
              prompt={editor.prompt}
              onPromptChange={editor.setPrompt}
              model={editor.model}
              models={editor.availableModels}
              onModelChange={editor.setModel}
              busy={busy}
              generationLabel={editor.generation.label}
              error={editor.error || (editor.regionMode === 'auto' && autoMaskWorker.status === 'error' ? autoMaskWorker.message : '')}
              regions={editor.regions}
              regionMode={editor.regionMode}
              onRegionModeChange={(mode) => { editor.clearAutoMask(); editor.setRegionMode(mode); }}
              activeRegionId={editor.activeRegionId}
              onSelectRegion={editor.setActiveRegionId}
              activeTool={editor.activeTool}
              onSelectTool={handleSelectTool}
              onApplyOption={handleApplyOption}
              cropAspect={cropAspect}
              onCropAspectChange={(aspect) => {
                setCropAspect(aspect);
                editor.setCropExpand((current) => ({ ...current, aspect }));
                // 选择比例即进入裁剪模式，画布会自动展示默认裁剪框
                editor.setActiveTool('crop');
              }}
              onCropReset={() => setCropResetSignal((value) => value + 1)}
              cropPrompt={editor.cropExpand.prompt}
              onCropPromptChange={(value) =>
                editor.setCropExpand((current) => ({
                  ...current,
                  prompt: value
                }))
              }
              adjustments={editor.adjustments}
              onAdjustmentsChange={editor.setAdjustments}
              onAdjustmentsDone={editor.commitAdjustmentsDone}
              camera={editor.camera}
              onCameraChange={editor.setCamera}
              brushSize={editor.brushSize}
              onBrushSizeChange={editor.setBrushSize}
              brushColor={editor.brushColor}
              onBrushColorChange={editor.setBrushColor}
              drawPrompt={editor.drawPrompt}
              onDrawPromptChange={editor.setDrawPrompt}
              strokeCount={editor.strokes.length}
              onClearStrokes={editor.clearStrokes}
              onRemoveRegion={editor.removeRegion}
              onUpdateRegionPrompt={editor.updateRegionPrompt}
              onGenerate={editor.generate}
              onDownload={handleDownload}
              onSendToEnhance={(target, useAi) => void editor.enhance(target, useAi)}
              enhancing={editor.enhancing}
              onCancelEnhance={editor.cancelEnhance}
              onSendToBackgroundRemover={handleSendToBackgroundRemover}
              onTurnIntoVideo={handleTurnIntoVideo}
              estimatedCost={estimatedCost}
              insufficientCredits={insufficientCredits}
              modelsUnavailable={modelsUnavailable}
              requiresLogin={!isAuthenticated}
              onRequireLogin={requireLogin}
            />
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        aria-label={copy.upload}
        onChange={(event) => {
          void handlePickFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <input
        ref={referenceFileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        style={{ display: 'none' }}
        aria-label={isEnglish ? 'Upload reference images' : '上传参考图'}
        onChange={(event) => {
          void handlePickReferenceFiles(event.target.files);
          event.target.value = '';
        }}
      />
      <ImageEditorAssetPicker
        isEnglish={isEnglish}
        open={assetPickerOpen}
        onClose={() => setAssetPickerOpen(false)}
        selectionMode={assetPickerMode}
        onPick={(item) => {
          void editor.pickAsset(item).finally(() => setAssetPickerOpen(false));
        }}
        onPickMany={(items) => {
          void editor
            .pickReferenceAssets(items)
            .finally(() => setAssetPickerOpen(false));
        }}
      />
    </CreateWorkspaceFrame>
  );
}
