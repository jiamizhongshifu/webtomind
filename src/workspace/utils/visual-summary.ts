import type { SavedSummary } from '@/services/database';
import type { VisualImageHistoryItem } from '@/services/agent-api';
import {
  getVisualImageDisplayCandidates,
  getVisualImageDisplayUrl,
  getVisualImageAspectRatio,
  type VisualImageDisplaySource
} from '@/shared/visual-image-display';
import { normalizeMediaUrl } from './media-url';

type VisualSummaryMetadata = {
  generationId?: unknown;
  thumbnailUrl?: unknown;
  previewUrl?: unknown;
  imageUrl?: unknown;
  storageBucket?: unknown;
  storagePath?: unknown;
  thumbnailStoragePath?: unknown;
  previewStoragePath?: unknown;
  model?: unknown;
  modelLabel?: unknown;
  imageSize?: unknown;
  aspectRatio?: unknown;
  quality?: unknown;
  outputFormat?: unknown;
  width?: unknown;
  height?: unknown;
  createdAt?: unknown;
  media?: unknown;
};

export interface VisualSummaryDisplayMeta extends VisualImageDisplaySource {
  generationId: string | null;
  displayUrl: string | null;
  originalUrl: string | null;
  refreshUrl: string | null;
  modelLabel: string | null;
  imageSize: string | null;
  aspectRatio: string | null;
  quality: string | null;
  outputFormat: string | null;
  createdAt: string | null;
  isVisual: boolean;
}

export interface VisualSummaryDisplay extends VisualSummaryDisplayMeta {
  candidates: string[];
  refreshInput: {
    generationId: string | null;
    url: string | null;
    storageBucket?: string | null;
    storagePath?: string | null;
  };
  sortKey: string;
  cacheKey: string;
}

type SummaryCreatedAtSortInput = Pick<SavedSummary, 'id' | 'createdAt'>;

export function compareSummariesByCreatedAtDescIdAsc(
  a: SummaryCreatedAtSortInput,
  b: SummaryCreatedAtSortInput
): number {
  const createdAtDiff = (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0);
  return createdAtDiff || a.id.localeCompare(b.id);
}

function parseCssAspectRatio(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim();
  const sizeMatch = normalized.match(/(\d{2,5})\s*[xX×]\s*(\d{2,5})/u);
  if (sizeMatch) {
    const width = Number(sizeMatch[1]);
    const height = Number(sizeMatch[2]);
    return width > 0 && height > 0 ? `${width} / ${height}` : null;
  }
  const slashMatch = normalized.match(
    /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/u
  );
  if (slashMatch) {
    const width = Number(slashMatch[1]);
    const height = Number(slashMatch[2]);
    return width > 0 && height > 0 ? `${width} / ${height}` : null;
  }
  const colonMatch = normalized.match(
    /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/u
  );
  if (colonMatch) {
    const width = Number(colonMatch[1]);
    const height = Number(colonMatch[2]);
    return width > 0 && height > 0 ? `${width} / ${height}` : null;
  }
  return null;
}

export function getVisualSummaryCssAspectRatio(
  meta: Pick<VisualSummaryDisplayMeta, 'width' | 'height' | 'aspectRatio'>
): string | null {
  if (meta.width && meta.height) {
    return `${meta.width} / ${meta.height}`;
  }
  return parseCssAspectRatio(meta.aspectRatio);
}

function getVisualMetadata(summary: SavedSummary): VisualSummaryMetadata {
  const metadata = summary.metadata;
  if (!metadata || typeof metadata !== 'object') return {};
  return metadata as VisualSummaryMetadata;
}

function normalizeUnknownUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return normalizeMediaUrl(value) || null;
}

function normalizeUnknownString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeUnknownNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

function getSupabaseUrl(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  return typeof url === 'string' && url.trim()
    ? url.trim().replace(/\/$/, '')
    : null;
}

