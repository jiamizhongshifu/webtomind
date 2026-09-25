/**
 * 个人素材"上传图片 → VLM 反推 → 多行确认入库"流程的状态机。
 *
 * 与 UploadReverseModal(纯展示弹窗)配对:本 hook 持有 uploadStage / uploadError /
 * uploadDraft + 全部行变更 + 保存/取消逻辑,modal 只渲染。
 *
 * 从 ImageCreatePage 抽出。跨域副作用通过回调上抛:
 * - 保存成功后写回 userAssets(setUserAssets) + 标记已加载(setUserAssetsLoaded)
 * - 自动选中最后一张到对应 slot(setActiveSlot + setSelection)
 * - 成功 toast(setStatusText)
 * - 未登录上传时触发登录引导(onRequireLogin)
 */

import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import {
  importUserPromptAssetPrompt,
  saveUserPromptAsset,
  uploadUserPromptAssetImage,
  type UserPromptAssetReverseItem,
  type UserPromptAsset
} from '@/services/agent-api';
import {
  imagePromptSlots,
  setImagePromptAssetSelection,
  type ImagePromptSelection,
  type ImagePromptSlot
} from '../../data/image-prompt-core';
import type { UploadDraftRow } from './UploadReverseModal';

type UploadStage = 'idle' | 'uploading' | 'analyzing' | 'confirming' | 'saving';

interface UploadDraft {
  thumbnailUrl: string;
  source: 'image' | 'prompt';
  sourcePrompt?: string;
  rows: UploadDraftRow[];
}

export interface ReverseSessionDraft {
  thumbnailUrl: string;
  source: 'image' | 'prompt';
  sourcePrompt?: string;
  fullPrompt: string;
  negativePrompt: string;
  routeHint?: string;
  rows: UploadDraftRow[];
  ok: boolean;
}

export interface UseAssetUploadParams {
  isAuthenticated: boolean;
  /** 未登录用户尝试上传时触发(页面通常 navigate('/login')) */
  onRequireLogin: () => void;
  setUserAssets: Dispatch<SetStateAction<UserPromptAsset[]>>;
  setUserAssetsLoaded: (loaded: boolean) => void;
  setActiveSlot: (slot: ImagePromptSlot) => void;
  setSelection: Dispatch<SetStateAction<ImagePromptSelection>>;
  setStatusText: (text: string) => void;
  onReverseSessionReady?: (draft: ReverseSessionDraft) => void;
  promptLocale: 'zh-CN' | 'en-US';
}

