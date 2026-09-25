import { createClient } from '@supabase/supabase-js';
import { getCorsHeadersForRequest } from '../utils/auth';
import { SEO_BLOG_POSTS } from '../seo-content';
import { toPublicSeoBlogPost } from '../../src/shared/seo-blog-public-post';

export const config = { runtime: 'edge' };

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);
  const jsonResponse = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });

  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'GET')
    return jsonResponse({ error: 'Method not allowed' }, 405);

  const url = new URL(request.url);
  const locale = url.searchParams.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
  const limit = Math.min(
    parseInt(url.searchParams.get('limit') || '20', 10) || 20,
    100
  );
  const slug = url.searchParams.get('slug')?.trim() || '';
  const staticPost = slug
    ? SEO_BLOG_POSTS.find((post) => post.slug === slug)
    : undefined;

  if (staticPost) {
    return jsonResponse({ post: toPublicSeoBlogPost(staticPost, locale) });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse(
      slug
        ? { error: 'Supabase is not configured', post: null }
        : { error: 'Supabase is not configured', posts: [] },
      503
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  let query = supabase
    .from('blog_posts')
    .select(
      'id, slug, locale, title, excerpt, tag, body_markdown, cover_image, published_at'
    )
    .eq('locale', locale)
    .eq('is_published', true)
    .lte('published_at', new Date().toISOString());

  if (slug) query = query.eq('slug', slug).limit(1);
  else {
    query = query
      .order('sort_order', { ascending: false })
      .order('published_at', { ascending: false })
      .limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[API] /content/blog error:', error);
    return jsonResponse({ error: 'Failed to load blog posts', posts: [] }, 500);
  }

  if (slug) return jsonResponse({ post: data?.[0] || null });
  return jsonResponse({ posts: data || [] });
}
