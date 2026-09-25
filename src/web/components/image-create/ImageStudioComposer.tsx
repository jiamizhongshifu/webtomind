import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ClipboardEvent,
  type Dispatch,
  type ReactNode,
  type SetStateAction
} from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  BookImage,
  Check,
  ChevronRight,
  Crop,
  Crown,
  Dices,
  Image as ImageIcon,
  Images,
  Layers3,
  Library,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Save,
  Scan,
  Sparkles,
  Upload,
  UserRound,
  Wand2,
  X
} from 'lucide-react';
import type { VisualMoodboard } from '@/shared/create-workspace-v2';
import {
  getAspectRatioOptionsForModel,
  getImageCountOptionsForModel,
  getImageResolutionOptionsForModel,
  getImageResolutionForImageSize,
  getImageSizeForAspectRatioAndResolution,
  getImageSizeForModelAspectRatioAndResolution,
  imageResolutionOptions,
  type ImageCreatorModelOption,
  modelOptions as fallbackModelOptions,
  resolveRecommendedImageSettingsForModel
} from '@/web/data/image-creator-options';
import {
  getSelectedAssetIds,
  type ImagePromptAsset,
  type ImagePromptSelection,
  type ImagePromptSettings,
  type ImagePromptSlot
} from '@/web/data/image-prompt-core';
import type {
  CustomPromptLibrarySummary,
  PromptReferenceMention,
  ReferenceUploadPreviewItem
} from './PromptCompilerPanel';
import { motionPresets } from '@/design/motion-presets';
import { getOptimizedPromptCaseImageUrl } from '@/utils/prompt-case';
import {
  PORTRAIT_SKILL,
  PORTRAIT_SKILL_MODES
} from './skill-image-chat/constants';
import { CreationGenerateButton } from '../create-workspace/CreationGenerateButton';
import { CreationCreditEstimate } from '../create-workspace/CreationCreditEstimate';
import { PromptReferenceThumbnail } from '../create-workspace/PromptReferenceThumbnail';
import { PromptReferenceUploadSkeleton } from '../create-workspace/PromptReferenceUploadSkeleton';
import { getClipboardImageFiles } from '../create-workspace/clipboardImagePaste';
import { resizePromptTextarea } from '../create-workspace/resizePromptTextarea';
import {
  FREE_DAILY_CREDITS,
  FREE_DAILY_IMAGE_GENERATION_LIMIT
} from '@/shared/credit-policy';

export type ImageStudioConditioningMode = 'none' | 'moodboard' | 'recipe';
type StudioTool =
  | 'model'
  | 'reference'
  | 'moodboard'
  | 'recipe'
  | 'ratio'
  | 'resolution'
  | 'count'
  | 'skill'
  | 'more';

export interface ImageStudioRecipeSlot {
  id: ImagePromptSlot;
  label: string;
  group: '人物' | '穿搭' | '动作' | '场景' | '画面' | '镜头';
  optional?: boolean;
}

interface ImageStudioComposerProps {
  prompt: string;
  promptPreviewActive?: boolean;
  onPromptChange: (value: string) => void;
  settings: ImagePromptSettings;
  onSettingsChange: Dispatch<SetStateAction<ImagePromptSettings>>;
  models?: ImageCreatorModelOption[];
  conditioningMode: ImageStudioConditioningMode;
  boards: VisualMoodboard[];
  boardsLoading?: boolean;
  activeMoodboard: VisualMoodboard | null;
  onSelectMoodboard: (board: VisualMoodboard) => void;
  onClearMoodboard: () => void;
  onCreateMoodboard: () => void;
  recipeSlots: ImageStudioRecipeSlot[];
  assets: ImagePromptAsset[];
  selection: ImagePromptSelection;
  recipeOpenSignal?: number;
  requestedRecipeSlot?: ImagePromptSlot | null;
  onRandomizeRecipe: () => void;
  onRandomizeSlot: (slot: ImagePromptSlot) => void;
  onToggleRecipeAsset: (asset: ImagePromptAsset) => void;
  onRequestRecipeAssets?: (slot: ImagePromptSlot) => void;
  onPrefetchRecipeAssets?: (slot: ImagePromptSlot) => void;
  onClearRecipe: () => void;
  onApplyRecipe: () => boolean;
  referenceUploadItems: ReferenceUploadPreviewItem[];
  referenceMentions: PromptReferenceMention[];
  selectedReferenceCount: number;
  selectedCharacterCount: number;
  onMentionReference: (mention: PromptReferenceMention) => void;
  onRemoveReference: (mention: PromptReferenceMention) => void;
  onOpenReferenceUpload: () => void;
  onPasteReferenceImages: (files: File[]) => void | Promise<void>;
  onOpenHistoryReferencePicker: () => void;
  onOpenCharacterWorkflow: () => void;
  autoOptimizePrompt: boolean;
  autoOptimizePending?: boolean;
  onAutoOptimizePromptChange: (enabled: boolean) => void;
  promptLibrary: CustomPromptLibrarySummary[];
  onApplyPromptLibraryItem: (id: string) => boolean;
  onSavePrompt: () => void;
  onReset: () => void;
  onImageCountChange: (count: number) => void;
  isMember?: boolean;
  membershipLoading?: boolean;
  onRequestMembership?: (source: string) => void;
  onGenerate: () => void | Promise<void>;
  generating?: boolean;
  generationDisabled?: boolean;
  firstCreationMode?: boolean;
  estimatedCost: number;
  estimatedUnitCost: number;
  error?: string;
  statusText?: string;
  /** 技能模式（替换式）：选中官方技能后，发送按钮切换为普通按钮走 Agent 流程（静默扣积分） */
  skillActive?: boolean;
  /** 技能入口开关（生产屏蔽，本地调试开启） */
  skillEnabled?: boolean;
  activeSkillModeId?: string;
  onSkillModeChange?: (modeId: string) => void;
  onExitSkillMode?: () => void;
  onSkillGenerate?: () => void | Promise<void>;
  skillGenerating?: boolean;
}

