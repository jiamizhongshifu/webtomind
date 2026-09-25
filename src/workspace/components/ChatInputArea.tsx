import React, { useEffect, useRef } from 'react';
import {
  Upload,
  Zap,
  X,
  Plus,
  Link2,
  FileText,
  Bot,
  ChevronDown,
  ChevronUp,
  Brain,
  Sparkles,
  SlidersHorizontal,
  Square,
  ArrowUp,
  Image as ImageIcon,
  Check
} from 'lucide-react';
import { Button } from '@/shared/ui/radix/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/shared/ui/radix/popover';
import { Textarea } from '@/shared/ui/radix/textarea';
import { cn } from '@/lib/utils';
import { SkillSelector } from './SkillSelector';
import { ChatSkillEntryPopover } from './ChatSkillEntryPopover';
import { ImageSettingsPanel } from './ImageSettingsPanel';
import { SlideSettingsPanel } from './SlideSettingsPanel';
import type { TFunction } from 'i18next';
import type { Skill } from '@/services/workspace-api';
import type { Shortcut } from '@/services/database';
import type { Reference } from '@/types';
import type { MatchedSkill } from '@/workspace/hooks/useSkills';
import type { SkillResolverCandidate } from '@/workspace/types/skill-resolver';
import type { PastedImagePreview } from '@/workspace/hooks/useChatAttachments';
import type { ImageSettings } from './ImageSettingsPanel';
import type { SlideSettings } from './SlideSettingsPanel';
import type { SavedSummary } from '@/services/database';

interface AgentFeature {
  id: string;
  icon: string;
}

export type ChatInputVariant = 'full' | 'projectCompact';

const SHOW_AGENT_MORE_FEATURES = false;
const SHOW_CHAT_SKILL_ENTRY = false;

