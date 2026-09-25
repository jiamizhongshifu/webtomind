import { createLogger } from '@/utils/logger';
import type {
  ContentBlock,
  StatusBlock as DbStatusBlock,
  SearchBlock as DbSearchBlock,
  TextBlock as DbTextBlock,
  ImageBlock as DbImageBlock,
  ToolCallContentBlock,
  ThinkingContentBlock,
  SuggestionsContentBlock
} from '@/services/database';

const log = createLogger('MessageBlocks');
import type {
  UnifiedContentBlock,
  StatusBlock as UnifiedStatusBlock,
  ImageBlock as UnifiedImageBlock,
  ToolCallBlock as UnifiedToolCallBlock,
  BatchImageBlock,
  BatchImageTaskStatus,
  UpgradeBlock as UnifiedUpgradeBlock,
  ModeSwitchBlock as UnifiedModeSwitchBlock
} from '@/types/unified-chat';
import type {
  SearchResultBatchBlock,
  SearchResultBatchItem
} from '@/types/content-blocks';
import {
  Loader2,
  Search,
  CheckCircle2,
  Sparkles,
  ExternalLink,
  Copy,
  Download,
  Save,
  RefreshCw,
  ChevronDown,
  FileText,
  Code,
  Clock,
  AlertCircle,
  ImageIcon,
  Zap,
  Bot,
  ArrowRight
} from 'lucide-react';
import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo
} from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { ImagePreview } from './ImagePreview';
import { ToolCallBlock, type ToolCallData } from './ToolCallBlock';
import { ThinkingBlock } from './ThinkingBlock';
import { SuggestionsBlock } from './SuggestionsBlock';
import { FlashcardsBlock, type Flashcard } from './FlashcardsBlock';
import {
  QuizBlock,
  MindmapBlock,
  ReportBlock,
  SummaryBlock,
  AudioBlock,
  VideoBlock,
  InfographicBlock,
  SlideDeckBlock,
  DataTableBlock,
  type QuizQuestion,
  type MindmapNode,
  type ReportSection
} from './NotebookLMBlocks';
import { sanitizeUrl } from '@/utils/image-utils';

/**
 * 生成有辨识度的下载文件名
 * @param imageUrl 图片 URL
 * @param mimeType 图片 MIME 类型
 * @returns 格式化的文件名，如 webtomind-2026-01-20-143052.jpeg
 */
function generateDownloadFileName(imageUrl: string, mimeType: string): string {
  // 根据 MIME 类型确定扩展名
  const extMap: Record<string, string> = {
    'image/jpeg': 'jpeg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif'
  };
  const ext = extMap[mimeType] || 'png';

  // 尝试从 Supabase Storage URL 提取原始文件名
  // 新格式: webtomind-2026-01-20-143052-abc123.jpeg
  // 旧格式: 1768887130996-ozxmc2zh.jpeg
  if (imageUrl.includes('supabase.co/storage')) {
    const urlParts = imageUrl.split('/');
    const fileName = urlParts[urlParts.length - 1];

    // 新格式：直接使用（已经是友好格式）
    if (fileName.startsWith('webtomind-')) {
      // 移除随机 ID 部分，保留日期时间
      const match = fileName.match(/^(webtomind-\d{4}-\d{2}-\d{2}-\d{6})/);
      if (match) {
        return `${match[1]}.${ext}`;
      }
      // 如果格式不匹配，直接使用原文件名（去掉扩展名后加上正确的扩展名）
      const nameWithoutExt = fileName.replace(/\.[^.]+$/, '');
      return `${nameWithoutExt}.${ext}`;
    }

    // 旧格式：从时间戳提取
    const timestampMatch = fileName.match(/^(\d+)-/);
    if (timestampMatch) {
      const timestamp = parseInt(timestampMatch[1], 10);
      const date = new Date(timestamp);
      const formatted = date
        .toISOString()
        .replace(/T/, '-')
        .replace(/:/g, '')
        .slice(0, 17);
      return `webtomind-${formatted}.${ext}`;
    }
  }

  // 默认使用当前时间
  const now = new Date();
  const formatted = now
    .toISOString()
    .replace(/T/, '-')
    .replace(/:/g, '')
    .slice(0, 17);
  return `webtomind-${formatted}.${ext}`;
}

// 兼容两种 ContentBlock 类型
type CompatibleBlock = ContentBlock | UnifiedContentBlock;

// 统一的 StatusBlock 类型（兼容两种定义）
type AnyStatusBlock = DbStatusBlock | UnifiedStatusBlock;

// 统一的 ImageBlock 类型
type AnyImageBlock = DbImageBlock | UnifiedImageBlock;

// 统一的 TextBlock 类型
type AnyTextBlock = DbTextBlock;

// 统一的 SearchBlock 类型
type AnySearchBlock = DbSearchBlock;

// 统一的 ToolCallBlock 类型
type AnyToolCallBlock = ToolCallContentBlock | UnifiedToolCallBlock;

function getExecutionMeta(block: unknown): {
  stepId?: number;
  timestamp?: number;
  retryFromStepId?: number;
} {
  if (!block || typeof block !== 'object') return {};
  const candidate = block as {
    stepId?: unknown;
    timestamp?: unknown;
    retryFromStepId?: unknown;
  };
  return {
    stepId: typeof candidate.stepId === 'number' ? candidate.stepId : undefined,
    timestamp:
      typeof candidate.timestamp === 'number' ? candidate.timestamp : undefined,
    retryFromStepId:
      typeof candidate.retryFromStepId === 'number'
        ? candidate.retryFromStepId
        : undefined
  };
}

function formatExecutionTime(timestamp?: number): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs}ms`;
  const seconds = Math.floor(durationMs / 1000);
  const ms = durationMs % 1000;
  if (seconds < 60) return ms > 0 ? `${seconds}.${Math.floor(ms / 100)}s` : `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;
  return `${minutes}m ${remainSeconds}s`;
}

interface MessageBlocksProps {
  blocks: CompatibleBlock[];
  content: string; // 兼容旧格式
  imageUrl?: string; // 兼容旧格式
  onToolConfirm?: (toolCallId: string) => void;
  onToolCancel?: (toolCallId: string) => void;
  onSaveImage?: (imageUrl: string, mimeType?: string) => void; // 保存图片/视频到工作台
  onRetry?: (stepId?: number) => void; // 重试回调（可选步骤）
  onSaveNote?: () => void; // 保存当前回答到笔记
  isLoading?: boolean; // 是否正在加载
  onShowPricing?: () => void; // 显示升级套餐
  typewriter?: boolean; // 是否启用打字机效果（Ask 模式）
  onTypewriterComplete?: () => void; // 打字机效果完成回调
  onModeSwitch?: (mode: 'agent', feature?: string) => void; // 切换模式回调
  isAskMode?: boolean; // 是否为 Ask 模式（不显示状态块）
  retryFromStepId?: number; // 若为步骤级重试，标记来源步骤
  // 搜索批次回调
  onSearchBatchImport?: (items: SearchResultBatchItem[]) => void;
  onSearchBatchDismiss?: () => void;
  isSearchBatchImporting?: boolean;
}

/**
 * 状态块渲染
 */
function StatusBlockItem({ block }: { block: AnyStatusBlock }) {
  const { stepId, timestamp, retryFromStepId } = getExecutionMeta(block);
  const executionTime = formatExecutionTime(timestamp);
  const getStatusIcon = () => {
    switch (block.status) {
      case 'analyzing':
        return <Sparkles className="w-4 h-4 text-purple-500 animate-pulse" />;
      case 'searching':
        return <Search className="w-4 h-4 text-blue-500 animate-pulse" />;
      case 'generating':
        return <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />;
      case 'done':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      default:
        return <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />;
    }
  };

  const getStatusColor = () => {
    switch (block.status) {
      case 'analyzing':
        return 'text-purple-600 bg-purple-50';
      case 'searching':
        return 'text-blue-600 bg-blue-50';
      case 'generating':
        return 'text-amber-600 bg-amber-50';
      case 'done':
        return 'text-green-600 bg-green-50';
      default:
        return 'text-slate-600 bg-slate-50 dark:bg-slate-800';
    }
  };

  // 完成状态不显示
  if (block.status === 'done') return null;

  return (
    <div className={`px-3 py-2 rounded-lg ${getStatusColor()} text-sm`}>
      <div className="flex items-center gap-2">
        {getStatusIcon()}
        <span>{block.message || block.status}</span>
      </div>
      {(stepId !== undefined || executionTime) && (
        <div className="mt-1 ml-6 text-[11px] text-slate-500">
          {stepId !== undefined ? `Step ${stepId}` : ''}
          {stepId !== undefined && executionTime ? ' · ' : ''}
          {executionTime}
          {retryFromStepId !== undefined
            ? `${stepId !== undefined || executionTime ? ' · ' : ''}from Step ${retryFromStepId}`
            : ''}
        </div>
      )}
    </div>
  );
}

/**
 * 升级提示块渲染
 * 显示配额超限或积分不足时的升级引导
 * 参考竞品设计：显示失败警告 + 配额说明 + 升级链接
 */
