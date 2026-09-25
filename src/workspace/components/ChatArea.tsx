import { createLogger } from '@/utils/logger';
import type { SavedSummary, Shortcut } from '@/services/database';
import type { Reference } from '@/types';

const log = createLogger('ChatArea');
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTranslation } from 'react-i18next';
import { isExtensionEnv } from '@/utils/env';
import { escapeHtml } from '@/utils/image-utils';
import type { BatchImageBlock } from '@/types/unified-chat';

import {
  Bot,
  History,
  MessageSquarePlus,
  PanelRightClose,
  Sparkles
} from 'lucide-react';
import { ReferenceSelector } from './ReferenceSelector';
import { ConversationHistory } from './ConversationHistory';
import { VirtualMessageList } from './VirtualMessageList';
import { SkillConfirmDialog } from './SkillSelector';
import { SkillCreateConfirmDialog } from './SkillCreateConfirmDialog';
import {
  SummaryConfirmDialog,
  type SummaryConfirmType,
  type SummaryConfirmDialogProps
} from './SummaryConfirmDialog';
import { ErrorBoundary } from './ErrorBoundary';
import { imageSettingsToPromptSuffix } from './ImageSettingsPanel';
import { slideSettingsToPromptSuffix } from './SlideSettingsPanel';
import { useChatSend } from '../hooks/useChatSend';
import { useUnifiedChat } from '../hooks/useUnifiedChat';
import { useSkills } from '../hooks/useSkills';
import { useChatError } from '../hooks/useChatError';
import {
  confirmToolCall,
  batchImageExecuteStream,
  type BatchExecuteTask
} from '@/services/agent-api';
import { CreditsWarning } from './CreditsWarning';
import { ChatErrorToast } from './ChatErrorToast';
import { BatchImageConfirmDialog } from './BatchImageConfirmDialog';
import { QuotaExceededError } from '@/services/credits-api';
import { resolveNoteTitle } from '../utils/note-title';
import {
  saveSummary,
  getAccessToken as getWorkspaceAccessToken,
  type Skill
} from '@/services/workspace-api';
import { uploadDataUrlImage } from '@/services/image-storage';
import type {
  UnifiedMessage,
  ImageBlock,
  ToolCallBlock,
  UnifiedContentBlock
} from '@/types/unified-chat';
import type { SearchResultBatchItem } from '@/types/content-blocks';

import { useChatAttachments } from '../hooks/useChatAttachments';
import { useChatSkills } from '../hooks/useChatSkills';
import { useClickOutsideClose } from '../hooks/useClickOutsideClose';
import { useRetryMessage } from '../hooks/useRetryMessage';
import {
  extractImagesFromReferences,
  compressPastedImages,
  findLatestAssistantImage
} from '../utils/image-extraction';

// 统一消息类型（新架构）
type CombinedMessage = UnifiedMessage;

import { useChatHistory } from '../hooks/useChatHistory';
import { ConnectedChatInputArea } from './ConnectedChatInputArea';
import { useChatUIStore } from '../store/chatUIStore';

import {
  getMessageText,
  isLikelyImageEditRequest
} from '../utils/chat-helpers';
import {
  applySmartChatChunkToBlocks,
  type SmartChatChunkPayload
} from '../utils/agent-stream';

const ENABLE_SKILL_FEATURE = true;

interface ChatAreaProps {
  selectedSummary: SavedSummary | null;
  references: Reference[];
  summaries: SavedSummary[];
  shortcuts: Shortcut[];
  variant?: 'default' | 'projectWorkspace';
  pendingSkill?: Skill | null;
  onConsumePendingSkill?: () => void;
  onAddReferences: (refs: Reference[]) => void;
  onRemoveReference: (refId: string) => void;
  onReferenceClick?: (summaryId: string) => void; // 点击引用标签跳转
  onOpenSkills?: (tab: 'explore' | 'mine') => void;
  onCreateSkill?: (skill: {
    name: string;
    prompt: string;
    description?: string;
    referenceIds?: string[];
  }) => Promise<{ id: string }>;
  onRefreshSummaries?: () => void; // 刷新总结列表
  onAddPendingSummary?: (summary: SavedSummary) => string; // 添加骨架卡片，返回临时 ID
  onUpdatePendingSummary?: (
    tempId: string,
    realId: string,
    summary: SavedSummary
  ) => void; // 更新骨架为真实卡片
  onRemovePendingSummary?: (tempId: string) => void; // 移除骨架卡片（保存失败时）
  onSaveToStudioNote?: (payload: {
    title: string;
    markdown: string;
  }) => Promise<void> | void;
  onSaveGeneratedImageToCanvas?: (payload: {
    imageUrl: string;
    mimeType?: string;
    summaryId: string;
    title: string;
    targetHolderId?: string;
    messageId?: string;
  }) => void;
  onShowPricing?: () => void;
  currentProjectId?: string | null;
  onCollapsePanel?: () => void;
  isAuthReady?: boolean;
}

