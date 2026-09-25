import { useEffect, useRef, useState } from 'react';
import {
  Brush,
  Check,
  ChevronDown,
  Clapperboard,
  Crop,
  Download,
  FolderOpen,
  ImageIcon,
  ImageOff,
  LoaderCircle,
  MessageCircle,
  MousePointer2,
  Palette,
  Plus,
  Rotate3d,
  RotateCcw,
  Scan,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  Wand2
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ImageCreatorModelOption } from '../../data/image-creator-options';
import type {
  EditorExtraReference,
  ImageAdjustments
} from './useImageEditor';
import {
  EDITOR_TOOLS,
  type CameraAngleState,
  type EditorRegion,
  type EditorToolId
} from './editor-tools';
import { ImageEditorCameraTool } from './ImageEditorCameraTool';
import { Slider } from '@/shared/ui/radix/slider';
import { ColorField } from '@/shared/ui/radix/color-field';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/shared/ui/radix/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/shared/ui/radix/tooltip';

const TOOL_ICONS: Record<EditorToolId, LucideIcon> = {
  region: Scan,
  annotate: MessageCircle,
  crop: Crop,
  adjust: SlidersHorizontal,
  lighting: Sun,
  draw: Brush,
  camera: Rotate3d,
  palette: Palette,
  enhance: Wand2,
  'background-remover': ImageOff,
  video: Clapperboard
};

const CROP_ASPECT_PRESETS = [
  '5:4',
  '4:3',
  '3:2',
  '16:9',
  '2.35:1',
  '1:1',
  '4:5',
  '3:4',
  '2:3',
  '9:16'
] as const;

const ADJUST_PARAMS = [
  { key: 'brightness', zh: '亮度', en: 'Brightness' },
  { key: 'contrast', zh: '对比度', en: 'Contrast' },
  { key: 'saturation', zh: '饱和度', en: 'Saturation' },
  { key: 'colorTemp', zh: '色温', en: 'Color Temp' }
] as const;

const DRAW_COLORS = [
  '#FF6B6B',
  '#FF8C42',
  '#FFC83D',
  '#7DCEA0',
  '#44D67F',
  '#40E0D0',
  '#5B9BF7',
  '#6C5CE7',
  '#FF5C8A',
  '#FF4C6D',
  '#D946EF',
  '#5B3DC4',
  '#7C3AED',
  '#38BDF8'
] as const;

interface ImageEditorPanelProps {
  sourceLabel: string;
  sourceThumbnailUrl: string;
  extraReferences: EditorExtraReference[];
  maxExtraReferences: number;
  onRemoveExtraReference: (id: string) => void;
  onMentionReference: (index: number) => void;
  onAddReferenceUpload: () => void;
  onAddReferenceAsset: () => void;
  isEnglish: boolean;
  prompt: string;
  onPromptChange: (value: string) => void;
  model: string;
  models: ImageCreatorModelOption[];
  onModelChange: (value: string) => void;
  busy: boolean;
  generationLabel: string;
  error: string;
  regions: EditorRegion[];
  regionMode?: 'select' | 'draw' | 'auto';
  onRegionModeChange?: (mode: 'select' | 'draw' | 'auto') => void;
  activeRegionId?: string | null;
  onSelectRegion?: (id: string | null) => void;
  activeTool: EditorToolId | null;
  onSelectTool: (toolId: EditorToolId | null) => void;
  onApplyOption: (toolId: EditorToolId, optionId: string) => void;
  cropAspect?: string | null;
  onCropAspectChange?: (aspect: string | null) => void;
  onCropReset?: () => void;
  cropPrompt?: string;
  onCropPromptChange?: (value: string) => void;
  adjustments?: ImageAdjustments;
  onAdjustmentsChange?: (values: ImageAdjustments) => void;
  onAdjustmentsDone?: () => void;
  camera?: CameraAngleState;
  onCameraChange?: (next: CameraAngleState) => void;
  brushSize?: number;
  onBrushSizeChange?: (size: number) => void;
  brushColor?: string;
  onBrushColorChange?: (color: string) => void;
  drawPrompt?: string;
  onDrawPromptChange?: (value: string) => void;
  strokeCount?: number;
  onClearStrokes?: () => void;
  onRemoveRegion: (id: string) => void;
  onUpdateRegionPrompt: (id: string, value: string) => void;
  onGenerate: () => void;
  onDownload: () => void;
  onSendToEnhance: (target: 2048 | 4096, useAi?: boolean) => void;
  enhancing?: boolean;
  onCancelEnhance?: () => void;
  onSendToBackgroundRemover: () => void;
  onTurnIntoVideo: () => void;
  estimatedCost: number;
  insufficientCredits?: boolean;
  modelsUnavailable?: boolean;
  requiresLogin: boolean;
  onRequireLogin: () => void;
}