function UpgradeBlockItem({
  block,
  onShowPricing
}: {
  block: UnifiedUpgradeBlock;
  onShowPricing?: () => void;
}) {
  const { i18n } = useTranslation('workspace');
  const lang = i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US';
  const handleShowPricing = () => {
    if (onShowPricing) {
      onShowPricing();
      return;
    }
    window.location.assign('/pricing');
  };

  return (
    <div className="mt-2 space-y-3">
      {/* 创建失败警告 */}
      <div className="flex items-center gap-2 text-slate-600">
        <div className="flex items-center justify-center w-5 h-5 rounded bg-slate-100 dark:bg-slate-700">
          <AlertCircle className="w-3.5 h-3.5 text-slate-500" />
        </div>
        <span className="text-sm font-medium">
          {lang === 'zh-CN' ? '创建图片失败' : 'Failed to create image'}
        </span>
      </div>

      {/* 配额提示 + 升级链接 */}
      <div className="flex items-center gap-2 text-sm text-slate-500 pl-7">
        <div className="flex items-center justify-center w-4 h-4">
          <svg
            className="w-3.5 h-3.5 text-amber-500"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <span>
          {lang === 'zh-CN'
            ? `你当前的付费方案配额已达到上限${block.used !== undefined ? `（已生成 ${block.used} 次）` : ''}。如需继续，请`
            : `Your plan's quota has been reached${block.used !== undefined ? ` (${block.used} generated)` : ''}. To continue, please`}
        </span>
        <button
          type="button"
          onClick={handleShowPricing}
          className="text-blue-600 hover:text-blue-700 font-medium hover:underline"
        >
          {lang === 'zh-CN' ? '升级套餐' : 'upgrade your plan'}
        </button>
      </div>
    </div>
  );
}

/**
 * 模式切换引导块渲染
 * 当用户在 Ask 模式下请求 Agent 功能时显示
 */
