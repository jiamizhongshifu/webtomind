/**
 * 文本测量工具 - 基于 Pretext 架构思路
 * 提供高性能的文本高度预计算，消除 DOM 布局抖动
 *
 * 核心优势：
 * - 纯算术计算，零 DOM 操作
 * - 支持 CJK 字符精确测量
 * - 批量计算性能优异
 */

import { createLogger } from './logger';

const log = createLogger('text-measure');

// 默认字体配置（需与 CSS 保持一致）
const DEFAULT_FONT =
  '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const DEFAULT_TITLE_FONT =
  '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const COMPACT_TITLE_FONT =
  '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

// 行高配置（需与 CSS line-height 保持一致）
const LINE_HEIGHT = 1.5;
const TITLE_LINE_HEIGHT = 1.4;

// 卡片内边距和间距（像素）
const CARD_PADDING = 16; // p-4 = 16px
const CARD_PADDING_COMPACT = 12; // p-3 = 12px
const TITLE_MARGIN_BOTTOM = 8; // mb-2 = 8px
const EXCERPT_MARGIN_BOTTOM = 8; // mb-2 = 8px
const TIME_TEXT_HEIGHT = 16; // text-xs 约 12px + 间距
const SELECTION_CHECKBOX_HEIGHT = 28; // 选择框区域高度

// 标题最大行数
const TITLE_MAX_LINES_NORMAL = 3;
const TITLE_MAX_LINES_COMPACT = 2;
const EXCERPT_MAX_LINES = 3;

/**
 * 测量配置选项
 */
export interface MeasureOptions {
  /** 卡片宽度（像素） */
  cardWidth: number;
  /** 是否紧凑模式 */
  isCompact?: boolean;
  /** 是否显示选择框 */
  hasSelection?: boolean;
}

/**
 * 卡片高度计算结果
 */
export interface CardHeightResult {
  /** 预测的卡片总高度（像素） */
  height: number;
  /** 标题实际行数 */
  titleLines: number;
  /** 摘要实际行数（紧凑模式为 0） */
  excerptLines: number;
}

/**
 * 从字体字符串中提取字号（像素）
 */
function getFontSize(font: string): number {
  const match = font.match(/(\d+)px/);
  return match ? parseInt(match[1], 10) : 14;
}

/**
 * 判断字符是否为 CJK 字符（中日韩）
 */
function isCJK(char: string): boolean {
  const code = char.charCodeAt(0);
  return (
    (code >= 0x4e00 && code <= 0x9fff) || // CJK 统一表意文字
    (code >= 0x3400 && code <= 0x4dbf) || // CJK 扩展 A
    (code >= 0x3040 && code <= 0x309f) || // 平假名
    (code >= 0x30a0 && code <= 0x30ff) || // 片假名
    (code >= 0xac00 && code <= 0xd7af) // 韩文
  );
}

/**
 * 测量文本在指定宽度下的行数和高度
 */
function measureText(
  text: string,
  font: string,
  maxWidth: number,
  maxLines: number,
  lineHeight: number
): { lines: number; height: number } {
  if (!text || text.trim().length === 0) {
    return { lines: 0, height: 0 };
  }

  const fontSize = getFontSize(font);

  // 逐行检查（支持 CJK 字符）
  let currentWidth = 0;
  let lines = 1;
  for (let i = 0; i < text.length && lines < maxLines; i++) {
    const charWidth = fontSize * (isCJK(text[i]) ? 1.0 : 0.6);
    if (currentWidth + charWidth > maxWidth) {
      lines++;
      currentWidth = charWidth;
    } else {
      currentWidth += charWidth;
    }
  }

  const height = lines * lineHeight;
  return { lines, height };
}

/**
 * 清理 markdown 标记，获取纯文本
 */
