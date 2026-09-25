import { createClient } from '@supabase/supabase-js';
import { getCorsHeadersForRequest } from '../utils/auth';

export const config = { runtime: 'edge' };

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);
  const jsonResponse = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse({ error: 'Supabase is not configured', updates: [] }, 503);
  }

  const url = new URL(request.url);
  const locale = url.searchParams.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 100);

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase
    .from('product_updates')
    .select('id, version, locale, title, highlights, published_at')
    .eq('locale', locale)
    .eq('is_published', true)
    .lte('published_at', new Date().toISOString())
    .order('sort_order', { ascending: false })
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[API] /content/updates error:', error);
    return jsonResponse({ error: 'Failed to load updates', updates: [] }, 500);
  }

  return jsonResponse({ updates: data || [] });
}