const COPY = {
  zh: {
    title: 'AI 编辑',
    download: '下载',
    reference: '图片参考',
    referenceHint: '以原图为主参考，修改时锁定画面上下文',
    promptPlaceholder: '描述你想对图片做的修改，例如“把背景换成日落海滩”…',
    generate: '发送修改',
    login: '登录后开始编辑',
    unavailable: '模型暂不可用',
    insufficient: '积分不足，请充值',
    queued: '排队中',
    running: '生成中',
    cost: '约消耗',
    credits: '积分',
    tools: '编辑工具',
    regions: '标记区域',
    regionPromptPlaceholder: '可选：这个区域要改成什么？',
    enhanceCta: '发送至增强',
    videoCta: '转为视频',
    emptyPrompt: '输入指令或选择工具后再生成'
  },
  en: {
    title: 'AI Edit',
    download: 'Download',
    reference: 'Image reference',
    referenceHint: 'The original stays the main reference with locked context',
    promptPlaceholder:
      'Describe the change, e.g. “replace the background with a sunset beach”…',
    generate: 'Send edit',
    login: 'Sign in to edit',
    unavailable: 'Models unavailable',
    insufficient: 'Not enough credits',
    queued: 'Queued',
    running: 'Generating',
    cost: '≈',
    credits: 'credits',
    tools: 'Edit tools',
    regions: 'Marked regions',
    regionPromptPlaceholder: 'Optional: what should change in this region?',
    enhanceCta: 'Send to Enhance',
    videoCta: 'Turn into Video',
    emptyPrompt: 'Describe a change or pick a tool first'
  }
} as const;

const REFERENCE_COPY = {
  zh: {
    add: '添加参考图',
    upload: '上传',
    asset: '资产库',
    limit: (max: number) => `最多 ${max} 张参考图`,
    mention: '引用到指令'
  },
  en: {
    add: 'Reference images',
    upload: 'Upload',
    asset: 'Library',
    limit: (max: number) => `Up to ${max} references`,
    mention: 'Mention in prompt'
  }
} as const;

