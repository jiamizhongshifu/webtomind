/**
 * 虚拟滚动消息列表组件
 * 使用 @tanstack/react-virtual 实现高性能消息渲染
 * 只渲染可见区域内的消息，大幅减少 DOM 节点数量
 */

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { createLogger } from '@/utils/logger';
import { useVirtualizer } from '@tanstack/react-virtual';
import { predictMessageHeights } from '@/utils/text-measure';

const log = createLogger('VirtualMessageList');
import type { UnifiedMessage, TextBlock } from '@/types/unified-chat';
import type { SearchResultBatchItem } from '@/types/content-blocks';
import { useTranslation } from 'react-i18next';
import { Zap, Copy, RefreshCw, FileText, ChevronDown, ChevronRight } from 'lucide-react';
import { MessageBlocks } from './MessageBlocks';
import { focusSkillRun } from '../utils/skill-run-events';

// 辅助函数：从 UnifiedMessage 获取文本内容
const getMessageText = (msg: UnifiedMessage): string => {
  const textBlock = msg.blocks?.find((b) => b.type === 'text') as
    | TextBlock
    | undefined;
  return textBlock?.content || '';
};

const formatRunDuration = (message: UnifiedMessage): string | null => {
  const startedAt = message.agentRun?.startedAt;
  const endedAt = message.agentRun?.endedAt;
  if (!startedAt || !endedAt || endedAt < startedAt) return null;
  const diff = endedAt - startedAt;
  if (diff < 1000) return `${diff}ms`;
  return `${(diff / 1000).toFixed(1)}s`;
};

/**
 * Memo 化的用户消息组件
 */
interface UserMessageItemProps {
  message: UnifiedMessage;
  onReferenceClick?: (summaryId: string) => void;
  onRetryMessage?: (messageId: string, stepId?: number) => void;
  retryAssistantMessageId?: string;
  onSaveMessage?: (message: UnifiedMessage) => void;
}

