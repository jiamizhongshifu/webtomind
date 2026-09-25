import { getCorsHeadersForRequest } from '../../utils/auth';
import {
  assertPromptCaseAdmin,
  buildPromptAssetProductionBatchPatch,
  getMissingPromptAssetProductionBatchesResponse,
  getSupabaseAdmin,
  isMissingPromptAssetProductionBatchTable,
  jsonResponse,
  mapPromptAssetProductionBatch,
  validatePromptAssetProductionBatchPatch
} from './_shared';

export const config = { runtime: 'edge' };

async function listBatches(request: Request, corsHeaders: Record<string, string>) {
  const sb = getSupabaseAdmin();
  if (!sb) {
    return jsonResponse(
      { error: 'Supabase admin is not configured', batches: [] },
      corsHeaders,
      500
    );
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status')?.trim();
  const limit = Math.min(
    parseInt(url.searchParams.get('limit') || '100', 10) || 100,
    500
  );

  let query = sb
    .from('prompt_asset_production_batches')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    if (isMissingPromptAssetProductionBatchTable(error)) {
      return getMissingPromptAssetProductionBatchesResponse(corsHeaders);
    }
    console.error('[AdminPromptAssetProductionBatches] list failed:', error);
    return jsonResponse(
      { error: 'Failed to load prompt asset production batches', batches: [] },
      corsHeaders,
      500
    );
  }

  return jsonResponse(
    { batches: (data || []).map(mapPromptAssetProductionBatch) },
    corsHeaders
  );
}

async function createBatch(request: Request, corsHeaders: Record<string, string>) {
  const admin = await assertPromptCaseAdmin(request);
  if (!admin.ok) {
    return jsonResponse(
      { error: admin.error || 'Prompt case admin access required' },
      corsHeaders,
      admin.status
    );
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    return jsonResponse(
      { error: 'Supabase admin is not configured' },
      corsHeaders,
      500
    );
  }

  const input = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const id = typeof input.id === 'string' ? input.id.trim() : '';
  if (!id) return jsonResponse({ error: 'id is required' }, corsHeaders, 400);

  const patch = buildPromptAssetProductionBatchPatch(input, admin.email);
  patch.status = patch.status || 'draft';
  patch.created_by_email = admin.email || null;
  const validationError = validatePromptAssetProductionBatchPatch(patch, {
    requireCreateFields: true
  });
  if (validationError) {
    return jsonResponse({ error: validationError }, corsHeaders, 400);
  }

  const { data, error } = await sb
    .from('prompt_asset_production_batches')
    .insert({ id, ...patch })
    .select('*')
    .single();
  if (error) {
    if (isMissingPromptAssetProductionBatchTable(error)) {
      return getMissingPromptAssetProductionBatchesResponse(corsHeaders);
    }
    console.error('[AdminPromptAssetProductionBatches] create failed:', error);
    return jsonResponse(
      { error: 'Failed to create prompt asset production batch' },
      corsHeaders,
      500
    );
  }

  return jsonResponse(
    { batch: mapPromptAssetProductionBatch(data) },
    corsHeaders,
    201
  );
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'GET' && request.method !== 'POST') {
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

  if (request.method === 'GET') return listBatches(request, corsHeaders);
  return createBatch(request, corsHeaders);
}