export interface ChatInputAreaProps {
  isInputDragOver: boolean;
  handleInputDragOver: React.DragEventHandler;
  handleInputDragLeave: React.DragEventHandler;
  handleInputDrop: React.DragEventHandler;
  ENABLE_SKILL_FEATURE: boolean;
  matchedSkills: MatchedSkill[];
  showSkillSelector: boolean;
  selectedSkill: Skill | null;
  selectedSkillCandidate: SkillResolverCandidate | null;
  setSelectedSkill: (skill: Skill | null) => void;
  setSelectedSkillCandidate: (candidate: SkillResolverCandidate | null) => void;
  setShowSkillSelector: (show: boolean) => void;
  setMatchedSkills: (skills: MatchedSkill[]) => void;
  selectedShortcut: Shortcut | null;
  pastedImages: PastedImagePreview[];
  handleClearShortcut: () => void;
  t: TFunction<'workspace'>;
  handleRemovePastedImage: (id: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  imageMode: boolean;
  input: string;
  setInput: (input: string) => void;
  adjustTextareaHeight: () => void;
  handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement>;
  handlePaste: React.ClipboardEventHandler<HTMLTextAreaElement>;
  currentLoading: boolean;
  showPlusMenu: boolean;
  plusMenuRef: React.RefObject<HTMLDivElement>;
  setShowPlusMenu: (show: boolean) => void;
  setShowSelector: (show: boolean) => void;
  imageInputRef: React.RefObject<HTMLInputElement>;
  documentInputRef: React.RefObject<HTMLInputElement>;
  modeMenuRef: React.RefObject<HTMLDivElement>;
  showModeMenu: boolean;
  setShowModeMenu: (show: boolean) => void;
  agentMode: boolean;
  handleModeChange: (mode: 'ask' | 'agent' | 'image') => void;
  webSearchEnabled: boolean;
  setWebSearchEnabled: (enabled: boolean) => void;
  availableSkills: Skill[];
  onOpenSkills?: (tab: 'explore' | 'mine') => void;
  thinkingModeEnabled: boolean;
  setThinkingModeEnabled: (enabled: boolean) => void;
  featuresMenuRef: React.RefObject<HTMLDivElement>;
  selectedFeature: string | null;
  showFeaturesMenu: boolean;
  setShowFeaturesMenu: (show: boolean) => void;
  agentFeatures: AgentFeature[];
  getFeatureLabel: (id: string) => string;
  handleClearFeature: () => void;
  handleSelectFeature: (featureId: string) => void;
  imageSettingsRef: React.RefObject<HTMLDivElement>;
  showImageSettings: boolean;
  setShowImageSettings: (show: boolean) => void;
  imageSettings: ImageSettings;
  setImageSettings: (settings: ImageSettings) => void;
  slideSettingsRef: React.RefObject<HTMLDivElement>;
  showSlideSettings: boolean;
  setShowSlideSettings: (show: boolean) => void;
  slideSettings: SlideSettings;
  setSlideSettings: (settings: SlideSettings) => void;
  currentStatus: string | null | undefined;
  references: Reference[];
  variant?: ChatInputVariant;
  wrappedImageUpload: React.ChangeEventHandler<HTMLInputElement>;
  wrappedDocumentUpload: React.ChangeEventHandler<HTMLInputElement>;
  onAddReferences: (refs: Reference[]) => void;
  handleStopGeneration: () => void;
  handleSend: () => void;
  onCreateSkill?: (skill: {
    name: string;
    prompt: string;
    description?: string;
    referenceIds?: string[];
  }) => Promise<{ id: string }>;
  summaries?: SavedSummary[];
}

export const ChatInputArea = React.memo(function ChatInputArea(
  props: ChatInputAreaProps
) {
  const {
    isInputDragOver,
    handleInputDragOver,
    handleInputDragLeave,
    handleInputDrop,
    ENABLE_SKILL_FEATURE,
    matchedSkills,
    showSkillSelector,
    selectedSkill,
    selectedSkillCandidate,
    setSelectedSkill,
    setSelectedSkillCandidate,
    setShowSkillSelector,
    setMatchedSkills,
    selectedShortcut,
    pastedImages,
    handleClearShortcut,
    t,
    handleRemovePastedImage,
    textareaRef,
    imageMode,
    input,
    setInput,
    adjustTextareaHeight,
    handleKeyDown,
    handlePaste,
    currentLoading,
    showPlusMenu,
    plusMenuRef,
    setShowPlusMenu,
    setShowSelector,
    imageInputRef,
    documentInputRef,
    modeMenuRef,
    showModeMenu,
    setShowModeMenu,
    agentMode,
    handleModeChange,
    availableSkills,
    onOpenSkills,
    thinkingModeEnabled,
    setThinkingModeEnabled,
    featuresMenuRef,
    selectedFeature,
    showFeaturesMenu,
    setShowFeaturesMenu,
    agentFeatures,
    getFeatureLabel,
    handleClearFeature,
    handleSelectFeature,
    imageSettingsRef,
    showImageSettings,
    setShowImageSettings,
    imageSettings,
    setImageSettings,
    slideSettingsRef,
    showSlideSettings,
    setShowSlideSettings,
    slideSettings,
    setSlideSettings,
    currentStatus,
    references,
    variant = 'full',
    handleStopGeneration,
    handleSend,
    onCreateSkill,
    summaries
  } = props;
  const [showSkillEntryPopover, setShowSkillEntryPopover] =
    React.useState(false);
  const skillEntryRef = useRef<HTMLDivElement>(null);
  const isProjectCompact = variant === 'projectCompact';
  const skillUiEnabled = ENABLE_SKILL_FEATURE && SHOW_CHAT_SKILL_ENTRY;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showSkillEntryPopover &&
        skillEntryRef.current &&
        !skillEntryRef.current.contains(event.target as Node)
      ) {
        setShowSkillEntryPopover(false);
      }
    };

