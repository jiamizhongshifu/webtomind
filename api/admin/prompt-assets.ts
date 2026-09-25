import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getCorsHeadersForRequest } from '../utils/auth';
import { SUPPORTED_SLOTS } from '../utils/prompt-asset-reverse';

export const config = { runtime: 'edge' };

const ALLOWED_SLOTS = new Set<string>(SUPPORTED_SLOTS);

interface PromptAssetWriteInput {
  id?: string;
  slot?: string;
  title?: string;
  subtitle?: string;
  prompt?: string;
  negativePrompt?: string | null;
  tags?: string[];
  thumbnailUrl?: string;
  sourceBatchId?: string | null;
  provider?: string;
  visual?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  sortOrder?: number;
  isPublished?: boolean;
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

function parseBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

function parseAdminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function assertAdmin(request: Request): Promise<{
  ok: boolean;
  status: number;
  error?: string;
}> {
  const token = parseBearerToken(request);
  if (!token) {
    return { ok: false, status: 401, error: 'Missing Authorization header' };
  }

  const adminEmails = parseAdminEmails();
  if (adminEmails.size === 0) {
    return { ok: false, status: 403, error: 'ADMIN_EMAILS is not configured' };
  }

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return { ok: false, status: 500, error: 'Supabase auth is not configured' };
  }

  const supabase = createClient(url, anonKey);
  const {
    data: { user },
    error
  } = await supabase.auth.getUser(token);
  const email = user?.email?.toLowerCase();

  if (error || !email || !adminEmails.has(email)) {
    return { ok: false, status: 403, error: 'Admin access required' };
  }

  return { ok: true, status: 200 };
}

function mapPromptAsset(asset: Record<string, unknown>) {
  return {
    id: asset.id,
    slot: asset.slot,
    title: asset.title,
    subtitle: asset.subtitle,
    prompt: asset.prompt,
    negativePrompt: asset.negative_prompt || undefined,
    tags: asset.tags || [],
    thumbnailUrl: asset.thumbnail_url,
    sourceBatchId: asset.source_batch_id || undefined,
    provider: asset.provider,
    visual: asset.visual || {},
    metadata: asset.metadata || {},
    sortOrder: asset.sort_order,
    isPublished: asset.is_published,
    publishedAt: asset.published_at,
    createdAt: asset.created_at,
    updatedAt: asset.updated_at
  };
}

function buildPatch(input: PromptAssetWriteInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if (input.slot !== undefined) {
    if (!ALLOWED_SLOTS.has(input.slot)) {
      throw new Error('invalid slot');
    }
    patch.slot = input.slot;
  }
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.subtitle !== undefined) patch.subtitle = input.subtitle.trim();
  if (input.prompt !== undefined) patch.prompt = input.prompt.trim();
  if (input.negativePrompt !== undefined) {
    patch.negative_prompt = input.negativePrompt?.trim() || null;
  }
  if (input.tags !== undefined) {
    patch.tags = input.tags.map((tag) => tag.trim()).filter(Boolean);
  }
  if (input.thumbnailUrl !== undefined)
    patch.thumbnail_url = input.thumbnailUrl.trim();
  if (input.sourceBatchId !== undefined)
    patch.source_batch_id = input.sourceBatchId;
  if (input.provider !== undefined)
    patch.provider = input.provider.trim() || 'operator';
  if (input.visual !== undefined) patch.visual = input.visual;
  if (input.metadata !== undefined) patch.metadata = input.metadata;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
  if (input.isPublished !== undefined) {
    patch.is_published = input.isPublished;
    if (input.isPublished) patch.published_at = new Date().toISOString();
  }

  return patch;
}

