import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  assertPromptCaseAdmin,
  type PromptCaseAdminAuthResult
} from '../../admin/prompt-case-auth.js';
import { getCorsHeadersForRequest } from '../../utils/auth.js';
import {
  ImageVisualQualityError,
  scoreImageGenerationVisualQuality
} from './service.js';

export const config = { runtime: 'edge' };

type ImageVisualQualityScoreDeps = {
  getCorsHeadersForRequest: typeof getCorsHeadersForRequest;
  assertInternalAdmin: (request: Request) => Promise<PromptCaseAdminAuthResult>;
  createSupabaseClient: (url: string, key: string) => SupabaseClient;
};

function jsonResponse(
  data: unknown,
  corsHeaders: Record<string, string>,
  status = 200
): Response {
  return Response.json(data, {
    status,
    headers: {
      ...corsHeaders,
      'Cache-Control': 'no-store'
    }
  });
}

export function createImageVisualQualityScoreHandler(
  deps: ImageVisualQualityScoreDeps
) {
  return async function handler(request: Request): Promise<Response> {
    const corsHeaders = deps.getCorsHeadersForRequest(request);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
    }
    const admin = await deps.assertInternalAdmin(request);
    if (!admin.ok) {
      return jsonResponse(
        { error: admin.error || '仅限内部质检管理员' },
        corsHeaders,
        admin.status
      );
    }
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return jsonResponse({ error: 'Supabase 未配置' }, corsHeaders, 503);
    }
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const generationId =
      typeof body.generationId === 'string' ? body.generationId.trim() : '';
    if (!generationId) {
      return jsonResponse(
        { error: 'generationId is required' },
        corsHeaders,
        400
      );
    }
    try {
      const result = await scoreImageGenerationVisualQuality({
        supabase: deps.createSupabaseClient(supabaseUrl, supabaseKey),
        generationId
      });
      return jsonResponse(result, corsHeaders);
    } catch (error) {
      const status =
        error instanceof ImageVisualQualityError ? error.status : 502;
      const errorCode =
        error instanceof ImageVisualQualityError
          ? error.code
          : 'VISUAL_QUALITY_UNKNOWN_ERROR';
      console.warn('[ImageVisualQuality] request failed:', {
        generationId,
        adminUserId: admin.userId,
        errorCode
      });
      return jsonResponse(
        {
          error: error instanceof Error ? error.message : '自动视觉评分失败',
          errorCode
        },
        corsHeaders,
        status
      );
    }
  };
}

export default createImageVisualQualityScoreHandler({
  getCorsHeadersForRequest,
  assertInternalAdmin: assertPromptCaseAdmin,
  createSupabaseClient: createClient
});