export interface UseAssetUploadResult {
  uploadStage: UploadStage;
  uploadError: string;
  uploadDraft: UploadDraft | null;
  promptImportOpen: boolean;
  promptImportText: string;
  setPromptImportText: (text: string) => void;
  handleOpenPromptImport: () => void;
  handleCancelPromptImport: () => void;
  handleSubmitPromptImport: () => Promise<void>;
  handlePickUploadFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
  updateUploadRow: (key: string, patch: Partial<UploadDraftRow>) => void;
  removeUploadRow: (key: string) => void;
  setAllUploadRowsSelected: (selected: boolean) => void;
  addBlankUploadRow: () => void;
  handleSaveUploadDraft: () => Promise<void>;
  handleCancelUploadDraft: () => void;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('FileReader returned non-string'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function toDraftRows(
  rawItems: UserPromptAssetReverseItem[],
  fallbackPrompt = ''
): UploadDraftRow[] {
  const knownSlotIds = new Set(imagePromptSlots.map((s) => s.id));
  if (rawItems.length > 0) {
    return rawItems.map((item, idx) => {
      const slot = knownSlotIds.has(item.slot as ImagePromptSlot)
        ? (item.slot as ImagePromptSlot)
        : 'style';
      return {
        key: `${slot}-${idx}-${Math.random().toString(36).slice(2, 8)}`,
        selected: true,
        slot,
        title: item.title || '',
        subtitle: item.subtitle || '',
        prompt: item.prompt || '',
        negativePrompt: item.negativePrompt || '',
        tagsText: (item.tags || []).join(', ')
      };
    });
  }

  const fallbackParts = splitFallbackPrompt(fallbackPrompt);
  return [
    {
      key: `style-blank-${Math.random().toString(36).slice(2, 8)}`,
      selected: true,
      slot: 'style' as ImagePromptSlot,
      title: inferFallbackTitle(fallbackParts.prompt),
      subtitle: fallbackPrompt ? '粘贴导入' : '',
      prompt: fallbackParts.prompt,
      negativePrompt: fallbackParts.negative,
      tagsText: ''
    }
  ];
}

export function splitFallbackPrompt(prompt: string): {
  prompt: string;
  negative: string;
} {
  const trimmed = prompt.trim();
  if (!trimmed) return { prompt: '', negative: '' };
  const match =
    /(^|[\n\r]|[，。；;]\s*)(?:负面提示词?|负向(?:提示词|\s*prompt)?|负面限制词?|负面限制|negative\s*prompt|negative)\s*[：:]\s*/i.exec(
      trimmed
    );
  if (!match || typeof match.index !== 'number') {
    return { prompt: trimmed, negative: '' };
  }
  const positive = trimmed.slice(0, match.index + match[1].length).trim();
  const negative = trimmed
    .slice(match.index + match[0].length)
    .trim()
    .replace(/^[\s：:]+/, '');
  return {
    prompt: positive || trimmed,
    negative
  };
}

function inferFallbackTitle(prompt: string): string {
  const firstLine =
    prompt
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) || '';
  if (!firstLine) return '';
  return firstLine
    .replace(/^生成一?张(?:单张)?\s*/u, '')
    .replace(/[。,.，：:].*$/u, '')
    .slice(0, 14)
    .trim();
}

function toUploadErrorMessage(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    return value.trim() || fallback;
  }
  if (value instanceof Error) {
    return value.message || fallback;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['message', 'error', 'detail', 'reason']) {
      const nested = record[key];
      if (typeof nested === 'string' && nested.trim()) {
        return nested.trim();
      }
      if (nested && typeof nested === 'object') {
        const nestedMessage = toUploadErrorMessage(nested, '');
        if (nestedMessage) return nestedMessage;
      }
    }
    try {
      const serialized = JSON.stringify(value);
      return serialized && serialized !== '{}' ? serialized : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export function useAssetUpload({
  isAuthenticated,
  onRequireLogin,
  setUserAssets,
  setUserAssetsLoaded,
  setActiveSlot,
  setSelection,
  setStatusText,
  onReverseSessionReady,
  promptLocale
}: UseAssetUploadParams): UseAssetUploadResult {
  const { t } = useTranslation('imageCreate');

  const [uploadStage, setUploadStage] = useState<UploadStage>('idle');
  const [uploadError, setUploadError] = useState('');
  const [uploadDraft, setUploadDraft] = useState<UploadDraft | null>(null);
  const [promptImportOpen, setPromptImportOpen] = useState(false);
  const [promptImportText, setPromptImportText] = useState('');

  const handleUploadFile = async (file: File) => {
    setUploadStage('uploading');
    setUploadError('');
    try {
      const dataUrl = await fileToBase64(file);
      const response = await uploadUserPromptAssetImage({
        imageBase64: dataUrl,
        mimeType: file.type,
        locale: promptLocale
      });
      const rows = toDraftRows(response.reverse.items || []);
      if (onReverseSessionReady) {
        onReverseSessionReady({
          thumbnailUrl: response.thumbnailUrl,
          source: 'image',
          fullPrompt: response.reverse.fullPrompt || '',
          negativePrompt: response.reverse.negativePrompt || '',
          routeHint: response.reverse.routeHint,
          rows,
          ok: response.reverse.ok
        });
      } else {
        setUploadDraft({
          thumbnailUrl: response.thumbnailUrl,
          source: 'image',
          rows
        });
      }
      if (!response.reverse.ok) {
        setUploadError(
          toUploadErrorMessage(
            response.reverse.error,
            t('upload.reverseFailed') as string
          )
        );
      }
      setUploadStage(onReverseSessionReady ? 'idle' : 'confirming');
    } catch (caught) {
      setUploadStage('idle');
      setUploadError(
        toUploadErrorMessage(caught, t('upload.failed') as string)
      );
    }
  };

  const handlePickUploadFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError(t('upload.invalidType'));
      return;
    }
    if (!isAuthenticated) {
      onRequireLogin();
      return;
    }
    setUploadError('');
    void handleUploadFile(file);
  };

  const handleOpenPromptImport = () => {
    if (!isAuthenticated) {
      onRequireLogin();
      return;
    }
    setUploadError('');
    setPromptImportOpen(true);
  };

  const handleCancelPromptImport = () => {
    if (uploadStage === 'analyzing') return;
    setPromptImportOpen(false);
    setUploadError('');
  };

  const handleSubmitPromptImport = async () => {
    const prompt = promptImportText.trim();
    if (!prompt) {
      setUploadError(t('upload.promptImportRequired'));
      return;
    }
    if (!isAuthenticated) {
      onRequireLogin();
      return;
    }

    setUploadStage('analyzing');
    setUploadError('');
    try {
      const response = await importUserPromptAssetPrompt({ prompt });
      const rows = toDraftRows(response.reverse.items || [], prompt);
      setUploadDraft({
        thumbnailUrl: '',
        source: 'prompt',
        sourcePrompt: prompt,
        rows
      });
      setPromptImportOpen(false);
      setPromptImportText('');
      if (!response.reverse.ok) {
        setUploadError(
          toUploadErrorMessage(
            response.reverse.error,
            t('upload.promptImportAnalyzeFailed') as string
          )
        );
      }
      setUploadStage('confirming');
    } catch (caught) {
      setUploadStage('idle');
      setUploadError(
        toUploadErrorMessage(
          caught,
          t('upload.promptImportAnalyzeFailed') as string
        )
      );
    }
  };

