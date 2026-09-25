import type { SupabaseClient } from '@supabase/supabase-js';

export type MediaStorageProvider = 'supabase' | 'r2';
export type MediaVariant = 'original' | 'thumbnail' | 'preview' | 'poster';

export interface MediaObjectLocator {
  provider: MediaStorageProvider;
  bucket: string;
  key: string;
}

export interface MediaObjectRecord extends MediaObjectLocator {
  contentType?: string;
  width?: number;
  height?: number;
  duration?: number;
  byteSize?: number;
  etag?: string;
  checksumSha256?: string;
  cacheControl?: string;
  publicUrl?: string;
}

export type MediaObjectMap = Partial<Record<MediaVariant, MediaObjectRecord>>;

export interface MediaStorageMetadata {
  storageProvider?: MediaStorageProvider;
  storageBucket?: string;
  storagePath?: string;
  thumbnailStoragePath?: string;
  previewStoragePath?: string;
  posterStoragePath?: string;
  r2Bucket?: string;
  r2Key?: string;
  mediaObjectId?: string;
  thumbnailMediaObjectId?: string;
  previewMediaObjectId?: string;
  migrationVersion?: number;
  media?: MediaObjectMap;
  [key: string]: unknown;
}

export interface PutMediaObjectInput {
  bucket?: string;
  key: string;
  body: ArrayBuffer | Uint8Array | Blob | Buffer;
  contentType: string;
  cacheControl?: string;
  width?: number;
  height?: number;
  duration?: number;
  byteSize?: number;
}

export interface SignReadUrlInput {
  locator: MediaObjectLocator;
  expiresIn: number;
  fallbackUrl?: string | null;
}

export interface MediaStorageAdapter {
  readonly provider: MediaStorageProvider;
  putObject(input: PutMediaObjectInput): Promise<MediaObjectRecord>;
  signReadUrl(input: SignReadUrlInput): Promise<string | null>;
  deleteObjects(locators: MediaObjectLocator[]): Promise<void>;
  downloadObject(locator: MediaObjectLocator): Promise<ArrayBuffer | null>;
}

export interface MediaStorageContext {
  supabase?: SupabaseClient | null;
}

export interface ClientMediaUrls {
  imageUrl?: string;
  videoUrl?: string;
  posterUrl?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  imageUrlExpiresIn?: number;
  videoUrlExpiresIn?: number;
}

export function isMediaObjectRecord(value: unknown): value is MediaObjectRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<MediaObjectRecord>;
  return (
    (record.provider === 'supabase' || record.provider === 'r2') &&
    typeof record.bucket === 'string' &&
    typeof record.key === 'string'
  );
}

export function normalizeMediaMetadata(value: unknown): MediaStorageMetadata {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as MediaStorageMetadata)
    : {};
}

export function locatorFromRecord(record: MediaObjectRecord): MediaObjectLocator {
  return {
    provider: record.provider,
    bucket: record.bucket,
    key: record.key
  };
}
