import type { VisualImageHistoryItem } from '@/services/agent-api';
import {
  slotVisualDefaults,
  type ImagePromptAsset,
  type PromptLocale
} from '../../data/image-prompt-core';
import type { ReverseSessionDraft } from './useAssetUpload';

export function parseImageRatioValue(value: string | null | undefined): {
  width: number;
  height: number;
} | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  const ratioMatch = normalized.match(
    /^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/
  );
  if (ratioMatch) {
    const width = Number(ratioMatch[1]);
    const height = Number(ratioMatch[2]);
    if (width > 0 && height > 0) return { width, height };
  }

  const sizeMatch = normalized.match(/(\d{2,5})\s*[x×]\s*(\d{2,5})/);
  if (sizeMatch) {
    const width = Number(sizeMatch[1]);
    const height = Number(sizeMatch[2]);
    if (width > 0 && height > 0) return { width, height };
  }

  return null;
}

export function getSummaryImageDimensions(item: VisualImageHistoryItem): {
  width: number;
  height: number;
} {
  const width = Number(item.width);
  const height = Number(item.height);
  if (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
  ) {
    return { width: Math.round(width), height: Math.round(height) };
  }

  const ratio =
    parseImageRatioValue(item.actualImageSize) ||
    parseImageRatioValue(item.imageSize) ||
    parseImageRatioValue(item.requestedImageSize) ||
    parseImageRatioValue(item.aspectRatio);
  if (ratio) {
    const maxSide = 1600;
    if (ratio.width >= ratio.height) {
      return {
        width: maxSide,
        height: Math.round((maxSide * ratio.height) / ratio.width)
      };
    }
    return {
      width: Math.round((maxSide * ratio.width) / ratio.height),
      height: maxSide
    };
  }

  return { width: 1200, height: 1200 };
}

export function inferPromptTitle(prompt: string, fallback: string): string {
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;

  const withoutRatio = stripLeadingAspectRatio(normalized);
  const scopedNameMatch =
    withoutRatio.match(/(?:动物)?主题[：:]\s*([^，,。.;；、\s]{1,18})/u) ||
    withoutRatio.match(
      /([A-Za-z0-9\u4e00-\u9fff\u3040-\u30ff·・]{2,24}[（(][^）)]{1,30}[）)])/u
    ) ||
    withoutRatio.match(
      /(?:角色|人物|主体)[：:是为\s]+([^，,。.;；、\n]{2,28})/u
    );
  const scopedName = scopedNameMatch?.[1]?.trim();
  if (scopedName && !isGenericPromptSegment(scopedName)) {
    return scopedName.slice(0, 28);
  }

  const segments = withoutRatio
    .replace(/^生成一?张(?:单张)?(?:\s*\d+\s*[:：]\s*\d+\s*)?\s*/u, '')
    .split(/[，,。.;；\n]/u)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const titleSegment =
    segments.find((segment) => !isGenericPromptSegment(segment)) || segments[0];

  return titleSegment?.slice(0, 28).trim() || fallback;
}

function stripLeadingAspectRatio(value: string): string {
  return value
    .replace(/^\s*\d{1,2}\s*[:：]\s*\d{1,2}\s*[，,、。.\s-]*/u, '')
    .trim();
}

export function isWeakPromptTitle(title: string): boolean {
  if (!title) return true;
  if (/^\d{1,2}$/u.test(title)) return true;
  if (/^\d{1,2}\s*[:：]\s*\d{1,2}$/u.test(title)) return true;
  return false;
}

function isGenericPromptSegment(segment: string): boolean {
  const compact = segment.replace(/\s+/g, '');
  if (!compact) return true;
  if (/^\d{1,2}[:：]\d{1,2}$/u.test(compact)) return true;
  if (/^(?:4K|8K|HD|UHD)$/iu.test(compact)) return true;
  return [
    '电影生活风格女性写真',
    '高级写实摄影质感',
    '超高细节',
    '锐利对焦',
    '柔光ccd',
    '真实手机抓拍感',
    '生成一张单张',
    '生成一张',
    '单张竖版真人写真'
  ].some((keyword) => compact.includes(keyword));
}

