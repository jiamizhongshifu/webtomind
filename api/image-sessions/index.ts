import { getUserIdFromRequest } from '../utils/auth.js';
import {
  moodboardDatabase,
  moodboardJson,
  moodboardOptions,
  sanitizeText
} from '../moodboards/shared.js';
import { deriveImageSessionTitle } from '../../src/shared/image-session-title.js';

export const config = { runtime: 'edge' };

type SessionTurnCoverRow = {
  session_id?: unknown;
  generation_ids?: unknown;
};

export function getLatestSessionGenerationIds(
  rows: SessionTurnCoverRow[]
): Map<string, string> {
  const coverBySessionId = new Map<string, string>();
  rows.forEach((row) => {
    const sessionId = String(row.session_id || '').trim();
    if (!sessionId || coverBySessionId.has(sessionId)) return;
    const generationId = Array.isArray(row.generation_ids)
      ? row.generation_ids.find(
          (value) => typeof value === 'string' && value.trim()
        )
      : undefined;
    if (typeof generationId === 'string') {
      coverBySessionId.set(sessionId, generationId.trim());
    }
  });
  return coverBySessionId;
}

function formatSession(
  row: Record<string, unknown>,
  coverBySessionId?: Map<string, string>
) {
  const id = String(row.id);
  return {
    id,
    title: String(row.title || '未命名创作'),
    mediaType:
      row.metadata &&
      typeof row.metadata === 'object' &&
      (row.metadata as Record<string, unknown>).mediaType === 'video'
        ? 'video'
        : 'image',
    status: row.status === 'archived' ? 'archived' : 'active',
    coverGenerationId: coverBySessionId?.get(id),
    lastTurnAt: row.last_turn_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export default async function handler(request: Request): Promise<Response> {
  const options = moodboardOptions(request);
  if (options) return options;
  const userId = await getUserIdFromRequest(request);
  if (!userId) return moodboardJson(request, { error: '请先登录' }, 401);
  const database = moodboardDatabase(request);
  if (database instanceof Response) return database;
  if (request.method === 'GET') {
    const searchParams = new URL(request.url).searchParams;
    const requestedLimitValue = searchParams.get('limit');
    const mediaType =
      searchParams.get('mediaType') === 'video' ? 'video' : 'image';
    const requestedLimit = requestedLimitValue
      ? Number(requestedLimitValue)
      : Number.NaN;
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(50, Math.max(1, Math.floor(requestedLimit)))
      : undefined;
    let sessionQuery = database
      .from('image_creation_sessions')
      .select(
        'id, title, status, metadata, last_turn_at, created_at, updated_at'
      )
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    sessionQuery =
      mediaType === 'video'
        ? sessionQuery.contains('metadata', { mediaType: 'video' })
        : sessionQuery.or(
            'metadata->>mediaType.is.null,metadata->>mediaType.eq.image'
          );
    if (limit) sessionQuery = sessionQuery.limit(limit);
    const { data, error } = await sessionQuery;
    if (error) return moodboardJson(request, { error: error.message }, 500);

    const sessionRows = data || [];
    const sessionIds = sessionRows.map((row) => String(row.id)).filter(Boolean);
    let coverBySessionId = new Map<string, string>();
    if (sessionIds.length > 0) {
      const { data: turnRows, error: turnError } = await database
        .from('image_creation_turns')
        .select('session_id, generation_ids, created_at')
        .eq('user_id', userId)
        .in('session_id', sessionIds)
        .order('created_at', { ascending: false });
      if (turnError) {
        return moodboardJson(request, { error: turnError.message }, 500);
      }
      coverBySessionId = getLatestSessionGenerationIds(turnRows || []);
    }
    return moodboardJson(request, {
      sessions: sessionRows.map((row) => formatSession(row, coverBySessionId))
    });
  }
  if (request.method === 'POST') {
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const firstPrompt = sanitizeText(body?.firstPrompt, 12000);
    const mediaType = body?.mediaType === 'video' ? 'video' : 'image';
    const legacyTitle = sanitizeText(body?.title, 160);
    const { data, error } = await database
      .from('image_creation_sessions')
      .insert({
        user_id: userId,
        title: deriveImageSessionTitle(
          firstPrompt,
          legacyTitle || '未命名创作'
        ),
        metadata: {
          ...(body?.metadata && typeof body.metadata === 'object'
            ? body.metadata
            : {}),
          mediaType
        }
      })
      .select(
        'id, title, status, metadata, last_turn_at, created_at, updated_at'
      )
      .single();
    if (error) return moodboardJson(request, { error: error.message }, 500);
    return moodboardJson(request, { session: formatSession(data) }, 201);
  }
  return moodboardJson(request, { error: 'Method not allowed' }, 405);
}
