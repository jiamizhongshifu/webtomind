import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getCorsHeadersForRequest } from '../../utils/auth';
import { assertPromptCaseAdmin } from '../prompt-case-auth';

export const config = { runtime: 'edge' };

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const SIGNED_UPLOAD_EXPIRES_IN = 60 * 60 * 2;

function getPromptCaseBucket() {
  return (
    process.env.PROMPT_CASE_BUCKET ||
    process.env.PROMPT_ASSET_BUCKET ||
    'generated-images'
  );
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
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('gif')) return 'gif';
  if (mimeType.includes('heic')) return 'heic';
  if (mimeType.includes('heif')) return 'heif';
  return 'png';
}

function createPromptCaseFilePath(userId: string | undefined, mimeType: string) {
  const ext = detectExtension(mimeType);
  const date = new Date();
  const month = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const random = Math.random().toString(36).slice(2, 10);
  return `prompt-case-covers/${userId || 'admin'}/${month}/${Date.now()}-${random}.${ext}`;
}

function getPromptCasePublicUrl(
  supabase: SupabaseClient,
  filePath: string
) {
  const { data: publicData } = supabase.storage
    .from(getPromptCaseBucket())
    .getPublicUrl(filePath);
  return publicData?.publicUrl || '';
}

async function createSignedUploadUrl(input: {
  supabaseUrl: string;
  supabaseKey: string;
  filePath: string;
}) {
  const endpoint = `${input.supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/upload/sign/${getPromptCaseBucket()}/${input.filePath}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: input.supabaseKey,
      Authorization: `Bearer ${input.supabaseKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ expiresIn: SIGNED_UPLOAD_EXPIRES_IN })
  });
  const result = (await response.json().catch(() => ({}))) as {
    url?: string;
    error?: string;
    message?: string;
  };
  if (!response.ok || !result.url) {
    throw new Error(
      result.error || result.message || 'Failed to create signed upload URL'
    );
  }
  return result.url.startsWith('http')
    ? result.url
    : `${input.supabaseUrl.replace(/\/+$/, '')}/storage/v1${result.url}`;
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
  }

  const admin = await assertPromptCaseAdmin(request);
  if (!admin.ok) {
    return jsonResponse(
      { error: admin.error || 'Prompt case admin access required' },
      corsHeaders,
      admin.status
    );
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse(
      { error: 'Supabase admin is not configured' },
      corsHeaders,
      500
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    imageBase64?: string;
    mimeType?: string;
    fileSizeBytes?: number;
    uploadMode?: 'base64' | 'signed-url';
  };

  if (body.uploadMode === 'signed-url') {
    const mimeType = body.mimeType || 'image/png';
    if (!mimeType.startsWith('image/')) {
      return jsonResponse({ error: '仅支持图片格式' }, corsHeaders, 400);
    }
    const fileSizeBytes = Number(body.fileSizeBytes || 0);
    if (fileSizeBytes > MAX_IMAGE_BYTES) {
      return jsonResponse(
        {
          error: `图片超过 ${Math.floor(MAX_IMAGE_BYTES / 1024 / 1024)}MB 大小限制`
        },
        corsHeaders,
        413
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const filePath = createPromptCaseFilePath(admin.userId, mimeType);
    try {
      const uploadUrl = await createSignedUploadUrl({
        supabaseUrl,
        supabaseKey,
        filePath
      });
      const imageUrl = getPromptCasePublicUrl(supabase, filePath);
      return jsonResponse(
        {
          success: true,
          uploadMode: 'signed-url',
          uploadUrl,
          imageUrl,
          filePath,
          bucket: getPromptCaseBucket(),
          expiresIn: SIGNED_UPLOAD_EXPIRES_IN
        },
        corsHeaders
      );
    } catch (signError) {
      console.error('[PromptCaseUpload] signed upload URL failed:', signError);
      return jsonResponse(
        {
          error:
            signError instanceof Error
              ? `图片上传签名失败: ${signError.message}`
              : '图片上传签名失败'
        },
        corsHeaders,
        500
      );
    }
  }

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
  const filePath = createPromptCaseFilePath(admin.userId, mimeType);

  const binary = atob(parsed.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  const { error: uploadError } = await supabase.storage
    .from(getPromptCaseBucket())
    .upload(filePath, bytes, {
      contentType: mimeType,
      cacheControl: '31536000',
      upsert: false
    });

  if (uploadError) {
    console.error('[PromptCaseUpload] upload failed:', uploadError);
    return jsonResponse(
      { error: `图片上传失败: ${uploadError.message}` },
      corsHeaders,
      500
    );
  }

  const imageUrl = getPromptCasePublicUrl(supabase, filePath);
  if (!imageUrl) {
    return jsonResponse(
      { error: '上传成功但无法获取访问 URL' },
      corsHeaders,
      500
    );
  }

  return jsonResponse({ success: true, imageUrl, filePath }, corsHeaders);
}