const TOOL_LABELS: Record<StudioTool, string> = {
  model: '模型',
  reference: '引用参考',
  moodboard: '情绪板',
  recipe: '可视化配方',
  ratio: '比例',
  resolution: '分辨率',
  count: '生成张数',
  skill: '技能',
  more: '更多'
};

const IMAGE_COUNT_MEMBER_THRESHOLD = 4;
const IMAGE_COUNT_MEMBER_LABEL = '会员';
const RECIPE_EAGER_THUMBNAIL_COUNT = 9;
const RECIPE_HIGH_PRIORITY_THUMBNAIL_COUNT = 3;
const RECIPE_THUMBNAIL_WIDTH = 320;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function ImageStudioComposer({
  prompt,
  promptPreviewActive = false,
  onPromptChange,
  settings,
  onSettingsChange,
  models = fallbackModelOptions,
  conditioningMode,
  boards = [],
  boardsLoading = false,
  activeMoodboard,
  onSelectMoodboard,
  onClearMoodboard,
  onCreateMoodboard,
  recipeSlots = [],
  assets = [],
  selection,
  recipeOpenSignal = 0,
  requestedRecipeSlot = null,
  onRandomizeRecipe,
  onRandomizeSlot,
  onToggleRecipeAsset,
  onRequestRecipeAssets,
  onPrefetchRecipeAssets,
  onClearRecipe,
  onApplyRecipe,
  referenceUploadItems = [],
  referenceMentions = [],
  selectedReferenceCount,
  selectedCharacterCount,
  onMentionReference,
  onRemoveReference,
  onOpenReferenceUpload,
  onPasteReferenceImages,
  onOpenHistoryReferencePicker,
  onOpenCharacterWorkflow,
  autoOptimizePrompt,
  autoOptimizePending = false,
  onAutoOptimizePromptChange,
  promptLibrary = [],
  onApplyPromptLibraryItem,
  onSavePrompt,
  onReset,
  onImageCountChange,
  isMember = false,
  membershipLoading = false,
  onRequestMembership,
  onGenerate,
  generating = false,
  generationDisabled = false,
  firstCreationMode = false,
  estimatedCost,
  estimatedUnitCost,
  error,
  statusText,
  skillActive = false,
  skillEnabled = true,
  activeSkillModeId = '',
  onSkillModeChange,
  onExitSkillMode,
  onSkillGenerate,
  skillGenerating = false
}: ImageStudioComposerProps) {
  const prefersReducedMotion = useReducedMotion();
  const [openTool, setOpenTool] = useState<StudioTool | null>(null);
  const [pinnedTool, setPinnedTool] = useState<StudioTool | null>(null);
  const [activeRecipeSlot, setActiveRecipeSlot] = useState<ImagePromptSlot>(
    recipeSlots[0]?.id || 'character'
  );
  const [recipeApplyConfirmationOpen, setRecipeApplyConfirmationOpen] =
    useState(false);
  /** 技能浮窗两步流程：先选 skill（pick），再选写真模式（modes） */
  const [skillPickStep, setSkillPickStep] = useState<'pick' | 'modes'>('pick');
  const [submitFeedbackActive, setSubmitFeedbackActive] = useState(false);
  const [anchor, setAnchor] = useState({ left: 24, bottom: 120 });
  const panelRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!firstCreationMode || conditioningMode !== 'none') return;
    if (selectedReferenceCount > 0 || prompt.trim()) return;
    textareaRef.current?.focus({ preventScroll: true });
  }, [conditioningMode, firstCreationMode, prompt, selectedReferenceCount]);
  const closeTimerRef = useRef<number | null>(null);
  const submitFeedbackTimerRef = useRef<number | null>(null);
  const currentModel =
    models.find((model) => model.value === settings.model) || models[0];

  useEffect(() => {
    if (recipeOpenSignal <= 0) return;
    const slot = requestedRecipeSlot || recipeSlots[0]?.id || null;
    if (slot) {
      setActiveRecipeSlot(slot);
      onRequestRecipeAssets?.(slot);
    }
    const panelWidth = 760;
    setAnchor({
      left: clamp(
        Math.round((window.innerWidth - panelWidth) / 2),
        12,
        Math.max(12, window.innerWidth - panelWidth - 12)
      ),
      bottom: 112
    });
    setRecipeApplyConfirmationOpen(false);
    setOpenTool('recipe');
    setPinnedTool('recipe');
  }, [
    onRequestRecipeAssets,
    recipeOpenSignal,
    recipeSlots,
    requestedRecipeSlot
  ]);
  const availableAspectRatioOptions =
    getAspectRatioOptionsForModel(currentModel);
  const selectedRatio = settings.aspectRatio;
  const availableResolutionOptions = getImageResolutionOptionsForModel(
    currentModel,
    selectedRatio
  );
  const selectableResolutionOptions =
    currentModel?.value === 'gpt-image-2.5'
      ? imageResolutionOptions
      : availableResolutionOptions;
  const selectedResolution = getImageResolutionForImageSize(settings.imageSize);
  const activeMoodboardThumbnail =
    activeMoodboard?.coverImageUrl || activeMoodboard?.items?.[0]?.imageUrl;
  const uploadingReferenceItems = referenceUploadItems.filter(
    (item) => item.status === 'uploading'
  );

  const groupedSlots = useMemo(() => {
    return recipeSlots.reduce<Record<string, ImageStudioRecipeSlot[]>>(
      (result, slot) => {
        (result[slot.group] ||= []).push(slot);
        return result;
      },
      {}
    );
  }, [recipeSlots]);
  const activeSlot =
    recipeSlots.find((slot) => slot.id === activeRecipeSlot) || recipeSlots[0];
  const activeAssets = useMemo(
    () =>
      activeSlot ? assets.filter((asset) => asset.slot === activeSlot.id) : [],
    [activeSlot, assets]
  );
  const activeSelectedIds = activeSlot
    ? getSelectedAssetIds(selection, activeSlot.id)
    : [];
  const isProcessing = generating || submitFeedbackActive;

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    if (promptPreviewActive) {
      textarea.style.overflowY = 'hidden';
      return;
    }

    const resizeTextarea = () => {
      resizePromptTextarea(textarea, {
        minHeight: 58,
        maxHeight: 174
      });
    };

    resizeTextarea();
    window.addEventListener('resize', resizeTextarea);
    return () => window.removeEventListener('resize', resizeTextarea);
  }, [prompt, promptPreviewActive]);

  useEffect(() => {
    return () => {
      if (submitFeedbackTimerRef.current) {
        window.clearTimeout(submitFeedbackTimerRef.current);
      }
    };
  }, []);

  const handleGenerate = () => {
    if (isProcessing || generationDisabled) return;
    setSubmitFeedbackActive(true);
    if (submitFeedbackTimerRef.current) {
      window.clearTimeout(submitFeedbackTimerRef.current);
    }
    submitFeedbackTimerRef.current = window.setTimeout(() => {
      setSubmitFeedbackActive(false);
      submitFeedbackTimerRef.current = null;
    }, 720);
    void onGenerate();
  };

  const cancelClose = () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };
  const scheduleClose = () => {
    cancelClose();
    if (pinnedTool) return;
    closeTimerRef.current = window.setTimeout(() => setOpenTool(null), 150);
  };
  const openFromTrigger = (tool: StudioTool, element: HTMLElement) => {
    cancelClose();
    if (tool === 'recipe') {
      const requestedSlot = activeSlot?.id || recipeSlots[0]?.id;
      if (requestedSlot) onRequestRecipeAssets?.(requestedSlot);
    }
    const bounds = element.getBoundingClientRect();
    const panelWidth =
      tool === 'recipe'
        ? 760
        : tool === 'resolution' || tool === 'count'
          ? 300
          : 420;
    if (tool === 'skill') {
      // 每次打开技能浮窗都回到第一步：先选 skill
      setSkillPickStep('pick');
    }
    setAnchor({
      left: clamp(
        bounds.left,
        12,
        Math.max(12, window.innerWidth - panelWidth - 12)
      ),
      bottom: Math.max(96, window.innerHeight - bounds.top + 10)
    });
    setOpenTool(tool);
    if (tool === 'recipe' && !activeSlot && recipeSlots[0]) {
      setActiveRecipeSlot(recipeSlots[0].id);
    }
  };

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!openTool) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        panelRef.current?.contains(target) ||
        target.closest(`[data-studio-tool="${openTool}"]`)
      ) {
        return;
      }
      setOpenTool(null);
      setPinnedTool(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpenTool(null);
      setPinnedTool(null);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      cancelClose();
    };
  }, [openTool]);

  const toolButton = (
    tool: StudioTool,
    icon: ReactNode,
    value?: string,
    active = false,
    badge?: ReactNode,
    disabled = false
  ) => (
    <button
      key={tool}
      type="button"
      className="image-studio-tool-trigger"
      data-studio-tool={tool}
      data-active={active ? 'true' : 'false'}
      aria-label={TOOL_LABELS[tool]}
      aria-expanded={!disabled && openTool === tool}
      aria-disabled={disabled || undefined}
      title={TOOL_LABELS[tool]}
      disabled={disabled}
      onMouseEnter={(event) => {
        if (disabled) return;
        openFromTrigger(tool, event.currentTarget);
      }}
      onMouseLeave={scheduleClose}
      onFocus={(event) => {
        if (disabled) return;
        openFromTrigger(tool, event.currentTarget);
      }}
      onClick={(event) => {
        if (disabled) return;
        const nextPinned = pinnedTool === tool ? null : tool;
        setPinnedTool(nextPinned);
        if (nextPinned) openFromTrigger(tool, event.currentTarget);
        else setOpenTool(null);
      }}
    >
      {icon}
      <span>{value || TOOL_LABELS[tool]}</span>
      {badge}
    </button>
  );

  const activeSkillMode = PORTRAIT_SKILL_MODES.find(
    (mode) => mode.id === activeSkillModeId
  );
  const skillSubmitLabel = activeSkillMode
    ? `用${activeSkillMode.name}生成`
    : '用技能生成';

  const renderPanel = () => {
    if (!openTool || typeof document === 'undefined') return null;
    const style = {
      '--studio-popover-left': `${anchor.left}px`,
      '--studio-popover-bottom': `${anchor.bottom}px`
    } as CSSProperties;
    return createPortal(
      <motion.div
        key={openTool}
        ref={panelRef}
        className={`image-studio-tool-popover is-${openTool}`}
        style={style}
        role="dialog"
        aria-label={`${TOOL_LABELS[openTool]}设置`}
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
        initial={
          prefersReducedMotion
            ? { opacity: 0 }
            : { opacity: 0, y: 8, scale: 0.985 }
        }
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={
          prefersReducedMotion
            ? { duration: motionPresets.reduced.duration }
            : motionPresets.uiSpring
        }
      >
        <header className="image-studio-popover-header">
          <strong>{TOOL_LABELS[openTool]}</strong>
          <button
            type="button"
            aria-label="关闭"
            onClick={() => {
              setOpenTool(null);
              setPinnedTool(null);
            }}
          >
            <X />
          </button>
        </header>

        {openTool === 'model' && (
          <div className="image-studio-option-list is-models" role="listbox">
            {models.map((model) => (
              <button
                key={model.value}
                type="button"
                role="option"
                aria-selected={model.value === settings.model}
                disabled={model.status === 'unavailable'}
                onClick={() => {
                  onSettingsChange((current) => ({
                    ...current,
                    model: model.value,
                    ...resolveRecommendedImageSettingsForModel(
                      model,
                      current.imageSize
                    )
                  }));
                  setOpenTool(null);
                  setPinnedTool(null);
                }}
              >
                <span className="image-studio-option-icon">
                  {model.supportsReferenceImage ? <ImageIcon /> : <Sparkles />}
                </span>
                <span>
                  <strong>{model.label}</strong>
                  <small>{model.description}</small>
                </span>
                {model.value === settings.model && <Check />}
              </button>
            ))}
          </div>
        )}

        {openTool === 'reference' && (
          <div className="image-studio-reference-panel">
            <div className="image-studio-reference-summary">
              <div>
                <strong>参考图</strong>
                <small>用于保持人物、产品、风格或画面特征一致。</small>
              </div>
              <span>
                {selectedReferenceCount}/4 张
                {selectedCharacterCount > 0
                  ? ` · ${selectedCharacterCount} 个角色`
                  : ''}
              </span>
            </div>
            <div className="image-studio-reference-actions">
              <button type="button" onClick={onOpenReferenceUpload}>
                <Upload />
                <span>上传图片</span>
              </button>
              <button type="button" onClick={onOpenHistoryReferencePicker}>
                <Library />
                <span>选择历史图片</span>
              </button>
              <button type="button" onClick={onOpenCharacterWorkflow}>
                <UserRound />
                <span>选择角色</span>
              </button>
            </div>
            {referenceMentions.length > 0 && (
              <div className="image-studio-reference-strip">
                {referenceMentions.map((mention) => (
                  <PromptReferenceThumbnail
                    key={`${mention.kind}-${mention.id}`}
                    kind={mention.kind}
                    label={mention.label}
                    previewUrl={mention.previewUrl}
                    onMention={() => onMentionReference(mention)}
                    onRemove={() => onRemoveReference(mention)}
                  />
                ))}
              </div>
            )}
            {referenceUploadItems.some(
              (item) => item.status !== 'uploaded'
            ) && (
              <small>
                {referenceUploadItems.filter(
                  (item) => item.status === 'uploading'
                ).length > 0
                  ? '参考图正在上传…'
                  : '部分参考图上传失败，请重新添加。'}
              </small>
            )}
            <small>参考图可与情绪板或可视化配方共同使用。</small>
          </div>
        )}

        {openTool === 'moodboard' && (
          <div className="image-studio-board-panel">
            <div className="image-studio-board-actions">
              {activeMoodboard && (
                <button type="button" onClick={onClearMoodboard}>
                  <X /> 清除当前情绪板
                </button>
              )}
              <button type="button" onClick={onCreateMoodboard}>
                <Plus /> 新建情绪板
              </button>
            </div>
            <div className="image-studio-board-list">
              {boardsLoading ? (
                <p>正在加载情绪板…</p>
              ) : boards.length === 0 ? (
                <p>还没有可用的情绪板。</p>
              ) : (
                boards.map((board) => (
                  <button
                    key={board.id}
                    type="button"
                    data-active={
                      activeMoodboard?.id === board.id ? 'true' : 'false'
                    }
                    onClick={() => {
                      onSelectMoodboard(board);
                      setOpenTool(null);
                      setPinnedTool(null);
                    }}
                  >
                    <span className="image-studio-board-cover">
                      {board.coverImageUrl ? (
                        <img src={board.coverImageUrl} alt="" />
                      ) : (
                        <BookImage />
                      )}
                    </span>
                    <span>
                      <strong>{board.name}</strong>
                      <small>{board.itemCount} 张图片</small>
                    </span>
                    {activeMoodboard?.id === board.id ? (
                      <Check />
                    ) : (
                      <ChevronRight />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {openTool === 'recipe' && activeSlot && (
          <div className="image-studio-recipe-panel">
            <div className="image-studio-recipe-index">
              <button
                type="button"
                className="image-studio-random-recipe"
                onClick={onRandomizeRecipe}
              >
                <Dices />
                <span>
                  <strong>随机整套配方</strong>
                  <small>为全部类别挑选一组协调素材</small>
                </span>
              </button>
              {conditioningMode === 'recipe' && (
                <button
                  type="button"
                  className="image-studio-clear-recipe"
                  onClick={onClearRecipe}
                >
                  清空当前配方
                </button>
              )}
              <div className="image-studio-recipe-groups">
                {Object.entries(groupedSlots).map(([group, slots]) => (
                  <section key={group}>
                    <span>{group}</span>
                    {slots.map((slot) => {
                      const selected = getSelectedAssetIds(selection, slot.id);
                      const selectedAsset = assets.find((asset) =>
                        selected.includes(asset.id)
                      );
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          data-active={
                            activeSlot.id === slot.id ? 'true' : 'false'
                          }
                          onFocus={() => {
                            setActiveRecipeSlot(slot.id);
                            onRequestRecipeAssets?.(slot.id);
                          }}
                          onPointerEnter={(event) => {
                            if (event.pointerType !== 'touch') {
                              onPrefetchRecipeAssets?.(slot.id);
                            }
                          }}
                          onClick={() => {
                            setActiveRecipeSlot(slot.id);
                            onRequestRecipeAssets?.(slot.id);
                          }}
                        >
                          <span>
                            <strong>{slot.label}</strong>
                            <small>{selectedAsset?.title || '未选择'}</small>
                          </span>
                          <ChevronRight />
                        </button>
                      );
                    })}
                  </section>
                ))}
              </div>
            </div>
            <div className="image-studio-recipe-assets">
              <header>
                <div>
                  <span>{activeSlot.group}</span>
                  <strong>{activeSlot.label}</strong>
                </div>
                <button
                  type="button"
                  onClick={() => onRandomizeSlot(activeSlot.id)}
                >
                  <Dices /> 随机该类别
                </button>
              </header>
              {activeSelectedIds.length > 0 && (
                <div className="image-studio-recipe-selected">
                  当前选择：
                  {activeSelectedIds
                    .map((id) => assets.find((asset) => asset.id === id)?.title)
                    .filter(Boolean)
                    .join('、')}
                </div>
              )}
              <div className="image-studio-recipe-asset-grid">
                {activeAssets.map((asset, index) => (
                  <button
                    key={asset.id}
                    type="button"
                    data-active={
                      activeSelectedIds.includes(asset.id) ? 'true' : 'false'
                    }
                    onClick={() => onToggleRecipeAsset(asset)}
                  >
                    {asset.thumbnailUrl ? (
                      <img
                        src={getOptimizedPromptCaseImageUrl(
                          asset.thumbnailUrl,
                          {
                            width: RECIPE_THUMBNAIL_WIDTH,
                            quality: 72
                          }
                        )}
                        alt=""
                        loading={
                          index < RECIPE_EAGER_THUMBNAIL_COUNT
                            ? 'eager'
                            : 'lazy'
                        }
                        {...{
                          fetchpriority:
                            index < RECIPE_HIGH_PRIORITY_THUMBNAIL_COUNT
                              ? 'high'
                              : 'auto'
                        }}
                        decoding="async"
                      />
                    ) : (
                      <span className="image-studio-asset-placeholder" />
                    )}
                    <span>{asset.title}</span>
                    {activeSelectedIds.includes(asset.id) && <Check />}
                  </button>
                ))}
              </div>
            </div>
            <footer className="image-studio-recipe-applybar">
              {recipeApplyConfirmationOpen ? (
                <div className="image-studio-recipe-apply-confirmation">
                  <p role="alert">
                    当前输入框已有内容。应用配方会替换现有提示词，是否继续？
                  </p>
                  <div>
                    <button
                      type="button"
                      onClick={() => setRecipeApplyConfirmationOpen(false)}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      className="is-primary"
                      onClick={() => {
                        if (!onApplyRecipe()) return;
                        setRecipeApplyConfirmationOpen(false);
                        setOpenTool(null);
                        setPinnedTool(null);
                      }}
                    >
                      确认替换
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <small>选择会先保留为草稿，应用后才写入输入框。</small>
                  <button
                    type="button"
                    className="image-studio-apply-recipe"
                    onClick={() => {
                      if (prompt.trim()) {
                        setRecipeApplyConfirmationOpen(true);
                        return;
                      }
                      if (!onApplyRecipe()) return;
                      setOpenTool(null);
                      setPinnedTool(null);
                    }}
                  >
                    <Check /> 应用配方
                  </button>
                </>
              )}
            </footer>
          </div>
        )}

        {openTool === 'ratio' && (
          <div className="image-studio-ratio-grid">
            {availableAspectRatioOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                data-active={selectedRatio === option.value ? 'true' : 'false'}
                onClick={() => {
                  onSettingsChange((current) => {
                    // 从 Auto 切换到具体比例时，回到应用常用的 2K 分辨率，
                    // 而不是按 auto 尺寸误落到 1K。
                    const resolution =
                      current.imageSize === 'auto'
                        ? '2k'
                        : getImageResolutionForImageSize(current.imageSize);
                    return {
                      ...current,
                      aspectRatio: option.value,
                      imageSize:
                        option.value === 'auto'
                          ? 'auto'
                          : currentModel?.value === 'gpt-image-2.5'
                            ? getImageSizeForAspectRatioAndResolution(
                                option.value,
                                resolution
                              )
                            : getImageSizeForModelAspectRatioAndResolution(
                                currentModel,
                                option.value,
                                resolution
                              )
                    };
                  });
                  setOpenTool(null);
                  setPinnedTool(null);
                }}
              >
                <span
                  style={{ aspectRatio: option.value.replace(':', ' / ') }}
                />
                {option.label}
              </button>
            ))}
          </div>
        )}

        {openTool === 'resolution' && (
          <div className="image-studio-parameter-panel">
            <div
              className="image-studio-segmented"
              role="group"
              aria-label="分辨率"
            >
              {selectableResolutionOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  data-active={
                    selectedResolution === option.value ? 'true' : 'false'
                  }
                  aria-pressed={selectedResolution === option.value}
                  aria-label={`分辨率 ${option.label}`}
                  onClick={() => {
                    onSettingsChange((current) => {
                      // 比例仍为 Auto 时，选择具体分辨率会落到默认 1:1 比例并应用对应尺寸，
                      // 避免选了分辨率却不生效（仍显示自动）。
                      const aspectRatio =
                        current.aspectRatio === 'auto'
                          ? '1:1'
                          : current.aspectRatio;
                      const imageSize =
                        currentModel?.value === 'gpt-image-2.5'
                          ? getImageSizeForAspectRatioAndResolution(
                              aspectRatio,
                              option.value
                            )
                          : getImageSizeForModelAspectRatioAndResolution(
                              currentModel,
                              aspectRatio,
                              option.value
                            );
                      return {
                        ...current,
                        aspectRatio,
                        imageSize
                      };
                    });
                    setOpenTool(null);
                    setPinnedTool(null);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {openTool === 'count' && (
          <div className="image-studio-parameter-panel">
            <div
              className="image-studio-count-options"
              role="group"
              aria-label="生成张数"
            >
              {getImageCountOptionsForModel(currentModel).map((count) => {
                const memberOnly = count >= IMAGE_COUNT_MEMBER_THRESHOLD;
                return (
                  <button
                    key={count}
                    type="button"
                    data-active={
                      settings.imageCount === count ? 'true' : 'false'
                    }
                    aria-pressed={settings.imageCount === count}
                    aria-label={`生成 ${count} 张${
                      memberOnly ? '（会员专属）' : ''
                    }`}
                    onClick={() => {
                      if (memberOnly && !membershipLoading && !isMember) {
                        onRequestMembership?.('image_batch_count');
                        return;
                      }
                      onImageCountChange(count);
                      setOpenTool(null);
                      setPinnedTool(null);
                    }}
                  >
                    <span>{count}张</span>
                    {memberOnly ? (
                      <span className="image-studio-count-member-mark">
                        <Crown size={11} aria-hidden="true" />
                        {IMAGE_COUNT_MEMBER_LABEL}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {openTool === 'more' && (
          <div className="image-studio-more-panel">
            <section className="image-studio-conditioning-shortcuts">
              <span>创作参考</span>
              <div>
                <button
                  type="button"
                  data-active={
                    conditioningMode === 'moodboard' ? 'true' : 'false'
                  }
                  onClick={() => {
                    setPinnedTool('moodboard');
                    setOpenTool('moodboard');
                  }}
                >
                  <BookImage /> 情绪板
                </button>
                <button
                  type="button"
                  data-active={conditioningMode === 'recipe' ? 'true' : 'false'}
                  onClick={() => {
                    const requestedSlot = activeSlot?.id || recipeSlots[0]?.id;
                    if (requestedSlot) onRequestRecipeAssets?.(requestedSlot);
                    setPinnedTool('recipe');
                    setOpenTool('recipe');
                  }}
                >
                  <Layers3 /> 可视化配方
                </button>
              </div>
            </section>
            <label className="image-studio-auto-optimize">
              <input
                type="checkbox"
                checked={autoOptimizePrompt}
                disabled={autoOptimizePending}
                onChange={(event) =>
                  onAutoOptimizePromptChange(event.target.checked)
                }
              />
              <span>生成前自动优化提示词</span>
            </label>
            {promptLibrary.length > 0 && (
              <section className="image-studio-prompt-library">
                <span>提示词库</span>
                {promptLibrary.slice(0, 5).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (onApplyPromptLibraryItem(item.id)) {
                        setOpenTool(null);
                        setPinnedTool(null);
                      }
                    }}
                  >
                    {item.title}
                  </button>
                ))}
              </section>
            )}
            <div className="image-studio-more-actions">
              <button type="button" onClick={onSavePrompt}>
                <Save /> 保存提示词
              </button>
              <button type="button" onClick={onReset}>
                <RotateCcw /> 重置创作器
              </button>
            </div>
          </div>
        )}

        {openTool === 'skill' && (
          <div className="image-studio-skill-panel">
            {skillPickStep === 'pick' ? (
              <>
                <p className="image-studio-skill-title">选择官方技能</p>
                <div
                  className="image-studio-skill-list"
                  role="radiogroup"
                  aria-label="官方技能"
                >
                  <button
                    type="button"
                    className="image-studio-skill-card"
                    role="radio"
                    aria-checked={false}
                    onClick={() => setSkillPickStep('modes')}
                  >
                    <span className="image-studio-skill-card-name">
                      {PORTRAIT_SKILL.name}
                    </span>
                    <span className="image-studio-skill-card-desc">
                      {PORTRAIT_SKILL.description}
                    </span>
                  </button>
                </div>
                <p className="image-studio-skill-hint">
                  选中技能后，再选择本次的写真模式。
                </p>
              </>
            ) : (
              <>
                <p className="image-studio-skill-title">选择写真模式</p>
                <div
                  className="image-studio-skill-mode-list"
                  role="radiogroup"
                  aria-label="写真模式"
                >
                  {PORTRAIT_SKILL_MODES.map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      className={`image-studio-skill-mode-option${
                        activeSkillModeId === mode.id ? ' is-selected' : ''
                      }`}
                      role="radio"
                      aria-checked={activeSkillModeId === mode.id}
                      onClick={() => {
                        onSkillModeChange?.(mode.id);
                        // 选择后收起面板，避免悬浮层挡住底部生成按钮（移动端尤甚）
                        setOpenTool(null);
                        setPinnedTool(null);
                      }}
                    >
                      <span className="image-studio-skill-mode-option-name">
                        {mode.name}
                      </span>
                      <span className="image-studio-skill-mode-option-desc">
                        {mode.description}
                      </span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="image-studio-skill-back"
                  onClick={() => setSkillPickStep('pick')}
                >
                  <RotateCcw aria-hidden size={13} /> 返回重新选择技能
                </button>
              </>
            )}
            <p className="image-studio-skill-hint">
              {skillActive
                ? '已进入技能模式：官方 Agent 调用「女性写真视觉导演」完成图像创作，所需积分将在交互中静默扣除。'
                : skillPickStep === 'pick'
                  ? '选择官方技能后进入技能模式，积分将在交互中静默扣除。'
                  : '选择模式后进入技能模式：官方 Agent 调用「女性写真视觉导演」出图，积分静默扣除。'}
            </p>
            {skillActive && (
              <button
                type="button"
                className="image-studio-skill-exit"
                onClick={() => onExitSkillMode?.()}
              >
                <RotateCcw aria-hidden size={13} /> 退出技能模式
              </button>
            )}
          </div>
        )}
      </motion.div>,
      document.body
    );
  };

  return (
    <section
      className="create-studio-composer-dock image-studio-composer"
      aria-label="图像创作器"
    >
      {referenceMentions.length > 0 || uploadingReferenceItems.length > 0 ? (
        <div
          className="image-studio-prompt-references"
          aria-label="已引用的参考图"
        >
          {referenceMentions.map((mention) => (
            <PromptReferenceThumbnail
              key={`${mention.kind}-${mention.id}`}
              kind={mention.kind}
              label={mention.label}
              previewUrl={mention.previewUrl}
              onMention={() => onMentionReference(mention)}
              onRemove={() => onRemoveReference(mention)}
            />
          ))}
          {uploadingReferenceItems.map((item, index) => (
            <PromptReferenceUploadSkeleton
              key={item.clientId}
              label={`参考图 ${referenceMentions.length + index + 1}`}
            />
          ))}
        </div>
      ) : null}
      <textarea
        ref={textareaRef}
        value={prompt}
        placeholder="描述你想创作的画面…"
        aria-label="图像提示词"
        spellCheck
        onChange={(event) => onPromptChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey) return;
          if (event.nativeEvent.isComposing) return;
          event.preventDefault();
          if (skillActive) {
            if (skillGenerating) return;
            void onSkillGenerate?.();
            return;
          }
          if (generating || generationDisabled) return;
          void onGenerate();
        }}
        onPaste={(event: ClipboardEvent<HTMLTextAreaElement>) => {
          const imageFiles = getClipboardImageFiles(event.clipboardData);
          if (imageFiles.length === 0) return;
          event.preventDefault();
          void onPasteReferenceImages(imageFiles);
        }}
      />
      <div className="image-studio-composer-footer">
        <div className="image-studio-tool-row">
          {toolButton(
            'model',
            <Sparkles />,
            currentModel?.label,
            false,
            undefined,
            skillActive
          )}
          {toolButton(
            'reference',
            <ImageIcon />,
            selectedReferenceCount > 0 || selectedCharacterCount > 0
              ? `参考 ${selectedReferenceCount}`
              : undefined,
            false,
            undefined,
            false
          )}
          {toolButton(
            'moodboard',
            activeMoodboardThumbnail ? (
              <img
                className="image-studio-tool-thumbnail"
                src={activeMoodboardThumbnail}
                alt=""
                loading="eager"
                decoding="async"
              />
            ) : (
              <BookImage />
            ),
            activeMoodboard?.name || undefined,
            conditioningMode === 'moodboard',
            undefined,
            skillActive
          )}
          {toolButton(
            'recipe',
            <Layers3 />,
            conditioningMode === 'recipe' ? '配方已启用' : undefined,
            conditioningMode === 'recipe',
            undefined,
            skillActive
          )}
          {toolButton(
            'ratio',
            <Crop />,
            selectedRatio === 'auto' ? 'Auto' : selectedRatio,
            false,
            undefined,
            false
          )}
          {toolButton(
            'resolution',
            <Scan />,
            settings.aspectRatio === 'auto'
              ? '自动'
              : selectedResolution.toUpperCase(),
            false,
            undefined,
            false
          )}
          {toolButton(
            'count',
            <Images />,
            `${settings.imageCount}张`,
            false,
            settings.imageCount >= IMAGE_COUNT_MEMBER_THRESHOLD ? (
              <span className="image-studio-count-member-mark">
                <Crown size={11} aria-hidden="true" />
                {IMAGE_COUNT_MEMBER_LABEL}
              </span>
            ) : undefined,
            skillActive
          )}
          {skillEnabled &&
            toolButton(
              'skill',
              <Wand2 />,
              skillActive ? activeSkillMode?.name : undefined,
              skillActive
            )}
          {toolButton(
            'more',
            <MoreHorizontal />,
            undefined,
            false,
            undefined,
            skillActive
          )}
        </div>
        <div className="creation-submit-cluster">
          {skillActive ? (
            <button
              type="button"
              className="image-studio-generate is-skill-mode"
              disabled={skillGenerating || generationDisabled || !prompt.trim()}
              onClick={onSkillGenerate}
            >
              <Wand2 aria-hidden size={16} />
              <span>{skillGenerating ? '处理中…' : skillSubmitLabel}</span>
            </button>
          ) : (
            <CreationGenerateButton
              className="image-studio-generate"
              surfaceClassName="image-studio-generate-surface"
              label={
                isProcessing
                  ? '处理中'
                  : firstCreationMode
                    ? '生成第一张'
                    : '生成'
              }
              showLabel={firstCreationMode}
              disabled={isProcessing || generationDisabled}
              busy={isProcessing}
              creditEstimate={
                <CreationCreditEstimate
                  credits={estimatedCost}
                  unit="total"
                  embedded
                />
              }
              ariaLabel={
                isProcessing
                  ? '正在处理生成请求'
                  : estimatedCost === estimatedUnitCost
                    ? `生成，预计每张消耗 ${estimatedUnitCost} 积分`
                    : `生成，预计每张消耗 ${estimatedUnitCost} 积分，本次共 ${estimatedCost} 积分`
              }
              onClick={handleGenerate}
            />
          )}
        </div>
      </div>
      {!skillActive && firstCreationMode && !error && !statusText ? (
        <small className="is-guidance" role="note">
          免费版每日 {FREE_DAILY_CREDITS} 积分 · 最多生成{' '}
          {FREE_DAILY_IMAGE_GENERATION_LIMIT} 次
        </small>
      ) : null}
      {(error || statusText) && (
        <small
          className={error ? 'is-error' : 'is-status'}
          role={error ? 'alert' : 'status'}
        >
          {error || statusText}
        </small>
      )}
      {renderPanel()}
    </section>
  );
}