  const updateUploadRow = (key: string, patch: Partial<UploadDraftRow>) => {
    setUploadDraft((current) =>
      current
        ? {
            ...current,
            rows: current.rows.map((row) =>
              row.key === key ? { ...row, ...patch } : row
            )
          }
        : current
    );
  };

  const removeUploadRow = (key: string) => {
    setUploadDraft((current) =>
      current
        ? { ...current, rows: current.rows.filter((row) => row.key !== key) }
        : current
    );
  };

  const setAllUploadRowsSelected = (selected: boolean) => {
    setUploadDraft((current) =>
      current
        ? {
            ...current,
            rows: current.rows.map((row) => ({ ...row, selected }))
          }
        : current
    );
  };

  const addBlankUploadRow = () => {
    setUploadDraft((current) =>
      current
        ? {
            ...current,
            rows: [
              ...current.rows,
              {
                key: `blank-${Date.now().toString(36)}-${Math.random()
                  .toString(36)
                  .slice(2, 6)}`,
                selected: true,
                slot: 'style',
                title: '',
                subtitle: '',
                prompt: '',
                negativePrompt: '',
                tagsText: ''
              }
            ]
          }
        : current
    );
  };

  const handleSaveUploadDraft = async () => {
    if (!uploadDraft) return;
    const selectedRows = uploadDraft.rows.filter((row) => row.selected);
    if (selectedRows.length === 0) {
      setUploadError(t('upload.noneSelected'));
      return;
    }
    // 校验所有勾选行的 prompt 必填
    const missingIdx = selectedRows.findIndex((row) => !row.prompt.trim());
    if (missingIdx !== -1) {
      setUploadError(t('upload.promptRequired'));
      return;
    }

    setUploadStage('saving');
    setUploadError('');
    let savedCount = 0;
    let lastSavedSlot: ImagePromptSlot | null = null;
    const savedSelections: Array<{ id: string; slot: ImagePromptSlot }> = [];
    try {
      for (const row of selectedRows) {
        const saved = await saveUserPromptAsset({
          slot: row.slot,
          title: row.title.trim() || t('upload.untitled'),
          subtitle: row.subtitle.trim(),
          prompt: row.prompt.trim(),
          promptZh: null,
          negativePrompt: row.negativePrompt.trim() || null,
          negativePromptZh: null,
          tags: row.tagsText
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
          thumbnailUrl: uploadDraft.thumbnailUrl,
          source:
            uploadDraft.source === 'prompt' ? 'prompt_import' : 'user_upload',
          sourcePrompt: uploadDraft.sourcePrompt
        });
        setUserAssets((prev) => [
          saved,
          ...prev.filter((p) => p.id !== saved.id)
        ]);
        savedCount += 1;
        lastSavedSlot = saved.slot as ImagePromptSlot;
        savedSelections.push({
          id: saved.id,
          slot: saved.slot as ImagePromptSlot
        });
      }
      setUserAssetsLoaded(true);
      // 自动选中保存素材；多选 slot 会追加，单选 slot 仍由最后一项覆盖。
      if (lastSavedSlot && savedSelections.length > 0) {
        setActiveSlot(lastSavedSlot);
        setSelection((prev) =>
          savedSelections.reduce(
            (nextSelection, asset) =>
              setImagePromptAssetSelection(nextSelection, asset),
            prev
          )
        );
      }
      setUploadDraft(null);
      setUploadStage('idle');
      setStatusText(
        t('upload.savedToastBatch', { count: savedCount }) as string
      );
    } catch (caught) {
      setUploadStage('confirming');
      setUploadError(
        caught instanceof Error ? caught.message : t('upload.saveFailed')
      );
    }
  };

  const handleCancelUploadDraft = () => {
    setUploadDraft(null);
    setUploadStage('idle');
    setUploadError('');
    setPromptImportOpen(false);
  };

  return {
    uploadStage,
    uploadError,
    uploadDraft,
    promptImportOpen,
    promptImportText,
    setPromptImportText,
    handleOpenPromptImport,
    handleCancelPromptImport,
    handleSubmitPromptImport,
    handlePickUploadFile,
    updateUploadRow,
    removeUploadRow,
    setAllUploadRowsSelected,
    addBlankUploadRow,
    handleSaveUploadDraft,
    handleCancelUploadDraft
  };
}
