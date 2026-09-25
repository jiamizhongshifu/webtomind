/**
 * 提示词编译器。默认作为底部 dock 使用,也可内嵌到创作台中栏。
 */

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type SetStateAction
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  BookOpen,
  ChevronsUpDown,
  Copy,
  Crown,
  CreditCard,
  GalleryHorizontalEnd,
  Image as ImageIcon,
  Loader2,
  Minimize2,
  Pencil,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  Wand2,
  X
} from 'lucide-react';
import type { ImagePromptSettings } from '../../data/image-prompt-core';
import {
  Button,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  Textarea,
  useOverlayBehavior
} from '@/shared/ui';
import { Checkbox } from '@/shared/ui/radix/checkbox';
import { BeamCta } from '@/web/components/BeamCta';
import {
  clampImageCountForModel,
  getAspectRatioOptionsForModel,
  getAspectRatioForImageSize,
  getImageCountOptionsForModel,
  getImageResolutionForImageSize,
  getImageResolutionOptionsForModel,
  getImageSizeForModelAspectRatioAndResolution,
  getImageSizeOption,
  type ImageCreatorModelOption,
  modelGroupLabels,
  modelGroupOrder,
  modelOptions as fallbackModelOptions,
  resolveRecommendedImageSettingsForModel
} from '../../data/image-creator-options';
import type { CompiledPrompt } from './CreatorCanvas';
import type { ProgressTask } from './GenerationProgressPanel';

export interface PromptPresetSummary {
  id: string;
  name: string;
  createdAt: number;
}

export interface CustomPromptLibrarySummary {
  id: string;
  title: string;
  prompt: string;
  negativePrompt: string;
  createdAt: number;
}

export interface ReferenceUploadPreviewItem {
  clientId: string;
  referenceId?: string;
  fileName: string;
  previewUrl: string;
  status: 'uploading' | 'uploaded' | 'failed';
  error?: string;
}

export interface PromptReferenceMention {
  id: string;
  token: string;
  label: string;
  detail?: string;
  previewUrl?: string;
  kind: 'image' | 'gallery' | 'character';
}

export interface PromptCompilerPanelProps {
  compiled: CompiledPrompt;
  copied: boolean;
  onCopyPrompt: () => void;
  autoOptimizePrompt?: boolean;
  autoOptimizePending?: boolean;
  onAutoOptimizePromptChange?: (enabled: boolean) => void;
  customPromptText: string;
  customNegativePromptText: string;
  onCustomPromptChange: (value: string) => void;
  combinationPromptPending?: boolean;
  onApplyCombinationPrompt?: () => void;
  onCustomNegativePromptChange: (value: string) => void;
  isPromptExpanded: boolean;
  openSignal?: number;
  onToggleExpand: () => void;
  isAuthenticated: boolean;
  settings: ImagePromptSettings;
  onSettingsChange: Dispatch<SetStateAction<ImagePromptSettings>>;
  models?: ImageCreatorModelOption[];
  imageCount: number;
  onImageCountChange: (count: number) => void;
  estimatedCost: number;
  insufficientCredits: boolean;
  showLowBalanceTopUp?: boolean;
  onLowBalanceTopUp?: () => void;
  onGenerate: () => void;
  uploadStage: 'idle' | 'uploading' | 'analyzing' | 'confirming' | 'saving';
  uploadError: string;
  generationError?: string;
  generationStatusText?: string;
  generationDisabled?: boolean;
  onOpenReverseUpload: () => void;
  onOpenReferenceUpload?: () => void;
  referenceUploadItems?: ReferenceUploadPreviewItem[];
  referenceMentions?: PromptReferenceMention[];
  onRemoveReferenceUpload?: (clientId: string) => void;
  selectedGalleryReferenceCount?: number;
  selectedCharacterCount?: number;
  onOpenCharacterWorkflow?: () => void;
  onOpenHistoryReferencePicker?: () => void;
  onRandomPrompt?: () => void;
  showReverseImport: boolean;
  reverseImporting: boolean;
  reverseImportDisabled: boolean;
  reverseImported: boolean;
  onImportReverseSession: () => void;
  presetSaved: boolean;
  onSavePreset: () => void;
  onReset: () => void;
  presets: PromptPresetSummary[];
  promptLibrary: CustomPromptLibrarySummary[];
  progressTasks?: ProgressTask[];
  progressTaskCount?: number;
  progressActiveTaskCount?: number;
  isMember?: boolean;
  membershipLoading?: boolean;
  onRequestMembership?: (source: string) => void;
  onApplyPreset: (id: string) => void;
  onDeletePreset: (id: string) => void;
  onApplyPromptLibraryItem: (id: string) => boolean;
  onRenamePromptLibraryItem: (id: string) => void;
  onDeletePromptLibraryItem: (id: string) => void;
  onCopyPromptLibraryItem: (id: string) => void;
  dateLocale: string;
  promptLocale: 'zh-CN' | 'en-US';
  presentation?: 'dock' | 'inline';
}