async function listAssets(
  request: Request,
  sb: SupabaseClient,
  corsHeaders: Record<string, string>
) {
  const url = new URL(request.url);
  const slot = url.searchParams.get('slot') || undefined;
  const limit = Math.min(
    parseInt(url.searchParams.get('limit') || '500', 10) || 500,
    1000
  );

  if (slot && !ALLOWED_SLOTS.has(slot)) {
    return jsonResponse(
      { error: 'invalid slot', assets: [] },
      corsHeaders,
      400
    );
  }

  let query = sb
    .from('prompt_assets')
    .select('*')
    .order('slot', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(limit);

  if (slot) {
    query = query.eq('slot', slot);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[AdminPromptAssets] list failed:', error);
    return jsonResponse(
      { error: 'Failed to load prompt assets', assets: [] },
      corsHeaders,
      500
    );
  }

  return jsonResponse(
    { assets: (data || []).map(mapPromptAsset) },
    corsHeaders
  );
}

async function upsertAsset(
  request: Request,
  sb: SupabaseClient,
  corsHeaders: Record<string, string>
) {
  const input = (await request
    .json()
    .catch(() => ({}))) as PromptAssetWriteInput;
  if (!input.id) {
    return jsonResponse({ error: 'id is required' }, corsHeaders, 400);
  }

  const patch = buildPatch(input);
  const requiredFields = ['slot', 'title', 'prompt', 'thumbnail_url'];
  const missing = requiredFields.filter((field) => patch[field] === undefined);
  if (request.method === 'POST' && missing.length > 0) {
    return jsonResponse(
      { error: `Missing fields: ${missing.join(', ')}` },
      corsHeaders,
      400
    );
  }

  const { data, error } = await sb
    .from('prompt_assets')
    .upsert({ id: input.id, ...patch }, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) {
    console.error('[AdminPromptAssets] upsert failed:', error);
    return jsonResponse(
      { error: 'Failed to save prompt asset' },
      corsHeaders,
      500
    );
  }

  return jsonResponse({ asset: mapPromptAsset(data) }, corsHeaders);
}

async function patchAsset(
  request: Request,
  sb: SupabaseClient,
  corsHeaders: Record<string, string>
) {
  const input = (await request
    .json()
    .catch(() => ({}))) as PromptAssetWriteInput;
  if (!input.id) {
    return jsonResponse({ error: 'id is required' }, corsHeaders, 400);
  }

  const patch = buildPatch(input);
  if (Object.keys(patch).length === 0) {
    return jsonResponse(
      { error: 'No editable fields provided' },
      corsHeaders,
      400
    );
  }

  const { data, error } = await sb
    .from('prompt_assets')
    .update(patch)
    .eq('id', input.id)
    .select('*')
    .single();

  if (error) {
    console.error('[AdminPromptAssets] patch failed:', error);
    return jsonResponse(
      { error: 'Failed to update prompt asset' },
      corsHeaders,
      500
    );
  }

  return jsonResponse({ asset: mapPromptAsset(data) }, corsHeaders);
}

async function unpublishAsset(
  request: Request,
  sb: SupabaseClient,
  corsHeaders: Record<string, string>
) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) {
    return jsonResponse({ error: 'id is required' }, corsHeaders, 400);
  }

  const { data, error } = await sb
    .from('prompt_assets')
    .update({ is_published: false })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('[AdminPromptAssets] unpublish failed:', error);
    return jsonResponse(
      { error: 'Failed to unpublish prompt asset' },
      corsHeaders,
      500
    );
  }

  return jsonResponse({ asset: mapPromptAsset(data) }, corsHeaders);
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const admin = await assertAdmin(request);
  if (!admin.ok) {
    return jsonResponse(
      { error: admin.error || 'Admin access required' },
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

  if (request.method === 'GET') return listAssets(request, sb, corsHeaders);
  if (request.method === 'POST') return upsertAsset(request, sb, corsHeaders);
  if (request.method === 'PATCH') return patchAsset(request, sb, corsHeaders);
  if (request.method === 'DELETE')
    return unpublishAsset(request, sb, corsHeaders);

  return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
}
