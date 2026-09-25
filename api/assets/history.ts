import {
  getCorsHeadersForRequest,
  getSupabaseAdmin,
  getUserIdFromRequest
} from '../utils/auth';
import {
  GENERATED_ASSET_STORAGE_BUCKET,
  type GeneratedAssetHistoryResponse,
  type GeneratedAssetRecord,
  type GeneratedAssetType,
  type GeneratedAssetOutputFormat
} from '../../src/shared/generated-assets';

export const config = {
  runtime: 'edge'
};

type AssetHistoryDeps = {
  getCorsHeadersForRequest: typeof getCorsHeadersForRequest;
  getSupabaseAdmin: typeof getSupabaseAdmin;
  getUserIdFromRequest: typeof getUserIdFromRequest;
};

type GeneratedAssetRow = {
  id: string;
  task_id: string | null;
  app_slug: string;
  asset_type: GeneratedAssetType;
  title: string;
  prompt: string | null;
  output_format: GeneratedAssetOutputFormat;
  mime_type: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  download_filename: string | null;
  byte_size: number | null;
  status: 'ready' | 'deleted' | 'failed';
  metadata: Record<string, unknown> | null;
  created_at: string;
};

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

function mapGeneratedAsset(row: GeneratedAssetRow): GeneratedAssetRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    appSlug: row.app_slug,
    assetType: row.asset_type,
    title: row.title,
    prompt: row.prompt,
    outputFormat: row.output_format,
    mimeType: row.mime_type,
    storageBucket: row.storage_bucket || GENERATED_ASSET_STORAGE_BUCKET,
    storagePath: row.storage_path,
    downloadFilename: row.download_filename,
    byteSize: row.byte_size,
    status: row.status,
    metadata: row.metadata || {},
    createdAt: row.created_at
  };
}

export function createAssetHistoryHandler(deps: AssetHistoryDeps) {
  return async function handler(request: Request): Promise<Response> {
    const corsHeaders = deps.getCorsHeadersForRequest(request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'GET') {
      return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
    }

    const userId = await deps.getUserIdFromRequest(request);
    if (!userId) {
      return jsonResponse({ error: 'Unauthorized' }, corsHeaders, 401);
    }

    const supabase = deps.getSupabaseAdmin();
    if (!supabase) {
      return jsonResponse(
        { error: 'Database admin not configured' },
        corsHeaders,
        500
      );
    }

    const url = new URL(request.url);
    const limit = Math.max(
      1,
      Math.min(100, Number(url.searchParams.get('limit') || 48))
    );
    const before = url.searchParams.get('before');

    let query = supabase
      .from('generated_assets')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt('created_at', before);
    }

    const { data, error } = await query;
    if (error) {
      return jsonResponse(
        {
          error: 'ASSET_HISTORY_FAILED',
          message: error.message
        },
        corsHeaders,
        500
      );
    }

    const items = ((data || []) as GeneratedAssetRow[]).map(mapGeneratedAsset);
    const nextBefore =
      items.length === limit ? items[items.length - 1]?.createdAt : undefined;
    const response: GeneratedAssetHistoryResponse = {
      success: true,
      items,
      nextBefore,
      hasMore: Boolean(nextBefore)
    };

    return jsonResponse(response, corsHeaders);
  };
}

export default createAssetHistoryHandler({
  getCorsHeadersForRequest,
  getSupabaseAdmin,
  getUserIdFromRequest
});
