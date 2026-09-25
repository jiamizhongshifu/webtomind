import { getCorsHeadersForRequest, getUserIdFromRequest } from '../utils/auth';
import {
  GENERATED_ASSET_STORAGE_BUCKET,
  PPT_DECK_LAB_FORMATS,
  type AssetGenerationNotReadyResponse,
  type AssetGenerationRequest
} from '../../src/shared/generated-assets';

export const config = {
  runtime: 'edge'
};

type AssetGenerateDeps = {
  getCorsHeadersForRequest: typeof getCorsHeadersForRequest;
  getUserIdFromRequest: typeof getUserIdFromRequest;
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

export function buildAssetGenerationNotReadyResponse(
  request: Partial<AssetGenerationRequest> | null
): AssetGenerationNotReadyResponse {
  return {
    success: false,
    error: 'FILE_ASSET_GENERATION_NOT_READY',
    message: 'File asset generation is not ready yet.',
    appSlug: request?.appSlug,
    supportedFormats: PPT_DECK_LAB_FORMATS,
    storageBucket: GENERATED_ASSET_STORAGE_BUCKET
  };
}

export function createAssetGenerateHandler(deps: AssetGenerateDeps) {
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
      return jsonResponse({ error: 'Unauthorized' }, corsHeaders, 401);
    }

    const body = (await request
      .json()
      .catch(() => null)) as Partial<AssetGenerationRequest> | null;

    return jsonResponse(
      buildAssetGenerationNotReadyResponse(body),
      corsHeaders,
      501
    );
  };
}

export default createAssetGenerateHandler({
  getCorsHeadersForRequest,
  getUserIdFromRequest
});
