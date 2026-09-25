import { getUserIdFromRequest } from '../../utils/auth.js';
import {
  moodboardDatabase,
  moodboardJson,
  moodboardOptions,
  sanitizeStringList,
  sanitizeText
} from '../../moodboards/shared.js';
import type {
  ImageCreationContext,
  MoodboardConditioning
} from '../../../src/shared/create-workspace-v2.js';
import {
  reconcileImageSessionTaskTurns,
  toImageSessionErrorMessage
} from '../task-turns.js';

export const config = { runtime: 'edge' };

function sanitizeBoundedStringList(
  value: unknown,
  limit: number,
  itemMaxLength: number
): string[] {
  return sanitizeStringList(value, limit)
    .map((item) => sanitizeText(item, itemMaxLength))
    .filter(Boolean);
}

function formatTurn(row: Record<string, unknown>) {
  return {
    id: row.id,
    sessionId: row.session_id,
    prompt: row.prompt,
    negativePrompt: row.negative_prompt || undefined,
    status: row.status,
    context: row.context,
    generationIds: Array.isArray(row.generation_ids) ? row.generation_ids : [],
    errorMessage: row.error_message || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function sanitizeMoodboardConditioning(
  value: unknown
): MoodboardConditioning | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const moodboardId = sanitizeText(record.moodboardId, 80);
  const shareToken = sanitizeText(record.shareToken, 120);
  const tasteProfile = sanitizeText(record.tasteProfile, 2000);
  const analysisVersion =
    typeof record.analysisVersion === 'number' &&
    Number.isInteger(record.analysisVersion) &&
    record.analysisVersion > 0
      ? record.analysisVersion
      : 0;
  if (!moodboardId || !tasteProfile || analysisVersion < 1) return undefined;
  return {
    moodboardId,
    ...(shareToken ? { shareToken } : {}),
    analysisVersion,
    tasteProfile,
    keywords: sanitizeBoundedStringList(record.keywords, 16, 120),
    avoids: sanitizeBoundedStringList(record.avoids, 16, 240),
    guidelines: sanitizeBoundedStringList(record.guidelines, 16, 320),
    representativeAssetIds: sanitizeBoundedStringList(
      record.representativeAssetIds,
      4,
      120
    )
  };
}

export default async function handler(request: Request): Promise<Response> {
  const options = moodboardOptions(request);
  if (options) return options;
  if (!['GET', 'POST'].includes(request.method)) {
    return moodboardJson(request, { error: 'Method not allowed' }, 405);
  }
  const userId = await getUserIdFromRequest(request);
  if (!userId) return moodboardJson(request, { error: '请先登录' }, 401);
  const pathname = new URL(request.url).pathname;
  const sessionId = decodeURIComponent(
    pathname.match(/\/api\/image-sessions\/([^/]+)\/turns/)?.[1] || ''
  );
  const database = moodboardDatabase(request);
  if (database instanceof Response) return database;
  const { data: session } = await database
    .from('image_creation_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!session) return moodboardJson(request, { error: '会话不存在' }, 404);
  if (request.method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const rawContext =
      body.context && typeof body.context === 'object'
        ? (body.context as Record<string, unknown>)
        : {};
    const context: ImageCreationContext = {
      ...(sanitizeText(rawContext.recipeId, 120)
        ? { recipeId: sanitizeText(rawContext.recipeId, 120) }
        : {}),
      sessionId,
      referenceAssetIds: sanitizeBoundedStringList(
        rawContext.referenceAssetIds,
        8,
        120
      )
    };
    const moodboard = sanitizeMoodboardConditioning(rawContext.moodboard);
    if (moodboard) context.moodboard = moodboard;
    const taskId = sanitizeText(body.taskId, 80);
    if (taskId) {
      const { data: task, error: taskError } = await database
        .from('image_generation_tasks')
        .select('id')
        .eq('id', taskId)
        .eq('user_id', userId)
        .contains('request_payload', {
          creationContext: { sessionId }
        })
        .maybeSingle();
      if (taskError) {
        return moodboardJson(request, { error: taskError.message }, 500);
      }
      if (!task) {
        return moodboardJson(request, { error: '任务与当前会话不匹配' }, 400);
      }
      context.taskId = taskId;
    }
    const status = ['partial', 'succeeded', 'failed'].includes(
      String(body.status)
    )
      ? String(body.status)
      : 'succeeded';
    const now = new Date().toISOString();
    const { data: mappedTurn, error: mappedTurnError } = taskId
      ? await database
          .from('image_creation_turns')
          .select('id')
          .eq('session_id', sessionId)
          .eq('user_id', userId)
          .contains('context', { taskId })
          .maybeSingle()
      : { data: null, error: null };
    if (mappedTurnError) {
      return moodboardJson(request, { error: mappedTurnError.message }, 500);
    }
    const turnValues = {
      ...(taskId ? { id: mappedTurn?.id || taskId } : {}),
      session_id: sessionId,
      user_id: userId,
      prompt: sanitizeText(body.prompt, 12000),
      negative_prompt: sanitizeText(body.negativePrompt, 6000) || null,
      status,
      context,
      generation_ids: sanitizeBoundedStringList(body.generationIds, 8, 120),
      error_message: toImageSessionErrorMessage(body.errorMessage) || null
    };
    const turnQuery = taskId
      ? database
          .from('image_creation_turns')
          .upsert(turnValues, { onConflict: 'id' })
      : database.from('image_creation_turns').insert(turnValues);
    const { data, error } = await turnQuery
      .select(
        'id, session_id, prompt, negative_prompt, status, context, generation_ids, error_message, created_at, updated_at'
      )
      .single();
    if (error) return moodboardJson(request, { error: error.message }, 500);
    await database
      .from('image_creation_sessions')
      .update({ last_turn_at: now })
      .eq('id', sessionId)
      .eq('user_id', userId);
    return moodboardJson(request, { turn: formatTurn(data) }, 201);
  }

  try {
    await reconcileImageSessionTaskTurns({
      database,
      userId,
      sessionId
    });
  } catch (error) {
    console.warn('[ImageSessionTurns] task reconciliation failed', {
      sessionId,
      userId,
      message: error instanceof Error ? error.message : String(error)
    });
  }

  const { data, error } = await database
    .from('image_creation_turns')
    .select(
      'id, session_id, prompt, negative_prompt, status, context, generation_ids, error_message, created_at, updated_at'
    )
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) return moodboardJson(request, { error: error.message }, 500);
  return moodboardJson(request, { turns: (data || []).map(formatTurn) });
}