    if (showSkillEntryPopover) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSkillEntryPopover]);

  const skillButtonSelected = skillUiEnabled && !!selectedSkillCandidate;
  const textareaMinHeightClass = isProjectCompact
    ? 'min-h-[88px]'
    : selectedShortcut || pastedImages.length > 0
      ? 'min-h-[120px]'
      : 'min-h-[108px]';
  const canvasReferenceTags = isProjectCompact
    ? references.filter((ref) => ref.canvas).slice(0, 5)
    : [];

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showPlusMenu) setShowPlusMenu(false);
        if (showModeMenu) setShowModeMenu(false);
        if (showFeaturesMenu) setShowFeaturesMenu(false);
        if (showImageSettings) setShowImageSettings(false);
        if (showSlideSettings) setShowSlideSettings(false);
        if (showSkillEntryPopover) setShowSkillEntryPopover(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [
    showPlusMenu,
    showModeMenu,
    showFeaturesMenu,
    showImageSettings,
    showSlideSettings,
    showSkillEntryPopover,
    setShowPlusMenu,
    setShowModeMenu,
    setShowFeaturesMenu,
    setShowImageSettings,
    setShowSlideSettings
  ]);

  useEffect(() => {
    if (SHOW_AGENT_MORE_FEATURES) return;
    if (showFeaturesMenu) setShowFeaturesMenu(false);
    if (selectedFeature) handleClearFeature();
    if (showSlideSettings) setShowSlideSettings(false);
  }, [
    handleClearFeature,
    selectedFeature,
    setShowFeaturesMenu,
    setShowSlideSettings,
    showFeaturesMenu,
    showSlideSettings
  ]);

  useEffect(() => {
    if (skillUiEnabled) return;
    if (showSkillSelector) setShowSkillSelector(false);
    if (matchedSkills.length > 0) setMatchedSkills([]);
    if (selectedSkill) setSelectedSkill(null);
    if (selectedSkillCandidate) setSelectedSkillCandidate(null);
    if (showSkillEntryPopover) setShowSkillEntryPopover(false);
  }, [
    matchedSkills,
    selectedSkill,
    selectedSkillCandidate,
    setMatchedSkills,
    setSelectedSkill,
    setSelectedSkillCandidate,
    setShowSkillSelector,
    showSkillEntryPopover,
    showSkillSelector,
    skillUiEnabled
  ]);

  return (
    <>
      <footer
        data-testid="workspace-chat-input-area"
        className={`relative border-t border-slate-200 bg-white px-6 py-4 flex-shrink-0 transition-all ${
          isInputDragOver ? 'ring-2 ring-inset ring-blue-500 bg-blue-50/50' : ''
        }`}
        onDragOver={handleInputDragOver}
        onDragLeave={handleInputDragLeave}
        onDrop={handleInputDrop}
      >
        {/* 拖拽提示覆盖层 */}
        {isInputDragOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-blue-500/10 backdrop-blur-sm pointer-events-none rounded-lg">
            <div className="flex flex-col items-center gap-2 text-blue-600">
              <Upload className="w-8 h-8" />
              <span className="text-sm font-medium">释放以添加引用</span>
            </div>
          </div>
        )}
        {/* 输入框容器 */}
        <div className="relative">
          {/* Skill 选择器（显示在输入框上方） */}
          {skillUiEnabled && (
            <SkillSelector
              matchedSkills={matchedSkills}
              visible={showSkillSelector && !selectedSkill}
              onConfirm={(candidate) => {
                setSelectedSkill(candidate.skill);
                setSelectedSkillCandidate(candidate);
                setShowSkillSelector(false);
                setMatchedSkills([]);
              }}
              onDismiss={() => {
                setShowSkillSelector(false);
                setMatchedSkills([]);
              }}
            />
          )}

          {/* 输入框 + 引用/快捷指令标签 + 工具按钮 + 模式标签 + 发送按钮 */}
          <div className="relative">
            {/* 引用标签 + 快捷指令标签 + 粘贴图片标签区域 (内嵌在输入框内顶部) */}
            {(selectedShortcut ||
              pastedImages.length > 0 ||
              canvasReferenceTags.length > 0) && (
              <div className="absolute left-3 top-3 right-12 z-10 flex flex-wrap gap-1.5 max-h-[60px] overflow-y-auto bg-white pb-1">
                {canvasReferenceTags.map((ref) => (
                  <div
                    key={ref.id}
                    className="inline-flex max-w-[120px] items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-600"
                    title={ref.summaryTitle || ref.preview}
                  >
                    <span className="shrink-0 font-semibold text-slate-500">
                      {ref.canvas?.role === 'selected'
                        ? '当前'
                        : ref.canvas?.role === 'target'
                          ? '目标'
                          : ref.canvas?.role === 'upstream'
                            ? '上游'
                            : '引用'}
                    </span>
                    <span className="truncate">
                      {ref.summaryTitle || ref.preview}
                    </span>
                  </div>
                ))}
                {/* 快捷指令标签 */}
                {selectedShortcut && !isProjectCompact && (
                  <div className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-700">
                    <Zap className="w-3 h-3 flex-shrink-0" />
                    <span className="font-medium max-w-[100px] truncate">
                      {selectedShortcut.name}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={handleClearShortcut}
                      className="relative size-4 flex-shrink-0 rounded-full p-0.5 hover:bg-amber-200 after:absolute after:-inset-3 after:rounded-full after:content-['']"
                      title={t('chat.removeShortcut')}
                      aria-label={t('chat.removeShortcut')}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                )}
                {/* 粘贴/上传图片标签 */}
                {pastedImages.map((img) => (
                  <div
                    key={img.id}
                    className="inline-flex items-center gap-1 px-1 py-0.5 bg-purple-50 border border-purple-200 rounded text-[10px] text-purple-700"
                  >
                    {img.mimeType.startsWith('image/') ? (
                      <img
                        src={img.previewUrl}
                        alt={img.preview}
                        className="w-5 h-5 flex-shrink-0 rounded object-cover"
                      />
                    ) : (
                      <FileText className="w-3 h-3 flex-shrink-0" />
                    )}
                    <span className="font-medium max-w-[40px] truncate">
                      {img.preview}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemovePastedImage(img.id)}
                      className="relative size-4 flex-shrink-0 rounded-full p-0.5 hover:bg-purple-200 after:absolute after:-inset-3 after:rounded-full after:content-['']"
                      title={t('chat.removeImage')}
                      aria-label={t('chat.removeImage')}
                    >
                      <X className="w-2.5 h-2.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <Textarea
              data-testid="chat-input-textarea"
              ref={textareaRef}
              placeholder={
                selectedShortcut
                  ? t('chat.placeholderShortcut', {
                      name: selectedShortcut.name
                    })
                  : skillUiEnabled && selectedSkill
                    ? t('skillSelector.usingSkill', {
                        name: selectedSkill.displayName || selectedSkill.name
                      })
                    : imageMode
                      ? t('chat.placeholderImage')
                      : isProjectCompact
                        ? '追问素材、补充角度、修改结构...'
                        : t('chat.placeholder')
              }
              value={input}
              onChange={(e) => {
                const newValue = e.target.value;
                setInput(newValue);
                // 直接调整高度，避免 useEffect 延迟导致的卡顿
                adjustTextareaHeight();
              }}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              disabled={currentLoading}
              rows={1}
              className={cn(
                'w-full pr-12 rounded-2xl bg-white disabled:bg-slate-50 resize-none max-h-[200px] text-sm leading-relaxed overflow-y-auto text-slate-900 placeholder:text-slate-400',
                textareaMinHeightClass,
                isProjectCompact
                  ? pastedImages.length > 0 || canvasReferenceTags.length > 0
                    ? 'pt-[48px] pl-4 pb-14'
                    : 'pt-3 pl-4 pb-14'
                  : selectedShortcut || pastedImages.length > 0
                    ? 'pt-[56px] pl-4'
                    : 'pt-3 pl-4',
                isProjectCompact ? '' : 'pb-12'
              )}
            />

            {/* 加号按钮 + 模式切换 + 功能按钮（内嵌在输入框左下角） */}
            {!isProjectCompact && (
              <div className="absolute left-2 bottom-2 z-10 flex items-center gap-1 bg-white pr-2">
                {/* 加号按钮 - 下拉菜单（添加引用/上传图片/上传文档） */}
                <Popover open={showPlusMenu} onOpenChange={setShowPlusMenu}>
                  <div className="relative" ref={plusMenuRef}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9 rounded-lg text-slate-500 hover:bg-slate-100"
                        title={t('chat.addReference')}
                        aria-label="添加内容"
                      >
                        <Plus className="w-5 h-5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="top"
                      align="start"
                      sideOffset={8}
                      className="w-[220px] rounded-xl p-2"
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setShowPlusMenu(false);
                          setShowSelector(true);
                        }}
                        className="h-auto w-full justify-start gap-3 px-3 py-2.5 text-slate-700"
                      >
                        <Link2 className="w-5 h-5" />
                        <span className="flex flex-col items-start">
                          <span className="text-sm font-medium">
                            {t('chat.addReference')}
                          </span>
                          <span className="text-xs text-slate-500">
                            {t('chat.addReferenceDesc')}
                          </span>
                        </span>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => imageInputRef.current?.click()}
                        className="h-auto w-full justify-start gap-3 px-3 py-2.5 text-slate-700"
                      >
                        <Upload className="w-5 h-5" />
                        <span className="flex flex-col items-start">
                          <span className="text-sm font-medium">
                            {t('chat.uploadImage')}
                          </span>
                          <span className="text-xs text-slate-500">
                            PNG, JPG, WebP, HEIC
                          </span>
                        </span>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => documentInputRef.current?.click()}
                        className="h-auto w-full justify-start gap-3 px-3 py-2.5 text-slate-700"
                      >
                        <FileText className="w-5 h-5" />
                        <span className="flex flex-col items-start">
                          <span className="text-sm font-medium">
                            {t('chat.uploadDocument')}
                          </span>
                          <span className="text-xs text-slate-500">
                            PDF, TXT
                          </span>
                        </span>
                      </Button>
                    </PopoverContent>
                  </div>
                </Popover>

                {/* 模式切换按钮 - Agent / 图像 */}
                <Popover open={showModeMenu} onOpenChange={setShowModeMenu}>
                  <div className="relative" ref={modeMenuRef}>
                    <PopoverTrigger asChild>
                      <Button
                        data-testid="mode-toggle-button"
                        type="button"
                        variant="ghost"
                        onClick={() => setShowModeMenu(!showModeMenu)}
                        className={cn(
                          'h-8 gap-1.5 rounded-lg px-2.5 py-1.5 hover:bg-slate-100',
                          imageMode ? 'text-purple-600' : 'text-slate-600'
                        )}
                        aria-label="切换模式"
                      >
                        {imageMode ? (
                          <ImageIcon className="w-4 h-4" />
                        ) : (
                          <Bot className="w-4 h-4" />
                        )}
                        <span className="text-xs font-medium">
                          {imageMode
                            ? t('chat.features.image', '图像')
                            : 'Agent'}
                        </span>
                        <ChevronUp className="w-3 h-3" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="top"
                      align="start"
                      sideOffset={8}
                      className="w-[180px] rounded-xl p-2"
                    >
                      <Button
                        data-testid="mode-option-agent"
                        type="button"
                        variant="ghost"
                        onClick={() => handleModeChange('agent')}
                        className={cn(
                          'h-auto w-full justify-start gap-3 px-3 py-2.5',
                          !imageMode ? 'text-slate-900' : 'text-slate-600'
                        )}
                      >
                        <Bot className="w-5 h-5" />
                        <span className="text-sm font-medium">Agent</span>
                        {!imageMode && <Check className="ml-auto w-4 h-4" />}
                      </Button>
                      <Button
                        data-testid="mode-option-image"
                        type="button"
                        variant="ghost"
                        onClick={() => handleModeChange('image')}
                        className={cn(
                          'h-auto w-full justify-start gap-3 px-3 py-2.5',
                          imageMode ? 'text-slate-900' : 'text-slate-600'
                        )}
                      >
                        <ImageIcon className="w-5 h-5" />
                        <span className="text-sm font-medium">
                          {t('chat.features.image', '图像')}
                        </span>
                        {imageMode && <Check className="ml-auto w-4 h-4" />}
                      </Button>
                    </PopoverContent>
                  </div>
                </Popover>

                {/* 图像模式：参数设置按钮（显示当前分辨率和比例） */}
                {imageMode && (
                  <div className="relative" ref={imageSettingsRef}>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setShowImageSettings(!showImageSettings)}
                      className={`h-8 gap-1.5 rounded-lg px-2.5 py-1.5 ${
                        showImageSettings
                          ? 'bg-slate-200 text-slate-800'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                      title={t('chat.imageSettings', '图片设置')}
                      aria-label="图片设置"
                    >
                      <span className="text-xs font-medium">
                        {imageSettings.quality} · {imageSettings.aspectRatio}
                      </span>
                      <ChevronUp className="w-3 h-3" />
                    </Button>
                    {showImageSettings && (
                      <ImageSettingsPanel
                        settings={imageSettings}
                        onChange={setImageSettings}
                        onClose={() => setShowImageSettings(false)}
                      />
                    )}
                  </div>
                )}

                {/* Agent 模式：深度思考开关 */}
                {!imageMode && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setThinkingModeEnabled(!thinkingModeEnabled)}
                    className={`h-8 gap-1.5 rounded-lg px-2.5 py-1.5 ${
                      thinkingModeEnabled
                        ? 'bg-violet-50 text-violet-600 border border-violet-200'
                        : 'text-slate-500 hover:bg-slate-100'
                    }`}
                    title={t('chat.thinkingMode')}
                  >
                    <Brain className="w-4 h-4" />
                    <span className="text-xs font-medium">
                      {t('chat.thinkingMode')}
                    </span>
                  </Button>
                )}

                {/* Agent 模式：更多功能按钮（PPT 等） */}
                {SHOW_AGENT_MORE_FEATURES && !imageMode && (
                  <div
                    className="relative flex items-center gap-1"
                    ref={featuresMenuRef}
                  >
                    {!selectedFeature || selectedFeature === 'image' ? (
                      <button
                        data-testid="feature-toggle-button"
                        type="button"
                        onClick={() => setShowFeaturesMenu(!showFeaturesMenu)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all text-slate-500 hover:bg-slate-100"
                        title={t('chat.moreFeatures')}
                      >
                        <Sparkles className="w-4 h-4" />
                        <span className="text-xs font-medium">
                          {t('chat.moreFeatures')}
                        </span>
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <div className="flex items-center">
                        <button
                          data-testid="feature-toggle-button"
                          type="button"
                          onClick={() => setShowFeaturesMenu(!showFeaturesMenu)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-l-lg transition-all bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        >
                          <span>
                            {
                              agentFeatures.find(
                                (f) => f.id === selectedFeature
                              )?.icon
                            }
                          </span>
                          <span className="text-xs font-medium">
                            {getFeatureLabel(selectedFeature)}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={handleClearFeature}
                          title="清除当前功能"
                          aria-label="清除当前功能"
                          className="px-1.5 py-1.5 rounded-r-lg transition-colors bg-emerald-50 text-emerald-700 hover:bg-emerald-200"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}

                    {/* 功能菜单（排除 image，因为 image 已提升为顶级模式） */}
                    {showFeaturesMenu && (
                      <div className="absolute bottom-full left-0 mb-2 bg-white rounded-xl shadow-lg border border-slate-200 py-2 min-w-[200px] max-h-[320px] overflow-y-auto">
                        {agentFeatures
                          .filter((f) => f.id !== 'image')
                          .map((feature) => (
                            <button
                              data-testid={`feature-option-${feature.id}`}
                              key={feature.id}
                              type="button"
                              onClick={() => handleSelectFeature(feature.id)}
                              className={`w-full px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50 transition-colors ${
                                selectedFeature === feature.id
                                  ? 'bg-purple-50 text-purple-600'
                                  : 'text-slate-700'
                              }`}
                            >
                              <span className="text-lg">{feature.icon}</span>
                              <span className="text-sm font-medium">
                                {getFeatureLabel(feature.id)}
                              </span>
                            </button>
                          ))}
                      </div>
                    )}

                    {/* PPT 设置按钮 */}
                    {selectedFeature === 'slide_deck' && (
                      <div className="relative" ref={slideSettingsRef}>
                        <button
                          type="button"
                          onClick={() =>
                            setShowSlideSettings(!showSlideSettings)
                          }
                          className={`p-1.5 rounded-lg transition-colors ${
                            showSlideSettings
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'text-slate-500 hover:bg-slate-100'
                          }`}
                          title={t('chat.slideSettings', 'PPT 设置')}
                          aria-label="PPT 设置"
                        >
                          <SlidersHorizontal className="w-4 h-4" />
                        </button>
                        {showSlideSettings && (
                          <SlideSettingsPanel
                            settings={slideSettings}
                            onChange={setSlideSettings}
                            onClose={() => setShowSlideSettings(false)}
                          />
                        )}
                      </div>
                    )}
                  </div>
                )}

                {agentMode && !imageMode && skillUiEnabled && (
                  <div className="relative group" ref={skillEntryRef}>
                    <button
                      type="button"
                      onClick={() => {
                        setShowSkillEntryPopover(!showSkillEntryPopover);
                        setShowPlusMenu(false);
                        setShowModeMenu(false);
                        setShowFeaturesMenu(false);
                      }}
                      className={`relative flex items-center justify-center h-9 w-9 rounded-full border transition-all ${
                        skillButtonSelected
                          ? 'border-violet-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 text-violet-700 shadow-sm hover:from-violet-100 hover:to-fuchsia-100'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                      title={
                        selectedSkill
                          ? `当前技能：${selectedSkill.displayName || selectedSkill.name}`
                          : '技能入口'
                      }
                      aria-label={
                        selectedSkill
                          ? `当前技能：${selectedSkill.displayName || selectedSkill.name}`
                          : '技能入口'
                      }
                    >
                      <Sparkles className="w-4 h-4" />
                    </button>

                    {skillButtonSelected ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedSkill(null);
                          setSelectedSkillCandidate(null);
                          setShowSkillEntryPopover(false);
                        }}
                        className="absolute -top-1 -right-1 rounded-full border border-white bg-slate-900 text-white p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                        title="取消当前技能"
                        aria-label="取消当前技能"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    ) : null}

                    <ChatSkillEntryPopover
                      skills={availableSkills}
                      visible={showSkillEntryPopover}
                      selectedSkillCandidate={selectedSkillCandidate}
                      onSelectSkill={(skill) => {
                        setSelectedSkill(skill);
                        setSelectedSkillCandidate({
                          skill,
                          source: skill.source,
                          score: 0,
                          matchedTriggers: [],
                          explicit: true
                        });
                        setShowSkillEntryPopover(false);
                      }}
                      onClose={() => setShowSkillEntryPopover(false)}
                      onExploreMore={() => {
                        setShowSkillEntryPopover(false);
                        onOpenSkills?.('explore');
                      }}
                      onManageSkills={() => {
                        setShowSkillEntryPopover(false);
                        onOpenSkills?.('mine');
                      }}
                      onCreateSkill={onCreateSkill}
                      summaries={summaries}
                    />
                  </div>
                )}

                {currentStatus && !imageMode && !selectedFeature && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-xs text-emerald-700 font-medium">
                    <span className="text-[10px] opacity-70">
                      {currentStatus === 'analyzing' && t('chat.analyzing')}
                      {currentStatus === 'searching' && t('chat.searching')}
                      {currentStatus === 'executing' && t('chat.executing')}
                      {currentStatus === 'generating' && t('chat.generating')}
                    </span>
                  </span>
                )}
              </div>
            )}

            {/* projectCompact 模式：精简工具栏（模式切换 + 图片设置） */}
            {isProjectCompact && (
              <div className="absolute left-2 bottom-2 z-10 flex items-center gap-1 bg-white pr-2">
                {/* 上传图片按钮 */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => imageInputRef.current?.click()}
                  className="relative size-8 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 after:absolute after:-inset-1 after:rounded-lg after:content-['']"
                  title={t('chat.uploadImage')}
                  aria-label={t('chat.uploadImage')}
                >
                  <Plus className="w-4 h-4" />
                </Button>

                {/* 模式切换按钮 */}
                <Popover open={showModeMenu} onOpenChange={setShowModeMenu}>
                  <div className="relative" ref={modeMenuRef}>
                    <PopoverTrigger asChild>
                      <Button
                        data-testid="mode-toggle-button"
                        type="button"
                        variant="ghost"
                        onClick={() => setShowModeMenu(!showModeMenu)}
                        className={cn(
                          'h-8 gap-1.5 rounded-lg px-2 py-1.5 hover:bg-slate-100',
                          imageMode ? 'text-purple-600' : 'text-slate-600'
                        )}
                        aria-label="切换模式"
                      >
                        {imageMode ? (
                          <ImageIcon className="w-4 h-4" />
                        ) : (
                          <Bot className="w-4 h-4" />
                        )}
                        <span className="text-xs font-medium">
                          {imageMode
                            ? t('chat.features.image', '图像')
                            : 'Agent'}
                        </span>
                        <ChevronUp className="w-3 h-3" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="top"
                      align="start"
                      sideOffset={8}
                      className="w-[180px] rounded-xl p-2"
                    >
                      <Button
                        data-testid="mode-option-agent"
                        type="button"
                        variant="ghost"
                        onClick={() => handleModeChange('agent')}
                        className={cn(
                          'h-auto w-full justify-start gap-3 px-3 py-2.5',
                          !imageMode ? 'text-slate-900' : 'text-slate-600'
                        )}
                      >
                        <Bot className="w-5 h-5" />
                        <span className="text-sm font-medium">Agent</span>
                        {!imageMode && <Check className="ml-auto w-4 h-4" />}
                      </Button>
                      <Button
                        data-testid="mode-option-image"
                        type="button"
                        variant="ghost"
                        onClick={() => handleModeChange('image')}
                        className={cn(
                          'h-auto w-full justify-start gap-3 px-3 py-2.5',
                          imageMode ? 'text-slate-900' : 'text-slate-600'
                        )}
                      >
                        <ImageIcon className="w-5 h-5" />
                        <span className="text-sm font-medium">
                          {t('chat.features.image', '图像')}
                        </span>
                        {imageMode && <Check className="ml-auto w-4 h-4" />}
                      </Button>
                    </PopoverContent>
                  </div>
                </Popover>

                {/* 图像模式：参数设置 */}
                {imageMode && (
                  <div className="relative" ref={imageSettingsRef}>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setShowImageSettings(!showImageSettings)}
                      className={`h-8 gap-1.5 rounded-lg px-2 py-1.5 ${
                        showImageSettings
                          ? 'bg-slate-200 text-slate-800'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                      title={t('chat.imageSettings', '图片设置')}
                    >
                      <span className="text-xs font-medium">
                        {imageSettings.quality} · {imageSettings.aspectRatio}
                      </span>
                      <ChevronUp className="w-3 h-3" />
                    </Button>
                    {showImageSettings && (
                      <ImageSettingsPanel
                        settings={imageSettings}
                        onChange={setImageSettings}
                        onClose={() => setShowImageSettings(false)}
                      />
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 发送/终止按钮（内嵌在输入框右侧） */}
            {references.length > 0 && (
              <span
                className={`absolute text-xs text-slate-500 pointer-events-none ${
                  isProjectCompact ? 'left-4 bottom-4' : 'right-14 bottom-5'
                }`}
              >
                {references.length} 个来源
              </span>
            )}
            <Button
              data-testid="chat-send-button"
              type="button"
              variant="default"
              size="icon"
              onClick={currentLoading ? handleStopGeneration : handleSend}
              disabled={!currentLoading && !input.trim() && !selectedShortcut}
              className={`absolute right-3 bottom-3 size-8 rounded-full text-white duration-base disabled:cursor-not-allowed after:absolute after:-inset-1 after:rounded-full after:content-[''] ${
                currentLoading
                  ? 'bg-slate-900 hover:bg-slate-800'
                  : 'bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300'
              }`}
              aria-label={
                currentLoading ? t('chat.stop') : t('chat.sendShortcut')
              }
              title={currentLoading ? t('chat.stop') : t('chat.sendShortcut')}
            >
              {currentLoading ? (
                <Square className="w-3.5 h-3.5 fill-current" />
              ) : (
                <ArrowUp className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </footer>
    </>
  );
});
