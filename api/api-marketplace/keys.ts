import {
  getBearerToken,
  hashApiKey,
  jsonResponse,
  preflightResponse,
  randomApiKey,
  requireUserContextPublic,
  validateApiKeyName
} from './runtime';

export const config = { runtime: 'edge' };

export default async function handler(request: Request) {
  const preflight = preflightResponse(request);
  if (preflight) return preflight;
  const context = await requireUserContextPublic(request);
  if (!context) return jsonResponse(request, { error: 'Unauthorized' }, 401);

  if (request.method === 'GET') {
    const { data, error } = await context.supabase
      .from('api_keys')
      .select('id,name,key_prefix,status,total_spent_cents,created_at,last_used_at,expires_at')
      .eq('user_id', context.userId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[ApiMarketplace] Key list failed:', error);
      return jsonResponse(request, { error: 'API Key 列表暂时不可用' }, 503);
    }
    return jsonResponse(request, { keys: data || [] });
  }

  if (request.method === 'POST') {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return jsonResponse(request, { error: 'Invalid JSON body' }, 400);
    }
    const nameError = validateApiKeyName(body.name ?? '');
    if (nameError) return jsonResponse(request, { error: nameError }, 400);

    const rawKey = randomApiKey();
    const keyHash = await hashApiKey(rawKey);
    const { data, error } = await context.supabase
      .from('api_keys')
      .insert({
        user_id: context.userId,
        name: String(body.name).trim(),
        key_hash: keyHash,
        key_prefix: rawKey.slice(0, 16),
        status: 'active'
      })
      .select('id,name,key_prefix,status,total_spent_cents,created_at,last_used_at,expires_at')
      .single();
    if (error || !data) {
      console.error('[ApiMarketplace] Key creation failed:', error);
      return jsonResponse(request, { error: 'API Key 创建失败，请稍后重试' }, 503);
    }
    return jsonResponse(request, { key: data, secret: rawKey }, 201);
  }

  if (request.method === 'DELETE') {
    const url = new URL(request.url);
    const keyId = url.searchParams.get('id') || url.searchParams.get('keyId');
    if (!keyId) return jsonResponse(request, { error: 'Missing key id' }, 400);

    const { data: revokeResult, error: revokeError } = await context.supabase.rpc(
      'revoke_api_key',
      {
        p_user_id: context.userId,
        p_key_id: keyId,
        p_metadata: {
          source: 'api_console',
          idempotency_key: `revoke:${keyId}`
        }
      }
    );
    if (revokeError) {
      console.error('[ApiMarketplace] Key revoke failed:', revokeError);
      return jsonResponse(request, { error: 'API Key 吊销失败' }, 503);
    }
    const revoke = (revokeResult || {}) as { ok?: boolean; error?: string };
    if (revoke.ok === false) {
      return jsonResponse(
        request,
        { error: revoke.error || 'API Key not found' },
        revoke.error === 'KEY_NOT_FOUND' ? 404 : 400
      );
    }

    const { data, error } = await context.supabase
      .from('api_keys')
      .select('id,name,key_prefix,status,total_spent_cents,created_at,last_used_at,expires_at')
      .eq('id', keyId)
      .eq('user_id', context.userId)
      .maybeSingle();
    if (error) {
      console.error('[ApiMarketplace] Revoked key lookup failed:', error);
      return jsonResponse(request, { error: 'API Key 更新失败' }, 503);
    }
    if (!data) return jsonResponse(request, { error: 'API Key not found' }, 404);
    return jsonResponse(request, { key: data });
  }

  if (request.method === 'PATCH') {
    const url = new URL(request.url);
    const keyId = url.searchParams.get('id') || url.searchParams.get('keyId');
    if (!keyId) return jsonResponse(request, { error: 'Missing key id' }, 400);
    const { data: current, error: currentError } = await context.supabase
      .from('api_keys')
      .select('status')
      .eq('id', keyId)
      .eq('user_id', context.userId)
      .maybeSingle();
    if (currentError) {
      console.error('[ApiMarketplace] Key status lookup failed:', currentError);
      return jsonResponse(request, { error: 'API Key 更新失败' }, 503);
    }
    if (!current) return jsonResponse(request, { error: 'API Key not found' }, 404);
    if (current.status === 'revoked') {
      return jsonResponse(request, { error: 'Revoked API Key cannot be reactivated' }, 409);
    }

    const { data, error } = await context.supabase
      .from('api_keys')
      .update({ status: 'active' })
      .eq('id', keyId)
      .eq('user_id', context.userId)
      .select('id,name,key_prefix,status,total_spent_cents,created_at,last_used_at,expires_at')
      .maybeSingle();
    if (error) {
      console.error('[ApiMarketplace] Key update failed:', error);
      return jsonResponse(request, { error: 'API Key 更新失败' }, 503);
    }
    if (!data) return jsonResponse(request, { error: 'API Key not found' }, 404);
    return jsonResponse(request, { key: data });
  }

  const token = getBearerToken(request);
  if (!token) return jsonResponse(request, { error: 'Missing Authorization header' }, 401);
  return jsonResponse(request, { error: 'Method not allowed' }, 405);
}
