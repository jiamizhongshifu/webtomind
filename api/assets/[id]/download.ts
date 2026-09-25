import {
  getCorsHeadersForRequest,
  getUserIdFromRequest
} from '../../utils/auth';
import {
  GENERATED_ASSET_STORAGE_BUCKET,
  type GeneratedAssetDownloadNotReadyResponse
} from '../../../src/shared/generated-assets';

export const config = {
  runtime: 'edge'
};

type AssetDownloadDeps = {
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

function getAssetIdFromUrl(request: Request): string {
  const pathname = new URL(request.url).pathname;
  const match = pathname.match(/\/api\/assets\/([^/]+)\/download\/?$/);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

export function createAssetDownloadHandler(deps: AssetDownloadDeps) {
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

    const assetId = getAssetIdFromUrl(request);
    if (!assetId) {
      const body: GeneratedAssetDownloadNotReadyResponse = {
        success: false,
        error: 'ASSET_ID_REQUIRED',
        message: 'Asset id is required.',
        storageBucket: GENERATED_ASSET_STORAGE_BUCKET
      };
      return jsonResponse(body, corsHeaders, 400);
    }

    const body: GeneratedAssetDownloadNotReadyResponse = {
      success: false,
      error: 'FILE_ASSET_DOWNLOAD_NOT_READY',
      message: 'Private file asset download is not ready yet.',
      assetId,
      storageBucket: GENERATED_ASSET_STORAGE_BUCKET
    };
    return jsonResponse(body, corsHeaders, 501);
  };
}

export default createAssetDownloadHandler({
  getCorsHeadersForRequest,
  getUserIdFromRequest
});
