/**
 * 统一聊天 Hook
 * 合并普通模式和 Agent 模式的状态管理
 * 解决两套独立状态导致的代码重复和维护困难问题
 */

import { useState, useCallback, useRef } from 'react';
import { createLogger } from '@/utils/logger';

const log = createLogger('UnifiedChat');
import i18n from '@/i18n';
import {
  smartChatStream,
  streamChat,
  type ChatOptions,
  type ToolCallData,
  type ToolResultData,
  type StatusData,
  type ErrorData
} from '@/services/agent-api';
import type {
  UnifiedMessage,
  UnifiedContentBlock,
  ChatMode,
  ChatContext,
  TextBlock,
  ToolCallBlock,
  ImageBlock,
  MessageReference,
  ImageReference,
  ShortcutInfo,
  BatchImageBlock,
  BatchImageTask,
  BatchPreviewBlock,
  BatchPreviewTask
} from '@/types/unified-chat';

// ============================================
// 类型守卫函数
// ============================================

function isToolCallBlock(block: UnifiedContentBlock): block is ToolCallBlock {
  return block.type === 'tool_call' && 'id' in block;
}
function resolveToolCallStatus(data: ToolCallData): ToolCallBlock['status'] {
  if (data.status) {
    return data.status;
  }
  return data.requiresConfirmation ? 'pending' : 'running';
}

function resolveToolResultStatus(data: ToolResultData): ToolCallBlock['status'] {
  if (data.cancelled) {
    return 'cancelled';
  }
  return data.success ? 'completed' : 'error';
}

function buildToolCallResult(data: ToolResultData): ToolCallBlock['result'] {
  const errorMessage =
    typeof data.message === 'string' && data.message.length > 0
      ? data.message
      : undefined;

  return {
    success: data.success,
    data: data.result,
    error: !data.success ? errorMessage : undefined
  };
}

function upsertToolCallBlock(
  msg: UnifiedMessage,
  block: ToolCallBlock
): UnifiedMessage {
  const existingIndex = msg.blocks.findIndex(
    (item) => isToolCallBlock(item) && item.id === block.id
  );

  if (existingIndex >= 0) {
    const updatedBlocks = [...msg.blocks];
    const existingBlock = updatedBlocks[existingIndex] as ToolCallBlock;
    updatedBlocks[existingIndex] = {
      ...existingBlock,
      ...block,
      stepId: existingBlock.stepId ?? block.stepId,
      timestamp: existingBlock.timestamp ?? block.timestamp,
      runId: existingBlock.runId ?? block.runId,
      retryFromStepId: existingBlock.retryFromStepId ?? block.retryFromStepId
    };

    return {
      ...msg,
      blocks: updatedBlocks
    };
  }

  return {
    ...msg,
    blocks: [...msg.blocks, block]
  };
}

// ============================================
// 类型定义
// ============================================

export interface UnifiedChatOptions {
  /** 默认聊天模式 */
  defaultMode?: ChatMode;
  /** AI 提供商 */
  provider?: 'claude' | 'gemini' | 'auto';
  /** 超时时间（毫秒） */
  timeout?: number;
}

export interface SendMessageOptions {
  /** 上下文信息 */
  context?: ChatContext;
  /** 用户选择的功能（image/slide_deck 等），只有明确选择时才启用对应功能 */
  feature?: string;
  /** 是否强制使用图片模式 */
  forceImageMode?: boolean;
  /** 图片设置后缀 */
  imageSettingsSuffix?: string;
  /** 消息引用 */
  references?: MessageReference[];
  /** 图片引用 */
  imageReferences?: ImageReference[];
  /** 快捷指令信息 */
  shortcut?: ShortcutInfo;
  /** 显示内容（与实际发送内容不同时使用） */
  displayContent?: string;
}

