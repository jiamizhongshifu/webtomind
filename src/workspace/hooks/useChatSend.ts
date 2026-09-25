import { useState, useEffect } from 'react';
import { createLogger } from '@/utils/logger';
import type { Reference } from '@/types';
import type { TFunction } from 'i18next';
import type {
  Shortcut,
  SavedSummary,
  ShortcutReference
} from '@/services/database';
import type { Skill } from '@/services/workspace-api';
import { getSummaryById } from '@/services/workspace-api';
import type { PastedImage } from './useChatAttachments';
import type { ImageSettings } from '../components/ImageSettingsPanel';
import type { SlideSettings } from '../components/SlideSettingsPanel';

export interface ShortcutWithReferenceIds extends Shortcut {
  referenceIds?: string[];
}

import type { SendMessageOptions } from './useUnifiedChat';
import type {
  UnifiedMessage,
  TextBlock,
  StatusBlock,
  ImageBlock,
  UpgradeBlock,
  ThinkingBlock,
  UnifiedContentBlock,
  ChatMode,
  BatchPreviewBlock,
  BatchPreviewTask
} from '@/types/unified-chat';
import {
  getMessageText,
  extractTextFromReferences
} from '../utils/chat-helpers';
import {
  consumeCredits,
  InsufficientCreditsError,
  QuotaExceededError
} from '@/services/credits-api';

import type { CreditSource } from '@/types/membership';
import { isExtensionEnv } from '@/utils/env';
import { smartChatStream, type ChatOptions } from '@/services/agent-api';
import { uploadDataUrlImage } from '@/services/image-storage';

const log = createLogger('useChatSend');
const SUMMARY_PREVIEW_HYDRATE_THRESHOLD = 1100;

type CreditErrorState =
  | {
      type: 'quota' | 'insufficient';
      required?: number;
      current?: number;
      feature?: string;
      used?: number;
      max?: number;
    }
  | null;

function generateRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function shouldUseMinimalImageContext(options: {
  feature?: string;
  targetImageUrl?: string;
  targetImageMessageId?: string;
}): boolean {
  return (
    options.feature === 'image' &&
    !options.targetImageUrl &&
    !options.targetImageMessageId
  );
}

export function selectCanvasTargetImageUrl(refs: Reference[]): string | undefined {
  const candidates = refs
    .map((ref, index) => {
      const imageUrl = ref.canvas?.imageUrl?.trim();
      if (!imageUrl) return null;
      const isHolder = ref.canvas?.customNodeType === 'ai_image_holder';
      const role = ref.canvas?.role;
      const score =
        role === 'target' && isHolder
          ? 0
          : role === 'selected' && isHolder
            ? 1
            : role === 'target'
              ? 2
              : role === 'selected'
                ? 3
                : role === 'active' && isHolder
                  ? 4
                  : role === 'active'
                    ? 5
                    : 6;
      return { imageUrl, score, index };
    })
    .filter(
      (candidate): candidate is { imageUrl: string; score: number; index: number } =>
        Boolean(candidate)
    )
    .sort((a, b) => a.score - b.score || a.index - b.index);

  return candidates[0]?.imageUrl;
}

async function hydrateTruncatedSummaryReferences(
  refs: Reference[]
): Promise<Reference[]> {
  const targets = Array.from(
    new Set(
      refs
        .filter(
          (ref) =>
            ref.type === 'summary' &&
            ref.summaryId &&
            (ref.content?.length || 0) >= SUMMARY_PREVIEW_HYDRATE_THRESHOLD
        )
        .map((ref) => ref.summaryId as string)
    )
  );

  if (targets.length === 0) {
    return refs;
  }

  const hydrated = new Map<string, SavedSummary>();
  await Promise.all(
    targets.map(async (summaryId) => {
      try {
        const summary = await getSummaryById(summaryId);
        if (summary?.markdown) {
          hydrated.set(summaryId, summary);
        }
      } catch (error) {
        log.warn('[ChatArea] Failed to hydrate summary reference:', {
          summaryId,
          error
        });
      }
    })
  );

  if (hydrated.size === 0) {
    return refs;
  }

  return refs.map((ref) => {
    if (!ref.summaryId) return ref;
    const summary = hydrated.get(ref.summaryId);
    if (!summary) return ref;
    return {
      ...ref,
      summaryTitle: ref.summaryTitle || summary.title,
      content: summary.markdown,
      preview: ref.preview || (summary.title || '').slice(0, 8)
    };
  });
}

export interface UseChatSendProps {
  extractImagesFromReferences: (
    refs: Reference[]
  ) => Promise<Array<{ data: string; mimeType: string }>>;
  compressPastedImages: (
    images: PastedImage[]
  ) => Promise<Array<{ data: string; mimeType: string }>>;
  resolveEditImageContext: (
    userInputPart: string,
    referenceImages: Array<{ data: string; mimeType: string }>,
    hasShortcut: boolean,
    unifiedMessages: UnifiedMessage[],
    isImageMode: boolean
  ) => Promise<{
    referenceImages: Array<{ data: string; mimeType: string }>;
    targetImageUrl?: string;
    targetImageMessageId?: string;
  }>;
  clearAttachments: () => void;

