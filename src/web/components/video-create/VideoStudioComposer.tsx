import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type ClipboardEvent,
  type ReactNode
} from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  Clock3,
  Crop,
  Film,
  Globe2,
  Volume2,
  VolumeX,
  Image as ImageIcon,
  Images,
  LoaderCircle,
  AudioLines,
  Video,
  Sparkles,
  Upload,
  WandSparkles,
  X
} from 'lucide-react';
import type {
  SeedanceVideoModelConfig,
  SeedanceVideoModelId,
  SeedanceVideoResolution
} from '@/shared/seedance-video-models';
import { Slider } from '@/shared/ui/radix/slider';
import { CreationGenerateButton } from '../create-workspace/CreationGenerateButton';
import { CreationCreditEstimate } from '../create-workspace/CreationCreditEstimate';
import { PromptReferenceThumbnail } from '../create-workspace/PromptReferenceThumbnail';
import { PromptReferenceUploadSkeleton } from '../create-workspace/PromptReferenceUploadSkeleton';
import { SupportErrorNotice } from '@/shared/ui';
import { getClipboardImageFiles } from '../create-workspace/clipboardImagePaste';
import { resizePromptTextarea } from '../create-workspace/resizePromptTextarea';

export type VideoStudioCreationMode = 'auto' | 'first-last-frame';
type VideoStudioTool =
  | 'model'
  | 'references'
  | 'frames'
  | 'ratio'
  | 'duration'
  | 'resolution'
  | 'audio'
  | 'quantity'
  | 'prompt';
type VideoFrameSlot = 'first' | 'last';

interface VideoStudioComposerProps {
  isEnglish: boolean;
  prompt: string;
  onPromptChange: (value: string) => void;
  model: SeedanceVideoModelConfig;
  models: SeedanceVideoModelConfig[];
  onModelChange: (modelId: SeedanceVideoModelId) => void;
  creationMode: VideoStudioCreationMode;
  referenceImageUrls: string[];
  referenceVideoUrls: string[];
  referenceAudioUrls: string[];
  referenceUploading: 'image' | 'video' | 'audio' | null;
  onOpenReferenceGallery: () => void;
  onOpenReferenceUpload: (mediaType: 'image' | 'video' | 'audio') => void;
  onPasteReferenceImages: (files: File[]) => void | Promise<void>;
  onMentionReference: (
    mediaType: 'image' | 'video' | 'audio',
    index: number
  ) => void;
  onClearReference: (
    mediaType: 'image' | 'video' | 'audio',
    index: number
  ) => void;
  firstFrameUrl: string;
  lastFrameUrl: string;
  frameUploadSlot: VideoFrameSlot | null;
  onOpenFrameGallery: (slot: VideoFrameSlot) => void;
  onOpenFrameUpload: (slot: VideoFrameSlot) => void;
  onMentionFrame: (slot: VideoFrameSlot) => void;
  onClearFrame: (slot: VideoFrameSlot) => void;
  aspectRatio: string;
  onAspectRatioChange: (value: string) => void;
  duration: number;
  onDurationChange: (value: number) => void;
  resolution: SeedanceVideoResolution;
  onResolutionChange: (value: SeedanceVideoResolution) => void;
  generateAudio: boolean;
  onGenerateAudioChange: (value: boolean) => void;
  watermark: boolean;
  onWatermarkChange: (value: boolean) => void;
  webSearch: boolean;
  onWebSearchChange: (value: boolean) => void;
  quantity: number;
  onQuantityChange: (value: number) => void;
  autoOptimize: boolean;
  onAutoOptimizeChange: (value: boolean) => void;
  optimizingPrompt: boolean;
  onOptimizePrompt: () => void;
  estimatedCost: number;
  estimatedCostPerSecond: number;
  pendingTaskCount: number;
  submitting: boolean;
  availabilityLoading: boolean;
  available: boolean;
  isAuthenticated: boolean;
  authLoading: boolean;
  error?: string;
  status?: string;
  onRandomPrompt: () => void;
  onGenerate: () => void;
  onLogin: () => void;
}