function encodeStoragePath(path: string): string {
  return path
    .replace(/^\/+/, '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function buildPublicStorageUrl(
  bucketValue: unknown,
  pathValue: unknown
): string | null {
  const bucket = normalizeUnknownString(bucketValue);
  const path = normalizeUnknownString(pathValue);
  const supabaseUrl = getSupabaseUrl();
  if (!bucket || !path || !supabaseUrl) return null;

  if (/^https?:\/\//i.test(path) || path.startsWith('data:')) {
    return normalizeUnknownUrl(path);
  }

  return `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(
    bucket
  )}/${encodeStoragePath(path)}`;
}

function isPublicStorageBucket(bucketValue: unknown): boolean {
  const bucket = normalizeUnknownString(bucketValue);
  return bucket === 'generated-images';
}

function buildDisplayStorageUrl(
  bucketValue: unknown,
  pathValue: unknown
): string | null {
  return isPublicStorageBucket(bucketValue)
    ? buildPublicStorageUrl(bucketValue, pathValue)
    : null;
}

function getVisualSummaryDisplaySource(
  metadata: VisualSummaryMetadata
): VisualImageDisplaySource {
  const media =
    metadata.media && typeof metadata.media === 'object'
      ? (metadata.media as Record<string, unknown>)
      : {};
  const original =
    media.original && typeof media.original === 'object'
      ? (media.original as Record<string, unknown>)
      : {};
  const thumbnail =
    media.thumbnail && typeof media.thumbnail === 'object'
      ? (media.thumbnail as Record<string, unknown>)
      : {};
  const preview =
    media.preview && typeof media.preview === 'object'
      ? (media.preview as Record<string, unknown>)
      : {};

  return {
    thumbnailUrl:
      normalizeUnknownUrl(metadata.thumbnailUrl) ||
      normalizeUnknownUrl(thumbnail.publicUrl) ||
      buildDisplayStorageUrl(
        metadata.storageBucket,
        metadata.thumbnailStoragePath
      ),
    previewUrl:
      normalizeUnknownUrl(metadata.previewUrl) ||
      normalizeUnknownUrl(preview.publicUrl) ||
      buildDisplayStorageUrl(
        metadata.storageBucket,
        metadata.previewStoragePath
      ),
    imageUrl:
      normalizeUnknownUrl(metadata.imageUrl) ||
      normalizeUnknownUrl(original.publicUrl) ||
      buildDisplayStorageUrl(metadata.storageBucket, metadata.storagePath),
    width:
      normalizeUnknownNumber(metadata.width) ||
      normalizeUnknownNumber(original.width),
    height:
      normalizeUnknownNumber(metadata.height) ||
      normalizeUnknownNumber(original.height)
  };
}

function isLikelyMediaUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  const url = value.toLowerCase();
  if (url.startsWith('data:image/') || url.startsWith('data:video/')) {
    return true;
  }
  if (url.includes('/storage/v1/object/')) {
    return true;
  }
  return /\.(avif|gif|jpe?g|png|webp|mp4|mov|webm)(?:[?#].*)?$/.test(url);
}

export function extractVisualSummaryFallbackImageUrl(
  content: string | undefined,
  url?: string | null
): string | null {
  if (content) {
    const imgMatches = content.matchAll(
      /<img[^>]+src=["']([^"']+)["'][^>]*>/gi
    );

    for (const match of imgMatches) {
      const imgTag = match[0];
      const src = match[1];
      const isAvatar =
        imgTag.includes('rounded-full') ||
        imgTag.includes('w-6') ||
        imgTag.includes('w-8') ||
        src.includes('_bigger.') ||
        src.includes('_normal.') ||
        src.includes('profile_images');

      if (!isAvatar) {
        const normalized = normalizeMediaUrl(src);
        if (normalized) return normalized;
      }
    }

    const videoMatch = content.match(/<video[^>]+src=["']([^"']+)["']/i);
    if (videoMatch) {
      const normalized = normalizeMediaUrl(videoMatch[1]);
      if (normalized) return normalized;
    }

    const markdownImageMatch = content.match(/!\[[^\]]*\]\(([^)]+)\)/);
    if (markdownImageMatch) {
      const normalized = normalizeMediaUrl(markdownImageMatch[1]);
      if (normalized) return normalized;
    }

    const dataUrlMatch = content.match(
      /(data:(?:image|video)\/[^;\s]+;\s*base64\s*,\s*[A-Za-z0-9+/=]+)/i
    );
    if (dataUrlMatch) {
      const normalized = normalizeMediaUrl(dataUrlMatch[1]);
      if (normalized) return normalized;
    }
  }

  const normalizedUrl = normalizeUnknownUrl(url);
  return isLikelyMediaUrl(normalizedUrl) ? normalizedUrl : null;
}

export function getVisualSummaryGenerationId(
  summary: SavedSummary
): string | null {
  const generationId = getVisualMetadata(summary).generationId;
  return typeof generationId === 'string' && generationId.trim()
    ? generationId.trim()
    : null;
}

export function getVisualSummaryImageUrl(
  summary: SavedSummary,
  variant: 'thumbnail' | 'preview' | 'original' = 'preview'
): string | null {
  const metadata = getVisualMetadata(summary);
  return getVisualImageDisplayUrl(
    getVisualSummaryDisplaySource(metadata),
    variant
  );
}