export function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildGeneratedImageSummaryMarkdown(
  item: VisualImageHistoryItem
): string {
  const title = escapeHtmlText(
    inferPromptTitle(item.prompt || '', 'AI 生成图片')
  );
  const imageUrl = escapeHtmlText(item.imageUrl);
  const generationId = escapeHtmlText(item.id || '');
  const prompt = escapeHtmlText(item.prompt || '');
  const negativePrompt = escapeHtmlText(item.negativePrompt || '');
  const model = escapeHtmlText(
    item.modelLabel || item.model || item.provider || ''
  );
  const dimensions = getSummaryImageDimensions(item);
  const createdAt = item.createdAt
    ? escapeHtmlText(new Date(item.createdAt).toLocaleString('zh-CN'))
    : '';
  const promptBlockStyle =
    'white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; max-width: 100%; overflow-x: hidden;';

  return [
    `<div class="ai-image-summary-card space-y-4" style="max-width: 100%; overflow-wrap: anywhere; word-break: break-word;">`,
    `<div class="text-xl font-semibold text-slate-900 break-words">${title}</div>`,
    `<img src="${imageUrl}" alt="${title}" width="${dimensions.width}" height="${dimensions.height}" loading="lazy" decoding="async" referrerpolicy="no-referrer" class="w-full h-auto rounded-xl" data-source="webtomind-image-history"${generationId ? ` data-generation-id="${generationId}"` : ''} />`,
    `<div class="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">`,
    model ? `<div><strong>模型：</strong>${model}</div>` : '',
    item.aspectRatio
      ? `<div><strong>比例：</strong>${escapeHtmlText(item.aspectRatio)}</div>`
      : '',
    createdAt ? `<div><strong>时间：</strong>${createdAt}</div>` : '',
    `</div>`,
    `<h2>Prompt</h2>`,
    `<pre class="ai-image-summary-prompt whitespace-pre-wrap break-words" style="${promptBlockStyle}">${prompt}</pre>`,
    negativePrompt
      ? `<h2>Negative Prompt</h2><pre class="ai-image-summary-prompt whitespace-pre-wrap break-words" style="${promptBlockStyle}">${negativePrompt}</pre>`
      : '',
    `</div>`
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildReverseSessionAssets(
  draft: ReverseSessionDraft,
  sessionId: string
): ImagePromptAsset[] {
  return draft.rows
    .filter((row) => row.prompt.trim())
    .map((row, index) => ({
      id: `reverse-${sessionId}-${row.slot}-${index}`,
      slot: row.slot,
      title: row.title.trim() || '反推素材',
      subtitle: row.subtitle.trim() || '临时组合',
      prompt: row.prompt.trim(),
      negativePrompt: row.negativePrompt.trim() || undefined,
      tags: row.tagsText
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      visual: slotVisualDefaults[row.slot] || slotVisualDefaults.style
    }));
}

export function pickPromptLocale(language: string | undefined): PromptLocale {
  return language?.startsWith('en') ? 'en-US' : 'zh-CN';
}

export function getCreateLocalePrefix(
  pathname: string
): '' | '/zh-CN' | '/en-US' {
  if (pathname.startsWith('/zh-CN/')) return '/zh-CN';
  if (pathname.startsWith('/en-US/')) return '/en-US';
  return '';
}

export function getSharedPromptCaseId(pathname: string): string | null {
  const match = pathname.match(
    /^\/(?:zh-CN\/|en-US\/)?create\/prompts\/share\/([^/?#]+)/
  );
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function sanitizeCreateEntrySource(
  value: string | null
): string | undefined {
  const source = value?.trim();
  if (!source) return undefined;
  const normalized = source.replace(/[^\w:.-]/g, '_').slice(0, 120);
  return normalized || undefined;
}

export function getCreateEntrySourceFromSearch(
  search: string
): string | undefined {
  const params = new URLSearchParams(search);
  return sanitizeCreateEntrySource(
    params.get('source') ||
      params.get('cta_source') ||
      params.get('utm_campaign')
  );
}

export function formatPromptForClipboard(
  prompt: string,
  negativePrompt: string
): string {
  const promptText = prompt.trim();
  const negativeText = negativePrompt.trim();
  return negativeText
    ? `${promptText}\n\nNegative prompt: ${negativeText}`
    : promptText;
}
