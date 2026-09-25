/**
 * 核心类型定义
 */

/**
 * 内容类型
 */
export type ContentType =
  | 'article'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'image'
  | 'tweet'
  | 'unknown';

/**
 * 提取的内容结构
 */
export interface ExtractedContent {
  /** 内容类型 */
  type: ContentType;
  /** 标题 */
  title: string;
  /** 内容文本 */
  content: string;
  /** 原始 URL */
  url: string;
  /** 元数据 */
  metadata?: {
    /** 作者 */
    author?: string;
    /** 发布时间 */
    publishedAt?: string;
    /** 是否需要转录 */
    needsTranscription?: boolean;
    /** 媒体文件 URL */
    mediaUrl?: string;
    /** 缩略图 */
    thumbnail?: string;
    /** 时长（秒） */
    duration?: number;
    [key: string]: unknown;
  };
}

/**
 * API 使用统计
 */
export interface APIUsage {
  /** 输入 token 数 */
  inputTokens: number;
  /** 输出 token 数 */
  outputTokens: number;
  /** 总 token 数 */
  totalTokens?: number;
}

/**
 * 总结结果
 */
export interface SummaryResult {
  /** Markdown 格式的思维导图 */
  markdown: string;
  /** API 使用统计 */
  usage: APIUsage;
  /** 错误信息 */
  error?: string;
}

/**
 * 总结选项
 */
export interface SummaryOptions {
  /** 语言 */
  language?: 'zh-CN' | 'en-US';
  /** 总结深度（层级数） */
  depth?: number;
  /** 任务复杂度 */
  complexity?: 'low' | 'high';
  /** 思维级别（仅 Gemini） */
  thinking?: 'minimal' | 'low' | 'medium' | 'high';
  /** 自定义 Prompt */
  customPrompt?: string;
}

/**
 * 音频处理选项
 */
export interface AudioOptions extends SummaryOptions {
  /** 是否启用说话人分离 */
  speakerDiarization?: boolean;
  /** 是否包含时间戳 */
  timestamps?: boolean;
  /** 是否识别情感 */
  emotions?: boolean;
}

/**
 * 视频处理选项
 */
export interface VideoOptions extends AudioOptions {
  /** 是否提取关键帧 */
  extractKeyframes?: boolean;
  /** 是否分析视觉内容 */
  analyzeVisuals?: boolean;
}

/**
 * PDF 处理选项
 */
export interface PDFOptions extends SummaryOptions {
  /** 是否包含图像 */
  includeImages?: boolean;
  /** 是否启用 OCR */
  ocr?: boolean;
}

/**
 * Markmap 配置选项
 */
export interface MarkMapOptions {
  /** 颜色冻结级别 */
  colorFreezeLevel?: number;
  /** 主题颜色 */
  color?: string;
  /** 最大宽度 */
  maxWidth?: number;
  /** 初始展开级别 */
  initialExpandLevel?: number;
}

/**
 * 历史记录条目
 */
export interface HistoryEntry {
  /** 唯一 ID */
  id: string;
  /** 标题 */
  title: string;
  /** 内容类型 */
  type: ContentType;
  /** 原始 URL */
  url: string;
  /** 思维导图 Markdown */
  markdown: string;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
  /** 标签 */
  tags?: string[];
  /** 是否收藏 */
  starred?: boolean;
}

/**
 * 引用内容
 */
export interface Reference {
  /** 唯一 ID */
  id: string;
  /** 引用类型: summary-整个总结, selection-选中文字 */
  type: 'summary' | 'selection';
  /** 来源总结的 ID */
  summaryId: string;
  /** 来源总结的标题（用于显示） */
  summaryTitle: string;
  /** 引用内容 */
  content: string;
  /** 预览文字（5-8个字符） */
  preview: string;
  /** 画布上下文元数据，用于区分当前节点、上游节点和手动启用节点 */
  canvas?: {
    nodeId: string;
    role: 'selected' | 'upstream' | 'active' | 'target';
    customNodeType?: 'ai_image_holder' | 'annotation';
    targetWidth?: number;
    targetHeight?: number;
    aspectRatio?: string;
    aspectPreset?: string;
    /** Canvas image URL used as an editable/generation target for Agent mode. */
    imageUrl?: string;
    annotationKind?:
      | 'note'
      | 'arrow_text'
      | 'box_text'
      | 'circle_text'
      | 'draw_mark'
      | 'text_near_image';
    version?: number;
  };
}
