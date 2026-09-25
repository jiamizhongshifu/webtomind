import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  MediaObjectLocator,
  MediaObjectRecord,
  MediaStorageAdapter,
  PutMediaObjectInput,
  SignReadUrlInput
} from './types.js';

async function toUploadBody(
  body: PutMediaObjectInput['body']
): Promise<ArrayBuffer | Uint8Array | Blob | Buffer> {
  if (body instanceof Blob) return body;
  return body;
}

export function createSupabaseMediaStorageAdapter(
  supabase: SupabaseClient,
  defaultBucket: string
): MediaStorageAdapter {
  return {
    provider: 'supabase',

    async putObject(input: PutMediaObjectInput): Promise<MediaObjectRecord> {
      const bucket = input.bucket || defaultBucket;
      const uploadBody = await toUploadBody(input.body);
      const { error } = await supabase.storage
        .from(bucket)
        .upload(input.key, uploadBody, {
          contentType: input.contentType,
          cacheControl: input.cacheControl || '31536000',
          upsert: false
        });

      if (error) {
        throw new Error(`Supabase media upload failed: ${error.message}`);
      }

      return {
        provider: 'supabase',
        bucket,
        key: input.key,
        contentType: input.contentType,
        width: input.width,
        height: input.height,
        duration: input.duration,
        byteSize: input.byteSize,
        cacheControl: input.cacheControl || '31536000'
      };
    },

    async signReadUrl(input: SignReadUrlInput): Promise<string | null> {
      if (input.locator.provider !== 'supabase') return input.fallbackUrl || null;
      const { data, error } = await supabase.storage
        .from(input.locator.bucket)
        .createSignedUrl(input.locator.key, input.expiresIn);
      if (error || !data?.signedUrl) {
        return input.fallbackUrl || null;
      }
      return data.signedUrl;
    },

    async deleteObjects(locators: MediaObjectLocator[]): Promise<void> {
      const byBucket = new Map<string, string[]>();
      for (const locator of locators) {
        if (locator.provider !== 'supabase') continue;
        const paths = byBucket.get(locator.bucket) || [];
        paths.push(locator.key);
        byBucket.set(locator.bucket, paths);
      }

      for (const [bucket, paths] of byBucket.entries()) {
        if (paths.length === 0) continue;
        const { error } = await supabase.storage.from(bucket).remove(paths);
        if (error) {
          throw new Error(`Supabase media delete failed: ${error.message}`);
        }
      }
    },

    async downloadObject(locator: MediaObjectLocator): Promise<ArrayBuffer | null> {
      if (locator.provider !== 'supabase') return null;
      const { data, error } = await supabase.storage
        .from(locator.bucket)
        .download(locator.key);
      if (error || !data) return null;
      return data.arrayBuffer();
    }
  };
}