function ModeSwitchBlockItem({
  block,
  onModeSwitch
}: {
  block: UnifiedModeSwitchBlock;
  onModeSwitch?: (mode: 'agent', feature?: string) => void;
}) {
  const { i18n } = useTranslation('workspace');
  const lang = i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US';

  const getFeatureIcon = () => {
    switch (block.feature) {
      case 'image':
        return '🎨';
      case 'slide_deck':
        return '📽️';
      default:
        return '✨';
    }
  };

  return (
    <div className="mt-3 p-4 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-xl border border-emerald-200 dark:border-emerald-700">
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-800 text-xl">
          {getFeatureIcon()}
        </div>
        <div className="flex-1">
          <div className="text-sm text-slate-700 dark:text-slate-300 mb-3">
            {block.message}
          </div>
          <button
            type="button"
            onClick={() => onModeSwitch?.('agent', block.feature)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Bot className="w-4 h-4" />
            <span>
              {lang === 'zh-CN' ? `切换到 Agent 模式` : `Switch to Agent Mode`}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 搜索块渲染
 */
function SearchBlockItem({ block }: { block: AnySearchBlock }) {
  const { t } = useTranslation('workspace');
  const { stepId, timestamp, retryFromStepId } = getExecutionMeta(block);
  const executionTime = formatExecutionTime(timestamp);
  if (!block.sources || block.sources.length === 0) return null;

  return (
    <div className="mt-2 mb-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
      <div className="flex items-center gap-2 text-blue-700 text-sm font-medium mb-2">
        <Search className="w-4 h-4" />
        <span>{t('messageBlocks.searched')}</span>
        {(stepId !== undefined || executionTime) && (
          <span className="text-[11px] font-normal text-blue-500">
            {stepId !== undefined ? `Step ${stepId}` : ''}
            {stepId !== undefined && executionTime ? ' · ' : ''}
            {executionTime}
            {retryFromStepId !== undefined
              ? `${stepId !== undefined || executionTime ? ' · ' : ''}from Step ${retryFromStepId}`
              : ''}
          </span>
        )}
        {block.query && (
          <span className="text-blue-500 font-normal">
            &quot;{block.query}&quot;
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        {block.sources.slice(0, 5).map((source, idx) => (
          <a
            key={idx}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline transition-colors"
          >
            <ExternalLink className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{source.title || source.url}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

/**
 * 搜索结果批次块渲染（Agent-Reach 搜索新来源）
 */
function SearchResultBatchBlockItem({
  block,
  onImport,
  onDismiss,
  isImporting
}: {
  block: SearchResultBatchBlock;
  onImport?: (items: SearchResultBatchItem[]) => void;
  onDismiss?: () => void;
  isImporting?: boolean;
}) {
  const { t } = useTranslation('workspace');
  const [expanded, setExpanded] = useState(false);
  const { stepId, timestamp } = getExecutionMeta(block);
  const executionTime = formatExecutionTime(timestamp);
  const visibleItems = expanded ? block.items : block.items.slice(0, 3);
  const hasMore = block.items.length > 3;

  const statusLabel: Record<string, string> = {
    collecting: t('searchBatch.collecting', '搜索中...'),
    pending_review: t('searchBatch.pendingReview', '待审阅'),
    importing: t('searchBatch.importing', '导入中...'),
    deleting: t('searchBatch.deleting', '删除中...'),
    resolved: t('searchBatch.resolved', '已完成')
  };

  return (
    <div className="mt-2 mb-3 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium">
          <Search className="w-4 h-4" />
          <span>{t('searchBatch.title', '搜索新来源')}</span>
          {block.query && (
            <span className="text-emerald-500 font-normal">
              &quot;{block.query}&quot;
            </span>
          )}
          <span className="text-xs text-emerald-500 font-normal">
            {block.items.length} 条结果
          </span>
          {(stepId !== undefined || executionTime) && (
            <span className="text-[11px] font-normal text-emerald-400">
              {stepId !== undefined ? `Step ${stepId}` : ''}
              {stepId !== undefined && executionTime ? ' · ' : ''}
              {executionTime}
            </span>
          )}
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            block.status === 'resolved'
              ? 'bg-emerald-100 text-emerald-700'
              : block.status === 'importing'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-blue-100 text-blue-700'
          }`}
        >
          {statusLabel[block.status] || block.status}
        </span>
      </div>

      <div className="space-y-1.5">
        {visibleItems.map((item, idx) => (
          <div
            key={idx}
            className="flex items-start gap-2 text-sm p-2 bg-white rounded-lg border border-emerald-100"
          >
            <ExternalLink className="w-3 h-3 flex-shrink-0 mt-1 text-emerald-500" />
            <div className="flex-1 min-w-0">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-700 hover:text-emerald-900 hover:underline font-medium truncate block"
              >
                {item.title || item.url}
              </a>
              {item.snippet && (
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                  {item.snippet}
                </p>
              )}
              {item.sourceLabel && (
                <span className="text-[10px] text-slate-400 mt-0.5 inline-block">
                  {item.sourceLabel}
                  {item.score !== undefined ? ` · ${Math.round(item.score * 100)}%` : ''}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-xs text-emerald-600 hover:text-emerald-800 flex items-center gap-1"
        >
          <ChevronDown
            className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
          {expanded
            ? t('searchBatch.collapse', '收起')
            : t('searchBatch.showMore', `还有 ${block.items.length - 3} 条结果`)}
        </button>
      )}

      {block.status === 'pending_review' && (
        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-emerald-200">
          <button
            onClick={() => onImport?.(block.items)}
            disabled={isImporting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isImporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            {t('searchBatch.importAll', '导入全部')}
          </button>
          <button
            onClick={() => onDismiss?.()}
            disabled={isImporting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg disabled:opacity-50 transition-colors"
          >
            {t('searchBatch.dismiss', '跳过')}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * 行内 Markdown 渲染函数
 * 支持：粗体(**text**)、斜体(*text*)、行内代码(`code`)、链接([text](url))
 */
function renderInlineMarkdown(
  text: string,
  baseKey: number = 0
): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  const remaining = text;
  let keyIndex = baseKey;

  // 正则匹配 markdown 语法（按优先级：链接 > 粗体 > 斜体 > 行内代码）
  const patterns = [
    {
      regex: /\[([^\]]+)\]\(([^)]+)\)/g,
      render: (content: string, url: string) => {
        const safeUrl = sanitizeUrl(url);
        if (!safeUrl) {
          // 不安全的 URL，只显示文本，不创建链接
          return (
            <span
              key={keyIndex++}
              className="text-slate-600"
              title={i18n.t('workspace:messageBlocks.linkBlocked')}
            >
              {content}
            </span>
          );
        }
        return (
          <a
            key={keyIndex++}
            href={safeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            {content}
          </a>
        );
      },
      hasUrl: true
    },
    {
      regex: /\*\*(.+?)\*\*/g,
      render: (match: string) => (
        <strong key={keyIndex++} className="font-semibold">
          {match}
        </strong>
      ),
      hasUrl: false
    },
    {
      regex: /\*(.+?)\*/g,
      render: (match: string) => (
        <em key={keyIndex++} className="italic">
          {match}
        </em>
      ),
      hasUrl: false
    },
    {
      regex: /`([^`]+)`/g,
      render: (match: string) => (
        <code
          key={keyIndex++}
          className="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-xs font-mono"
        >
          {match}
        </code>
      ),
      hasUrl: false
    }
  ];

  // 合并所有匹配项并按位置排序
  interface MatchItem {
    index: number;
    length: number;
    content: string;
    url?: string;
    render: (match: string, url?: string) => React.ReactNode;
  }

  const allMatches: MatchItem[] = [];

  for (const pattern of patterns) {
    let match;
    const regex = new RegExp(pattern.regex.source, 'g');
    while ((match = regex.exec(remaining)) !== null) {
      // 检查是否与已有的匹配重叠
      const overlaps = allMatches.some(
        (m) =>
          (match!.index >= m.index && match!.index < m.index + m.length) ||
          (m.index >= match!.index && m.index < match!.index + match![0].length)
      );
      if (!overlaps) {
        allMatches.push({
          index: match.index,
          length: match[0].length,
          content: match[1],
          url: pattern.hasUrl ? match[2] : undefined,
          render: pattern.render as (
            match: string,
            url?: string
          ) => React.ReactNode
        });
      }
    }
  }

  // 按位置排序
  allMatches.sort((a, b) => a.index - b.index);

  // 构建结果
  let lastIndex = 0;
  for (const match of allMatches) {
    // 添加匹配前的普通文本
    if (match.index > lastIndex) {
      result.push(remaining.slice(lastIndex, match.index));
    }
    // 添加渲染后的内容
    result.push(match.render(match.content, match.url));
    lastIndex = match.index + match.length;
  }

  // 添加剩余的普通文本
  if (lastIndex < remaining.length) {
    result.push(remaining.slice(lastIndex));
  }

  return result.length > 0 ? result : [text];
}

/**
 * 渲染 Markdown 块级元素
 * 支持：标题(#)、列表(-/*)、有序列表(1.)、代码块(```)、引用(>)
 */
function renderMarkdownBlocks(content: string): React.ReactNode[] {
  const lines = content.split('\n');
  const result: React.ReactNode[] = [];
  let keyIndex = 0;
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];

  const isTableSeparator = (line: string): boolean =>
    /^\s*\|?\s*[:-]+\s*(\|\s*[:-]+\s*)+\|?\s*$/.test(line);
  const parseTableRow = (line: string): string[] => {
    const raw = line.trim();
    const trimmed = raw.startsWith('|') ? raw.slice(1) : raw;
    const withoutLast = trimmed.endsWith('|') ? trimmed.slice(0, -1) : trimmed;
    return withoutLast.split('|').map((cell) => cell.trim());
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 处理代码块
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockContent = [];
      } else {
        // 结束代码块
        result.push(
          <pre
            key={keyIndex++}
            className="my-2 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-x-auto"
          >
            <code className="text-xs font-mono text-slate-800 dark:text-slate-200">
              {codeBlockContent.join('\n')}
            </code>
          </pre>
        );
        inCodeBlock = false;
        codeBlockContent = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // 空行
    if (!line.trim()) {
      result.push(<div key={keyIndex++} className="h-2" />);
      continue;
    }

    // 标题 (# ## ### #### ##### ######)
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const text = headerMatch[2];
      const sizeClasses: Record<number, string> = {
        1: 'text-xl font-bold mt-4 mb-2',
        2: 'text-lg font-bold mt-3 mb-2',
        3: 'text-base font-semibold mt-2 mb-1',
        4: 'text-sm font-semibold mt-2 mb-1',
        5: 'text-sm font-medium mt-1 mb-1',
        6: 'text-xs font-medium mt-1 mb-1'
      };
      result.push(
        <div key={keyIndex++} className={sizeClasses[level] || sizeClasses[3]}>
          {renderInlineMarkdown(text, keyIndex * 100)}
        </div>
      );
      continue;
    }

    // 表格
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      const headerCells = parseTableRow(line);
      i += 2;
      const bodyRows: string[][] = [];
      while (i < lines.length) {
        const rowLine = lines[i];
        if (!rowLine.trim() || !rowLine.includes('|')) {
          i -= 1;
          break;
        }
        bodyRows.push(parseTableRow(rowLine));
        i += 1;
      }

      result.push(
        <div key={keyIndex++} className="my-3 overflow-x-auto">
          <table className="min-w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800">
                {headerCells.map((cell, cellIndex) => (
                  <th
                    key={`${keyIndex}-th-${cellIndex}`}
                    className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700"
                  >
                    {renderInlineMarkdown(cell, keyIndex * 100 + cellIndex)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, rowIndex) => (
                <tr key={`${keyIndex}-tr-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td
                      key={`${keyIndex}-td-${rowIndex}-${cellIndex}`}
                      className="px-3 py-2 align-top text-slate-700 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800"
                    >
                      {renderInlineMarkdown(
                        cell,
                        keyIndex * 100 + rowIndex * 10 + cellIndex
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // 引用 (>)
    if (line.startsWith('>')) {
      const quoteText = line.slice(1).trim();
      result.push(
        <blockquote
          key={keyIndex++}
          className="my-2 pl-3 border-l-3 border-slate-300 dark:border-slate-600 text-slate-600 italic"
        >
          {renderInlineMarkdown(quoteText, keyIndex * 100)}
        </blockquote>
      );
      continue;
    }

    // 无序列表 (- 或 * 开头，可能有前导空格)
    const ulMatch = line.match(/^\s*[-*]\s+(.+)$/);
    if (ulMatch) {
      result.push(
        <div key={keyIndex++} className="flex items-start gap-2 my-1">
          <span className="text-muted-foreground flex-shrink-0 leading-relaxed">
            •
          </span>
          <span className="flex-1 leading-relaxed">
            {renderInlineMarkdown(ulMatch[1], keyIndex * 100)}
          </span>
        </div>
      );
      continue;
    }

    // 有序列表 (1. 2. 等，可能有前导空格)
    const olMatch = line.match(/^\s*(\d+)\.\s+(.+)$/);
    if (olMatch) {
      result.push(
        <div key={keyIndex++} className="flex items-start gap-2 my-1">
          <span className="text-slate-600 flex-shrink-0 min-w-[1.5em] text-right leading-relaxed">
            {olMatch[1]}.
          </span>
          <span className="flex-1 leading-relaxed">
            {renderInlineMarkdown(olMatch[2], keyIndex * 100)}
          </span>
        </div>
      );
      continue;
    }

    // 普通段落
    result.push(
      <p key={keyIndex++} className="my-1">
        {renderInlineMarkdown(line, keyIndex * 100)}
      </p>
    );
  }

  // 如果代码块未关闭，也渲染出来
  if (inCodeBlock && codeBlockContent.length > 0) {
    result.push(
      <pre
        key={keyIndex++}
        className="my-2 p-3 bg-slate-100 rounded-lg overflow-x-auto"
      >
        <code className="text-xs font-mono text-slate-800">
          {codeBlockContent.join('\n')}
        </code>
      </pre>
    );
  }

  return result;
}

/**
 * 解析结构化输出内容
 * 提取 <thinking> 和 <suggestions> 标签中的内容
 */
function parseStructuredContent(content: string): {
  thinking: string;
  mainContent: string;
  suggestions: string;
  isStreaming: boolean;
} {
  // 检查是否正在流式输出（有开始标签但没有结束标签）
  const hasThinkingStart = content.includes('<thinking>');
  const hasThinkingEnd = content.includes('</thinking>');
  const hasSuggestionsStart = content.includes('<suggestions>');
  const hasSuggestionsEnd = content.includes('</suggestions>');

  const isStreaming =
    (hasThinkingStart && !hasThinkingEnd) ||
    (hasSuggestionsStart && !hasSuggestionsEnd);

  // 提取 thinking 内容
  let thinking = '';
  const thinkingMatch = content.match(/<thinking>([\s\S]*?)(<\/thinking>|$)/);
  if (thinkingMatch) {
    thinking = thinkingMatch[1].trim();
  }

  // 提取 suggestions 内容
  let suggestions = '';
  const suggestionsMatch = content.match(
    /<suggestions>([\s\S]*?)(<\/suggestions>|$)/
  );
  if (suggestionsMatch) {
    suggestions = suggestionsMatch[1].trim();
  }

  // 移除标签后的主要内容
  const mainContent = content
    .replace(/<thinking>[\s\S]*?(<\/thinking>|$)/g, '')
    .replace(/<suggestions>[\s\S]*?(<\/suggestions>|$)/g, '')
    .trim();

  return { thinking, mainContent, suggestions, isStreaming };
}

/**
 * 解析闪卡内容
 * 从文本中提取闪卡数据
 */
function parseFlashcards(
  content: string
): { cards: Flashcard[]; title: string } | null {
  // 检查是否是闪卡内容
  const flashcardMatch = content.match(/📚\s*\*\*生成了\s*(\d+)\s*张闪卡\*\*/);
  if (!flashcardMatch) return null;

  const cards: Flashcard[] = [];
  // 匹配每张卡片: **卡片 N**\n❓ question\n✅ answer
  const cardPattern =
    /\*\*卡片\s*(\d+)\*\*\s*\n❓\s*(.+?)\n✅\s*(.+?)(?=\n\n\*\*卡片|\n*$)/gs;
  let match;

  while ((match = cardPattern.exec(content)) !== null) {
    cards.push({
      id: `card_${match[1]}`,
      question: match[2].trim(),
      answer: match[3].trim()
    });
  }

  return cards.length > 0
    ? { cards, title: `生成了 ${cards.length} 张闪卡` }
    : null;
}

/**
 * 解析测验内容
 */
function parseQuiz(
  content: string
): { questions: QuizQuestion[]; title: string } | null {
  // 检查是否是测验内容
  const quizMatch = content.match(/❓\s*\*\*生成了\s*(\d+)\s*道测验题\*\*/);
  if (!quizMatch) return null;

  const questions: QuizQuestion[] = [];
  // 匹配每道题: **题目 N**\n问题内容\nA. 选项\nB. 选项\n答案: X\n解释: ...
  const questionPattern =
    /\*\*题目\s*(\d+)\*\*\s*\n(.+?)\n((?:[A-D]\.\s*.+?\n)+)答案:\s*([A-D])(?:\n解释:\s*(.+?))?(?=\n\n\*\*题目|\n*$)/gs;
  let match;

  while ((match = questionPattern.exec(content)) !== null) {
    const optionsText = match[3];
    const options =
      optionsText
        .match(/[A-D]\.\s*(.+)/g)
        ?.map((o) => o.replace(/^[A-D]\.\s*/, '').trim()) || [];
    const correctLetter = match[4];
    const correctIndex = correctLetter.charCodeAt(0) - 65; // A=0, B=1, C=2, D=3

    questions.push({
      id: `quiz_${match[1]}`,
      question: match[2].trim(),
      options,
      correctIndex,
      explanation: match[5]?.trim()
    });
  }

  return questions.length > 0
    ? { questions, title: `生成了 ${questions.length} 道测验题` }
    : null;
}

/**
 * 解析思维导图内容
 */
function parseMindmap(
  content: string
): { root: MindmapNode; title: string } | null {
  // 检查是否是思维导图内容
  const mindmapMatch = content.match(/🧠\s*\*\*思维导图\*\*/);
  if (!mindmapMatch) return null;

  // 简单解析：按缩进层级构建树
  const lines = content
    .split('\n')
    .filter(
      (line) => line.trim().startsWith('-') || line.trim().startsWith('•')
    );
  if (lines.length === 0) return null;

  const buildTree = (
    lines: string[],
    startIdx: number,
    baseIndent: number
  ): { node: MindmapNode; nextIdx: number } => {
    const line = lines[startIdx];
    const indent = line.search(/\S/);
    const text = line.replace(/^[\s\-•]+/, '').trim();

    const node: MindmapNode = { id: `node_${startIdx}`, text, children: [] };
    let idx = startIdx + 1;

    while (idx < lines.length) {
      const nextLine = lines[idx];
      const nextIndent = nextLine.search(/\S/);

      if (nextIndent <= baseIndent) break;
      if (nextIndent > indent) {
        const result = buildTree(lines, idx, indent);
        node.children!.push(result.node);
        idx = result.nextIdx;
      } else {
        break;
      }
    }

    if (node.children!.length === 0) delete node.children;
    return { node, nextIdx: idx };
  };

  try {
    const { node } = buildTree(lines, 0, -1);
    return { root: node, title: '思维导图' };
  } catch {
    return null;
  }
}

/**
 * 解析报告内容
 */
function parseReport(
  content: string
): { title: string; sections: ReportSection[]; keyPoints: string[] } | null {
  // 检查是否是报告内容
  const reportMatch = content.match(/📊\s*\*\*(.+?)\*\*/);
  if (!reportMatch) return null;

  const title = reportMatch[1];
  const sections: ReportSection[] = [];
  const keyPoints: string[] = [];

  // 提取关键要点
  const keyPointsMatch = content.match(
    /\*\*关键要点\*\*\s*\n((?:[-•]\s*.+\n?)+)/
  );
  if (keyPointsMatch) {
    const points = keyPointsMatch[1].match(/[-•]\s*(.+)/g);
    points?.forEach((p) => keyPoints.push(p.replace(/^[-•]\s*/, '').trim()));
  }

  // 提取章节
  const sectionPattern = /##\s*(.+?)\n([\s\S]+?)(?=\n##|\n\*\*关键要点\*\*|$)/g;
  let match;
  while ((match = sectionPattern.exec(content)) !== null) {
    sections.push({
      heading: match[1].trim(),
      content: match[2].trim()
    });
  }

  return sections.length > 0 || keyPoints.length > 0
    ? { title, sections, keyPoints }
    : null;
}

/**
 * 解析摘要内容
 */
function parseSummary(
  content: string
): { title: string; summary: string; keyPoints: string[] } | null {
  // 检查是否是摘要内容
  const summaryMatch = content.match(/📝\s*\*\*(.+?)\*\*/);
  if (!summaryMatch) return null;

  const title = summaryMatch[1];
  const keyPoints: string[] = [];

  // 提取要点
  const keyPointsMatch = content.match(/\*\*要点\*\*\s*\n((?:[-•✓]\s*.+\n?)+)/);
  if (keyPointsMatch) {
    const points = keyPointsMatch[1].match(/[-•✓]\s*(.+)/g);
    points?.forEach((p) => keyPoints.push(p.replace(/^[-•✓]\s*/, '').trim()));
  }

  // 提取摘要正文
  const summaryText = content
    .replace(/📝\s*\*\*.+?\*\*\n?/, '')
    .replace(/\*\*要点\*\*[\s\S]*$/, '')
    .trim();

  return summaryText ? { title, summary: summaryText, keyPoints } : null;
}

/**
 * 解析音频内容
 */
function parseAudio(
  content: string
): { audioUrl: string; duration?: number; title: string } | null {
  // 检查是否是音频内容
  const audioMatch = content.match(/🎧\s*\*\*音频概览\*\*/);
  if (!audioMatch) return null;

  // 提取音频 URL（Base64 或链接）
  const urlMatch = content.match(
    /\[音频文件\]\((data:audio\/[^)]+|https?:\/\/[^)]+)\)/
  );
  if (!urlMatch) return null;

  const durationMatch = content.match(/时长:\s*(\d+)\s*秒/);

  return {
    audioUrl: urlMatch[1],
    duration: durationMatch ? parseInt(durationMatch[1]) : undefined,
    title: '音频概览'
  };
}

/**
 * 解析视频内容
 */
function parseVideo(
  content: string
): { videoUrl: string; duration?: number; title: string } | null {
  // 检查是否是视频内容
  const videoMatch = content.match(/🎬\s*\*\*视频概览\*\*/);
  if (!videoMatch) return null;

  // 提取视频 URL
  const urlMatch = content.match(
    /\[视频文件\]\((data:video\/[^)]+|https?:\/\/[^)]+)\)/
  );
  if (!urlMatch) return null;

  const durationMatch = content.match(/时长:\s*(\d+)\s*秒/);

  return {
    videoUrl: urlMatch[1],
    duration: durationMatch ? parseInt(durationMatch[1]) : undefined,
    title: '视频概览'
  };
}

/**
 * 解析信息图内容
 */
function parseInfographic(
  content: string
): { imageUrl: string; title: string } | null {
  // 检查是否是信息图内容
  const infoMatch = content.match(/📈\s*\*\*信息图\*\*/);
  if (!infoMatch) return null;

  // 提取图片 URL
  const urlMatch = content.match(
    /!\[信息图\]\((data:image\/[^)]+|https?:\/\/[^)]+)\)/
  );
  if (!urlMatch) return null;

  return { imageUrl: urlMatch[1], title: '信息图' };
}

/**
 * 解析演示文稿内容
 */
function parseSlideDeck(
  content: string
): { fileUrl: string; slideCount?: number; title: string } | null {
  // 检查是否是演示文稿内容
  const slideMatch = content.match(/📽️\s*\*\*演示文稿\*\*/);
  if (!slideMatch) return null;

  // 提取文件 URL
  const urlMatch = content.match(
    /\[下载演示文稿\]\((data:[^)]+|https?:\/\/[^)]+)\)/
  );
  if (!urlMatch) return null;

  const countMatch = content.match(/共\s*(\d+)\s*页/);

  return {
    fileUrl: urlMatch[1],
    slideCount: countMatch ? parseInt(countMatch[1]) : undefined,
    title: '演示文稿'
  };
}

/**
 * 解析数据表格内容
 */
function parseDataTable(content: string): {
  csvContent: string;
  rowCount?: number;
  columnCount?: number;
  title: string;
} | null {
  // 检查是否是数据表格内容
  const tableMatch = content.match(/📋\s*\*\*数据表格\*\*/);
  if (!tableMatch) return null;

  // 提取 CSV 内容（在代码块中）
  const csvMatch = content.match(/```csv\n([\s\S]+?)\n```/);
  if (!csvMatch) return null;

  const csvContent = csvMatch[1];
  const lines = csvContent.trim().split('\n');
  const rowCount = lines.length - 1; // 减去表头
  const columnCount = lines[0]?.split(',').length || 0;

  return { csvContent, rowCount, columnCount, title: '数据表格' };
}

/**
 * ?????????
 */
type ParsedTextContent =
  | { kind: 'plain' }
  | { kind: 'structured'; data: ReturnType<typeof parseStructuredContent> }
  | { kind: 'flashcards'; data: NonNullable<ReturnType<typeof parseFlashcards>> }
  | { kind: 'quiz'; data: NonNullable<ReturnType<typeof parseQuiz>> }
  | { kind: 'mindmap'; data: NonNullable<ReturnType<typeof parseMindmap>> }
  | { kind: 'report'; data: NonNullable<ReturnType<typeof parseReport>> }
  | { kind: 'summary'; data: NonNullable<ReturnType<typeof parseSummary>> }
  | { kind: 'audio'; data: NonNullable<ReturnType<typeof parseAudio>> }
  | { kind: 'video'; data: NonNullable<ReturnType<typeof parseVideo>> }
  | { kind: 'infographic'; data: NonNullable<ReturnType<typeof parseInfographic>> }
  | { kind: 'slideDeck'; data: NonNullable<ReturnType<typeof parseSlideDeck>> }
  | { kind: 'dataTable'; data: NonNullable<ReturnType<typeof parseDataTable>> };

function parseTextContentByKind(content: string): ParsedTextContent {
  if (!content) return { kind: 'plain' };

  if (content.includes('<thinking>') || content.includes('<suggestions>')) {
    return { kind: 'structured', data: parseStructuredContent(content) };
  }

  const flashcards = parseFlashcards(content);
  if (flashcards) return { kind: 'flashcards', data: flashcards };

  const quiz = parseQuiz(content);
  if (quiz) return { kind: 'quiz', data: quiz };

  const mindmap = parseMindmap(content);
  if (mindmap) return { kind: 'mindmap', data: mindmap };

  const report = parseReport(content);
  if (report) return { kind: 'report', data: report };

  const summary = parseSummary(content);
  if (summary) return { kind: 'summary', data: summary };

  const audio = parseAudio(content);
  if (audio) return { kind: 'audio', data: audio };

  const video = parseVideo(content);
  if (video) return { kind: 'video', data: video };

  const infographic = parseInfographic(content);
  if (infographic) return { kind: 'infographic', data: infographic };

  const slideDeck = parseSlideDeck(content);
  if (slideDeck) return { kind: 'slideDeck', data: slideDeck };

  const dataTable = parseDataTable(content);
  if (dataTable) return { kind: 'dataTable', data: dataTable };

  return { kind: 'plain' };
}

/**
 * ?????
 * ??????????thinking + ?? + suggestions?
 * ???????????
 * ????????Ask ???
 */
function TextBlockItem({
  block,
  isLoading: _isLoading,
  typewriter,
  onTypewriterComplete
}: {
  block: AnyTextBlock;
  isLoading?: boolean;
  typewriter?: boolean;
  onTypewriterComplete?: () => void;
}) {
  const { t } = useTranslation('workspace');
  const [displayText, setDisplayText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const indexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const parsedContent = useMemo(
    () => parseTextContentByKind(block.content),
    [block.content]
  );

  const structuredData =
    parsedContent.kind === 'structured' ? parsedContent.data : null;
  const thinking = structuredData?.thinking || '';
  const mainContent = structuredData?.mainContent || '';
  const suggestions = structuredData?.suggestions || '';
  const isStreaming = structuredData?.isStreaming || false;

  // 打字机效果 - 优化：短文本直接显示，长文本快速打字
  useEffect(() => {
    if (!typewriter || !block.content) {
      setDisplayText(block.content || '');
      return;
    }

    const contentLength = block.content.length;

    // 短文本（<100字符）直接显示，不需要打字效果
    if (contentLength < 100) {
      setDisplayText(block.content);
      setIsTyping(false);
      onTypewriterComplete?.();
      return;
    }

    // 长文本使用快速打字效果
    setIsTyping(true);
    indexRef.current = 0;

    // 根据文本长度动态调整每次显示的字符数
    // 文本越长，每次显示越多字符，确保总时间不超过2秒
    const charsPerTick = Math.max(3, Math.ceil(contentLength / 100));
    const baseDelay = 8; // 基础延迟 8ms

    const typeNextChars = () => {
      if (indexRef.current < contentLength) {
        indexRef.current = Math.min(
          indexRef.current + charsPerTick,
          contentLength
        );
        setDisplayText(block.content.slice(0, indexRef.current));
        timerRef.current = setTimeout(typeNextChars, baseDelay);
      } else {
        setIsTyping(false);
        onTypewriterComplete?.();
      }
    };

    timerRef.current = setTimeout(typeNextChars, baseDelay);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [typewriter, block.content, onTypewriterComplete]);

  // 点击跳过打字机效果
  const handleSkip = useCallback(() => {
    if (isTyping && timerRef.current) {
      clearTimeout(timerRef.current);
      setDisplayText(block.content || '');
      setIsTyping(false);
      onTypewriterComplete?.();
    }
  }, [isTyping, block.content, onTypewriterComplete]);

  const contentToRender = typewriter ? displayText : block.content;

  const renderedContent = useMemo(
    () => renderMarkdownBlocks(contentToRender),
    [contentToRender]
  );
  const renderedMainContent = useMemo(
    () => renderMarkdownBlocks(mainContent),
    [mainContent]
  );
  const renderedSuggestions = useMemo(
    () => renderMarkdownBlocks(suggestions),
    [suggestions]
  );

  // 提前返回必须在所有 hooks 之后
  if (!contentToRender && !isTyping) return null;

  // 渲染对应的组件
  if (parsedContent.kind === 'flashcards') {
    return (
      <FlashcardsBlock
        cards={parsedContent.data.cards}
        title={parsedContent.data.title}
      />
    );
  }

  if (parsedContent.kind === 'quiz') {
    return (
      <QuizBlock
        questions={parsedContent.data.questions}
        title={parsedContent.data.title}
      />
    );
  }

  if (parsedContent.kind === 'mindmap') {
    return (
      <MindmapBlock
        root={parsedContent.data.root}
        title={parsedContent.data.title}
      />
    );
  }

  if (parsedContent.kind === 'report') {
    return (
      <ReportBlock
        title={parsedContent.data.title}
        sections={parsedContent.data.sections}
        keyPoints={parsedContent.data.keyPoints}
      />
    );
  }

  if (parsedContent.kind === 'summary') {
    return (
      <SummaryBlock
        title={parsedContent.data.title}
        summary={parsedContent.data.summary}
        keyPoints={parsedContent.data.keyPoints}
      />
    );
  }

  if (parsedContent.kind === 'audio') {
    return (
      <AudioBlock
        audioUrl={parsedContent.data.audioUrl}
        duration={parsedContent.data.duration}
        title={parsedContent.data.title}
      />
    );
  }

  if (parsedContent.kind === 'video') {
    return (
      <VideoBlock
        videoUrl={parsedContent.data.videoUrl}
        duration={parsedContent.data.duration}
        title={parsedContent.data.title}
      />
    );
  }

  if (parsedContent.kind === 'infographic') {
    return (
      <InfographicBlock
        imageUrl={parsedContent.data.imageUrl}
        title={parsedContent.data.title}
      />
    );
  }

  if (parsedContent.kind === 'slideDeck') {
    return (
      <SlideDeckBlock
        fileUrl={parsedContent.data.fileUrl}
        slideCount={parsedContent.data.slideCount}
        title={parsedContent.data.title}
      />
    );
  }

  if (parsedContent.kind === 'dataTable') {
    return (
      <DataTableBlock
        content={parsedContent.data.csvContent}
        rowCount={parsedContent.data.rowCount}
        columnCount={parsedContent.data.columnCount}
        title={parsedContent.data.title}
      />
    );
  }

  // 判断是否有结构化内容
  const hasThinking = thinking.length > 0;
  const hasSuggestions = suggestions.length > 0;
  const hasMainContent = mainContent.length > 0;

  // 如果没有任何结构化标签，按原来的方式渲染（支持打字机效果）
  if (!hasThinking && !hasSuggestions) {
    return (
      <div
        className="text-sm leading-loose text-slate-900 dark:text-slate-100"
        onClick={isTyping ? handleSkip : undefined}
        style={{ cursor: isTyping ? 'pointer' : 'default' }}
      >
        {renderedContent}
        {isTyping && (
          <span className="inline-block w-0.5 h-4 bg-slate-400 ml-0.5 animate-pulse" />
        )}
      </div>
    );
  }

  // 有结构化内容时，分块渲染（不使用打字机效果）
  return (
    <div className="space-y-2">
      {/* 思考过程 - 默认收起 */}
      {hasThinking && (
        <ThinkingBlock
          content={thinking}
          defaultCollapsed={true}
          isStreaming={isStreaming && !mainContent}
        />
      )}

      {/* 主要内容 */}
      {hasMainContent && (
        <div className="text-sm leading-loose text-slate-900">
          {renderedMainContent}
        </div>
      )}

      {/* 下一步建议 - 简单文本形式，无分割线 */}
      {hasSuggestions && (
        <div className="mt-3">
          <div className="text-xs text-slate-500 mb-1">
            {t('messageBlocks.nextSuggestions')}
          </div>
          <div className="text-sm text-slate-600 leading-loose">
            {renderedSuggestions}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 图片块渲染
 * 列表中显示缩略图，点击后预览原图
 */
function ImageBlockItem({
  block,
  onPreview,
  onCopy,
  onSave,
  onDownload
}: {
  block: AnyImageBlock;
  onPreview: (url: string, thumbnailUrl?: string) => void;
  onCopy: (url: string) => void;
  onSave: (url: string) => void;
  onDownload: (url: string) => void;
}) {
  const { t } = useTranslation('workspace');
  const [copySuccess, setCopySuccess] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  // 显示用的图片：优先使用缩略图
  const displayUrl = block.thumbnailUrl || block.imageUrl;
  // 原图 URL：用于预览、复制、保存、下载
  const originalUrl = block.imageUrl;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCopy(originalUrl);
    setCopySuccess(true);
    // 使用 ref 跟踪定时器以便清理
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
    }
    copyTimeoutRef.current = setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSave(originalUrl);
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDownload(originalUrl);
  };

  return (
    <div className="mt-2">
      {block.status === 'generating' ? (
        <div className="flex items-center gap-2 p-4 bg-amber-50 rounded-xl border border-amber-100 text-amber-700">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">{t('messageBlocks.generatingImage')}</span>
        </div>
      ) : originalUrl ? (
        <div className="space-y-2">
          {/* 图片已创建状态 */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-green-600 bg-green-50">
            <CheckCircle2 className="w-4 h-4" />
            <span>{t('messageBlocks.imageCreated')}</span>
          </div>
          {/* 图片（可点击查看原图） */}
          <div
            className="relative group cursor-zoom-in"
            onClick={() => onPreview(originalUrl, displayUrl)}
          >
            {/* 加载占位符 */}
            {!imageLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-xl">
                <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
              </div>
            )}
            <img
              src={displayUrl}
              alt="Generated"
              loading="lazy"
              className={`rounded-xl max-w-full shadow-sm transition-opacity duration-slow ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setImageLoaded(true)}
            />
            {/* 缩略图标识（悬停时显示） */}
            {block.thumbnailUrl && imageLoaded && (
              <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 rounded text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                {t('messageBlocks.clickToViewOriginal')}
              </div>
            )}
            {/* 右上角快捷操作按钮 */}
            <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={handleCopy}
                className="p-2 bg-black/60 hover:bg-black/80 rounded-lg text-white transition-colors"
                title={
                  copySuccess
                    ? t('messageBlocks.copied')
                    : t('messageBlocks.copyImage')
                }
              >
                <Copy
                  className={`w-4 h-4 ${copySuccess ? 'text-green-400' : ''}`}
                />
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="p-2 bg-black/60 hover:bg-black/80 rounded-lg text-white transition-colors"
                title={t('messageBlocks.saveToWorkspace')}
              >
                <Save className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="p-2 bg-black/60 hover:bg-black/80 rounded-lg text-white transition-colors"
                title={t('messageBlocks.downloadImage')}
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * 工具调用块渲染（包装器）
 */
function ToolCallBlockItem({
  block,
  blockId,
  onToolConfirm,
  onToolCancel
}: {
  block: AnyToolCallBlock;
  blockId: string;
  onToolConfirm?: (id: string) => void;
  onToolCancel?: (id: string) => void;
}) {
  // 使用 useCallback 缓存回调函数
  const handleConfirm = useCallback(() => {
    onToolConfirm?.(blockId);
  }, [onToolConfirm, blockId]);

  const handleCancel = useCallback(() => {
    onToolCancel?.(blockId);
  }, [onToolCancel, blockId]);

  // 将 ContentBlock 格式转换为 ToolCallState 格式
  // 兼容两种类型：ToolCallContentBlock (tool, params) 和 UnifiedToolCallBlock (name, input)
  const toolName = ('tool' in block ? block.tool : block.name) as string;
  const toolParams = ('params' in block ? block.params : block.input) as Record<
    string,
    unknown
  >;
  const requiresConfirmation =
    'requiresConfirmation' in block ? block.requiresConfirmation : false;
  const result = 'result' in block ? block.result : undefined;

  const toolCallState: ToolCallData = {
    id: block.id,
    name: toolName,
    params: toolParams,
    status: block.status,
    result: result,
    requiresConfirmation: requiresConfirmation ?? false,
    timestamp: 'timestamp' in block ? (block.timestamp as number) : Date.now(),
    runId: 'runId' in block ? (block.runId as string | undefined) : undefined,
    stepId:
      'stepId' in block ? (block.stepId as number | undefined) : undefined,
    retryFromStepId:
      'retryFromStepId' in block
        ? (block.retryFromStepId as number | undefined)
        : undefined
  };

  return (
    <ToolCallBlock
      toolCall={toolCallState}
      onConfirm={onToolConfirm ? handleConfirm : undefined}
      onCancel={onToolCancel ? handleCancel : undefined}
    />
  );
}

/**
 * 思考块渲染（包装器）
 */
function ThinkingBlockItem({ block }: { block: ThinkingContentBlock }) {
  return (
    <ThinkingBlock
      content={block.content}
      defaultCollapsed={block.collapsed ?? true}
    />
  );
}

/**
 * 获取批量图片任务状态图标
 */
function getBatchTaskStatusIcon(status: BatchImageTaskStatus) {
  switch (status) {
    case 'pending':
      return <Clock className="w-4 h-4 text-muted-foreground" />;
    case 'generating':
      return <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />;
    case 'done':
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case 'error':
      return <AlertCircle className="w-4 h-4 text-red-500" />;
    default:
      return <Clock className="w-4 h-4 text-muted-foreground" />;
  }
}

/**
 * 获取批量图片任务状态样式
 */
function getBatchTaskStatusStyle(status: BatchImageTaskStatus) {
  switch (status) {
    case 'pending':
      return 'text-slate-500 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700';
    case 'generating':
      return 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700';
    case 'done':
      return 'text-green-600 bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700';
    case 'error':
      return 'text-red-600 bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700';
    default:
      return 'text-slate-500 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700';
  }
}

/**
 * 批量图片块渲染
 */
function BatchImageBlockItem({
  block,
  onPreview,
  onCopy,
  onSave,
  onDownload,
  onShowPricing
}: {
  block: BatchImageBlock;
  onPreview: (url: string, thumbnailUrl?: string) => void;
  onCopy: (url: string) => void;
  onSave: (url: string) => void;
  onDownload: (url: string) => void;
  onShowPricing?: () => void;
}) {
  const { t } = useTranslation('workspace');
  const { tasks, totalCount, completedCount, failedCount } = block;
  const handleShowPricing = () => {
    if (onShowPricing) {
      onShowPricing();
      return;
    }
    window.location.assign('/pricing');
  };

  return (
    <div className="mt-2 space-y-3">
      {/* 进度统计 */}
      <div className="flex items-center gap-3 text-sm">
        <div className="flex items-center gap-1.5 text-slate-600">
          <ImageIcon className="w-4 h-4" />
          <span>{t('messageBlocks.batchGenerating')}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-green-600">
            {completedCount} {t('messageBlocks.success')}
          </span>
          {failedCount > 0 && (
            <span className="text-red-600">
              {failedCount} {t('messageBlocks.failed')}
            </span>
          )}
          <span className="text-muted-foreground">
            / {totalCount} {t('messageBlocks.imageCount')}
          </span>
        </div>
        {/* 进度条 */}
        <div className="flex-1 max-w-[200px] h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 transition-all duration-slow"
            style={{
              width: `${((completedCount + failedCount) / totalCount) * 100}%`
            }}
          />
        </div>
      </div>

      {/* 任务列表 */}
      <div className="space-y-2">
        {tasks.map((task) => (
          <div
            key={task.id}
            className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${getBatchTaskStatusStyle(task.status)}`}
          >
            {/* 状态图标 */}
            <div className="flex-shrink-0 mt-0.5">
              {getBatchTaskStatusIcon(task.status)}
            </div>

            {/* 任务信息 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">
                  {t('messageBlocks.imageIndex', { index: task.index })}
                </span>
                <span className="text-xs opacity-70">
                  {task.status === 'pending' &&
                    t('messageBlocks.statusPending')}
                  {task.status === 'generating' &&
                    t('messageBlocks.statusGenerating')}
                  {task.status === 'done' && t('messageBlocks.statusDone')}
                  {task.status === 'error' && t('messageBlocks.statusError')}
                </span>
              </div>
              <p
                className="text-sm opacity-80 truncate mt-0.5"
                title={task.title}
              >
                {task.title}
              </p>
              {/* 错误信息 */}
              {task.status === 'error' && task.errorMessage && (
                <div className="mt-1">
                  <p className="text-xs text-red-500">{task.errorMessage}</p>
                  {/* 配额相关错误显示升级链接 */}
                  {(task.errorMessage.includes('上限') ||
                    task.errorMessage.includes('积分不足')) && (
                    <button
                      type="button"
                      onClick={handleShowPricing}
                      className="inline-flex items-center gap-1 mt-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
                    >
                      <Zap className="w-3 h-3" />
                      {t('messageBlocks.upgrade.button')}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 已生成的图片预览 */}
            {task.status === 'done' && task.imageUrl && (
              <div className="flex-shrink-0">
                <div
                  className="relative group cursor-zoom-in"
                  onClick={() => onPreview(task.imageUrl!, task.thumbnailUrl)}
                >
                  <img
                    src={task.thumbnailUrl || task.imageUrl}
                    alt={task.title}
                    loading="lazy"
                    className="w-16 h-16 object-cover rounded-lg border border-green-200"
                  />
                  {/* 悬停操作按钮 */}
                  <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCopy(task.imageUrl!);
                      }}
                      className="p-1 bg-white/20 hover:bg-white/30 rounded text-white"
                      title={t('messageBlocks.copy')}
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSave(task.imageUrl!);
                      }}
                      className="p-1 bg-white/20 hover:bg-white/30 rounded text-white"
                      title={t('messageBlocks.save')}
                    >
                      <Save className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDownload(task.imageUrl!);
                      }}
                      className="p-1 bg-white/20 hover:bg-white/30 rounded text-white"
                      title={t('messageBlocks.download')}
                    >
                      <Download className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 消息块渲染组件
 * 根据 blocks 数组依次渲染各类型内容块
 * 使用 React.memo 优化：只在 props 变化时重渲染
 */
export const MessageBlocks = React.memo(function MessageBlocks({
  blocks,
  content,
  imageUrl,
  onToolConfirm,
  onToolCancel,
  onSaveImage,
  onRetry,
  onSaveNote,
  isLoading,
  onShowPricing,
  typewriter,
  onTypewriterComplete,
  onModeSwitch,
  isAskMode,
  retryFromStepId,
  onSearchBatchImport,
  onSearchBatchDismiss,
  isSearchBatchImporting
}: MessageBlocksProps) {
  const { t } = useTranslation('workspace');
  // 图片预览状态（包含原图和缩略图 URL）
  const [previewState, setPreviewState] = useState<{
    imageUrl: string;
    thumbnailUrl?: string;
  } | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showCopyMenu, setShowCopyMenu] = useState(false); // 复制下拉菜单状态
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const [retryTargetStepId, setRetryTargetStepId] = useState<number | undefined>(
    undefined
  );
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const copyMenuRef = useRef<HTMLDivElement>(null); // 复制菜单 ref

  // 清理定时器
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  // 悬停离开时关闭复制菜单（延迟关闭，防止鼠标移动时闪烁）
  const closeMenuTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnterMenu = useCallback(() => {
    if (closeMenuTimeoutRef.current) {
      clearTimeout(closeMenuTimeoutRef.current);
      closeMenuTimeoutRef.current = null;
    }
    setShowCopyMenu(true);
  }, []);

  const handleMouseLeaveMenu = useCallback(() => {
    closeMenuTimeoutRef.current = setTimeout(() => {
      setShowCopyMenu(false);
    }, 150); // 延迟 150ms 关闭，给用户移动鼠标的时间
  }, []);

  // 清理关闭菜单的定时器
  useEffect(() => {
    return () => {
      if (closeMenuTimeoutRef.current) {
        clearTimeout(closeMenuTimeoutRef.current);
      }
    };
  }, []);

  // 获取消息的 Markdown 内容
  const getMarkdownContent = useCallback((): string => {
    // 从 blocks 中提取所有文本内容
    const textBlocks = blocks.filter(
      (b) => b.type === 'text'
    ) as AnyTextBlock[];
    if (textBlocks.length > 0) {
      return textBlocks.map((b) => b.content).join('\n\n');
    }
    // 兼容旧格式
    return content || '';
  }, [blocks, content]);

  // 获取纯文本内容（移除 Markdown 语法）
  const getPlainTextContent = useCallback((): string => {
    const markdown = getMarkdownContent();
    return markdown
      .replace(/#{1,6}\s+/g, '') // 移除标题标记
      .replace(/\*\*(.+?)\*\*/g, '$1') // 移除粗体
      .replace(/\*(.+?)\*/g, '$1') // 移除斜体
      .replace(/`([^`]+)`/g, '$1') // 移除行内代码
      .replace(/```[\s\S]*?```/g, (match) => {
        // 提取代码块内容
        const lines = match.split('\n');
        return lines.slice(1, -1).join('\n');
      })
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // 移除链接，保留文字
      .replace(/^[>*-]\s+/gm, '') // 移除引用和列表标记
      .replace(/^\d+\.\s+/gm, '') // 移除有序列表标记
      .trim();
  }, [getMarkdownContent]);

  // 复制为 Markdown
  const handleCopyMarkdown = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(getMarkdownContent());
      setCopySuccess(true);
      setShowCopyMenu(false);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      log.error('[MessageBlocks] Failed to copy markdown:', error);
    }
  }, [getMarkdownContent]);

  // 复制为纯文本
  const handleCopyText = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(getPlainTextContent());
      setCopySuccess(true);
      setShowCopyMenu(false);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      log.error('[MessageBlocks] Failed to copy text:', error);
    }
  }, [getPlainTextContent]);

  // 如果没有 blocks，使用旧格式渲染
  const hasBlocks = blocks && blocks.length > 0;

  // 打开预览（支持传入缩略图）
  const handlePreview = (url: string, thumbnailUrl?: string) => {
    setPreviewState({ imageUrl: url, thumbnailUrl });
  };

  // 关闭预览
  const handleClosePreview = () => {
    setPreviewState(null);
  };

  // 复制图片到剪贴板（转换为 PNG 格式以兼容 Clipboard API）
  const handleCopyImage = useCallback(async (url: string) => {
    try {
      // 创建 Image 元素加载图片
      const img = new Image();
      img.crossOrigin = 'anonymous';

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = url;
      });

      // 使用 Canvas 将图片转换为 PNG
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to get canvas context');
      ctx.drawImage(img, 0, 0);

      // 转换为 PNG Blob
      const pngBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to convert to PNG'));
        }, 'image/png');
      });

      // 使用 Clipboard API 复制 PNG 图片
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': pngBlob
        })
      ]);

      log.info('[MessageBlocks] Image copied to clipboard as PNG');
    } catch (error) {
      log.error('[MessageBlocks] Failed to copy image:', error);
    }
  }, []);

  // 保存图片/视频到工作台
  const handleSaveImage = useCallback(
    (url: string, mimeType?: string) => {
      if (onSaveImage) {
        onSaveImage(url, mimeType);
      } else {
        log.info('[MessageBlocks] No onSaveImage handler provided');
      }
    },
    [onSaveImage]
  );

  // 下载图片（支持外部 URL 和 data URL）
  const handleDownloadImage = useCallback(async (url: string) => {
    try {
      let blob: Blob;

      if (url.startsWith('data:')) {
        // data URL: 直接转换为 blob
        const response = await fetch(url);
        blob = await response.blob();
      } else {
        // 外部 URL (如 Supabase Storage): 使用 fetch 获取 blob 强制下载
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch image');
        blob = await response.blob();
      }

      // 生成有辨识度的文件名
      const fileName = generateDownloadFileName(url, blob.type);

      // 创建临时 blob URL 并下载
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // 清理 blob URL
      setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
      log.info('[MessageBlocks] Image download triggered:', fileName);
    } catch (error) {
      log.error('[MessageBlocks] Failed to download image:', error);
      // 降级方案：直接打开链接
      window.open(url, '_blank');
    }
  }, []);

  // Ask 模式下，检查是否需要显示闪烁图标
  // 条件：没有实际文本内容（只有 status block 或 text block 内容为空）
  const lastTextBlockIndex = useMemo(() => {
    for (let i = blocks.length - 1; i >= 0; i -= 1) {
      if (blocks[i]?.type === 'text') return i;
    }
    return -1;
  }, [blocks]);

  const showAskModeLoadingIcon = useMemo(() => {
    if (!isAskMode) return false;
    // 检查是否有非空的 text block
    const hasTextContent = blocks.some(
      (b) =>
        b.type === 'text' &&
        (b as AnyTextBlock).content &&
        (b as AnyTextBlock).content.trim().length > 0
    );
    return !hasTextContent;
  }, [isAskMode, blocks]);

  // Agent 模式下，如果 blocks 为空，显示默认 loading 状态
  const showAgentModeLoadingIcon = useMemo(() => {
    if (isAskMode) return false;
    // 如果没有任何 block，显示 loading
    if (!blocks || blocks.length === 0) return true;
    // 如果只有 status block 且没有其他内容，也显示（status block 会单独渲染）
    return false;
  }, [isAskMode, blocks]);

  const getBlockKey = useCallback((block: CompatibleBlock, idx: number) => {
    const execution = getExecutionMeta(block);
    if ('id' in block && typeof block.id === 'string') {
      return `${block.type}:${block.id}`;
    }
    if (execution.timestamp || execution.stepId !== undefined) {
      return `${block.type}:${execution.stepId ?? 'na'}:${execution.timestamp ?? 'na'}:${idx}`;
    }
    if (block.type === 'text' && 'content' in block) {
      const text = String(block.content || '');
      return `text:${idx}:${text.length}`;
    }
    return `${block.type}:${idx}`;
  }, []);

  const executionEvents = useMemo(() => {
    const events: Array<{
      key: string;
      type: 'status' | 'search' | 'tool_call';
      stepId?: number;
      timestamp?: number;
      label: string;
      detail?: string;
      status?: string;
    }> = [];

    blocks.forEach((block, idx) => {
      const { stepId, timestamp } = getExecutionMeta(block);
      if (stepId === undefined && !timestamp) return;

      if (block.type === 'status') {
        const statusBlock = block as AnyStatusBlock;
        events.push({
          key: `${block.type}:${idx}:${stepId ?? 'na'}:${timestamp ?? 'na'}`,
          type: 'status',
          stepId,
          timestamp,
          label: statusBlock.message || statusBlock.status,
          status: statusBlock.status
        });
      } else if (block.type === 'search') {
        const searchBlock = block as AnySearchBlock;
        events.push({
          key: `${block.type}:${idx}:${stepId ?? 'na'}:${timestamp ?? 'na'}`,
          type: 'search',
          stepId,
          timestamp,
          label: 'Web Search',
          detail: searchBlock.query || undefined
        });
      } else if (block.type === 'tool_call') {
        const toolBlock = block as AnyToolCallBlock;
        const toolName = ('tool' in toolBlock ? toolBlock.tool : toolBlock.name) as string;
        events.push({
          key: `${block.type}:${toolBlock.id}:${stepId ?? 'na'}:${timestamp ?? 'na'}`,
          type: 'tool_call',
          stepId,
          timestamp,
          label: toolName || 'Tool Call',
          status: toolBlock.status
        });
      }
    });

    const sortedEvents = events.sort((a, b) => {
      const stepA = a.stepId ?? Number.MAX_SAFE_INTEGER;
      const stepB = b.stepId ?? Number.MAX_SAFE_INTEGER;
      if (stepA !== stepB) return stepA - stepB;
      const tsA = a.timestamp ?? Number.MAX_SAFE_INTEGER;
      const tsB = b.timestamp ?? Number.MAX_SAFE_INTEGER;
      return tsA - tsB;
    });

    return sortedEvents.filter((event, index, arr) => {
      if (index === 0) return true;
      const prev = arr[index - 1];
      return !(
        prev.type === event.type &&
        prev.label === event.label &&
        prev.detail === event.detail &&
        prev.status === event.status
      );
    });
  }, [blocks]);

  const executionDuration = useMemo(() => {
    const timestamps = executionEvents
      .map((event) => event.timestamp)
      .filter((value): value is number => typeof value === 'number');
    if (timestamps.length < 2) return '';
    const duration = Math.max(...timestamps) - Math.min(...timestamps);
    return duration >= 0 ? formatDuration(duration) : '';
  }, [executionEvents]);

  // 收到新流式事件后，清理本地“重试目标”高亮，避免旧状态残留
  useEffect(() => {
    if (
      isLoading &&
      executionEvents.length > 0 &&
      retryTargetStepId !== undefined
    ) {
      setRetryTargetStepId(undefined);
    }
  }, [isLoading, executionEvents.length, retryTargetStepId]);

  return (
    <>
      <div className="text-slate-900 dark:text-slate-100">
        {hasBlocks ? (
          <div className="space-y-2">
            {/* Ask 模式下，如果没有实际文本内容，显示闪烁图标 */}
            {showAskModeLoadingIcon && (
              <div className="flex items-center py-2">
                <Sparkles className="w-4 h-4 text-blue-500 animate-pulse" />
              </div>
            )}
            {!isAskMode && executionEvents.length > 0 && !executionEvents.every((e) => e.label === 'generate_image') && (
              <div className="mb-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60">
                <button
                  type="button"
                  onClick={() => setTimelineCollapsed((prev) => !prev)}
                  className="w-full px-3 py-2.5 flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-500" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      Agent 执行轨迹
                    </span>
                    <span className="text-xs text-slate-500">
                      {executionEvents.length} steps
                      {executionDuration ? ` · ${executionDuration}` : ''}
                      {retryFromStepId !== undefined
                        ? ` · from Step ${retryFromStepId}`
                        : ''}
                    </span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-500 transition-transform ${timelineCollapsed ? '-rotate-90' : 'rotate-0'}`}
                  />
                </button>
                {!timelineCollapsed && (
                  <div className="px-3 pb-3 space-y-1.5">
                    {executionEvents.map((event, index) => {
                      const prevEvent = executionEvents[index - 1];
                      const deltaMs =
                        prevEvent &&
                        typeof prevEvent.timestamp === 'number' &&
                        typeof event.timestamp === 'number'
                          ? Math.max(0, event.timestamp - prevEvent.timestamp)
                          : undefined;
                      const isError = event.status === 'error';
                      const isRetryTarget =
                        retryTargetStepId !== undefined &&
                        event.stepId === retryTargetStepId;
                      return (
                        <div
                          key={event.key}
                          className={`flex items-center gap-2 text-xs rounded-md px-1.5 py-1 ${
                            isRetryTarget
                              ? 'bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-200 dark:ring-amber-700'
                              : ''
                          } ${
                            isError
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          <span
                            className={`inline-flex items-center justify-center min-w-10 h-5 px-1.5 rounded-md font-medium ${
                              isError
                                ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                                : 'bg-slate-200/80 dark:bg-slate-700/80 text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {event.stepId !== undefined ? `S${event.stepId}` : 'S?'}
                          </span>
                          <span className="text-slate-500">
                            {formatExecutionTime(event.timestamp) || '--:--:--'}
                          </span>
                          <span className="font-medium">{event.label}</span>
                          {deltaMs !== undefined && (
                            <span className="text-[10px] text-slate-500">
                              {`+${formatDuration(deltaMs)}`}
                            </span>
                          )}
                          {event.detail && (
                            <span
                              className="truncate text-slate-500"
                              title={event.detail}
                            >
                              {`· ${event.detail}`}
                            </span>
                          )}
                          {event.status && (
                            <span
                              className={`ml-auto text-[10px] uppercase tracking-wide ${
                                isError
                                  ? 'text-red-500 dark:text-red-400'
                                  : 'text-slate-500'
                              }`}
                            >
                              {event.status}
                            </span>
                          )}
                          {isError && onRetry && (
                            <button
                              type="button"
                              onClick={() => {
                                setRetryTargetStepId(event.stepId);
                                onRetry(event.stepId);
                              }}
                              className="ml-1 px-2 py-0.5 rounded-md text-[10px] font-medium border border-red-200 dark:border-red-700 text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            >
                              {event.stepId !== undefined
                                ? `重试 Step ${event.stepId}`
                                : '重试'}
                            </button>
                          )}
                          {isRetryTarget && (
                            <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-300">
                              重试中
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {blocks.map((block, idx) => {
              const blockKey = getBlockKey(block, idx);
              switch (block.type) {
                case 'status':
                  // Ask 模式不显示状态块（由上面的闪烁图标替代）
                  // 只有 Agent 模式才显示详细状态
                  if (isAskMode) {
                    return null;
                  }
                  return (
                    <StatusBlockItem
                      key={blockKey}
                      block={block as AnyStatusBlock}
                    />
                  );
                case 'search':
                  return (
                    <SearchBlockItem
                      key={blockKey}
                      block={block as AnySearchBlock}
                    />
                  );
                case 'text':
                  return (
                    <TextBlockItem
                      key={blockKey}
                      block={block as AnyTextBlock}
                      isLoading={isLoading}
                      typewriter={typewriter && idx === lastTextBlockIndex}
                      onTypewriterComplete={
                        idx === lastTextBlockIndex ? onTypewriterComplete : undefined
                      }
                    />
                  );
                case 'image':
                  return (
                    <ImageBlockItem
                      key={blockKey}
                      block={block as AnyImageBlock}
                      onPreview={handlePreview}
                      onCopy={handleCopyImage}
                      onSave={handleSaveImage}
                      onDownload={handleDownloadImage}
                    />
                  );
                case 'batch_image':
                  return (
                    <BatchImageBlockItem
                      key={blockKey}
                      block={block as BatchImageBlock}
                      onPreview={handlePreview}
                      onCopy={handleCopyImage}
                      onSave={handleSaveImage}
                      onDownload={handleDownloadImage}
                      onShowPricing={onShowPricing}
                    />
                  );
                case 'tool_call':
                  // 始终隐藏 generate_image 的工具调用块（图片生成有专门的 image block 展示）
                  if ((block as AnyToolCallBlock).name === 'generate_image') {
                    return null;
                  }
                  return (
                    <ToolCallBlockItem
                      key={blockKey}
                      block={block as AnyToolCallBlock}
                      blockId={(block as AnyToolCallBlock).id}
                      onToolConfirm={onToolConfirm}
                      onToolCancel={onToolCancel}
                    />
                  );
                case 'thinking':
                  return (
                    <ThinkingBlockItem
                      key={blockKey}
                      block={block as ThinkingContentBlock}
                    />
                  );
                case 'suggestions':
                  return (
                    <SuggestionsBlock
                      key={blockKey}
                      content={(block as SuggestionsContentBlock).content}
                    />
                  );
                case 'upgrade':
                  return (
                    <UpgradeBlockItem
                      key={blockKey}
                      block={block as UnifiedUpgradeBlock}
                      onShowPricing={onShowPricing}
                    />
                  );
                case 'mode_switch':
                  return (
                    <ModeSwitchBlockItem
                      key={blockKey}
                      block={block as UnifiedModeSwitchBlock}
                      onModeSwitch={onModeSwitch}
                    />
                  );
                case 'search_result_batch':
                  return (
                    <SearchResultBatchBlockItem
                      key={blockKey}
                      block={block as SearchResultBatchBlock}
                      onImport={onSearchBatchImport}
                      onDismiss={onSearchBatchDismiss}
                      isImporting={isSearchBatchImporting}
                    />
                  );
                default:
                  return null;
              }
            })}
          </div>
        ) : showAgentModeLoadingIcon ? (
          // Agent 模式：blocks 为空时显示分析中状态
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-purple-600 bg-purple-50 text-sm">
            <Sparkles className="w-4 h-4 text-purple-500 animate-pulse" />
            <span>分析中...</span>
          </div>
        ) : isLoading ? (
          // 加载中状态：显示闪烁的图标（Ask 模式）
          <div className="flex items-center py-2">
            <Sparkles className="w-4 h-4 text-blue-500 animate-pulse" />
          </div>
        ) : (
          // 兼容旧格式
          <>
            {imageUrl && (
              <div
                className="relative group cursor-zoom-in mb-2"
                onClick={() => handlePreview(imageUrl)}
              >
                <img
                  src={imageUrl}
                  alt="Generated"
                  loading="lazy"
                  className="rounded-lg max-w-full"
                />
                {/* 右上角快捷操作按钮 */}
                <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyImage(imageUrl);
                      setCopySuccess(true);
                      // 使用 ref 跟踪定时器以便清理
                      if (copyTimeoutRef.current) {
                        clearTimeout(copyTimeoutRef.current);
                      }
                      copyTimeoutRef.current = setTimeout(
                        () => setCopySuccess(false),
                        2000
                      );
                    }}
                    className="p-2 bg-black/60 hover:bg-black/80 rounded-lg text-white transition-colors"
                    title={
                      copySuccess
                        ? t('messageBlocks.copied')
                        : t('messageBlocks.copyImage')
                    }
                  >
                    <Copy
                      className={`w-4 h-4 ${copySuccess ? 'text-green-400' : ''}`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSaveImage(imageUrl);
                    }}
                    className="p-2 bg-black/60 hover:bg-black/80 rounded-lg text-white transition-colors"
                    title={t('messageBlocks.saveToWorkspace')}
                  >
                    <Save className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownloadImage(imageUrl);
                    }}
                    className="p-2 bg-black/60 hover:bg-black/80 rounded-lg text-white transition-colors"
                    title={t('messageBlocks.downloadImage')}
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
            {/* 使用 Markdown 渲染 */}
            <div className="text-sm leading-relaxed text-slate-900">
              {renderMarkdownBlocks(content || '')}
            </div>
          </>
        )}
        {/* 底部工具栏：操作按钮 */}
        <div className="flex items-center mt-2">
          {/* 操作按钮组（左对齐） */}
          {!isLoading ? (
            <div className="flex items-center gap-1">
              {/* 复制按钮（带悬停下拉菜单） */}
              <div
                className="relative"
                ref={copyMenuRef}
                onMouseEnter={handleMouseEnterMenu}
                onMouseLeave={handleMouseLeaveMenu}
              >
                <button
                  type="button"
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors ${
                    copySuccess
                      ? 'bg-green-100 text-green-600'
                      : 'text-muted-foreground hover:text-slate-600 hover:bg-slate-200'
                  }`}
                  title={t('messageBlocks.copy')}
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copySuccess
                    ? t('messageBlocks.copied')
                    : t('messageBlocks.copy')}
                  <ChevronDown className="w-3 h-3" />
                </button>

                {/* 复制下拉菜单（悬停显示） */}
                {showCopyMenu && (
                  <div className="absolute bottom-full left-0 mb-1 bg-white rounded-lg shadow-lg border border-slate-200 py-1 min-w-[160px] z-10">
                    <button
                      type="button"
                      onClick={handleCopyMarkdown}
                      className="w-full px-3 py-1.5 flex items-center gap-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
                    >
                      <Code className="w-3.5 h-3.5 flex-shrink-0" />
                      {t('messageBlocks.copyMarkdown')}
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyText}
                      className="w-full px-3 py-1.5 flex items-center gap-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
                    >
                      <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                      {t('messageBlocks.copyText')}
                    </button>
                  </div>
                )}
              </div>

              {/* 重试按钮 */}
              {onRetry && (
                <button
                  type="button"
                  onClick={() => onRetry()}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-muted-foreground hover:text-slate-600 hover:bg-slate-200 transition-colors"
                  title={t('messageBlocks.regenerate')}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {t('messageBlocks.retry')}
                </button>
              )}

              {onSaveNote && (
                <button
                  type="button"
                  onClick={onSaveNote}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-muted-foreground hover:text-slate-600 hover:bg-slate-200 transition-colors"
                  title={t('messageBlocks.saveToNotes')}
                >
                  <FileText className="w-3.5 h-3.5" />
                  {t('messageBlocks.saveToNotes')}
                </button>
              )}
            </div>
          ) : (
            /* 加载中状态 */
            <div className="flex items-center gap-1.5 text-xs text-blue-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{t('messageBlocks.generating')}</span>
            </div>
          )}
        </div>
      </div>

      {/* 图片预览弹窗 */}
      {previewState && (
        <ImagePreview
          imageUrl={previewState.imageUrl}
          thumbnailUrl={previewState.thumbnailUrl}
          onClose={handleClosePreview}
        />
      )}
    </>
  );
});
