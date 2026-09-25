/**
 * API 类型定义
 */

// ============================================
// 请求类型
// ============================================

/** 聊天请求 */
export interface ChatRequest {
  /** 用户输入 */
  prompt: string;
  /** AI 提供商 */
  provider?: 'claude' | 'gemini' | 'openai';
  /** 上下文信息 */
  context?: ChatContext;
  /** 会话 ID（用于多轮对话） */
  sessionId?: string;
}

/** 聊天上下文 */
export interface ChatContext {
  /** 参考内容（选中的文本等） */
  references?: string;
  /** 历史对话 */
  history?: string;
  /** 当前页面信息 */
  pageInfo?: {
    url: string;
    title: string;
  };
  /** 参考图片（用于多模态输入） */
  referenceImages?: Array<{ data: string; mimeType: string }>;
  /** 用户 ID（由认证中间件注入） */
  userId?: string;
  /** 当前项目 ID（用于卡片管理） */
  projectId?: string;
  /** 步骤级重试上下文（可选） */
  retryStep?: {
    stepId: number;
    stepType?: 'tool_call' | 'status' | 'search';
    stepLabel?: string;
    completedToolsBeforeStep?: string[];
  };
}

/** 工具确认请求 */
export interface ToolConfirmRequest {
  sessionId: string;
  toolCallId: string;
  approved: boolean;
}

// ============================================
// 响应类型
// ============================================

/** SSE 流式响应块 */
export interface StreamChunk {
  type: StreamChunkType;
  data: unknown;
}

export type StreamChunkType =
  | 'text' // 文本内容
  | 'thinking' // 思考过程
  | 'tool_call' // 工具调用
  | 'tool_result' // 工具结果
  | 'status' // 状态更新
  | 'error' // 错误
  | 'done'; // 完成

/** 文本块数据 */
export interface TextChunkData {
  content: string;
}

/** 工具调用数据 */
export interface ToolCallData {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status?: 'pending' | 'running' | 'completed' | 'error' | 'cancelled';
  requiresConfirmation?: boolean;
}

/** 工具结果数据 */
export interface ToolResultData {
  id: string;
  name: string;
  result: unknown;
  success: boolean;
  cancelled?: boolean;
  message?: string;
}

/** 状态数据 */
export interface StatusData {
  status: 'analyzing' | 'searching' | 'generating' | 'executing' | 'done';
  message?: string;
}

/** 错误数据 */
export interface ErrorData {
  message: string;
  code?: string;
}

// ============================================
// Agent 服务接口
// ============================================

/** Agent 服务接口 */
export interface IAgentService {
  /** 流式聊天 */
  chat(
    prompt: string,
    context?: ChatContext,
    sessionId?: string
  ): AsyncIterable<StreamChunk>;

  /** 获取服务名称 */
  getName(): string;

  /** 检查服务是否可用 */
  isAvailable(): Promise<boolean>;
}

// ============================================
// 工具相关类型
// ============================================

/** 工具执行结果 */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/** 工具定义（简化版，用于前端展示） */
export interface ToolDefinition {
  name: string;
  description: string;
  requiresConfirmation?: boolean;
}