  getInput: () => string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  selectedShortcut: ShortcutWithReferenceIds | null;
  setSelectedShortcut: React.Dispatch<
    React.SetStateAction<ShortcutWithReferenceIds | null>
  >;
  ENABLE_SKILL_FEATURE: boolean;
  selectedSkill: Skill | null;
  setPendingSkillPrompt: React.Dispatch<React.SetStateAction<string>>;
  setShowSkillConfirm: React.Dispatch<React.SetStateAction<boolean>>;
  isSendingRef: React.MutableRefObject<boolean>;
  pendingImageReadsRef: React.MutableRefObject<Promise<void>[]>;
  pastedImagesRef: React.MutableRefObject<PastedImage[]>;
  references: Reference[];
  onRemoveReference: (id: string) => void;
  selectedFeature: string | null;
  setSelectedFeature: React.Dispatch<React.SetStateAction<string | null>>;
  agentMode: boolean;
  imageMode: boolean;
  setImageMode: React.Dispatch<React.SetStateAction<boolean>>;
  chatMode: ChatMode;
  setChatMode: (mode: ChatMode) => void;
  thinkingModeEnabled: boolean;
  imageSettings: ImageSettings;
  imageSettingsToPromptSuffix: (settings: ImageSettings) => string;
  slideSettings: SlideSettings;
  slideSettingsToPromptSuffix: (settings: SlideSettings) => string;
  t: TFunction<'workspace'>;
  setCreditError: React.Dispatch<React.SetStateAction<CreditErrorState>>;
  summaries: SavedSummary[];
  currentProjectId: string | null;
  saveCurrentConversation: () => Promise<void>;
  unifiedMessages: UnifiedMessage[];
  setUnifiedMessages: React.Dispatch<React.SetStateAction<UnifiedMessage[]>>;
  updateMessage: (id: string, message: Partial<UnifiedMessage>) => void;
  sendUnifiedMessage: (
    content: string,
    options?: SendMessageOptions
  ) => Promise<unknown>;
  streamingMessageIdRef: React.MutableRefObject<string | null>;
  batchStateRef: React.MutableRefObject<unknown>;
  showToast: (msg: string, type: 'success' | 'error') => void;
}

