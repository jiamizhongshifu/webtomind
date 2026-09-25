/**
 * 统一内容块类型定义
 * 集中管理消息内容块类型，避免重复定义
 */

// ==================== 内容块类型 ====================

/**
 * 内容块类型枚举
 */
export type ContentBlockType =
  | 'status'
  | 'search'
  | 'text'
  | 'image'
  | 'batch_image'
  | 'batch_preview'
  | 'tool_call'
  | 'tool_result'
  | 'thinking'
  | 'suggestions'
  | 'upgrade'
  | 'mode_switch'
  | 'search_result_batch';

export interface ExecutionMeta {
  /** 对应一次执行链路的 run id */
  runId?: string;
  /** 执行步骤序号 */
  stepId?: number;
  /** 该步骤时间戳 */
  timestamp?: number;
  /** 若为步骤级重试，记录来源步骤 */
  retryFromStepId?: number;
}

// ==================== 基础内容块 ====================

/**
 * 文本块
 */
export interface TextBlock {
  type: 'text';
  content: string;
}

/**
 * 状态块（处理状态反馈）
 */
export interface StatusBlock extends ExecutionMeta {
  type: 'status';
  status: 'analyzing' | 'searching' | 'generating' | 'executing' | 'done';
  message?: string;
}

/**
 * 图片块
 */
export interface ImageBlock {
  type: 'image';
  imageUrl: string;
  thumbnailUrl?: string;
  status?: 'generating' | 'done' | 'error';
}

/**
 * 批量图片任务状态
 */
export type BatchImageTaskStatus =
  | 'pending'
  | 'generating'
  | 'done'
  | 'error'
  | 'cancelled';

/**
 * 批量图片任务项
 */
export interface BatchImageTask {
  /** 任务 ID */
  id: string;
  /** 任务序号（1-based） */
  index: number;
  /** 图片标题/描述 */
  title: string;
  /** 任务状态 */
  status: BatchImageTaskStatus;
  /** 生成的图片 URL */
  imageUrl?: string;
  /** 缩略图 URL */
  thumbnailUrl?: string;
  /** 错误信息（仅当 status 为 error 时） */
  errorMessage?: string;
}

/**
 * 批量图片块
 */
export interface BatchImageBlock {
  type: 'batch_image';
  /** 批量任务数组 */
  tasks: BatchImageTask[];
  /** 总任务数 */
  totalCount: number;
  /** 已完成数 */
  completedCount: number;
  /** 失败数 */
  failedCount: number;
}

/**
 * 批量图片预览块（等待用户确认）
 */
export interface BatchPreviewBlock {
  type: 'batch_preview';
  /** 待生成的任务列表 */
  tasks: BatchPreviewTask[];
  /** 总任务数 */
  totalCount: number;
  /** 预估消耗积分 */
  estimatedCredits: number;
}

/**
 * 批量预览任务项
 */
export interface BatchPreviewTask {
  /** 任务 ID */
  id: string;
  /** 任务序号（1-based） */
  index: number;
  /** 图片标题/描述 */
  title: string;
  /** 生成提示词 */
  prompt: string;
  /** 状态（预览时始终为 pending） */
  status: 'pending';
}

/**
 * 搜索块（Grounding 搜索结果）
 */
export interface SearchBlock extends ExecutionMeta {
  type: 'search';
  query: string;
  sources: Array<{
    title: string;
    url: string;
    snippet?: string;
  }>;
}

/**
 * Agent-Reach 搜索批次项
 */
export interface SearchResultBatchItem {
  title: string;
  url: string;
  snippet?: string;
  score?: number;
  sourceLabel?: string;
}

/**
 * 搜索批次状态
 */
export type SearchResultBatchStatus =
  | 'collecting'
  | 'pending_review'
  | 'importing'
  | 'deleting'
  | 'resolved';

/**
 * Agent-Reach 搜索结果批次块
 * 用于"搜索新来源"功能：展示候选来源、支持导入/删除
 */
export interface SearchResultBatchBlock extends ExecutionMeta {
  type: 'search_result_batch';
  batchId: string;
  runId?: string;
  query: string;
  status: SearchResultBatchStatus;
  items: SearchResultBatchItem[];
  totalCount: number;
  rawArtifactId?: string;
}

/**
 * 思考块（AI 思考过程）
 */
export interface ThinkingBlock {
  type: 'thinking';
  content: string;
  collapsed?: boolean;
}

/**
 * 建议块（AI 下一步建议）
 */
export interface SuggestionsBlock {
  type: 'suggestions';
  content: string;
  collapsed?: boolean;
}

