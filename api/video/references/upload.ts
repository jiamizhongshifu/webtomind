import {
  getCorsHeadersForRequest,
  getSupabaseAdmin,
  getUserIdFromRequest
} from '../../utils/auth.js';
import {
  AUDIO_REFERENCE_MIME_TYPES,
  VIDEO_REFERENCE_MEDIA_LIMITS,
  VIDEO_REFERENCE_MIME_TYPES
} from '../../../src/shared/video-reference-media-rules.js';

export const config = { runtime: 'edge' };

const SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60 * 24;
const VIDEO_MIME_TYPES = new Set<string>(VIDEO_REFERENCE_MIME_TYPES);
const AUDIO_MIME_TYPES = new Set<string>(AUDIO_REFERENCE_MIME_TYPES);

type ReferenceMediaType = 'video' | 'audio';

function jsonResponse(
  data: unknown,
  corsHeaders: Record<string, string>,
  status = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}

function getReferenceBucket(): string {
  return (
    process.env.VIDEO_REFERENCE_BUCKET ||
    process.env.GENERATED_VIDEO_BUCKET ||
    'user-generated-videos'
  );
}

function getExtension(mediaType: ReferenceMediaType, mimeType: string): string {
  if (mediaType === 'video') {
    return mimeType === 'video/quicktime' ? 'mov' : 'mp4';
  }
  return mimeType.includes('wav') ? 'wav' : 'mp3';
}

function getUserPathPrefix(userId: string): string {
  return `video-references/${userId}/`;
}

function createReferencePath(
  userId: string,
  mediaType: ReferenceMediaType,
  mimeType: string
): string {
  const month = new Date().toISOString().slice(0, 7).replace('-', '');
  const random = crypto.randomUUID();
  return `${getUserPathPrefix(userId)}${month}/${mediaType}-${random}.${getExtension(
    mediaType,
    mimeType
  )}`;
}

function validateMediaInput(input: {
  mediaType?: string;
  mimeType?: string;
  fileSizeBytes?: number;
}):
  | { ok: true; mediaType: ReferenceMediaType; mimeType: string }
  | {
      ok: false;
      message: string;
      status: number;
    } {
  const mediaType =
    input.mediaType === 'video' || input.mediaType === 'audio'
      ? input.mediaType
      : null;
  if (!mediaType) {
    return { ok: false, message: '不支持的参考素材类型。', status: 400 };
  }
  const mimeType = String(input.mimeType || '').toLowerCase();
  const supported =
    mediaType === 'video'
      ? VIDEO_MIME_TYPES.has(mimeType)
      : AUDIO_MIME_TYPES.has(mimeType);
  if (!supported) {
    return {
      ok: false,
      message:
        mediaType === 'video'
          ? '参考视频仅支持 MP4、MOV。'
          : '参考音频仅支持 MP3、WAV。',
      status: 400
    };
  }
  const fileSizeBytes = Number(input.fileSizeBytes || 0);
  const maxBytes = VIDEO_REFERENCE_MEDIA_LIMITS.fileBytes[mediaType];
  if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) {
    return { ok: false, message: '素材文件大小无效。', status: 400 };
  }
  if (fileSizeBytes > maxBytes) {
    return {
      ok: false,
      message: `${mediaType === 'video' ? '参考视频' : '参考音频'}不得超过 ${
        maxBytes / 1024 / 1024
      }MB。`,
      status: 413
    };
  }
  return { ok: true, mediaType, mimeType };
}

export default async function handler(request: Request): Promise<Response> {
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
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return jsonResponse({ error: '素材存储服务未配置' }, corsHeaders, 503);
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: 'prepare' | 'complete';
    mediaType?: string;
    mimeType?: string;
    fileSizeBytes?: number;
    filePath?: string;
  };
  const action = body.action || 'prepare';
  const bucket = getReferenceBucket();

  if (action === 'complete') {
    const filePath = String(body.filePath || '');
    if (!filePath.startsWith(getUserPathPrefix(userId))) {
      return jsonResponse({ error: '参考素材路径无效' }, corsHeaders, 403);
    }
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(filePath, SIGNED_URL_EXPIRES_IN_SECONDS);
    if (error || !data?.signedUrl) {
      return jsonResponse(
        { error: `参考素材读取签名失败：${error?.message || 'empty URL'}` },
        corsHeaders,
        500
      );
    }
    return jsonResponse(
      {
        success: true,
        mediaUrl: data.signedUrl,
        filePath,
        bucket,
        expiresIn: SIGNED_URL_EXPIRES_IN_SECONDS
      },
      corsHeaders
    );
  }

  const validated = validateMediaInput(body);
  if (!validated.ok) {
    return jsonResponse(
      { error: validated.message },
      corsHeaders,
      validated.status
    );
  }
  const filePath = createReferencePath(
    userId,
    validated.mediaType,
    validated.mimeType
  );
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(filePath, { upsert: false });
  if (error || !data?.signedUrl) {
    return jsonResponse(
      { error: `参考素材上传签名失败：${error?.message || 'empty URL'}` },
      corsHeaders,
      500
    );
  }
  return jsonResponse(
    {
      success: true,
      uploadUrl: data.signedUrl,
      filePath,
      bucket,
      mediaType: validated.mediaType
    },
    corsHeaders
  );
}
