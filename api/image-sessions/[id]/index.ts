import { getUserIdFromRequest } from '../../utils/auth.js';
import {
  moodboardDatabase,
  moodboardJson,
  moodboardOptions
} from '../../moodboards/shared.js';

export const config = { runtime: 'edge' };

export function getImageSessionId(request: Request): string {
  const pathname = new URL(request.url).pathname;
  const match = pathname.match(/\/api\/image-sessions\/([^/]+)$/);
  return decodeURIComponent(match?.[1] || '').trim();
}

export default async function handler(request: Request): Promise<Response> {
  const options = moodboardOptions(request);
  if (options) return options;

  const userId = await getUserIdFromRequest(request);
  if (!userId) return moodboardJson(request, { error: '请先登录' }, 401);

  const sessionId = getImageSessionId(request);
  if (!sessionId)
    return moodboardJson(request, { error: '无效的创作会话' }, 400);

  const database = moodboardDatabase(request);
  if (database instanceof Response) return database;

  if (request.method !== 'DELETE') {
    return moodboardJson(request, { error: 'Method not allowed' }, 405);
  }

  const { data: ownedSession, error: lookupError } = await database
    .from('image_creation_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();
  if (lookupError)
    return moodboardJson(request, { error: lookupError.message }, 500);
  if (!ownedSession)
    return moodboardJson(request, { error: '创作会话不存在' }, 404);

  const { error } = await database
    .from('image_creation_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', userId);
  if (error) return moodboardJson(request, { error: error.message }, 500);

  return moodboardJson(request, { deleted: true, sessionId });
}
