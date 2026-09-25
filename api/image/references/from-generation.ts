import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  getCorsHeadersForRequest,
  getUserIdFromRequest
} from '../../utils/auth';
import {
  createMediaStorageAdapters,
  getVariantRecord,
  locatorFromRecord
} from '../../utils/media-storage/index.js';
import type { ImageReferenceRole } from '../../../src/shared/image-reference-types';

export const config = { runtime: 'edge' };

type ImageReferenceFromGenerationDeps = {
  getCorsHeadersForRequest: typeof getCorsHeadersForRequest;
  getUserIdFromRequest: typeof getUserIdFromRequest;
  createSupabaseClient: typeof createClient;
};

const SIGNED_URL_EXPIRES_IN = 60 * 60 * 24;
const ALLOWED_ROLES = new Set<ImageReferenceRole>([
  'character',
  'style',
  'pose',
  'scene',
  'product'
]);

interface ImageGenerationRow {
  id: string;
  prompt: string;
  image_url: string;
  metadata: {
    storageBucket?: string;
    storagePath?: string;
    width?: number;
    height?: number;
    byteSize?: number;
    outputFormat?: string;
  } | null;
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

function sanitizeRole(value: unknown): ImageReferenceRole {
  return typeof value === 'string' &&
    ALLOWED_ROLES.has(value as ImageReferenceRole)
    ? (value as ImageReferenceRole)
    : 'style';
}

function sanitizeText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function detectExtension(mimeType: string, outputFormat?: string): string {
  if (mimeType.includes('webp') || outputFormat === 'webp') return 'webp';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  return 'png';
}

function getReferenceBucket(): string {
  return (
    process.env.IMAGE_REFERENCE_BUCKET ||
    process.env.GENERATED_IMAGE_BUCKET ||
    'user-generated-images'
  );
}

function inferMimeType(row: ImageGenerationRow): string {
  const record = getVariantRecord(row.metadata, 'original');
  if (record?.contentType?.startsWith('image/')) return record.contentType;
  if (row.metadata?.outputFormat === 'webp') return 'image/webp';
  if (
    row.metadata?.outputFormat === 'jpeg' ||
    row.metadata?.outputFormat === 'jpg'
  ) {
    return 'image/jpeg';
  }
  return 'image/png';
}

async function downloadSourceImage(
  supabase: SupabaseClient,
  row: ImageGenerationRow
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const record = getVariantRecord(row.metadata, 'original');
  if (record) {
    const adapters = createMediaStorageAdapters({
      supabase,
      defaultBucket: record.bucket
    });
    const adapter = adapters[record.provider];
    const buffer = await adapter?.downloadObject(locatorFromRecord(record));
    if (buffer) {
      return {
        bytes: new Uint8Array(buffer),
        mimeType: inferMimeType(row)
      };
    }
    console.error('[ImageReferenceFromGeneration] source download failed:', {
      generationId: row.id,
      provider: record.provider,
      bucket: record.bucket,
      path: record.key
    });
  }

  if (row.image_url) {
    const response = await fetch(row.image_url);
    if (response.ok) {
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        mimeType:
          response.headers.get('content-type')?.split(';')[0] ||
          inferMimeType(row)
      };
    }
    console.error(
      '[ImageReferenceFromGeneration] legacy source fetch failed:',
      {
        generationId: row.id,
        status: response.status
      }
    );
  }

  throw new Error('历史图片读取失败');
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
    label: row.label || '图库参考图',
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

export function createImageReferenceFromGenerationHandler(
  deps: ImageReferenceFromGenerationDeps
) {
  return async function handler(request: Request): Promise<Response> {
    const corsHeaders = deps.getCorsHeadersForRequest(request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
    }

    const userId = await deps.getUserIdFromRequest(request);
    if (!userId) {
      return jsonResponse({ error: '请先登录' }, corsHeaders, 401);
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return jsonResponse({ error: 'Supabase 未配置' }, corsHeaders, 503);
    }

    const body = (await request.json().catch(() => ({}))) as {
      generationId?: string;
      role?: string;
      label?: string;
      description?: string;
    };
    const generationId = sanitizeText(body.generationId, 80);
    if (!generationId) {
      return jsonResponse({ error: '缺少历史图片 ID' }, corsHeaders, 400);
    }

    const supabase = deps.createSupabaseClient(supabaseUrl, supabaseKey);
    const { data: generation, error: generationError } = await supabase
      .from('image_generations')
      .select('id, prompt, image_url, metadata, created_at')
      .eq('id', generationId)
      .eq('user_id', userId)
      .maybeSingle();

    if (generationError) {
      console.error(
        '[ImageReferenceFromGeneration] load failed:',
        generationError
      );
      return jsonResponse({ error: '历史图片加载失败' }, corsHeaders, 500);
    }
    if (!generation) {
      return jsonResponse(
        { error: '历史图片不存在或无权访问' },
        corsHeaders,
        404
      );
    }

    const source = generation as ImageGenerationRow;
    try {
      const referenceBucket = getReferenceBucket();
      const { bytes, mimeType } = await downloadSourceImage(supabase, source);
      const ext = detectExtension(mimeType, source.metadata?.outputFormat);
      const date = new Date();
      const month = `${date.getFullYear()}${String(
        date.getMonth() + 1
      ).padStart(2, '0')}`;
      const random = Math.random().toString(36).slice(2, 10);
      const filePath = `image-references/${userId}/${month}/from-history-${Date.now()}-${random}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(referenceBucket)
        .upload(filePath, bytes, {
          contentType: mimeType,
          cacheControl: '31536000',
          upsert: false
        });
      if (uploadError) {
        console.error(
          '[ImageReferenceFromGeneration] upload failed:',
          uploadError
        );
        return jsonResponse({ error: '图库参考图保存失败' }, corsHeaders, 500);
      }

      const role = sanitizeRole(body.role);
      const label =
        sanitizeText(body.label, 80) ||
        `图库参考图 ${new Date(source.created_at).toLocaleDateString('zh-CN')}`;
      const description =
        sanitizeText(body.description, 500) ||
        source.prompt.slice(0, 240) ||
        null;
      const { data: row, error: insertError } = await supabase
        .from('image_reference_assets')
        .insert({
          user_id: userId,
          storage_bucket: referenceBucket,
          storage_path: filePath,
          mime_type: mimeType,
          file_size_bytes: bytes.byteLength,
          width: source.metadata?.width || null,
          height: source.metadata?.height || null,
          role,
          label,
          description,
          metadata: {
            source: 'generation_history',
            sourceGenerationId: source.id
          }
        })
        .select(
          'id, role, label, description, storage_bucket, storage_path, mime_type, file_size_bytes, width, height, created_at'
        )
        .single();

      if (insertError || !row) {
        console.error(
          '[ImageReferenceFromGeneration] insert failed:',
          insertError
        );
        await supabase.storage.from(referenceBucket).remove([filePath]);
        return jsonResponse({ error: '图库参考图入库失败' }, corsHeaders, 500);
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
    } catch (error) {
      console.error('[ImageReferenceFromGeneration] failed:', error);
      return jsonResponse({ error: '图库参考图导入失败' }, corsHeaders, 500);
    }
  };
}

export default createImageReferenceFromGenerationHandler({
  getCorsHeadersForRequest,
  getUserIdFromRequest,
  createSupabaseClient: createClient
});
