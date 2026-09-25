import { executeTool } from '../tools/index.js';
import * as db from '../services/supabase.js';
import type {
  WorkspaceTaskRequest,
  WorkspaceTaskResult,
  WorkspaceTaskStep
} from '../types/workspace-task.js';

export interface OpenClawExecutionInput {
  userId: string;
  task: WorkspaceTaskRequest;
}

export interface OpenClawExecutionOutput {
  result: WorkspaceTaskResult;
  steps: WorkspaceTaskStep[];
}

type SearchResultItem = {
  title?: string;
  snippet?: string;
  url?: string;
};

type SearchToolPayload = {
  query?: string;
  results?: SearchResultItem[];
  message?: string;
};

type ExtractToolPayload = {
  url?: string;
  title?: string;
  content?: string;
  excerpt?: string;
  siteName?: string;
  byline?: string | null;
};

type SlideDeckToolPayload = {
  success?: boolean;
  downloadUrl?: string;
  slideCount?: number;
  outline?: string[];
  error?: string;
};

type NotebookLMSourceType = 'url' | 'youtube' | 'pdf' | 'text';
type NotebookLMOutputType =
  | 'flashcards'
  | 'mindmap'
  | 'report'
  | 'quiz'
  | 'summary'
  | 'audio'
  | 'video'
  | 'infographic'
  | 'slide_deck'
  | 'data_table';

type NotebookLMProcessPayload = {
  taskId?: string;
  status?: string;
  estimatedTime?: number;
  message?: string;
};

type NotebookLMStatusPayload = {
  status?: string;
  progress?: number;
  result?: unknown;
  error?: string;
  message?: string;
};

type SearchMode = 'web_search' | 'academic_search' | 'news_search';

function buildTaskStep(
  id: string,
  title: string,
  kind: string,
  status: WorkspaceTaskStep['status'],
  detail?: string
): WorkspaceTaskStep {
  const now = Date.now();
  return {
    id,
    title,
    kind,
    status,
    startedAt: status === 'running' || status === 'completed' ? now : undefined,
    endedAt: status === 'completed' || status === 'failed' ? now : undefined,
    detail
  };
}

function resolveSearchMode(task: WorkspaceTaskRequest): SearchMode {
  const format = task.params.format;
  if (format === 'academic_search' || format === 'news_search') {
    return format;
  }
  return 'web_search';
}

function resolveNotebookLMOutputType(task: WorkspaceTaskRequest): NotebookLMOutputType {
  const format = task.params.format;
  const allowed: NotebookLMOutputType[] = [
    'flashcards',
    'mindmap',
    'report',
    'quiz',
    'summary',
    'audio',
    'video',
    'infographic',
    'slide_deck',
    'data_table'
  ];

  if (typeof format === 'string' && allowed.includes(format as NotebookLMOutputType)) {
    return format as NotebookLMOutputType;
  }

  return 'summary';
}

function resolveNotebookLMSourceType(task: WorkspaceTaskRequest, content: string): NotebookLMSourceType {
  const explicitType = task.params.sourceType;
  if (
    explicitType === 'url' ||
    explicitType === 'youtube' ||
    explicitType === 'pdf' ||
    explicitType === 'text'
  ) {
    return explicitType;
  }

  if (/^https?:\/\/((www\.)?youtube\.com|youtu\.be)\//i.test(content)) {
    return 'youtube';
  }

  if (/^https?:\/\//i.test(content)) {
    return 'url';
  }

  return 'text';
}

function resolveNotebookLMLanguage(task: WorkspaceTaskRequest): 'zh-CN' | 'en-US' | undefined {
  const language = task.params.language;
  if (language === 'zh-CN' || language === 'en-US') {
    return language;
  }
  return undefined;
}

function resolveNotebookLMMaxItems(task: WorkspaceTaskRequest): number | undefined {
  const maxItems = task.params.maxItems;
  if (typeof maxItems === 'number' && Number.isFinite(maxItems)) {
    return Math.max(1, Math.round(maxItems));
  }
  return undefined;
}

function resolveNotebookLMTimeoutSeconds(task: WorkspaceTaskRequest, outputType: NotebookLMOutputType): number {
  const timeout = task.params.timeout;
  if (typeof timeout === 'number' && Number.isFinite(timeout)) {
    return Math.min(Math.max(Math.round(timeout), 30), 600);
  }

  if (outputType === 'video') return 600;
  if (outputType === 'audio') return 300;
  return 120;
}

function resolveSearchQuery(task: WorkspaceTaskRequest): string {
  const customPrompt = task.params.customPrompt;
  if (typeof customPrompt === 'string' && customPrompt.trim()) {
    return customPrompt.trim();
  }

  const prompt = task.params.prompt;
  if (typeof prompt === 'string' && prompt.trim()) {
    return prompt.trim();
  }

  return '最新信息';
}

function resolveWebSearchMaxResults(task: WorkspaceTaskRequest): number {
  const depth = task.params.search_depth;
  if (depth === 'deep') return 10;
  if (depth === 'standard') return 6;
  return 4;
}

function resolveSearchQueryPrefix(mode: SearchMode): string {
  if (mode === 'academic_search') {
    return '学术研究';
  }
  if (mode === 'news_search') {
    return '最新新闻';
  }
  return '';
}

function resolveSourceFilterLabel(task: WorkspaceTaskRequest): string {
  const sourceFilter = task.params.source_filter;
  if (typeof sourceFilter !== 'string' || sourceFilter === 'all') {
    return '';
  }

  const labels: Record<string, string> = {
    news: '新闻网站',
    blog: '博客',
    academic: '学术来源',
    official: '官方网站'
  };

  return labels[sourceFilter] || sourceFilter;
}

function resolveLanguageLabel(task: WorkspaceTaskRequest): string {
  const language = task.params.language;
  if (typeof language !== 'string' || language === 'all') {
    return '';
  }

  const labels: Record<string, string> = {
    'zh-CN': '简体中文',
    'en-US': '英文'
  };

  return labels[language] || language;
}

function buildSearchQuery(task: WorkspaceTaskRequest): string {
  const rawQuery = resolveSearchQuery(task);
  const modePrefix = resolveSearchQueryPrefix(resolveSearchMode(task));
  const sourceFilter = resolveSourceFilterLabel(task);
  const language = resolveLanguageLabel(task);
  const parts = [modePrefix, rawQuery, sourceFilter, language].filter(Boolean);
  return parts.join(' ');
}