/**
 * 升级提示块（配额超限时显示）
 */
export interface UpgradeBlock {
  type: 'upgrade';
  /** 错误类型 */
  errorType:
    | 'QUOTA_EXCEEDED'
    | 'INSUFFICIENT_CREDITS'
    | 'INSUFFICIENT_MEDIA_CREDITS';
  /** 显示消息 */
  message: string;
  /** 已使用次数 */
  used?: number;
  /** 最大次数 */
  max?: number;
  /** 重置时间（ISO 字符串） */
  resetAt?: string;
}

/**
 * 模式切换引导块（Ask 模式下请求 Agent 功能时显示）
 */
export interface ModeSwitchBlock {
  type: 'mode_switch';
  /** 目标模式 */
  targetMode: 'agent';
  /** 功能类型 */
  feature: 'image' | 'slide_deck' | 'other';
  /** 提示消息 */
  message: string;
}

// ==================== 工具相关块 ====================

/**
 * 工具调用状态
 */
export type ToolCallStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'error'
  | 'cancelled';

/**
 * 工具调用块
 */
export interface ToolCallBlock extends ExecutionMeta {
  type: 'tool_call';
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: ToolCallStatus;
  result?: {
    success: boolean;
    data?: unknown;
    error?: string;
  };
  requiresConfirmation?: boolean;
}

/**
 * 工具结果块
 */
export interface ToolResultBlock extends ExecutionMeta {
  type: 'tool_result';
  id: string;
  name: string;
  result: unknown;
  success: boolean;
  cancelled?: boolean;
  message?: string;
}

// ==================== 联合类型 ====================

/**
 * 统一内容块联合类型
 */
export type ContentBlock =
  | TextBlock
  | StatusBlock
  | ImageBlock
  | BatchImageBlock
  | BatchPreviewBlock
  | SearchBlock
  | SearchResultBatchBlock
  | ThinkingBlock
  | SuggestionsBlock
  | ToolCallBlock
  | ToolResultBlock
  | UpgradeBlock
  | ModeSwitchBlock;

// ==================== 消息引用类型 ====================

/**
 * 内容引用类型
 */
export type ReferenceType = 'summary' | 'selection' | 'snippet';

/**
 * 消息引用信息（总结/片段）
 */
export interface MessageReference {
  id: string;
  type: ReferenceType;
  summaryId: string;
  summaryTitle?: string;
  preview?: string;
}

/**
 * 图片引用信息（用户粘贴的参考图片）
 */
export interface ImageReference {
  id: string;
  preview: string;
  mimeType: string;
  thumbnailUrl?: string;
}

/**
 * 快捷指令信息
 */
export interface ShortcutInfo {
  id: string;
  name: string;
}

// ==================== 类型守卫 ====================

/**
 * 检查是否为文本块
 */
export function isTextBlock(block: ContentBlock): block is TextBlock {
  return block.type === 'text';
}

/**
 * 检查是否为状态块
 */
export function isStatusBlock(block: ContentBlock): block is StatusBlock {
  return block.type === 'status';
}

/**
 * 检查是否为图片块
 */
export function isImageBlock(block: ContentBlock): block is ImageBlock {
  return block.type === 'image';
}

/**
 * 检查是否为批量图片块
 */
export function isBatchImageBlock(
  block: ContentBlock
): block is BatchImageBlock {
  return block.type === 'batch_image';
}

/**
 * 检查是否为批量预览块
 */
export function isBatchPreviewBlock(
  block: ContentBlock
): block is BatchPreviewBlock {
  return block.type === 'batch_preview';
}

/**
 * 检查是否为搜索块
 */
export function isSearchBlock(block: ContentBlock): block is SearchBlock {
  return block.type === 'search';
}

/**
 * 检查是否为工具调用块
 */
export function isToolCallBlock(block: ContentBlock): block is ToolCallBlock {
  return block.type === 'tool_call';
}

/**
 * 检查是否为思考块
 */
export function isThinkingBlock(block: ContentBlock): block is ThinkingBlock {
  return block.type === 'thinking';
}

/**
 * 检查是否为建议块
 */
export function isSuggestionsBlock(
  block: ContentBlock
): block is SuggestionsBlock {
  return block.type === 'suggestions';
}

/**
 * 检查是否为升级提示块
 */
export function isUpgradeBlock(block: ContentBlock): block is UpgradeBlock {
  return block.type === 'upgrade';
}

/**
 * 检查是否为搜索结果批次块
 */
export function isSearchResultBatchBlock(
  block: ContentBlock
): block is SearchResultBatchBlock {
  return block.type === 'search_result_batch';
}
