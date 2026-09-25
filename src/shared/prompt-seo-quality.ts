export type PromptCaseSeoStatus = 'draft' | 'review' | 'indexable' | 'retired';

export type PromptCaseSeoMedia =
  | {
      mediaType: 'image';
      imageUrl: string;
    }
  | {
      mediaType: 'video';
      posterUrl: string;
      videoUrl: string;
      durationSeconds: number;
      uploadDate: string;
    };

export type PromptCaseSeoQualityResult = {
  indexable: boolean;
  reasons: string[];
  media?: PromptCaseSeoMedia;
};

type PromptCaseSeoRecord = Record<string, unknown>;

function readString(record: PromptCaseSeoRecord, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function readNumber(record: PromptCaseSeoRecord, ...keys: string[]): number {
  for (const key of keys) {
    const value = Number(record[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

function readStringArray(
  record: PromptCaseSeoRecord,
  ...keys: string[]
): string[] {
  for (const key of keys) {
    const value = record[key];
    if (!Array.isArray(value)) continue;
    const strings = value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
    if (strings.length > 0) return strings;
  }
  return [];
}

function readEvidence(record: PromptCaseSeoRecord): PromptCaseSeoRecord {
  const value = record.seo_evidence ?? record.seoEvidence;
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as PromptCaseSeoRecord)
    : {};
}

function isTrue(record: PromptCaseSeoRecord, ...keys: string[]): boolean {
  return keys.some((key) => record[key] === true);
}

export function isStablePublicSeoMediaUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    if (/\/object\/sign\//i.test(url.pathname)) return false;
    const unstableParams = [
      'token',
      'signature',
      'expires',
      'x-amz-signature',
      'x-amz-expires',
      'x-goog-signature',
      'x-goog-expires'
    ];
    const normalizedParamNames = new Set(
      Array.from(url.searchParams.keys(), (key) => key.toLowerCase())
    );
    return !unstableParams.some((key) => normalizedParamNames.has(key));
  } catch {
    return false;
  }
}

export function getPromptCaseSeoMedia(
  record: PromptCaseSeoRecord
): PromptCaseSeoMedia | undefined {
  const mediaType =
    readString(record, 'media_type', 'mediaType') === 'video'
      ? 'video'
      : 'image';
  const imageUrl =
    readString(record, 'poster_url', 'posterUrl', 'image_url', 'imageUrl') ||
    readStringArray(record, 'image_urls', 'imageUrls')[0] ||
    '';

  if (mediaType === 'image') {
    return isStablePublicSeoMediaUrl(imageUrl)
      ? { mediaType, imageUrl }
      : undefined;
  }

  const videoUrl =
    readString(record, 'video_url', 'videoUrl') ||
    readStringArray(record, 'video_urls', 'videoUrls')[0] ||
    '';
  const durationSeconds = readNumber(
    record,
    'video_duration_seconds',
    'durationSeconds'
  );
  const uploadDate = readString(
    record,
    'video_upload_date',
    'uploadDate',
    'created_at',
    'createdAt'
  );
  if (
    !isStablePublicSeoMediaUrl(imageUrl) ||
    !isStablePublicSeoMediaUrl(videoUrl) ||
    durationSeconds <= 0 ||
    !uploadDate ||
    !Number.isFinite(Date.parse(uploadDate))
  ) {
    return undefined;
  }
  return {
    mediaType,
    posterUrl: imageUrl,
    videoUrl,
    durationSeconds,
    uploadDate
  };
}

export function evaluatePromptCaseSeoQuality(
  record: PromptCaseSeoRecord,
  options: { allowLegacy?: boolean } = {}
): PromptCaseSeoQualityResult {
  const reasons: string[] = [];
  const hasSeoStatus =
    typeof (record.seo_status ?? record.seoStatus) === 'string';
  const status = readString(record, 'seo_status', 'seoStatus');
  const isPublished =
    record.is_published === true || record.isPublished === true;
  const isDeleted = Boolean(record.deleted_at ?? record.deletedAt);
  const memberOnly = record.members_only === true || record.memberOnly === true;
  const slug = readString(record, 'slug');
  const title = readString(
    record,
    'title_zh',
    'titleZh',
    'title',
    'title_en',
    'titleEn'
  );
  const prompt = readString(
    record,
    'prompt_zh',
    'promptZh',
    'prompt',
    'prompt_en',
    'promptEn'
  );
  const summary = readString(
    record,
    'commercial_intent',
    'commercialIntent',
    'prompt_preview_zh',
    'promptPreviewZh',
    'prompt_preview',
    'promptPreview',
    'prompt_preview_en',
    'promptPreviewEn'
  );
  const model = readString(record, 'model');
  const media = getPromptCaseSeoMedia(record);
  const hasPlaceholderSummary =
    /待人工(?:整理为可复用 Prompt Case|补全 Prompt 并整理为可复用 Prompt Case)/i.test(
      summary
    );
  const hasUnknownModel = /^(?:unknown|未知|未识别)$/i.test(model);

  if (!isPublished) reasons.push('not-published');
  if (isDeleted) reasons.push('deleted');
  if (memberOnly) reasons.push('member-only');
  if (!slug) reasons.push('missing-slug');
  if (!title) reasons.push('missing-title');
  if (!prompt) reasons.push('missing-public-prompt');
  if (!summary) reasons.push('missing-summary');
  if (!model) reasons.push('missing-model');
  if (hasPlaceholderSummary) reasons.push('placeholder-summary');
  if (hasUnknownModel) reasons.push('unknown-model');
  if (!media) reasons.push('invalid-or-unstable-media');

  if (hasSeoStatus) {
    if (status !== 'indexable') reasons.push('not-indexable-status');
    if (!readString(record, 'seo_reviewed_at', 'seoReviewedAt')) {
      reasons.push('missing-review');
    }
    const evidence = readEvidence(record);
    if (!isTrue(evidence, 'source_verified', 'sourceVerified')) {
      reasons.push('source-not-verified');
    }
    if (!isTrue(evidence, 'media_verified', 'mediaVerified')) {
      reasons.push('media-not-verified');
    }
  } else if (options.allowLegacy !== true) {
    reasons.push('missing-seo-status');
  }

  return { indexable: reasons.length === 0, reasons, media };
}

export function isPromptCaseSeoIndexable(
  record: PromptCaseSeoRecord,
  options: { allowLegacy?: boolean } = {}
): boolean {
  return evaluatePromptCaseSeoQuality(record, options).indexable;
}

export function isPromptCaseGenerationVerified(
  record: PromptCaseSeoRecord
): boolean {
  const evidence = readEvidence(record);
  return isTrue(evidence, 'generation_verified', 'generationVerified');
}

export function hasVideoPromptHubPublishingThreshold(
  items: readonly unknown[]
): boolean {
  const videoItems = items.filter(
    (item): item is PromptCaseSeoRecord =>
      Boolean(item) &&
      typeof item === 'object' &&
      !Array.isArray(item) &&
      readString(item as PromptCaseSeoRecord, 'mediaType', 'media_type') ===
        'video'
  );
  const intents = new Set(
    videoItems
      .map((item) =>
        readString(
          item,
          'category',
          'packageSlug',
          'package_slug',
          'commercialIntent',
          'commercial_intent'
        ).toLowerCase()
      )
      .filter(Boolean)
  );
  return videoItems.length >= 8 && intents.size >= 3;
}