function buildSearchSummary(mode: SearchMode, task: WorkspaceTaskRequest): string[] {
  const lines: string[] = [];
  lines.push(`- 搜索模式：${mode}`);

  const language = resolveLanguageLabel(task);
  if (language) {
    lines.push(`- 语言：${language}`);
  }

  const sourceFilter = resolveSourceFilterLabel(task);
  if (sourceFilter) {
    lines.push(`- 来源筛选：${sourceFilter}`);
  }

  const depth = task.params.search_depth;
  if (typeof depth === 'string' && depth) {
    lines.push(`- 搜索深度：${depth}`);
  }

  return lines;
}

async function buildSummaryReferenceContent(
  task: WorkspaceTaskRequest,
  userId: string
): Promise<string> {
  const summaryIds = task.context.selectedSummaryIds || [];
  if (summaryIds.length === 0) {
    return '';
  }

  const chunks = await Promise.all(
    summaryIds.map(async (id) => {
      const summary = await db.getSummaryById(id, userId, task.context.projectId || undefined);
      if (!summary) {
        return null;
      }
      return `# ${summary.title}\n\n${summary.markdown || ''}`;
    })
  );

  return chunks.filter((item): item is string => !!item).join('\n\n---\n\n');
}

function buildInfographicInstructions(task: WorkspaceTaskRequest): string {
  const parts: string[] = [];

  const orientation = task.params.orientation;
  if (typeof orientation === 'string' && orientation !== 'landscape') {
    const orientationLabels: Record<string, string> = {
      portrait: '纵向（竖屏）布局',
      square: '方形布局'
    };
    parts.push(`布局方向：${orientationLabels[orientation] || orientation}`);
  }

  const visualStyle = task.params.visual_style;
  if (typeof visualStyle === 'string' && visualStyle !== 'auto') {
    const styleLabels: Record<string, string> = {
      'sketch-notes': '手绘笔记风格',
      cute: '可爱插画风格',
      professional: '专业商务风格',
      scientific: '科学/学术风格',
      anime: '动漫风格',
      minimal: '极简风格',
      vintage: '复古风格'
    };
    parts.push(`视觉风格：${styleLabels[visualStyle] || visualStyle}`);
  }

  const detailLevel = task.params.detail_level;
  if (typeof detailLevel === 'string' && detailLevel !== 'standard') {
    const detailLabels: Record<string, string> = {
      brief: '简短精炼，只保留核心要点',
      detailed: '详细丰富，包含更多数据和说明'
    };
    parts.push(`详细程度：${detailLabels[detailLevel] || detailLevel}`);
  }

  return parts.length > 0 ? `信息图生成要求：\n${parts.join('\n')}` : '';
}

function resolveSlideDeckLanguage(task: WorkspaceTaskRequest): 'auto' | 'zh' | 'en' {
  const language = task.params.language;
  if (language === 'zh-CN') return 'zh';
  if (language === 'en-US') return 'en';
  if (language === 'ja-JP') return 'auto'; // 日语回退到 auto，由模型自动处理
  return 'auto';
}

function resolveSlideDeckStyle(task: WorkspaceTaskRequest): string {
  // 优先使用显式 style 参数
  const style = task.params.style;
  if (typeof style === 'string' && style.trim()) {
    return style.trim();
  }

  // 根据 format 推断风格：detailed → notion（清晰易读），presentation → corporate（演讲型）
  const format = task.params.format;
  if (format === 'detailed') return 'notion';
  if (format === 'presentation') return 'corporate';

  return 'blueprint';
}

function resolveSlideDeckCount(task: WorkspaceTaskRequest): number {
  // 优先使用显式 slideCount
  const slideCount = task.params.slideCount;
  if (typeof slideCount === 'number' && Number.isFinite(slideCount)) {
    return Math.min(Math.max(Math.round(slideCount), 5), 20);
  }

  // 根据 duration + format 推断页数
  const duration = task.params.duration;
  const format = task.params.format;
  if (duration === 'short') {
    return format === 'detailed' ? 6 : 5;
  }
  // default duration
  return format === 'detailed' ? 12 : 10;
}

function resolveSlideDeckTitle(task: WorkspaceTaskRequest): string | undefined {
  const title = task.params.title;
  if (typeof title === 'string' && title.trim()) {
    return title.trim();
  }
  return undefined;
}

async function buildSlideDeckContent(
  task: WorkspaceTaskRequest,
  userId: string
): Promise<string> {
  const parts: string[] = [];
  const customPrompt = task.params.customPrompt;
  if (typeof customPrompt === 'string' && customPrompt.trim()) {
    parts.push(customPrompt.trim());
  }

  const prompt = task.params.prompt;
  if (typeof prompt === 'string' && prompt.trim()) {
    parts.push(prompt.trim());
  }

  const references = await buildSummaryReferenceContent(task, userId);
  if (references) {
    parts.push(references);
  }

  return parts.join('\n\n---\n\n').trim();
}

async function buildNotebookLMSourceContent(
  task: WorkspaceTaskRequest,
  userId: string
): Promise<string> {
  const directSource = task.params.source;
  if (typeof directSource === 'string' && directSource.trim()) {
    return directSource.trim();
  }

  const customPrompt = task.params.customPrompt;
  if (typeof customPrompt === 'string' && customPrompt.trim()) {
    return customPrompt.trim();
  }

  const prompt = task.params.prompt;
  if (typeof prompt === 'string' && prompt.trim()) {
    return prompt.trim();
  }

  return buildSummaryReferenceContent(task, userId);
}

function buildSlideDeckResult(
  content: string,
  payload: SlideDeckToolPayload,
  task: WorkspaceTaskRequest
): string {
  const lines: string[] = [];
  lines.push(`# PPT 生成结果`);
  lines.push('');
  lines.push('已完成 slide_deck_generation 工作流。');
  lines.push('');
  lines.push('## 输出配置');
  lines.push('');
  lines.push(`- 风格：${resolveSlideDeckStyle(task)}`);
  lines.push(`- 页数：${payload.slideCount || resolveSlideDeckCount(task)}`);
  lines.push(`- 语言：${resolveSlideDeckLanguage(task)}`);
  if (resolveSlideDeckTitle(task)) {
    lines.push(`- 标题：${resolveSlideDeckTitle(task)}`);
  }
  lines.push('');

  if (payload.downloadUrl) {
    lines.push('## 下载链接');
    lines.push('');
    lines.push(payload.downloadUrl);
    lines.push('');
  }

  if (Array.isArray(payload.outline) && payload.outline.length > 0) {
    lines.push('## 大纲');
    lines.push('');
    payload.outline.forEach((item, index) => {
      lines.push(`${index + 1}. ${item}`);
    });
    lines.push('');
  }

  lines.push('## 输入摘要');
  lines.push('');
  lines.push(content.slice(0, 2000) || '未提供内容');

  return lines.join('\n').trim();
}

function getSlideDeckPayload(result: unknown): SlideDeckToolPayload {
  if (!result || typeof result !== 'object') {
    return {};
  }
  return result as SlideDeckToolPayload;
}