export function useChatSend(props: UseChatSendProps) {
  const {
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
    t,
    setCreditError,
    summaries,
    currentProjectId,
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
  } = props;

  // 使用状态追踪自动保存，替代脆弱的 setTimeout，基于 React 批处理与 effect 时机保证
  const [autoSaveTrigger, setAutoSaveTrigger] = useState(0);

  useEffect(() => {
    if (autoSaveTrigger > 0) {
      log.info(
        `[ChatArea] Delayed save triggered via effect (${autoSaveTrigger})`
      );
      saveCurrentConversation().catch((err) => {
        log.warn(
          '[ChatArea] Failed to save conversation in delayed effect:',
          err
        );
      });
    }
  }, [autoSaveTrigger, saveCurrentConversation]);

  const handleSend = async () => {
    // 防止重复提交：使用 ref 同步检查，避免 React 状态更新延迟导致的重复发送
    if (isSendingRef.current) {
      log.info('[ChatArea] handleSend blocked: already sending');
      return;
    }

    try {
      const userInputPart = getInput().trim();

      // 需要有用户输入或选中的快捷指令才能发送
      if (!userInputPart && !selectedShortcut) return;

      // 立即设置发送中状态（同步），防止快速重复点击
      isSendingRef.current = true;

      // 如果有选中的 Skill，显示确认对话框
      if (ENABLE_SKILL_FEATURE && selectedSkill && userInputPart) {
        setPendingSkillPrompt(userInputPart);
        setShowSkillConfirm(true);
        isSendingRef.current = false; // 显示确认框时重置，允许后续发送
        return;
      }

      // 等待所有正在读取的图片完成
      // 这解决了用户粘贴图片后立即发送，但 FileReader 还没完成读取的竞态条件
      if (pendingImageReadsRef.current.length > 0) {
        log.info(
          '[ChatArea] Waiting for',
          pendingImageReadsRef.current.length,
          'pending image reads...'
        );
        await Promise.all(pendingImageReadsRef.current);
        log.info('[ChatArea] All pending image reads completed');
      }

      // Agent 模式下自动匹配 Skill（单个匹配时自动执行）
      // 临时注释：避免 skill 触发影响图片生成等主要功能
      // if (agentMode && userInputPart && !selectedSkill && !selectedShortcut) {
      //   const matched = matchSkills(userInputPart);
      //   if (matched.length === 1) {
      //     log.info('[ChatArea] Auto-matched Skill:', matched[0].skill.name);
      //     isSendingRef.current = false;
      //     await handleSendWithSkill(userInputPart, matched[0].skill);
      //     return;
      //   }
      // }

      // 在异步操作前保存当前状态的快照
      // 使用 ref 而非 state，避免 React 状态更新延迟导致读取不到刚粘贴的图片
      const currentPastedImages = [...pastedImagesRef.current];
      const currentReferencesSnapshot = [...references];
      const currentSelectedShortcut = selectedShortcut;
      const currentSelectedFeature = selectedFeature;

      // 详细日志：追踪引用和图片状态
      log.info('[ChatArea] handleSend - Initial state:', {
        userInputPart: userInputPart.substring(0, 50),
        referencesCount: references.length,
        referencesSnapshot: currentReferencesSnapshot.map((r) => ({
          id: r.id,
          type: r.type,
          summaryId: r.summaryId,
          hasContent: !!r.content,
          contentLength: r.content?.length || 0
        })),
        pastedImagesCount: currentPastedImages.length,
        hasShortcut: !!currentSelectedShortcut,
        selectedFeature: currentSelectedFeature
      });

      // 积分消耗逻辑 - 根据选择的功能确定消耗类型
      const getActionForCredits = (): CreditSource => {
        // Agent 模式下根据选择的功能消耗积分
        if (agentMode && currentSelectedFeature) {
          const featureToAction: Record<string, CreditSource> = {
            image: 'image_generation',
            flashcards: 'nlm_flashcards',
            mindmap: 'nlm_mindmap',
            quiz: 'nlm_quiz',
            report: 'nlm_report',
            summary: 'nlm_summary',
            audio: 'nlm_audio',
            video: 'nlm_video',
            infographic: 'nlm_infographic',
            // slide_deck 使用新的 Gemini+pptxgenjs 方案，走普通 Agent 流程
            data_table: 'nlm_data_table'
          };
          return featureToAction[currentSelectedFeature] || 'ai_chat_advanced';
        }
        // 图片模式
        if (imageMode) return 'image_generation';
        // Agent 模式（无特定功能）
        if (agentMode) return 'ai_chat_advanced';
        // 普通模式
        return 'ai_chat_basic';
      };

      const action = getActionForCredits();
      log.info(
        '[ChatArea] Credit action:',
        action,
        'feature:',
        currentSelectedFeature
      );

      // 判断是否为固定价格功能（图片生成、媒体类功能需要预付费）
      const fixedPriceActions: CreditSource[] = [
        'image_generation',
        'nlm_audio',
        'nlm_video',
        'nlm_infographic'
        // slide_deck 现在使用 Gemini+pptxgenjs 方案，走普通 Agent 流程（后付费）
      ];
      const isFixedPrice = fixedPriceActions.includes(action);

      // 固定价格功能：预付费
      if (isFixedPrice) {
        try {
          await consumeCredits(action);
        } catch (err) {
          if (err instanceof InsufficientCreditsError) {
            setCreditError({
              type: 'insufficient',
              required: err.required,
              current: err.current
            });
            isSendingRef.current = false; // 重置发送状态
            return;
          }
          if (err instanceof QuotaExceededError) {
            setCreditError({ type: 'quota', feature: err.feature });
            isSendingRef.current = false; // 重置发送状态
            return;
          }
          throw err;
        }
      }

      // 前端后付费已移除，计费安全已在后端闭环

      // 1. 构建最终引用列表 (合并外部传入的 Snapshot 和快捷指令 references)
      let allRefs: Reference[] = [...currentReferencesSnapshot];

      const shortcutReferences = currentSelectedShortcut?.references;
      const shortcutReferenceIds = (
        currentSelectedShortcut as unknown as ShortcutWithReferenceIds
      )?.referenceIds;

      if (shortcutReferences && shortcutReferences.length > 0) {
        // 扩展环境：使用 references 对象数组
        shortcutReferences.forEach((ref: ShortcutReference) => {
          if (!allRefs.some((r) => r.summaryId === ref.summaryId)) {
            const summary = summaries.find((s) => s.id === ref.summaryId);
            allRefs.push({
              id: ref.id,
              type: 'summary' as const,
              summaryId: ref.summaryId,
              summaryTitle: ref.summaryTitle,
              content: summary?.markdown || ref.preview || '',
              preview: ref.preview
            });
          }
        });
      } else if (shortcutReferenceIds && shortcutReferenceIds.length > 0) {
        // Web 环境：使用 referenceIds 字符串数组
        shortcutReferenceIds.forEach((summaryId: string, index: number) => {
          if (!allRefs.some((r) => r.summaryId === summaryId)) {
            const summary = summaries.find((s) => s.id === summaryId);
            allRefs.push({
              id: `ref-${index}-${summaryId}-${Date.now()}`,
              type: 'summary' as const,
              summaryId,
              summaryTitle: summary?.title || t('chat.unknownTitle'),
              content: summary?.markdown || '',
              preview: (summary?.markdown || '').substring(0, 100)
            });
          }
        });
      }

      allRefs = await hydrateTruncatedSummaryReferences(allRefs);

      // 调试：记录最终引用情况
      log.info(
        '[ChatArea] Final allRefs for sending:',
        allRefs.map((r) => ({
          id: r.id,
          contentLen: r.content?.length || 0,
          contentStart: r.content?.substring(0, 50) + '...'
        }))
      );

      // 2. 构建 UI 显示用的消息引用
      const messageRefs = allRefs.map((ref) => ({
        id: ref.id,
        type: ref.type as 'summary' | 'snippet',
        preview: ref.preview,
        summaryId: ref.summaryId,
        summaryTitle: ref.summaryTitle || ref.preview
      }));

      // 3. 构建消息显示内容
      const displayContent =
        userInputPart ||
        t('chat.usingShortcut', { name: currentSelectedShortcut?.name });
      const runId = generateRunId();
      const runStartedAt = Date.now();

      // 4. 构建图片引用
      const imageRefs = currentPastedImages.map((img) => ({
        id: img.id,
        preview: img.preview,
        mimeType: img.mimeType,
        thumbnailUrl: `data:${img.mimeType};base64,${img.data}`
      }));

      // Agent 模式处理
      if (agentMode) {
        let trimmedInput = userInputPart || displayContent;

        // 如果选择了特定功能，在 prompt 中注入关键词以触发意图识别
        if (currentSelectedFeature && currentSelectedFeature !== 'image') {
          const featureKeywords: Record<string, string> = {
            flashcards: '生成闪卡',
            mindmap: '生成思维导图',
            quiz: '生成测验题目',
            report: '生成报告',
            summary: '生成摘要',
            video: '生成视频',
            infographic: '生成信息图',
            slide_deck: '生成PPT' // PPT 功能关键词，触发后端 Gemini 强制工具调用
          };
          const keyword = featureKeywords[currentSelectedFeature];
          if (keyword) {
            // 将功能关键词添加到 prompt 开头
            trimmedInput = `${keyword}：${trimmedInput}`;
          }
        }

        // PPT 模式设置追加到 prompt (Agent 模式)
        if (currentSelectedFeature === 'slide_deck') {
          trimmedInput += `

[PPT 生成设置] \${slideSettingsToPromptSuffix(slideSettings)}`;
        }

        setInput('');
        clearAttachments();

        // 构建上下文：引用内容 (剥离开大块 Base64)
        const refText =
          allRefs.length > 0 ? extractTextFromReferences(allRefs) : undefined;

        // 提取参考图片（用于图片生成意图识别）
        let agentReferenceImages = await extractImagesFromReferences(allRefs);

        // 合并粘贴的图片（压缩后）
        if (currentPastedImages.length > 0) {
          const pastedImagesData =
            await compressPastedImages(currentPastedImages);
          agentReferenceImages = [...agentReferenceImages, ...pastedImagesData];
        }

        const agentEditContext = await resolveEditImageContext(
          userInputPart,
          agentReferenceImages,
          !!currentSelectedShortcut,
          unifiedMessages,
          currentSelectedFeature === 'image'
        );
        agentReferenceImages = agentEditContext.referenceImages;
        const canvasTargetImageUrl = selectCanvasTargetImageUrl(allRefs);
        const targetImageUrl = canvasTargetImageUrl || agentEditContext.targetImageUrl;

        log.info('[ChatArea] Agent mode referenceImages:', {
          count: agentReferenceImages.length,
          fromRefs: allRefs.length,
          fromPasted: currentPastedImages.length
        });

        const pageInfo =
          allRefs.length > 0 && allRefs[0].type === 'summary'
            ? {
                url:
                  summaries.find((s) => s.id === allRefs[0].summaryId)?.url ||
                  '',
                title: allRefs[0].summaryTitle || ''
              }
            : undefined;

        const inferredAgentFeature =
          currentSelectedFeature ||
          (targetImageUrl ? 'image' : undefined);
        const useMinimalImageContext = shouldUseMinimalImageContext({
          feature: inferredAgentFeature,
          targetImageUrl,
          targetImageMessageId: agentEditContext.targetImageMessageId
        });

        await sendUnifiedMessage(trimmedInput, {
          context: {
            references: useMinimalImageContext ? undefined : refText,
            pageInfo: useMinimalImageContext ? undefined : pageInfo,
            referenceImages:
              agentReferenceImages.length > 0
                ? agentReferenceImages
                : undefined,
            targetImageUrl: useMinimalImageContext
              ? undefined
              : targetImageUrl,
            targetImageMessageId: useMinimalImageContext
              ? undefined
              : agentEditContext.targetImageMessageId,
            projectId: currentProjectId || undefined // ???? ID ??????
          },
          feature: inferredAgentFeature, // 优先使用用户选择；改图场景兜底为 image
          imageSettingsSuffix:
            inferredAgentFeature === 'image'
              ? imageSettingsToPromptSuffix(imageSettings)
              : undefined,
          references: messageRefs.length > 0 ? messageRefs : undefined,
          imageReferences: imageRefs.length > 0 ? imageRefs : undefined,
          shortcut: currentSelectedShortcut
            ? {
                id: currentSelectedShortcut.id,
                name: currentSelectedShortcut.name
              }
            : undefined
        }).then(async () => {
          // 后端已在完成后闭环扣除积分
          // Agent 模式完成后保存对话
          // 使用 setTimeout 确保 React 状态更新完成后再保存
          // React 批处理可能导致 saveCurrentConversation 捕获的 unifiedMessages 为空
          log.info('[ChatArea] Agent mode completed, scheduling save');

          // Agent 模式完成后，触发 React 状态收集效果钩子保存
          setAutoSaveTrigger((prev) => prev + 1);
        });

        // 清除引用
        if (onRemoveReference) {
          currentReferencesSnapshot.forEach((ref) => onRemoveReference(ref.id));
        }
        return;
      }

      // 普通模式处理
      const userMessage: UnifiedMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        blocks: [{ type: 'text', content: displayContent }],
        timestamp: Date.now(),
        sourceMode: chatMode,
        agentRun: {
          runId,
          stepId: 0,
          startedAt: runStartedAt,
          endedAt: runStartedAt
        },
        references: messageRefs.length > 0 ? messageRefs : undefined,
        imageReferences: imageRefs.length > 0 ? imageRefs : undefined,
        shortcut: currentSelectedShortcut
          ? {
              id: currentSelectedShortcut.id,
              name: currentSelectedShortcut.name
            }
          : undefined
      };

      setUnifiedMessages((prev) => [...prev, userMessage]);
      setInput('');
      setSelectedShortcut(null);
      clearAttachments();

      if (onRemoveReference) {
        currentReferencesSnapshot.forEach((ref) => onRemoveReference(ref.id));
      }

      // Web 环境普通模式 API 调用
      if (!isExtensionEnv()) {
        // 优化历史对话构建：保留最近 10 轮对话，确保上下文连贯
        const recentMessages = unifiedMessages.slice(-20); // 最多 20 条消息（约 10 轮对话）
        const history = recentMessages
          .map((m) => {
            const text = getMessageText(m);
            // 截断过长的单条消息，但保留足够的上下文
            const truncatedText =
              text.length > 500 ? text.substring(0, 500) + '...' : text;
            return `${m.role === 'user' ? '用户' : 'AI'}: ${truncatedText}`;
          })
          .join('\n');

        const refText =
          allRefs.length > 0 ? extractTextFromReferences(allRefs) : undefined;
        let referenceImages = await extractImagesFromReferences(allRefs);

        log.info('[ChatArea] Before image merge:', {
          allRefsCount: allRefs.length,
          pastedImagesCount: currentPastedImages.length,
          referenceImagesCount: referenceImages.length
        });

        // 合并粘贴的图片（压缩后）
        if (currentPastedImages.length > 0) {
          const pastedImagesData =
            await compressPastedImages(currentPastedImages);
          referenceImages = [...referenceImages, ...pastedImagesData];
        }

        const editContext = await resolveEditImageContext(
          userInputPart,
          referenceImages,
          !!currentSelectedShortcut,
          unifiedMessages,
          imageMode
        );
        referenceImages = editContext.referenceImages;
        const canvasTargetImageUrl = selectCanvasTargetImageUrl(allRefs);
        const targetImageUrl = canvasTargetImageUrl || editContext.targetImageUrl;

        const newStreamMessageId = crypto.randomUUID();
        const assistantMessage: UnifiedMessage = {
          id: newStreamMessageId,
          role: 'assistant',
          blocks: [],
          timestamp: Date.now(),
          sourceMode: chatMode
        };

        setUnifiedMessages((prev) => [...prev, assistantMessage]);
        streamingMessageIdRef.current = newStreamMessageId;

        // 构建完整 prompt（包含快捷指令和图片设置）
        let fullPrompt = currentSelectedShortcut
          ? userInputPart
            ? `\${currentSelectedShortcut.prompt}

\${userInputPart}`
            : currentSelectedShortcut.prompt
          : userInputPart || '';

        if (imageMode) {
          fullPrompt += imageSettingsToPromptSuffix(imageSettings);
        }

        // PPT 模式设置追加到 prompt
        if (selectedFeature === 'slide_deck') {
          fullPrompt += `

[PPT 生成设置] \${slideSettingsToPromptSuffix(slideSettings)}`;
        }

        const requestFeature =
          currentSelectedFeature || (imageMode ? 'image' : undefined);
        const useMinimalImageContext = shouldUseMinimalImageContext({
          feature: requestFeature,
          targetImageUrl,
          targetImageMessageId: editContext.targetImageMessageId
        });

        const chatOptions: ChatOptions = {
          context: {
            references: useMinimalImageContext ? undefined : refText,
            history: useMinimalImageContext ? undefined : history,
            referenceImages:
              referenceImages.length > 0 ? referenceImages : undefined,
            targetImageUrl: useMinimalImageContext
              ? undefined
              : targetImageUrl,
            targetImageMessageId: useMinimalImageContext
              ? undefined
              : editContext.targetImageMessageId,
            feature: requestFeature
          },
          thinkingMode: thinkingModeEnabled,
          mode: chatMode // 传递当前模式：ask 模式禁用图片生成，agent 模式启用意图识别
        };

        log.info('[ChatArea] chatOptions for smartChatStream:', {
          mode: chatMode,
          useMinimalImageContext,
          hasReferenceImages: !!referenceImages && referenceImages.length > 0,
          referenceImagesCount: referenceImages?.length || 0,
          thinkingMode: thinkingModeEnabled
        });

        try {
          let textContent = '';
          let thinkingContent = '';

          let isImageGeneration = false; // 标记是否为图片生成（后端已扣费）
          let imageFinalized = false; // 防止后续 status 覆盖已完成图片

          log.debug(
            '[ChatArea] Starting smartChatStream for message:',
            newStreamMessageId
          );
          for await (const chunk of smartChatStream(fullPrompt, chatOptions)) {
            if (streamingMessageIdRef.current !== newStreamMessageId) {
              log.debug(
                '[ChatArea] Stream aborted: streamingMessageIdRef mismatch',
                {
                  current: streamingMessageIdRef.current,
                  expected: newStreamMessageId
                }
              );
              break;
            }

            if (chunk.type === 'status') {
              // 图片已经完成后，忽略后续状态更新，避免 UI 回退到"生成中"
              if (imageFinalized) continue;

              const statusMsg = chunk.data.message || '';
              // Ask 模式：只显示状态，不显示流式文字
              setUnifiedMessages((prev) =>
                prev.map((m) =>
                m.id === newStreamMessageId
                  ? {
                      ...m,
                        blocks: [
                          {
                            type: 'status',
                            status: 'generating',
                            message: statusMsg
                          } as StatusBlock
                        ]
                      }
                    : m
                )
              );
            } else if (chunk.type === 'thinking') {
              if (imageFinalized) continue;

              // 处理深度思考内容
              thinkingContent += chunk.data.content || '';
              // Ask 模式深度思考：显示思考状态，不显示流式内容
              setUnifiedMessages((prev) =>
                prev.map((m) =>
                m.id === newStreamMessageId
                  ? {
                      ...m,
                        blocks: [
                          {
                            type: 'status',
                            status: 'generating',
                            message: '深度思考中...'
                          } as StatusBlock
                        ]
                      }
                    : m
                )
              );
            } else if (chunk.type === 'text') {
              if (imageFinalized) continue;

              // Ask 模式：累积文本但不实时显示，保持加载状态
              textContent += chunk.data.content || '';
              // 不更新 UI，继续显示加载动画
            } else if (chunk.type === 'mode_switch') {
              const { targetMode, feature, message } = chunk.data as {
                targetMode: 'agent';
                feature: 'image' | 'slide_deck' | 'other';
                message: string;
              };

              if (targetMode === 'agent') {
                setChatMode('agent');
                if (feature === 'image') {
                  setImageMode(true);
                  setSelectedFeature('image');
                } else if (feature === 'slide_deck') {
                  setSelectedFeature('slide_deck');
                }
              }

              setUnifiedMessages((prev) =>
                prev.map((m) =>
                  m.id === newStreamMessageId
                    ? {
                        ...m,
                        blocks: [
                          {
                            type: 'mode_switch',
                            targetMode,
                            feature,
                            message
                          } as const
                        ]
                      }
                    : m
                )
              );
            } else if (chunk.type === 'batch_preview') {
              const { batchTasks, totalCount, estimatedCredits } = chunk.data;

              if (batchTasks && batchTasks.length > 0) {
                setUnifiedMessages((prev) =>
                  prev.map((m) =>
                    m.id === newStreamMessageId
                      ? {
                          ...m,
                          blocks: [
                            ...m.blocks.filter((b) => b.type !== 'status'),
                            {
                              type: 'batch_preview' as const,
                              tasks: batchTasks.map((t) => ({
                                id: t.id,
                                index: t.index,
                                title: t.title,
                                prompt: t.prompt || '',
                                status: 'pending' as const
                              })) as BatchPreviewTask[],
                              totalCount: totalCount || batchTasks.length,
                              estimatedCredits: estimatedCredits || batchTasks.length
                            } as BatchPreviewBlock
                          ]
                        }
                      : m
                  )
                );
              }
            } else if (chunk.type === 'image') {
              // 防止重复 image 事件覆盖已完成结果
              if (imageFinalized) {
                log.warn(
                  '[ChatArea] Ignored duplicate image chunk after finalize'
                );
                continue;
              }

              const imageUrl = chunk.data.imageUrl;
              isImageGeneration = true; // 标记为图片生成，后端已扣费
              imageFinalized = true;
              if (imageUrl) {
                const finalImageUrl = imageUrl.startsWith('data:')
                  ? await uploadDataUrlImage(imageUrl)
                  : imageUrl;
                // 直接使用原图 URL（不再生成 base64 缩略图）
                setUnifiedMessages((prev) =>
                  prev.map((m) =>
                    m.id === newStreamMessageId
                      ? {
                          ...m,
                          blocks: [
                            {
                              type: 'text',
                              content: t('chat.imageGenerated')
                            } as TextBlock,
                            {
                              type: 'image',
                              imageUrl: finalImageUrl,
                              thumbnailUrl: finalImageUrl, // 使用同一 URL
                              status: 'done'
                            } as ImageBlock
                          ],
                          imageUrl: finalImageUrl
                        }
                      : m
                  )
                );
                log.debug('[ChatArea] Image generated:', finalImageUrl);
              }
            } else if (chunk.type === 'quota_exceeded') {
              // 配额超限，显示升级提示
              log.debug(
                '[ChatArea] Quota exceeded during batch generation:',
                chunk.data
              );
              const {
                errorType,
                used,
                max,
                feature,
                currentBalance,
                required
              } = chunk.data;

              setCreditError({
                type: errorType === 'QUOTA_EXCEEDED' ? 'quota' : 'insufficient',
                used,
                max,
                feature: feature || 'image_generation',
                current: currentBalance,
                required
              });
            } else if (chunk.type === 'done') {
              // 获取 token 使用量用于后付费
              if (chunk.data.tokenUsage) {
                // Token usage is safely processed in backend route
              }
              // 检查是否为图片生成（后端已扣费）
              if (chunk.data.isImageGeneration) {
                isImageGeneration = true;
              }
            } else if (chunk.type === 'error') {
              // 处理配额超限等错误
              const errorType = (chunk.data as { type?: string }).type as
                | 'QUOTA_EXCEEDED'
                | 'INSUFFICIENT_CREDITS'
                | 'INSUFFICIENT_MEDIA_CREDITS'
                | undefined;
              const errorMsg = chunk.data.message || t('chat.unknownError');
              const details = (
                chunk.data as {
                  details?: { max?: number; used?: number; resetAt?: string };
                }
              ).details;

              log.debug('[ChatArea] Received error:', {
                errorType,
                errorMsg,
                details,
                rawData: chunk.data
              });

              // 如果是配额超限或积分不足，使用 UpgradeBlock 显示升级引导
              log.debug(
                '[ChatArea] Checking errorType:',
                errorType,
                'matches?',
                errorType === 'QUOTA_EXCEEDED' ||
                  errorType === 'INSUFFICIENT_CREDITS' ||
                  errorType === 'INSUFFICIENT_MEDIA_CREDITS'
              );
              if (
                errorType === 'QUOTA_EXCEEDED' ||
                errorType === 'INSUFFICIENT_CREDITS' ||
                errorType === 'INSUFFICIENT_MEDIA_CREDITS'
              ) {
                // 在对话中显示升级引导
                setUnifiedMessages((prev) =>
                  prev.map((m) =>
                    m.id === newStreamMessageId
                      ? {
                          ...m,
                          blocks: [
                            {
                              type: 'upgrade',
                              errorType: errorType,
                              message: errorMsg,
                              used: details?.used,
                              max: details?.max,
                              resetAt: details?.resetAt
                            } as UpgradeBlock
                          ]
                        }
                      : m
                  )
                );

                // 同时弹出配额上限弹窗
                setCreditError({
                  type: 'quota',
                  feature: 'image_generation',
                  used: details?.used,
                  max: details?.max
                });
              } else {
                // 其他错误使用普通文本块
                setUnifiedMessages((prev) =>
                  prev.map((m) =>
                    m.id === newStreamMessageId
                      ? {
                          ...m,
                          blocks: [
                            {
                              type: 'text',
                              content: `⚠️ ${errorMsg}`
                            } as TextBlock
                          ]
                        }
                      : m
                  )
                );
              }
            }
          }

          // Ask 模式：流式完成后，设置完整文本并启用打字机效果
          if (textContent && !isImageGeneration) {
            const blocks: UnifiedContentBlock[] = [];
            if (thinkingContent) {
              blocks.push({
                type: 'thinking',
                content: thinkingContent,
                collapsed: true
              } as ThinkingBlock);
            }
            blocks.push({ type: 'text', content: textContent } as TextBlock);

            // 设置完整文本并启用打字机效果
            setUnifiedMessages((prev) =>
              prev.map((m) =>
                m.id === newStreamMessageId
                  ? { ...m, blocks, typewriter: true }
                  : m
              )
            );
          }

          // 后付费：API 调用完成后消耗积分
          // 后付费逻辑已安全迁移至服务端，前端无需重复扣除机制

          // 刷新积分显示（无论是否扣费都刷新，确保显示最新余额）
          window.dispatchEvent(new CustomEvent('credits-changed'));
        } catch (error) {
          log.error('[ChatArea] Chat error:', error);
          setUnifiedMessages((prev) =>
            prev.map((m) =>
              m.id === newStreamMessageId
                ? {
                    ...m,
                    blocks: [
                      {
                        type: 'text',
                        content: t('chat.sendFailed')
                      } as TextBlock
                    ]
                  }
                : m
            )
          );
        } finally {
          streamingMessageIdRef.current = null;
          // 流式消息完成后触发状态监听钩子的自动保存，确保在批处理更新完成后持久化
          log.info(
            '[ChatArea] Streaming completed, triggering auto-save via effect'
          );
          setAutoSaveTrigger((prev) => prev + 1);
        }
      } else {
        // 扩展环境普通模式逻辑
        try {
          // 构建完整 prompt（包含快捷指令和图片设置）
          let fullPrompt = currentSelectedShortcut
            ? userInputPart
              ? `\${currentSelectedShortcut.prompt}

\${userInputPart}`
              : currentSelectedShortcut.prompt
            : userInputPart || '';

          if (imageMode) {
            fullPrompt += imageSettingsToPromptSuffix(imageSettings);
          }

          // PPT 模式设置追加到 prompt (扩展环境)
          if (selectedFeature === 'slide_deck') {
            fullPrompt += `

[PPT 生成设置] \${slideSettingsToPromptSuffix(slideSettings)}`;
          }

          // 如果手动开启了图片模式，强制使用图片生成
          if (imageMode) {
            log.info('[ChatArea] Manual image mode enabled (extension env)');

            // 构建图片生成 prompt
            let imagePrompt = fullPrompt;
            if (allRefs.length > 0) {
              const refText = extractTextFromReferences(allRefs);
              imagePrompt = `基于以下内容生成图片：

${refText}

用户要求：${fullPrompt}`;
            }

            // 提取引用中的参考图片
            let referenceImages = await extractImagesFromReferences(allRefs);

            // 添加粘贴的图片（压缩后）
            if (currentPastedImages.length > 0) {
              const pastedImagesData =
                await compressPastedImages(currentPastedImages);
              referenceImages = [...pastedImagesData, ...referenceImages];
            }

            const extensionEditContext = await resolveEditImageContext(
              userInputPart,
              referenceImages,
              !!currentSelectedShortcut,
              unifiedMessages,
              true
            );
            referenceImages = extensionEditContext.referenceImages;

            const response = await chrome.runtime.sendMessage({
              action: 'generate_image',
              data: {
                prompt: imagePrompt,
                referenceImages:
                  referenceImages.length > 0 ? referenceImages : undefined
              }
            });

            if (response.success) {
              const assistantMsg: UnifiedMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                blocks: [
                  {
                    type: 'text',
                    content: t('chat.imageGenerateSuccess')
                  } as TextBlock,
                  {
                    type: 'image',
                    imageUrl: response.data.imageUrl,
                    status: 'done'
                  } as ImageBlock
                ],
                timestamp: Date.now(),
                sourceMode: 'ask',
                agentRun: {
                  runId,
                  stepId: 1,
                  startedAt: Date.now(),
                  endedAt: Date.now()
                },
                imageUrl: response.data.imageUrl,
                thumbnailUrl: response.data.imageUrl // 直接使用原图 URL
              };
              setUnifiedMessages((prev) => [...prev, assistantMsg]);
              log.info('[ChatArea] Image generated:', response.data.imageUrl);
            } else {
              const assistantMsg: UnifiedMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                blocks: [
                  {
                    type: 'text',
                    content: t('chat.imageGenerateFailed', {
                      error: response.error
                    })
                  } as TextBlock
                ],
                timestamp: Date.now(),
                sourceMode: 'ask',
                agentRun: {
                  runId,
                  stepId: 1,
                  startedAt: Date.now(),
                  endedAt: Date.now()
                }
              };
              setUnifiedMessages((prev) => [...prev, assistantMsg]);
            }
          } else {
            // 使用智能对话流式版本
            log.info(
              '[ChatArea] Using smart chat stream with intent detection'
            );

            // 构建上下文（使用合并后的引用）
            // 优化历史对话构建：保留最近 10 轮对话，确保上下文连贯
            const recentMessages = unifiedMessages.slice(-20); // 最多 20 条消息（约 10 轮对话）
            const history = recentMessages
              .map((m) => {
                const text = getMessageText(m);
                // 截断过长的单条消息，但保留足够的上下文
                const truncatedText =
                  text.length > 500 ? text.substring(0, 500) + '...' : text;
                return `${m.role === 'user' ? '用户' : 'AI'}: ${truncatedText}`;
              })
              .join('\n');

            const refText =
              allRefs.length > 0
                ? extractTextFromReferences(allRefs)
                : undefined;
            let referenceImages = await extractImagesFromReferences(allRefs);

            if (currentPastedImages.length > 0) {
              const pastedImagesData =
                await compressPastedImages(currentPastedImages);
              referenceImages = [...pastedImagesData, ...referenceImages];
            }

            const extensionEditContext = await resolveEditImageContext(
              userInputPart,
              referenceImages,
              !!currentSelectedShortcut,
              unifiedMessages,
              imageMode
            );
            referenceImages = extensionEditContext.referenceImages;
            const useMinimalImageContext = shouldUseMinimalImageContext({
              feature: 'image',
              targetImageUrl: extensionEditContext.targetImageUrl,
              targetImageMessageId:
                extensionEditContext.targetImageMessageId
            });

            const streamMessageId = crypto.randomUUID();
            streamingMessageIdRef.current = streamMessageId;
            batchStateRef.current = null;

            const streamMessage: UnifiedMessage = {
              id: streamMessageId,
              role: 'assistant',
              blocks: [],
              timestamp: Date.now(),
              sourceMode: 'ask',
              agentRun: {
                runId,
                stepId: 1,
                startedAt: Date.now()
              }
            };
            setUnifiedMessages((prev) => [...prev, streamMessage]);

            const response = await chrome.runtime.sendMessage({
              action: 'smart_chat_stream',
              data: {
                prompt: fullPrompt,
                context: {
                  references: useMinimalImageContext ? undefined : refText,
                  history: useMinimalImageContext
                    ? undefined
                    : history || undefined,
                  referenceImages:
                    referenceImages.length > 0 ? referenceImages : undefined,
                  targetImageUrl: useMinimalImageContext
                    ? undefined
                    : extensionEditContext.targetImageUrl,
                  targetImageMessageId: useMinimalImageContext
                    ? undefined
                    : extensionEditContext.targetImageMessageId
                }
              }
            });

            if (response.success) {
              const result = response.data;
              const finalContent =
                result.type === 'image'
                  ? result.content || t('chat.imageGenerated')
                  : result.content || t('chat.complete');

              setUnifiedMessages((prev) =>
                prev.map((m) =>
                  m.id === streamMessageId
                    ? {
                        ...m,
                        blocks:
                          result.type === 'image'
                            ? [
                                {
                                  type: 'text',
                                  content: finalContent
                                } as TextBlock,
                                {
                                  type: 'image',
                                  imageUrl: result.imageUrl || '',
                                  status: 'done'
                                } as ImageBlock
                              ]
                            : [
                                {
                                  type: 'text',
                                  content: finalContent
                                } as TextBlock
                              ],
                        imageUrl:
                          result.type === 'image' ? result.imageUrl : undefined,
                        agentRun: m.agentRun
                          ? { ...m.agentRun, endedAt: Date.now() }
                          : m.agentRun
                      }
                    : m
                )
              );
              // 如果是图片，直接使用原图 URL 作为缩略图
              if (result.type === 'image' && result.imageUrl) {
                const finalImageUrl = result.imageUrl.startsWith('data:')
                  ? await uploadDataUrlImage(result.imageUrl)
                  : result.imageUrl;
                updateMessage(streamMessageId, {
                  imageUrl: finalImageUrl,
                  thumbnailUrl: finalImageUrl,
                  blocks: [
                    {
                      type: 'text',
                      content: finalContent
                    } as TextBlock,
                    {
                      type: 'image',
                      imageUrl: finalImageUrl,
                      thumbnailUrl: finalImageUrl,
                      status: 'done'
                    } as ImageBlock
                  ]
                });
                log.info('[ChatArea] Image generated:', finalImageUrl);
              }

              // 服务端流式返回后已自行扣除积分，前端免去扣款调用。
            } else {
              setUnifiedMessages((prev) =>
                prev.map((m) =>
                  m.id === streamMessageId
                    ? {
                        ...m,
                        blocks: [
                          {
                            type: 'text',
                            content: t('chat.requestFailed', {
                              error: response.error
                            })
                          } as TextBlock
                        ],
                        agentRun: m.agentRun
                          ? { ...m.agentRun, endedAt: Date.now() }
                          : m.agentRun
                      }
                    : m
                )
              );
            }
          }
        } catch (error) {
          log.error('[ChatArea] Extension send failed:', error);
          showToast(t('chat.sendFailed'), 'error');
        } finally {
          streamingMessageIdRef.current = null;
          // 流式消息完成后触发保存，确保消息状态正确
          log.info('[ChatArea] Extension streaming completed, triggering save');
          saveCurrentConversation().catch((err) => {
            log.warn(
              '[ChatArea] Failed to save after extension streaming:',
              err
            );
          });
        }
      }
    } catch (error) {
      log.error('[ChatArea] handleSend failed:', error);
      showToast(t('chat.sendFailed'), 'error');
    } finally {
      // 重置发送状态，允许下次发送
      isSendingRef.current = false;
    }
  };

  return {
    handleSend
  };
}