export function ChatArea({
  selectedSummary: _selectedSummary, // 保留 prop 但标记为未使用（对话独立，不依赖总结切换）
  references,
  summaries,
  shortcuts,
  variant = 'default',
  pendingSkill,
  onConsumePendingSkill,
  onAddReferences,
  onRemoveReference,
  onReferenceClick,
  onOpenSkills,
  onCreateSkill,
  onRefreshSummaries: _onRefreshSummaries,
  onAddPendingSummary,
  onUpdatePendingSummary,
  onRemovePendingSummary,
  onSaveToStudioNote,
  onSaveGeneratedImageToCanvas,
  onShowPricing,
  currentProjectId,
  onCollapsePanel,
  isAuthReady = true
}: ChatAreaProps) {
  const { t } = useTranslation('workspace');
  const isProjectWorkspace = variant === 'projectWorkspace';
  const activeCanvasImageHolder = React.useMemo(
    () =>
      references.find(
        (ref) =>
          ref.canvas?.customNodeType === 'ai_image_holder' &&
          (ref.canvas.role === 'target' || ref.canvas.role === 'selected')
      ) ||
      references.find(
        (ref) => ref.canvas?.customNodeType === 'ai_image_holder'
      ),
    [references]
  );
  const canvasContextItems = React.useMemo(
    () =>
      references
        .filter((ref) => ref.canvas)
        .map((ref) => ({
          id: ref.id,
          summaryId: ref.summaryId,
          label:
            ref.canvas?.role === 'selected'
              ? '当前'
              : ref.canvas?.role === 'upstream'
                ? '上游'
                : ref.canvas?.role === 'target'
                  ? '目标'
                  : '引用',
          title: ref.summaryTitle || ref.preview,
          role: ref.canvas?.role || 'active'
        })),
    [references]
  );

  const getFeatureLabel = useCallback(
    (featureId: string): string => {
      switch (featureId) {
        case 'image':
          return t('chat.features.image');
        case 'slide_deck':
          return t('chat.features.slide_deck');
        case 'flashcards':
          return t('chat.features.flashcards');
        case 'mindmap':
          return t('chat.features.mindmap');
        case 'quiz':
          return t('chat.features.quiz');
        case 'report':
          return t('chat.features.report');
        case 'summary':
          return t('chat.features.summary');
        case 'audio':
          return t('chat.features.audio');
        case 'video':
          return t('chat.features.video');
        case 'infographic':
          return t('chat.features.infographic');
        case 'data_table':
          return t('chat.features.data_table');
        default:
          return featureId;
      }
    },
    [t]
  );

  // 使用统一聊天 Hook
  const {
    messages: unifiedMessages,
    isLoading: unifiedLoading,
    currentStatus,
    mode: chatMode,
    sessionId,
    sendMessage: sendUnifiedMessage,
    setMode: setChatMode,
    setMessages: setUnifiedMessages,
    updateMessage,
    resetSession,
    stopGeneration
  } = useUnifiedChat({
    defaultMode: 'agent',
    provider: 'auto'
  });

  // 使用统一错误处理 Hook
  const { error: chatError, clearError: clearChatError } = useChatError();

  // 使用 Skills Hook
  const { skills: availableSkills, refresh } = useSkills({
    enabled: ENABLE_SKILL_FEATURE
  });

  const {
    setInput,
    imageMode,
    setImageMode,
    imageSettings,
    setImageSettings,
    showImageSettings,
    setShowImageSettings,
    slideSettings,
    setSlideSettings,
    showSlideSettings,
    setShowSlideSettings,
    showModeMenu,
    setShowModeMenu,
    showFeaturesMenu,
    setShowFeaturesMenu,
    selectedFeature,
    setSelectedFeature,
    webSearchEnabled,
    setWebSearchEnabled,
    thinkingModeEnabled,
    setThinkingModeEnabled,
    showSelector,
    setShowSelector,
    showPlusMenu,
    setShowPlusMenu,
    selectedShortcut,
    setSelectedShortcut,
    isRetrying,
    setIsRetrying,
    isBatchGenerating,
    setIsBatchGenerating
  } = useChatUIStore(
    useShallow((state) => ({
      setInput: state.setInput,
      imageMode: state.imageMode,
      setImageMode: state.setImageMode,
      imageSettings: state.imageSettings,
      setImageSettings: state.setImageSettings,
      showImageSettings: state.showImageSettings,
      setShowImageSettings: state.setShowImageSettings,
      slideSettings: state.slideSettings,
      setSlideSettings: state.setSlideSettings,
      showSlideSettings: state.showSlideSettings,
      setShowSlideSettings: state.setShowSlideSettings,
      showModeMenu: state.showModeMenu,
      setShowModeMenu: state.setShowModeMenu,
      showFeaturesMenu: state.showFeaturesMenu,
      setShowFeaturesMenu: state.setShowFeaturesMenu,
      selectedFeature: state.selectedFeature,
      setSelectedFeature: state.setSelectedFeature,
      webSearchEnabled: state.webSearchEnabled,
      setWebSearchEnabled: state.setWebSearchEnabled,
      thinkingModeEnabled: state.thinkingModeEnabled,
      setThinkingModeEnabled: state.setThinkingModeEnabled,
      showSelector: state.showSelector,
      setShowSelector: state.setShowSelector,
      showPlusMenu: state.showPlusMenu,
      setShowPlusMenu: state.setShowPlusMenu,
      selectedShortcut: state.selectedShortcut,
      setSelectedShortcut: state.setSelectedShortcut,
      isRetrying: state.isRetrying,
      setIsRetrying: state.setIsRetrying,
      isBatchGenerating: state.isBatchGenerating,
      setIsBatchGenerating: state.setIsBatchGenerating
    }))
  );

  const getInput = useCallback(() => useChatUIStore.getState().input, []);

  // Summary 确认相关状态
  const [summaryConfirmType, setSummaryConfirmType] =
    useState<SummaryConfirmType | null>(null);
  const [summaryConfirmData, setSummaryConfirmData] = useState<
    SummaryConfirmDialogProps['data'] | null
  >(null);
  const [summaryConfirmLoading, setSummaryConfirmLoading] = useState(false);

  const {
    pastedImages,
    pastedImagesRef,
    pendingImageReadsRef,
    isInputDragOver,
    clearAttachments,
    handlePaste,
    handleRemovePastedImage,
    handleImageUpload,
    handleDocumentUpload,
    handleInputDragOver,
    handleInputDragLeave,
    handleInputDrop
  } = useChatAttachments();
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null); // Toast 提示

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modeMenuRef = useRef<HTMLDivElement>(null); // 模式菜单 ref
  const featuresMenuRef = useRef<HTMLDivElement>(null); // 功能菜单 ref
  const imageSettingsRef = useRef<HTMLDivElement>(null); // 图片设置面板 ref
  const slideSettingsRef = useRef<HTMLDivElement>(null); // PPT 设置面板 ref
  const plusMenuRef = useRef<HTMLDivElement>(null); // 加号菜单 ref
  const imageInputRef = useRef<HTMLInputElement>(null); // 图片上传 input ref
  const documentInputRef = useRef<HTMLInputElement>(null); // 文档上传 input ref
  const streamingMessageIdRef = useRef<string | null>(null); // 流式消息 ID
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Toast 定时器 ref
  const batchStateRef = useRef<BatchImageBlock | null>(null); // 同步跟踪批量图片状态，避免 React 异步更新的竞态条件
  const textareaResizeRafRef = useRef<number | null>(null);

  // 防止重复提交：使用 ref 同步追踪发送状态，避免 React 状态更新延迟导致的重复发送
  const isSendingRef = useRef(false);

  // 兼容性：agentMode 映射到 chatMode
  const agentMode = chatMode === 'agent';

  // 统一的消息和加载状态（不再需要合并两套）
  const currentMessages: CombinedMessage[] = unifiedMessages;

  // 重试加载状态（handleRetryMessage 使用）
  // isRetrying migrated to Zustand store

  // 批量图片确认对话框状态
  const [batchPreviewData, setBatchPreviewData] = useState<{
    tasks: BatchExecuteTask[];
    totalCount: number;
    estimatedCredits: number;
    messageId: string;
  } | null>(null);
  // isBatchGenerating migrated to Zustand store
  const batchAbortControllerRef = useRef<AbortController | null>(null);

  // 滚动到底部触发器：每次变化时强制滚动到底部
  const [scrollToBottomTrigger, setScrollToBottomTrigger] = useState(0);

  const {
    viewMode,
    setViewMode,
    conversations,

    isInitializing,
    handleNewConversation,
    handleSelectConversation,
    handleDeleteConversation,
    handleShowHistory,
    saveCurrentConversation
  } = useChatHistory({
    currentProjectId: currentProjectId || undefined,
    enabled: isAuthReady,
    unifiedMessages,
    setUnifiedMessages,
    resetSession,
    isExtensionEnv,
    setScrollToBottomTrigger,
    onAutoSaveError: (error) => {
      // 捕获自动保存错误时处理配额超限
      if (error instanceof QuotaExceededError) {
        setCreditError({ type: 'quota' });
      }
    }
  });

  const {
    matchedSkills,
    setMatchedSkills,
    showSkillSelector,
    setShowSkillSelector,
    selectedSkillCandidate,
    setSelectedSkillCandidate,
    selectedSkill,
    setSelectedSkill,
    showSkillConfirm,
    setShowSkillConfirm,
    pendingSkillPrompt,
    setPendingSkillPrompt,
    skillCreatePreview,
    showSkillCreateDialog,
    isSkillChatLoading,
    stopSkillChat,
    handleSendWithSkill,
    handleSendWithoutSkill,
    handleSkillCreateConfirm,
    handleSkillCreateCancel,
    // 搜索批次状态
    currentSearchBatch,
    isSearchBatchLocked,
    importSearchBatch,
    dismissSearchBatch
  } = useChatSkills({
    references,
    summaries,
    onRemoveReference,
    setUnifiedMessages,
    saveCurrentConversation,
    setInput,
    clearAttachments,
    t,
    refreshSkills: refresh,
    setToast,
    setSummaryConfirmType,
    setSummaryConfirmData
  });

  // 合并加载状态：统一聊天加载 或 重试加载 或 Skill 聊天加载
  const currentLoading = unifiedLoading || isRetrying || isSkillChatLoading;

  // ── 搜索批次门禁：未处理完的批次时阻止发送 ──
  const handleSearchBatchImport = useCallback(
    async (items: SearchResultBatchItem[]) => {
      if (!importSearchBatch) return;
      const result = await importSearchBatch(items, currentProjectId);
      if (result.failed > 0) {
        setToast({
          message: t(
            'searchBatch.partialImport',
            `导入完成：${result.imported} 成功，${result.failed} 失败`
          ),
          type: 'error'
        });
      } else {
        setToast({
          message: t(
            'searchBatch.importSuccess',
            `成功导入 ${result.imported} 条来源`
          ),
          type: 'success'
        });
      }
    },
    [importSearchBatch, currentProjectId, setToast, t]
  );

  const handleSearchBatchDismiss = useCallback(() => {
    dismissSearchBatch?.();
  }, [dismissSearchBatch]);

  useEffect(() => {
    if (!pendingSkill?.id) return;
    setSelectedSkill(pendingSkill);
    onConsumePendingSkill?.();
  }, [pendingSkill, onConsumePendingSkill, setSelectedSkill]);

  // 统一的停止函数：停止所有类型的生成
  const handleStopGeneration = useCallback(() => {
    // 停止统一聊天
    stopGeneration();
    // 停止 Skill 聊天
    stopSkillChat();
    // 停止重试
    setIsRetrying(false);
  }, [setIsRetrying, stopGeneration, stopSkillChat]);

  const [creditError, setCreditError] = useState<{
    type: 'insufficient' | 'quota';
    required?: number;
    current?: number;
    feature?: string;
    used?: number;
    max?: number;
  } | null>(null);

  useEffect(() => {
    const handleFocusChatInput = () => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      const valueLength = textarea.value.length;
      textarea.setSelectionRange(valueLength, valueLength);
    };

    window.addEventListener(
      'workspace:focus-chat-input',
      handleFocusChatInput as EventListener
    );
    return () => {
      window.removeEventListener(
        'workspace:focus-chat-input',
        handleFocusChatInput as EventListener
      );
    };
  }, []);

  // 监听流式 chunk 消息（仅在扩展环境中）
  useEffect(() => {
    // Web 环境中跳过 Chrome API 调用
    if (!isExtensionEnv()) {
      log.info(
        '[ChatArea] Not in extension environment, skipping stream chunk listener'
      );
      return () => {}; // 返回空清理函数
    }

    const handleStreamChunk = (message: SmartChatChunkPayload) => {
      if (message.action !== 'smart_chat_chunk') return;

      const messageId = streamingMessageIdRef.current;

      if (!messageId) return;

      try {
        setUnifiedMessages((prev) =>
          prev.map((m) => {
            if (m.id !== messageId) return m;

            const shouldTrackStep =
              message.blockType === 'status' || message.blockType === 'search';
            const inferredStepId = shouldTrackStep
              ? (m.agentRun?.stepId ?? 0) + 1
              : m.agentRun?.stepId;
            const enrichedMessage =
              shouldTrackStep &&
              (message.stepId === undefined ||
                message.timestamp === undefined ||
                message.runId === undefined)
                ? {
                    ...message,
                    stepId: message.stepId ?? inferredStepId,
                    timestamp: message.timestamp ?? Date.now(),
                    runId: message.runId ?? m.agentRun?.runId,
                    retryFromStepId:
                      message.retryFromStepId ?? m.agentRun?.retryFromStepId
                  }
                : message;

            const blocks = (m.blocks || []) as UnifiedContentBlock[];
            const next = applySmartChatChunkToBlocks(blocks, enrichedMessage);
            const nextAgentRun =
              shouldTrackStep && m.agentRun
                ? {
                    ...m.agentRun,
                    stepId: enrichedMessage.stepId ?? m.agentRun.stepId
                  }
                : m.agentRun;
            if (
              next.blocks === blocks &&
              !next.imageUrl &&
              nextAgentRun === m.agentRun
            ) {
              return m;
            }
            return {
              ...m,
              blocks: next.blocks,
              imageUrl: next.imageUrl ?? m.imageUrl,
              agentRun: nextAgentRun
            };
          })
        );
      } catch (error) {
        log.error('[ChatArea] Error handling stream chunk:', error);
      }
    };

    chrome.runtime.onMessage.addListener(handleStreamChunk);
    return () => {
      chrome.runtime.onMessage.removeListener(handleStreamChunk);
    };
  }, [setUnifiedMessages]);

  // 注意：不再在切换总结时重置对话，对话窗口保持独立

  // 监听消息变化，检测 batch_preview 块并显示确认对话框
  useEffect(() => {
    // 查找最后一条助手消息中的 batch_preview 块
    const lastAssistantMsg = [...unifiedMessages]
      .reverse()
      .find((m) => m.role === 'assistant');

    if (!lastAssistantMsg) return;

    const batchPreviewBlock = lastAssistantMsg.blocks.find(
      (b) => b.type === 'batch_preview'
    );

    if (batchPreviewBlock && batchPreviewBlock.type === 'batch_preview') {
      // 转换为 BatchExecuteTask 格式
      const tasks: BatchExecuteTask[] = batchPreviewBlock.tasks.map((t) => ({
        id: t.id,
        index: t.index,
        title: t.title,
        prompt: t.prompt
      }));

      // 设置预览数据，显示确认对话框
      setBatchPreviewData({
        tasks,
        totalCount: batchPreviewBlock.totalCount,
        estimatedCredits: batchPreviewBlock.estimatedCredits,
        messageId: lastAssistantMsg.id
      });
    }
  }, [unifiedMessages]);

  // 清理 Toast 定时器
  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (textareaResizeRafRef.current !== null) {
        cancelAnimationFrame(textareaResizeRafRef.current);
      }
    };
  }, []);

  // 自动调整textarea高度 - 直接在 onChange 时调用，避免 useEffect 延迟
  const adjustTextareaHeight = useCallback(() => {
    if (textareaResizeRafRef.current !== null) {
      cancelAnimationFrame(textareaResizeRafRef.current);
    }

    textareaResizeRafRef.current = requestAnimationFrame(() => {
      textareaResizeRafRef.current = null;
      if (!textareaRef.current) {
        return;
      }

      const textarea = textareaRef.current;
      textarea.style.height = '0px';
      const baseMinHeight =
        selectedShortcut || pastedImages.length > 0 ? 120 : 108;
      const contentHeight = Math.max(textarea.scrollHeight, baseMinHeight);
      textarea.style.height = `${Math.min(contentHeight, 200)}px`;
    });
  }, [selectedShortcut, pastedImages.length]);

  // 当引用或快捷指令变化时调整高度
  useEffect(() => {
    adjustTextareaHeight();
  }, [selectedShortcut, pastedImages.length, adjustTextareaHeight]);

  // 点击外部关闭各菜单/面板
  useClickOutsideClose(modeMenuRef, showModeMenu, () => setShowModeMenu(false));
  useClickOutsideClose(featuresMenuRef, showFeaturesMenu, () =>
    setShowFeaturesMenu(false)
  );
  useClickOutsideClose(imageSettingsRef, showImageSettings, () =>
    setShowImageSettings(false)
  );
  useClickOutsideClose(slideSettingsRef, showSlideSettings, () =>
    setShowSlideSettings(false)
  );
  useClickOutsideClose(plusMenuRef, showPlusMenu, () => setShowPlusMenu(false));

  const handleSaveAssistantMessageToStudio = useCallback(
    async (message: UnifiedMessage) => {
      if (!onSaveToStudioNote) return;

      const notify = (text: string, type: 'success' | 'error') => {
        setToast({ message: text, type });
        if (toastTimeoutRef.current) {
          clearTimeout(toastTimeoutRef.current);
        }
        toastTimeoutRef.current = setTimeout(() => setToast(null), 3000);
      };

      const textContent = getMessageText(message).trim();
      const imageUrls = (message.blocks || [])
        .filter((block) => block.type === 'image')
        .map((block) => (block as ImageBlock).imageUrl)
        .filter((url): url is string => Boolean(url));

      if (!textContent && imageUrls.length === 0) {
        notify('该回答暂无可保存内容', 'error');
        return;
      }

      const markdownParts: string[] = [];
      if (textContent) {
        markdownParts.push(textContent);
      }
      if (imageUrls.length > 0) {
        markdownParts.push(
          imageUrls.map((url) => `![笔记图片](${url})`).join('\n\n')
        );
      }

      const rawMarkdown = markdownParts.join('\n\n').trim();
      const title = resolveNoteTitle(undefined, rawMarkdown);
      const markdown = `# ${title}\n\n${rawMarkdown}`;

      try {
        await onSaveToStudioNote({ title, markdown });
        notify('已保存为项目笔记', 'success');
      } catch (error) {
        log.error('[ChatArea] Failed to save chat note to studio:', error);
        notify('保存失败，请稍后重试', 'error');
      }
    },
    [onSaveToStudioNote]
  );
  // extractImagesFromReferences、compressPastedImages、findLatestAssistantImage
  // 已迁移到 src/workspace/utils/image-extraction.ts，此处直接使用顶层导入的函数。

  const resolveEditImageContext = useCallback(
    async (
      inputText: string,
      referenceImages: Array<{ data: string; mimeType: string }>,
      hasShortcut: boolean,
      messages: UnifiedMessage[],
      _preferLatestAssistantImage = false
    ): Promise<{
      referenceImages: Array<{ data: string; mimeType: string }>;
      targetImageUrl?: string;
      targetImageMessageId?: string;
    }> => {
      const shouldUseLatestImage =
        !hasShortcut && isLikelyImageEditRequest(inputText);

      if (!shouldUseLatestImage) {
        return { referenceImages };
      }

      const latestImage = findLatestAssistantImage(messages);
      if (!latestImage) {
        return { referenceImages };
      }

      let targetImageUrl = latestImage.imageUrl;
      if (
        targetImageUrl.startsWith('data:image/') ||
        targetImageUrl.startsWith('data:video/')
      ) {
        try {
          const uploadedUrl = await uploadDataUrlImage(targetImageUrl);
          if (!uploadedUrl.startsWith('data:')) {
            targetImageUrl = uploadedUrl;
            log.info('[ChatArea] Persisted target image for edit context');
          }
        } catch (error) {
          log.warn(
            '[ChatArea] Failed to persist target image for edit context:',
            error
          );
        }
      }

      return {
        referenceImages,
        targetImageUrl,
        targetImageMessageId: latestImage.messageId
      };
    },
    []
  );

  // 清除选中的快捷指令
  const handleClearShortcut = useCallback(() => {
    setSelectedShortcut(null);
  }, [setSelectedShortcut]);

  // 显示 Toast 提示
  const showToast = useCallback(
    (message: string, type: 'success' | 'error' = 'success') => {
      setToast({ message, type });
      // 使用 ref 跟踪定时器以便清理
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      toastTimeoutRef.current = setTimeout(() => setToast(null), 3000);
    },
    []
  );
  const updateToolCallStatus = useCallback(
    (toolCallId: string, status: ToolCallBlock['status']) => {
      setUnifiedMessages((prev) =>
        prev.map((message) => ({
          ...message,
          blocks: (message.blocks || []).map((block) =>
            block.type === 'tool_call' &&
            'id' in block &&
            block.id === toolCallId
              ? { ...block, status }
              : block
          )
        }))
      );
    },
    [setUnifiedMessages]
  );
  // 工具调用确认回调（支持普通模式和 Agent 模式）
  const handleToolConfirm = useCallback(
    async (toolCallId: string) => {
      try {
        log.info(
          '[ChatArea] Confirming tool call:',
          toolCallId,
          'session:',
          sessionId
        );
        await confirmToolCall(sessionId, toolCallId, true);
        updateToolCallStatus(toolCallId, 'running');
      } catch (error) {
        log.error('[ChatArea] Failed to confirm tool call:', error);
      }
    },
    [sessionId, updateToolCallStatus]
  );

  // 工具调用取消回调（支持普通模式和 Agent 模式）
  const handleToolCancel = useCallback(
    async (toolCallId: string) => {
      try {
        log.info(
          '[ChatArea] Cancelling tool call:',
          toolCallId,
          'session:',
          sessionId
        );
        await confirmToolCall(sessionId, toolCallId, false);
        updateToolCallStatus(toolCallId, 'cancelled');
      } catch (error) {
        log.error('[ChatArea] Failed to cancel tool call:', error);
      }
    },
    [sessionId, updateToolCallStatus]
  );

  // 批量图片确认生成
  const handleBatchConfirm = useCallback(async () => {
    if (!batchPreviewData) return;

    setIsBatchGenerating(true);
    const abortController = new AbortController();
    batchAbortControllerRef.current = abortController;

    const messageId = batchPreviewData.messageId;
    const tasks = batchPreviewData.tasks;

    log.info('[ChatArea] Starting batch image generation:', {
      taskCount: tasks.length,
      messageId
    });

    try {
      // 先更新消息状态：从 batch_preview 切换到 batch_image
      setUnifiedMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          // 移除 batch_preview 块，添加 batch_image 块
          const filteredBlocks = m.blocks.filter(
            (b) => b.type !== 'batch_preview'
          );
          const batchBlock: BatchImageBlock = {
            type: 'batch_image' as const,
            tasks: tasks.map((t) => ({
              id: t.id,
              index: t.index,
              title: t.title,
              status: 'pending' as const
            })),
            totalCount: tasks.length,
            completedCount: 0,
            failedCount: 0
          };
          return { ...m, blocks: [...filteredBlocks, batchBlock] };
        })
      );

      // 关闭确认对话框
      setBatchPreviewData(null);

      // 调用批量生成 API
      for await (const chunk of batchImageExecuteStream({
        tasks,
        signal: abortController.signal
      })) {
        if (chunk.type === 'batch_image') {
          const {
            batchTasks,
            batchTaskId,
            batchTaskStatus,
            batchTaskImageUrl,
            batchTaskError,
            totalCount,
            completedCount,
            failedCount
          } = chunk.data;

          setUnifiedMessages((prev) =>
            prev.map((m) => {
              if (m.id !== messageId) return m;

              const batchBlockIdx = m.blocks.findIndex(
                (b) => b.type === 'batch_image'
              );
              if (batchBlockIdx < 0) return m;

              // 初始化事件（完整任务列表）
              if (batchTasks && batchTasks.length > 0) {
                const batchBlock: BatchImageBlock = {
                  type: 'batch_image' as const,
                  tasks: batchTasks.map((t) => ({
                    id: t.id,
                    index: t.index,
                    title: t.title,
                    status: t.status,
                    imageUrl: t.imageUrl,
                    thumbnailUrl: t.thumbnailUrl,
                    errorMessage: t.errorMessage
                  })),
                  totalCount: totalCount || batchTasks.length,
                  completedCount: completedCount || 0,
                  failedCount: failedCount || 0
                };
                const newBlocks = [...m.blocks];
                newBlocks[batchBlockIdx] = batchBlock;
                return { ...m, blocks: newBlocks };
              }

              // 单个任务状态更新
              if (batchTaskId) {
                const existingBatch = m.blocks[
                  batchBlockIdx
                ] as BatchImageBlock;
                const updatedTasks = existingBatch.tasks.map((task) => {
                  if (task.id === batchTaskId) {
                    return {
                      ...task,
                      status: batchTaskStatus || task.status,
                      imageUrl: batchTaskImageUrl || task.imageUrl,
                      errorMessage: batchTaskError || task.errorMessage
                    };
                  }
                  return task;
                });

                const newCompletedCount = updatedTasks.filter(
                  (t) => t.status === 'done'
                ).length;
                const newFailedCount = updatedTasks.filter(
                  (t) => t.status === 'error' || t.status === 'cancelled'
                ).length;

                const updatedBatch: BatchImageBlock = {
                  ...existingBatch,
                  tasks: updatedTasks,
                  completedCount: newCompletedCount,
                  failedCount: newFailedCount
                };

                const newBlocks = [...m.blocks];
                newBlocks[batchBlockIdx] = updatedBatch;
                return { ...m, blocks: newBlocks };
              }

              return m;
            })
          );
        } else if (chunk.type === 'done') {
          log.info('[ChatArea] Batch generation complete');
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        log.info('[ChatArea] Batch generation aborted');
      } else {
        log.error('[ChatArea] Batch generation error:', error);
      }
    } finally {
      setIsBatchGenerating(false);
      batchAbortControllerRef.current = null;
    }
  }, [batchPreviewData, setIsBatchGenerating, setUnifiedMessages]);

  // 批量图片取消
  const handleBatchCancel = useCallback(() => {
    // 如果正在生成，中断请求
    if (batchAbortControllerRef.current) {
      batchAbortControllerRef.current.abort();
    }

    // 如果有预览数据，移除消息中的 batch_preview 块
    if (batchPreviewData) {
      const messageId = batchPreviewData.messageId;
      setUnifiedMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const filteredBlocks = m.blocks.filter(
            (b) => b.type !== 'batch_preview'
          );
          // 添加一个取消提示文本
          return {
            ...m,
            blocks: [
              ...filteredBlocks,
              { type: 'text' as const, content: '批量生图已取消' }
            ]
          };
        })
      );
    }

    setBatchPreviewData(null);
    setIsBatchGenerating(false);
  }, [batchPreviewData, setIsBatchGenerating, setUnifiedMessages]);

  // ============================================
  // Summary 卡片确认回调
  // ============================================

  const handleSummaryConfirm = useCallback(async () => {
    if (!summaryConfirmType || !summaryConfirmData) return;

    setSummaryConfirmLoading(true);

    try {
      // 构建请求数据
      let requestData: {
        action: 'create' | 'update' | 'delete';
        projectId: string;
        data: Record<string, unknown>;
      };

      if (summaryConfirmType === 'create') {
        const preview = summaryConfirmData as {
          title: string;
          content: string;
          url?: string | null;
          tags: string[];
          projectId: string;
        };
        requestData = {
          action: 'create',
          projectId: preview.projectId,
          data: {
            title: preview.title,
            content: preview.content,
            url: preview.url,
            tags: preview.tags
          }
        };
      } else if (summaryConfirmType === 'update') {
        const updateData = summaryConfirmData as {
          id: string;
          updated: { title: string; content: string; tags: string[] };
          projectId: string;
        };
        requestData = {
          action: 'update',
          projectId: updateData.projectId,
          data: {
            id: updateData.id,
            title: updateData.updated.title,
            content: updateData.updated.content,
            tags: updateData.updated.tags
          }
        };
      } else {
        const deleteData = summaryConfirmData as {
          summary: { id: string };
          projectId: string;
        };
        requestData = {
          action: 'delete',
          projectId: deleteData.projectId,
          data: {
            id: deleteData.summary.id
          }
        };
      }

      // 调用确认 API
      const response = await fetch('/api/workspace/summary-confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getWorkspaceAccessToken() || ''}`
        },
        body: JSON.stringify(requestData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '操作失败');
      }

      const result = await response.json();
      log.info('[ChatArea] Summary confirm result:', result);

      // 显示成功提示
      setToast({
        message:
          summaryConfirmType === 'create'
            ? '卡片创建成功'
            : summaryConfirmType === 'update'
              ? '卡片更新成功'
              : '卡片删除成功',
        type: 'success'
      });

      // 刷新卡片列表
      if (_onRefreshSummaries) {
        _onRefreshSummaries();
      }

      // 关闭对话框
      setSummaryConfirmType(null);
      setSummaryConfirmData(null);
    } catch (error) {
      log.error('[ChatArea] Summary confirm error:', error);
      setToast({
        message: error instanceof Error ? error.message : '操作失败',
        type: 'error'
      });
    } finally {
      setSummaryConfirmLoading(false);
    }
  }, [summaryConfirmType, summaryConfirmData, _onRefreshSummaries]);

  const handleSummaryCancel = useCallback(() => {
    setSummaryConfirmType(null);
    setSummaryConfirmData(null);
    setSummaryConfirmLoading(false);
  }, []);

  // 保存图片/视频到工作台（支持扩展和 Web 环境）- 乐观更新版
  const handleSaveImageToWorkspace = useCallback(
    async (imageUrl: string, mimeType?: string) => {
      const timestamp = new Date().toLocaleString('zh-CN');
      const isVideo =
        imageUrl.startsWith('data:video/') || mimeType?.startsWith('video/');
      const title = `${isVideo ? t('chat.videoGenerated', { defaultValue: '视频' }) : t('chat.imageGenerated')} - ${timestamp}`;

      // 如果是 base64 图片/视频，先上传到 Storage 获取 URL
      let finalImageUrl = imageUrl;
      if (
        imageUrl.startsWith('data:image/') ||
        imageUrl.startsWith('data:video/')
      ) {
        try {
          log.info(
            '[ChatArea] Uploading base64 media to Storage before saving...'
          );
          const storageUrl = await uploadDataUrlImage(imageUrl);
          if (!storageUrl.startsWith('data:')) {
            finalImageUrl = storageUrl;
            log.info('[ChatArea] Media uploaded to Storage:', storageUrl);
          }
        } catch (err) {
          log.warn(
            '[ChatArea] Failed to upload media to Storage, using original:',
            err
          );
        }
      }

      // 对于非 data URL，使用 escapeHtml 防止 XSS
      const safeMediaUrl = finalImageUrl.startsWith('data:')
        ? finalImageUrl
        : escapeHtml(finalImageUrl);

      // 根据类型使用不同的 HTML 标签
      const mediaTag = isVideo
        ? `<video src="${safeMediaUrl}" controls autoplay loop muted playsinline class="max-w-full rounded-lg" />`
        : `<img src="${safeMediaUrl}" alt="${t('chat.imageGenerated')}" class="max-w-full rounded-lg" />`;

      // 使用 HTML 格式，包含媒体和描述占位符（与 App.tsx 中上传图片格式一致）
      const htmlContent = `<div class="mb-4">${mediaTag}</div><div class="text-sm text-slate-500 mb-2" data-placeholder="true">${t('app.addDescription')}</div>`;

      // 创建临时骨架卡片数据
      // 注意：必须设置 projectId，否则在项目视图中会被过滤掉
      const pendingSummary: SavedSummary = {
        id: `pending-${Date.now()}`, // 临时 ID
        title,
        url: 'generated://image',
        markdown: htmlContent,
        createdAt: Date.now(),
        projectId: currentProjectId || undefined, // 关键：设置项目 ID
        isSaving: true // 标记为保存中
      };

      // 1. 乐观更新：立即添加骨架卡片
      const tempId = onAddPendingSummary?.(pendingSummary) || pendingSummary.id;
      log.info('[ChatArea] Added pending summary:', tempId);

      try {
        // 2. 调用 API 保存（包含当前项目 ID）
        const result = await saveSummary({
          title,
          url: 'generated://image',
          markdown: htmlContent,
          tags: [t('chat.tagAIGenerated'), t('chat.tagImage')],
          project_id: currentProjectId || undefined
        });

        log.info('[ChatArea] Image saved to workspace:', result.id);

        // 3. 更新骨架为真实卡片
        const realSummary: SavedSummary = {
          ...pendingSummary,
          id: result.id,
          isSaving: false
        };
        onUpdatePendingSummary?.(tempId, result.id, realSummary);
        onSaveGeneratedImageToCanvas?.({
          imageUrl: finalImageUrl,
          mimeType,
          summaryId: result.id,
          title,
          targetHolderId: activeCanvasImageHolder?.summaryId
        });

        // 4. 显示成功提示
        showToast(t('chat.imageSaved'), 'success');
      } catch (error) {
        log.error('[ChatArea] Failed to save image:', error);
        // 移除骨架卡片
        onRemovePendingSummary?.(tempId);
        // 显示失败提示
        showToast(t('chat.saveFailed'), 'error');
      }
    },
    [
      onAddPendingSummary,
      onUpdatePendingSummary,
      onRemovePendingSummary,
      onSaveGeneratedImageToCanvas,
      activeCanvasImageHolder?.summaryId,
      showToast,
      currentProjectId,
      t
    ]
  );

  // 重试消息逻辑已迁移到 useRetryMessage hook
  const { handleRetryMessage } = useRetryMessage({
    unifiedMessages,
    setUnifiedMessages,
    summaries,
    shortcuts,
    isRetrying,
    setIsRetrying,
    chatMode,
    selectedFeature,
    setChatMode,
    setImageMode,
    setSelectedFeature,
    streamingMessageIdRef,
    batchStateRef,
    setCreditError,
    resolveEditImageContext
  });

  const handleRetryFromErrorToast = useCallback(() => {
    clearChatError();
    const lastAssistantMessage = [...currentMessages]
      .reverse()
      .find((msg) => msg.role === 'assistant');
    if (!lastAssistantMessage) return;
    void handleRetryMessage(lastAssistantMessage.id);
  }, [clearChatError, currentMessages, handleRetryMessage]);

  // 打字机效果完成回调 - 清除 typewriter 标记
  const handleTypewriterComplete = useCallback(
    (messageId: string) => {
      setUnifiedMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, typewriter: false } : m))
      );
    },
    [setUnifiedMessages]
  );

  // 模式切换回调 - 从 Ask 模式切换到 Agent 模式
  const handleModeSwitch = useCallback(
    (mode: 'agent', feature?: string) => {
      setChatMode(mode);
      // 如果指定了功能，自动选中
      if (feature === 'image') {
        setImageMode(true);
        setSelectedFeature('image');
      } else if (feature === 'slide_deck') {
        setSelectedFeature('slide_deck');
      }
    },
    [setChatMode, setImageMode, setSelectedFeature]
  );

  // 使用 Skill 发送消息

  const { handleSend } = useChatSend({
    getInput,
    setInput,
    selectedShortcut,
    setSelectedShortcut,
    ENABLE_SKILL_FEATURE,
    selectedSkill,
    setPendingSkillPrompt,
    setShowSkillConfirm,
    isSendingRef,
    pendingImageReadsRef,
    pastedImagesRef,
    references,
    onRemoveReference,
    selectedFeature,
    setSelectedFeature,
    agentMode,
    imageMode,
    setImageMode,
    chatMode,
    setChatMode,
    thinkingModeEnabled,
    imageSettings,
    imageSettingsToPromptSuffix,
    slideSettings,
    slideSettingsToPromptSuffix,
    t,
    setCreditError,
    summaries,
    currentProjectId: currentProjectId || null,
    saveCurrentConversation,
    unifiedMessages,
    setUnifiedMessages,
    updateMessage,
    sendUnifiedMessage,
    streamingMessageIdRef,
    batchStateRef,
    showToast,
    extractImagesFromReferences,
    compressPastedImages,
    resolveEditImageContext,
    clearAttachments
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // 搜索批次门禁：未处理完的批次时阻止发送
      if (isSearchBatchLocked) {
        setToast({
          message: t(
            'searchBatch.batchLocked',
            '请先导入或删除当前搜索结果批次'
          ),
          type: 'error'
        });
        return;
      }
      handleSend();
    }
  };

  const wrappedImageUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleImageUpload(e, () => {
        setShowPlusMenu(false);
      });
    },
    [handleImageUpload, setShowPlusMenu]
  );

  // 处理文档文件上传
  const wrappedDocumentUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleDocumentUpload(e, () => {
        setShowPlusMenu(false);
      });
    },
    [handleDocumentUpload, setShowPlusMenu]
  );

  // 切换对话模式（Agent/图像）- 允许随时切换
  const handleModeChange = (mode: 'ask' | 'agent' | 'image') => {
    if (mode === 'image') {
      setChatMode('agent');
      setImageMode(true);
      setSelectedFeature('image');
    } else {
      setChatMode(mode === 'ask' ? 'ask' : 'agent');
      setImageMode(false);
      setSelectedFeature(null);
    }
    setShowModeMenu(false);
  };

  // 选择 Agent 功能
  const handleSelectFeature = (feature: string) => {
    if (feature === 'image') {
      setImageMode(true);
      setSelectedFeature('image');
    } else {
      setImageMode(false);
      setSelectedFeature(feature);
    }
    setShowFeaturesMenu(false);
  };

  // 清除选中的功能
  const handleClearFeature = () => {
    setSelectedFeature(null);
    setImageMode(false);
  };

  // Agent 功能列表（仅保留图片生成和 PPT 制作，NotebookLM 功能暂时隐藏）
  const agentFeatures = [
    { id: 'image', icon: '🎨' },
    { id: 'slide_deck', icon: '📽️' }
    // 以下 NotebookLM 功能暂时隐藏，后续可恢复
    // { id: 'flashcards', icon: '📚' },
    // { id: 'mindmap', icon: '🧠' },
    // { id: 'quiz', icon: '❓' },
    // { id: 'report', icon: '📊' },
    // { id: 'summary', icon: '📝' },
    // { id: 'audio', icon: '🎧' },
    // { id: 'video', icon: '🎬' },
    // { id: 'infographic', icon: '📈' },
    // { id: 'data_table', icon: '📋' }
  ];

  // 如果是历史视图，显示对话历史组件
  if (viewMode === 'history') {
    return (
      <ConversationHistory
        conversations={conversations}
        onSelect={handleSelectConversation}
        onDelete={handleDeleteConversation}
        onBack={() => setViewMode('chat')}
      />
    );
  }

  return (
    <>
      {/* 积分异常弹窗 */}
      {creditError && (
        <CreditsWarning
          type={creditError.type}
          required={creditError.required}
          current={creditError.current}
          feature={creditError.feature}
          used={creditError.used}
          max={creditError.max}
          onClose={() => setCreditError(null)}
          onUpgrade={onShowPricing}
        />
      )}

      {/* 统一错误提示 */}
      <ChatErrorToast
        error={chatError}
        onClose={clearChatError}
        onRetry={handleRetryFromErrorToast}
        onUpgrade={onShowPricing}
      />

      <div className="flex flex-col h-full">
        {/* 头部工具栏 - 使用 flex-shrink-0 确保不会因父容器变化而收缩，pr-4 与顶部导航栏对齐 */}
        <header
          className={`flex items-center justify-between gap-3 pl-4 pr-4 py-2 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex-shrink-0 ${
            isProjectWorkspace ? 'min-h-[56px]' : ''
          }`}
        >
          <div className="min-w-0">
            {isProjectWorkspace ? (
              <>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-600 dark:text-indigo-400">
                  Step 2 · Ask
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <Bot className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                  <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Agent
                  </span>
                  {references.length > 0 ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {references.length} 引用
                    </span>
                  ) : null}
                </div>
                {canvasContextItems.length > 0 ? (
                  <div className="mt-1.5 flex max-w-[min(28rem,70vw)] flex-wrap gap-1.5">
                    {canvasContextItems.slice(0, 4).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onReferenceClick?.(item.summaryId)}
                        className={`inline-flex max-w-[8.5rem] items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          item.role === 'selected'
                            ? 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/70 dark:bg-orange-950/30 dark:text-orange-200'
                            : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                        title={`${item.label}：${item.title}`}
                      >
                        <span className="shrink-0">{item.label}</span>
                        <span className="truncate">{item.title}</span>
                      </button>
                    ))}
                    {canvasContextItems.length > 4 ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        +{canvasContextItems.length - 4}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <Bot className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                AI 对话
              </div>
            )}
          </div>

          <div className="flex flex-shrink-0 items-center gap-1">
            {isProjectWorkspace && onCollapsePanel ? (
              <button
                type="button"
                onClick={onCollapsePanel}
                className="hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-600 flex-shrink-0 md:inline-flex"
                title="收起 Agent"
                aria-label="收起 Agent"
              >
                <PanelRightClose className="w-5 h-5" />
              </button>
            ) : null}

            {/* 新对话按钮 */}
            <button
              type="button"
              onClick={handleNewConversation}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-600 flex-shrink-0"
              title={t('chat.newConversation')}
            >
              <MessageSquarePlus className="w-5 h-5" />
            </button>

            {/* 对话历史按钮 */}
            <button
              type="button"
              onClick={handleShowHistory}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-600 flex-shrink-0"
              title={t('chat.conversationHistory')}
            >
              <History className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* 消息列表 - 使用 flex-1 和 min-h-0 确保虚拟滚动正常工作 */}
        <div className="flex-1 min-h-0 flex flex-col">
          {isInitializing && currentMessages.length === 0 ? (
            // 加载中状态
            <div className="flex-1 flex items-center justify-center text-muted-foreground px-6 py-6">
              <div className="text-center">
                <div className="w-8 h-8 mx-auto mb-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
                <p className="text-lg font-medium mb-1">
                  {t('chat.loadingConversation')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('chat.loadingHint')}
                </p>
              </div>
            </div>
          ) : currentMessages.length === 0 && isProjectWorkspace ? (
            <div className="flex-1 flex items-center justify-center px-6 py-6">
              <div className="w-full max-w-[520px] rounded-3xl border border-slate-200 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-800/70">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-sm dark:bg-slate-900 dark:text-indigo-300">
                  <Sparkles className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  围绕画布素材继续创作
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  这里会读取画布中已启用的节点，适合追问、补角度、改结构，或把画布上的素材整理成下一步创作方案。
                </p>
                <div className="mt-5 grid gap-2 text-left sm:grid-cols-3">
                  {[
                    '这批素材的核心观点是什么？',
                    '帮我找出还能补充的证据',
                    '把已选来源整理成创作大纲'
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setInput(prompt)}
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs font-medium leading-5 text-slate-700 transition-colors hover:border-indigo-200 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-indigo-800 dark:hover:bg-indigo-950/30"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : currentMessages.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground px-6 py-6">
              <div className="text-center">
                <svg
                  className="w-16 h-16 mx-auto mb-4 text-slate-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
                  />
                </svg>
                <p className="text-lg font-medium mb-1">
                  {t('chat.startChat')}
                </p>
                <p className="text-sm">
                  {agentMode
                    ? t('chat.agentModeHint')
                    : references.length > 0
                      ? t('chat.referencesHint', { count: references.length })
                      : t('chat.defaultHint')}
                </p>
              </div>
            </div>
          ) : (
            <VirtualMessageList
              messages={currentMessages}
              streamingMessageId={streamingMessageIdRef.current}
              isLoading={currentLoading}
              onToolConfirm={handleToolConfirm}
              onToolCancel={handleToolCancel}
              onSaveImage={handleSaveImageToWorkspace}
              onRetryMessage={handleRetryMessage}
              onSaveMessage={handleSaveAssistantMessageToStudio}
              onReferenceClick={onReferenceClick}
              onShowPricing={onShowPricing}
              scrollToBottomTrigger={scrollToBottomTrigger}
              onTypewriterComplete={handleTypewriterComplete}
              onModeSwitch={handleModeSwitch}
              isAskMode={!agentMode}
              onSearchBatchImport={handleSearchBatchImport}
              onSearchBatchDismiss={handleSearchBatchDismiss}
              isSearchBatchImporting={
                currentSearchBatch?.status === 'importing'
              }
            />
          )}
        </div>

        {/* 输入区域 - 使用 flex-shrink-0 确保不会因父容器变化而收缩 */}
        <ConnectedChatInputArea
          variant={isProjectWorkspace ? 'projectCompact' : 'full'}
          isInputDragOver={isInputDragOver}
          handleInputDragOver={handleInputDragOver}
          handleInputDragLeave={handleInputDragLeave}
          handleInputDrop={handleInputDrop}
          ENABLE_SKILL_FEATURE={ENABLE_SKILL_FEATURE}
          matchedSkills={matchedSkills}
          showSkillSelector={showSkillSelector}
          selectedSkill={selectedSkill}
          selectedSkillCandidate={selectedSkillCandidate}
          setSelectedSkill={setSelectedSkill}
          setSelectedSkillCandidate={setSelectedSkillCandidate}
          setShowSkillSelector={setShowSkillSelector}
          setMatchedSkills={setMatchedSkills}
          selectedShortcut={selectedShortcut}
          pastedImages={pastedImages}
          handleClearShortcut={handleClearShortcut}
          t={t}
          handleRemovePastedImage={handleRemovePastedImage}
          textareaRef={textareaRef}
          imageMode={imageMode}
          adjustTextareaHeight={adjustTextareaHeight}
          handleKeyDown={handleKeyDown}
          handlePaste={handlePaste}
          currentLoading={currentLoading}
          showPlusMenu={showPlusMenu}
          plusMenuRef={plusMenuRef}
          setShowPlusMenu={setShowPlusMenu}
          setShowSelector={setShowSelector}
          imageInputRef={imageInputRef}
          documentInputRef={documentInputRef}
          modeMenuRef={modeMenuRef}
          showModeMenu={showModeMenu}
          setShowModeMenu={setShowModeMenu}
          agentMode={agentMode}
          handleModeChange={handleModeChange}
          webSearchEnabled={webSearchEnabled}
          setWebSearchEnabled={setWebSearchEnabled}
          availableSkills={availableSkills}
          onOpenSkills={onOpenSkills}
          thinkingModeEnabled={thinkingModeEnabled}
          setThinkingModeEnabled={setThinkingModeEnabled}
          featuresMenuRef={featuresMenuRef}
          selectedFeature={selectedFeature}
          showFeaturesMenu={showFeaturesMenu}
          setShowFeaturesMenu={setShowFeaturesMenu}
          agentFeatures={agentFeatures}
          getFeatureLabel={getFeatureLabel}
          handleClearFeature={handleClearFeature}
          handleSelectFeature={handleSelectFeature}
          imageSettingsRef={imageSettingsRef}
          showImageSettings={showImageSettings}
          setShowImageSettings={setShowImageSettings}
          imageSettings={imageSettings}
          setImageSettings={setImageSettings}
          slideSettingsRef={slideSettingsRef}
          showSlideSettings={showSlideSettings}
          setShowSlideSettings={setShowSlideSettings}
          slideSettings={slideSettings}
          setSlideSettings={setSlideSettings}
          currentStatus={currentStatus}
          references={references}
          handleStopGeneration={handleStopGeneration}
          handleSend={handleSend}
          onAddReferences={onAddReferences}
          wrappedImageUpload={wrappedImageUpload}
          wrappedDocumentUpload={wrappedDocumentUpload}
          onCreateSkill={onCreateSkill}
          summaries={summaries}
        />

        {/* 隐藏的文件上传 input */}
        <input
          type="file"
          ref={imageInputRef}
          onChange={wrappedImageUpload}
          accept=".png,.jpg,.jpeg,.webp,.heic,.heif,image/png,image/jpeg,image/webp,image/heic,image/heif"
          multiple
          className="hidden"
          aria-label={t('chat.uploadImage')}
          title={t('chat.uploadImage')}
        />
        <input
          type="file"
          ref={documentInputRef}
          onChange={wrappedDocumentUpload}
          accept=".pdf,.txt,application/pdf,text/plain"
          multiple
          className="hidden"
          aria-label={t('chat.uploadDocument')}
          title={t('chat.uploadDocument')}
        />

        {/* 引用选择器弹窗 */}
        {showSelector && (
          <ErrorBoundary
            fallback={
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-xl p-6 max-w-sm text-center">
                  <p className="text-red-500 mb-4">
                    {t('chat.referenceSelectorError')}
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowSelector(false)}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                  >
                    {t('chat.close')}
                  </button>
                </div>
              </div>
            }
          >
            <ReferenceSelector
              summaries={summaries}
              existingReferenceIds={references
                .filter((r) => r.type === 'summary')
                .map((r) => r.summaryId)}
              onConfirm={(refs) => {
                log.info('[ChatArea] ReferenceSelector onConfirm:', {
                  refsCount: refs.length,
                  refs: refs.map((r) => ({
                    id: r.id,
                    summaryId: r.summaryId,
                    hasContent: !!r.content,
                    contentLength: r.content?.length || 0,
                    hasImageInContent:
                      r.content?.includes('data:image') || false
                  }))
                });
                onAddReferences(refs);
                setShowSelector(false);
              }}
              onCancel={() => setShowSelector(false)}
            />
          </ErrorBoundary>
        )}

        {/* Toast 提示 */}
        {toast && (
          <div
            className={`fixed bottom-20 left-1/2 max-w-[calc(100vw-2rem)] transform -translate-x-1/2 break-words px-4 py-2 rounded-lg shadow-lg z-50 transition-all duration-slow ${
              toast.type === 'success'
                ? 'border border-emerald-800 bg-emerald-700 text-emerald-50 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100'
                : 'border border-red-800 bg-red-700 text-red-50 dark:border-red-700 dark:bg-red-950 dark:text-red-100'
            }`}
            role={toast.type === 'error' ? 'alert' : 'status'}
            aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
          >
            <div className="flex items-center gap-2">
              {toast.type === 'success' ? (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              ) : (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              )}
              <span className="text-sm font-medium">{toast.message}</span>
            </div>
          </div>
        )}

        {/* 批量图片确认对话框 */}
        {batchPreviewData && (
          <BatchImageConfirmDialog
            tasks={batchPreviewData.tasks.map((t) => ({
              id: t.id,
              index: t.index,
              title: t.title,
              prompt: t.prompt,
              status: 'pending' as const
            }))}
            totalCount={batchPreviewData.totalCount}
            estimatedCredits={batchPreviewData.estimatedCredits}
            isGenerating={isBatchGenerating}
            onConfirm={handleBatchConfirm}
            onCancel={handleBatchCancel}
          />
        )}

        {/* Skill 确认对话框 */}
        {ENABLE_SKILL_FEATURE && showSkillConfirm && selectedSkillCandidate && (
          <SkillConfirmDialog
            candidate={selectedSkillCandidate}
            prompt={pendingSkillPrompt}
            visible={showSkillConfirm}
            onConfirm={() => {
              setShowSkillConfirm(false);
              // 使用 Skill 发送消息
              handleSendWithSkill(pendingSkillPrompt, selectedSkillCandidate);
            }}
            onCancel={() => {
              setShowSkillConfirm(false);
              setPendingSkillPrompt('');
            }}
            onSendWithoutSkill={() => {
              setShowSkillConfirm(false);
              setSelectedSkill(null);
              setSelectedSkillCandidate(null);
              // 不使用 Skill，正常发送
              handleSendWithoutSkill(pendingSkillPrompt);
            }}
          />
        )}

        {/* Skill 创建确认对话框 */}
        {ENABLE_SKILL_FEATURE &&
          showSkillCreateDialog &&
          skillCreatePreview && (
            <SkillCreateConfirmDialog
              preview={skillCreatePreview}
              visible={showSkillCreateDialog}
              onConfirm={handleSkillCreateConfirm}
              onCancel={handleSkillCreateCancel}
            />
          )}

        {/* Summary 卡片确认对话框 */}
        {summaryConfirmType && summaryConfirmData && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <SummaryConfirmDialog
              type={summaryConfirmType}
              data={summaryConfirmData as SummaryConfirmDialogProps['data']}
              onConfirm={handleSummaryConfirm}
              onCancel={handleSummaryCancel}
              loading={summaryConfirmLoading}
            />
          </div>
        )}
      </div>
    </>
  );
}