function getNotebookLMProcessPayload(result: unknown): NotebookLMProcessPayload {
  if (!result || typeof result !== 'object') {
    return {};
  }
  return result as NotebookLMProcessPayload;
}

function getNotebookLMStatusPayload(result: unknown): NotebookLMStatusPayload {
  if (!result || typeof result !== 'object') {
    return {};
  }
  return result as NotebookLMStatusPayload;
}

function getSearchResults(result: unknown): SearchResultItem[] {
  if (!result || typeof result !== 'object') {
    return [];
  }

  const payload = result as SearchToolPayload;
  return Array.isArray(payload.results) ? payload.results : [];
}

function formatSearchResult(result: unknown, summaryLines: string[] = []): string {
  if (!result || typeof result !== 'object') {
    return '未获取到搜索结果。';
  }

  const payload = result as SearchToolPayload;

  if (!payload.results || payload.results.length === 0) {
    return payload.message || '未获取到搜索结果。';
  }

  const lines: string[] = [];
  lines.push(`# 搜索结果：${payload.query || '未命名查询'}`);
  if (summaryLines.length > 0) {
    lines.push('');
    lines.push(...summaryLines);
  }
  lines.push('');

  payload.results.forEach((item, index) => {
    lines.push(`## ${index + 1}. ${item.title || '未命名结果'}`);
    if (item.snippet) {
      lines.push(item.snippet);
    }
    if (item.url) {
      lines.push(item.url);
    }
    lines.push('');
  });

  return lines.join('\n').trim();
}

function buildAnalysisResult(
  query: string,
  searchResults: SearchResultItem[],
  extractedPages: ExtractToolPayload[]
): string {
  const lines: string[] = [];
  lines.push(`# 综合分析：${query}`);
  lines.push('');
  lines.push('## 背景概述');
  lines.push('');
  lines.push(`围绕“${query}”进行了全网检索，并对优先结果中的重点页面进行了内容提取。以下内容用于快速建立主题全貌。`);
  lines.push('');

  lines.push('## 搜索发现');
  lines.push('');
  if (searchResults.length === 0) {
    lines.push('- 未获取到有效搜索结果。');
  } else {
    searchResults.slice(0, 5).forEach((item, index) => {
      lines.push(`### ${index + 1}. ${item.title || '未命名结果'}`);
      if (item.snippet) {
        lines.push(item.snippet);
      }
      if (item.url) {
        lines.push(`来源：${item.url}`);
      }
      lines.push('');
    });
  }

  lines.push('## 重点页面提炼');
  lines.push('');
  if (extractedPages.length === 0) {
    lines.push('- 未成功提取重点页面正文。');
  } else {
    extractedPages.forEach((page, index) => {
      lines.push(`### ${index + 1}. ${page.title || page.url || '未命名页面'}`);
      if (page.siteName || page.byline) {
        lines.push(
          [page.siteName, page.byline].filter(Boolean).join(' · ')
        );
      }
      if (page.url) {
        lines.push(`链接：${page.url}`);
      }
      if (page.excerpt) {
        lines.push(`摘要：${page.excerpt}`);
      }
      if (page.content) {
        lines.push('');
        lines.push(page.content.slice(0, 2000));
      }
      lines.push('');
    });
  }

  lines.push('## 结论与建议');
  lines.push('');
  if (extractedPages.length > 0) {
    lines.push('- 优先阅读“重点页面提炼”中的原始页面，确认事实和时间敏感信息。');
    lines.push('- 如需形成正式稿件，可基于这些来源继续执行写作或整理工作流。');
  } else if (searchResults.length > 0) {
    lines.push('- 当前已有搜索级信息，但缺少正文抽取，建议进一步打开来源核实。');
  } else {
    lines.push('- 建议调整关键词后重试，以获得更聚焦的搜索结果。');
  }

  lines.push('');
  lines.push('## 信息来源');
  lines.push('');
  if (searchResults.length === 0) {
    lines.push('- 无');
  } else {
    searchResults.slice(0, 5).forEach((item) => {
      lines.push(`- ${item.title || item.url || '未命名来源'}${item.url ? ` — ${item.url}` : ''}`);
    });
  }

  return lines.join('\n').trim();
}

function getRecordValue(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }
  return undefined;
}

function appendNotebookLMMindmap(lines: string[], node: unknown, depth = 0): void {
  if (!node || typeof node !== 'object') {
    return;
  }

  const record = node as Record<string, unknown>;
  const text = getRecordValue(record, 'text', 'title', 'label');
  if (typeof text === 'string' && text.trim()) {
    lines.push(`${'  '.repeat(depth)}- ${text.trim()}`);
  }

  const children = record.children;
  if (Array.isArray(children)) {
    children.forEach((child) => appendNotebookLMMindmap(lines, child, depth + 1));
  }
}

