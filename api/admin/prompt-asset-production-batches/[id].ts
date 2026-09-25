import { getCorsHeadersForRequest } from '../../utils/auth';
import {
  assertPromptCaseAdmin,
  buildPromptAssetProductionBatchPatch,
  fetchPromptAssetProductionBatch,
  getMissingPromptAssetProductionBatchesResponse,
  getSupabaseAdmin,
  isMissingPromptAssetProductionBatchTable,
  jsonResponse,
  mapPromptAssetProductionBatch,
  validatePromptAssetProductionBatchPatch
} from './_shared';

export const config = { runtime: 'edge' };

function getBatchId(request: Request): string {
  const url = new URL(request.url);
  return decodeURIComponent(
    url.pathname.split('/').filter(Boolean).pop() || ''
  );
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (!['GET', 'PATCH', 'DELETE'].includes(request.method)) {
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

  const id = getBatchId(request);
  if (!id) return jsonResponse({ error: 'id is required' }, corsHeaders, 400);

  const sb = getSupabaseAdmin();
  if (!sb) {
    return jsonResponse(
      { error: 'Supabase admin is not configured' },
      corsHeaders,
      500
    );
  }

  if (request.method === 'GET') {
    const { data, error } = await fetchPromptAssetProductionBatch(sb, id);
    if (error) {
      if (isMissingPromptAssetProductionBatchTable(error)) {
        return getMissingPromptAssetProductionBatchesResponse(corsHeaders);
      }
      return jsonResponse({ error: 'Batch not found' }, corsHeaders, 404);
    }
    return jsonResponse(
      { batch: mapPromptAssetProductionBatch(data) },
      corsHeaders
    );
  }

  if (request.method === 'DELETE') {
    const { data, error } = await sb
      .from('prompt_asset_production_batches')
      .update({ status: 'cancelled', updated_by_email: admin.email || null })
      .eq('id', id)
      .select('*')
      .single();
    if (error) {
      if (isMissingPromptAssetProductionBatchTable(error)) {
        return getMissingPromptAssetProductionBatchesResponse(corsHeaders);
      }
      console.error('[AdminPromptAssetProductionBatches] cancel failed:', error);
      return jsonResponse(
        { error: 'Failed to cancel prompt asset production batch' },
        corsHeaders,
        500
      );
    }
    return jsonResponse(
      { batch: mapPromptAssetProductionBatch(data) },
      corsHeaders
    );
  }

  const input = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const patch = buildPromptAssetProductionBatchPatch(input, admin.email);
  const validationError = validatePromptAssetProductionBatchPatch(patch);
  if (validationError) {
    return jsonResponse({ error: validationError }, corsHeaders, 400);
  }
  if (Object.keys(patch).length === 0) {
    return jsonResponse(
      { error: 'No editable fields provided' },
      corsHeaders,
      400
    );
  }

  const { data, error } = await sb
    .from('prompt_asset_production_batches')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) {
    if (isMissingPromptAssetProductionBatchTable(error)) {
      return getMissingPromptAssetProductionBatchesResponse(corsHeaders);
    }
    console.error('[AdminPromptAssetProductionBatches] update failed:', error);
    return jsonResponse(
      { error: 'Failed to update prompt asset production batch' },
      corsHeaders,
      500
    );
  }

  return jsonResponse(
    { batch: mapPromptAssetProductionBatch(data) },
    corsHeaders
  );
}
