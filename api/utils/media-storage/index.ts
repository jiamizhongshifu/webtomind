import type { SupabaseClient } from '@supabase/supabase-js';
import { createR2BindingMediaStorageAdapter } from './r2-binding-storage.js';
import { createR2S3MediaStorageAdapter, hasR2S3Config } from './r2-s3-storage.js';
import { createSupabaseMediaStorageAdapter } from './supabase-storage.js';
import type {
  ClientMediaUrls,
  MediaObjectLocator,
  MediaObjectMap,
  MediaObjectRecord,
  MediaStorageAdapter,
  MediaStorageMetadata,
  MediaStorageProvider,
  MediaVariant,
  SignReadUrlInput
} from './types.js';
import {
  isMediaObjectRecord,
  locatorFromRecord,
  normalizeMediaMetadata
} from './types.js';

export * from './types.js';
export * from './media-object-registry.js';

function getEnv(name: string): string {
  return typeof process !== 'undefined' ? process.env[name] || '' : '';
}

export function getMediaStorageProviderPreference(): 'supabase' | 'r2' | 'dual' {
  const value = getEnv('MEDIA_STORAGE_PROVIDER').toLowerCase();
  return value === 'r2' || value === 'dual' ? value : 'supabase';
}

export function createMediaStorageAdapter(options: {
  supabase: SupabaseClient;
  defaultBucket: string;
}): MediaStorageAdapter {
  const preference = getMediaStorageProviderPreference();
  if (preference === 'r2' || preference === 'dual') {
    const r2S3Fallback = hasR2S3Config() ? createR2S3MediaStorageAdapter() : null;
    const r2 = createR2BindingMediaStorageAdapter({
      signReadUrlFallback: r2S3Fallback
    });
    if (r2) return r2;
    if (r2S3Fallback) return r2S3Fallback;
  }
  return createSupabaseMediaStorageAdapter(options.supabase, options.defaultBucket);
}

export function createMediaStorageAdapters(options: {
  supabase: SupabaseClient;
  defaultBucket: string;
}): Record<MediaStorageProvider, MediaStorageAdapter | null> {
  const r2S3Fallback = createR2S3MediaStorageAdapter();
  return {
    supabase: createSupabaseMediaStorageAdapter(
      options.supabase,
      options.defaultBucket
    ),
    r2:
      createR2BindingMediaStorageAdapter({
        signReadUrlFallback: r2S3Fallback
      }) || r2S3Fallback
  };
}

export function getVariantRecord(
  metadataValue: unknown,
  variant: MediaVariant
): MediaObjectRecord | null {
  const metadata = normalizeMediaMetadata(metadataValue);
  const media = metadata.media || {};
  const record = media[variant];
  if (isMediaObjectRecord(record)) return record;

  if (variant === 'original' && metadata.storageBucket && metadata.storagePath) {
    return {
      provider:
        metadata.storageProvider === 'r2' || metadata.storageProvider === 'supabase'
          ? metadata.storageProvider
          : 'supabase',
      bucket: String(metadata.storageBucket),
      key: String(metadata.storagePath),
      width:
        typeof metadata.width === 'number' ? (metadata.width as number) : undefined,
      height:
        typeof metadata.height === 'number'
          ? (metadata.height as number)
          : undefined,
      byteSize:
        typeof metadata.byteSize === 'number'
          ? (metadata.byteSize as number)
          : undefined
    };
  }

  if (variant === 'original' && metadata.r2Bucket && metadata.r2Key) {
    return {
      provider: 'r2',
      bucket: String(metadata.r2Bucket),
      key: String(metadata.r2Key),
      width:
        typeof metadata.width === 'number' ? (metadata.width as number) : undefined,
      height:
        typeof metadata.height === 'number'
          ? (metadata.height as number)
          : undefined,
      byteSize:
        typeof metadata.byteSize === 'number'
          ? (metadata.byteSize as number)
          : undefined
    };
  }

  const legacyPathKey =
    variant === 'thumbnail'
      ? 'thumbnailStoragePath'
      : variant === 'preview'
        ? 'previewStoragePath'
        : variant === 'poster'
          ? 'posterStoragePath'
          : 'storagePath';
  const legacyPath = metadata[legacyPathKey];
  if (metadata.storageBucket && typeof legacyPath === 'string' && legacyPath) {
    return {
      provider:
        metadata.storageProvider === 'r2' || metadata.storageProvider === 'supabase'
          ? metadata.storageProvider
          : 'supabase',
      bucket: String(metadata.storageBucket),
      key: legacyPath
    };
  }

  return null;
}

