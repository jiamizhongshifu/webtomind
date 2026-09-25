import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  getCorsHeadersForRequest,
  getUserIdFromRequest
} from '../../utils/auth';

export const config = { runtime: 'edge' };

const SIGNED_URL_EXPIRES_IN = 60 * 60 * 24;

interface ImageReferenceRow {
  id: string;
  role: string;
  label: string | null;
  description: string | null;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  file_size_bytes: number | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

function jsonResponse(
  data: unknown,
  corsHeaders: Record<string, string>,
  status = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

async function rowToClient(supabase: SupabaseClient, row: ImageReferenceRow) {
  const { data, error } = await supabase.storage
    .from(row.storage_bucket)
    .createSignedUrl(row.storage_path, SIGNED_URL_EXPIRES_IN);

  if (error) {
    console.error('[ImageReferences] signed URL failed:', {
      id: row.id,
      storageBucket: row.storage_bucket,
      storagePath: row.storage_path,
      error
    });
  }

  return {
    id: row.id,
    role: row.role,
    label: row.label || 'Reference image',
    description: row.description || undefined,
    thumbnailUrl: data?.signedUrl || '',
    thumbnailUrlExpiresIn: SIGNED_URL_EXPIRES_IN,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes || undefined,
    width: row.width || undefined,
    height: row.height || undefined,
    createdAt: row.created_at
  };
}

async function listReferences(
  supabase: SupabaseClient,
  userId: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { data, error } = await supabase
    .from('image_reference_assets')
    .select(
      'id, role, label, description, storage_bucket, storage_path, mime_type, file_size_bytes, width, height, created_at'
    )
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(80);

  if (error) {
    console.error('[ImageReferences] list failed:', error);
    return jsonResponse(
      { error: '参考图加载失败', references: [] },
      corsHeaders,
      500
    );
  }

  const references = await Promise.all(
    ((data || []) as ImageReferenceRow[]).map((row) =>
      rowToClient(supabase, row)
    )
  );
  return jsonResponse({ references }, corsHeaders);
}

async function deleteReference(
  supabase: SupabaseClient,
  userId: string,
  referenceId: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { error } = await supabase
    .from('image_reference_assets')
    .update({
      deleted_at: new Date().toISOString()
    })
    .eq('id', referenceId)
    .eq('user_id', userId)
    .is('deleted_at', null);

  if (error) {
    console.error('[ImageReferences] delete failed:', error);
    return jsonResponse({ error: '参考图删除失败' }, corsHeaders, 500);
  }

  return jsonResponse({ success: true, id: referenceId }, corsHeaders);
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'GET' && request.method !== 'DELETE') {
    return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
  }

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return jsonResponse(
      { error: '请先登录', references: [] },
      corsHeaders,
      401
    );
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse(
      { error: 'Supabase 未配置', references: [] },
      corsHeaders,
      503
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  if (request.method === 'DELETE') {
    const referenceId = new URL(request.url).searchParams.get('id')?.trim();
    if (!referenceId) {
      return jsonResponse({ error: 'id is required' }, corsHeaders, 400);
    }
    return deleteReference(supabase, userId, referenceId, corsHeaders);
  }

  return listReferences(supabase, userId, corsHeaders);
}