export interface UnifiedChatReturn {
  /** 消息列表 */
  messages: UnifiedMessage[];
  /** 是否加载中 */
  isLoading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 当前状态（分析中/搜索中/生成中等） */
  currentStatus: string | null;
  /** 当前模式 */
  mode: ChatMode;
  /** 会话 ID */
  sessionId: string;
  /** 发送消息 */
  sendMessage: (
    content: string,
    options?: SendMessageOptions
  ) => Promise<{ tokenUsage?: { inputTokens: number; outputTokens: number } }>;
  /** 停止生成 */
  stopGeneration: () => void;
  /** 清空消息 */
  clearMessages: () => void;
  /** 重试最后一条消息 */
  retryLastMessage: () => void;
  /** 切换模式 */
  setMode: (mode: ChatMode) => void;
  /** 加载历史消息 */
  loadMessages: (messages: UnifiedMessage[]) => void;
  /** 设置消息（用于外部更新） */
  setMessages: React.Dispatch<React.SetStateAction<UnifiedMessage[]>>;
  /** 更新特定消息（用于图片缩略图等后续更新） */
  updateMessage: (messageId: string, updates: Partial<UnifiedMessage>) => void;
  /** 重置会话 */
  resetSession: () => void;
}

// ============================================
// 辅助函数
// ============================================

function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * 不可变更新：更新最后一条助手消息
 * 确保 React 能正确检测状态变化
 */
function updateLastAssistantMessage(
  messages: UnifiedMessage[],
  updater: (msg: UnifiedMessage) => UnifiedMessage
): UnifiedMessage[] {
  if (messages.length === 0) return messages;
  const lastIndex = messages.length - 1;
  const lastMsg = messages[lastIndex];
  if (lastMsg.role !== 'assistant') return messages;
  return messages.map((msg, index) =>
    index === lastIndex ? updater(msg) : msg
  );
}

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

interface CreateUserMessageOptions {
  references?: MessageReference[];
  imageReferences?: ImageReference[];
  shortcut?: ShortcutInfo;
  runId?: string;
  stepId?: number;
}

function createUserMessage(
  content: string,
  sourceMode: ChatMode,
  options?: CreateUserMessageOptions
): UnifiedMessage {
  return {
    id: generateMessageId(),
    role: 'user',
    blocks: [{ type: 'text', content }],
    timestamp: Date.now(),
    sourceMode,
    references: options?.references,
    imageReferences: options?.imageReferences,
    shortcut: options?.shortcut,
    agentRun: options?.runId
      ? {
          runId: options.runId,
          stepId: options.stepId ?? 0,
          startedAt: Date.now(),
          endedAt: Date.now()
        }
      : undefined
  };
}

function createEmptyAssistantMessage(
  sourceMode: ChatMode,
  runId?: string,
  stepId: number = 1
): UnifiedMessage {
  return {
    id: generateMessageId(),
    role: 'assistant',
    blocks: [],
    timestamp: Date.now(),
    sourceMode,
    agentRun: runId
      ? {
          runId,
          stepId,
          startedAt: Date.now()
        }
      : undefined
  };
}

// ============================================
// Hook 实现
// ============================================

