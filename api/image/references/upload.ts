import { createClient } from '@supabase/supabase-js';
import {
  getCorsHeadersForRequest,
  getUserIdFromRequest
} from '../../utils/auth';
import type { ImageReferenceRole } from '../../../src/shared/image-reference-types';

export const config = { runtime: 'edge' };

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const SIGNED_URL_EXPIRES_IN = 60 * 60 * 24;
const ALLOWED_ROLES = new Set<ImageReferenceRole>([
  'character',
  'style',
  'pose',
  'scene',
  'product'
]);

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

function parseBase64Payload(value: string): {
  mimeType: string;
  base64: string;
} | null {
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return { mimeType: match[1], base64: match[2] };
  }
  if (/^[A-Za-z0-9+/=]+$/.test(value)) {
    return { mimeType: 'image/png', base64: value };
  }
  return null;
}

function detectExtension(mimeType: string): string {
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('gif')) return 'gif';
  return 'png';
}

function sanitizeRole(value: unknown): ImageReferenceRole {
  return typeof value === 'string' &&
    ALLOWED_ROLES.has(value as ImageReferenceRole)
    ? (value as ImageReferenceRole)
    : 'character';
}

function sanitizeText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function getReferenceBucket(): string {
  return (
    process.env.IMAGE_REFERENCE_BUCKET ||
    process.env.GENERATED_IMAGE_BUCKET ||
    'user-generated-images'
  );
}

function rowToClient(
  row: {
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
  },
  thumbnailUrl: string
) {
  return {
    id: row.id,
    role: row.role,
    label: row.label || 'Reference image',
    description: row.description || undefined,
    thumbnailUrl,
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

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
  }

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return jsonResponse({ error: '请先登录' }, corsHeaders, 401);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse({ error: 'Supabase 未配置' }, corsHeaders, 503);
  }

  const body = (await request.json().catch(() => ({}))) as {
    imageBase64?: string;
    mimeType?: string;
    role?: string;
    label?: string;
    description?: string;
    sourceApp?: string;
  };
  const parsed = parseBase64Payload(body.imageBase64 || '');
  if (!parsed) {
    return jsonResponse({ error: '图片数据格式错误' }, corsHeaders, 400);
  }

  const mimeType = body.mimeType || parsed.mimeType;
  if (!mimeType.startsWith('image/')) {
    return jsonResponse({ error: '仅支持图片格式' }, corsHeaders, 400);
  }

  const estimatedBytes = Math.ceil((parsed.base64.length * 3) / 4);
  if (estimatedBytes > MAX_IMAGE_BYTES) {
    return jsonResponse(
      {
        error: `图片超过 ${Math.floor(MAX_IMAGE_BYTES / 1024 / 1024)}MB 大小限制`
      },
      corsHeaders,
      413
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const referenceBucket = getReferenceBucket();
  const ext = detectExtension(mimeType);
  const date = new Date();
  const month = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const random = Math.random().toString(36).slice(2, 10);
  const filePath = `image-references/${userId}/${month}/${Date.now()}-${random}.${ext}`;
  const binary = atob(parsed.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  const { error: uploadError } = await supabase.storage
    .from(referenceBucket)
    .upload(filePath, bytes, {
      contentType: mimeType,
      cacheControl: '31536000',
      upsert: false
    });
  if (uploadError) {
    console.error('[ImageReferenceUpload] upload failed:', uploadError);
    return jsonResponse(
      { error: `图片上传失败: ${uploadError.message}` },
      corsHeaders,
      500
    );
  }

  const role = sanitizeRole(body.role);
  const sourceApp = sanitizeText(body.sourceApp, 80) || undefined;
  const label =
    sanitizeText(body.label, 80) ||
    (role === 'character' ? '角色参考图' : '参考图');
  const description = sanitizeText(body.description, 500) || null;
  const { data: row, error: insertError } = await supabase
    .from('image_reference_assets')
    .insert({
      user_id: userId,
      storage_bucket: referenceBucket,
      storage_path: filePath,
      mime_type: mimeType,
      file_size_bytes: estimatedBytes,
      role,
      label,
      description,
      metadata: {
        source: sourceApp ? 'create_app_runner' : 'image_create_page',
        sourceApp
      }
    })
    .select(
      'id, role, label, description, storage_bucket, storage_path, mime_type, file_size_bytes, width, height, created_at'
    )
    .single();

  if (insertError || !row) {
    console.error('[ImageReferenceUpload] insert failed:', insertError);
    await supabase.storage.from(referenceBucket).remove([filePath]);
    return jsonResponse(
      { error: '参考图保存失败', detail: insertError?.message || 'unknown' },
      corsHeaders,
      500
    );
  }

  const { data: signed } = await supabase.storage
    .from(referenceBucket)
    .createSignedUrl(filePath, SIGNED_URL_EXPIRES_IN);

  return jsonResponse(
    {
      success: true,
      reference: rowToClient(row, signed?.signedUrl || '')
    },
    corsHeaders
  );
}
