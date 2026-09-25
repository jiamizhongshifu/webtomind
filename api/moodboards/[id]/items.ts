import { getUserIdFromRequest } from '../../utils/auth.js';
import {
  formatMoodboard,
  getMoodboardId,
  getOwnedMoodboard,
  moodboardDatabase,
  moodboardJson,
  moodboardOptions,
  moodboardSelect,
  sanitizeItemSource,
  sanitizeText
} from '../shared.js';
import { MOODBOARD_MAX_ITEMS } from '../../../src/shared/create-workspace-v2.js';
import { isCompleteMoodboardItemOrder } from '../item-order.js';

function uniqueIds(values: Array<string | null>): string[] {
  return Array.from(new Set(values.filter((id): id is string => Boolean(id))));
}

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  const options = moodboardOptions(request);
  if (options) return options;
  if (!['POST', 'PATCH', 'DELETE'].includes(request.method)) {
    return moodboardJson(request, { error: 'Method not allowed' }, 405);
  }
  const userId = await getUserIdFromRequest(request);
  if (!userId) return moodboardJson(request, { error: '请先登录' }, 401);
  const moodboardId = getMoodboardId(request);
  const database = moodboardDatabase(request);
  if (database instanceof Response) return database;
  const moodboard = await getOwnedMoodboard(database, moodboardId, userId);
  if (!moodboard)
    return moodboardJson(request, { error: '无权修改此 Moodboard' }, 403);

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (request.method === 'DELETE') {
    const itemId = sanitizeText(body?.itemId, 80);
    if (!itemId) return moodboardJson(request, { error: '缺少图片 ID' }, 400);
    const { error } = await database
      .from('visual_moodboard_items')
      .delete()
      .eq('id', itemId)
      .eq('moodboard_id', moodboardId);
    if (error) return moodboardJson(request, { error: error.message }, 500);
  } else if (request.method === 'PATCH') {
    const order = Array.isArray(body?.itemIds)
      ? body.itemIds
          .filter((id): id is string => typeof id === 'string')
          .map((id) => id.trim())
          .filter(Boolean)
          .slice(0, MOODBOARD_MAX_ITEMS)
      : [];
    if (order.length === 0)
      return moodboardJson(request, { error: '缺少排序数据' }, 400);
    const currentIds = (moodboard.visual_moodboard_items || []).map(
      (item) => item.id
    );
    if (!isCompleteMoodboardItemOrder(order, currentIds)) {
      return moodboardJson(
        request,
        { error: '排序数据必须完整且不能包含重复图片' },
        400
      );
    }
    const results = await Promise.all(
      order.map((itemId, index) =>
        database
          .from('visual_moodboard_items')
          .update({ sort_order: index })
          .eq('id', itemId)
          .eq('moodboard_id', moodboardId)
      )
    );
    const failed = results.find((result) => result.error)?.error;
    if (failed) return moodboardJson(request, { error: failed.message }, 500);
  } else {
    const rawItems = Array.isArray(body?.items)
      ? body.items
      : body
        ? [body]
        : [];
    if (rawItems.length === 0)
      return moodboardJson(request, { error: '请选择图片' }, 400);
    const currentCount = moodboard.visual_moodboard_items?.length || 0;
    if (currentCount + rawItems.length > MOODBOARD_MAX_ITEMS) {
      return moodboardJson(
        request,
        { error: `每个 Moodboard 最多 ${MOODBOARD_MAX_ITEMS} 张图片` },
        400
      );
    }

    const inserts = rawItems
      .filter((value): value is Record<string, unknown> =>
        Boolean(value && typeof value === 'object')
      )
      .map((value, index) => ({
        moodboard_id: moodboardId,
        source: sanitizeItemSource(value.source),
        image_url: sanitizeText(value.imageUrl, 4096),
        title: sanitizeText(value.title, 180) || null,
        prompt: sanitizeText(value.prompt, 6000) || null,
        image_reference_id: sanitizeText(value.imageReferenceId, 80) || null,
        media_object_id: sanitizeText(value.mediaObjectId, 80) || null,
        image_generation_id: sanitizeText(value.imageGenerationId, 80) || null,
        prompt_case_id: sanitizeText(value.promptCaseId, 80) || null,
        sort_order: currentCount + index,
        is_representative: currentCount + index < 4,
        // External callers cannot persist arbitrary JSON. Source-specific
        // identifiers above are the supported provenance contract.
        metadata: {}
      }))
      .filter((item) => Boolean(item.image_url));
    if (inserts.length === 0)
      return moodboardJson(request, { error: '图片地址无效' }, 400);

    const referenceIds = uniqueIds(
      inserts.map((item) => item.image_reference_id)
    );
    if (referenceIds.length > 0) {
      const { data: ownedReferences, error: referenceError } = await database
        .from('image_reference_assets')
        .select('id')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .in('id', referenceIds);
      if (referenceError) {
        return moodboardJson(request, { error: referenceError.message }, 500);
      }
      if ((ownedReferences || []).length !== referenceIds.length) {
        return moodboardJson(request, { error: '参考图不存在或无权使用' }, 403);
      }
    }

    const mediaObjectIds = uniqueIds(
      inserts.map((item) => item.media_object_id)
    );
    if (mediaObjectIds.length > 0) {
      const { data: ownedMedia, error: mediaError } = await database
        .from('media_objects')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'ready')
        .in('id', mediaObjectIds);
      if (mediaError) {
        return moodboardJson(request, { error: mediaError.message }, 500);
      }
      if ((ownedMedia || []).length !== mediaObjectIds.length) {
        return moodboardJson(
          request,
          { error: '媒体素材不存在或无权使用' },
          403
        );
      }
    }

    const generationIds = uniqueIds(
      inserts.map((item) => item.image_generation_id)
    );
    if (generationIds.length > 0) {
      const { data: ownedGenerations, error: generationError } = await database
        .from('image_generations')
        .select('id')
        .eq('user_id', userId)
        .in('id', generationIds);
      if (generationError) {
        return moodboardJson(request, { error: generationError.message }, 500);
      }
      if ((ownedGenerations || []).length !== generationIds.length) {
        return moodboardJson(
          request,
          { error: '生成记录不存在或无权使用' },
          403
        );
      }
    }

    const promptCaseIds = uniqueIds(inserts.map((item) => item.prompt_case_id));
    if (promptCaseIds.length > 0) {
      const { data: publishedCases, error: promptCaseError } = await database
        .from('prompt_cases')
        .select('id')
        .eq('is_published', true)
        .is('deleted_at', null)
        .in('id', promptCaseIds);
      if (promptCaseError) {
        return moodboardJson(request, { error: promptCaseError.message }, 500);
      }
      if ((publishedCases || []).length !== promptCaseIds.length) {
        return moodboardJson(
          request,
          { error: 'Prompt 案例已下架或不可用' },
          422
        );
      }
    }

    const { error } = await database
      .from('visual_moodboard_items')
      .insert(inserts);
    if (error) return moodboardJson(request, { error: error.message }, 500);
  }
  const { data, error: reloadError } = await database
    .from('visual_moodboards')
    .select(moodboardSelect)
    .eq('id', moodboardId)
    .single();
  if (reloadError)
    return moodboardJson(request, { error: reloadError.message }, 500);
  return moodboardJson(
    request,
    { moodboard: formatMoodboard(data as never, userId) },
    201
  );
}