const COPY = {
  zh: {
    composer: '视频创作器',
    prompt: '视频提示词',
    placeholder: '描述你想生成的视频，包括主体、动作、运镜、光线和节奏…',
    model: '模型',
    references: '参考素材',
    frames: '首尾帧',
    ratio: '比例',
    adaptive: '智能',
    duration: '时长',
    more: '更多',
    referenceModeHint:
      '图片、视频和音频按同类顺序编号。提示词中使用“图片1 / 视频1 / 音频1”引用。',
    referenceImage: (index: number) => `图片${index + 1}`,
    referenceVideo: (index: number) => `视频${index + 1}`,
    referenceAudio: (index: number) => `音频${index + 1}`,
    referenceCount: (count: number, max: number, unit = '个') =>
      `${count}/${max} ${unit}`,
    addImage: '上传图片',
    addVideo: '上传视频',
    addAudio: '上传音频',
    imageReferences: '参考图片',
    videoReferences: '参考视频',
    audioReferences: '参考音频',
    multimodalLimit: '最多 9 张图片、3 个视频、3 个音频',
    incompatibleFrames: '严格首尾帧与多模态参考不可同时使用。',
    frameModeHint:
      '上传首帧参考图即可启用参考帧生成；尾帧可选，模型会尽量保持主体和场景连续。',
    firstFrame: '首帧',
    lastFrame: '尾帧',
    required: '必填',
    optional: '可选',
    gallery: '图库',
    upload: '上传',
    uploading: '上传中',
    clear: '清除',
    mentionImage: (label: string) => `@${label}`,
    removeImage: (label: string) => `取消${label}`,
    referencedFrames: '已引用图片',
    resolution: '分辨率',
    audio: '音频',
    audioOn: '同步音频',
    audioOff: '无声视频',
    audioUnsupported: '当前模型仅支持无声视频。',
    watermark: 'AI 水印',
    watermarkOn: '显示水印',
    watermarkOff: '无水印',
    webSearch: '联网搜索',
    webSearchHint: '联网搜索仅支持不含任何参考素材的纯文本生成。',
    quantity: '生成数量',
    promptTools: '提示词',
    optimize: '生成前自动优化提示词',
    optimizeNow: '立即优化提示词',
    optimizing: '正在优化提示词',
    random: '随机镜头提示词',
    generate: '生成',
    generating: '正在提交',
    processing: (count: number) => `${count} 个任务生成中`,
    maintenance: '通道维护中',
    checking: '检查通道',
    login: '登录后生成',
    close: '关闭设置',
    unavailable: '当前模型暂未开放'
  },
  en: {
    composer: 'Video composer',
    prompt: 'Video prompt',
    placeholder:
      'Describe the subject, action, camera movement, lighting and pacing…',
    model: 'Model',
    references: 'Reference media',
    frames: 'Frames',
    ratio: 'Ratio',
    adaptive: 'Auto',
    duration: 'Duration',
    more: 'More',
    referenceModeHint:
      'Media is numbered by type. Mention it as Image 1, Video 1 or Audio 1 in the prompt.',
    referenceImage: (index: number) => `Image ${index + 1}`,
    referenceVideo: (index: number) => `Video ${index + 1}`,
    referenceAudio: (index: number) => `Audio ${index + 1}`,
    referenceCount: (count: number, max: number, unit = 'items') =>
      `${count}/${max} ${unit}`,
    addImage: 'Upload image',
    addVideo: 'Upload video',
    addAudio: 'Upload audio',
    imageReferences: 'Reference images',
    videoReferences: 'Reference videos',
    audioReferences: 'Reference audio',
    multimodalLimit: 'Up to 9 images, 3 videos and 3 audio clips',
    incompatibleFrames:
      'Strict first/last frames cannot be mixed with multimodal references.',
    frameModeHint:
      'Upload a first-frame reference to enable frame-guided generation. The last frame is optional.',
    firstFrame: 'First frame',
    lastFrame: 'Last frame',
    required: 'Required',
    optional: 'Optional',
    gallery: 'Gallery',
    upload: 'Upload',
    uploading: 'Uploading',
    clear: 'Clear',
    mentionImage: (label: string) => `Mention ${label}`,
    removeImage: (label: string) => `Remove ${label}`,
    referencedFrames: 'Referenced images',
    resolution: 'Resolution',
    audio: 'Audio',
    audioOn: 'Synchronized audio',
    audioOff: 'Silent video',
    audioUnsupported: 'This model only supports silent video.',
    watermark: 'AI watermark',
    watermarkOn: 'Show watermark',
    watermarkOff: 'No watermark',
    webSearch: 'Web search',
    webSearchHint:
      'Web search is available only for text-only generation without reference media.',
    quantity: 'Quantity',
    promptTools: 'Prompt',
    optimize: 'Optimize prompt before generation',
    optimizeNow: 'Optimize prompt now',
    optimizing: 'Optimizing prompt',
    random: 'Use a random shot prompt',
    generate: 'Generate',
    generating: 'Submitting',
    processing: (count: number) =>
      `${count} task${count > 1 ? 's' : ''} running`,
    maintenance: 'Under maintenance',
    checking: 'Checking channel',
    login: 'Sign in to generate',
    close: 'Close settings',
    unavailable: 'This model is not available yet'
  }
} as const;