function formatNotebookLMResultContent(result: unknown, outputType: NotebookLMOutputType): string[] {
  if (!result || typeof result !== 'object') {
    return ['```json', JSON.stringify(result, null, 2), '```'];
  }

  const payload = result as Record<string, unknown>;
  const lines: string[] = [];
  const sourceTitle = getRecordValue(payload, 'sourceTitle', 'source_title');
  const generatedAt = getRecordValue(payload, 'generatedAt', 'generated_at');

  if (typeof sourceTitle === 'string' && sourceTitle.trim()) {
    lines.push(`- 来源标题：${sourceTitle}`);
  }
  if (typeof generatedAt === 'string' && generatedAt.trim()) {
    lines.push(`- 生成时间：${generatedAt}`);
  }
  if (lines.length > 0) {
    lines.push('');
  }

  if (outputType === 'summary') {
    const title = getRecordValue(payload, 'title');
    const summary = getRecordValue(payload, 'summary');
    const keyPoints = getRecordValue(payload, 'keyPoints', 'key_points');
    if (typeof title === 'string' && title.trim()) {
      lines.push(`### ${title}`);
      lines.push('');
    }
    if (typeof summary === 'string' && summary.trim()) {
      lines.push(summary.trim());
      lines.push('');
    }
    if (Array.isArray(keyPoints) && keyPoints.length > 0) {
      lines.push('#### 核心要点');
      lines.push('');
      keyPoints.slice(0, 10).forEach((item) => {
        if (typeof item === 'string' && item.trim()) {
          lines.push(`- ${item.trim()}`);
        }
      });
    }
    return lines;
  }

  if (outputType === 'report') {
    const title = getRecordValue(payload, 'title');
    const keyPoints = getRecordValue(payload, 'keyPoints', 'key_points');
    const sections = getRecordValue(payload, 'sections');
    if (typeof title === 'string' && title.trim()) {
      lines.push(`### ${title}`);
      lines.push('');
    }
    if (Array.isArray(keyPoints) && keyPoints.length > 0) {
      lines.push('#### 核心要点');
      lines.push('');
      keyPoints.slice(0, 10).forEach((item) => {
        if (typeof item === 'string' && item.trim()) {
          lines.push(`- ${item.trim()}`);
        }
      });
      lines.push('');
    }
    if (Array.isArray(sections) && sections.length > 0) {
      sections.slice(0, 8).forEach((section) => {
        if (!section || typeof section !== 'object') return;
        const sectionRecord = section as Record<string, unknown>;
        const heading = getRecordValue(sectionRecord, 'heading', 'title');
        const content = getRecordValue(sectionRecord, 'content', 'summary');
        if (typeof heading === 'string' && heading.trim()) {
          lines.push(`#### ${heading.trim()}`);
        }
        if (typeof content === 'string' && content.trim()) {
          lines.push(content.trim());
        }
        lines.push('');
      });
    }
    return lines;
  }

  if (outputType === 'flashcards') {
    const cards = getRecordValue(payload, 'cards');
    if (Array.isArray(cards) && cards.length > 0) {
      cards.slice(0, 12).forEach((card, index) => {
        if (!card || typeof card !== 'object') return;
        const cardRecord = card as Record<string, unknown>;
        const question = getRecordValue(cardRecord, 'question');
        const answer = getRecordValue(cardRecord, 'answer');
        lines.push(`#### 卡片 ${index + 1}`);
        if (typeof question === 'string' && question.trim()) {
          lines.push(`- 问题：${question.trim()}`);
        }
        if (typeof answer === 'string' && answer.trim()) {
          lines.push(`- 答案：${answer.trim()}`);
        }
        lines.push('');
      });
      return lines;
    }
  }

  if (outputType === 'quiz') {
    const questions = getRecordValue(payload, 'questions');
    if (Array.isArray(questions) && questions.length > 0) {
      questions.slice(0, 10).forEach((question, index) => {
        if (!question || typeof question !== 'object') return;
        const questionRecord = question as Record<string, unknown>;
        const questionText = getRecordValue(questionRecord, 'question');
        const options = getRecordValue(questionRecord, 'options');
        const correctIndex = getRecordValue(questionRecord, 'correctIndex', 'correct_index');
        const explanation = getRecordValue(questionRecord, 'explanation');
        lines.push(`#### 题目 ${index + 1}`);
        if (typeof questionText === 'string' && questionText.trim()) {
          lines.push(questionText.trim());
        }
        if (Array.isArray(options)) {
          options.forEach((option, optionIndex) => {
            if (typeof option === 'string' && option.trim()) {
              const isCorrect = typeof correctIndex === 'number' && correctIndex === optionIndex;
              lines.push(`- ${String.fromCharCode(65 + optionIndex)}. ${option.trim()}${isCorrect ? '（答案）' : ''}`);
            }
          });
        }
        if (typeof explanation === 'string' && explanation.trim()) {
          lines.push(`- 解释：${explanation.trim()}`);
        }
        lines.push('');
      });
      return lines;
    }
  }

  if (outputType === 'mindmap') {
    const root = getRecordValue(payload, 'root');
    lines.push('#### 脑图结构');
    lines.push('');
    appendNotebookLMMindmap(lines, root, 0);
    return lines;
  }

  if (outputType === 'audio' || outputType === 'video' || outputType === 'infographic' || outputType === 'slide_deck') {
    const url = getRecordValue(payload, 'audioUrl', 'audio_url', 'videoUrl', 'video_url', 'imageUrl', 'image_url', 'fileUrl', 'file_url');
    const format = getRecordValue(payload, 'format');
    const duration = getRecordValue(payload, 'duration');
    const slideCount = getRecordValue(payload, 'slideCount', 'slide_count');
    if (typeof format === 'string' && format.trim()) {
      lines.push(`- 文件格式：${format}`);
    }
    if (typeof duration === 'number') {
      lines.push(`- 时长：${duration} 秒`);
    }
    if (typeof slideCount === 'number') {
      lines.push(`- 页数：${slideCount}`);
    }
    if (typeof url === 'string' && url.trim()) {
      lines.push(`- 资源：${url}`);
    }
    return lines;
  }

  if (outputType === 'data_table') {
    const content = getRecordValue(payload, 'content');
    const format = getRecordValue(payload, 'format');
    const rowCount = getRecordValue(payload, 'rowCount', 'row_count');
    const columnCount = getRecordValue(payload, 'columnCount', 'column_count');
    if (typeof format === 'string' && format.trim()) {
      lines.push(`- 文件格式：${format}`);
    }
    if (typeof rowCount === 'number') {
      lines.push(`- 行数：${rowCount}`);
    }
    if (typeof columnCount === 'number') {
      lines.push(`- 列数：${columnCount}`);
    }
    if (typeof content === 'string' && content.trim()) {
      lines.push('');
      lines.push('```csv');
      lines.push(content.trim().split('\n').slice(0, 20).join('\n'));
      lines.push('```');
    }
    return lines;
  }

  return ['```json', JSON.stringify(result, null, 2), '```'];
}

function buildNotebookLMResult(
  sourceContent: string,
  outputType: NotebookLMOutputType,
  processPayload: NotebookLMProcessPayload,
  statusPayload: NotebookLMStatusPayload,
  task: WorkspaceTaskRequest
): string {
  const lines: string[] = [];
  lines.push(`# NotebookLM 生成结果`);
  lines.push('');
  lines.push(`已完成 ${outputType} 工作流。`);
  lines.push('');
  lines.push('## 输出配置');
  lines.push('');
  lines.push(`- 类型：${outputType}`);
  if (resolveNotebookLMLanguage(task)) {
    lines.push(`- 语言：${resolveNotebookLMLanguage(task)}`);
  }
  const maxItems = resolveNotebookLMMaxItems(task);
  if (maxItems) {
    lines.push(`- 数量限制：${maxItems}`);
  }
  lines.push(`- 超时：${resolveNotebookLMTimeoutSeconds(task, outputType)} 秒`);
  if (processPayload.taskId) {
    lines.push(`- 任务 ID：${processPayload.taskId}`);
  }
  lines.push('');

  if (statusPayload.message) {
    lines.push('## 执行状态');
    lines.push('');
    lines.push(statusPayload.message);
    lines.push('');
  }

  if (statusPayload.result !== undefined) {
    lines.push('## 结果');
    lines.push('');
    lines.push(...formatNotebookLMResultContent(statusPayload.result, outputType));
    lines.push('');
  }

  lines.push('## 输入摘要');
  lines.push('');
  lines.push(sourceContent.slice(0, 2000) || '未提供内容');

  return lines.join('\n').trim();
}

