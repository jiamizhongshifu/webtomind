/**
 * 统一聊天类型定义
 * 合并普通模式和 Agent 模式的类型，实现统一架构
 */

// 从统一内容块定义导入
import type {
  ContentBlock,
  TextBlock,
  StatusBlock,
  ImageBlock,
  BatchImageBlock,
  BatchImageTask,
  BatchImageTaskStatus,
  BatchPreviewBlock,
  BatchPreviewTask,
  SearchBlock,
  ThinkingBlock,
  SuggestionsBlock,
  ToolCallBlock,
  ToolResultBlock,
  MessageReference,
  ImageReference,
  ShortcutInfo,
  UpgradeBlock,
  ModeSwitchBlock
} from './content-blocks';

// 重新导出，保持向后兼容
export type {
  ContentBlock,
  TextBlock,
  StatusBlock,
  ImageBlock,
  BatchImageBlock,
  BatchImageTask,
  BatchImageTaskStatus,
  BatchPreviewBlock,
  BatchPreviewTask,
  SearchBlock,
  ThinkingBlock,
  SuggestionsBlock,
  ToolCallBlock,
  ToolResultBlock,
  MessageReference,
  ImageReference,
  ShortcutInfo,
  UpgradeBlock,
  ModeSwitchBlock
};

// 统一内容块类型别名（向后兼容）
export type UnifiedContentBlock = ContentBlock;

// ============================================
// 基础类型
// ============================================

/** AI 提供商 */
export type ChatProvider = 'gemini' | 'claude' | 'auto';

/** 聊天模式 - 重构后：ask（快捷问答）和 agent（智能代理） */
export type ChatMode = 'ask' | 'agent';

/** 消息角色 */
export type MessageRole = 'user' | 'assistant' | 'system';

export interface AgentRunTimelineStep {
  id: string;
  title: string;
  kind?: string;
  status: 'running' | 'completed' | 'failed';
  startedAt?: number;
  endedAt?: number;
  errorMessage?: string;
}

export interface AgentRunMeta {
  /** 一次请求-响应生命周期的唯一标识 */
  runId: string;
  /** 当前消息对应的执行步骤序号（从 0 开始） */
  stepId: number;
  /** 执行开始时间戳 */
  startedAt: number;
  /** 执行结束时间戳 */
  endedAt?: number;
  /** 若为步骤级重试，记录来源步骤 */
  retryFromStepId?: number;
  /** 运行态时间线 */
  timeline?: AgentRunTimelineStep[];
  /** 运行态摘要 */
  status?: 'running' | 'waiting_async' | 'completed' | 'failed';
  /** 前端候选 skill */
  localCandidates?: Array<{ name: string; source?: string }>;
  /** 服务端最终解析 skill */
  resolvedSkills?: Array<{ name: string; source?: string }>;
}

// ============================================
// 统一消息类型
// ============================================

/** 统一消息类型 */
export interface UnifiedMessage {
  /** 唯一标识 */
  id: string;
  /** 消息角色 */
  role: MessageRole;
  /** 内容块数组 */
  blocks: UnifiedContentBlock[];
  /** 时间戳 */
  timestamp: number;
  /** 来源模式（用于区分消息来源） */
  sourceMode?: ChatMode;
  /** 内容引用（用户消息） */
  references?: MessageReference[];
  /** 图片引用（用户消息） */
  imageReferences?: ImageReference[];
  /** 快捷指令信息（用户消息） */
  shortcut?: ShortcutInfo;
  /** 图片 URL（助手消息，用于图片生成） */
  imageUrl?: string;
  /** 缩略图 URL */
  thumbnailUrl?: string;
  /** 是否启用打字机效果（Ask 模式生成完成后） */
  typewriter?: boolean;
  /** Agent 执行元数据（可用于时间线与可观测性） */
  agentRun?: AgentRunMeta;
}

// ============================================
// 聊天选项
// ============================================

/** 页面信息 */
export interface PageInfo {
  url: string;
  title: string;
}

/** 参考图片 */
export interface ReferenceImage {
  data: string;
  mimeType: string;
}

/** 上下文信息 */
export interface ChatContext {
  /** 引用内容文本 */
  references?: string;
  /** 对话历史文本 */
  history?: string;
  /** 当前页面信息 */
  pageInfo?: PageInfo;
  /** 参考图片（用于图片生成） */
  referenceImages?: ReferenceImage[];
  /** 跟进改图时的目标图片 URL（用于精确绑定） */
  targetImageUrl?: string;
  /** 跟进改图时的目标图片消息 ID */
  targetImageMessageId?: string;
  /** 当前项目 ID（用于卡片管理） */
  projectId?: string;
  /** 用户选择的功能（image/slide_deck 等），只有明确选择时才启用对应功能 */
  feature?: string;
}

/** 统一聊天选项 */
export interface UnifiedChatOptions {
  /** 聊天模式 */
  mode?: ChatMode;
  /** AI 提供商 */
  provider?: ChatProvider;
  /** 上下文信息 */
  context?: ChatContext;
  /** 会话 ID */
  sessionId?: string;
  /** 取消信号 */
  signal?: AbortSignal;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 是否启用工具（Agent 模式） */
  enableTools?: boolean;
}

// ============================================
// 流式响应类型
// ============================================