export function ImageEditorPanel({
  sourceLabel,
  sourceThumbnailUrl,
  extraReferences,
  maxExtraReferences,
  onRemoveExtraReference,
  onMentionReference,
  onAddReferenceUpload,
  onAddReferenceAsset,
  isEnglish,
  prompt,
  onPromptChange,
  model,
  models,
  onModelChange,
  busy,
  generationLabel,
  error,
  regions,
  regionMode = 'draw',
  onRegionModeChange,
  activeRegionId = null,
  onSelectRegion,
  activeTool,
  onSelectTool,
  onApplyOption,
  cropAspect = null,
  onCropAspectChange,
  onCropReset,
  cropPrompt = '',
  onCropPromptChange,
  adjustments = {
    brightness: 50,
    contrast: 50,
    saturation: 50,
    colorTemp: 50
  },
  onAdjustmentsChange,
  onAdjustmentsDone,
  camera = { rotate: 0, vertical: 0, zoom: 1 },
  onCameraChange,
  brushSize = 8,
  onBrushSizeChange,
  brushColor = '#FF6B6B',
  onBrushColorChange,
  drawPrompt = '',
  onDrawPromptChange,
  strokeCount = 0,
  onClearStrokes,
  onRemoveRegion,
  onUpdateRegionPrompt,
  onGenerate,
  onDownload,
  onSendToEnhance,
  enhancing = false,
  onCancelEnhance,
  onSendToBackgroundRemover,
  onTurnIntoVideo,
  estimatedCost,
  insufficientCredits = false,
  modelsUnavailable = false,
  requiresLogin,
  onRequireLogin
}: ImageEditorPanelProps) {
  const copy = isEnglish ? COPY.en : COPY.zh;
  const referenceCopy = isEnglish ? REFERENCE_COPY.en : REFERENCE_COPY.zh;
  const [expandedTool, setExpandedTool] = useState<EditorToolId | null>(null);
  const [showMoreTools, setShowMoreTools] = useState(false);
  useEffect(() => { setExpandedTool(activeTool); }, [activeTool]);
  const annotatedRegions = regions.filter((region) => region.kind === 'rect');
  const panelRef = useRef<HTMLElement | null>(null);

  const toggleTool = (toolId: EditorToolId) => {
    if (busy) return;
    if (toolId === 'background-remover') {
      onSendToBackgroundRemover();
      return;
    }
    if (toolId === 'video') {
      onTurnIntoVideo();
      return;
    }
    const nextExpanded = expandedTool === toolId ? null : toolId;
    setExpandedTool(nextExpanded);
    if (nextExpanded) onSelectTool(toolId);
    else if (activeTool === toolId) onSelectTool(null);
    if (nextExpanded) {
      window.requestAnimationFrame(() => {
        panelRef.current
          ?.querySelector(`[data-editor-tool="${toolId}"]`)
          ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    }
  };

  const handleGenerate = () => {
    if (busy || modelsUnavailable || insufficientCredits) return;
    if (requiresLogin) {
      onRequireLogin();
      return;
    }
    onGenerate();
  };

  const promptInput = (
<textarea
          value={prompt}
          placeholder={copy.promptPlaceholder}
          aria-label={copy.promptPlaceholder}
          spellCheck
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey) return;
            if (event.nativeEvent.isComposing) return;
            event.preventDefault();
            handleGenerate();
          }}
        />
  );

  return (
    <aside ref={panelRef} className="image-editor-panel" aria-label={copy.title}>
      <header className="image-editor-panel-header">
        <strong>
          <Wand2 aria-hidden="true" />
          {copy.title}
        </strong>
        <button
          type="button"
          className="image-editor-panel-download"
          onClick={onDownload}
          disabled={busy}
        >
          <Download aria-hidden="true" />
          {copy.download}
        </button>
      </header>

      <section className="image-editor-panel-reference">
        <img src={sourceThumbnailUrl} alt={sourceLabel} decoding="async" />
        <span>
          <strong>
            <ImageIcon aria-hidden="true" />
            {copy.reference}
          </strong>
          <small>{copy.referenceHint}</small>
        </span>
      </section>

      <details className="image-editor-reference-settings"><summary>{referenceCopy.add}{extraReferences.length ? ` · ${extraReferences.length}` : ''}</summary>
      {extraReferences.length > 0 ? (
        <section className="image-editor-panel-extra-references" aria-label={referenceCopy.add}>
          {extraReferences.map((reference, index) => (
            <div key={reference.id} className="image-editor-extra-reference">
              <img src={reference.displayUrl} alt={reference.label} loading="lazy" decoding="async" />
              <span>
                <strong>{reference.label}</strong>
                <small>
                  {isEnglish ? 'Image' : '图片'} {index + 2}
                </small>
              </span>
              <button
                type="button"
                className="image-editor-extra-mention"
                title={referenceCopy.mention}
                aria-label={`${referenceCopy.mention} ${index + 2}`}
                onClick={() => onMentionReference(index + 2)}
              >
                <Plus aria-hidden="true" />
              </button>
              <button
                type="button"
                className="image-editor-extra-remove"
                title={isEnglish ? 'Remove reference' : '移除参考图'}
                aria-label={isEnglish ? 'Remove reference' : '移除参考图'}
                onClick={() => onRemoveExtraReference(reference.id)}
              >
                <Trash2 aria-hidden="true" />
              </button>
            </div>
          ))}
        </section>
      ) : null}

      {extraReferences.length < maxExtraReferences ? (
        <div className="image-editor-panel-add-references">
          <span>
            <strong>{referenceCopy.add}</strong>
            <small>{referenceCopy.limit(maxExtraReferences)}</small>
          </span>
          <button type="button" onClick={onAddReferenceUpload}>
            <Upload aria-hidden="true" />
            {referenceCopy.upload}
          </button>
          <button type="button" onClick={onAddReferenceAsset}>
            <FolderOpen aria-hidden="true" />
            {referenceCopy.asset}
          </button>
        </div>
      ) : null}

      </details>
      {regions.length > 0 ? (
        <section className="image-editor-panel-regions" aria-label={copy.regions}>
          <h3>{copy.regions}</h3>
          {regions.map((region, index) => (
            <div
              key={region.id}
              className={`image-editor-panel-region${
                region.id === activeRegionId ? ' is-active' : ''
              }`}
              role="button"
              tabIndex={0}
              aria-pressed={region.id === activeRegionId}
              onClick={() => onSelectRegion?.(region.id)}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectRegion?.(region.id);
                }
              }}
            >
              <span className="image-editor-panel-region-index">{index + 1}</span>
              <textarea
                rows={2}
                value={region.prompt || ''}
                placeholder={copy.regionPromptPlaceholder}
                aria-label={`${copy.regions} ${index + 1}`}
                onChange={(event) => onUpdateRegionPrompt(region.id, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault(); event.stopPropagation(); handleGenerate();
                  }
                }}
              />
              <button
                type="button"
                aria-label={isEnglish ? 'Remove region' : '删除区域'}
                title={isEnglish ? 'Remove region' : '删除区域'}
                onClick={() => onRemoveRegion(region.id)}
              >
                <Trash2 aria-hidden="true" />
              </button>
            </div>
          ))}
        </section>
      ) : null}

      <section className="image-editor-panel-compose">
        {regions.length ? <details className="image-editor-global-instruction"><summary>{isEnglish ? 'Overall instruction (optional)' : '补充整体说明（可选）'}</summary>{promptInput}</details> : promptInput}
        <details className="image-editor-model-settings"><summary>{isEnglish ? 'Model' : '模型'} · {models.find((item) => item.value === model)?.label || model}</summary>
        <div className="image-editor-panel-model-row">
          <label htmlFor="image-editor-model">{isEnglish ? 'Model' : '模型'}</label>
          <span className="image-editor-model-select">
            <select
              id="image-editor-model"
              value={model}
              onChange={(event) => onModelChange(event.target.value)}
              disabled={busy}
            >
              {models.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden="true" />
          </span>
        </div>
        </details>
        <button
          type="button"
          className="image-editor-panel-generate"
          onClick={handleGenerate}
          disabled={busy || modelsUnavailable || insufficientCredits}
        >
          {busy ? (
            <>
              <LoaderCircle className="spin" aria-hidden="true" />
              {generationLabel || (copy.queued)}
            </>
          ) : requiresLogin ? (
            <>{copy.login}</>
          ) : modelsUnavailable ? (
            <>{copy.unavailable}</>
          ) : insufficientCredits ? (
            <>{copy.insufficient}</>
          ) : (
            <>
              <Sparkles aria-hidden="true" />
              {copy.generate}
              <em>
                {copy.cost} {estimatedCost} {copy.credits}
              </em>
            </>
          )}
        </button>
        {error ? (
          <p className="image-editor-panel-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      <nav className="image-editor-tools" aria-label={copy.tools}>
        <h3>{copy.tools}</h3>
        <ul>
          {EDITOR_TOOLS.filter((tool) => showMoreTools || ['region', 'draw', 'crop', 'enhance'].includes(tool.id) || tool.id === activeTool).map((tool) => {
            const expanded = expandedTool === tool.id;
            const isCanvasTool =
              tool.id === 'region' ||
              tool.id === 'annotate' ||
              tool.id === 'draw' ||
              tool.id === 'crop';
            const isActionTool =
              tool.id === 'video' ||
              tool.id === 'background-remover';
            return (
              <li
                key={tool.id}
                data-editor-tool={tool.id}
                className={
                  expanded || activeTool === tool.id ? 'is-expanded' : undefined
                }
              >
                <button
                  type="button"
                  className="image-editor-tool-trigger"
                  aria-expanded={expanded}
                  disabled={busy}
                  onClick={() => toggleTool(tool.id)}
                >
                  <span>
                    {(() => {
                      const ToolIcon = TOOL_ICONS[tool.id];
                      return ToolIcon ? (
                        <ToolIcon
                          aria-hidden="true"
                          className="image-editor-tool-icon"
                        />
                      ) : null;
                    })()}
                    {isEnglish ? tool.labelEn : tool.label}
                  </span>
                  <small>{isEnglish ? tool.hintEn : tool.hint}</small>
                  {isActionTool ? (
                    <em>
                      {tool.id === 'enhance'
                        ? copy.enhanceCta
                        : tool.id === 'video'
                          ? copy.videoCta
                          : isEnglish
                            ? 'Open tool'
                            : '打开工具'}
                    </em>
                  ) : (
                    <ChevronDown aria-hidden="true" />
                  )}
                </button>
                {expanded && tool.id === 'enhance' ? (
                  <div className="image-editor-enhance-options">
                    <p>{isEnglish ? 'Upscale this version here. Your original stays available.' : '直接放大当前版本，保留原图，可继续编辑。'}</p>
                    <div className="image-editor-enhance-actions">
                      <button type="button" disabled={busy} onClick={() => onSendToEnhance(2048)}>AI · 2K</button>
                      <button type="button" disabled={busy} onClick={() => onSendToEnhance(4096)}>AI · 4K</button>
                    </div>
                    <details><summary>{isEnglish ? 'Standard upscale' : '普通放大'}</summary>
                      <p>{isEnglish ? 'Resizes pixels without AI detail recovery.' : '只调整像素尺寸，不使用 AI 恢复细节。'}</p>
                      <div className="image-editor-enhance-actions">
                        <button type="button" disabled={busy} onClick={() => onSendToEnhance(2048, false)}>2K</button>
                        <button type="button" disabled={busy} onClick={() => onSendToEnhance(4096, false)}>4K</button>
                      </div>
                    </details>
                  </div>
                ) : null}
                {expanded && tool.id === 'region' ? (
                  <div className="image-editor-region-modes" role="group" aria-label={isEnglish ? 'Region tool mode' : '区域工具模式'}>
                    <button
                      type="button"
                      className={regionMode === 'select' ? 'is-selected' : undefined}
                      aria-pressed={regionMode === 'select'}
                      onClick={() => onRegionModeChange?.('select')}
                    >
                      <MousePointer2 aria-hidden="true" />
                      {isEnglish ? 'Select' : '选择'}
                    </button>
                    <button
                      type="button"
                      className={regionMode === 'draw' ? 'is-selected' : undefined}
                      aria-pressed={regionMode === 'draw'}
                      onClick={() => onRegionModeChange?.('draw')}
                    >
                      <Scan aria-hidden="true" />
                      {isEnglish ? 'Draw Region' : '绘制区域'}
                    </button>
                    <button
                      type="button"
                      className={regionMode === 'auto' ? 'is-selected' : undefined}
                      aria-pressed={regionMode === 'auto'}
                      onClick={() => onRegionModeChange?.('auto')}
                    >
                      <Wand2 aria-hidden="true" />
                      {isEnglish ? 'Auto-Mask' : '自动蒙版'}
                    </button>
                  </div>
                ) : null}
                {expanded && tool.options.length > 0 ? (
                  <div className="image-editor-tool-options">
                    {tool.options.map((option) => {
                      const optionInstruction = isEnglish
                        ? option.instructionEn
                        : option.instruction;
                      const selected =
                        activeTool === tool.id && option.id === 'crop-local'
                          ? false
                          : optionInstruction
                            ? prompt.includes(optionInstruction)
                            : false;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={selected ? 'is-selected' : undefined}
                          onClick={() => onApplyOption(tool.id, option.id)}
                        >
                          {selected ? <Check aria-hidden="true" /> : null}
                          {isEnglish ? option.labelEn : option.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                {expanded && isCanvasTool && tool.options.length === 0 ? (
                  <p className="image-editor-tool-tip">
                    {tool.id === 'draw'
                      ? isEnglish
                        ? 'Paint over the area you want to change on the canvas.'
                        : '在画布上涂抹要修改的区域。'
                      : tool.id === 'annotate'
                        ? isEnglish
                          ? 'Box each region on the canvas, then type what should change in it.'
                          : '在画布上框选每个区域，再填写该区域的修改指令。'
                        : ''}
                  </p>
                ) : null}
                {expanded && tool.id === 'draw' ? (
                  <div className="image-editor-draw-panel">
                    <label className="image-editor-draw-row">
                      <span className="image-editor-draw-label">
                        {isEnglish ? 'Brush size' : '笔刷大小'}
                      </span>
                      <output className="image-editor-draw-value">
                        {brushSize}
                      </output>
                      <Slider
                        min={1}
                        max={100}
                        step={1}
                        value={[brushSize]}
                        className="image-editor-draw-slider"
                        aria-label={
                          isEnglish ? 'Brush size' : '笔刷大小'
                        }
                        thumbAriaLabel={
                          isEnglish ? 'Brush size' : '笔刷大小'
                        }
                        onValueChange={(value) =>
                          onBrushSizeChange?.(value[0])
                        }
                      />
                    </label>
                    <div className="image-editor-draw-colors">
                      <span className="image-editor-draw-label">
                        {isEnglish ? 'Brush color' : '笔刷颜色'}
                      </span>
                      <div className="image-editor-draw-palette">
                        <TooltipProvider delayDuration={300}>
                          {DRAW_COLORS.map((color) => (
                            <Tooltip key={color}>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className={
                                    brushColor.toLowerCase() ===
                                    color.toLowerCase()
                                      ? 'is-selected'
                                      : undefined
                                  }
                                  style={{ backgroundColor: color }}
                                  aria-label={`${
                                    isEnglish ? 'Brush color' : '笔刷颜色'
                                  } ${color}`}
                                  aria-pressed={
                                    brushColor.toLowerCase() ===
                                    color.toLowerCase()
                                  }
                                  onClick={() => onBrushColorChange?.(color)}
                                />
                              </TooltipTrigger>
                              <TooltipContent side="top">{color}</TooltipContent>
                            </Tooltip>
                          ))}
                        </TooltipProvider>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="image-editor-draw-custom"
                              style={{ backgroundColor: brushColor }}
                              title={
                                isEnglish
                                  ? 'Custom color'
                                  : '自定义颜色'
                              }
                              aria-label={
                                isEnglish
                                  ? 'Custom brush color'
                                  : '自定义笔刷颜色'
                              }
                            />
                          </PopoverTrigger>
                          <PopoverContent
                            align="start"
                            side="right"
                            className="w-56 p-3"
                          >
                            <ColorField
                              value={brushColor}
                              onChange={(color) =>
                                onBrushColorChange?.(color)
                              }
                              label={
                                isEnglish
                                  ? 'Custom color'
                                  : '自定义颜色'
                              }
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                    {strokeCount > 0 ? (
                      <div className="image-editor-draw-strokes">
                        <span>
                          {isEnglish
                            ? `${strokeCount} stroke${strokeCount === 1 ? '' : 's'} on canvas`
                            : `画布上已有 ${strokeCount} 个笔触`}
                        </span>
                        <button
                          type="button"
                          className="image-editor-draw-clear"
                          onClick={onClearStrokes}
                        >
                          <Trash2 aria-hidden="true" />
                          {isEnglish ? 'Clear' : '清除'}
                        </button>
                      </div>
                    ) : null}
                    <textarea
                      className="image-editor-draw-textarea"
                      value={drawPrompt}
                      placeholder={
                        isEnglish
                          ? 'Describe what you want to draw... (optional)'
                          : '描述你想绘制的内容…（可选）'
                      }
                      aria-label={
                        isEnglish
                          ? 'Describe what you want to draw'
                          : '描述你想绘制的内容'
                      }
                      onChange={(event) =>
                        onDrawPromptChange?.(event.target.value)
                      }
                    />
                  </div>
                ) : null}
                {expanded && tool.id === 'annotate' ? (
                  <div className="image-editor-annotate-panel">
                  </div>
                ) : null}
                {expanded && tool.id === 'crop' ? (
                  <div className="image-editor-crop-presets">
                    <div className="image-editor-crop-presets-head">
                      <span className="image-editor-crop-presets-label">
                        {isEnglish ? 'Aspect ratio' : '裁剪比例'}
                      </span>
                      <button
                        type="button"
                        className="image-editor-crop-reset"
                        onClick={onCropReset}
                      >
                        <RotateCcw aria-hidden="true" />
                        {isEnglish ? 'Reset' : '重置'}
                      </button>
                    </div>
                    <div className="image-editor-crop-preset-row">
                      {CROP_ASPECT_PRESETS.slice(0, 5).map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          className={
                            cropAspect === preset ? 'is-selected' : undefined
                          }
                          onClick={() => onCropAspectChange?.(preset)}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                    <div className="image-editor-crop-preset-row">
                      {CROP_ASPECT_PRESETS.slice(5).map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          className={
                            cropAspect === preset ? 'is-selected' : undefined
                          }
                          onClick={() => onCropAspectChange?.(preset)}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                    <div className="image-editor-crop-preset-actions">
                      <button
                        type="button"
                        className={
                          cropAspect === null ? 'is-selected' : undefined
                        }
                        onClick={() => onCropAspectChange?.(null)}
                      >
                        {isEnglish ? 'Free' : '自由比例'}
                      </button>
                    </div>
                    <textarea
                      className="image-editor-crop-prompt"
                      value={cropPrompt}
                      placeholder={
                        isEnglish
                          ? 'Describe what you want to generate in the expanded area... (optional)'
                          : '描述扩展区域要生成的内容…（可选）'
                      }
                      aria-label={
                        isEnglish
                          ? 'Describe what to generate in the expanded area'
                          : '描述扩展区域要生成的内容'
                      }
                      onChange={(event) =>
                        onCropPromptChange?.(event.target.value)
                      }
                    />
                  </div>
                ) : null}
                {expanded && tool.id === 'adjust' ? (
                  <div className="image-editor-adjust-panel">
                    {ADJUST_PARAMS.map((param) => {
                      const value = adjustments[param.key];
                      const isDefault = value === 50;
                      return (
                        <label
                          key={param.key}
                          className="image-editor-adjust-row"
                        >
                          <span className="image-editor-adjust-label">
                            {isEnglish ? param.en : param.zh}
                          </span>
                          <Slider
                            min={0}
                            max={100}
                            step={1}
                            value={[value]}
                            className="image-editor-adjust-slider"
                            aria-label={isEnglish ? param.en : param.zh}
                            thumbAriaLabel={
                              isEnglish ? param.en : param.zh
                            }
                            onValueChange={(next) =>
                              onAdjustmentsChange?.({
                                ...adjustments,
                                [param.key]: next[0]
                              })
                            }
                          />
                          {param.key === 'colorTemp' ? (
                            <small className="image-editor-adjust-scale">
                              <span>
                                {isEnglish ? 'Cool' : '冷'}
                              </span>
                              <span>
                                {isEnglish ? 'Warm' : '暖'}
                              </span>
                            </small>
                          ) : null}
                          <output className="image-editor-adjust-value">
                            {value}
                          </output>
                          <button
                            type="button"
                            className="image-editor-adjust-reset"
                            disabled={isDefault}
                            aria-label={`${isEnglish ? 'Reset' : '重置'} ${
                              isEnglish ? param.en : param.zh
                            }`}
                            onClick={() =>
                              onAdjustmentsChange?.({
                                ...adjustments,
                                [param.key]: 50
                              })
                            }
                          >
                            <RotateCcw aria-hidden="true" />
                          </button>
                        </label>
                      );
                    })}
                    <button
                      type="button"
                      className="image-editor-adjust-done"
                      onClick={() => {
                        onAdjustmentsDone?.();
                        setExpandedTool(null);
                      }}
                    >
                      <Check aria-hidden="true" />
                      {isEnglish ? 'Done' : '完成'}
                    </button>
                  </div>
                ) : null}
                {expanded && tool.id === 'camera' ? (
                  <ImageEditorCameraTool
                    isEnglish={isEnglish}
                    camera={camera}
                    onChange={onCameraChange || (() => undefined)}
                    onGenerate={handleGenerate}
                    thumbnailUrl={sourceThumbnailUrl}
                    busy={busy}
                  />
                ) : null}
                {expanded &&
                  tool.id === 'crop' &&
                  annotatedRegions.length === 0 ? (
                  <p className="image-editor-tool-tip">
                    {isEnglish
                      ? 'Pick a ratio (or Box & crop) and the canvas shows a crop frame — drag the handles to fine-tune, then Apply crop.'
                      : '选择比例（或「框选裁剪」）后画布会自动展示裁剪框，拖动手柄微调后点击「应用裁剪」。'}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
        <button className="image-editor-more-tools" type="button" aria-expanded={showMoreTools} onClick={() => setShowMoreTools((value) => !value)}>{showMoreTools ? (isEnglish ? 'Fewer tools' : '收起工具') : (isEnglish ? 'More tools' : '更多工具')}</button>
      </nav>

      {enhancing ? <button className="image-editor-more-tools" type="button" onClick={onCancelEnhance}>{isEnglish ? 'Cancel upscale' : '取消放大'}</button> : null}
    </aside>
  );
}