async function waitForNotebookLMResult(
  taskId: string,
  timeoutMs: number
): Promise<NotebookLMStatusPayload> {
  const start = Date.now();
  let lastStatus: NotebookLMStatusPayload = {};

  while (Date.now() - start < timeoutMs) {
    const statusResult = await executeTool('notebooklm_status', { taskId });
    if (!statusResult.success) {
      throw new Error(statusResult.error || '查询 NotebookLM 状态失败');
    }

    lastStatus = getNotebookLMStatusPayload(statusResult.data);
    if (lastStatus.status === 'completed') {
      return lastStatus;
    }
    if (lastStatus.status === 'failed' || lastStatus.status === 'cancelled' || lastStatus.status === 'not_found') {
      throw new Error(lastStatus.error || lastStatus.message || 'NotebookLM 任务执行失败');
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error(lastStatus.message || 'NotebookLM 处理超时');
}

async function executeComprehensiveAnalysis(
  userId: string,
  task: WorkspaceTaskRequest
): Promise<OpenClawExecutionOutput> {
  const query = resolveSearchQuery(task);
  const searchToolResult = await executeTool(
    'web_search',
    {
      query,
      maxResults: resolveWebSearchMaxResults(task)
    },
    {
      userId,
      projectId: task.context.projectId || undefined
    }
  );

  if (!searchToolResult.success) {
    throw new Error(searchToolResult.error || '综合分析搜索执行失败');
  }

  const searchResults = getSearchResults(searchToolResult.data);
  const candidateUrls = searchResults
    .map((item) => item.url)
    .filter((url): url is string => typeof url === 'string' && url.length > 0)
    .slice(0, 2);

  const extractedPages: ExtractToolPayload[] = [];
  const extractedSources: Array<{ url: string; title?: string }> = [];

  for (const url of candidateUrls) {
    const extractToolResult = await executeTool('extract_url', { url, maxLength: 4000 }, {
      userId,
      projectId: task.context.projectId || undefined
    });

    if (!extractToolResult.success || !extractToolResult.data || typeof extractToolResult.data !== 'object') {
      continue;
    }

    const page = extractToolResult.data as ExtractToolPayload;
    extractedPages.push(page);
    extractedSources.push({ url, title: page.title });
  }

  return {
    result: {
      content: buildAnalysisResult(query, searchResults, extractedPages),
      documentId: task.context.targetDocumentId ?? null,
      metadata: {
        executor: 'openclaw',
        runtime: 'comprehensive_analysis',
        mock: false,
        query,
        searchCount: searchResults.length,
        extractedCount: extractedPages.length,
        sources: extractedSources,
        toolResults: {
          webSearch: searchToolResult.data,
          extractedPages
        }
      }
    },
    steps: [
      buildTaskStep('prepare', '准备分析上下文', 'prepare', 'completed'),
      buildTaskStep('search', '检索相关来源', 'execute', 'completed', `query=${query}`),
      buildTaskStep('extract', '提取重点页面正文', 'execute', 'completed', `count=${extractedPages.length}`),
      buildTaskStep('finish', '整理综合分析结果', 'finalize', 'completed')
    ]
  };
}

async function executeSlideDeckGeneration(
  userId: string,
  task: WorkspaceTaskRequest
): Promise<OpenClawExecutionOutput> {
  const content = await buildSlideDeckContent(task, userId);
  if (!content || content.length < 50) {
    throw new Error('生成 PPT 需要至少 50 个字符的内容或已选素材');
  }

  const style = resolveSlideDeckStyle(task);
  const slideCount = resolveSlideDeckCount(task);
  const language = resolveSlideDeckLanguage(task);
  const title = resolveSlideDeckTitle(task);

  const toolResult = await executeTool(
    'slide_deck_generate',
    {
      content,
      style,
      slideCount,
      language,
      title
    },
    {
      userId,
      projectId: task.context.projectId || undefined
    }
  );

  if (!toolResult.success) {
    throw new Error(toolResult.error || 'PPT 生成失败');
  }

  const payload = getSlideDeckPayload(toolResult.data);

  return {
    result: {
      content: buildSlideDeckResult(content, payload, task),
      documentId: task.context.targetDocumentId ?? null,
      metadata: {
        executor: 'openclaw',
        runtime: 'slide_deck_generation',
        mock: false,
        tool: 'slide_deck_generate',
        style,
        slideCount,
        language,
        title,
        downloadUrl: payload.downloadUrl,
        outline: payload.outline,
        toolResult: payload
      }
    },
    steps: [
      buildTaskStep('prepare', '准备 PPT 输入内容', 'prepare', 'completed'),
      buildTaskStep('plan', '整理 PPT 生成参数', 'plan', 'completed', `style=${style}, slides=${slideCount}`),
      buildTaskStep('generate', '执行 PPT 生成', 'execute', 'completed'),
      buildTaskStep('finish', '整理 PPT 输出结果', 'finalize', 'completed')
    ]
  };
}

async function executeNotebookLMLearning(
  userId: string,
  task: WorkspaceTaskRequest
): Promise<OpenClawExecutionOutput> {
  const sourceContent = await buildNotebookLMSourceContent(task, userId);
  if (!sourceContent || sourceContent.length < 10) {
    throw new Error('NotebookLM 需要至少 10 个字符的文本、链接或已选素材');
  }

  const outputType = resolveNotebookLMOutputType(task);
  const sourceType = resolveNotebookLMSourceType(task, sourceContent);
  const language = resolveNotebookLMLanguage(task);
  const maxItems = resolveNotebookLMMaxItems(task);
  const timeout = resolveNotebookLMTimeoutSeconds(task, outputType);

  const processToolResult = await executeTool(
    'notebooklm_process',
    {
      source: {
        type: sourceType,
        content: sourceContent
      },
      outputType,
      options: {
        language,
        maxItems,
        instructions:
          typeof task.params.customPrompt === 'string' && task.params.customPrompt.trim()
            ? task.params.customPrompt.trim()
            : undefined,
        timeout
      }
    },
    {
      userId,
      projectId: task.context.projectId || undefined
    }
  );

  if (!processToolResult.success) {
    throw new Error(processToolResult.error || 'NotebookLM 任务提交失败');
  }

  const processPayload = getNotebookLMProcessPayload(processToolResult.data);
  if (!processPayload.taskId) {
    throw new Error(processPayload.message || 'NotebookLM 未返回任务 ID');
  }

  const statusPayload = await waitForNotebookLMResult(processPayload.taskId, timeout * 1000);

  return {
    result: {
      content: buildNotebookLMResult(sourceContent, outputType, processPayload, statusPayload, task),
      documentId: task.context.targetDocumentId ?? null,
      metadata: {
        executor: 'openclaw',
        runtime: 'notebooklm_learning',
        mock: false,
        tool: 'notebooklm_process',
        sourceType,
        outputType,
        language,
        maxItems,
        timeout,
        taskId: processPayload.taskId,
        process: processPayload,
        status: statusPayload
      }
    },
    steps: [
      buildTaskStep('prepare', '准备 NotebookLM 输入内容', 'prepare', 'completed'),
      buildTaskStep('plan', '整理 NotebookLM 生成参数', 'plan', 'completed', `type=${outputType}, source=${sourceType}`),
      buildTaskStep('submit', '提交 NotebookLM 任务', 'execute', 'completed', `taskId=${processPayload.taskId}`),
      buildTaskStep('poll', '轮询 NotebookLM 任务结果', 'execute', 'completed', `status=${statusPayload.status || 'completed'}`),
      buildTaskStep('finish', '整理 NotebookLM 输出结果', 'finalize', 'completed')
    ]
  };
}

function resolveBuildersBriefCategory(task: WorkspaceTaskRequest): 'ai' | 'money' | 'all' {
  const format = task.params.format;
  if (format === 'ai_tools') return 'ai';
  if (format === 'indie_hacker') return 'money';
  return 'all';
}

function resolveBuildersBriefLanguage(task: WorkspaceTaskRequest): 'zh-CN' | 'en-US' | 'bilingual' {
  const language = task.params.language;
  if (language === 'en-US') return 'en-US';
  if (language === 'bilingual') return 'bilingual';
  return 'zh-CN';
}

function buildBuildersBriefQuery(
  category: 'ai' | 'money' | 'all',
  customPrompt?: string
): string {
  if (customPrompt) {
    return customPrompt;
  }
  const queries: Record<string, string> = {
    ai: 'AI tools LLM Claude GPT Cursor Bolt v0 trending',
    money: 'indie hacker solopreneur SaaS product launch side hustle',
    all: 'AI tools indie hacker builder trending product launch'
  };
  return queries[category];
}

function formatBuildersBriefResult(
  category: 'ai' | 'money' | 'all',
  language: 'zh-CN' | 'en-US' | 'bilingual',
  grokResult: unknown,
  webResult: unknown,
  today: string
): string {
  const categoryLabels: Record<string, string> = {
    ai: 'AI 工具动态',
    money: '独立开发者',
    all: '综合简报'
  };
  const categoryLabel = categoryLabels[category];

  const lines: string[] = [];
  lines.push(`# Builders 简报 — ${categoryLabel}`);
  lines.push(`> ${today}`);
  lines.push('');

  // Grok X 搜索结果
  const grokData = grokResult as SearchToolPayload | null;
  if (grokData?.results && grokData.results.length > 0) {
    lines.push('## X / Twitter 热门动态');
    lines.push('');
    grokData.results.forEach((item, index) => {
      lines.push(`### ${index + 1}. ${item.title || '动态'}`);
      if (item.snippet) lines.push(item.snippet);
      if (item.url) lines.push(`> ${item.url}`);
      lines.push('');
    });
  }

  // Web 搜索结果
  const webData = webResult as SearchToolPayload | null;
  if (webData?.results && webData.results.length > 0) {
    lines.push('## 网络资讯');
    lines.push('');
    webData.results.forEach((item, index) => {
      lines.push(`### ${index + 1}. ${item.title || '资讯'}`);
      if (item.snippet) lines.push(item.snippet);
      if (item.url) lines.push(`> ${item.url}`);
      lines.push('');
    });
  }

  if ((!grokData?.results || grokData.results.length === 0) &&
      (!webData?.results || webData.results.length === 0)) {
    lines.push('暂未获取到最新动态，请稍后再试。');
    lines.push('');
  }

  if (language === 'bilingual') {
    lines.push('---');
    lines.push('*Note: Results include both Chinese and English sources.*');
  }

  return lines.join('\n').trim();
}

async function executeBuildersDailyBrief(
  userId: string,
  task: WorkspaceTaskRequest
): Promise<OpenClawExecutionOutput> {
  const category = resolveBuildersBriefCategory(task);
  const language = resolveBuildersBriefLanguage(task);
  const customPrompt =
    typeof task.params.customPrompt === 'string' && task.params.customPrompt.trim()
      ? task.params.customPrompt.trim()
      : undefined;
  const query = buildBuildersBriefQuery(category, customPrompt);
  const today = new Date().toISOString().slice(0, 10);

  // 并行执行 Grok X 搜索和 Web 搜索
  const context = { userId, projectId: task.context.projectId || undefined };

  const [grokResult, webResult] = await Promise.allSettled([
    executeTool('grok_x_search', { query, category, maxResults: 8 }, context),
    executeTool('web_search', { query, maxResults: 5 }, context)
  ]);

  const grokData = grokResult.status === 'fulfilled' && grokResult.value.success
    ? grokResult.value.data
    : null;
  const webData = webResult.status === 'fulfilled' && webResult.value.success
    ? webResult.value.data
    : null;

  const content = formatBuildersBriefResult(category, language, grokData, webData, today);

  return {
    result: {
      content,
      documentId: task.context.targetDocumentId ?? null,
      metadata: {
        executor: 'openclaw',
        runtime: 'builders-daily-brief',
        mock: false,
        category,
        language,
        query,
        hasGrokResults: !!grokData,
        hasWebResults: !!webData
      }
    },
    steps: [
      buildTaskStep('prepare', '解析简报参数', 'prepare', 'completed'),
      buildTaskStep('search-x', '搜索 X/Twitter Builder 动态', 'execute', 'completed'),
      buildTaskStep('search-web', '搜索网络资讯', 'execute', 'completed'),
      buildTaskStep('finish', '整理 Builders 简报', 'finalize', 'completed')
    ]
  };
}

async function executeTopicDecision(
  userId: string,
  task: WorkspaceTaskRequest
): Promise<OpenClawExecutionOutput> {
  const formatMap: Record<string, string> = {
    ai_tech: 'AI 科技 LLM 大模型 AGI trending',
    side_hustle: '副业 赚钱 变现 独立开发 side hustle',
    product: '产品设计 用户体验 UX 产品思维',
    all: 'AI 科技 独立开发 产品 热门话题 trending'
  };
  const format = task.params.format;
  const customPrompt =
    typeof task.params.customPrompt === 'string' && task.params.customPrompt.trim()
      ? task.params.customPrompt.trim()
      : undefined;
  const query = customPrompt || formatMap[typeof format === 'string' ? format : 'all'] || formatMap.all;
  const language = task.params.language === 'en-US' ? 'en-US' : 'zh-CN';
  const today = new Date().toISOString().slice(0, 10);

  const context = { userId, projectId: task.context.projectId || undefined };

  const [grokResult, webResult] = await Promise.allSettled([
    executeTool('grok_x_search', { query, maxResults: 8 }, context),
    executeTool('web_search', { query: `${query} ${today}`, maxResults: 5 }, context)
  ]);

  const grokData = grokResult.status === 'fulfilled' && grokResult.value.success
    ? grokResult.value.data as SearchToolPayload | null
    : null;
  const webData = webResult.status === 'fulfilled' && webResult.value.success
    ? webResult.value.data as SearchToolPayload | null
    : null;

  const categoryLabel = typeof format === 'string'
    ? ({ ai_tech: 'AI/科技', side_hustle: '副业/搞钱', product: '产品/设计', all: '综合选题' }[format] || '综合选题')
    : '综合选题';

  const lines: string[] = [];
  lines.push(`# 一键选题 — ${categoryLabel}`);
  lines.push(`> ${today} · ${language === 'en-US' ? 'English' : '简体中文'}`);
  lines.push('');

  if (grokData?.results && grokData.results.length > 0) {
    lines.push('## X / Twitter 热门话题');
    lines.push('');
    grokData.results.forEach((item, index) => {
      lines.push(`### ${index + 1}. ${item.title || '话题'}`);
      if (item.snippet) lines.push(item.snippet);
      if (item.url) lines.push(`> ${item.url}`);
      lines.push('');
    });
  }

  if (webData?.results && webData.results.length > 0) {
    lines.push('## 网络热门选题');
    lines.push('');
    webData.results.forEach((item, index) => {
      lines.push(`### ${index + 1}. ${item.title || '选题'}`);
      if (item.snippet) lines.push(item.snippet);
      if (item.url) lines.push(`> ${item.url}`);
      lines.push('');
    });
  }

  if ((!grokData?.results || grokData.results.length === 0) &&
      (!webData?.results || webData.results.length === 0)) {
    lines.push('暂未获取到热门选题，请稍后再试或调整关键词。');
  }

  return {
    result: {
      content: lines.join('\n').trim(),
      documentId: task.context.targetDocumentId ?? null,
      metadata: {
        executor: 'openclaw',
        runtime: 'topic-decision',
        mock: false,
        category: format,
        language,
        query,
        hasGrokResults: !!grokData,
        hasWebResults: !!webData
      }
    },
    steps: [
      buildTaskStep('prepare', '解析选题参数', 'prepare', 'completed'),
      buildTaskStep('search-x', '搜索 X/Twitter 热门话题', 'execute', 'completed'),
      buildTaskStep('search-web', '搜索网络热门选题', 'execute', 'completed'),
      buildTaskStep('finish', '整理选题推荐', 'finalize', 'completed')
    ]
  };
}

async function executeCosmicEngraving(
  userId: string,
  task: WorkspaceTaskRequest
): Promise<OpenClawExecutionOutput> {
  const customPrompt =
    typeof task.params.customPrompt === 'string' && task.params.customPrompt.trim()
      ? task.params.customPrompt.trim()
      : '品牌配图';
  const aspectRatio = typeof task.params.aspect_ratio === 'string' ? task.params.aspect_ratio : '1:1';
  const theme = typeof task.params.theme === 'string' && task.params.theme !== 'auto' ? task.params.theme : undefined;

  const themeLabels: Record<string, string> = {
    'crystal-ball': '水晶球/未来感',
    'quill-pen': '羽毛笔/文学风',
    'gears': '齿轮/工业机械风',
    'compass': '指南针/探索风',
    'library': '图书馆/知识风',
    'telescope': '望远镜/科技探索风'
  };

  const promptParts = [customPrompt];
  if (theme && themeLabels[theme]) {
    promptParts.push(`视觉主题：${themeLabels[theme]}`);
  }
  promptParts.push(`画幅比例：${aspectRatio}`);

  const toolResult = await executeTool(
    'generate_image',
    {
      prompt: promptParts.join('，'),
      aspect_ratio: aspectRatio
    },
    {
      userId,
      projectId: task.context.projectId || undefined
    }
  );

  if (!toolResult.success) {
    throw new Error(toolResult.error || '品牌配图生成失败');
  }

  const imageData = toolResult.data as Record<string, unknown> | null;
  const imageUrl = imageData
    ? (imageData.imageUrl || imageData.image_url || imageData.url) as string | undefined
    : undefined;

  const lines: string[] = [];
  lines.push('# 品牌配图');
  lines.push('');
  lines.push(`主题：${customPrompt}`);
  lines.push(`画幅：${aspectRatio}`);
  if (theme) lines.push(`风格：${themeLabels[theme] || theme}`);
  lines.push('');
  if (imageUrl) {
    lines.push(`![品牌配图](${imageUrl})`);
    lines.push('');
    lines.push(`图片链接：${imageUrl}`);
  } else {
    lines.push('图片生成中，请稍后刷新查看。');
  }

  return {
    result: {
      content: lines.join('\n').trim(),
      documentId: task.context.targetDocumentId ?? null,
      metadata: {
        executor: 'openclaw',
        runtime: 'cosmic-engraving',
        mock: false,
        tool: 'generate_image',
        aspectRatio,
        theme,
        imageUrl,
        toolResult: imageData
      }
    },
    steps: [
      buildTaskStep('prepare', '准备配图参数', 'prepare', 'completed'),
      buildTaskStep('generate', '生成品牌配图', 'execute', 'completed'),
      buildTaskStep('finish', '整理配图结果', 'finalize', 'completed')
    ]
  };
}

async function executeWechatPublisher(
  userId: string,
  task: WorkspaceTaskRequest
): Promise<OpenClawExecutionOutput> {
  const theme = typeof task.params.theme === 'string' ? task.params.theme : 'autumn-warm';

  // 获取来源内容
  const sourceContent = await buildSummaryReferenceContent(task, userId);
  if (!sourceContent || sourceContent.length < 10) {
    throw new Error('发布到公众号需要至少选择一个素材作为内容来源');
  }

  const toolResult = await executeTool(
    'wechat_publish',
    {
      content: sourceContent,
      theme
    },
    {
      userId,
      projectId: task.context.projectId || undefined
    }
  );

  if (!toolResult.success) {
    throw new Error(toolResult.error || '公众号发布失败');
  }

  const publishData = toolResult.data as Record<string, unknown> | null;
  const articleUrl = publishData
    ? (publishData.articleUrl || publishData.article_url || publishData.url) as string | undefined
    : undefined;

  const themeLabels: Record<string, string> = {
    'autumn-warm': '秋日暖色',
    'spring-fresh': '春日清新',
    'ocean-calm': '海洋沉静'
  };

  const lines: string[] = [];
  lines.push('# 公众号发布结果');
  lines.push('');
  lines.push(`排版主题：${themeLabels[theme] || theme}`);
  lines.push('');
  if (articleUrl) {
    lines.push(`文章链接：${articleUrl}`);
  } else {
    lines.push('内容已提交发布，请在公众号后台查看。');
  }

  return {
    result: {
      content: lines.join('\n').trim(),
      documentId: task.context.targetDocumentId ?? null,
      metadata: {
        executor: 'openclaw',
        runtime: 'wechat-publisher',
        mock: false,
        tool: 'wechat_publish',
        theme,
        articleUrl,
        toolResult: publishData
      }
    },
    steps: [
      buildTaskStep('prepare', '准备发布内容', 'prepare', 'completed'),
      buildTaskStep('publish', '发布到公众号', 'execute', 'completed'),
      buildTaskStep('finish', '整理发布结果', 'finalize', 'completed')
    ]
  };
}

export async function executeOpenClawTask({
  userId,
  task
}: OpenClawExecutionInput): Promise<OpenClawExecutionOutput> {
  if (task.type === 'search_source') {
    const mode = resolveSearchMode(task);
    const query = buildSearchQuery(task);
    const toolResult = await executeTool(
      'web_search',
      {
        query,
        maxResults: resolveWebSearchMaxResults(task)
      },
      {
        userId,
        projectId: task.context.projectId || undefined
      }
    );

    if (!toolResult.success) {
      throw new Error(toolResult.error || 'OpenClaw 搜索执行失败');
    }

    return {
      result: {
        content: formatSearchResult(toolResult.data, buildSearchSummary(mode, task)),
        documentId: task.context.targetDocumentId ?? null,
        metadata: {
          executor: 'openclaw',
          runtime: 'search_source',
          mock: false,
          tool: 'web_search',
          mode,
          query,
          params: {
            format: task.params.format,
            language: task.params.language,
            search_depth: task.params.search_depth,
            source_filter: task.params.source_filter
          },
          toolResult: toolResult.data
        }
      },
      steps: [
        buildTaskStep('prepare', '准备搜索上下文', 'prepare', 'completed'),
        buildTaskStep('plan', '选择 OpenClaw 搜索流程', 'plan', 'completed', `mode=${mode}`),
        buildTaskStep('search', '执行来源搜索', 'execute', 'completed', `query=${query}`),
        buildTaskStep('finish', '整理搜索结果', 'finalize', 'completed')
      ]
    };
  }

  if (task.skillId === 'comprehensive_analysis') {
    return executeComprehensiveAnalysis(userId, task);
  }

  if (task.skillId === 'slide_deck_generation' || task.skillId === 'slide-deck') {
    return executeSlideDeckGeneration(userId, task);
  }

  if (task.skillId === 'notebooklm_learning') {
    return executeNotebookLMLearning(userId, task);
  }

  if (task.skillId === 'infographic') {
    // 信息图技能：路由到 NotebookLM executor，强制 outputType 为 infographic
    // 将前端视觉参数（orientation, visual_style, detail_level）注入 instructions
    const infographicInstructions = buildInfographicInstructions(task);
    const existingPrompt =
      typeof task.params.customPrompt === 'string' && task.params.customPrompt.trim()
        ? task.params.customPrompt.trim()
        : '';
    const mergedPrompt = [infographicInstructions, existingPrompt].filter(Boolean).join('\n\n');

    const infographicTask: WorkspaceTaskRequest = {
      ...task,
      params: {
        ...task.params,
        format: 'infographic',
        customPrompt: mergedPrompt || undefined
      }
    };
    return executeNotebookLMLearning(userId, infographicTask);
  }

  if (task.skillId === 'builders-daily-brief') {
    return executeBuildersDailyBrief(userId, task);
  }

  if (task.skillId === 'topic-decision') {
    return executeTopicDecision(userId, task);
  }

  if (task.skillId === 'video-mindmap') {
    // 视频笔记脑图：路由到 NotebookLM，强制 outputType 为 mindmap
    const mindmapTask: WorkspaceTaskRequest = {
      ...task,
      params: {
        ...task.params,
        format: 'mindmap',
        sourceType: task.params.sourceType || 'youtube'
      }
    };
    return executeNotebookLMLearning(userId, mindmapTask);
  }

  if (task.skillId === 'exam-quiz') {
    // 考试测验：路由到 NotebookLM，强制 outputType 为 quiz
    const quizInstructions: string[] = [];
    const questionCount = task.params.question_count;
    if (typeof questionCount === 'number') {
      quizInstructions.push(`生成 ${questionCount} 道题目`);
    }
    const difficulty = task.params.difficulty;
    if (typeof difficulty === 'string' && difficulty !== 'medium') {
      const diffLabels: Record<string, string> = { easy: '简单（基础概念）', hard: '困难（综合分析）' };
      quizInstructions.push(`难度：${diffLabels[difficulty] || difficulty}`);
    }
    const existingPrompt =
      typeof task.params.customPrompt === 'string' && task.params.customPrompt.trim()
        ? task.params.customPrompt.trim()
        : '';
    const mergedQuizPrompt = [...quizInstructions, existingPrompt].filter(Boolean).join('\n');

    const quizTask: WorkspaceTaskRequest = {
      ...task,
      params: {
        ...task.params,
        format: 'quiz',
        customPrompt: mergedQuizPrompt || undefined,
        maxItems: typeof questionCount === 'number' ? questionCount : (task.params.maxItems ?? 10)
      }
    };
    return executeNotebookLMLearning(userId, quizTask);
  }

  if (task.skillId === 'cosmic-engraving') {
    return executeCosmicEngraving(userId, task);
  }

  if (task.skillId === 'wechat-publisher') {
    return executeWechatPublisher(userId, task);
  }

  const lines: string[] = [];
  lines.push(`# ${task.skillId || task.type}`);
  lines.push('');
  lines.push('已进入 OpenClaw executor。');
  lines.push('当前仅 search_source、comprehensive_analysis、slide-deck、infographic、builders-daily-brief、topic-decision、video-mindmap、exam-quiz、cosmic-engraving、wechat-publisher 与 notebooklm_learning 已接入真实执行，其余 workflow skill 仍为骨架返回。');

  return {
    result: {
      content: lines.join('\n'),
      documentId: task.context.targetDocumentId ?? null,
      metadata: {
        executor: 'openclaw',
        runtime: 'workflow_stub',
        planner: 'workflow',
        mock: true
      }
    },
    steps: [
      buildTaskStep('prepare', '准备上下文', 'prepare', 'completed'),
      buildTaskStep('plan', '选择编排执行器', 'plan', 'completed'),
      buildTaskStep('execute', '运行 OpenClaw 工作流骨架', 'execute', 'completed'),
      buildTaskStep('finish', '整理结果', 'finalize', 'completed')
    ]
  };
}
