import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  getCorsHeadersForRequest,
  getUserIdFromRequest
} from '../../utils/auth';

export const config = { runtime: 'edge' };

// 同源鉴权字节接口：按参考图 id 返回图片二进制。
// 供图片编辑/工具页在本地推理前获取原图（R2 直连跨域 fetch 不可用）。
export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  }

  const referenceId = new URL(request.url).searchParams.get('id')?.trim();
  if (!referenceId) {
    return new Response('id is required', { status: 400, headers: corsHeaders });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return new Response('Supabase not configured', { status: 503, headers: corsHeaders });
  }

  const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);
  const { data: row, error: queryError } = await supabase
    .from('image_reference_assets')
    .select('storage_bucket, storage_path, mime_type')
    .eq('id', referenceId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (queryError || !row) {
    return new Response('Reference not found', { status: 404, headers: corsHeaders });
  }

  const { data: blob, error: downloadError } = await supabase.storage
    .from(row.storage_bucket)
    .download(row.storage_path);

  if (downloadError || !blob) {
    console.error('[ImageReferencesBytes] download failed:', {
      id: referenceId,
      error: downloadError
    });
    return new Response('Image download failed', { status: 502, headers: corsHeaders });
  }

  return new Response(blob, {
    status: 200,
    headers: {
      'Content-Type': row.mime_type || 'image/png',
      'Cache-Control': 'private, max-age=60',
      ...corsHeaders
    }
  });
}
