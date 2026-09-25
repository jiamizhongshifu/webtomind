import { getCorsHeadersForRequest } from '../../../utils/auth';
import {
  assertPromptCaseAdmin,
  buildProductionBatchRunCommand,
  fetchPromptAssetProductionBatch,
  getMissingPromptAssetProductionBatchesResponse,
  getSupabaseAdmin,
  isMissingPromptAssetProductionBatchTable,
  jsonResponse,
  mapPromptAssetProductionBatch
} from '../_shared';

export const config = { runtime: 'edge' };

function getBatchId(request: Request): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  return decodeURIComponent(parts[parts.length - 2] || '');
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

  const existing = await fetchPromptAssetProductionBatch(sb, id);
  if (existing.error) {
    if (isMissingPromptAssetProductionBatchTable(existing.error)) {
      return getMissingPromptAssetProductionBatchesResponse(corsHeaders);
    }
    return jsonResponse({ error: 'Batch not found' }, corsHeaders, 404);
  }

  const currentStatus = String(existing.data.status || 'draft');
  if (['running', 'synced', 'applied', 'cancelled'].includes(currentStatus)) {
    return jsonResponse(
      { error: `Batch cannot be queued from status ${currentStatus}` },
      corsHeaders,
      409
    );
  }

  const runCommand = buildProductionBatchRunCommand(id);
  const { data, error } = await sb
    .from('prompt_asset_production_batches')
    .update({
      status: 'queued',
      run_command: runCommand,
      updated_by_email: admin.email || null,
      result: {
        ...(existing.data.result &&
        typeof existing.data.result === 'object' &&
        !Array.isArray(existing.data.result)
          ? existing.data.result
          : {}),
        queuedAt: new Date().toISOString(),
        queuedByEmail: admin.email || null,
        runMode: 'cli-worker'
      }
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    if (isMissingPromptAssetProductionBatchTable(error)) {
      return getMissingPromptAssetProductionBatchesResponse(corsHeaders);
    }
    console.error('[AdminPromptAssetProductionBatches] queue failed:', error);
    return jsonResponse(
      { error: 'Failed to queue prompt asset production batch' },
      corsHeaders,
      500
    );
  }

  return jsonResponse(
    {
      batch: mapPromptAssetProductionBatch(data),
      runCommand,
      message:
        'Batch queued. Run pnpm prompt-asset-worker -- --limit 1 in the worker environment to claim, generate, crop, validate, and sync assets.'
    },
    corsHeaders
  );
}
