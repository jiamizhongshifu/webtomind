import {
  getCorsHeadersForRequest,
  getSupabaseAdmin,
  getUserIdFromRequest
} from '../utils/auth.js';
import {
  buildClientMediaUrls,
  createMediaStorageAdapters
} from '../utils/media-storage/index.js';

export const config = { runtime: 'edge' };

interface VideoGenerationRecord {
  id: string;
  task_id: string | null;
  video_url: string | null;
  poster_url: string | null;
  prompt: string;
  model_label: string;
  provider: string;
  provider_model: string;
  provider_task_id: string | null;
  aspect_ratio: string | null;
  duration: number | null;
  storage_bucket: string | null;
  storage_path: string | null;
  byte_size: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const VIDEO_SIGNED_URL_EXPIRES_IN = 60 * 60 * 24;

function jsonResponse(
  data: unknown,
  corsHeaders: Record<string, string>,
  status = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

async function mapVideoGeneration(record: VideoGenerationRecord) {
  const sb = getSupabaseAdmin();
  let videoUrl = record.video_url || '';
  let posterUrl = record.poster_url || undefined;
  let videoUrlExpiresIn: number | undefined = VIDEO_SIGNED_URL_EXPIRES_IN;
  if (sb) {
    const mediaUrls = await buildClientMediaUrls(
      createMediaStorageAdapters({
        supabase: sb,
        defaultBucket: record.storage_bucket || 'user-generated-videos'
      }),
      record.metadata,
      VIDEO_SIGNED_URL_EXPIRES_IN,
      { videoUrl, posterUrl }
    );
    videoUrl = mediaUrls.videoUrl || videoUrl;
    posterUrl = mediaUrls.posterUrl || posterUrl;
    videoUrlExpiresIn = mediaUrls.videoUrlExpiresIn;
  }

  return {
    generationId: record.id,
    taskId: record.task_id,
    videoUrl,
    videoUrlExpiresIn,
    posterUrl,
    prompt: record.prompt,
    model: record.provider_model,
    modelLabel: record.model_label,
    aspectRatio: record.aspect_ratio,
    duration: record.duration,
    storageBucket: record.storage_bucket,
    storagePath: record.storage_path,
    byteSize: record.byte_size,
    isFavorite: record.metadata?.isFavorite === true,
    createdAt: record.created_at
  };
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'GET' && request.method !== 'PATCH') {
    return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
  }

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return jsonResponse({ error: 'Unauthorized' }, corsHeaders, 401);
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    return jsonResponse(
      { error: 'Database admin not configured' },
      corsHeaders,
      500
    );
  }

  const url = new URL(request.url);

  if (request.method === 'PATCH') {
    const generationId = url.searchParams.get('id')?.trim();
    if (!generationId) {
      return jsonResponse({ error: 'id is required' }, corsHeaders, 400);
    }
    const body = (await request.json().catch(() => null)) as {
      isFavorite?: unknown;
    } | null;
    if (typeof body?.isFavorite !== 'boolean') {
      return jsonResponse(
        { error: 'isFavorite must be a boolean' },
        corsHeaders,
        400
      );
    }

    const { data: existing, error: loadError } = await sb
      .from('video_generations')
      .select('metadata')
      .eq('id', generationId)
      .eq('user_id', userId)
      .maybeSingle();
    if (loadError) {
      console.error('[VideoHistory] favorite load failed:', loadError);
      return jsonResponse(
        { error: 'Failed to update favorite' },
        corsHeaders,
        500
      );
    }
    if (!existing) {
      return jsonResponse({ error: 'Video not found' }, corsHeaders, 404);
    }

    const metadata =
      existing.metadata && typeof existing.metadata === 'object'
        ? (existing.metadata as Record<string, unknown>)
        : {};
    const { error: updateError } = await sb
      .from('video_generations')
      .update({ metadata: { ...metadata, isFavorite: body.isFavorite } })
      .eq('id', generationId)
      .eq('user_id', userId);
    if (updateError) {
      console.error('[VideoHistory] favorite update failed:', updateError);
      return jsonResponse(
        { error: 'Failed to update favorite' },
        corsHeaders,
        500
      );
    }

    return jsonResponse(
      {
        success: true,
        id: generationId,
        isFavorite: body.isFavorite
      },
      corsHeaders
    );
  }

  const limit = Math.max(
    1,
    Math.min(100, Number(url.searchParams.get('limit') || 48))
  );
  const before = url.searchParams.get('before');
  const ids = Array.from(
    new Set(
      (url.searchParams.get('ids') || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 60)
    )
  );

  let query = sb
    .from('video_generations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (ids.length > 0) {
    query = query.in('id', ids);
  }

  if (before) {
    query = query.lt('created_at', before);
  }

  if (url.searchParams.get('favorite') === 'true') {
    query = query.filter('metadata->>isFavorite', 'eq', 'true');
  }

  const { data, error } = await query;
  if (error) {
    return jsonResponse(
      {
        error: 'VIDEO_HISTORY_FAILED',
        message: error.message
      },
      corsHeaders,
      500
    );
  }

  const items = await Promise.all(
    ((data || []) as VideoGenerationRecord[]).map(mapVideoGeneration)
  );
  const nextBefore =
    items.length === limit ? items[items.length - 1]?.createdAt : undefined;

  return jsonResponse(
    {
      success: true,
      items,
      ...(ids.length > 0
        ? {
            missingIds: ids.filter(
              (id) => !items.some((item) => item.generationId === id)
            )
          }
        : {}),
      nextBefore,
      hasMore: Boolean(nextBefore)
    },
    corsHeaders
  );
}
