import { Hono } from 'hono';
import * as db from '../services/supabase.js';

export const contentRoutes = new Hono();

const useSupabase = !!(
  process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
);

function getLocale(raw: string | undefined): 'zh-CN' | 'en-US' {
  return raw === 'en-US' ? 'en-US' : 'zh-CN';
}

contentRoutes.get('/blog', async (c) => {
  const locale = getLocale(c.req.query('locale'));
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10) || 20, 100);

  if (!useSupabase) {
    return c.json({ error: 'Supabase is not configured', posts: [] }, 503);
  }

  try {
    const posts = await db.getPublishedBlogPosts(locale, limit);
    return c.json({ posts });
  } catch (error) {
    console.error('[Content] GET /blog failed:', error);
    return c.json({ error: '获取博客内容失败' }, 500);
  }
});

contentRoutes.get('/blog/:slug', async (c) => {
  const locale = getLocale(c.req.query('locale'));
  const slug = c.req.param('slug') || '';

  if (!useSupabase) {
    return c.json({ error: 'Supabase is not configured', post: null }, 503);
  }

  if (!slug.trim()) {
    return c.json({ error: 'slug is required', post: null }, 400);
  }

  try {
    const post = await db.getPublishedBlogPostBySlug(locale, slug);
    if (!post) {
      return c.json({ error: 'not found', post: null }, 404);
    }
    return c.json({ post });
  } catch (error) {
    console.error('[Content] GET /blog/:slug failed:', error);
    return c.json({ error: '获取博客详情失败' }, 500);
  }
});

contentRoutes.get('/updates', async (c) => {
  const locale = getLocale(c.req.query('locale'));
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10) || 20, 100);

  if (!useSupabase) {
    return c.json({ error: 'Supabase is not configured', updates: [] }, 503);
  }

  try {
    const updates = await db.getPublishedProductUpdates(locale, limit);
    return c.json({ updates });
  } catch (error) {
    console.error('[Content] GET /updates failed:', error);
    return c.json({ error: '获取更新日志失败' }, 500);
  }
});

contentRoutes.get('/skills', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') || '24', 10) || 24, 100);

  if (!useSupabase) {
    return c.json({ error: 'Supabase is not configured', skills: [] }, 503);
  }

  try {
    const skills = await db.getPublicSkills(limit);
    if (skills.length > 0) {
      return c.json({
        skills: skills.map((skill) => ({
          id: skill.id,
          name: skill.display_name || skill.name,
          description: skill.description || '',
          icon: skill.icon || '🔧',
          category: skill.category || 'custom',
          source: 'skills'
        }))
      });
    }

    const { data: templates, error } = await db
      .getSupabase()
      .from('skill_templates')
      .select('id, display_name, description, icon, category, sort_order')
      .order('sort_order', { ascending: true })
      .limit(limit);

    if (error) throw error;

    return c.json({
      skills: (templates || []).map((tpl) => ({
        id: tpl.id,
        name: tpl.display_name,
        description: tpl.description || '',
        icon: tpl.icon || '🔧',
        category: tpl.category || 'template',
        source: 'templates'
      }))
    });
  } catch (error) {
    console.error('[Content] GET /skills failed:', error);
    return c.json({ error: '获取技能广场失败' }, 500);
  }
});

contentRoutes.get('/prompt-assets', async (c) => {
  const limit = Math.min(
    parseInt(c.req.query('limit') || '1000', 10) || 1000,
    1000
  );
  const slot = c.req.query('slot') || undefined;
  const allowedSlots = new Set([
    'character',
    'expression',
    'hairstyle',
    'pose',
    'top',
    'bottom',
    'outfit',
    'onePiece',
    'shoes',
    'background',
    'style',
    'lighting'
  ]);

  if (!useSupabase) {
    return c.json({ error: 'Supabase is not configured', assets: [] }, 503);
  }

  if (slot && !allowedSlots.has(slot)) {
    return c.json({ error: 'invalid slot', assets: [] }, 400);
  }

  try {
    const assets = await db.getPublishedPromptAssets({
      slot: slot as db.PromptAsset['slot'] | undefined,
      limit
    });

    return c.json(
      {
        assets: assets.map((asset) => ({
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
        }))
      },
      200,
      {
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300'
      }
    );
  } catch (error) {
    console.error('[Content] GET /prompt-assets failed:', error);
    return c.json({ error: '获取提示词素材库失败', assets: [] }, 500);
  }
});