interface MentionQueryState {
  start: number;
  end: number;
  query: string;
}

const PROMPT_EDITOR_BASE_HEIGHT = 286;
const PROMPT_EDITOR_BASE_HEIGHT_COMPACT = 224;
const PROMPT_EDITOR_COLLAPSED_MAX_HEIGHT = 420;
const PROMPT_EDITOR_COLLAPSED_MAX_HEIGHT_COMPACT = 320;
const PROMPT_EDITOR_EXPANDED_MAX_HEIGHT = 640;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeMentionAlias(value: string) {
  return value.trim().replace(/\s+/g, '').toLowerCase();
}

function getMentionQuery(
  value: string,
  caret: number
): MentionQueryState | null {
  const beforeCaret = value.slice(0, caret);
  const match = beforeCaret.match(/(^|\s)@([A-Za-z0-9_\-\u4e00-\u9fff]*)$/);
  if (!match) return null;
  const query = match[2] || '';
  return {
    start: caret - query.length - 1,
    end: caret,
    query
  };
}

function promptContainsMention(
  prompt: string,
  mention: PromptReferenceMention
) {
  const aliases = new Set([
    mention.token,
    normalizeMentionAlias(mention.token),
    mention.label,
    normalizeMentionAlias(mention.label)
  ]);
  return Array.from(aliases).some((alias) => {
    if (!alias) return false;
    const pattern = new RegExp(
      `@${escapeRegExp(alias)}(?=$|\\s|[,.!?;:，。！？；：、)])`,
      'i'
    );
    return pattern.test(prompt);
  });
}