export function useUnifiedChat(
  options: UnifiedChatOptions = {}
): UnifiedChatReturn {
  const { defaultMode = 'ask' } = options;

  // 统一的状态
  const [messages, setMessages] = useState<UnifiedMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState<string | null>(null);
  const [mode, setMode] = useState<ChatMode>(defaultMode);

  // refs
  const abortControllerRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string>(generateSessionId());

  /**
   * Agent 模式发送消息
   * 根据 feature 选择不同的 API：
   * - image/slide_deck: 使用 smartChatStream (Gemini) 支持图片/PPT 生成
   * - 其他（普通对话）: 使用 streamChat (Claude Agent) 支持工具调用（卡片管理等）
   */
  const sendAgentMessage = useCallback(
    async (content: string, context?: ChatContext, signal?: AbortSignal) => {
      const feature = context?.feature;

      log.info('[useUnifiedChat] sendAgentMessage:', {
        feature,
        hasReferenceImages:
          !!context?.referenceImages && context.referenceImages.length > 0,
        referenceImagesCount: context?.referenceImages?.length || 0,
        projectId: context?.projectId
      });

      const useSmartAgentStream =
        feature === 'image' || !!context?.targetImageUrl;

      const chatOptions: ChatOptions = {
        provider: 'auto',
        sessionId: sessionIdRef.current,
        signal,
        context: {
          references: context?.references,
          history: context?.history,
          pageInfo: context?.pageInfo,
          referenceImages: context?.referenceImages,
          targetImageUrl: context?.targetImageUrl,
          targetImageMessageId: context?.targetImageMessageId,
          projectId: context?.projectId,
          feature: context?.feature
        },
        mode: 'agent'
      };

      let textContent = '';
      let hasImage = false;
      let chunkCount = 0;

      try {
        const stream = (
          useSmartAgentStream
            ? smartChatStream(content, chatOptions)
            : streamChat(content, chatOptions)
        ) as AsyncGenerator<{ type: string; data: unknown }>;

        log.info(
          '[useUnifiedChat] Using agent stream:',
          useSmartAgentStream ? 'smartChatStream' : 'streamChat'
        );
        for await (const chunk of stream) {
            chunkCount++;
            log.info(
              '[useUnifiedChat] Received chunk #' + chunkCount + ':',
              chunk.type,
              JSON.stringify(chunk.data).substring(0, 200)
            );
            // 原有的 smartChatStream 处理逻辑
            switch (chunk.type) {
              case 'text': {
                const data = chunk.data as { content?: string };
                textContent += data.content || '';
                break;
              }

              case 'image': {
                // 图片生成：直接显示图片，不需要打字机效果
                hasImage = true;
                const imageData = chunk.data as {
                  imageUrl?: string;
                  isTemporaryUrl?: boolean;
                };
                let imageUrl = imageData.imageUrl;

                if (imageUrl) {
                  // 如果是临时 URL（Z-Image 兜底），需要下载转存
                  if (
                    imageData.isTemporaryUrl &&
                    !imageUrl.startsWith('data:')
                  ) {
                    log.info(
                      '[useUnifiedChat] Downloading temporary image URL...'
                    );
                    try {
                      const response = await fetch(imageUrl);
                      if (response.ok) {
                        const blob = await response.blob();
                        const reader = new FileReader();
                        imageUrl = await new Promise<string>((resolve) => {
                          reader.onloadend = () =>
                            resolve(reader.result as string);
                          reader.readAsDataURL(blob);
                        });
                        log.debug(
                          '[useUnifiedChat] Temporary image converted to base64'
                        );
                      }
                    } catch (err) {
                      log.error(
                        '[useUnifiedChat] Failed to download temporary image:',
                        err
                      );
                      // 失败时仍然使用原始 URL
                    }
                  }

                  // 确保 imageUrl 有值
                  const finalImageUrl = imageUrl || '';

                  setMessages((prev) =>
                    updateLastAssistantMessage(prev, (msg) => {
                      // 移除状态块，添加图片块
                      const filteredBlocks = msg.blocks.filter(
                        (b) => b.type !== 'status'
                      );
                      return {
                        ...msg,
                        blocks: [
                          ...filteredBlocks,
                          {
                            type: 'text' as const,
                            content: i18n.t('workspace:chat.imageGenerated')
                          },
                          {
                            type: 'image' as const,
                            imageUrl: finalImageUrl,
                            status: 'done' as const
                          }
                        ],
                        imageUrl: finalImageUrl
                      };
                    })
                  );
                }
                break;
              }

              case 'tool_call': {
                const data = chunk.data as ToolCallData;
                setMessages((prev) =>
                  updateLastAssistantMessage(prev, (msg) => {
                    const stepId = chunkCount;
                    const timestamp = Date.now();
                    const nextMessage = upsertToolCallBlock(msg, {
                      type: 'tool_call' as const,
                      id: data.id,
                      name: data.name,
                      input: data.input,
                      status: resolveToolCallStatus(data),
                      requiresConfirmation: data.requiresConfirmation,
                      runId: msg.agentRun?.runId,
                      stepId,
                      timestamp
                    });

                    return {
                      ...nextMessage,
                      agentRun: nextMessage.agentRun
                        ? { ...nextMessage.agentRun, stepId }
                        : nextMessage.agentRun
                    };
                  })
                );
                break;
              }

              case 'tool_result': {
                const data = chunk.data as ToolResultData;
                setMessages((prev) =>
                  updateLastAssistantMessage(prev, (msg) => {
                    const updatedBlocks = msg.blocks.map((block) =>
                      isToolCallBlock(block) && block.id === data.id
                        ? {
                            ...block,
                            status: resolveToolResultStatus(data),
                            result: buildToolCallResult(data)
                          }
                        : block
                    );
                    return {
                      ...msg,
                      blocks: [
                        ...updatedBlocks,
                        {
                          type: 'tool_result' as const,
                          id: data.id,
                          name: data.name,
                          result: data.result,
                          success: data.success,
                          cancelled: data.cancelled,
                          message: data.message,
                          runId: msg.agentRun?.runId,
                          stepId: chunkCount,
                          timestamp: Date.now()
                        }
                      ],
                      agentRun: msg.agentRun
                        ? { ...msg.agentRun, stepId: chunkCount }
                        : msg.agentRun
                    };
                  })
                );
                break;
              }

              case 'status': {
                const data = chunk.data as StatusData;
                setCurrentStatus(data.status);
                // 只在非 agent 模式下插入消息状态块，避免与 Agent 执行轨迹面板重复
                if (chatOptions.mode !== 'agent') setMessages((prev) =>
                  updateLastAssistantMessage(prev, (msg) => {
                    // 查找是否已有状态块
                    const statusBlockIndex = msg.blocks.findIndex(
                      (b) => b.type === 'status'
                    );
                    const statusBlock = {
                      type: 'status' as const,
                      status: 'analyzing' as const,
                      message: data.message || data.status || '',
                      runId: msg.agentRun?.runId,
                      stepId: chunkCount,
                      timestamp: Date.now()
                    };

                    if (statusBlockIndex >= 0) {
                      // 更新现有状态块
                      const newBlocks = [...msg.blocks];
                      newBlocks[statusBlockIndex] = statusBlock;
                      return {
                        ...msg,
                        blocks: newBlocks,
                        agentRun: msg.agentRun
                          ? { ...msg.agentRun, stepId: chunkCount }
                          : msg.agentRun
                      };
                    } else {
                      // 在开头添加状态块
                      return {
                        ...msg,
                        blocks: [statusBlock, ...msg.blocks],
                        agentRun: msg.agentRun
                          ? { ...msg.agentRun, stepId: chunkCount }
                          : msg.agentRun
                      };
                    }
                  })
                );
                break;
              }

              case 'error': {
                const data = chunk.data as ErrorData;
                setError(data.message);
                // 更新消息状态，显示错误信息给用户
                setMessages((prev) =>
                  updateLastAssistantMessage(prev, (msg) => {
                    // 移除状态块，添加错误文本
                    const filteredBlocks = msg.blocks.filter(
                      (b) => b.type !== 'status'
                    );
                    return {
                      ...msg,
                      blocks: [
                        ...filteredBlocks,
                        { type: 'text' as const, content: `❌ ${data.message}` }
                      ]
                    };
                  })
                );
                break;
              }

              case 'done': {
                setCurrentStatus(null);
                if (textContent && !hasImage) {
                  setMessages((prev) =>
                    updateLastAssistantMessage(prev, (msg) => {
                      const filteredBlocks = msg.blocks.filter(
                        (b) => b.type !== 'status'
                      );
                      return {
                        ...msg,
                        blocks: [
                          ...filteredBlocks,
                          { type: 'text' as const, content: textContent }
                        ],
                        typewriter: true
                      };
                    })
                  );
                } else if (!hasImage) {
                  setMessages((prev) =>
                    updateLastAssistantMessage(prev, (msg) => {
                      const hasStatusBlock = msg.blocks.some(
                        (b) => b.type === 'status'
                      );
                      if (hasStatusBlock) {
                        const filteredBlocks = msg.blocks.filter(
                          (b) => b.type !== 'status'
                        );
                        return { ...msg, blocks: filteredBlocks };
                      }
                      return msg;
                    })
                  );
                }
                break;
              }
            }
          }
        log.info(
          '[useUnifiedChat] sendAgentMessage completed, total chunks:',
          chunkCount
        );
      } catch (err) {
        log.error('[useUnifiedChat] sendAgentMessage error:', err);
        throw err;
      }
    },
    []
  );

  /**
   * Ask 模式发送消息（快捷问答）
   */
  const sendAskMessage = useCallback(
    async (
      content: string,
      context?: ChatContext,
      messageId?: string,
      imageSettingsSuffix?: string,
      signal?: AbortSignal
    ): Promise<{
      tokenUsage?: { inputTokens: number; outputTokens: number };
    }> => {
      const chatOptions: ChatOptions = {
        signal,
        context: {
          references: context?.references,
          history: context?.history,
          referenceImages: context?.referenceImages
        },
        mode: 'ask' // 明确传递 ask 模式，禁用图片生成意图识别
      };

      // 如果有图片设置后缀，添加到 prompt
      const promptToSend = imageSettingsSuffix
        ? content + imageSettingsSuffix
        : content;

      let textContent = '';
      let generatedImageUrl: string | null = null;
      let textUpdatePending = false;
      let textUpdateTimer: ReturnType<typeof setTimeout> | null = null;
      const TEXT_THROTTLE_MS = 50; // 每50ms最多更新一次文本渲染
      let finalTokenUsage:
        | { inputTokens: number; outputTokens: number }
        | undefined;

      const flushTextUpdate = () => {
        if (!messageId || !textUpdatePending) return;
        textUpdatePending = false;
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== messageId) return m;
            const blocks: UnifiedContentBlock[] = [];
            if (generatedImageUrl) {
              blocks.push({ type: 'image' as const, imageUrl: generatedImageUrl, status: 'done' as const });
            }
            let displayText = textContent;
            if (generatedImageUrl) {
              displayText = displayText.replace(/!\[.*?\]\(data:image\/[^)]+\)/g, '').trim();
            }
            if (displayText) {
              blocks.push({ type: 'text' as const, content: displayText });
            }
            return { ...m, blocks, ...(generatedImageUrl ? { imageUrl: generatedImageUrl } : {}) };
          })
        );
      };

      for await (const chunk of smartChatStream(promptToSend, chatOptions)) {
        if (chunk.type === 'status') {
          // Ask 模式：不显示状态消息，只保持 loading 状态
          // 状态由 isLoading 控制，UI 显示闪烁的生成图标
          continue;
        } else if (chunk.type === 'mode_switch') {
          // Ask 模式下检测到 Agent 功能请求，显示切换引导
          const { targetMode, feature, message } = chunk.data as {
            targetMode: 'agent';
            feature: 'image' | 'slide_deck' | 'other';
            message: string;
          };
          if (messageId) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === messageId
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
          }
        } else if (chunk.type === 'text') {
          const chunkContent = chunk.data.content || '';
          textContent += chunkContent;
          textUpdatePending = true;

          // 节流：每 TEXT_THROTTLE_MS 最多渲染一次
          if (!textUpdateTimer) {
            textUpdateTimer = setTimeout(() => {
              textUpdateTimer = null;
              flushTextUpdate();
            }, TEXT_THROTTLE_MS);
          }
        } else if (chunk.type === 'search') {
          // Ask 模式联网搜索结果
          const { query, sources } = chunk.data as {
            query: string;
            sources: Array<{ url: string; title: string }>;
          };
          if (messageId && sources && sources.length > 0) {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== messageId) return m;
                // 在现有 blocks 前添加搜索块
                const existingBlocks = m.blocks.filter(
                  (b) => b.type !== 'search'
                );
                return {
                  ...m,
                  blocks: [
                    {
                      type: 'search' as const,
                      query,
                      sources
                    },
                    ...existingBlocks
                  ]
                };
              })
            );
          }
        } else if (chunk.type === 'image') {
          const imageUrl = chunk.data.imageUrl;
          if (messageId && imageUrl) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === messageId
                  ? {
                      ...m,
                      blocks: [
                        {
                          type: 'text',
                          content: i18n.t('workspace:chat.imageGenerated')
                        } as TextBlock,
                        {
                          type: 'image',
                          imageUrl,
                          status: 'done'
                        } as ImageBlock
                      ],
                      imageUrl
                    }
                  : m
              )
            );
          }
        } else if (chunk.type === 'tool_call') {
          // 工具调用事件
          const data = chunk.data as ToolCallData;
          const { id: toolId, name: toolName, input: toolInput } = data;
          if (messageId && toolId && toolName) {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== messageId) return m;
                const nextStepId = (m.agentRun?.stepId || 0) + 1;
                const timestamp = Date.now();
                const nextMessage = upsertToolCallBlock(
                  { ...m, blocks: m.blocks.filter((b) => b.type !== 'status') },
                  {
                    type: 'tool_call' as const,
                    id: toolId,
                    name: toolName,
                    input: toolInput || {},
                    status: resolveToolCallStatus(data),
                    requiresConfirmation: data.requiresConfirmation,
                    runId: m.agentRun?.runId,
                    stepId: nextStepId,
                    timestamp
                  }
                );

                return {
                  ...nextMessage,
                  agentRun: nextMessage.agentRun
                    ? { ...nextMessage.agentRun, stepId: nextStepId }
                    : nextMessage.agentRun
                };
              })
            );
          }
        } else if (chunk.type === 'tool_result') {
          // 工具结果事件
          const data = chunk.data as ToolResultData;
          const { id: resultId, name: resultName, result, success } = data;
          if (messageId && resultId) {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== messageId) return m;
                const nextStepId = (m.agentRun?.stepId || 0) + 1;
                const resultTimestamp = Date.now();

                // 更新对应工具调用的状态
                const updatedBlocks = m.blocks.map((block) =>
                  isToolCallBlock(block) && block.id === resultId
                    ? {
                        ...block,
                        status: resolveToolResultStatus(data),
                        result: buildToolCallResult(data)
                      }
                    : block
                );

                // 构建新的 blocks 数组
                const newBlocks: UnifiedContentBlock[] = [
                  ...updatedBlocks,
                  {
                    type: 'tool_result' as const,
                    id: resultId,
                    name: resultName,
                    result,
                    success,
                    cancelled: data.cancelled,
                    message: data.message,
                    runId: m.agentRun?.runId,
                    stepId: nextStepId,
                    timestamp: resultTimestamp
                  }
                ];

                // 如果是 generate_image 工具且成功，隐藏工具块并添加 image block
                if (resultName === 'generate_image' && success && result) {
                  const imgResult = result as { imageUrl?: string };
                  if (imgResult.imageUrl) {
                    generatedImageUrl = imgResult.imageUrl;
                  }
                }

                // 如果是 web_search 工具且有搜索来源，添加 search block 显示来源链接
                if (resultName === 'web_search' && success && result) {
                  const searchResult = result as {
                    queries?: string[];
                    sources?: Array<{ url?: string; title?: string }>;
                  };
                  if (searchResult.sources && searchResult.sources.length > 0) {
                    // 查找对应的 tool_call 获取搜索查询词
                    const toolCallBlock = m.blocks.find(
                      (b) => isToolCallBlock(b) && b.id === resultId
                    ) as ToolCallBlock | undefined;
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
                      runId: m.agentRun?.runId,
                      stepId: nextStepId,
                      timestamp: resultTimestamp
                    });
                  }
                }

                return {
                  ...m,
                  blocks: newBlocks,
                  agentRun: m.agentRun
                    ? { ...m.agentRun, stepId: nextStepId }
                    : m.agentRun
                };
              })
            );
          }
        } else if (chunk.type === 'batch_preview') {
          // 批量图片预览块（等待用户确认）
          const { batchTasks, totalCount, estimatedCredits } = chunk.data;

          if (messageId && batchTasks && batchTasks.length > 0) {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== messageId) return m;

                const previewBlock: BatchPreviewBlock = {
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
                };

                // 移除 status 块，添加 batch_preview 块
                const filteredBlocks = m.blocks.filter(
                  (b) => b.type !== 'status'
                );
                return { ...m, blocks: [...filteredBlocks, previewBlock] };
              })
            );
          }
        } else if (chunk.type === 'batch_image') {
          // 批量图片块处理
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

          if (messageId) {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== messageId) return m;

                // 查找现有的 batch_image 块
                const batchBlockIdx = m.blocks.findIndex(
                  (b) => b.type === 'batch_image'
                );

                // 如果有完整的任务列表更新（初始化或完整更新）
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
                    })) as BatchImageTask[],
                    totalCount: totalCount || batchTasks.length,
                    completedCount: completedCount || 0,
                    failedCount: failedCount || 0
                  };

                  if (batchBlockIdx >= 0) {
                    const newBlocks = [...m.blocks];
                    newBlocks[batchBlockIdx] = batchBlock;
                    return { ...m, blocks: newBlocks };
                  }
                  // 移除 status 块，添加 batch_image 块
                  const filteredBlocks = m.blocks.filter(
                    (b) => b.type !== 'status'
                  );
                  return { ...m, blocks: [...filteredBlocks, batchBlock] };
                }

                // 如果是单个任务状态更新
                if (batchTaskId && batchBlockIdx >= 0) {
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

                  // 重新计算完成和失败数
                  const newCompletedCount = updatedTasks.filter(
                    (t) => t.status === 'done'
                  ).length;
                  const newFailedCount = updatedTasks.filter(
                    (t) => t.status === 'error'
                  ).length;

                  const updatedBatch: BatchImageBlock = {
                    ...existingBatch,
                    tasks: updatedTasks as BatchImageTask[],
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
          }
        } else if (chunk.type === 'done') {
          // 流结束，立即刷新最后的文本
          if (textUpdateTimer) { clearTimeout(textUpdateTimer); textUpdateTimer = null; }
          flushTextUpdate();
          // 获取 token 使用量用于后付费
          if (chunk.data.tokenUsage) {
            finalTokenUsage = chunk.data.tokenUsage;
          }
        } else if (chunk.type === 'error') {
          if (textUpdateTimer) { clearTimeout(textUpdateTimer); textUpdateTimer = null; }
          flushTextUpdate();
          const errorMessage =
            chunk.data.message || i18n.t('workspace:chat.unknownError');
          setError(errorMessage);
          if (messageId) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === messageId
                  ? {
                      ...m,
                      blocks: [
                        {
                          type: 'text',
                          content: `错误: ${errorMessage}`
                        } as TextBlock
                      ]
                    }
                  : m
              )
            );
          }
        }
      }

      return { tokenUsage: finalTokenUsage };
    },
    []
  );

  /**
   * 发送消息（统一入口）
   */
  const sendMessage = useCallback(
    async (
      content: string,
      options?: SendMessageOptions
    ): Promise<{
      tokenUsage?: { inputTokens: number; outputTokens: number };
    }> => {
      log.info(
        '[useUnifiedChat] sendMessage called, mode:',
        mode,
        'content length:',
        content.length
      );
      if (!content.trim()) {
        log.info('[useUnifiedChat] sendMessage: empty content, returning');
        return {};
      }
      if (isLoading) {
        log.info('[useUnifiedChat] sendMessage: already loading, returning');
        return {};
      }

      // 取消之前的请求
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // 创建新的 AbortController
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      setIsLoading(true);
      setError(null);

      // 用户消息显示内容（可能与实际发送内容不同，如快捷指令场景）
      const displayContent = options?.displayContent || content;
      // 不生成 runId，避免显示 Agent 执行轨迹面板（Open run/Runtime）
      const runId = undefined;

      // 创建用户消息（包含引用、快捷指令等）
      const userMessage = createUserMessage(displayContent, mode, {
        references: options?.references,
        imageReferences: options?.imageReferences,
        shortcut: options?.shortcut,
        runId,
        stepId: 0
      });
      // 创建助手消息占位
      const assistantMessage = createEmptyAssistantMessage(mode, runId, 1);

      setMessages((prev) => [...prev, userMessage, assistantMessage]);

      let result: {
        tokenUsage?: { inputTokens: number; outputTokens: number };
      } = {};

      try {
        log.info(
          '[useUnifiedChat] sendMessage: entering try block, mode:',
          mode
        );
        if (mode === 'agent') {
          log.info('[useUnifiedChat] sendMessage: calling sendAgentMessage');
          // Agent 模式：使用工具调用
          // 将 feature 合并到 context 中传递给后端
          const agentContext: ChatContext = {
            ...options?.context,
            feature: options?.feature // 用户选择的功能（image/slide_deck 等）
          };
          const agentContent = options?.imageSettingsSuffix
            ? content + options.imageSettingsSuffix
            : content;
          await sendAgentMessage(
            agentContent,
            agentContext,
            abortController.signal
          );
          log.info('[useUnifiedChat] sendMessage: sendAgentMessage completed');
        } else {
          log.info('[useUnifiedChat] sendMessage: calling sendAskMessage');
          // Ask 模式：快捷问答
          result = await sendAskMessage(
            content,
            options?.context,
            assistantMessage.id,
            options?.imageSettingsSuffix,
            abortController.signal
          );
          log.info('[useUnifiedChat] sendMessage: sendAskMessage completed');
        }
      } catch (err) {
        // 如果是取消请求，不显示错误
        if (err instanceof Error && err.name === 'AbortError') {
          log.info('[useUnifiedChat] Request was aborted');
          return {};
        }
        const message =
          err instanceof Error
            ? err.message
            : i18n.t('workspace:chat.sendFailed');
        setError(message);
        log.error('[useUnifiedChat] Error caught:', message);

        // 更新助手消息为错误状态（使用不可变更新）
        // 移除状态块，添加错误消息
        setMessages((prev) =>
          updateLastAssistantMessage(prev, (msg) => {
            // 过滤掉状态块
            const filteredBlocks = msg.blocks.filter(
              (b) => b.type !== 'status'
            );
            // 如果没有其他内容块，添加错误消息
            if (filteredBlocks.length === 0) {
              return {
                ...msg,
                blocks: [
                  {
                    type: 'text' as const,
                    content: `错误: ${message}`
                  }
                ]
              };
            }
            // 如果有其他内容，保留它们并移除状态块
            return {
              ...msg,
              blocks: filteredBlocks,
              agentRun: msg.agentRun
                ? { ...msg.agentRun, endedAt: Date.now() }
                : msg.agentRun
            };
          })
        );
      } finally {
        setMessages((prev) =>
          updateLastAssistantMessage(prev, (msg) => {
            if (msg.role !== 'assistant') return msg;
            if (!msg.agentRun?.runId || msg.agentRun.endedAt) return msg;
            return {
              ...msg,
              agentRun: { ...msg.agentRun, endedAt: Date.now() }
            };
          })
        );
        setIsLoading(false);
        setCurrentStatus(null);
      }

      return result;
    },
    [isLoading, mode, sendAgentMessage, sendAskMessage]
  );

  /**
   * 停止生成
   */
  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setCurrentStatus(null);
  }, []);

  /**
   * 清空消息
   */
  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
    // 生成新的会话 ID
    sessionIdRef.current = generateSessionId();
  }, []);

  /**
   * 重试最后一条消息
   */
  const retryLastMessage = useCallback(() => {
    if (messages.length < 2) return;

    // 找到最后一条用户消息
    const lastUserMessage = [...messages]
      .reverse()
      .find((m) => m.role === 'user');

    if (!lastUserMessage) return;

    const textBlock = lastUserMessage.blocks.find((b) => b.type === 'text') as
      | TextBlock
      | undefined;
    if (!textBlock) return;

    // 移除最后的用户消息和助手消息
    setMessages((prev) => prev.slice(0, -2));

    // 重新发送
    sendMessage(textBlock.content);
  }, [messages, sendMessage]);

  /**
   * 加载历史消息
   */
  const loadMessages = useCallback((msgs: UnifiedMessage[]) => {
    setMessages(msgs);
  }, []);

  /**
   * 更新特定消息（用于图片缩略图等后续更新）
   */
  const updateMessage = useCallback(
    (messageId: string, updates: Partial<UnifiedMessage>) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, ...updates } : m))
      );
    },
    []
  );

  /**
   * 重置会话（清空消息并生成新的会话 ID）
   */
  const resetSession = useCallback(() => {
    setMessages([]);
    setError(null);
    setCurrentStatus(null);
    sessionIdRef.current = generateSessionId();
  }, []);

  return {
    messages,
    isLoading,
    error,
    currentStatus,
    mode,
    sessionId: sessionIdRef.current,
    sendMessage,
    stopGeneration,
    clearMessages,
    retryLastMessage,
    setMode,
    loadMessages,
    setMessages,
    updateMessage,
    resetSession
  };
}
