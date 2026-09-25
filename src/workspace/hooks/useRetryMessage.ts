import { useCallback, type MutableRefObject } from 'react';
import { createLogger } from '@/utils/logger';
import { useTranslation } from 'react-i18next';
import { isExtensionEnv } from '@/utils/env';
import type { SavedSummary, Shortcut } from '@/services/database';
import type {
  UnifiedMessage,
  ToolCallBlock,
  UnifiedContentBlock,
  BatchPreviewBlock,
  BatchPreviewTask,
  BatchImageBlock,
  BatchImageTask,
  BatchImageTaskStatus
} from '@/types/unified-chat';
import type { BatchImageTaskData } from '@/services/agent-api';
import {
  smartChatStream,
  type ChatOptions
} from '@/services/agent-api';
import { getMessageText } from '../utils/chat-helpers';
import {
  applySmartChatChunkToBlocks
} from '../utils/agent-stream';
import { findLatestAssistantImage } from '../utils/image-extraction';

const log = createLogger('useRetryMessage');

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

type CreditErrorState = {
  type: 'insufficient' | 'quota';
  required?: number;
  current?: number;
  feature?: string;
  used?: number;
  max?: number;
};

export interface UseRetryMessageDeps {
  unifiedMessages: UnifiedMessage[];
  setUnifiedMessages: React.Dispatch<React.SetStateAction<UnifiedMessage[]>>;
  summaries: SavedSummary[];
  shortcuts: Shortcut[];
  isRetrying: boolean;
  setIsRetrying: (val: boolean) => void;
  chatMode: 'ask' | 'agent';
  selectedFeature: string | null;
  setChatMode: (mode: 'ask' | 'agent') => void;
  setImageMode: (val: boolean) => void;
  setSelectedFeature: (feature: string | null) => void;
  streamingMessageIdRef: MutableRefObject<string | null>;
  batchStateRef: MutableRefObject<BatchImageBlock | null>;
  setCreditError: (err: CreditErrorState | null) => void;
  resolveEditImageContext: (
    inputText: string,
    referenceImages: Array<{ data: string; mimeType: string }>,
    hasShortcut: boolean,
    messages: UnifiedMessage[],
    preferLatestAssistantImage?: boolean
  ) => Promise<{
    referenceImages: Array<{ data: string; mimeType: string }>;
    targetImageUrl?: string;
    targetImageMessageId?: string;
  }>;
}

export interface UseRetryMessageResult {
  handleRetryMessage: (messageId: string, stepId?: number) => Promise<void>;
  isRetrying: boolean;
}

