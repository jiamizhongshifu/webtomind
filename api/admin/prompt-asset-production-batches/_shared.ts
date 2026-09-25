import { type SupabaseClient } from '@supabase/supabase-js';

export {
  assertPromptCaseAdmin,
  getSupabaseAdmin
} from '../prompt-case-auth';

export function jsonResponse(
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

export const PROMPT_ASSET_BATCH_STATUSES = new Set([
  'draft',
  'approved',
  'queued',
  'running',
  'generated',
  'cropped',
  'synced',
  'applied',
  'failed',
  'cancelled'
]);

export const PROMPT_ASSET_BATCH_SLOTS = new Set([
  'character',
  'expression',
  'hairstyle',
  'pose',
  'top',
  'bottom',
  'shoes',
  'background',
  'productSubject',
  'productSurface',
  'composition',
  'titleArea',
  'style',
  'lighting',
  'visualEffect',
  'layoutDesign',
  'accessory',
  'prop',
  'lens',
  'shot',
  'makeup',
  'mixed'
]);

export type PromptAssetProductionBatchInput = {
  id?: string;
  status?: string;
  slot?: string;
  grid?: Record<string, unknown>;
  size?: string;
  outputSize?: number;
  prompt?: string;
  assets?: Array<Record<string, unknown>>;
  notes?: string[];
  caseIds?: string[];
  analysisResult?: Record<string, unknown>;
  result?: Record<string, unknown>;
};

function normalizeStringArray(value: unknown, limit = 100): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeGrid(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { columns: 1, rows: 1 };
  }
  const record = value as Record<string, unknown>;
  const columns = Math.max(1, Math.min(16, Number(record.columns || 1) || 1));
  const rows = Math.max(1, Math.min(16, Number(record.rows || 1) || 1));
  return { ...record, columns, rows };
}

export function mapPromptAssetProductionBatch(item: Record<string, unknown>) {
  return {
    id: item.id,
    status: item.status,
    slot: item.slot,
    grid: item.grid || {},
    size: item.size,
    outputSize: item.output_size,
    prompt: item.prompt,
    assets: Array.isArray(item.assets) ? item.assets : [],
    notes: Array.isArray(item.notes) ? item.notes : [],
    caseIds: Array.isArray(item.case_ids) ? item.case_ids : [],
    analysisResult: item.analysis_result || {},
    result: item.result || {},
    runCommand: item.run_command || undefined,
    createdByEmail: item.created_by_email || undefined,
    updatedByEmail: item.updated_by_email || undefined,
    createdAt: item.created_at,
    updatedAt: item.updated_at
  };
}

export function buildPromptAssetProductionBatchPatch(
  input: PromptAssetProductionBatchInput,
  email?: string
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if (input.status !== undefined) patch.status = String(input.status).trim();
  if (input.slot !== undefined) patch.slot = String(input.slot).trim();
  if (input.grid !== undefined) patch.grid = normalizeGrid(input.grid);
  if (input.size !== undefined) patch.size = String(input.size).trim();
  if (input.outputSize !== undefined)
    patch.output_size = Math.max(256, Number(input.outputSize) || 768);
  if (input.prompt !== undefined) patch.prompt = String(input.prompt).trim();
  if (input.assets !== undefined) {
    patch.assets = Array.isArray(input.assets) ? input.assets.slice(0, 16) : [];
  }
  if (input.notes !== undefined) patch.notes = normalizeStringArray(input.notes);
  if (input.caseIds !== undefined)
    patch.case_ids = normalizeStringArray(input.caseIds, 50);
  if (input.analysisResult !== undefined)
    patch.analysis_result =
      input.analysisResult &&
      typeof input.analysisResult === 'object' &&
      !Array.isArray(input.analysisResult)
        ? input.analysisResult
        : {};
  if (input.result !== undefined)
    patch.result =
      input.result &&
      typeof input.result === 'object' &&
      !Array.isArray(input.result)
        ? input.result
        : {};
  if (email) patch.updated_by_email = email;

  return patch;
}

export function validatePromptAssetProductionBatchPatch(
  patch: Record<string, unknown>,
  { requireCreateFields = false }: { requireCreateFields?: boolean } = {}
): string | null {
  if (patch.status !== undefined) {
    const status = String(patch.status);
    if (!PROMPT_ASSET_BATCH_STATUSES.has(status)) return 'Invalid status';
  }
  if (patch.slot !== undefined) {
    const slot = String(patch.slot);
    if (!PROMPT_ASSET_BATCH_SLOTS.has(slot)) return 'Invalid slot';
  }
  if (patch.assets !== undefined && !Array.isArray(patch.assets)) {
    return 'assets must be an array';
  }
  if (patch.prompt !== undefined && !String(patch.prompt).trim()) {
    return 'prompt is required';
  }
  if (requireCreateFields) {
    for (const field of ['slot', 'grid', 'prompt', 'assets']) {
      if (patch[field] === undefined) return `${field} is required`;
    }
    const assets = patch.assets as unknown[];
    const grid = patch.grid as Record<string, unknown>;
    const expected = Number(grid.columns || 1) * Number(grid.rows || 1);
    if (assets.length !== expected) {
      return `assets length ${assets.length} does not match grid ${expected}`;
    }
  }
  return null;
}

export function isMissingPromptAssetProductionBatchTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  return (
    record.code === 'PGRST205' ||
    String(record.message || '').includes('prompt_asset_production_batches')
  );
}

export function getMissingPromptAssetProductionBatchesResponse(
  corsHeaders: Record<string, string>
) {
  return jsonResponse(
    {
      error:
        '请先执行 supabase/migrations/20260630123000_prompt_asset_production_batches.sql 初始化素材生产批次表',
      needsSetup: true,
      batches: []
    },
    corsHeaders,
    424
  );
}

export async function fetchPromptAssetProductionBatch(
  sb: SupabaseClient,
  id: string
) {
  return sb
    .from('prompt_asset_production_batches')
    .select('*')
    .eq('id', id)
    .single();
}

export function buildProductionBatchRunCommand(id: string) {
  return `pnpm prompt-asset-batch -- --batch ${id}`;
}
