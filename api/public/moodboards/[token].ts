import {
  formatMoodboard,
  moodboardDatabase,
  moodboardJson,
  moodboardOptions,
  moodboardSelect
} from '../../moodboards/shared.js';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  const options = moodboardOptions(request);
  if (options) return options;
  if (request.method !== 'GET')
    return moodboardJson(request, { error: 'Method not allowed' }, 405);
  const token = decodeURIComponent(
    new URL(request.url).pathname.split('/').pop() || ''
  ).trim();
  const database = moodboardDatabase(request);
  if (database instanceof Response) return database;
  const { data: share, error: shareError } = await database
    .from('visual_moodboard_shares')
    .select('moodboard_id, token, revoked_at, expires_at')
    .eq('token', token)
    .is('revoked_at', null)
    .maybeSingle();
  if (shareError)
    return moodboardJson(request, { error: shareError.message }, 500);
  if (
    !share ||
    (share.expires_at && new Date(share.expires_at).getTime() <= Date.now())
  ) {
    return moodboardJson(request, { error: '分享链接无效或已撤销' }, 404);
  }
  const { data, error } = await database
    .from('visual_moodboards')
    .select(moodboardSelect)
    .eq('id', share.moodboard_id)
    .eq('moderation_status', 'active')
    .single();
  if (error)
    return moodboardJson(
      request,
      { error: error.message },
      error.code === 'PGRST116' ? 404 : 500
    );
  return moodboardJson(request, {
    moodboard: formatMoodboard(data as never, undefined, token)
  });
}
