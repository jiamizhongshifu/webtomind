import { createClient } from '@supabase/supabase-js';
import { getCorsHeadersForRequest } from '../utils/auth';
import { SUPPORTED_SLOTS } from '../utils/prompt-asset-reverse';

export const config = { runtime: 'edge' };

const ALLOWED_SLOTS = new Set<string>(SUPPORTED_SLOTS);

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);
  const jsonResponse = (
    data: unknown,
    status = 200,
    extraHeaders: Record<string, string> = {}
  ) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
        ...extraHeaders
      }
    });

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed', assets: [] }, 405);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse(
      { error: 'Supabase is not configured', assets: [] },
      503
    );
  }

  const url = new URL(request.url);
  const limit = Math.min(
    parseInt(url.searchParams.get('limit') || '1000', 10) || 1000,
    1000
  );
  const slot = url.searchParams.get('slot') || undefined;

  if (slot && !ALLOWED_SLOTS.has(slot)) {
    return jsonResponse({ error: 'invalid slot', assets: [] }, 400);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  let query = supabase
    .from('prompt_assets')
    .select(
      'id, slot, title, subtitle, prompt, negative_prompt, tags, thumbnail_url, source_batch_id, visual, metadata, sort_order'
    )
    .eq('is_published', true)
    .is('owner_user_id', null)
    .lte('published_at', new Date().toISOString());

  if (slot) {
    query = query.eq('slot', slot);
  }

  const { data, error } = await query
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[API] /content/prompt-assets error:', error);
    return jsonResponse(
      { error: 'Failed to load prompt assets', assets: [] },
      500
    );
  }

  const assets = (data || []).map((asset) => ({
    id: asset.id,
    slot: asset.slot,
    title: asset.title,
    subtitle: asset.subtitle,
    prompt: asset.prompt,
    negativePrompt: asset.negative_prompt || undefined,
    tags: asset.tags || [],
    thumbnailUrl: asset.thumbnail_url,
    sourceBatchId: asset.source_batch_id || undefined,
    visual: asset.visual || {},
    metadata: asset.metadata || {},
    sortOrder: asset.sort_order
  }));

  return jsonResponse({ assets }, 200, {
    'Cache-Control': 'public, max-age=60, stale-while-revalidate=300'
  });
}
