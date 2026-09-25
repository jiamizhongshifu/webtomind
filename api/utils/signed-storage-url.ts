import type { SupabaseClient } from '@supabase/supabase-js';
import { refreshR2SignedStorageUrl } from './media-storage/r2-s3-storage';

const SUPABASE_SIGNED_OBJECT_MARKER = '/storage/v1/object/sign/';
const DEFAULT_SIGNED_IMAGE_EXPIRES_IN = 60 * 60 * 24 * 7;
const SIGNED_URL_EXPIRY_SKEW_MS = 60 * 1000;

type SignedStorageObject = {
  bucket: string;
  path: string;
};

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function isSupabaseSignedStorageUrl(value: string): boolean {
  return parseSupabaseSignedStorageUrl(value) !== null;
}

export function getSupabaseSignedStorageUrlExpiresAt(
  value: string
): number | null {
  try {
    const token = new URL(value.trim()).searchParams.get('token');
    const encodedPayload = token?.split('.')[1];
    if (!encodedPayload) return null;
    const base64 = encodedPayload
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(encodedPayload.length / 4) * 4, '=');
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as {
      exp?: unknown;
    };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function isSupabaseSignedStorageUrlExpired(value: string): boolean {
  const expiresAt = getSupabaseSignedStorageUrlExpiresAt(value);
  return (
    expiresAt !== null && expiresAt <= Date.now() + SIGNED_URL_EXPIRY_SKEW_MS
  );
}

export function parseSupabaseSignedStorageUrl(
  value: string
): SignedStorageObject | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    const markerIndex = url.pathname.indexOf(SUPABASE_SIGNED_OBJECT_MARKER);
    if (markerIndex < 0) return null;

    const objectPath = url.pathname.slice(
      markerIndex + SUPABASE_SIGNED_OBJECT_MARKER.length
    );
    const [bucket, ...pathParts] = objectPath
      .split('/')
      .filter(Boolean)
      .map(decodePathSegment);

    if (!bucket || pathParts.length === 0) return null;
    return {
      bucket,
      path: pathParts.join('/')
    };
  } catch {
    return null;
  }
}

export async function refreshSupabaseSignedStorageUrl(
  supabase: SupabaseClient,
  value: string,
  expiresIn = DEFAULT_SIGNED_IMAGE_EXPIRES_IN
): Promise<string> {
  const trimmed = value.trim();
  const signedObject = parseSupabaseSignedStorageUrl(trimmed);
  if (!signedObject) return refreshR2SignedStorageUrl(trimmed, expiresIn);
  if (!isSupabaseSignedStorageUrlExpired(trimmed)) return trimmed;

  const { data, error } = await supabase.storage
    .from(signedObject.bucket)
    .createSignedUrl(signedObject.path, expiresIn);

  if (error || !data?.signedUrl) {
    console.warn('[SignedStorageUrl] Failed to refresh signed URL:', {
      bucket: signedObject.bucket,
      path: signedObject.path,
      error,
      expired: isSupabaseSignedStorageUrlExpired(trimmed)
    });
    return isSupabaseSignedStorageUrlExpired(trimmed) ? '' : trimmed;
  }

  return data.signedUrl;
}

export async function refreshSupabaseSignedStorageUrls(
  supabase: SupabaseClient,
  values: string[],
  expiresIn = DEFAULT_SIGNED_IMAGE_EXPIRES_IN
): Promise<string[]> {
  const refreshed = new Map<string, Promise<string>>();
  const results = await Promise.all(
    values.map((value) => {
      const trimmed = value.trim();
      if (!refreshed.has(trimmed)) {
        refreshed.set(trimmed, refreshR2SignedStorageUrl(trimmed, expiresIn));
      }
      return refreshed.get(trimmed)!;
    })
  );
  const pendingByBucket = new Map<
    string,
    Array<{ index: number; original: string; path: string }>
  >();
  const seen = new Map<string, number>();

  values.forEach((value, index) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    const duplicateIndex = seen.get(trimmed);
    if (duplicateIndex !== undefined) {
      results[index] = results[duplicateIndex] || trimmed;
      return;
    }
    seen.set(trimmed, index);

    const signedObject = parseSupabaseSignedStorageUrl(trimmed);
    if (!signedObject || !isSupabaseSignedStorageUrlExpired(trimmed)) return;

    const bucketItems = pendingByBucket.get(signedObject.bucket) || [];
    bucketItems.push({
      index,
      original: trimmed,
      path: signedObject.path
    });
    pendingByBucket.set(signedObject.bucket, bucketItems);
  });

  await Promise.all(
    Array.from(pendingByBucket.entries()).map(async ([bucket, items]) => {
      const bucketClient = supabase.storage.from(bucket);
      const createSignedUrls = (
        bucketClient as {
          createSignedUrls?: (
            paths: string[],
            expiresIn: number
          ) => Promise<{
            data?: Array<{ signedUrl?: string } | null> | null;
            error?: unknown;
          }>;
        }
      ).createSignedUrls;

      if (typeof createSignedUrls === 'function') {
        const { data, error } = await createSignedUrls.call(
          bucketClient,
          items.map((item) => item.path),
          expiresIn
        );
        if (!error && Array.isArray(data)) {
          items.forEach((item, itemIndex) => {
            results[item.index] = data[itemIndex]?.signedUrl || '';
          });
          return;
        }
      }

      await Promise.all(
        items.map(async (item) => {
          results[item.index] = await refreshSupabaseSignedStorageUrl(
            supabase,
            item.original,
            expiresIn
          );
        })
      );
    })
  );

  seen.forEach((sourceIndex, original) => {
    values.forEach((value, index) => {
      if (value.trim() === original) {
        results[index] = results[sourceIndex];
      }
    });
  });

  return results;
}