export function PromptCompilerPanel({
  compiled,
  copied,
  onCopyPrompt,
  autoOptimizePrompt = false,
  autoOptimizePending = false,
  onAutoOptimizePromptChange,
  customPromptText,
  onCustomPromptChange,
  combinationPromptPending,
  onApplyCombinationPrompt,
  isPromptExpanded,
  openSignal,
  onToggleExpand,
  isAuthenticated,
  settings,
  onSettingsChange,
  models = fallbackModelOptions,
  imageCount,
  onImageCountChange,
  estimatedCost,
  insufficientCredits,
  showLowBalanceTopUp = false,
  onLowBalanceTopUp,
  onGenerate,
  uploadError,
  generationError = '',
  generationStatusText = '',
  generationDisabled = false,
  onOpenReferenceUpload,
  referenceUploadItems = [],
  referenceMentions = [],
  onRemoveReferenceUpload,
  selectedGalleryReferenceCount = 0,
  selectedCharacterCount = 0,
  onOpenCharacterWorkflow,
  onOpenHistoryReferencePicker,
  onRandomPrompt,
  showReverseImport,
  reverseImporting,
  reverseImportDisabled,
  reverseImported,
  onImportReverseSession,
  presetSaved,
  onSavePreset,
  onReset,
  presets,
  promptLibrary,
  isMember = false,
  membershipLoading = false,
  onRequestMembership,
  onApplyPreset,
  onDeletePreset,
  onApplyPromptLibraryItem,
  onRenamePromptLibraryItem,
  onDeletePromptLibraryItem,
  onCopyPromptLibraryItem,
  dateLocale,
  presentation = 'dock'
}: PromptCompilerPanelProps) {
  const { t } = useTranslation('imageCreate');
  const promptEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [referencePanelOpen, setReferencePanelOpen] = useState(false);
  const [dismissedCombinationPrompt, setDismissedCombinationPrompt] = useState<
    string | null
  >(null);
  const [mobileSettingsExpanded, setMobileSettingsExpanded] = useState(false);
  const mobileSettingsId = useId();
  const [modalView, setModalView] = useState<'presets' | 'promptLibrary'>(
    'presets'
  );
  const presetModalRef = useOverlayBehavior<HTMLElement>({
    open: presetModalOpen,
    onClose: () => setPresetModalOpen(false)
  });
  const [mentionQuery, setMentionQuery] = useState<MentionQueryState | null>(
    null
  );
  const [isMinimized, setIsMinimized] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 800px)').matches;
  });
  const lastOpenSignalRef = useRef(openSignal);
  const editorScrollIntentRef = useRef<{
    selectionStart: number;
    selectionEnd: number;
    scrollTop: number;
    pinnedToBottom: boolean;
    caretAtEnd: boolean;
  } | null>(null);
  const isPromptLibraryView = modalView === 'promptLibrary';
  const currentPrompt = customPromptText;
  const currentModel =
    models.find((model) => model.value === settings.model) || models[0];
  const availableAspectRatioOptions =
    getAspectRatioOptionsForModel(currentModel);

  useEffect(() => {
    if (openSignal === undefined) return;
    if (lastOpenSignalRef.current === openSignal) return;
    lastOpenSignalRef.current = openSignal;
    setIsMinimized(false);
  }, [openSignal]);

  const modalTitle = isPromptLibraryView
    ? t('promptLibrary.title')
    : t('controls.presetTitle');
  const saveButtonLabel = t('promptLibrary.savePrompt');
  const libraryButtonLabel = t('promptLibrary.entry');
  const imageCountMemberLabel = t('controls.imageCount.memberOnly');
  const combinationPrompt = compiled.prompt.trim();
  const showCombinationPromptSuggestion =
    (combinationPromptPending ??
      (compiled.selectedAssets.length > 0 &&
        combinationPrompt.length > 0 &&
        combinationPrompt !== customPromptText.trim())) &&
    dismissedCombinationPrompt !== combinationPrompt;
  const handleApplyCombinationPrompt = () => {
    if (onApplyCombinationPrompt) {
      onApplyCombinationPrompt();
    } else {
      onCustomPromptChange(combinationPrompt);
    }
    setIsMinimized(false);
  };
  const handleOpenCharacterWorkflow = () => {
    onOpenCharacterWorkflow?.();
  };
  const handleOpenHistoryReferencePicker = () => {
    onOpenHistoryReferencePicker?.();
  };
  const handleResetClick = () => {
    if (window.confirm(t('controls.resetConfirm') as string)) {
      onReset();
    }
  };
  const displayImageCount = Math.max(
    1,
    clampImageCountForModel(settings.model, imageCount)
  );
  const imageCountOptions = getImageCountOptionsForModel(currentModel);
  const selectedReferenceCount =
    selectedCharacterCount +
    selectedGalleryReferenceCount +
    referenceUploadItems.length;
  const mentionOptions = useMemo(() => {
    if (!mentionQuery) return [];
    const query = normalizeMentionAlias(mentionQuery.query);
    return referenceMentions
      .filter((mention) => {
        if (!query) return true;
        return (
          normalizeMentionAlias(mention.token).includes(query) ||
          normalizeMentionAlias(mention.label).includes(query)
        );
      })
      .slice(0, 8);
  }, [mentionQuery, referenceMentions]);
  const activeReferenceMentions = useMemo(
    () =>
      referenceMentions.filter((mention) =>
        promptContainsMention(currentPrompt, mention)
      ),
    [currentPrompt, referenceMentions]
  );
  const currentImageSize = getImageSizeOption(settings.imageSize);
  const selectedAspectRatio =
    availableAspectRatioOptions.find(
      (option) =>
        option.value === (currentImageSize?.aspectRatio || settings.aspectRatio)
    )?.value || '1:1';
  const availableResolutionOptions = getImageResolutionOptionsForModel(
    currentModel,
    selectedAspectRatio
  );
  const selectedResolution = getImageResolutionForImageSize(settings.imageSize);
  const uploadingReferenceCount = referenceUploadItems.filter(
    (item) => item.status === 'uploading'
  ).length;
  const uploadedReferenceCount = referenceUploadItems.filter(
    (item) => item.status === 'uploaded'
  ).length;
  const failedReferenceCount = referenceUploadItems.filter(
    (item) => item.status === 'failed'
  ).length;

  const updateModel = (model: string) => {
    const nextModel = models.find((option) => option.value === model);
    onSettingsChange((current) => ({
      ...current,
      model,
      ...resolveRecommendedImageSettingsForModel(nextModel, current.imageSize),
      imageCount: clampImageCountForModel(model, current.imageCount)
    }));
  };

  const updateAspectRatio = (aspectRatio: string) => {
    onSettingsChange((current) => ({
      ...current,
      aspectRatio,
      imageSize: getImageSizeForModelAspectRatioAndResolution(
        currentModel,
        aspectRatio,
        getImageResolutionForImageSize(current.imageSize)
      )
    }));
  };

  const updateResolution = (resolution: string) => {
    onSettingsChange((current) => ({
      ...current,
      ...(() => {
        const imageSize = getImageSizeForModelAspectRatioAndResolution(
          currentModel,
          current.aspectRatio || selectedAspectRatio,
          resolution
        );
        return {
          imageSize,
          aspectRatio: getAspectRatioForImageSize(imageSize)
        };
      })()
    }));
  };

  useLayoutEffect(() => {
    const editor = promptEditorRef.current;
    if (!editor) {
      return;
    }

    const isFocused = document.activeElement === editor;
    const scrollIntent = editorScrollIntentRef.current;
    editorScrollIntentRef.current = null;
    const selectionStart =
      scrollIntent?.selectionStart ?? editor.selectionStart;
    const selectionEnd = scrollIntent?.selectionEnd ?? editor.selectionEnd;
    const scrollTop = scrollIntent?.scrollTop ?? editor.scrollTop;
    const shouldPinToBottom =
      Boolean(scrollIntent?.pinnedToBottom || scrollIntent?.caretAtEnd) &&
      isFocused;
    editor.style.height = 'auto';
    const isCompactMobile = window.innerWidth <= 560;
    const measuredHeight = Math.max(
      editor.scrollHeight,
      isCompactMobile
        ? PROMPT_EDITOR_BASE_HEIGHT_COMPACT
        : PROMPT_EDITOR_BASE_HEIGHT
    );
    const collapsedHeight = Math.min(
      measuredHeight,
      isCompactMobile
        ? PROMPT_EDITOR_COLLAPSED_MAX_HEIGHT_COMPACT
        : PROMPT_EDITOR_COLLAPSED_MAX_HEIGHT
    );
    const expandedMaxHeight = Math.max(
      PROMPT_EDITOR_COLLAPSED_MAX_HEIGHT_COMPACT,
      Math.min(
        window.innerHeight - (isCompactMobile ? 220 : 280),
        PROMPT_EDITOR_EXPANDED_MAX_HEIGHT
      )
    );
    const targetHeight = isPromptExpanded
      ? Math.min(measuredHeight, expandedMaxHeight)
      : collapsedHeight;
    editor.style.height = `${targetHeight}px`;
    if (isFocused) {
      editor.setSelectionRange(selectionStart, selectionEnd);
      editor.scrollTop = shouldPinToBottom ? editor.scrollHeight : scrollTop;
      requestAnimationFrame(() => {
        if (document.activeElement === editor) {
          editor.setSelectionRange(selectionStart, selectionEnd);
          editor.scrollTop = shouldPinToBottom
            ? editor.scrollHeight
            : scrollTop;
        }
      });
    }
  }, [currentPrompt, isPromptExpanded]);

  const handleCustomPromptInput = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const editor = event.currentTarget;
    editorScrollIntentRef.current = {
      selectionStart: editor.selectionStart,
      selectionEnd: editor.selectionEnd,
      scrollTop: editor.scrollTop,
      pinnedToBottom:
        editor.scrollTop + editor.clientHeight >= editor.scrollHeight - 12,
      caretAtEnd: editor.selectionEnd >= editor.value.length - 1
    };
    onCustomPromptChange(editor.value);
    setMentionQuery(getMentionQuery(editor.value, editor.selectionStart));
  };

  const refreshMentionQuery = () => {
    const editor = promptEditorRef.current;
    if (!editor) return;
    setMentionQuery(getMentionQuery(editor.value, editor.selectionStart));
  };

  const insertPromptReferenceMention = (mention: PromptReferenceMention) => {
    const editor = promptEditorRef.current;
    const sourcePrompt = customPromptText;
    const range =
      mentionQuery ||
      getMentionQuery(
        sourcePrompt,
        editor?.selectionStart ?? sourcePrompt.length
      );
    const insertion = `@${mention.token} `;
    const nextPrompt = range
      ? `${sourcePrompt.slice(0, range.start)}${insertion}${sourcePrompt.slice(range.end)}`
      : `${sourcePrompt}${sourcePrompt.endsWith(' ') || !sourcePrompt ? '' : ' '}${insertion}`;
    const cursorPosition = range
      ? range.start + insertion.length
      : nextPrompt.length;
    onCustomPromptChange(nextPrompt);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      const nextEditor = promptEditorRef.current;
      if (!nextEditor) return;
      nextEditor.focus();
      nextEditor.setSelectionRange(cursorPosition, cursorPosition);
    });
  };

  const handleImageCountSelect = (count: number) => {
    if (count >= 4 && !membershipLoading && !isMember) {
      onRequestMembership?.('image_batch_count');
      return;
    }
    onImageCountChange(count);
  };

  if (presentation === 'dock' && isMinimized) {
    return (
      <section
        className="creator-prompt-dock creator-prompt-dock-minimized"
        aria-label={t('prompt.title')}
      >
        <Button
          type="button"
          variant="ghost"
          className="creator-prompt-mini-button"
          onClick={() => setIsMinimized(false)}
        >
          <Sparkles size={16} />
          <span>{t('prompt.restore')}</span>
        </Button>
      </section>
    );
  }

  return (
    <section
      className={
        presentation === 'inline'
          ? 'creator-prompt-inline'
          : 'creator-prompt-dock'
      }
      aria-label={t('prompt.title')}
    >
      <DialogRoot
        open={referencePanelOpen}
        onOpenChange={setReferencePanelOpen}
      >
        <DialogContent
          className="creator-reference-dialog"
          onInteractOutside={(event) => {
            const target = event.target;
            if (
              target instanceof Element &&
              target.closest(
                '.creator-nested-reference-modal, .creator-nested-reference-modal-backdrop, .creator-history-modal, .creator-history-modal-backdrop'
              )
            ) {
              event.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('references.title')}</DialogTitle>
          </DialogHeader>
          <div className="creator-reference-entry-panel">
            <div className="creator-reference-entry-head">
              <span>
                <ImageIcon size={17} />
                {t('references.title')}
              </span>
              <small>{t('references.optional')}</small>
            </div>
            <div className="creator-reference-entry-grid">
              <Button
                type="button"
                variant="ghost"
                className={selectedCharacterCount > 0 ? 'has-selection' : ''}
                onClick={handleOpenCharacterWorkflow}
              >
                <UserRound size={20} />
                <span>{t('references.character.entry')}</span>
                {selectedCharacterCount > 0 && (
                  <strong>{selectedCharacterCount}</strong>
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className={
                  selectedGalleryReferenceCount > 0 ? 'has-selection' : ''
                }
                onClick={handleOpenHistoryReferencePicker}
              >
                <GalleryHorizontalEnd size={20} />
                <span>{t('references.gallery.entry')}</span>
                {selectedGalleryReferenceCount > 0 && (
                  <strong>{selectedGalleryReferenceCount}</strong>
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className={
                  referenceUploadItems.length > 0 ? 'has-selection' : ''
                }
                onClick={onOpenReferenceUpload}
              >
                <Upload size={20} />
                <span>{t('references.upload.entry')}</span>
                {referenceUploadItems.length > 0 && (
                  <strong>{referenceUploadItems.length}</strong>
                )}
              </Button>
            </div>
            {referenceUploadItems.length > 0 && (
              <div
                className="creator-reference-upload-preview"
                aria-label={t('references.upload.previewLabel') as string}
              >
                <div className="creator-reference-upload-preview-head">
                  <span>
                    {t('references.upload.previewSummary', {
                      uploaded: uploadedReferenceCount,
                      uploading: uploadingReferenceCount,
                      failed: failedReferenceCount
                    })}
                  </span>
                  <small>{t('references.upload.previewLimit')}</small>
                </div>
                <div className="creator-reference-upload-preview-grid">
                  {referenceUploadItems.map((item) => (
                    <article
                      key={item.clientId}
                      className={`creator-reference-upload-card status-${item.status}`}
                    >
                      <img
                        src={item.previewUrl}
                        alt={item.fileName}
                        width={106}
                        height={106}
                        loading="lazy"
                        decoding="async"
                      />
                      <div className="creator-reference-upload-card-shade" />
                      <span className="creator-reference-upload-status">
                        {item.status === 'uploading' && (
                          <Loader2 size={12} className="creator-spin-icon" />
                        )}
                        {item.status === 'uploaded' && <Check size={12} />}
                        {item.status === 'failed' && <X size={12} />}
                        {t(`references.upload.status.${item.status}`)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="creator-reference-upload-remove"
                        title={t('references.upload.remove') as string}
                        aria-label={t('references.upload.remove') as string}
                        onClick={() => onRemoveReferenceUpload?.(item.clientId)}
                      >
                        <X />
                      </Button>
                      <div className="creator-reference-upload-meta">
                        <strong title={item.fileName}>{item.fileName}</strong>
                        {item.error && <small>{item.error}</small>}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </DialogRoot>

      <div
        className={`creator-prompt-box ${isPromptExpanded ? 'expanded' : ''}`}
      >
        <div className="creator-prompt-head">
          <span className="creator-prompt-title">
            <Wand2 size={17} />
            {t('prompt.inputTitle')}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="creator-prompt-reset-inline"
            title={t('controls.reset') as string}
            aria-label={t('controls.reset') as string}
            onClick={handleResetClick}
          >
            <RotateCcw size={13} />
            <span>{t('controls.reset')}</span>
          </Button>
          <label className="creator-prompt-auto-optimize">
            <Checkbox
              checked={autoOptimizePrompt}
              disabled={autoOptimizePending}
              onCheckedChange={(checked) =>
                onAutoOptimizePromptChange?.(checked === true)
              }
            />
            <span>
              {autoOptimizePending ? (
                <Loader2 className="creator-spin-icon" />
              ) : null}
              {t('prompt.autoOptimize.label')}
            </span>
          </label>
          <div className="creator-prompt-head-library-actions">
            <Button
              type="button"
              variant="outline"
              className="creator-prompt-reference-button"
              onClick={() => setReferencePanelOpen(true)}
            >
              <ImageIcon size={13} />
              <span>{t('references.title')}</span>
              {selectedReferenceCount > 0 && (
                <strong>{selectedReferenceCount}</strong>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="creator-prompt-save-button"
              title={saveButtonLabel as string}
              aria-label={saveButtonLabel as string}
              onClick={onSavePreset}
            >
              {presetSaved ? <Check size={13} /> : <Save size={13} />}
              <span>
                {presetSaved ? t('controls.presetSaved') : saveButtonLabel}
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="creator-prompt-library-button"
              title={libraryButtonLabel as string}
              aria-label={libraryButtonLabel as string}
              onClick={() => {
                setModalView('promptLibrary');
                setPresetModalOpen(true);
              }}
            >
              <BookOpen size={13} />
              <span>{libraryButtonLabel}</span>
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="creator-prompt-copy"
            title={t('canvas.copyPrompt') as string}
            aria-label={t('canvas.copyPrompt') as string}
            onClick={onCopyPrompt}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="creator-prompt-expand"
            title={
              (isPromptExpanded
                ? t('prompt.collapse')
                : t('prompt.expand')) as string
            }
            aria-label={
              (isPromptExpanded
                ? t('prompt.collapse')
                : t('prompt.expand')) as string
            }
            onClick={onToggleExpand}
          >
            <ChevronsUpDown size={16} />
          </Button>
          {presentation === 'dock' && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="creator-prompt-minimize"
              title={t('prompt.minimize') as string}
              aria-label={t('prompt.minimize') as string}
              onClick={() => setIsMinimized(true)}
            >
              <Minimize2 size={16} />
            </Button>
          )}
        </div>

        <div className="creator-prompt-work-row">
          <div className="creator-prompt-copy-area">
            <div className="creator-prompt-editor-shell">
              {activeReferenceMentions.length > 0 && (
                <div
                  className="creator-prompt-reference-tags"
                  aria-label={t('prompt.references.activeLabel') as string}
                >
                  {activeReferenceMentions.map((mention) => (
                    <span key={mention.id}>
                      {mention.previewUrl ? (
                        <img src={mention.previewUrl} alt="" aria-hidden />
                      ) : (
                        <ImageIcon size={13} />
                      )}
                      <strong>{mention.label}</strong>
                      <em>@{mention.token}</em>
                    </span>
                  ))}
                </div>
              )}
              <Textarea
                ref={promptEditorRef}
                className={`creator-prompt-editor ${isPromptExpanded ? 'expanded' : ''} ${
                  activeReferenceMentions.length > 0 ? 'has-reference-tags' : ''
                }`}
                value={currentPrompt}
                placeholder={t('prompt.referencePlaceholder') as string}
                aria-label={t('prompt.customPlaceholder') as string}
                onChange={handleCustomPromptInput}
                onClick={refreshMentionQuery}
                onKeyUp={refreshMentionQuery}
                onBlur={() => {
                  window.setTimeout(() => setMentionQuery(null), 140);
                }}
              />
              {mentionOptions.length > 0 && (
                <div className="creator-prompt-mention-menu" role="listbox">
                  {mentionOptions.map((mention) => (
                    <button
                      key={mention.id}
                      type="button"
                      role="option"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => insertPromptReferenceMention(mention)}
                    >
                      {mention.previewUrl ? (
                        <img src={mention.previewUrl} alt="" aria-hidden />
                      ) : (
                        <ImageIcon size={15} />
                      )}
                      <span>
                        <strong>{mention.label}</strong>
                        <small>
                          @{mention.token}
                          {mention.detail ? ` · ${mention.detail}` : ''}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {onRandomPrompt && (
              <div className="creator-prompt-action-row">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="creator-prompt-random-button"
                  onClick={onRandomPrompt}
                >
                  <Sparkles size={15} />
                  <span>{t('prompt.random')}</span>
                </Button>
              </div>
            )}
            <small className="creator-prompt-hint">
              {t('prompt.customHint')}
            </small>

            {compiled.warnings.length > 0 && (
              <div className="creator-warnings">
                {compiled.warnings.map((warning) => (
                  <span key={warning}>{warning}</span>
                ))}
              </div>
            )}
          </div>

          <div className="creator-prompt-settings-summary creator-prompt-mobile-summary">
            <span>
              <strong>{currentModel.label}</strong>
              {` · ${selectedAspectRatio} · ${selectedResolution}`}
            </span>
            <span>
              {t('controls.estimatedCostShort', { credits: estimatedCost })}
            </span>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="creator-prompt-mobile-settings-toggle"
            aria-expanded={mobileSettingsExpanded}
            aria-controls={mobileSettingsId}
            onClick={() => setMobileSettingsExpanded((current) => !current)}
          >
            <ChevronsUpDown size={15} />
            <span>
              {mobileSettingsExpanded
                ? t('controls.hideAdvanced', {
                    defaultValue: '收起更多设置'
                  })
                : t('controls.showAdvanced', {
                    defaultValue: '更多设置'
                  })}
            </span>
          </Button>
        </div>

        {showCombinationPromptSuggestion && (
          <aside
            className="creator-combination-prompt-notice"
            aria-label={t('prompt.combinationSuggestion.label') as string}
          >
            <div>
              <Sparkles size={15} />
              <span>
                <strong>{t('prompt.combinationSuggestion.title')}</strong>
                <small>{t('prompt.combinationSuggestion.description')}</small>
              </span>
            </div>
            <div className="creator-combination-prompt-actions">
              <BeamCta
                className="creator-combination-prompt-apply-beam"
                radius={9}
                tone="primary"
              >
                <Button
                  type="button"
                  size="sm"
                  onClick={handleApplyCombinationPrompt}
                >
                  <Check size={14} />
                  {t('prompt.combinationSuggestion.apply')}
                </Button>
              </BeamCta>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('prompt.combinationSuggestion.dismiss') as string}
                onClick={() => setDismissedCombinationPrompt(combinationPrompt)}
              >
                <X size={14} />
              </Button>
            </div>
          </aside>
        )}

        <div className="creator-prompt-footer">
          <div
            id={mobileSettingsId}
            className="creator-prompt-settings"
            aria-label={t('controls.title') as string}
            data-mobile-expanded={mobileSettingsExpanded ? 'true' : 'false'}
          >
            <div className="creator-prompt-setting">
              <span>{t('controls.model')}</span>
              <div className="creator-select">
                <SelectRoot value={settings.model} onValueChange={updateModel}>
                  <SelectTrigger
                    className="creator-select-trigger"
                    aria-label={t('controls.model') as string}
                  >
                    <span>
                      {currentModel.label} · x{currentModel.creditMultiplier}
                    </span>
                  </SelectTrigger>
                  <SelectContent className="creator-prompt-select-content">
                    {modelGroupOrder.map((group) => {
                      const groupedModels = models.filter(
                        (model) => model.group === group
                      );
                      if (groupedModels.length === 0) return null;
                      return (
                        <SelectGroup key={group}>
                          <SelectLabel>{modelGroupLabels[group]}</SelectLabel>
                          {groupedModels.map((model) => (
                            <SelectItem
                              key={model.value}
                              value={model.value}
                              disabled={model.status === 'unavailable'}
                            >
                              <span className="creator-model-option-copy">
                                <strong>
                                  {model.label} · x{model.creditMultiplier}
                                </strong>
                                <small>{model.description}</small>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      );
                    })}
                  </SelectContent>
                </SelectRoot>
              </div>
            </div>
            <div className="creator-prompt-setting creator-prompt-setting-ratio">
              <span>{t('controls.aspect')}</span>
              <div className="creator-select">
                <SelectRoot
                  value={selectedAspectRatio}
                  onValueChange={updateAspectRatio}
                >
                  <SelectTrigger
                    className="creator-select-trigger"
                    aria-label={t('controls.aspect') as string}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="creator-prompt-select-content">
                    <SelectGroup>
                      {availableAspectRatioOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </SelectRoot>
              </div>
            </div>
            <div className="creator-prompt-setting">
              <span>{t('controls.resolution')}</span>
              <div className="creator-select">
                <SelectRoot
                  value={selectedResolution}
                  onValueChange={updateResolution}
                >
                  <SelectTrigger
                    className="creator-select-trigger"
                    aria-label={t('controls.resolution') as string}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="creator-prompt-select-content">
                    <SelectGroup>
                      {availableResolutionOptions.map((resolution) => (
                        <SelectItem
                          key={resolution.value}
                          value={resolution.value}
                        >
                          {resolution.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </SelectRoot>
              </div>
            </div>
            <div className="creator-prompt-setting creator-prompt-count-setting">
              <span>{t('controls.imageCount.label')}</span>
              <SelectRoot
                value={String(displayImageCount)}
                onValueChange={(value) => handleImageCountSelect(Number(value))}
              >
                <SelectTrigger
                  className="creator-select-trigger creator-count-select-trigger"
                  aria-label={t('controls.imageCount.label') as string}
                >
                  <span>{displayImageCount}</span>
                  {displayImageCount >= 4 && (
                    <span className="creator-count-member-mark">
                      <Crown size={11} aria-hidden="true" />
                      {imageCountMemberLabel}
                    </span>
                  )}
                </SelectTrigger>
                <SelectContent className="creator-prompt-select-content">
                  <SelectGroup>
                    {imageCountOptions.map((count) => (
                      <SelectItem key={count} value={String(count)}>
                        <span className="creator-count-option-copy">
                          <span>{count}</span>
                          {count >= 4 && (
                            <span className="creator-count-member-mark">
                              <Crown size={11} aria-hidden="true" />
                              {imageCountMemberLabel}
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </SelectRoot>
            </div>
          </div>

          <div className="creator-prompt-primary-actions">
            {showReverseImport && (
              <Button
                type="button"
                variant="outline"
                className="creator-reverse-import-button creator-prompt-reverse-button"
                title="把本次图片反推出的全部临时素材保存到我的素材库"
                aria-label="一键导入本次反推出的全部素材到素材库"
                disabled={reverseImportDisabled}
                onClick={onImportReverseSession}
              >
                {reverseImporting ? (
                  <Loader2
                    data-icon="inline-start"
                    className="creator-spin-icon"
                  />
                ) : (
                  <Wand2 data-icon="inline-start" />
                )}
                <span>一键导入素材库</span>
              </Button>
            )}
            {reverseImported && (
              <span className="creator-reverse-imported creator-prompt-reverse-imported">
                <Check size={14} />
                已导入素材库
              </span>
            )}
            {showLowBalanceTopUp && onLowBalanceTopUp && (
              <Button
                type="button"
                variant="outline"
                className="creator-low-balance-button"
                onClick={onLowBalanceTopUp}
              >
                <CreditCard data-icon="inline-start" />
                <span>{t('controls.lowBalanceTopUp')}</span>
              </Button>
            )}
            <div className="creator-prompt-generate-cluster">
              {isAuthenticated ? (
                <BeamCta
                  active={!insufficientCredits && !generationDisabled}
                  fullWidth
                >
                  <Button
                    type="button"
                    className={`creator-generate-btn creator-prompt-generate ${
                      insufficientCredits ? 'is-insufficient' : ''
                    }`}
                    disabled={generationDisabled}
                    title={`${t('controls.generate')} · ${t(
                      'controls.estimatedCostShort',
                      { credits: estimatedCost }
                    )} · ${t('controls.estimatedCostTooltip')}`}
                    aria-label={`${t('controls.generate')}，${t(
                      'controls.estimatedCostShort',
                      { credits: estimatedCost }
                    )}`}
                    onClick={onGenerate}
                  >
                    <Wand2 size={18} />
                    <span className="creator-generate-copy">
                      <span className="creator-generate-label">
                        {t('controls.generate')}
                      </span>
                      <span className="creator-generate-cost">
                        {t('controls.estimatedCostShort', {
                          credits: estimatedCost
                        })}
                      </span>
                    </span>
                  </Button>
                </BeamCta>
              ) : (
                <Button
                  type="button"
                  className={`creator-generate-btn creator-prompt-generate ${
                    insufficientCredits ? 'is-insufficient' : ''
                  }`}
                  disabled={generationDisabled}
                  title={t('controls.loginToGenerate') as string}
                  aria-label={t('controls.loginToGenerate') as string}
                  onClick={onGenerate}
                >
                  <Wand2 size={18} />
                  {t('controls.loginToGenerate')}
                </Button>
              )}
            </div>
          </div>
        </div>
        {uploadError && (
          <small className="creator-reverse-error creator-prompt-upload-error">
            {uploadError}
          </small>
        )}
        {(generationError || generationStatusText) && (
          <small
            className={`creator-prompt-generate-message ${
              generationError ? 'is-error' : 'is-status'
            }`}
            role={generationError ? 'alert' : 'status'}
          >
            {generationError || generationStatusText}
          </small>
        )}
      </div>

      {presetModalOpen && (
        <div
          className="creator-preset-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPresetModalOpen(false);
            }
          }}
        >
          <section
            ref={presetModalRef}
            className={`creator-preset-modal${
              isPromptLibraryView ? ' prompt-library' : ''
            }`}
            role="dialog"
            aria-modal="true"
            aria-label={modalTitle as string}
            tabIndex={-1}
          >
            <div className="creator-preview-head">
              <span>{modalTitle}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={
                  t('controls.closePresetModal', {
                    defaultValue: '关闭'
                  }) as string
                }
                onClick={() => setPresetModalOpen(false)}
              >
                <X />
              </Button>
            </div>
            <div className="creator-preset-modal-body">
              {isPromptLibraryView ? (
                promptLibrary.length > 0 ? (
                  <div className="creator-prompt-library-list">
                    {promptLibrary.map((item) => (
                      <div
                        key={item.id}
                        className="creator-prompt-library-item"
                      >
                        <button
                          type="button"
                          className="creator-prompt-library-main"
                          onClick={() => {
                            if (onApplyPromptLibraryItem(item.id)) {
                              setPresetModalOpen(false);
                            }
                          }}
                        >
                          <strong>{item.title}</strong>
                          <small>
                            {new Date(item.createdAt).toLocaleDateString(
                              dateLocale
                            )}
                          </small>
                          <span>{item.prompt}</span>
                        </button>
                        <div className="creator-prompt-library-actions">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="creator-prompt-library-icon"
                            aria-label={t('promptLibrary.rename') as string}
                            title={t('promptLibrary.rename') as string}
                            onClick={() => onRenamePromptLibraryItem(item.id)}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="creator-prompt-library-icon"
                            aria-label={t('promptLibrary.copy') as string}
                            title={t('promptLibrary.copy') as string}
                            onClick={() => onCopyPromptLibraryItem(item.id)}
                          >
                            <Copy />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="creator-prompt-library-icon danger"
                            aria-label={t('promptLibrary.delete') as string}
                            title={t('promptLibrary.delete') as string}
                            onClick={() => onDeletePromptLibraryItem(item.id)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="creator-empty-note">
                    {t('promptLibrary.empty')}
                  </p>
                )
              ) : presets.length > 0 ? (
                <div className="creator-preset-list creator-preset-modal-list">
                  {presets.map((preset) => (
                    <div key={preset.id} className="creator-preset-item">
                      <button
                        type="button"
                        onClick={() => {
                          onApplyPreset(preset.id);
                          setPresetModalOpen(false);
                        }}
                      >
                        <strong>
                          {preset.name || t('controls.unnamedPreset')}
                        </strong>
                        <small>
                          {new Date(preset.createdAt).toLocaleDateString(
                            dateLocale
                          )}
                        </small>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t('controls.deletePreset') as string}
                        onClick={() => onDeletePreset(preset.id)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="creator-empty-note">
                  {t('controls.presetEmpty')}
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
