import { getUserIdFromRequest } from '../utils/auth.js';
import {
  formatMoodboard,
  getMoodboardId,
  getOwnedMoodboard,
  moodboardDatabase,
  moodboardJson,
  moodboardOptions,
  moodboardSelect,
  sanitizeStringList,
  sanitizeText,
  sanitizeVisibility
} from './shared.js';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  const options = moodboardOptions(request);
  if (options) return options;
  const userId = await getUserIdFromRequest(request);
  if (!userId) return moodboardJson(request, { error: '请先登录' }, 401);
  const moodboardId = getMoodboardId(request);
  if (!moodboardId)
    return moodboardJson(request, { error: '无效 Moodboard' }, 400);
  const database = moodboardDatabase(request);
  if (database instanceof Response) return database;

  if (request.method === 'GET') {
    const { data, error } = await database
      .from('visual_moodboards')
      .select(moodboardSelect)
      .eq('id', moodboardId)
      .maybeSingle();
    if (error) return moodboardJson(request, { error: error.message }, 500);
    if (!data)
      return moodboardJson(request, { error: 'Moodboard 不存在' }, 404);
    const row = data as unknown as {
      user_id: string | null;
      is_official: boolean;
      visibility: string;
    };
    if (
      row.user_id !== userId &&
      !row.is_official &&
      row.visibility !== 'public'
    ) {
      return moodboardJson(request, { error: '无权访问' }, 403);
    }
    return moodboardJson(request, {
      moodboard: formatMoodboard(data as never, userId)
    });
  }

  const owned = await getOwnedMoodboard(database, moodboardId, userId);
  if (!owned)
    return moodboardJson(request, { error: '无权修改此 Moodboard' }, 403);

  if (request.method === 'PATCH') {
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const update: Record<string, unknown> = {};
    if (body && 'name' in body) {
      const name = sanitizeText(body.name, 120);
      if (!name) return moodboardJson(request, { error: '名称不能为空' }, 400);
      update.name = name;
    }
    if (body && 'description' in body)
      update.description = sanitizeText(body.description, 600) || null;
    if (body && 'guidelines' in body)
      update.guidelines = sanitizeStringList(body.guidelines, 12).map((item) =>
        item.slice(0, 300)
      );
    if (body && 'visibility' in body) {
      const visibility = sanitizeVisibility(body.visibility);
      update.visibility = visibility;
      update.published_at =
        visibility === 'public' ? new Date().toISOString() : null;
    }
    if (body && 'coverItemId' in body) {
      const coverItemId = sanitizeText(body.coverItemId, 80);
      if (
        coverItemId &&
        !owned.visual_moodboard_items?.some((item) => item.id === coverItemId)
      ) {
        return moodboardJson(
          request,
          { error: '封面图片不属于此 Moodboard' },
          400
        );
      }
      update.cover_item_id = coverItemId || null;
    }
    if (Object.keys(update).length === 0) {
      return moodboardJson(request, { error: '没有可更新的字段' }, 400);
    }
    const { data, error } = await database
      .from('visual_moodboards')
      .update(update)
      .eq('id', moodboardId)
      .eq('user_id', userId)
      .select(moodboardSelect)
      .single();
    if (error) return moodboardJson(request, { error: error.message }, 500);
    return moodboardJson(request, {
      moodboard: formatMoodboard(data as never, userId)
    });
  }

  if (request.method === 'DELETE') {
    const { error } = await database
      .from('visual_moodboards')
      .delete()
      .eq('id', moodboardId)
      .eq('user_id', userId);
    if (error) return moodboardJson(request, { error: error.message }, 500);
    return moodboardJson(request, { deleted: true });
  }

  return moodboardJson(request, { error: 'Method not allowed' }, 405);
}
