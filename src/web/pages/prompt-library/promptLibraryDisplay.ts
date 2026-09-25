import type { PromptCase } from '@/services/agent-api';
import { getPromptCaseCreateSettings } from '@/utils/prompt-case';

export function getPromptCaseCover(caseItem: PromptCase): string {
  return (
    (Array.isArray(caseItem.imageUrls) ? caseItem.imageUrls[0] : '') ||
    caseItem.imageUrl ||
    ''
  );
}

export function getPromptCasePreviewText(caseItem: PromptCase): string {
  return (
    caseItem.promptPreview ||
    caseItem.commercialIntent ||
    caseItem.prompt ||
    caseItem.promptZh ||
    caseItem.promptEn ||
    ''
  ).trim();
}

function normalizePromptText(value: string | undefined): string {
  return (value || '').trim();
}

function cjkRatio(value: string): number {
  const text = value.replace(/\s+/g, '');
  if (!text) return 0;
  const cjkCount = (
    text.match(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []
  ).length;
  return cjkCount / text.length;
}

function looksCjkDominant(value: string | undefined): boolean {
  const text = normalizePromptText(value);
  return text.length > 0 && cjkRatio(text) > 0.25;
}

function firstPromptCandidate(
  candidates: Array<string | undefined>,
  options?: { rejectCjkDominant?: boolean }
): string {
  for (const candidate of candidates) {
    const text = normalizePromptText(candidate);
    if (!text) continue;
    if (options?.rejectCjkDominant && looksCjkDominant(text)) continue;
    return text;
  }
  return '';
}

export function getPromptCasePromptForLocale(
  caseItem: PromptCase,
  locale: 'zh-CN' | 'en-US'
): string {
  if (locale === 'en-US') {
    return firstPromptCandidate(
      [
        caseItem.promptEn,
        caseItem.promptPreviewEn,
        caseItem.locale === 'en-US' ? caseItem.prompt : '',
        caseItem.locale === 'en-US' ? caseItem.promptPreview : ''
      ],
      { rejectCjkDominant: true }
    );
  }
  return firstPromptCandidate([
    caseItem.promptZh,
    caseItem.promptPreviewZh,
    caseItem.locale !== 'en-US' ? caseItem.prompt : '',
    caseItem.locale !== 'en-US' ? caseItem.promptPreview : ''
  ]);
}

export function getPromptCaseFullPromptForLocale(
  caseItem: PromptCase,
  locale: 'zh-CN' | 'en-US'
): string {
  if (locale === 'en-US') {
    return firstPromptCandidate(
      [caseItem.promptEn, caseItem.locale === 'en-US' ? caseItem.prompt : ''],
      { rejectCjkDominant: true }
    );
  }
  return firstPromptCandidate([
    caseItem.promptZh,
    caseItem.locale !== 'en-US' ? caseItem.prompt : ''
  ]);
}

function getPromptCaseAspectRatio(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/[×X]/g, 'x');
  const ratioMatch = normalized.match(/(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/);
  if (ratioMatch) return `${ratioMatch[1]} / ${ratioMatch[2]}`;

  const sizeMatch = normalized.match(/(\d{2,5})\s*x\s*(\d{2,5})/i);
  if (!sizeMatch) return null;
  return `${sizeMatch[1]} / ${sizeMatch[2]}`;
}

export function getPromptCaseCardAspectRatio(
  caseItem: PromptCase,
  index: number
): string {
  const caseMeta = caseItem as PromptCase & {
    width?: number;
    height?: number;
    actualImageSize?: string;
    requestedImageSize?: string;
    imageSize?: string;
    aspectRatio?: string;
  };
  if (
    typeof caseMeta.width === 'number' &&
    typeof caseMeta.height === 'number' &&
    caseMeta.width > 0 &&
    caseMeta.height > 0
  ) {
    return `${caseMeta.width} / ${caseMeta.height}`;
  }
  const createSettings = getPromptCaseCreateSettings(caseItem);
  const ratioCandidates = [
    caseMeta.actualImageSize || '',
    caseMeta.requestedImageSize || '',
    caseMeta.imageSize || '',
    caseMeta.aspectRatio || '',
    createSettings.imageSize || '',
    createSettings.aspectRatio || '',
    caseItem.promptPreview || '',
    caseItem.prompt || '',
    caseItem.title || ''
  ];
  for (const candidate of ratioCandidates) {
    const configuredRatio = getPromptCaseAspectRatio(candidate);
    if (configuredRatio) return configuredRatio;
  }

  const fallbackRatios = ['1 / 1', '4 / 5', '3 / 4', '4 / 3'];
  return fallbackRatios[index % fallbackRatios.length];
}
