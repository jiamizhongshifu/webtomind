import type { SupabaseClient } from '@supabase/supabase-js';
import type { MoodboardConditioning } from '../../../src/shared/create-workspace-v2.js';

type MoodboardReferenceRow = {
  user_id: string | null;
  visibility: 'private' | 'unlisted' | 'public';
  is_official: boolean;
  moderation_status: string;
  representative_asset_ids: unknown;
  visual_moodboard_items?: Array<{ image_reference_id: string | null }>;
};

function stringIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

async function hasValidShare(
  database: SupabaseClient,
  moodboardId: string,
  shareToken: string | undefined
): Promise<boolean> {
  if (!shareToken) return false;
  const { data, error } = await database
    .from('visual_moodboard_shares')
    .select('expires_at')
    .eq('token', shareToken)
    .eq('moodboard_id', moodboardId)
    .is('revoked_at', null)
    .maybeSingle();
  if (error || !data) return false;
  return !data.expires_at || new Date(data.expires_at).getTime() > Date.now();
}

/**
 * Returns only foreign reference IDs that the current user may consume through
 * an official, public, or token-shared Moodboard. The requested IDs must also
 * be attached to that exact Moodboard; a client-provided token never grants
 * access to arbitrary image_reference_assets rows.
 */
export async function getAuthorizedMoodboardReferenceIds(
  database: SupabaseClient,
  userId: string,
  moodboard: MoodboardConditioning | undefined,
  requestedIds: string[]
): Promise<Set<string>> {
  if (!moodboard || requestedIds.length === 0) return new Set();
  const { data, error } = await database
    .from('visual_moodboards')
    .select(
      'user_id, visibility, is_official, moderation_status, representative_asset_ids, visual_moodboard_items(image_reference_id)'
    )
    .eq('id', moodboard.moodboardId)
    .maybeSingle();
  if (error || !data) return new Set();

  const board = data as MoodboardReferenceRow;
  const directlyReadable =
    board.user_id === userId ||
    board.is_official ||
    (board.visibility === 'public' && board.moderation_status === 'active');
  const tokenReadable = directlyReadable
    ? false
    : await hasValidShare(database, moodboard.moodboardId, moodboard.shareToken);
  if (!directlyReadable && !tokenReadable) return new Set();

  const attachedIds = new Set([
    ...stringIds(board.representative_asset_ids),
    ...(board.visual_moodboard_items || [])
      .map((item) => item.image_reference_id)
      .filter((id): id is string => Boolean(id))
  ]);
  return new Set(requestedIds.filter((id) => attachedIds.has(id)));
}
