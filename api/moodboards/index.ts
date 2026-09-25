import { getUserIdFromRequest } from '../utils/auth.js';
import {
  formatMoodboard,
  moodboardDatabase,
  moodboardJson,
  moodboardOptions,
  moodboardSelect,
  sanitizeText
} from './shared.js';
import {
  buildClientPresetCopyFields,
  buildClientPresetCopyItems,
  buildMoodboardCopyFields,
  buildMoodboardCopyItems
} from './copy.js';

export const config = { runtime: 'edge' };

export function getMoodboardListVisibilityFilter(
  userId: string | null
): string {
  return userId
    ? `user_id.eq.${userId},is_official.eq.true,visibility.eq.public`
    : 'is_official.eq.true,visibility.eq.public';
}

async function findExistingCopy(
  database: ReturnType<typeof moodboardDatabase>,
  userId: string,
  sourceMoodboardId: string
) {
  if (database instanceof Response) return { data: null, error: null };
  return database
    .from('visual_moodboards')
    .select(moodboardSelect)
    .eq('user_id', userId)
    .eq('source_moodboard_id', sourceMoodboardId)
    .maybeSingle();
}

export default async function handler(request: Request): Promise<Response> {
  const options = moodboardOptions(request);
  if (options) return options;
  const userId = await getUserIdFromRequest(request);
  const database = moodboardDatabase(request);
  if (database instanceof Response) return database;

  if (request.method === 'GET') {
    const { data, error } = await database
      .from('visual_moodboards')
      .select(moodboardSelect)
      .or(getMoodboardListVisibilityFilter(userId))
      .order('is_official', { ascending: true })
      .order('updated_at', { ascending: false });
    if (error) return moodboardJson(request, { error: error.message }, 500);
    return moodboardJson(request, {
      moodboards: (data || []).map((row) =>
        formatMoodboard(row as never, userId || undefined)
      )
    });
  }

  if (!userId) return moodboardJson(request, { error: '请先登录' }, 401);

  if (request.method === 'POST') {
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const sourceMoodboardId = sanitizeText(body?.sourceMoodboardId, 80);
    const sourceShareToken = sanitizeText(body?.sourceShareToken, 120);
    const clientPreset = buildClientPresetCopyFields(body?.presetSnapshot);
    if (sourceMoodboardId && clientPreset) {
      return moodboardJson(
        request,
        { error: 'Moodboard 来源参数不能同时使用' },
        400
      );
    }
    let source: Record<string, unknown> | null = null;
    if (sourceMoodboardId) {
      const existing = await findExistingCopy(
        database,
        userId,
        sourceMoodboardId
      );
      if (existing.error)
        return moodboardJson(request, { error: existing.error.message }, 500);
      if (existing.data) {
        return moodboardJson(request, {
          moodboard: formatMoodboard(existing.data as never, userId)
        });
      }

      let shareAllowsCopy = false;
      if (sourceShareToken) {
        const { data: share, error: shareError } = await database
          .from('visual_moodboard_shares')
          .select('moodboard_id, expires_at')
          .eq('token', sourceShareToken)
          .eq('moodboard_id', sourceMoodboardId)
          .is('revoked_at', null)
          .maybeSingle();
        if (shareError)
          return moodboardJson(request, { error: shareError.message }, 500);
        shareAllowsCopy = Boolean(
          share &&
          (!share.expires_at ||
            new Date(share.expires_at).getTime() > Date.now())
        );
      }
      let sourceQuery = database
        .from('visual_moodboards')
        .select(moodboardSelect)
        .eq('id', sourceMoodboardId);
      if (!shareAllowsCopy) {
        sourceQuery = sourceQuery.or(
          'is_official.eq.true,visibility.eq.public'
        );
      }
      const { data: sourceData, error: sourceError } =
        await sourceQuery.maybeSingle();
      if (sourceError)
        return moodboardJson(request, { error: sourceError.message }, 500);
      source = sourceData as Record<string, unknown> | null;
      if (!source)
        return moodboardJson(request, { error: '源 Moodboard 不可复制' }, 404);
    }
    const name =
      sanitizeText(body?.name, 120) || sanitizeText(source?.name, 120);
    if (!name)
      return moodboardJson(request, { error: '请输入 Moodboard 名称' }, 400);
    const copyAnalysisFields = source
      ? buildMoodboardCopyFields(source)
      : clientPreset?.analysis || null;
    const insertPayload = {
      user_id: userId,
      name,
      description:
        sanitizeText(body?.description, 600) ||
        sanitizeText(source?.description, 600) ||
        null,
      visibility: 'private',
      is_official: false,
      source_moodboard_id: sourceMoodboardId || null
    };
    const { data, error } = await database
      .from('visual_moodboards')
      .insert(insertPayload)
      .select(moodboardSelect)
      .single();
    if (error) {
      if (sourceMoodboardId && error.code === '23505') {
        const existing = await findExistingCopy(
          database,
          userId,
          sourceMoodboardId
        );
        if (existing.data) {
          return moodboardJson(request, {
            moodboard: formatMoodboard(existing.data as never, userId)
          });
        }
      }
      return moodboardJson(request, { error: error.message }, 500);
    }
    const sourceItems = Array.isArray(source?.visual_moodboard_items)
      ? source.visual_moodboard_items.filter(
          (item): item is Record<string, unknown> =>
            Boolean(item && typeof item === 'object')
        )
      : [];
    const copiedItems = clientPreset
      ? buildClientPresetCopyItems(
          data.id,
          clientPreset.presetKey,
          clientPreset.items
        )
      : buildMoodboardCopyItems(sourceMoodboardId, data.id, sourceItems);
    if (copiedItems.length > 0) {
      const { error: copyError } = await database
        .from('visual_moodboard_items')
        .insert(copiedItems);
      if (copyError) {
        await database.from('visual_moodboards').delete().eq('id', data.id);
        return moodboardJson(request, { error: copyError.message }, 500);
      }
    }
    // Item inserts intentionally invalidate analysis. Restore a copied ready
    // analysis only after the complete source snapshot has been materialized.
    if (copyAnalysisFields?.analysis_status === 'ready') {
      const { error: analysisCopyError } = await database
        .from('visual_moodboards')
        .update(copyAnalysisFields)
        .eq('id', data.id);
      if (analysisCopyError) {
        await database.from('visual_moodboards').delete().eq('id', data.id);
        return moodboardJson(
          request,
          { error: analysisCopyError.message },
          500
        );
      }
    }
    const { data: created, error: reloadError } = await database
      .from('visual_moodboards')
      .select(moodboardSelect)
      .eq('id', data.id)
      .single();
    if (reloadError)
      return moodboardJson(request, { error: reloadError.message }, 500);
    return moodboardJson(
      request,
      { moodboard: formatMoodboard(created as never, userId) },
      201
    );
  }

  return moodboardJson(request, { error: 'Method not allowed' }, 405);
}
