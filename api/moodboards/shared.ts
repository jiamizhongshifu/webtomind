import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  MoodboardItemSource,
  MoodboardVisibility,
  VisualMoodboard,
  VisualMoodboardItem
} from '../../src/shared/create-workspace-v2.js';
import { getCorsHeadersForRequest, getSupabaseAdmin } from '../utils/auth.js';

export function moodboardJson(
  request: Request,
  data: unknown,
  status = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...getCorsHeadersForRequest(request),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}

export function moodboardOptions(request: Request): Response | null {
  return request.method === 'OPTIONS'
    ? new Response(null, {
        status: 204,
        headers: getCorsHeadersForRequest(request)
      })
    : null;
}

export function moodboardDatabase(request: Request): SupabaseClient | Response {
  const database = getSupabaseAdmin();
  return database || moodboardJson(request, { error: '数据库未配置' }, 500);
}

export function getMoodboardId(request: Request): string {
  const pathname = new URL(request.url).pathname;
  const match = pathname.match(/\/api\/moodboards\/([^/]+)/);
  return decodeURIComponent(match?.[1] || '').trim();
}

export function sanitizeText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export function sanitizeStringList(value: unknown, limit = 16): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ).slice(0, limit);
}

export function sanitizeVisibility(value: unknown): MoodboardVisibility {
  return value === 'unlisted' || value === 'public' ? value : 'private';
}

export function sanitizeItemSource(value: unknown): MoodboardItemSource {
  if (
    value === 'gallery' ||
    value === 'generation' ||
    value === 'prompt_case' ||
    value === 'preset'
  ) {
    return value;
  }
  return 'upload';
}

type MoodboardItemRow = {
  id: string;
  moodboard_id: string;
  source: MoodboardItemSource;
  image_url: string;
  title: string | null;
  prompt: string | null;
  image_reference_id: string | null;
  media_object_id: string | null;
  image_generation_id: string | null;
  prompt_case_id: string | null;
  sort_order: number;
  is_representative: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type MoodboardRow = {
  id: string;
  source_moodboard_id: string | null;
  user_id: string | null;
  name: string;
  description: string | null;
  visibility: MoodboardVisibility;
  is_official: boolean;
  cover_item_id: string | null;
  analysis_status: VisualMoodboard['analysisStatus'];
  taste_profile: string | null;
  keywords: unknown;
  avoids: unknown;
  guidelines: unknown;
  representative_asset_ids: unknown;
  analysis_version: number;
  created_at: string;
  updated_at: string;
  visual_moodboard_items?: MoodboardItemRow[];
};

export function formatMoodboardItem(
  row: MoodboardItemRow
): VisualMoodboardItem {
  return {
    id: row.id,
    moodboardId: row.moodboard_id,
    source: row.source,
    imageUrl: row.image_url,
    title: row.title || undefined,
    prompt: row.prompt || undefined,
    imageReferenceId: row.image_reference_id || undefined,
    mediaObjectId: row.media_object_id || undefined,
    imageGenerationId: row.image_generation_id || undefined,
    promptCaseId: row.prompt_case_id || undefined,
    sortOrder: row.sort_order,
    isRepresentative: row.is_representative,
    createdAt: row.created_at
  };
}

export function formatMoodboard(
  row: MoodboardRow,
  userId?: string,
  shareToken?: string
): VisualMoodboard {
  const items = (row.visual_moodboard_items || [])
    .map(formatMoodboardItem)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const cover = items.find((item) => item.id === row.cover_item_id) || items[0];
  const sourcePresetKey = (row.visual_moodboard_items || [])
    .map((item) => item.metadata?.copiedFromPresetKey)
    .find(
      (value): value is string => typeof value === 'string' && Boolean(value)
    );
  return {
    id: row.id,
    sourceMoodboardId: row.source_moodboard_id || undefined,
    sourcePresetKey,
    name: row.name,
    description: row.description || undefined,
    visibility: row.visibility,
    isOfficial: row.is_official,
    isOwner: Boolean(userId && row.user_id === userId),
    coverImageUrl: cover?.imageUrl,
    itemCount: items.length,
    items,
    analysisStatus: row.analysis_status,
    tasteProfile: row.taste_profile || '',
    keywords: sanitizeStringList(row.keywords),
    avoids: sanitizeStringList(row.avoids),
    guidelines: sanitizeStringList(row.guidelines),
    representativeAssetIds: sanitizeStringList(row.representative_asset_ids, 4),
    analysisVersion: row.analysis_version || 0,
    shareToken,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export const moodboardSelect = `
  id, source_moodboard_id, user_id, name, description, visibility, is_official, cover_item_id,
  analysis_status, taste_profile, keywords, avoids, guidelines,
  representative_asset_ids, analysis_version, created_at, updated_at,
  visual_moodboard_items!visual_moodboard_items_moodboard_id_fkey (
    id, moodboard_id, source, image_url, title, prompt, image_reference_id, media_object_id,
    image_generation_id, prompt_case_id, sort_order, is_representative,
    metadata, created_at
  )
`;

export async function getOwnedMoodboard(
  database: SupabaseClient,
  moodboardId: string,
  userId: string
): Promise<MoodboardRow | null> {
  const { data, error } = await database
    .from('visual_moodboards')
    .select(moodboardSelect)
    .eq('id', moodboardId)
    .eq('user_id', userId)
    .eq('is_official', false)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as MoodboardRow | null) || null;
}