export function getVisualSummaryDisplayMeta(
  summary: SavedSummary
): VisualSummaryDisplayMeta {
  const metadata = getVisualMetadata(summary);
  const source = getVisualSummaryDisplaySource(metadata);
  const fallbackImageUrl = extractVisualSummaryFallbackImageUrl(
    summary.markdown,
    summary.url
  );
  const displayUrl =
    getVisualImageDisplayUrl(source, 'preview') || fallbackImageUrl;
  const originalUrl =
    getVisualImageDisplayUrl(source, 'original') || fallbackImageUrl;
  const refreshUrl =
    (originalUrl?.includes('/storage/v1/object/') ? originalUrl : null) ||
    buildPublicStorageUrl(metadata.storageBucket, metadata.storagePath);
  const modelLabel =
    normalizeUnknownString(metadata.modelLabel) ||
    normalizeUnknownString(metadata.model);

  return {
    ...source,
    generationId: getVisualSummaryGenerationId(summary),
    displayUrl,
    originalUrl,
    refreshUrl,
    modelLabel,
    imageSize: normalizeUnknownString(metadata.imageSize),
    aspectRatio: normalizeUnknownString(metadata.aspectRatio),
    quality: normalizeUnknownString(metadata.quality),
    outputFormat: normalizeUnknownString(metadata.outputFormat),
    createdAt: normalizeUnknownString(metadata.createdAt),
    isVisual:
      summary.contentType === 'image' ||
      summary.contentType === 'video' ||
      Boolean(modelLabel || displayUrl)
  };
}

export function deriveVisualSummaryDisplay(
  summary: SavedSummary
): VisualSummaryDisplay {
  const metadata = getVisualMetadata(summary);
  const meta = getVisualSummaryDisplayMeta(summary);
  const fallbackImageUrl = extractVisualSummaryFallbackImageUrl(
    summary.markdown,
    summary.url
  );
  const candidates = Array.from(
    new Set(
      [...getVisualImageDisplayCandidates(meta), fallbackImageUrl].filter(
        (url): url is string => Boolean(url)
      )
    )
  );
  const displayUrl = candidates[0] || null;
  const createdAt =
    normalizeUnknownString(metadata.createdAt) ||
    (typeof summary.createdAt === 'number'
      ? new Date(summary.createdAt).toISOString()
      : String(summary.createdAt || ''));
  const storageBucket = normalizeUnknownString(metadata.storageBucket);
  const storagePath = normalizeUnknownString(metadata.storagePath);

  return {
    ...meta,
    displayUrl,
    candidates,
    aspectRatio:
      getVisualSummaryCssAspectRatio(meta) ||
      parseCssAspectRatio(meta.imageSize) ||
      getVisualImageAspectRatio(meta, '4 / 5'),
    refreshInput: {
      generationId: meta.generationId,
      url: meta.refreshUrl || meta.originalUrl,
      storageBucket,
      storagePath
    },
    sortKey: `${createdAt || '0'}:${summary.id}`,
    cacheKey: `${summary.id}:${displayUrl || ''}:${meta.width || ''}:${meta.height || ''}`,
    isVisual: meta.isVisual || candidates.length > 0
  };
}

export function getVisualSummaryMediaCandidates(
  visualMeta: VisualSummaryDisplayMeta
): string[] {
  return Array.from(
    new Set(
      [
        ...getVisualImageDisplayCandidates(visualMeta),
        visualMeta.displayUrl,
        visualMeta.originalUrl
      ].filter((url): url is string => Boolean(url))
    )
  );
}

export function buildVisualSummaryMetadataFromHistoryItem(
  item: VisualImageHistoryItem
): Record<string, unknown> {
  return {
    generationId: item.id,
    thumbnailUrl: item.thumbnailUrl,
    previewUrl: item.previewUrl,
    imageUrl: item.imageUrl,
    storageBucket: item.storageBucket,
    storagePath: item.storagePath,
    thumbnailStoragePath: item.thumbnailStoragePath,
    previewStoragePath: item.previewStoragePath,
    model: item.model,
    modelLabel: item.modelLabel,
    provider: item.provider,
    imageSize: item.imageSize,
    aspectRatio: item.aspectRatio,
    quality: item.quality,
    outputFormat: item.outputFormat,
    width: item.width,
    height: item.height,
    prompt: item.prompt,
    negativePrompt: item.negativePrompt
  };
}