const UserMessageItem = React.memo(function UserMessageItem({
  message,
  onReferenceClick,
  onRetryMessage,
  retryAssistantMessageId,
  onSaveMessage
}: UserMessageItemProps) {
  const { t } = useTranslation('workspace');
  const contentStr = getMessageText(message);
  const [copySuccess, setCopySuccess] = useState(false);

  const handleCopy = useCallback(async () => {
    const textToCopy = contentStr.trim();
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopySuccess(true);
      window.setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      setCopySuccess(false);
    }
  }, [contentStr]);

  const handleRetry = useCallback(() => {
    if (!retryAssistantMessageId || !onRetryMessage) return;
    onRetryMessage(retryAssistantMessageId);
  }, [onRetryMessage, retryAssistantMessageId]);

  const handleSaveNote = useCallback(() => {
    onSaveMessage?.(message);
  }, [message, onSaveMessage]);

  return (
    <div className="max-w-[75%] flex flex-col items-end gap-1.5">
      {/* 快捷指令标签 + 引用标签 + 图片引用标签（消息上方） */}
      {(message.shortcut ||
        (message.references && message.references.length > 0) ||
        (message.imageReferences && message.imageReferences.length > 0)) && (
        <div className="flex flex-wrap justify-end gap-1">
          {/* 快捷指令标签 */}
          {message.shortcut && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 rounded-full text-xs text-amber-700">
              <Zap className="w-3 h-3" />
              <span className="max-w-[100px] truncate">
                {message.shortcut.name}
              </span>
            </span>
          )}
          {/* 引用标签 */}
          {message.references?.map((ref) => (
            <button
              type="button"
              key={ref.id}
              onClick={() => onReferenceClick?.(ref.summaryId)}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 hover:bg-blue-200 rounded-full text-xs text-blue-700 transition-colors cursor-pointer"
              title={t('chat.viewOriginal')}
            >
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              <span className="max-w-[100px] truncate">
                {ref.summaryTitle || ref.preview}
              </span>
            </button>
          ))}
          {/* 图片引用标签 */}
          {message.imageReferences?.map((imgRef) => (
            <span
              key={imgRef.id}
              className="inline-flex items-center gap-1.5 px-1.5 py-0.5 bg-purple-100 rounded-full text-xs text-purple-700"
              title={t('chat.referenceImage')}
            >
              {imgRef.thumbnailUrl ? (
                <img
                  src={imgRef.thumbnailUrl}
                  alt={imgRef.preview}
                  className="w-4 h-4 flex-shrink-0 rounded object-cover"
                />
              ) : null}
              <span>{imgRef.preview}</span>
            </span>
          ))}
        </div>
      )}
      {/* 消息内容 */}
      <div className="px-4 py-2.5 rounded-2xl bg-blue-500 text-white">
        <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
          {contentStr}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => void handleCopy()}
          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors ${
            copySuccess
              ? 'bg-green-100 text-green-600'
              : 'text-muted-foreground hover:text-slate-600 hover:bg-slate-200'
          }`}
          title={copySuccess ? t('messageBlocks.copied') : t('messageBlocks.copy')}
        >
          <Copy className="w-3.5 h-3.5" />
          {copySuccess ? t('messageBlocks.copied') : t('messageBlocks.copy')}
        </button>
        {retryAssistantMessageId && onRetryMessage && (
          <button
            type="button"
            onClick={handleRetry}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-muted-foreground hover:text-slate-600 hover:bg-slate-200 transition-colors"
            title={t('messageBlocks.regenerate')}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t('messageBlocks.retry')}
          </button>
        )}
        {onSaveMessage && (
          <button
            type="button"
            onClick={handleSaveNote}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-muted-foreground hover:text-slate-600 hover:bg-slate-200 transition-colors"
            title={t('messageBlocks.saveToNotes')}
          >
            <FileText className="w-3.5 h-3.5" />
            {t('messageBlocks.saveToNotes')}
          </button>
        )}
      </div>
    </div>
  );
});

/**
 * Memo 化的 AI 消息组件
 */
interface AssistantMessageItemProps {
  message: UnifiedMessage;
  isStreaming: boolean;
  isLoading: boolean;
  onToolConfirm: (toolCallId: string) => void;
  onToolCancel: (toolCallId: string) => void;
  onSaveImage: (imageUrl: string, mimeType?: string) => Promise<void>;
  onRetryMessage: (messageId: string, stepId?: number) => void;
  onSaveMessage?: (message: UnifiedMessage) => void;
  onShowPricing?: () => void;
  onTypewriterComplete?: (messageId: string) => void;
  onModeSwitch?: (mode: 'agent', feature?: string) => void;
  isAskMode?: boolean;
  // 搜索批次回调
  onSearchBatchImport?: (items: SearchResultBatchItem[]) => void;
  onSearchBatchDismiss?: () => void;
  isSearchBatchImporting?: boolean;
}

const AssistantMessageItem = React.memo(function AssistantMessageItem({
  message,
  isStreaming,
  isLoading,
  onToolConfirm,
  onToolCancel,
  onSaveImage,
  onRetryMessage,
  onSaveMessage,
  onShowPricing,
  onTypewriterComplete,
  onModeSwitch,
  isAskMode,
  onSearchBatchImport,
  onSearchBatchDismiss,
  isSearchBatchImporting
}: AssistantMessageItemProps) {
  const contentStr = getMessageText(message);
  const runDuration = formatRunDuration(message);
  const [showRuntimeDetails, setShowRuntimeDetails] = useState(false);
  const isRuntimePending = Boolean(
    message.blocks?.some(
      (block) =>
        block.type === 'status' &&
        typeof block.message === 'string' &&
        block.message.includes('异步处理')
    )
  );

  const handleRetry = useCallback(
    (stepId?: number) => {
      onRetryMessage(message.id, stepId);
    },
    [message.id, onRetryMessage]
  );

  const handleSaveNote = useCallback(() => {
    onSaveMessage?.(message);
  }, [message, onSaveMessage]);

  // 打字机效果完成回调
  const handleTypewriterComplete = useCallback(() => {
    onTypewriterComplete?.(message.id);
  }, [message.id, onTypewriterComplete]);

  return (
    <div className="max-w-[85%]">
      {message.agentRun?.runId && (
        <div className="mb-2 space-y-2 px-1">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span>{`Run ${message.agentRun.runId.slice(-6)}`}</span>
            <span>{`Step ${message.agentRun.stepId}`}</span>
            {message.agentRun.timeline?.length ? (
              <span>{`${message.agentRun.timeline.length} steps`}</span>
            ) : null}
            {message.agentRun.status ? (
              <span>{message.agentRun.status}</span>
            ) : null}
            {isRuntimePending ? (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
                Async waiting
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => focusSkillRun(message.agentRun?.runId || '')}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
            >
              Open run
            </button>
            <button
              type="button"
              onClick={() => setShowRuntimeDetails((prev) => !prev)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
            >
              {showRuntimeDetails ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              Runtime
            </button>
          </div>
          {showRuntimeDetails && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <span>{`ID: ${message.agentRun.runId}`}</span>
                <span>{`Started: ${new Date(message.agentRun.startedAt).toLocaleTimeString('zh-CN', { hour12: false })}`}</span>
                {message.agentRun.endedAt ? (
                  <span>{`Ended: ${new Date(message.agentRun.endedAt).toLocaleTimeString('zh-CN', { hour12: false })}`}</span>
                ) : null}
              </div>
              {message.agentRun.localCandidates &&
              message.agentRun.localCandidates.length > 0 ? (
                <div className="mb-2">
                  <div className="text-[10px] uppercase text-slate-400 mb-1">
                    Local candidates
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {message.agentRun.localCandidates.map((candidate, index) => (
                      <span
                        key={`${candidate.name}-${index}`}
                        className="rounded bg-white px-2 py-0.5 text-[11px] text-slate-600"
                      >
                        {candidate.name}
                        {candidate.source ? ` (${candidate.source})` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {message.agentRun.resolvedSkills &&
              message.agentRun.resolvedSkills.length > 0 ? (
                <div className="mb-2">
                  <div className="text-[10px] uppercase text-slate-400 mb-1">
                    Resolved skills
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {message.agentRun.resolvedSkills.map((skill, index) => (
                      <span
                        key={`${skill.name}-${index}`}
                        className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700"
                      >
                        {skill.name}
                        {skill.source ? ` (${skill.source})` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="space-y-1">
                {(message.agentRun.timeline || []).slice(-5).map((step) => (
                  <div key={step.id} className="flex items-center gap-2">
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${
                        step.status === 'completed'
                          ? 'bg-green-500'
                          : step.status === 'failed'
                            ? 'bg-red-500'
                            : 'bg-blue-500'
                      }`}
                    />
                    <span className="truncate">{step.title}</span>
                    {step.errorMessage ? (
                      <span className="truncate text-red-600">{step.errorMessage}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <MessageBlocks
        blocks={message.blocks || []}
        content={contentStr}
        imageUrl={message.imageUrl}
        onToolConfirm={onToolConfirm}
        onToolCancel={onToolCancel}
        onSaveImage={onSaveImage}
        onRetry={handleRetry}
        onSaveNote={onSaveMessage ? handleSaveNote : undefined}
        isLoading={isLoading && isStreaming}
        onShowPricing={onShowPricing}
        typewriter={message.typewriter}
        onTypewriterComplete={handleTypewriterComplete}
        onModeSwitch={onModeSwitch}
        isAskMode={isAskMode}
        retryFromStepId={message.agentRun?.retryFromStepId}
        onSearchBatchImport={onSearchBatchImport}
        onSearchBatchDismiss={onSearchBatchDismiss}
        isSearchBatchImporting={isSearchBatchImporting}
      />
      {runDuration && (
        <div className="mt-1 text-[11px] text-muted-foreground px-1">
          {`Run ${message.agentRun?.runId?.slice(-6)} · ${runDuration}${
            message.agentRun?.retryFromStepId !== undefined
              ? ` · from Step ${message.agentRun.retryFromStepId}`
              : ''
          }`}
        </div>
      )}
      {message.agentRun?.timeline && message.agentRun.timeline.length > 0 && (
        <div className="mt-2 space-y-1 px-1">
          {message.agentRun.timeline.slice(-3).map((step) => (
            <div
              key={step.id}
              className="text-[11px] text-muted-foreground flex items-center gap-2"
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  step.status === 'completed'
                    ? 'bg-green-500'
                    : step.status === 'failed'
                      ? 'bg-red-500'
                      : 'bg-blue-500'
                }`}
              />
              <span className="truncate">{step.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

/**
 * 虚拟滚动消息列表 Props
 */
interface VirtualMessageListProps {
  messages: UnifiedMessage[];
  streamingMessageId: string | null;
  isLoading: boolean;
  onToolConfirm: (toolCallId: string) => void;
  onToolCancel: (toolCallId: string) => void;
  onSaveImage: (imageUrl: string, mimeType?: string) => Promise<void>;
  onRetryMessage: (messageId: string, stepId?: number) => void;
  onSaveMessage?: (message: UnifiedMessage) => void;
  onReferenceClick?: (summaryId: string) => void;
  onShowPricing?: () => void;
  /**
   * 滚动到底部触发器
   * 每当此值变化时，立即滚动到底部（无动画）
   * 用于对话切换、初次加载等场景
   */
  scrollToBottomTrigger?: number;
  /**
   * 打字机效果完成回调
   * 用于在打字机效果完成后清除 typewriter 标记
   */
  onTypewriterComplete?: (messageId: string) => void;
  /**
   * 模式切换回调
   * 用于从 Ask 模式切换到 Agent 模式
   */
  onModeSwitch?: (mode: 'agent', feature?: string) => void;
  /**
   * 是否为 Ask 模式
   * Ask 模式下不显示状态块，只显示闪烁的生成图标
   */
  isAskMode?: boolean;
  /**
   * 搜索批次导入回调
   * 用于将搜索结果批次中的条目导入为项目来源
   */
  onSearchBatchImport?: (items: SearchResultBatchItem[]) => void;
  /**
   * 搜索批次删除/跳过回调
   */
  onSearchBatchDismiss?: () => void;
  /**
   * 搜索批次是否正在导入中
   */
  isSearchBatchImporting?: boolean;
}

/**
 * 虚拟滚动消息列表组件
 *
 * 性能优化：
 * 1. 只渲染可见区域的消息（通常 5-10 条）
 * 2. 使用动态高度估算，自动适应不同消息长度
 * 3. 滚动时平滑复用 DOM 节点
 */
export const VirtualMessageList = React.memo(function VirtualMessageList({
  messages,
  streamingMessageId,
  isLoading,
  onToolConfirm,
  onToolCancel,
  onSaveImage,
  onRetryMessage,
  onSaveMessage,
  onReferenceClick,
  onShowPricing,
  scrollToBottomTrigger,
  onTypewriterComplete,
  onModeSwitch,
  isAskMode,
  onSearchBatchImport,
  onSearchBatchDismiss,
  isSearchBatchImporting
}: VirtualMessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(messages.length);
  const streamingScrollTimerRef = useRef<number | null>(null);
  const containerWidthRef = useRef(800); // 默认容器宽度

  // 预计算所有消息的高度
  const predictedHeights = useMemo(() => {
    return predictMessageHeights(
      messages.map((msg) => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: getMessageText(msg),
        blocks: msg.blocks?.map((b) => ({
          type: b.type,
          content: (b as TextBlock).content,
        })),
        references: msg.references,
        imageReferences: msg.imageReferences,
        shortcut: msg.shortcut,
        agentRun: msg.agentRun,
      })),
      { maxWidth: containerWidthRef.current }
    );
  }, [messages]);

  // 使用预计算的高度作为 estimateSize
  const estimateSize = useCallback(
    (index: number) => {
      return predictedHeights[index] || 100;
    },
    [predictedHeights]
  );

  // 创建虚拟化实例
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan: 3, // 额外渲染 3 条以平滑滚动
    getItemKey: (index) => messages[index]?.id || index
  });

  // 外部触发的滚动到底部（对话切换、初次加载）
  // 使用即时滚动，无动画
  useEffect(() => {
    if (
      scrollToBottomTrigger !== undefined &&
      scrollToBottomTrigger > 0 &&
      messages.length > 0
    ) {
      log.debug(
        '[VirtualMessageList] scrollToBottomTrigger changed:',
        scrollToBottomTrigger,
        'messages:',
        messages.length
      );
      // 使用 requestAnimationFrame 确保 DOM 已更新
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(messages.length - 1, {
          align: 'end',
          behavior: 'auto'
        });
      });
    }
  }, [scrollToBottomTrigger, messages.length, virtualizer]);

  // 新消息时自动滚动到底部（避免 smooth 与动态高度冲突）
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      // 延迟滚动，等待 DOM 更新
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(messages.length - 1, {
          align: 'end',
          behavior: 'auto'
        });
      });
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length, virtualizer]);

  // 流式生成时保持滚动到底部（降低频率，减少主线程压力）
  useEffect(() => {
    if (streamingScrollTimerRef.current) {
      window.clearInterval(streamingScrollTimerRef.current);
      streamingScrollTimerRef.current = null;
    }

    if (streamingMessageId && messages.length > 0) {
      streamingScrollTimerRef.current = window.setInterval(() => {
        requestAnimationFrame(() => {
          virtualizer.scrollToIndex(messages.length - 1, {
            align: 'end',
            behavior: 'auto'
          });
        });
      }, 300);
    }

    return () => {
      if (streamingScrollTimerRef.current) {
        window.clearInterval(streamingScrollTimerRef.current);
        streamingScrollTimerRef.current = null;
      }
    };
  }, [streamingMessageId, messages.length, virtualizer]);

  // 监听容器宽度变化，用于重新计算预测高度
  useEffect(() => {
    if (!parentRef.current) return;

    const updateWidth = () => {
      if (parentRef.current) {
        containerWidthRef.current = parentRef.current.clientWidth;
      }
    };

    // 初始测量
    updateWidth();

    // 监听尺寸变化
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerWidthRef.current = entry.contentRect.width;
      }
    });

    observer.observe(parentRef.current);
    return () => observer.disconnect();
  }, []);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className="flex-1 overflow-y-auto px-6 py-6"
      style={{ contain: 'strict' }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative'
        }}
      >
        {virtualItems.map((virtualItem) => {
          const message = messages[virtualItem.index];
          if (!message) return null;

          const isStreaming = message.id === streamingMessageId;
          const retryAssistantMessageId =
            message.role === 'user' && messages[virtualItem.index + 1]?.role === 'assistant'
              ? messages[virtualItem.index + 1]?.id
              : undefined;

          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`
              }}
              className="py-2"
            >
              <div
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role === 'assistant' ? (
                  <AssistantMessageItem
                    message={message}
                    isStreaming={isStreaming}
                    isLoading={isLoading}
                    onToolConfirm={onToolConfirm}
                    onToolCancel={onToolCancel}
                    onSaveImage={onSaveImage}
                    onRetryMessage={onRetryMessage}
                    onSaveMessage={onSaveMessage}
                    onShowPricing={onShowPricing}
                    onTypewriterComplete={onTypewriterComplete}
                    onModeSwitch={onModeSwitch}
                    isAskMode={isAskMode}
                    onSearchBatchImport={onSearchBatchImport}
                    onSearchBatchDismiss={onSearchBatchDismiss}
                    isSearchBatchImporting={isSearchBatchImporting}
                  />
                ) : (
                  <UserMessageItem
                    message={message}
                    onReferenceClick={onReferenceClick}
                    onRetryMessage={onRetryMessage}
                    retryAssistantMessageId={retryAssistantMessageId}
                    onSaveMessage={onSaveMessage}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default VirtualMessageList;
