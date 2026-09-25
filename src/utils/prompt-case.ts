import type { PromptCase } from '@/services/agent-api';
export {
  getOptimizedPromptCaseImageUrl,
  getPromptCaseResponsiveImageSet,
  PROMPT_LIBRARY_CARD_IMAGE_SIZES,
  PROMPT_LIBRARY_CARD_IMAGE_WIDTHS
} from '@/shared/prompt-case-image';

export function inferPromptCaseTitle(
  prompt: string | undefined,
  fallback = 'Untitled prompt'
): string {
  const normalized = (prompt || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  return (
    normalized
      .replace(/^\s*\d{1,2}\s*[:：]\s*\d{1,2}\s*[，,、。.\s-]*/u, '')
      .replace(/^生成一?张(?:单张)?\s*/u, '')
      .split(/[，,。.;；\n]/u)[0]
      .trim()
      .slice(0, 28) || fallback
  );
}

export function isValidPromptCaseSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

function normalizeVisualRecipe(
  value: unknown
): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export function normalizePromptCase(input: PromptCase): PromptCase {
  const imageUrls = [
    ...(Array.isArray(input.imageUrls) ? input.imageUrls : []),
    input.imageUrl || ''
  ]
    .map((url) => url.trim())
    .filter(Boolean);
  const videoUrls = [
    ...(Array.isArray(input.videoUrls) ? input.videoUrls : []),
    input.videoUrl || ''
  ]
    .map((url) => url.trim())
    .filter(Boolean);

  return {
    ...input,
    imageUrl: input.imageUrl || imageUrls[0] || '',
    imageUrls: Array.from(new Set(imageUrls)),
    mediaType:
      input.mediaType?.trim() || (videoUrls.length > 0 ? 'video' : 'image'),
    videoUrl: input.videoUrl || videoUrls[0] || '',
    videoUrls: Array.from(new Set(videoUrls)),
    title: input.title?.trim() || inferPromptCaseTitle(input.prompt),
    titleZh: input.titleZh?.trim() || undefined,
    titleEn: input.titleEn?.trim() || undefined,
    slug: input.slug?.trim() || undefined,
    category: input.category?.trim() || 'featured',
    tags: Array.isArray(input.tags)
      ? input.tags.map((tag) => tag.trim()).filter(Boolean)
      : [],
    model: input.model?.trim() || 'gemini-image',
    locale: input.locale?.trim() || 'zh-CN',
    featured: Boolean(input.featured),
    viewCount: Number(input.viewCount || 0),
    copyCount: Number(input.copyCount || 0),
    generateCount: Number(input.generateCount || 0),
    memberOnly: Boolean(input.memberOnly),
    prompt: typeof input.prompt === 'string' ? input.prompt : '',
    promptZh:
      typeof input.promptZh === 'string' ? input.promptZh.trim() : undefined,
    promptEn:
      typeof input.promptEn === 'string' ? input.promptEn.trim() : undefined,
    promptPreviewZh:
      typeof input.promptPreviewZh === 'string'
        ? input.promptPreviewZh.trim()
        : undefined,
    promptPreviewEn:
      typeof input.promptPreviewEn === 'string'
        ? input.promptPreviewEn.trim()
        : undefined,
    visualRecipe: normalizeVisualRecipe(input.visualRecipe),
    promptLocked: Boolean(input.promptLocked)
  };
}

export function isFeaturedPromptCase(caseItem: PromptCase): boolean {
  return (
    Boolean(caseItem.featured) ||
    caseItem.category?.trim().toLowerCase() === 'featured'
  );
}

function getPromptCaseCreatedTime(caseItem: PromptCase): number {
  const value = caseItem.createdAt ? Date.parse(caseItem.createdAt) : 0;
  return Number.isFinite(value) ? value : 0;
}

function getPromptCaseSortOrder(caseItem: PromptCase): number {
  const value = Number(caseItem.sortOrder);
  return Number.isFinite(value) ? value : 0;
}

export function sortPromptCasesByDisplayPriority(
  items: PromptCase[]
): PromptCase[] {
  return [...items].sort((a, b) => {
    const featuredDiff =
      Number(isFeaturedPromptCase(b)) - Number(isFeaturedPromptCase(a));
    if (featuredDiff !== 0) return featuredDiff;

    const explicitFeaturedDiff =
      Number(Boolean(b.featured)) - Number(Boolean(a.featured));
    if (explicitFeaturedDiff !== 0) return explicitFeaturedDiff;

    const sortOrderDiff = getPromptCaseSortOrder(a) - getPromptCaseSortOrder(b);
    if (sortOrderDiff !== 0) return sortOrderDiff;

    const createdDiff =
      getPromptCaseCreatedTime(b) - getPromptCaseCreatedTime(a);
    if (createdDiff !== 0) return createdDiff;

    return a.id.localeCompare(b.id);
  });
}

export function getPromptCaseVideoUrls(caseItem?: PromptCase | null): string[] {
  const urls = [
    ...(Array.isArray(caseItem?.videoUrls) ? caseItem.videoUrls : []),
    caseItem?.videoUrl || ''
  ]
    .map((url) => url.trim())
    .filter(Boolean);
  return Array.from(new Set(urls));
}

export function getPromptCasePrimaryVideoUrl(
  caseItem?: PromptCase | null
): string {
  return getPromptCaseVideoUrls(caseItem)[0] || '';
}

export function isPromptCaseVideo(caseItem?: PromptCase | null): boolean {
  return (
    caseItem?.mediaType?.trim().toLowerCase() === 'video' ||
    getPromptCaseVideoUrls(caseItem).length > 0
  );
}

export interface PromptCaseCreateSettings {
  model?: string;
  imageSize?: string;
  quality?: string;
  aspectRatio?: string;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readGenerationSettings(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function getPromptCaseCreateSettings(
  caseItem: PromptCase
): PromptCaseCreateSettings {
  const extendedCase = caseItem as PromptCase & {
    generationSettings?: unknown;
    imageSize?: unknown;
    requestedImageSize?: unknown;
    actualImageSize?: unknown;
    quality?: unknown;
    aspectRatio?: unknown;
  };
  const generationSettings = readGenerationSettings(
    extendedCase.generationSettings
  );
  const settings: PromptCaseCreateSettings = {
    model: readString(generationSettings.model) || readString(caseItem.model),
    imageSize:
      readString(generationSettings.imageSize) ||
      readString(extendedCase.imageSize) ||
      readString(extendedCase.requestedImageSize) ||
      readString(extendedCase.actualImageSize),
    quality:
      readString(generationSettings.quality) ||
      readString(extendedCase.quality),
    aspectRatio:
      readString(generationSettings.aspectRatio) ||
      readString(extendedCase.aspectRatio)
  };
  return Object.fromEntries(
    Object.entries(settings).filter(([, value]) => Boolean(value))
  ) as PromptCaseCreateSettings;
}