/** 流式块类型 */
export type StreamChunkType =
  | 'text'
  | 'status'
  | 'image'
  | 'search'
  | 'tool_call'
  | 'tool_result'
  | 'thinking'
  | 'error'
  | 'done'
  | 'skills'
  | 'skill_create_preview'
  | 'run_started'
  | 'step_started'
  | 'step_completed'
  | 'artifact_created'
  | 'run_waiting_async'
  | 'run_completed'
  | 'run_failed'
  | 'resolver_result';

/** 流式响应块 */
export interface StreamChunk<T = unknown> {
  type: StreamChunkType;
  data: T;
}

/** 文本流数据 */
export interface TextStreamData {
  content: string;
}

/** 状态流数据 */
export interface StatusStreamData {
  status: string;
  message?: string;
}

/** 图片流数据 */
export interface ImageStreamData {
  imageUrl: string;
  status?: 'generating' | 'done' | 'error';
}

/** 错误流数据 */
export interface ErrorStreamData {
  message: string;
  code?: string;
  retryable?: boolean;
}

/** 工具调用流数据 */
export interface ToolCallStreamData {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status?: string;
  requiresConfirmation?: boolean;
}

/** 工具结果流数据 */
export interface ToolResultStreamData {
  id: string;
  name: string;
  result: unknown;
  success: boolean;
  cancelled?: boolean;
  errorMessage?: string;
  statusDetail?: string;
  requiresConfirmation?: boolean;
  confirmationState?: string;
  auditTrail?: Array<{ type: string; at: number; detail?: unknown }>;
}

// ============================================
// Hook 状态类型
// ============================================

/** 聊天状态 */
export interface ChatState {
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
}

/** 聊天动作 */
export interface ChatActions {
  /** 发送消息 */
  sendMessage: (
    content: string,
    options?: Partial<UnifiedChatOptions>
  ) => Promise<void>;
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
}

// ============================================
// 辅助函数类型
// ============================================

/** 获取消息文本内容 */
export function getMessageText(message: UnifiedMessage): string {
  return message.blocks
    .filter((block): block is TextBlock => block.type === 'text')
    .map((block) => block.content)
    .join('');
}

/** 检查消息是否有工具调用 */
export function hasToolCalls(message: UnifiedMessage): boolean {
  return message.blocks.some((block) => block.type === 'tool_call');
}

/** 检查消息是否有图片 */
export function hasImage(message: UnifiedMessage): boolean {
  return (
    message.blocks.some((block) => block.type === 'image') || !!message.imageUrl
  );
}

/** 创建文本消息 */
export function createTextMessage(
  role: MessageRole,
  content: string,
  options?: Partial<UnifiedMessage>
): UnifiedMessage {
  return {
    id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    role,
    blocks: [{ type: 'text', content }],
    timestamp: Date.now(),
    ...options
  };
}

/** 创建空助手消息（用于流式响应） */
export function createEmptyAssistantMessage(
  sourceMode?: ChatMode
): UnifiedMessage {
  return {
    id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    role: 'assistant',
    blocks: [],
    timestamp: Date.now(),
    sourceMode
  };
}

// ============================================
// 类型转换辅助
// ============================================

/**
 * 从旧版 ChatMessage 转换为 UnifiedMessage
 * @deprecated 用于迁移期间的兼容性
 */
export function fromLegacyChatMessage(legacy: {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  blocks?: Array<{ type: string; [key: string]: unknown }>;
  imageUrl?: string;
  references?: MessageReference[];
  imageReferences?: ImageReference[];
  shortcut?: ShortcutInfo;
}): UnifiedMessage {
  // 如果有 blocks，使用 blocks；否则从 content 创建
  const blocks: ContentBlock[] = legacy.blocks?.length
    ? (legacy.blocks as unknown as ContentBlock[])
    : [{ type: 'text', content: legacy.content }];

  return {
    id: legacy.id,
    role: legacy.role,
    blocks,
    timestamp: legacy.timestamp,
    sourceMode: 'ask',
    imageUrl: legacy.imageUrl,
    references: legacy.references,
    imageReferences: legacy.imageReferences,
    shortcut: legacy.shortcut
  };
}

/**
 * 从旧版 AgentMessage 转换为 UnifiedMessage
 * @deprecated 用于迁移期间的兼容性
 */
export function fromLegacyAgentMessage(legacy: {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: Array<{ type: string; [key: string]: unknown }>;
  timestamp: number;
}): UnifiedMessage {
  return {
    id: legacy.id,
    role: legacy.role,
    blocks: legacy.content as unknown as ContentBlock[],
    timestamp: legacy.timestamp,
    sourceMode: 'agent'
  };
}

/**
 * 转换为旧版 ChatMessage 格式（用于数据库存储）
 */
export function toLegacyChatMessage(message: UnifiedMessage): {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  blocks?: ContentBlock[];
  imageUrl?: string;
  references?: MessageReference[];
  imageReferences?: ImageReference[];
  shortcut?: ShortcutInfo;
} {
  return {
    id: message.id,
    role: message.role as 'user' | 'assistant',
    content: getMessageText(message),
    timestamp: message.timestamp,
    blocks: message.blocks.length > 0 ? message.blocks : undefined,
    imageUrl: message.imageUrl,
    references: message.references,
    imageReferences: message.imageReferences,
    shortcut: message.shortcut
  };
}