function FrameCard({
  slot,
  label,
  badge,
  value,
  uploading,
  disabled,
  copy,
  onGallery,
  onUpload,
  onClear
}: {
  slot: VideoFrameSlot;
  label: string;
  badge: string;
  value: string;
  uploading: boolean;
  disabled?: boolean;
  copy: (typeof COPY)['zh'] | (typeof COPY)['en'];
  onGallery: () => void;
  onUpload: () => void;
  onClear: () => void;
}) {
  return (
    <article
      className="video-studio-frame-card"
      data-has-frame={Boolean(value)}
    >
      <header>
        <span>{label}</span>
        <small>{badge}</small>
      </header>
      <div className="video-studio-frame-preview">
        {value ? (
          <img src={value} alt="" loading="lazy" decoding="async" />
        ) : (
          <ImageIcon aria-hidden="true" />
        )}
      </div>
      <div className="video-studio-frame-actions">
        <button type="button" onClick={onGallery} disabled={disabled}>
          <Images aria-hidden="true" />
          {copy.gallery}
        </button>
        <button
          type="button"
          onClick={onUpload}
          disabled={uploading || disabled}
        >
          {uploading ? (
            <LoaderCircle className="creator-spin-icon" aria-hidden="true" />
          ) : (
            <Upload aria-hidden="true" />
          )}
          {uploading ? copy.uploading : copy.upload}
        </button>
        {value ? (
          <button
            type="button"
            onClick={onClear}
            aria-label={`${copy.clear} ${label}`}
          >
            <X aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <span className="video-studio-frame-slot" aria-hidden="true">
        {slot === 'first' ? '01' : '02'}
      </span>
    </article>
  );
}

export function VideoStudioComposer({
  isEnglish,
  prompt,
  onPromptChange,
  model,
  models,
  onModelChange,
  creationMode,
  referenceImageUrls,
  referenceVideoUrls,
  referenceAudioUrls,
  referenceUploading,
  onOpenReferenceGallery,
  onOpenReferenceUpload,
  onPasteReferenceImages,
  onMentionReference,
  onClearReference,
  firstFrameUrl,
  lastFrameUrl,
  frameUploadSlot,
  onOpenFrameGallery,
  onOpenFrameUpload,
  onMentionFrame,
  onClearFrame,
  aspectRatio,
  onAspectRatioChange,
  duration,
  onDurationChange,
  resolution,
  onResolutionChange,
  generateAudio,
  onGenerateAudioChange,
  watermark,
  onWatermarkChange,
  webSearch,
  onWebSearchChange,
  quantity,
  onQuantityChange,
  autoOptimize,
  onAutoOptimizeChange,
  optimizingPrompt,
  onOptimizePrompt,
  estimatedCost,
  estimatedCostPerSecond,
  pendingTaskCount,
  submitting,
  availabilityLoading,
  available,
  isAuthenticated,
  authLoading,
  error,
  status,
  onRandomPrompt,
  onGenerate,
  onLogin
}: VideoStudioComposerProps) {
  const copy = isEnglish ? COPY.en : COPY.zh;
  const [openTool, setOpenTool] = useState<VideoStudioTool | null>(null);
  const [pinnedTool, setPinnedTool] = useState<VideoStudioTool | null>(null);
  const [anchor, setAnchor] = useState({ left: 24, bottom: 120 });
  const panelRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    resizePromptTextarea(textarea, {
      minHeight: 64,
      maxHeight: 198
    });
  }, [prompt]);

  const toolLabel = (tool: VideoStudioTool) => {
    if (tool === 'model') return copy.model;
    if (tool === 'references') return copy.references;
    if (tool === 'frames') return copy.frames;
    if (tool === 'ratio') return copy.ratio;
    if (tool === 'duration') return copy.duration;
    if (tool === 'resolution') return copy.resolution;
    if (tool === 'audio') return copy.audio;
    if (tool === 'quantity') return copy.quantity;
    return copy.promptTools;
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

  const openFromTrigger = (tool: VideoStudioTool, element: HTMLElement) => {
    cancelClose();
    const bounds = element.getBoundingClientRect();
    const panelWidth = tool === 'frames' ? 620 : 420;
    setAnchor({
      left: Math.min(
        Math.max(bounds.left, 12),
        Math.max(12, window.innerWidth - panelWidth - 12)
      ),
      bottom: Math.max(96, window.innerHeight - bounds.top + 10)
    });
    setOpenTool(tool);
  };

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!openTool) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        panelRef.current?.contains(target) ||
        target.closest(`[data-video-studio-tool="${openTool}"]`)
      ) {
        return;
      }
      setOpenTool(null);
      setPinnedTool(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpenTool(null);
      setPinnedTool(null);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
      cancelClose();
    };
  }, [openTool]);

  const toolButton = (
    tool: VideoStudioTool,
    icon: ReactNode,
    label: string,
    value?: string,
    active = false
  ) => (
    <button
      key={tool}
      type="button"
      className="video-studio-tool-trigger"
      data-video-studio-tool={tool}
      data-active={active ? 'true' : 'false'}
      aria-label={label}
      aria-expanded={openTool === tool}
      title={label}
      onMouseEnter={(event) => openFromTrigger(tool, event.currentTarget)}
      onMouseLeave={scheduleClose}
      onFocus={(event) => openFromTrigger(tool, event.currentTarget)}
      onClick={(event) => {
        const nextPinned = pinnedTool === tool ? null : tool;
        setPinnedTool(nextPinned);
        if (nextPinned) openFromTrigger(tool, event.currentTarget);
        else setOpenTool(null);
      }}
    >
      {icon}
      <span>{value || label}</span>
    </button>
  );

  const isBusy =
    submitting || optimizingPrompt || authLoading || availabilityLoading;
  const submitLabel = availabilityLoading
    ? copy.checking
    : !available
      ? copy.maintenance
      : !isAuthenticated
        ? copy.login
        : submitting
          ? copy.generating
          : pendingTaskCount > 0
            ? copy.processing(pendingTaskCount)
            : copy.generate;
  const referenceCount =
    referenceImageUrls.length +
    referenceVideoUrls.length +
    referenceAudioUrls.length;

  return (
    <section
      className="create-studio-composer-dock video-studio-composer"
      aria-label={copy.composer}
    >
      <label
        className="video-studio-prompt-label"
        htmlFor="video-studio-prompt"
      >
        {copy.prompt}
      </label>
      {referenceCount > 0 ||
      firstFrameUrl ||
      lastFrameUrl ||
      referenceUploading ||
      frameUploadSlot ? (
        <div
          className="video-studio-prompt-references"
          aria-label={copy.referencedFrames}
        >
          {referenceImageUrls.map((value, index) => (
            <PromptReferenceThumbnail
              key={`${value}-${index}`}
              kind={`reference-${index + 1}`}
              label={copy.referenceImage(index)}
              previewUrl={value}
              mentionLabel={copy.mentionImage(copy.referenceImage(index))}
              removeLabel={copy.removeImage(copy.referenceImage(index))}
              onMention={() => onMentionReference('image', index)}
              onRemove={() => onClearReference('image', index)}
            />
          ))}
          {referenceVideoUrls.map((value, index) => (
            <PromptReferenceThumbnail
              key={`${value}-${index}`}
              kind={`reference-video-${index + 1}`}
              label={copy.referenceVideo(index)}
              previewUrl={value}
              mediaType="video"
              mentionLabel={copy.mentionImage(copy.referenceVideo(index))}
              removeLabel={copy.removeImage(copy.referenceVideo(index))}
              onMention={() => onMentionReference('video', index)}
              onRemove={() => onClearReference('video', index)}
            />
          ))}
          {referenceAudioUrls.map((value, index) => (
            <PromptReferenceThumbnail
              key={`${value}-${index}`}
              kind={`reference-audio-${index + 1}`}
              label={copy.referenceAudio(index)}
              mediaType="audio"
              mentionLabel={copy.mentionImage(copy.referenceAudio(index))}
              removeLabel={copy.removeImage(copy.referenceAudio(index))}
              onMention={() => onMentionReference('audio', index)}
              onRemove={() => onClearReference('audio', index)}
            />
          ))}
          {firstFrameUrl ? (
            <PromptReferenceThumbnail
              kind="first"
              label={copy.firstFrame}
              previewUrl={firstFrameUrl}
              mentionLabel={copy.mentionImage(copy.firstFrame)}
              removeLabel={copy.removeImage(copy.firstFrame)}
              onMention={() => onMentionFrame('first')}
              onRemove={() => onClearFrame('first')}
            />
          ) : null}
          {lastFrameUrl ? (
            <PromptReferenceThumbnail
              kind="last"
              label={copy.lastFrame}
              previewUrl={lastFrameUrl}
              mentionLabel={copy.mentionImage(copy.lastFrame)}
              removeLabel={copy.removeImage(copy.lastFrame)}
              onMention={() => onMentionFrame('last')}
              onRemove={() => onClearFrame('last')}
            />
          ) : null}
          {referenceUploading ? (
            <PromptReferenceUploadSkeleton
              mediaType={referenceUploading}
              statusLabel={copy.uploading}
              label={
                referenceUploading === 'image'
                  ? copy.referenceImage(referenceImageUrls.length)
                  : referenceUploading === 'video'
                    ? copy.referenceVideo(referenceVideoUrls.length)
                    : copy.referenceAudio(referenceAudioUrls.length)
              }
            />
          ) : null}
          {frameUploadSlot ? (
            <PromptReferenceUploadSkeleton
              statusLabel={copy.uploading}
              label={
                frameUploadSlot === 'first' ? copy.firstFrame : copy.lastFrame
              }
            />
          ) : null}
        </div>
      ) : null}
      <textarea
        id="video-studio-prompt"
        ref={textareaRef}
        value={prompt}
        placeholder={copy.placeholder}
        spellCheck
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
          onPromptChange(event.target.value)
        }
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey) return;
          if (event.nativeEvent.isComposing) return;
          event.preventDefault();
          if (!available || isBusy) return;
          if (!isAuthenticated && !authLoading) onLogin();
          else void onGenerate();
        }}
        onPaste={(event: ClipboardEvent<HTMLTextAreaElement>) => {
          const imageFiles = getClipboardImageFiles(event.clipboardData);
          if (imageFiles.length === 0) return;
          event.preventDefault();
          void onPasteReferenceImages(imageFiles);
        }}
      />

      <div className="video-studio-composer-footer">
        <div className="video-studio-tool-row">
          {toolButton(
            'model',
            <Sparkles aria-hidden="true" />,
            copy.model,
            model.label
          )}
          {toolButton(
            'references',
            <Images aria-hidden="true" />,
            copy.references,
            referenceCount > 0
              ? `${referenceCount} ${isEnglish ? 'items' : '项'}`
              : undefined,
            referenceCount > 0
          )}
          {toolButton(
            'frames',
            <ImageIcon aria-hidden="true" />,
            copy.frames,
            firstFrameUrl ? copy.firstFrame : undefined,
            creationMode === 'first-last-frame'
          )}
          {toolButton(
            'ratio',
            <Crop aria-hidden="true" />,
            copy.ratio,
            aspectRatio === 'adaptive' ? copy.adaptive : aspectRatio
          )}
          {toolButton(
            'duration',
            <Clock3 aria-hidden="true" />,
            copy.duration,
            `${duration}s`
          )}
          {toolButton(
            'resolution',
            <Film aria-hidden="true" />,
            copy.resolution,
            resolution.toUpperCase()
          )}
          {toolButton(
            'audio',
            generateAudio ? (
              <Volume2 aria-hidden="true" />
            ) : (
              <VolumeX aria-hidden="true" />
            ),
            copy.audio,
            generateAudio ? copy.audioOn : copy.audioOff,
            generateAudio
          )}
          {toolButton(
            'quantity',
            <Images aria-hidden="true" />,
            copy.quantity,
            `${quantity}×`
          )}
          {toolButton(
            'prompt',
            <WandSparkles aria-hidden="true" />,
            copy.promptTools,
            optimizingPrompt
              ? copy.optimizing
              : autoOptimize
                ? isEnglish
                  ? 'Auto optimize'
                  : '自动优化'
                : copy.promptTools,
            autoOptimize || optimizingPrompt
          )}
        </div>
        <div className="creation-submit-cluster">
          <CreationGenerateButton
            className="video-studio-generate"
            surfaceClassName="video-studio-generate-icon"
            label={submitLabel}
            disabled={available ? isBusy : true}
            busy={isBusy}
            creditEstimate={
              <CreationCreditEstimate
                credits={estimatedCost}
                unit="total"
                locale={isEnglish ? 'en-US' : 'zh-CN'}
                embedded
              />
            }
            ariaLabel={
              isEnglish
                ? `${submitLabel} · approximately ${estimatedCostPerSecond} credits per second · ${estimatedCost} credits total`
                : `${submitLabel} · 约每秒 ${estimatedCostPerSecond} 积分 · 本次共 ${estimatedCost} 积分`
            }
            onClick={isAuthenticated || authLoading ? onGenerate : onLogin}
          />
        </div>
      </div>

      {openTool && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={panelRef}
              className={`video-studio-tool-popover is-${openTool}`}
              style={
                {
                  '--video-studio-popover-left': `${anchor.left}px`,
                  '--video-studio-popover-bottom': `${anchor.bottom}px`
                } as CSSProperties
              }
              role="dialog"
              aria-label={`${toolLabel(openTool)} ${isEnglish ? 'settings' : '设置'}`}
              onMouseEnter={cancelClose}
              onMouseLeave={scheduleClose}
            >
              <header className="video-studio-popover-header">
                <strong>{toolLabel(openTool)}</strong>
                <button
                  type="button"
                  aria-label={copy.close}
                  onClick={() => {
                    setOpenTool(null);
                    setPinnedTool(null);
                  }}
                >
                  <X aria-hidden="true" />
                </button>
              </header>

              {openTool === 'model' ? (
                <div className="video-studio-option-list" role="listbox">
                  {models.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={item.id === model.id}
                      aria-disabled={item.status === 'unavailable'}
                      disabled={item.status === 'unavailable'}
                      onClick={() => {
                        onModelChange(item.id);
                        setOpenTool(null);
                      }}
                    >
                      <span className="video-studio-option-icon">
                        <Film aria-hidden="true" />
                      </span>
                      <span>
                        <strong>{item.label}</strong>
                        <small>
                          {item.status === 'unavailable'
                            ? copy.unavailable
                            : item.description}
                        </small>
                      </span>
                      {item.id === model.id ? (
                        <Check aria-hidden="true" />
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}

              {openTool === 'references' ? (
                <div className="video-studio-references-panel">
                  <div className="video-studio-reference-summary">
                    <div>
                      <strong>{copy.references}</strong>
                      <small>{copy.referenceModeHint}</small>
                    </div>
                    <span>{copy.multimodalLimit}</span>
                  </div>
                  {creationMode === 'first-last-frame' ? (
                    <p className="video-studio-panel-note is-warning">
                      {copy.incompatibleFrames}
                    </p>
                  ) : null}
                  <section className="video-studio-reference-kind">
                    <header>
                      <span>
                        <ImageIcon aria-hidden="true" />
                        {copy.imageReferences}
                      </span>
                      <small>
                        {copy.referenceCount(
                          referenceImageUrls.length,
                          model.maxReferenceImages,
                          isEnglish ? 'images' : '张'
                        )}
                      </small>
                    </header>
                    {referenceImageUrls.length > 0 ? (
                      <div className="video-studio-reference-grid">
                        {referenceImageUrls.map((value, index) => (
                          <article key={`${value}-${index}`}>
                            <img
                              src={value}
                              alt={copy.referenceImage(index)}
                              loading="lazy"
                              decoding="async"
                            />
                            <span>{copy.referenceImage(index)}</span>
                            <button
                              type="button"
                              onClick={() => onClearReference('image', index)}
                              aria-label={copy.removeImage(
                                copy.referenceImage(index)
                              )}
                            >
                              <X aria-hidden="true" />
                            </button>
                          </article>
                        ))}
                      </div>
                    ) : null}
                    <div className="video-studio-reference-add-actions">
                      <button
                        type="button"
                        onClick={onOpenReferenceGallery}
                        disabled={
                          creationMode === 'first-last-frame' ||
                          referenceImageUrls.length >= model.maxReferenceImages
                        }
                      >
                        <Images aria-hidden="true" />
                        {copy.gallery}
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenReferenceUpload('image')}
                        disabled={
                          creationMode === 'first-last-frame' ||
                          Boolean(referenceUploading) ||
                          referenceImageUrls.length >= model.maxReferenceImages
                        }
                      >
                        {referenceUploading === 'image' ? (
                          <LoaderCircle
                            className="creator-spin-icon"
                            aria-hidden="true"
                          />
                        ) : (
                          <Upload aria-hidden="true" />
                        )}
                        {referenceUploading === 'image'
                          ? copy.uploading
                          : copy.addImage}
                      </button>
                    </div>
                  </section>
                  <section className="video-studio-reference-kind">
                    <header>
                      <span>
                        <Video aria-hidden="true" />
                        {copy.videoReferences}
                      </span>
                      <small>
                        {copy.referenceCount(
                          referenceVideoUrls.length,
                          model.maxReferenceVideos
                        )}
                      </small>
                    </header>
                    {referenceVideoUrls.length > 0 ? (
                      <div className="video-studio-reference-grid">
                        {referenceVideoUrls.map((value, index) => (
                          <article key={`${value}-${index}`}>
                            <video
                              src={value}
                              muted
                              playsInline
                              preload="metadata"
                              aria-label={copy.referenceVideo(index)}
                            />
                            <span>{copy.referenceVideo(index)}</span>
                            <button
                              type="button"
                              onClick={() => onClearReference('video', index)}
                              aria-label={copy.removeImage(
                                copy.referenceVideo(index)
                              )}
                            >
                              <X aria-hidden="true" />
                            </button>
                          </article>
                        ))}
                      </div>
                    ) : null}
                    <div className="video-studio-reference-add-actions">
                      <button
                        type="button"
                        onClick={() => onOpenReferenceUpload('video')}
                        disabled={
                          creationMode === 'first-last-frame' ||
                          Boolean(referenceUploading) ||
                          referenceVideoUrls.length >= model.maxReferenceVideos
                        }
                      >
                        {referenceUploading === 'video' ? (
                          <LoaderCircle
                            className="creator-spin-icon"
                            aria-hidden="true"
                          />
                        ) : (
                          <Upload aria-hidden="true" />
                        )}
                        {referenceUploading === 'video'
                          ? copy.uploading
                          : copy.addVideo}
                      </button>
                    </div>
                  </section>
                  <section className="video-studio-reference-kind">
                    <header>
                      <span>
                        <AudioLines aria-hidden="true" />
                        {copy.audioReferences}
                      </span>
                      <small>
                        {copy.referenceCount(
                          referenceAudioUrls.length,
                          model.maxReferenceAudios
                        )}
                      </small>
                    </header>
                    {referenceAudioUrls.length > 0 ? (
                      <div className="video-studio-reference-grid">
                        {referenceAudioUrls.map((value, index) => (
                          <article
                            key={`${value}-${index}`}
                            className="is-audio"
                          >
                            <AudioLines aria-hidden="true" />
                            <span>{copy.referenceAudio(index)}</span>
                            <button
                              type="button"
                              onClick={() => onClearReference('audio', index)}
                              aria-label={copy.removeImage(
                                copy.referenceAudio(index)
                              )}
                            >
                              <X aria-hidden="true" />
                            </button>
                          </article>
                        ))}
                      </div>
                    ) : null}
                    <div className="video-studio-reference-add-actions">
                      <button
                        type="button"
                        onClick={() => onOpenReferenceUpload('audio')}
                        disabled={
                          creationMode === 'first-last-frame' ||
                          Boolean(referenceUploading) ||
                          referenceAudioUrls.length >= model.maxReferenceAudios
                        }
                      >
                        {referenceUploading === 'audio' ? (
                          <LoaderCircle
                            className="creator-spin-icon"
                            aria-hidden="true"
                          />
                        ) : (
                          <Upload aria-hidden="true" />
                        )}
                        {referenceUploading === 'audio'
                          ? copy.uploading
                          : copy.addAudio}
                      </button>
                    </div>
                  </section>
                </div>
              ) : null}

              {openTool === 'frames' ? (
                <div className="video-studio-frames-panel">
                  <div className="video-studio-frame-grid">
                    <FrameCard
                      slot="first"
                      label={copy.firstFrame}
                      badge={copy.required}
                      value={firstFrameUrl}
                      uploading={frameUploadSlot === 'first'}
                      disabled={referenceCount > 0}
                      copy={copy}
                      onGallery={() => onOpenFrameGallery('first')}
                      onUpload={() => onOpenFrameUpload('first')}
                      onClear={() => onClearFrame('first')}
                    />
                    <FrameCard
                      slot="last"
                      label={copy.lastFrame}
                      badge={copy.optional}
                      value={lastFrameUrl}
                      uploading={frameUploadSlot === 'last'}
                      disabled={referenceCount > 0}
                      copy={copy}
                      onGallery={() => onOpenFrameGallery('last')}
                      onUpload={() => onOpenFrameUpload('last')}
                      onClear={() => onClearFrame('last')}
                    />
                  </div>
                  <p className="video-studio-panel-note">
                    {referenceCount > 0
                      ? copy.incompatibleFrames
                      : copy.frameModeHint}
                  </p>
                </div>
              ) : null}

              {openTool === 'ratio' ? (
                <div className="video-studio-ratio-grid">
                  {model.supportedAspectRatios.map((value) => (
                    <button
                      key={value}
                      type="button"
                      data-active={value === aspectRatio ? 'true' : 'false'}
                      onClick={() => {
                        onAspectRatioChange(value);
                        setOpenTool(null);
                      }}
                    >
                      {value === 'adaptive' ? (
                        <Sparkles aria-hidden="true" />
                      ) : (
                        <span
                          style={{ aspectRatio: value.replace(':', ' / ') }}
                        />
                      )}
                      {value === 'adaptive' ? copy.adaptive : value}
                    </button>
                  ))}
                </div>
              ) : null}

              {openTool === 'duration' ? (
                <div className="video-studio-duration-slider">
                  <div
                    className="video-studio-duration-value"
                    aria-live="polite"
                  >
                    <strong>{duration}</strong>
                    <span>{isEnglish ? 'seconds' : '秒'}</span>
                  </div>
                  <Slider
                    aria-label={copy.duration}
                    min={model.supportedDurations[0]}
                    max={model.supportedDurations.at(-1)}
                    step={1}
                    value={[duration]}
                    onValueChange={([value]) => {
                      if (model.supportedDurations.includes(value)) {
                        onDurationChange(value);
                      }
                    }}
                  />
                  <div
                    className="video-studio-duration-range"
                    aria-hidden="true"
                  >
                    <span>{model.supportedDurations[0]}s</span>
                    <span>{model.supportedDurations.at(-1)}s</span>
                  </div>
                </div>
              ) : null}

              {openTool === 'resolution' ? (
                <div className="video-studio-single-setting">
                  <div className="video-studio-segmented">
                    {model.supportedResolutions.map((value) => (
                      <button
                        key={value}
                        type="button"
                        data-active={value === resolution ? 'true' : 'false'}
                        onClick={() => {
                          onResolutionChange(value);
                          setOpenTool(null);
                          setPinnedTool(null);
                        }}
                      >
                        {value.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {openTool === 'audio' ? (
                <div className="video-studio-single-setting">
                  {model.supportsGenerateAudio ? (
                    <div className="video-studio-segmented">
                      {[true, false].map((value) => (
                        <button
                          key={String(value)}
                          type="button"
                          data-active={
                            value === generateAudio ? 'true' : 'false'
                          }
                          onClick={() => {
                            onGenerateAudioChange(value);
                            setOpenTool(null);
                            setPinnedTool(null);
                          }}
                        >
                          {value ? copy.audioOn : copy.audioOff}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="video-studio-panel-note">
                      {copy.audioUnsupported}
                    </p>
                  )}
                </div>
              ) : null}

              {openTool === 'quantity' ? (
                <div className="video-studio-single-setting">
                  <div className="video-studio-segmented">
                    {[1, 2].map((value) => (
                      <button
                        key={value}
                        type="button"
                        data-active={value === quantity ? 'true' : 'false'}
                        onClick={() => {
                          onQuantityChange(value);
                          setOpenTool(null);
                          setPinnedTool(null);
                        }}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {openTool === 'prompt' ? (
                <div className="video-studio-prompt-tools-panel">
                  <button
                    type="button"
                    className="video-studio-optimize-now"
                    onClick={onOptimizePrompt}
                    disabled={optimizingPrompt || !prompt.trim()}
                  >
                    {optimizingPrompt ? (
                      <LoaderCircle
                        className="creator-spin-icon"
                        aria-hidden="true"
                      />
                    ) : (
                      <WandSparkles aria-hidden="true" />
                    )}
                    {optimizingPrompt ? copy.optimizing : copy.optimizeNow}
                  </button>
                  <label className="video-studio-optimize">
                    <input
                      type="checkbox"
                      checked={autoOptimize}
                      disabled={optimizingPrompt}
                      onChange={(event) =>
                        onAutoOptimizeChange(event.target.checked)
                      }
                    />
                    <span>{copy.optimize}</span>
                  </label>
                  <label className="video-studio-optimize">
                    <input
                      type="checkbox"
                      checked={watermark}
                      onChange={(event) =>
                        onWatermarkChange(event.target.checked)
                      }
                    />
                    <span>
                      {watermark ? copy.watermarkOn : copy.watermarkOff}
                    </span>
                  </label>
                  <label
                    className="video-studio-optimize"
                    title={copy.webSearchHint}
                  >
                    <input
                      type="checkbox"
                      checked={webSearch}
                      disabled={referenceCount > 0 || Boolean(firstFrameUrl)}
                      onChange={(event) =>
                        onWebSearchChange(event.target.checked)
                      }
                    />
                    <Globe2 aria-hidden="true" />
                    <span>{copy.webSearch}</span>
                  </label>
                  <p className="video-studio-panel-note">
                    {copy.webSearchHint}
                  </p>
                  <button
                    type="button"
                    className="video-studio-random"
                    onClick={() => {
                      onRandomPrompt();
                      setOpenTool(null);
                      setPinnedTool(null);
                    }}
                  >
                    <WandSparkles aria-hidden="true" />
                    {copy.random}
                  </button>
                </div>
              ) : null}
            </div>,
            document.body
          )
        : null}

      {error ? (
        <SupportErrorNotice
          className="video-studio-message is-error"
          locale={isEnglish ? 'en-US' : 'zh-CN'}
          message={error}
        />
      ) : status ? (
        <p className="video-studio-message" role="status">
          {status}
        </p>
      ) : null}
    </section>
  );
}