function stripMarkdown(markdown: string): string {
  if (!markdown) return '';

  return (
    markdown
      // 移除标题标记
      .replace(/^#{1,6}\s+/gm, '')
      // 移除粗体/斜体
      .replace(/\*\*?/g, '')
      // 移除链接，保留文本
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // 移除图片
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      // 移除行内代码
      .replace(/`([^`]+)`/g, '$1')
      // 移除代码块
      .replace(/```[\s\S]*?```/g, '')
      // 移除 HTML 标签
      .replace(/<[^>]+>/g, '')
      // 移除多余空行
      .replace(/\n{2,}/g, '\n')
      // 取第一行作为摘要（限制长度）
      .split('\n')[0]
      .trim()
      .slice(0, 200)
  );
}

/**
 * 计算 Summary 卡片的高度
 *
 * 卡片结构：
 * - 内边距（上下）
 * - 标题（2-3 行，取决于模式）
 * - 标题下边距
 * - [摘要]（3 行，正常模式）
 * - [摘要下边距]
 * - 时间戳（1 行）
 * - [选择框区域]
 *
 * @param title 标题文本
 * @param excerpt 摘要文本（markdown）
 * @param options 测量选项
 * @returns 预测的卡片高度
 */
export function predictCardHeight(
  title: string,
  excerpt: string | undefined,
  options: MeasureOptions
): CardHeightResult {
  const { cardWidth, isCompact = false, hasSelection = false } = options;

  // 内容区域宽度 = 卡片宽度 - 左右内边距
  const contentWidth = cardWidth - (isCompact ? CARD_PADDING_COMPACT : CARD_PADDING) * 2;

  // 标题测量
  const titleFont = isCompact ? COMPACT_TITLE_FONT : DEFAULT_TITLE_FONT;
  const titleMaxLines = isCompact ? TITLE_MAX_LINES_COMPACT : TITLE_MAX_LINES_NORMAL;
  const titleResult = measureText(
    title || '',
    titleFont,
    contentWidth,
    titleMaxLines,
    TITLE_LINE_HEIGHT * getFontSize(titleFont)
  );

  // 摘要测量（紧凑模式无摘要）
  let excerptResult = { lines: 0, height: 0 };
  if (!isCompact && excerpt) {
    // 清理 markdown 标记，获取纯文本用于测量
    const plainExcerpt = stripMarkdown(excerpt);
    excerptResult = measureText(
      plainExcerpt,
      DEFAULT_FONT,
      contentWidth,
      EXCERPT_MAX_LINES,
      LINE_HEIGHT * getFontSize(DEFAULT_FONT)
    );
  }

  // 计算总高度
  const padding = isCompact ? CARD_PADDING_COMPACT : CARD_PADDING;
  const titleMargin = isCompact ? 4 : TITLE_MARGIN_BOTTOM; // 紧凑模式 mb-1 = 4px

  let totalHeight =
    padding * 2 + // 上下内边距
    titleResult.height +
    titleMargin;

  if (!isCompact && excerptResult.height > 0) {
    totalHeight += excerptResult.height + EXCERPT_MARGIN_BOTTOM;
  }

  totalHeight += TIME_TEXT_HEIGHT; // 时间戳

  if (hasSelection) {
    totalHeight += SELECTION_CHECKBOX_HEIGHT; // 选择框额外空间
  }

  return {
    height: Math.round(totalHeight),
    titleLines: titleResult.lines,
    excerptLines: excerptResult.lines,
  };
}

/**
 * 批量预测多个卡片的高度
 * 性能优化：批量计算减少开销
 *
 * @param items 卡片数据数组
 * @param options 测量选项
 * @returns 每个卡片的预测高度数组
 */
export function predictCardHeights(
  items: Array<{ id: string; title: string; excerpt?: string }>,
  options: MeasureOptions
): Map<string, CardHeightResult> {
  const results = new Map<string, CardHeightResult>();

  // 批量计算以提高性能
  const startTime = performance.now();

  for (const item of items) {
    const result = predictCardHeight(item.title, item.excerpt, options);
    results.set(item.id, result);
  }

  const elapsed = performance.now() - startTime;
  if (elapsed > 16) {
    // 超过一帧时间，记录警告
    log.warn(`predictCardHeights took ${elapsed.toFixed(2)}ms for ${items.length} items`);
  }

  return results;
}

// ==================== 消息高度预测（用于 VirtualMessageList）====================

// 消息字体配置
const MESSAGE_USER_FONT =
  '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const MESSAGE_ASSISTANT_FONT =
  '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

// 消息基础高度
const MESSAGE_USER_BASE_HEIGHT = 48; // 用户消息基础高度（气泡+内边距）
const MESSAGE_ASSISTANT_BASE_HEIGHT = 64; // AI 消息基础高度

// 各种区块的高度估算
const BLOCK_HEIGHTS = {
  text: 24, // 每行文本平均高度
  paragraph: 20, // 每个段落额外高度
  code: 20, // 代码块每行
  codeBlock: 40, // 代码块标题/边框
  image: 200, // 图片默认高度
  thinking: 60, // thinking 块高度
  status: 30, // 状态块
  tool: 40, // 工具调用块
  divider: 16, // 分割线
  list: 22, // 列表每项
  heading: 28, // 标题
};

// 引用标签区域高度
const REF_TAG_HEIGHT = 28;
const ACTION_BUTTONS_HEIGHT = 32;

/**
 * 预测用户消息的高度
 * @param text 消息文本
 * @param hasRefs 是否有引用
 * @param hasImgRefs 是否有图片引用
 * @param hasShortcut 是否有快捷指令
 * @param maxWidth 消息最大宽度
 */
export function predictUserMessageHeight(
  text: string,
  options: {
    hasRefs?: boolean;
    hasImgRefs?: boolean;
    hasShortcut?: boolean;
    hasActionButtons?: boolean;
    maxWidth?: number;
  }
): number {
  const {
    hasRefs = false,
    hasImgRefs = false,
    hasShortcut = false,
    hasActionButtons = true,
    maxWidth = 600,
  } = options;

  // 文本高度计算
  const lineHeight = 20; // leading-relaxed 约 1.43
  const contentWidth = maxWidth * 0.75 - 32; // max-w-[75%] - padding

  const { lines } = measureText(text, MESSAGE_USER_FONT, contentWidth, 100, lineHeight);
  const textHeight = Math.max(20, lines * lineHeight);

  let totalHeight = MESSAGE_USER_BASE_HEIGHT + textHeight;

  // 引用标签区域
  if (hasRefs || hasImgRefs || hasShortcut) {
    totalHeight += REF_TAG_HEIGHT;
  }

  // 操作按钮区域（复制/重试/保存）
  if (hasActionButtons) {
    totalHeight += ACTION_BUTTONS_HEIGHT;
  }

  return Math.round(totalHeight);
}

/**
 * 预测 AI 消息的高度
 * @param blocks 消息内容块
 * @param content 文本内容
 * @param hasRunInfo 是否有运行信息
 * @param maxWidth 消息最大宽度
 */
export function predictAssistantMessageHeight(
  blocks: Array<{ type: string; content?: string }>,
  content: string,
  options: {
    hasRunInfo?: boolean;
    hasTimeline?: boolean;
    maxWidth?: number;
  }
): number {
  const { hasRunInfo = false, hasTimeline = false, maxWidth = 600 } = options;

  const contentWidth = maxWidth * 0.85 - 32; // max-w-[85%] - padding
  let blocksHeight = 0;

  // 遍历所有 blocks 计算高度
  for (const block of blocks) {
    switch (block.type) {
      case 'text': {
        const text = block.content || '';
        const { lines } = measureText(
          text,
          MESSAGE_ASSISTANT_FONT,
          contentWidth,
          100,
          20
        );
        blocksHeight += Math.max(BLOCK_HEIGHTS.text, lines * 20);
        break;
      }
      case 'code':
      case 'code-block': {
        const code = block.content || '';
        const codeLines = code.split('\n').length;
        blocksHeight += Math.min(codeLines * BLOCK_HEIGHTS.code + BLOCK_HEIGHTS.codeBlock, 400);
        break;
      }
      case 'image':
        blocksHeight += BLOCK_HEIGHTS.image;
        break;
      case 'thinking':
        blocksHeight += BLOCK_HEIGHTS.thinking;
        break;
      case 'status':
        blocksHeight += BLOCK_HEIGHTS.status;
        break;
      case 'tool':
        blocksHeight += BLOCK_HEIGHTS.tool;
        break;
      case 'divider':
        blocksHeight += BLOCK_HEIGHTS.divider;
        break;
      default:
        blocksHeight += BLOCK_HEIGHTS.text;
    }
  }

  // 如果没有 blocks，按纯文本计算
  if (blocks.length === 0 && content) {
    const { lines } = measureText(content, MESSAGE_ASSISTANT_FONT, contentWidth, 100, 20);
    blocksHeight += Math.max(40, lines * 20);
  }

  let totalHeight = MESSAGE_ASSISTANT_BASE_HEIGHT + blocksHeight;

  // 运行信息区域
  if (hasRunInfo) {
    totalHeight += 60; // 运行 ID + 按钮
  }

  // 时间线
  if (hasTimeline) {
    totalHeight += 24; // 时间线高度
  }

  return Math.round(totalHeight);
}

/**
 * 批量预测消息高度（用于虚拟滚动）
 * @param messages 消息数组
 * @returns 每条消息的预测高度数组
 */
export function predictMessageHeights(
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content?: string;
    blocks?: Array<{ type: string; content?: string }>;
    references?: unknown[];
    imageReferences?: unknown[];
    shortcut?: unknown;
    agentRun?: { runId?: string; timeline?: unknown[] };
  }>,
  options?: { maxWidth?: number }
): number[] {
  const { maxWidth = 600 } = options || {};
  const startTime = performance.now();

  const heights = messages.map((msg) => {
    if (msg.role === 'user') {
      return predictUserMessageHeight(msg.content || '', {
        hasRefs: (msg.references?.length || 0) > 0,
        hasImgRefs: (msg.imageReferences?.length || 0) > 0,
        hasShortcut: !!msg.shortcut,
        maxWidth,
      });
    } else {
      return predictAssistantMessageHeight(msg.blocks || [], msg.content || '', {
        hasRunInfo: !!msg.agentRun?.runId,
        hasTimeline: (msg.agentRun?.timeline?.length || 0) > 0,
        maxWidth,
      });
    }
  });

  const elapsed = performance.now() - startTime;
  if (elapsed > 16) {
    log.warn(`predictMessageHeights took ${elapsed.toFixed(2)}ms for ${messages.length} messages`);
  }

  return heights;
}
