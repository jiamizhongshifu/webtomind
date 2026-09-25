import { getUserIdFromRequest } from '../../utils/auth.js';
import {
  formatMoodboard,
  getMoodboardId,
  getOwnedMoodboard,
  moodboardDatabase,
  moodboardJson,
  moodboardOptions,
  moodboardSelect,
  sanitizeStringList
} from '../shared.js';
import { MOODBOARD_MIN_ANALYSIS_ITEMS } from '../../../src/shared/create-workspace-v2.js';
import {
  analyzePreparedMoodboardImages,
  MoodboardAnalysisError,
  prepareMoodboardImages,
  selectMoodboardAnalysisItems
} from '../visual-analysis.js';

export const config = { runtime: 'edge', maxDuration: 60 };
const ANALYSIS_LEASE_TIMEOUT_MS = 2 * 60 * 1000;

export default async function handler(request: Request): Promise<Response> {
  const options = moodboardOptions(request);
  if (options) return options;
  if (request.method !== 'POST')
    return moodboardJson(request, { error: 'Method not allowed' }, 405);
  const userId = await getUserIdFromRequest(request);
  if (!userId) return moodboardJson(request, { error: '请先登录' }, 401);
  const moodboardId = getMoodboardId(request);
  const database = moodboardDatabase(request);
  if (database instanceof Response) return database;
  const moodboard = await getOwnedMoodboard(database, moodboardId, userId);
  if (!moodboard)
    return moodboardJson(request, { error: '无权分析此 Moodboard' }, 403);
  const items = moodboard.visual_moodboard_items || [];
  if (items.length < MOODBOARD_MIN_ANALYSIS_ITEMS) {
    return moodboardJson(
      request,
      { error: `至少需要 ${MOODBOARD_MIN_ANALYSIS_ITEMS} 张图片才能分析` },
      400
    );
  }

  const expectedVersion = moodboard.analysis_version || 0;
  let claimed = false;
  try {
    // Claim this analysis version before downloading/materializing images. The
    // status predicate makes concurrent requests atomic; only one request can
    // own a version. Reference-only materialization does not invalidate the
    // claim, while semantic item edits still mark it stale.
    const { data: initialClaim, error: analyzingError } = await database
      .from('visual_moodboards')
      .update({
        analysis_status: 'analyzing',
        analysis_error: null,
        analysis_started_at: new Date().toISOString()
      })
      .eq('id', moodboardId)
      .eq('user_id', userId)
      .eq('analysis_version', expectedVersion)
      .neq('analysis_status', 'analyzing')
      .select('id')
      .maybeSingle();
    let analyzing = initialClaim;
    if (analyzingError) throw analyzingError;
    if (!analyzing) {
      // Edge workers can terminate after claiming a board. Reclaim only an
      // expired lease for the same analysis version so a crashed request does
      // not leave the Moodboard permanently stuck in `analyzing`.
      const staleBefore = new Date(
        Date.now() - ANALYSIS_LEASE_TIMEOUT_MS
      ).toISOString();
      const reclaimed = await database
        .from('visual_moodboards')
        .update({
          analysis_status: 'analyzing',
          analysis_error: null,
          analysis_started_at: new Date().toISOString()
        })
        .eq('id', moodboardId)
        .eq('user_id', userId)
        .eq('analysis_version', expectedVersion)
        .eq('analysis_status', 'analyzing')
        .or(
          `analysis_started_at.is.null,analysis_started_at.lt.${staleBefore}`
        )
        .select('id')
        .maybeSingle();
      if (reclaimed.error) throw reclaimed.error;
      analyzing = reclaimed.data;
    }
    if (!analyzing) {
      return moodboardJson(
        request,
        { error: 'Moodboard 正在分析，请等待完成' },
        409
      );
    }
    claimed = true;

    const prepared = await prepareMoodboardImages(database, userId, items);
    const freshMoodboard = await getOwnedMoodboard(
      database,
      moodboardId,
      userId
    );
    if (!freshMoodboard) {
      return moodboardJson(request, { error: 'Moodboard 不存在' }, 404);
    }
    const freshItemIds = selectMoodboardAnalysisItems(
      freshMoodboard.visual_moodboard_items || []
    ).map((item) => item.id);
    if (
      freshItemIds.length !== prepared.length ||
      freshItemIds.some((id, index) => id !== prepared[index]?.item.id)
    ) {
      await database
        .from('visual_moodboards')
        .update({
          analysis_status: 'stale',
          analysis_error: null,
          analysis_started_at: null
        })
        .eq('id', moodboardId)
        .eq('user_id', userId)
        .eq('analysis_version', expectedVersion)
        .eq('analysis_status', 'analyzing');
      return moodboardJson(
        request,
        { error: 'Moodboard 已变化，请重新分析' },
        409
      );
    }

    const analysis = await analyzePreparedMoodboardImages(prepared);
    const now = new Date().toISOString();
    const { data, error } = await database
      .from('visual_moodboards')
      .update({
        analysis_status: 'ready',
        taste_profile: analysis.tasteProfile,
        keywords: sanitizeStringList(analysis.keywords),
        avoids: analysis.avoids,
        guidelines: analysis.guidelines,
        representative_asset_ids: analysis.representativeAssetIds,
        analysis_version: expectedVersion + 1,
        analysis_error: null,
        analysis_started_at: null,
        analyzed_at: now
      })
      .eq('id', moodboardId)
      .eq('user_id', userId)
      .eq('analysis_version', expectedVersion)
      .eq('analysis_status', 'analyzing')
      .select(moodboardSelect)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return moodboardJson(
        request,
        { error: 'Moodboard 已变化，请重新分析' },
        409
      );
    }
    return moodboardJson(request, {
      moodboard: formatMoodboard(data as never, userId)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '分析失败';
    let failedUpdate = database
      .from('visual_moodboards')
      .update({
        analysis_status: 'failed',
        analysis_error: message.slice(0, 1200),
        analysis_started_at: null
      })
      .eq('id', moodboardId)
      .eq('user_id', userId)
      .eq('analysis_version', expectedVersion);
    if (claimed) failedUpdate = failedUpdate.eq('analysis_status', 'analyzing');
    await failedUpdate;
    return moodboardJson(
      request,
      { error: message },
      error instanceof MoodboardAnalysisError ? error.status : 500
    );
  }
}
