import { getUserIdFromRequest } from '../../utils/auth.js';
import {
  getMoodboardId,
  getOwnedMoodboard,
  moodboardDatabase,
  moodboardJson,
  moodboardOptions
} from '../shared.js';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  const options = moodboardOptions(request);
  if (options) return options;
  const userId = await getUserIdFromRequest(request);
  if (!userId) return moodboardJson(request, { error: '请先登录' }, 401);
  const moodboardId = getMoodboardId(request);
  const database = moodboardDatabase(request);
  if (database instanceof Response) return database;
  const moodboard = await getOwnedMoodboard(database, moodboardId, userId);
  if (!moodboard)
    return moodboardJson(request, { error: '无权分享此 Moodboard' }, 403);

  if (request.method === 'POST') {
    const { data: existing } = await database
      .from('visual_moodboard_shares')
      .select('token')
      .eq('moodboard_id', moodboardId)
      .is('revoked_at', null)
      .maybeSingle();
    if (existing?.token)
      return moodboardJson(request, { token: existing.token });
    const { data, error } = await database
      .from('visual_moodboard_shares')
      .insert({ moodboard_id: moodboardId, user_id: userId })
      .select('token')
      .single();
    if (error) return moodboardJson(request, { error: error.message }, 500);
    return moodboardJson(request, { token: data.token }, 201);
  }

  if (request.method === 'DELETE') {
    const { error } = await database
      .from('visual_moodboard_shares')
      .update({ revoked_at: new Date().toISOString() })
      .eq('moodboard_id', moodboardId)
      .eq('user_id', userId)
      .is('revoked_at', null);
    if (error) return moodboardJson(request, { error: error.message }, 500);
    return moodboardJson(request, { revoked: true });
  }
  return moodboardJson(request, { error: 'Method not allowed' }, 405);
}
