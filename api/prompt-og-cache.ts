import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  PROMPT_OG_IMAGE_VERSION,
  PROMPT_OG_SITE_URL
} from './prompt-og-worker-compat.js';

export const PROMPT_OG_CACHE_PREFIX = 'prompt-og';
export const PROMPT_OG_CACHE_CONTROL = '31536000';
export const PROMPT_OG_RESPONSE_CACHE_CONTROL =
  'public, max-age=31536000, immutable';

const DEFAULT_PROMPT_OG_CACHE_BUCKET = 'generated-images';

export type PromptOgLocale = 'zh-CN' | 'en-US';

export type PromptOgIdentifier = {
  locale: PromptOgLocale;
  slug?: string;
  id?: string;
  version?: string;
};

export type PromptOgCacheHit = {
  arrayBuffer: ArrayBuffer;
  bucket: string;
  key: string;
  publicUrl: string;
};

function getRuntimeEnvValue(key: string): string | undefined {
  return typeof process !== 'undefined' ? process.env[key] : undefined;
}

function getPromptOgCacheBucket(): string {
  return (
    getRuntimeEnvValue('PROMPT_OG_CACHE_BUCKET') ||
    getRuntimeEnvValue('PROMPT_CASE_BUCKET') ||
    getRuntimeEnvValue('PROMPT_ASSET_BUCKET') ||
    DEFAULT_PROMPT_OG_CACHE_BUCKET
  );
}

function getSupabaseStorageClient(): SupabaseClient | null {
  const supabaseUrl = getRuntimeEnvValue('SUPABASE_URL');
  const supabaseKey =
    getRuntimeEnvValue('SUPABASE_SERVICE_ROLE_KEY') ||
    getRuntimeEnvValue('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });
}

function normalizeIdentifier(input: PromptOgIdentifier): string {
  const identifier = (input.slug || input.id || '').trim();
  if (!identifier) {
    throw new Error('Prompt OG cache key requires a slug or id');
  }
  return encodeURIComponent(identifier);
}

export function buildPromptOgCacheKey(input: PromptOgIdentifier): string {
  const version = encodeURIComponent(input.version || PROMPT_OG_IMAGE_VERSION);
  const locale = input.locale === 'en-US' ? 'en-US' : 'zh-CN';
  return `${PROMPT_OG_CACHE_PREFIX}/${version}/${locale}/${normalizeIdentifier(input)}.png`;
}

export function buildPromptOgImageUrl(
  input: PromptOgIdentifier & { siteUrl?: string }
): string {
  const siteUrl = (input.siteUrl || PROMPT_OG_SITE_URL).replace(/\/+$/, '');
  const url = new URL('/api/prompt-og', siteUrl);
  url.searchParams.set('locale', input.locale === 'en-US' ? 'en-US' : 'zh-CN');
  if (input.slug) {
    url.searchParams.set('slug', input.slug);
  } else if (input.id) {
    url.searchParams.set('id', input.id);
  }
  url.searchParams.set('v', input.version || PROMPT_OG_IMAGE_VERSION);
  return url.toString();
}

export function getPromptOgCachePublicUrl(
  client: SupabaseClient,
  bucket: string,
  key: string
): string {
  const publicBaseUrl = getRuntimeEnvValue('PROMPT_OG_CACHE_PUBLIC_BASE_URL');
  if (publicBaseUrl) {
    return `${publicBaseUrl.replace(/\/+$/, '')}/${key}`;
  }

  const { data } = client.storage.from(bucket).getPublicUrl(key);
  return data.publicUrl || '';
}

export async function readPromptOgCache(
  key: string
): Promise<PromptOgCacheHit | null> {
  const client = getSupabaseStorageClient();
  if (!client) return null;

  const bucket = getPromptOgCacheBucket();
  const { data, error } = await client.storage.from(bucket).download(key);
  if (error || !data) {
    if (error && getRuntimeEnvValue('PROMPT_OG_CACHE_DEBUG') === 'true') {
      console.warn('[PromptOg] cache read failed:', error.message);
    }
    return null;
  }

  return {
    arrayBuffer: await data.arrayBuffer(),
    bucket,
    key,
    publicUrl: getPromptOgCachePublicUrl(client, bucket, key)
  };
}

export async function writePromptOgCache(
  key: string,
  bytes: Uint8Array
): Promise<string | null> {
  const client = getSupabaseStorageClient();
  if (!client) return null;

  const bucket = getPromptOgCacheBucket();
  const { error } = await client.storage.from(bucket).upload(key, bytes, {
    contentType: 'image/png',
    cacheControl: PROMPT_OG_CACHE_CONTROL,
    upsert: true
  });

  if (error) {
    throw error;
  }

  return getPromptOgCachePublicUrl(client, bucket, key) || null;
}