export function getVariantLocators(metadata: unknown): MediaObjectLocator[] {
  const variants: MediaVariant[] = ['original', 'thumbnail', 'preview', 'poster'];
  const seen = new Set<string>();
  return variants.flatMap((variant) => {
    const record = getVariantRecord(metadata, variant);
    if (!record) return [];
    const locator = locatorFromRecord(record);
    const key = `${locator.provider}:${locator.bucket}:${locator.key}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [locator];
  });
}

export function buildMediaMetadata(input: {
  existing?: Record<string, unknown>;
  storageProvider: MediaStorageProvider;
  original: MediaObjectRecord;
  thumbnail?: MediaObjectRecord;
  preview?: MediaObjectRecord;
  poster?: MediaObjectRecord;
}): MediaStorageMetadata {
  const media: MediaObjectMap = {
    original: input.original
  };
  if (input.thumbnail) media.thumbnail = input.thumbnail;
  if (input.preview) media.preview = input.preview;
  if (input.poster) media.poster = input.poster;
  return {
    ...(input.existing || {}),
    storageProvider: input.storageProvider,
    storageBucket: input.original.bucket,
    storagePath: input.original.key,
    thumbnailStoragePath: input.thumbnail?.key,
    previewStoragePath: input.preview?.key,
    posterStoragePath: input.poster?.key,
    r2Bucket: input.storageProvider === 'r2' ? input.original.bucket : undefined,
    r2Key: input.storageProvider === 'r2' ? input.original.key : undefined,
    migrationVersion: 1,
    media
  };
}

export async function signMediaVariant(
  adapters: Record<MediaStorageProvider, MediaStorageAdapter | null>,
  metadata: unknown,
  variant: MediaVariant,
  expiresIn: number,
  fallbackUrl?: string | null
): Promise<string | null> {
  const record = getVariantRecord(metadata, variant);
  if (!record) return fallbackUrl || null;
  const adapter = adapters[record.provider];
  if (!adapter) return fallbackUrl || record.publicUrl || null;
  const input: SignReadUrlInput = {
    locator: locatorFromRecord(record),
    expiresIn,
    fallbackUrl: fallbackUrl || record.publicUrl
  };
  try {
    return (
      (await adapter.signReadUrl(input)) ||
      fallbackUrl ||
      record.publicUrl ||
      null
    );
  } catch {
    return fallbackUrl || record.publicUrl || null;
  }
}

export async function buildClientMediaUrls(
  adapters: Record<MediaStorageProvider, MediaStorageAdapter | null>,
  metadata: unknown,
  expiresIn: number,
  fallback: {
    imageUrl?: string | null;
    videoUrl?: string | null;
    posterUrl?: string | null;
  } = {}
): Promise<ClientMediaUrls> {
  const [original, thumbnail, preview, poster] = await Promise.all([
    signMediaVariant(
      adapters,
      metadata,
      'original',
      expiresIn,
      fallback.imageUrl || fallback.videoUrl
    ),
    signMediaVariant(adapters, metadata, 'thumbnail', expiresIn),
    signMediaVariant(adapters, metadata, 'preview', expiresIn),
    signMediaVariant(adapters, metadata, 'poster', expiresIn, fallback.posterUrl)
  ]);
  return {
    imageUrl: original || undefined,
    videoUrl: original || undefined,
    imageUrlExpiresIn: original ? expiresIn : undefined,
    videoUrlExpiresIn: original ? expiresIn : undefined,
    thumbnailUrl: thumbnail || preview || undefined,
    previewUrl: preview || undefined,
    posterUrl: poster || fallback.posterUrl || undefined
  };
}
