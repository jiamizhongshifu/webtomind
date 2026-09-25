/**
 * AI 服务相关类型定义
 */

import type {
  SummaryResult,
  SummaryOptions,
  AudioOptions,
  VideoOptions,
  PDFOptions
} from './index';

/**
 * AI 提供商类型
 */
export type AIProviderType = 'gemini' | 'claude' | 'auto';

/**
 * Gemini 模型
 */
export type GeminiModel =
  | 'gemini-3-flash'
  | 'gemini-3.1-flash-lite-preview'
  | 'gemini-3.1-flash-image-preview'
  | 'gemini-3-flash-preview'
  | 'gemini-2.5-flash'
  | 'gemini-2.0-flash'
  | 'gemini-3-pro-preview'
  | 'gemini-2.0-flash-exp';

/**
 * Claude 模型
 */
export type ClaudeModel =
  | 'claude-3-5-sonnet-20241022'
  | 'claude-sonnet-4-20250514'
  | 'claude-opus-4-20250514'
  | 'claude-3-5-haiku-20241022';

/**
 * 思维级别（Gemini 专用）
 */
export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';

/**
 * AI Provider 统一接口
 */
export interface AIProvider {
  /**
   * 将文本内容总结为思维导图(阻塞式)
   */
  summarizeToMindmap(
    content: string,
    options?: SummaryOptions
  ): Promise<SummaryResult>;

  /**
   * 流式生成思维导图(可选,推荐使用以提升用户体验)
   */
  summarizeToMindmapStream?(
    content: string,
    options?: SummaryOptions,
    onChunk?: (chunk: string, done: boolean) => void
  ): Promise<SummaryResult>;

  /**
   * 处理音频文件
   */
  processAudio(file: File, options?: AudioOptions): Promise<SummaryResult>;

  /**
   * 处理视频文件
   */
  processVideo(file: File, options?: VideoOptions): Promise<SummaryResult>;

  /**
   * 处理 PDF 文件
   */
  processPDF(file: File, options?: PDFOptions): Promise<SummaryResult>;

  /**
   * 处理图像文件
   */
  processImage(file: File, options?: SummaryOptions): Promise<SummaryResult>;
}

/**
 * Gemini 配置
 */
export interface GeminiConfig {
  /** API Key (直接调用时需要) */
  apiKey: string;
  /** 代理 URL (使用代理时填写，如 https://example.com/api/ai/gemini) */
  proxyUrl?: string;
  /** 默认模型 */
  model?: GeminiModel;
  /** 默认思维级别 */
  thinking?: ThinkingLevel;
  /** 最大输出 tokens */
  maxOutputTokens?: number;
  /** 温度参数 */
  temperature?: number;
}

/**
 * Claude 配置
 */
export interface ClaudeConfig {
  /** API Key */
  apiKey: string;
  /** 默认模型 */
  model?: ClaudeModel;
  /** 最大输出 tokens */
  maxOutputTokens?: number;
  /** 温度参数 */
  temperature?: number;
}

/**
 * AI 配置
 */
export interface AIConfig {
  /** 主要提供商 */
  provider: AIProviderType;

  /** Gemini 配置 */
  gemini?: GeminiConfig;

  /** Claude 配置 */
  claude?: ClaudeConfig;

  /** 是否启用自动降级 */
  fallback?: boolean;

  /** 是否启用缓存 */
  cache?: boolean;

  /** 缓存过期时间（秒） */
  cacheTTL?: number;
}

/**
 * API 错误
 */
export class AIServiceError extends Error {
  constructor(
    message: string,
    public code?: string,
    public status?: number,
    public provider?: AIProviderType
  ) {
    super(message);
    this.name = 'AIServiceError';
  }
}
