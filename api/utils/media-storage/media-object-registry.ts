import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  MediaObjectLocator,
  MediaObjectRecord,
  MediaVariant
} from './types.js';

export type MediaObjectRegistryKind = MediaVariant | 'reference' | 'asset';
export type MediaObjectRegistryStatus =
  | 'ready'
  | 'orphaned'
  | 'deleted'
  | 'failed';

export interface MediaObjectRegistryInput {
  userId: string;
  ownerType: string;
  ownerId?: string | null;
  kind: MediaObjectRegistryKind;
  record: MediaObjectRecord;
  status?: MediaObjectRegistryStatus;
  metadata?: Record<string, unknown>;
}

export interface MediaObjectUpsertPayload {
  user_id: string;
  owner_type: string;
  owner_id: string | null;
  kind: MediaObjectRegistryKind;
  provider: MediaObjectRecord['provider'];
  bucket: string;
  object_key: string;
  content_type: string | null;
  byte_size: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  checksum_sha256: string | null;
  etag: string | null;
  status: MediaObjectRegistryStatus;
  metadata: Record<string, unknown>;
  updated_at: string;
}

interface SafeRegistryOptions {
  logPrefix?: string;
  logger?: Pick<Console, 'warn'>;
}

function nullableNumber(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeMetadata(
  value: Record<string, unknown> | undefined
): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

export function buildMediaObjectUpsertPayload(
  input: MediaObjectRegistryInput
): MediaObjectUpsertPayload {
  return {
    user_id: input.userId,
    owner_type: input.ownerType,
    owner_id: input.ownerId || null,
    kind: input.kind,
    provider: input.record.provider,
    bucket: input.record.bucket,
    object_key: input.record.key,
    content_type: input.record.contentType || null,
    byte_size: nullableNumber(input.record.byteSize),
    width: nullableNumber(input.record.width),
    height: nullableNumber(input.record.height),
    duration: nullableNumber(input.record.duration),
    checksum_sha256: input.record.checksumSha256 || null,
    etag: input.record.etag || null,
    status: input.status || 'ready',
    metadata: normalizeMetadata(input.metadata),
    updated_at: new Date().toISOString()
  };
}

export async function upsertMediaObjectRecords(
  supabase: SupabaseClient,
  inputs: MediaObjectRegistryInput[]
): Promise<void> {
  if (inputs.length === 0) return;

  const payload = inputs.map((input) => buildMediaObjectUpsertPayload(input));
  const { error } = await supabase.from('media_objects').upsert(payload, {
    onConflict: 'provider,bucket,object_key'
  });

  if (error) {
    throw new Error(`media_objects upsert failed: ${error.message}`);
  }
}

export async function safeUpsertMediaObjectRecords(
  supabase: SupabaseClient,
  inputs: MediaObjectRegistryInput[],
  options: SafeRegistryOptions = {}
): Promise<void> {
  try {
    await upsertMediaObjectRecords(supabase, inputs);
  } catch (error) {
    (options.logger || console).warn(
      options.logPrefix || '[MediaStorage] media_objects upsert failed',
      error
    );
  }
}

export async function markMediaObjectsDeleted(
  supabase: SupabaseClient,
  locators: MediaObjectLocator[]
): Promise<void> {
  const seen = new Set<string>();
  const updatedAt = new Date().toISOString();

  for (const locator of locators) {
    const dedupeKey = `${locator.provider}:${locator.bucket}:${locator.key}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const { error } = await supabase
      .from('media_objects')
      .update({ status: 'deleted', updated_at: updatedAt })
      .eq('provider', locator.provider)
      .eq('bucket', locator.bucket)
      .eq('object_key', locator.key);

    if (error) {
      throw new Error(`media_objects delete mark failed: ${error.message}`);
    }
  }
}

export async function safeMarkMediaObjectsDeleted(
  supabase: SupabaseClient,
  locators: MediaObjectLocator[],
  options: SafeRegistryOptions = {}
): Promise<void> {
  try {
    await markMediaObjectsDeleted(supabase, locators);
  } catch (error) {
    (options.logger || console).warn(
      options.logPrefix || '[MediaStorage] media_objects delete mark failed',
      error
    );
  }
}