export function useRetryMessage(deps: UseRetryMessageDeps): UseRetryMessageResult {
  const { t } = useTranslation('workspace');

  const {
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
  } = deps;

  const handleRetryMessage = useCallback(
    async (messageId: string, stepId?: number) => {
      if (isRetrying) return;

      if (stepId !== undefined) {
        log.info('[useRetryMessage] Step-level retry requested', { messageId, stepId });
      }

      const messageIndex = unifiedMessages.findIndex((m) => m.id === messageId);
      if (messageIndex === -1) return;

      const targetAssistantMessage = unifiedMessages[messageIndex];

      const userMessageIndex = messageIndex - 1;
      if (userMessageIndex < 0) return;

      const userMessage = unifiedMessages[userMessageIndex];
      if (userMessage.role !== 'user') return;

      // 步骤级重试：提取目标步骤上下文
      let stepRetryHint = '';
      let stepRetryContext:
        | {
            stepId: number;
            stepType?: 'tool_call' | 'status' | 'search';
            stepLabel?: string;
            completedToolsBeforeStep?: string[];
          }
        | undefined;

      if (stepId !== undefined) {
        const targetBlocks = targetAssistantMessage.blocks || [];
        const targetStepBlock = targetBlocks.find((block) => {
          if (block.type !== 'tool_call' && block.type !== 'status' && block.type !== 'search') {
            return false;
          }
          return (
            'stepId' in block &&
            typeof block.stepId === 'number' &&
            block.stepId === stepId
          );
        });

        const completedToolsBeforeStep = targetBlocks
          .filter(
            (block): block is ToolCallBlock =>
              block.type === 'tool_call' &&
              typeof block.stepId === 'number' &&
              block.stepId < stepId &&
              block.status === 'completed'
          )
          .map((block) => block.name)
          .filter(Boolean);

        const targetStepDescription = (() => {
          if (!targetStepBlock) return `步骤 ${stepId}`;
          if (targetStepBlock.type === 'tool_call') {
            return `步骤 ${stepId}（工具: ${targetStepBlock.name}）`;
          }
          if (targetStepBlock.type === 'status') {
            return `步骤 ${stepId}（状态: ${targetStepBlock.message || targetStepBlock.status}）`;
          }
          if (targetStepBlock.type === 'search') {
            return `步骤 ${stepId}（搜索: ${targetStepBlock.query || '未命名查询'}）`;
          }
          return `步骤 ${stepId}`;
        })();

        stepRetryContext = {
          stepId,
          stepType:
            targetStepBlock?.type === 'tool_call' ||
            targetStepBlock?.type === 'status' ||
            targetStepBlock?.type === 'search'
              ? targetStepBlock.type
              : undefined,
          stepLabel: targetStepDescription,
          completedToolsBeforeStep
        };

        stepRetryHint = [
          '[步骤级重试要求]',
          `请从 ${targetStepDescription} 继续执行，尽量复用已有结果，不要从头重复已完成步骤。`,
          completedToolsBeforeStep.length > 0
            ? `已完成工具步骤：${completedToolsBeforeStep.join('、')}。`
            : '',
          '如果可行，请优先补齐失败步骤及其后续必要步骤，并给出完整最终结果。'
        ]
          .filter(Boolean)
          .join('\n');
      }

      setIsRetrying(true);

      const userContent = getMessageText(userMessage);

      setUnifiedMessages((prev) =>
        prev.filter((_, idx) => idx !== messageIndex)
      );

      const historyMessages = unifiedMessages.slice(0, messageIndex);
      const history = historyMessages
        .map(
          (m) => `${m.role === 'user' ? '用户' : 'AI'}: ${getMessageText(m)}`
        )
        .join('\n');

      const userRefs = userMessage.references || [];
      const refText =
        userRefs.length > 0
          ? userRefs
              .map((ref) => {
                const summary = summaries.find((s) => s.id === ref.summaryId);
                return `【引用${ref.type === 'summary' ? '总结' : '片段'}】\n${summary?.markdown || ref.preview || ''}`;
              })
              .join('\n\n---\n\n')
          : undefined;

      const userImageRefs = userMessage.imageReferences || [];
      let referenceImages: Array<{ data: string; mimeType: string }> = [];

      // 从 imageReferences 恢复粘贴的图片
      for (const imgRef of userImageRefs) {
        if (imgRef.thumbnailUrl?.startsWith('data:')) {
          const match = imgRef.thumbnailUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            referenceImages.push({
              mimeType: match[1],
              data: match[2]
            });
          }
        }
      }

      // 从 references 恢复素材引用中的图片
      for (const ref of userRefs) {
        const summary = summaries.find((s) => s.id === ref.summaryId);
        const content = summary?.markdown || ref.preview || '';
        if (content) {
          const imgRegex =
            /<img[^>]+src=["']data:([^;]+);base64,([^"']+)["'][^>]*>/gi;
          let match;
          while ((match = imgRegex.exec(content)) !== null) {
            const mimeType = match[1];
            const data = match[2];
            if (data && mimeType) {
              referenceImages.push({ data, mimeType });
            }
          }
        }
      }

      log.info(
        '[useRetryMessage] Retry: Restored',
        referenceImages.length,
        'image references from user message (imageRefs:',
        userImageRefs.length,
        ', summaryRefs:',
        userRefs.length,
        ')'
      );

      const userShortcut = userMessage.shortcut;
      let fullPrompt = userContent;

      const isPlaceholderText = (text: string): boolean => {
        return (
          /^使用快捷指令「.+」$/.test(text) ||
          /^Using shortcut ".+"$/.test(text)
        );
      };

      const actualUserContent = isPlaceholderText(userContent) ? '' : userContent;

      if (userShortcut) {
        const shortcutData = shortcuts.find((s) => s.id === userShortcut.id);
        if (shortcutData?.prompt) {
          fullPrompt = actualUserContent
            ? `${shortcutData.prompt}\n\n${actualUserContent}`
            : shortcutData.prompt;
          log.info(
            '[useRetryMessage] Retry: Restored shortcut prompt:',
            shortcutData.name,
            'with user input:',
            actualUserContent || '(none)'
          );
        }
      } else {
        fullPrompt = actualUserContent;
      }

      if (stepRetryHint) {
        fullPrompt = fullPrompt
          ? `${fullPrompt}\n\n${stepRetryHint}`
          : stepRetryHint;
      }

      const retryRunId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const newStreamMessageId = crypto.randomUUID();
      streamingMessageIdRef.current = newStreamMessageId;
      batchStateRef.current = null;

      const newStreamMessage: UnifiedMessage = {
        id: newStreamMessageId,
        role: 'assistant',
        blocks: [
          {
            type: 'text',
            content:
              stepId !== undefined
                ? `${t('chat.regenerating')} (Step ${stepId})`
                : t('chat.regenerating')
          }
        ],
        timestamp: Date.now(),
        sourceMode: 'ask',
        agentRun: {
          runId: retryRunId,
          stepId: 1,
          startedAt: Date.now(),
          retryFromStepId: stepId
        }
      };
      setUnifiedMessages((prev) => [...prev, newStreamMessage]);

      try {
        const retryEditContext = await resolveEditImageContext(
          actualUserContent,
          referenceImages,
          !!userShortcut,
          historyMessages,
          false
        );
        referenceImages = retryEditContext.referenceImages;

        if (!isExtensionEnv()) {
          const retryFeature =
            chatMode === 'agent'
              ? selectedFeature ||
                (retryEditContext.targetImageUrl ? 'image' : undefined)
              : undefined;

          const useMinimalImageContext = shouldUseMinimalImageContext({
            feature: retryFeature,
            targetImageUrl: retryEditContext.targetImageUrl,
            targetImageMessageId: retryEditContext.targetImageMessageId
          });

          const chatOptions: ChatOptions = {
            context: {
              references: useMinimalImageContext ? undefined : refText,
              history: useMinimalImageContext ? undefined : history || undefined,
              referenceImages:
                referenceImages.length > 0 ? referenceImages : undefined,
              targetImageUrl: useMinimalImageContext
                ? undefined
                : retryEditContext.targetImageUrl,
              targetImageMessageId: useMinimalImageContext
                ? undefined
                : retryEditContext.targetImageMessageId,
              feature: retryFeature,
              retryStep: stepRetryContext
            },
            mode: chatMode
          };

          let imageUrl: string | undefined;
          let imageGenerated = false;
          let errorHandled = false;
          let retryStepId = 1;

          log.info(
            '[useRetryMessage] Starting smartChatStream iteration (retry flow)',
            {
              hasShortcut: !!userShortcut,
              hasImageRefs: referenceImages.length > 0
            }
          );

          for await (const chunk of smartChatStream(fullPrompt, chatOptions)) {
            log.info('[useRetryMessage] Retry: Received chunk:', {
              type: chunk.type,
              hasData: !!chunk.data
            });

            if (errorHandled) continue;

            if (chunk.type === 'status') {
              if (imageGenerated) continue;

              const statusMessage = chunk.data.message || '';
              if (statusMessage) {
                const statusStepId = ++retryStepId;
                setUnifiedMessages((prev) =>
                  prev.map((m) =>
                    m.id === newStreamMessageId
                      ? {
                          ...m,
                          blocks: applySmartChatChunkToBlocks(
                            (m.blocks || []) as UnifiedContentBlock[],
                            {
                              action: 'smart_chat_chunk',
                              blockType: 'status',
                              status: 'analyzing',
                              statusMessage,
                              retryFromStepId: stepId
                            }
                          ).blocks,
                          agentRun: m.agentRun
                            ? { ...m.agentRun, stepId: statusStepId }
                            : m.agentRun
                        }
                      : m
                  )
                );
              }
            } else if (chunk.type === 'text') {
              if (imageGenerated) continue;

              const content = chunk.data.content || '';
              if (!content) continue;
              const textStepId = ++retryStepId;
              setUnifiedMessages((prev) =>
                prev.map((m) =>
                  m.id === newStreamMessageId
                    ? {
                        ...m,
                        blocks: applySmartChatChunkToBlocks(
                          (m.blocks || []) as UnifiedContentBlock[],
                          {
                            action: 'smart_chat_chunk',
                            blockType: 'text',
                            chunk: content
                          }
                        ).blocks,
                        agentRun: m.agentRun
                          ? { ...m.agentRun, stepId: textStepId }
                          : m.agentRun
                      }
                    : m
                )
              );
            } else if (chunk.type === 'search') {
              const searchStepId = ++retryStepId;
              const searchData = chunk.data as {
                query?: string;
                sources?: Array<{
                  title?: string;
                  url?: string;
                  snippet?: string;
                }>;
              };
              const searchQuery =
                typeof searchData.query === 'string' ? searchData.query : '';
              const searchSources = Array.isArray(searchData.sources)
                ? searchData.sources.map((source) => ({
                    title:
                      typeof source?.title === 'string'
                        ? source.title
                        : typeof source?.url === 'string'
                          ? source.url
                          : '',
                    url: typeof source?.url === 'string' ? source.url : '',
                    snippet:
                      typeof source?.snippet === 'string'
                        ? source.snippet
                        : undefined
                  }))
                : [];

              setUnifiedMessages((prev) =>
                prev.map((m) =>
                  m.id === newStreamMessageId
                    ? {
                        ...m,
                        blocks: applySmartChatChunkToBlocks(
                          (m.blocks || []) as UnifiedContentBlock[],
                          {
                            action: 'smart_chat_chunk',
                            blockType: 'search',
                            query: searchQuery,
                            sources: searchSources,
                            retryFromStepId: stepId
                          }
                        ).blocks,
                        agentRun: m.agentRun
                          ? { ...m.agentRun, stepId: searchStepId }
                          : m.agentRun
                      }
                    : m
                )
              );
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
                            type: 'mode_switch' as const,
                            targetMode,
                            feature,
                            message
                          }
                        ]
                      }
                    : m
                )
              );
            } else if (chunk.type === 'image') {
              imageUrl = chunk.data.imageUrl;
              imageGenerated = true;
              const imageStepId = ++retryStepId;

              const originalUrl = imageUrl || '';
              setUnifiedMessages((prev) =>
                prev.map((m) =>
                  m.id === newStreamMessageId
                    ? {
                        ...m,
                        blocks: applySmartChatChunkToBlocks(
                          (m.blocks || []) as UnifiedContentBlock[],
                          {
                            action: 'smart_chat_chunk',
                            blockType: 'image',
                            imageUrl: originalUrl,
                            imageStatus: 'done'
                          }
                        ).blocks,
                        imageUrl: originalUrl,
                        agentRun: m.agentRun
                          ? { ...m.agentRun, stepId: imageStepId }
                          : m.agentRun
                      }
                    : m
                )
              );
              log.info('[useRetryMessage] Image generated:', originalUrl);
            } else if (chunk.type === 'batch_preview') {
              const { batchTasks, totalCount, estimatedCredits } = chunk.data;

              if (batchTasks && batchTasks.length > 0) {
                setUnifiedMessages((prev) =>
                  prev.map((m) =>
                    m.id === newStreamMessageId
                      ? {
                          ...m,
                          blocks: [
                            ...(m.blocks || []).filter((b) => b.type !== 'status'),
                            {
                              type: 'batch_preview' as const,
                              tasks: batchTasks.map((task: BatchImageTaskData) => ({
                                id: task.id,
                                index: task.index,
                                title: task.title,
                                prompt: task.prompt || '',
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
            } else if (chunk.type === 'batch_image') {
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

              log.info('[useRetryMessage] Retry: Received batch_image event:', {
                hasBatchTasks: !!batchTasks,
                batchTaskId,
                batchTaskStatus,
                hasImageUrl: !!batchTaskImageUrl,
                imageUrlLength: batchTaskImageUrl?.length || 0
              });

              if (batchTasks && batchTasks.length > 0) {
                batchStateRef.current = {
                  type: 'batch_image' as const,
                  tasks: batchTasks.map((task: BatchImageTaskData) => ({
                    id: task.id,
                    index: task.index,
                    title: task.title,
                    status: task.status as BatchImageTaskStatus,
                    imageUrl: task.imageUrl,
                    thumbnailUrl: task.thumbnailUrl,
                    errorMessage: task.errorMessage
                  })),
                  totalCount: totalCount || batchTasks.length,
                  completedCount: completedCount || 0,
                  failedCount: failedCount || 0
                };
              }

              if (batchTaskId && batchStateRef.current) {
                const taskToUpdate = batchStateRef.current.tasks.find(
                  (task) => task.id === batchTaskId
                );
                const newImageUrl = batchTaskImageUrl || taskToUpdate?.imageUrl;

                if (
                  batchTaskStatus === 'done' &&
                  newImageUrl &&
                  !taskToUpdate?.thumbnailUrl
                ) {
                  if (batchStateRef.current) {
                    batchStateRef.current.tasks =
                      batchStateRef.current.tasks.map((task) => {
                        if (task.id === batchTaskId) {
                          return { ...task, thumbnailUrl: newImageUrl };
                        }
                        return task;
                      });
                    setUnifiedMessages((prev) => [...prev]);
                    log.info(
                      '[useRetryMessage] Using original URL for batch image:',
                      batchTaskId
                    );
                  }
                }

                const updatedTasks: BatchImageTask[] =
                  batchStateRef.current.tasks.map((task) => {
                    if (task.id === batchTaskId) {
                      return {
                        ...task,
                        status: (batchTaskStatus ||
                          task.status) as BatchImageTaskStatus,
                        imageUrl: batchTaskImageUrl || task.imageUrl,
                        errorMessage: batchTaskError || task.errorMessage
                      };
                    }
                    return task;
                  });

                const newCompletedCount = updatedTasks.filter(
                  (task: BatchImageTask) => task.status === 'done'
                ).length;
                const newFailedCount = updatedTasks.filter(
                  (task: BatchImageTask) => task.status === 'error'
                ).length;

                batchStateRef.current = {
                  ...batchStateRef.current,
                  tasks: updatedTasks,
                  completedCount: newCompletedCount,
                  failedCount: newFailedCount
                };
              }

              if (batchStateRef.current) {
                const currentBatchState = batchStateRef.current;
                const allDone =
                  currentBatchState.completedCount +
                    currentBatchState.failedCount ===
                  currentBatchState.totalCount;

                setUnifiedMessages((prev) =>
                  prev.map((m) => {
                    if (m.id !== newStreamMessageId) return m;

                    const blocks: UnifiedContentBlock[] = [];

                    const statusText = allDone
                      ? currentBatchState.failedCount > 0
                        ? t('chat.imageGeneratedPartial', {
                            completed: currentBatchState.completedCount,
                            total: currentBatchState.totalCount
                          })
                        : t('chat.imageGenerated')
                      : t('chat.generatingImage', {
                          current:
                            currentBatchState.completedCount +
                            currentBatchState.failedCount +
                            1,
                          total: currentBatchState.totalCount
                        });
                    blocks.push({ type: 'text' as const, content: statusText });
                    blocks.push(currentBatchState);

                    return { ...m, blocks };
                  })
                );
              }
            } else if (chunk.type === 'tool_call') {
              const {
                id: toolId,
                name: toolName,
                input: toolInput,
                status: toolStatus,
                requiresConfirmation
              } = chunk.data as {
                id?: string;
                name?: string;
                input?: Record<string, unknown>;
                status?: ToolCallBlock['status'];
                requiresConfirmation?: boolean;
              };

              if (toolId && toolName) {
                setUnifiedMessages((prev) =>
                  prev.map((m) => {
                    if (m.id !== newStreamMessageId) return m;
                    const existingBlocks = (m.blocks || []).filter(
                      (b) => b.type !== 'status'
                    );
                    const existingToolBlock = existingBlocks.find(
                      (b): b is ToolCallBlock =>
                        b.type === 'tool_call' && 'id' in b && b.id === toolId
                    );
                    const resolvedStepId =
                      existingToolBlock?.stepId ?? ++retryStepId;
                    const resolvedTimestamp =
                      existingToolBlock?.timestamp || Date.now();
                    const resolvedStatus =
                      toolStatus ||
                      (requiresConfirmation ? 'pending' : 'running');

                    const nextBlocks = existingToolBlock
                      ? existingBlocks.map((block) =>
                          block.type === 'tool_call' &&
                          'id' in block &&
                          block.id === toolId
                            ? {
                                ...block,
                                input: toolInput || block.input,
                                status: resolvedStatus,
                                requiresConfirmation:
                                  requiresConfirmation ??
                                  block.requiresConfirmation,
                                runId: block.runId || retryRunId,
                                stepId: block.stepId || resolvedStepId,
                                timestamp: block.timestamp || resolvedTimestamp,
                                retryFromStepId:
                                  block.retryFromStepId ?? stepId
                              }
                            : block
                        )
                      : [
                          ...existingBlocks,
                          {
                            type: 'tool_call' as const,
                            id: toolId,
                            name: toolName,
                            input: toolInput || {},
                            status: resolvedStatus,
                            requiresConfirmation,
                            runId: retryRunId,
                            stepId: resolvedStepId,
                            timestamp: resolvedTimestamp,
                            retryFromStepId: stepId
                          }
                        ];

                    return {
                      ...m,
                      blocks: nextBlocks,
                      agentRun: m.agentRun
                        ? { ...m.agentRun, stepId: resolvedStepId }
                        : m.agentRun
                    };
                  })
                );
              }
            } else if (chunk.type === 'tool_result') {
              const {
                id: resultId,
                name: resultName,
                result,
                success,
                cancelled,
                message
              } = chunk.data as {
                id?: string;
                name?: string;
                result?: unknown;
                success: boolean;
                cancelled?: boolean;
                message?: string;
              };

              if (resultId) {
                const resultTimestamp = Date.now();
                setUnifiedMessages((prev) =>
                  prev.map((m) => {
                    if (m.id !== newStreamMessageId) return m;
                    const toolCallBlock = (m.blocks || []).find(
                      (b): b is ToolCallBlock =>
                        b.type === 'tool_call' &&
                        'id' in b &&
                        b.id === resultId
                    );
                    const resolvedStepId =
                      toolCallBlock?.stepId ?? ++retryStepId;
                    const resolvedStatus = cancelled
                      ? ('cancelled' as const)
                      : success
                        ? ('completed' as const)
                        : ('error' as const);
                    const resolvedResult = {
                      success,
                      data: result,
                      error: !success
                        ? message || (cancelled ? '工具调用已取消' : undefined)
                        : undefined
                    };
                    const updatedBlocks = (m.blocks || []).map((block) =>
                      block.type === 'tool_call' &&
                      'id' in block &&
                      block.id === resultId
                        ? {
                            ...block,
                            status: resolvedStatus,
                            result: resolvedResult,
                            runId: block.runId || retryRunId,
                            stepId: block.stepId || resolvedStepId,
                            timestamp: block.timestamp || resultTimestamp,
                            retryFromStepId:
                              block.retryFromStepId ?? stepId
                          }
                        : block
                    );

                    const newBlocks: UnifiedContentBlock[] = [...updatedBlocks];

                    if (resultName === 'web_search' && success && !cancelled && result) {
                      const searchResult = result as {
                        queries?: string[];
                        sources?: Array<{ url?: string; title?: string }>;
                      };
                      if (
                        searchResult.sources &&
                        searchResult.sources.length > 0
                      ) {
                        const searchQuery =
                          (toolCallBlock?.input?.query as string) ||
                          searchResult.queries?.[0] ||
                          '';

                        newBlocks.push({
                          type: 'search' as const,
                          query: searchQuery,
                          sources: searchResult.sources.map((s) => ({
                            url: s.url || '',
                            title: s.title || s.url || ''
                          })),
                          runId: retryRunId,
                          stepId: resolvedStepId,
                          timestamp: resultTimestamp,
                          retryFromStepId: stepId
                        });
                      }
                    }

                    return {
                      ...m,
                      blocks: newBlocks,
                      agentRun: m.agentRun
                        ? { ...m.agentRun, stepId: resolvedStepId }
                        : m.agentRun
                    };
                  })
                );
              }
            } else if (chunk.type === 'error') {
              const errorType = (chunk.data as { type?: string }).type as
                | 'QUOTA_EXCEEDED'
                | 'INSUFFICIENT_CREDITS'
                | 'INSUFFICIENT_MEDIA_CREDITS'
                | undefined;
              const errorMessage = chunk.data.message || t('chat.unknownError');
              const details = (
                chunk.data as {
                  details?: { max?: number; used?: number; resetAt?: string };
                }
              ).details;

              log.info('[useRetryMessage] Retry: Received error:', {
                errorType,
                errorMessage,
                details
              });

              if (
                errorType === 'QUOTA_EXCEEDED' ||
                errorType === 'INSUFFICIENT_CREDITS' ||
                errorType === 'INSUFFICIENT_MEDIA_CREDITS'
              ) {
                setUnifiedMessages((prev) =>
                  prev.map((m) =>
                    m.id === newStreamMessageId
                      ? {
                          ...m,
                          blocks: [
                            {
                              type: 'upgrade' as const,
                              errorType: errorType,
                              message: errorMessage,
                              used: details?.used,
                              max: details?.max,
                              resetAt: details?.resetAt
                            }
                          ]
                        }
                      : m
                  )
                );

                setCreditError({
                  type: 'quota',
                  feature: 'image_generation',
                  used: details?.used,
                  max: details?.max
                });
              } else {
                setUnifiedMessages((prev) =>
                  prev.map((m) =>
                    m.id === newStreamMessageId
                      ? {
                          ...m,
                          blocks: [
                            {
                              type: 'text' as const,
                              content: `⚠️ ${errorMessage}`
                            }
                          ]
                        }
                      : m
                  )
                );
              }

              errorHandled = true;
            }
          }

          window.dispatchEvent(new CustomEvent('credits-changed'));
        } else {
          // 扩展环境：使用 chrome.runtime.sendMessage
          const useMinimalImageContext = shouldUseMinimalImageContext({
            feature: 'image',
            targetImageUrl: retryEditContext.targetImageUrl,
            targetImageMessageId: retryEditContext.targetImageMessageId
          });

          const response = await chrome.runtime.sendMessage({
            action: 'smart_chat_stream',
            data: {
              prompt: fullPrompt,
              context: {
                references: useMinimalImageContext ? undefined : refText,
                history: useMinimalImageContext ? undefined : history || undefined,
                referenceImages:
                  referenceImages.length > 0 ? referenceImages : undefined,
                targetImageUrl: useMinimalImageContext
                  ? undefined
                  : retryEditContext.targetImageUrl,
                targetImageMessageId: useMinimalImageContext
                  ? undefined
                  : retryEditContext.targetImageMessageId
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
                m.id === newStreamMessageId
                  ? {
                      ...m,
                      blocks:
                        result.type === 'image'
                          ? [
                              { type: 'text' as const, content: finalContent },
                              {
                                type: 'image' as const,
                                imageUrl: result.imageUrl || '',
                                status: 'done' as const
                              }
                            ]
                          : [{ type: 'text' as const, content: finalContent }],
                      imageUrl:
                        result.type === 'image' ? result.imageUrl : undefined
                    }
                  : m
              )
            );
          } else {
            setUnifiedMessages((prev) =>
              prev.map((m) =>
                m.id === newStreamMessageId
                  ? {
                      ...m,
                      blocks: [
                        {
                          type: 'text' as const,
                          content: t('chat.retryFailed', {
                            error: response.error
                          })
                        }
                      ]
                    }
                  : m
              )
            );
          }
        }
      } catch (error) {
        log.error('[useRetryMessage] Retry failed:', error);
        setUnifiedMessages((prev) =>
          prev.map((m) =>
            m.id === newStreamMessageId
              ? {
                  ...m,
                  blocks: [
                    {
                      type: 'text' as const,
                      content: t('chat.retryFailedGeneric')
                    }
                  ]
                }
              : m
          )
        );
      } finally {
        streamingMessageIdRef.current = null;
        setUnifiedMessages((prev) =>
          prev.map((m) =>
            m.id === newStreamMessageId && m.agentRun && !m.agentRun.endedAt
              ? {
                  ...m,
                  agentRun: { ...m.agentRun, endedAt: Date.now() }
                }
              : m
          )
        );
        setIsRetrying(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      unifiedMessages,
      setUnifiedMessages,
      summaries,
      isRetrying,
      chatMode,
      selectedFeature,
      setChatMode,
      resolveEditImageContext,
      shortcuts,
      t
    ]
  );

  return { handleRetryMessage, isRetrying };
}

// Re-export for convenience
export { findLatestAssistantImage };
