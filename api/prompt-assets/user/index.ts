/**
 * 用户个人素材库 CRUD
 *
 * GET    /api/prompt-assets/user                列出 owner=自己的全部素材
 * POST   /api/prompt-assets/user                保存（创建或更新）个人素材
 * DELETE /api/prompt-assets/user?id=xxx         删除自己的素材
 *
 * 所有操作强制 owner_user_id = auth.uid()，并依赖 prompt_assets 表的 RLS。
 */

import { createClient } from '@supabase/supabase-js';
import { getCorsHeadersForRequest, getUserIdFromRequest } from '../../utils/auth';
import { SUPPORTED_SLOTS } from '../../utils/prompt-asset-reverse';

export const config = { runtime: 'edge' };

const ALLOWED_SLOTS = new Set<string>(SUPPORTED_SLOTS);
const MAX_TAGS = 12;
const MAX_TEXT_LEN = 2000;

interface UserPromptAssetPayload {
  id?: string;
  slot?: string;
  title?: string;
  subtitle?: string;
  prompt?: string;
  promptZh?: string | null;
  negativePrompt?: string | null;
  negativePromptZh?: string | null;
  tags?: string[];
  thumbnailUrl?: string;
  source?: string;
  sourcePrompt?: string;
}

interface PromptAssetRow {
  id: string;
  slot: string;
  title: string;
  subtitle: string;
  prompt: string;
  negative_prompt: string | null;
  tags: string[];
  thumbnail_url: string;
  visual: Record<string, unknown>;
  metadata: Record<string, unknown>;
  sort_order: number;
  created_at: string;
  updated_at: string;
  owner_user_id: string | null;
}

function clampText(value: string | undefined | null, max = MAX_TEXT_LEN): string {
  if (!value) return '';
  return value.length > max ? value.slice(0, max) : value;
}

function sanitizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const out: string[] = [];
  for (const tag of tags) {
    if (typeof tag !== 'string') continue;
    const trimmed = tag.trim();
    if (!trimmed) continue;
    out.push(trimmed.slice(0, 24));
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

function rowToClient(row: PromptAssetRow) {
  const metadata = row.metadata || {};
  const promptZh =
    typeof metadata.promptZh === 'string' ? metadata.promptZh : null;
  const negativePromptZh =
    typeof metadata.negativePromptZh === 'string'
      ? metadata.negativePromptZh
      : null;
  return {
    id: row.id,
    slot: row.slot,
    title: row.title,
    subtitle: row.subtitle,
    prompt: row.prompt,
    promptZh,
    negativePrompt: row.negative_prompt,
    negativePromptZh,
    tags: row.tags || [],
    thumbnailUrl: row.thumbnail_url,
    visual: row.visual,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ownerUserId: row.owner_user_id
  };
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);
  const jsonResponse = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return jsonResponse({ error: '请先登录' }, 401);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse({ error: 'Supabase 未配置' }, 503);
  }

  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const limit = Math.min(
      parseInt(url.searchParams.get('limit') || '200', 10) || 200,
      500
    );
    const slot = url.searchParams.get('slot') || undefined;
    if (slot && !ALLOWED_SLOTS.has(slot)) {
      return jsonResponse({ error: 'invalid slot', items: [] }, 400);
    }

    let query = supabase
      .from('prompt_assets')
      .select(
        'id, slot, title, subtitle, prompt, negative_prompt, tags, thumbnail_url, visual, metadata, sort_order, created_at, updated_at, owner_user_id'
      )
      .eq('owner_user_id', userId);
    if (slot) query = query.eq('slot', slot);

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.error('[UserPromptAssets] list failed:', error);
      return jsonResponse({ error: '列表加载失败', items: [] }, 500);
    }
    return jsonResponse({
      items: (data as PromptAssetRow[] | null)?.map(rowToClient) || []
    });
  }

  if (request.method === 'POST') {
    const payload = (await request
      .json()
      .catch(() => null)) as UserPromptAssetPayload | null;
    if (!payload) {
      return jsonResponse({ error: '请求体格式错误' }, 400);
    }

    const slot = (payload.slot || '').trim();
    if (!ALLOWED_SLOTS.has(slot)) {
      return jsonResponse({ error: 'invalid slot' }, 400);
    }
    const prompt = clampText(payload.prompt);
    if (!prompt) {
      return jsonResponse({ error: 'prompt 不能为空' }, 400);
    }
    const thumbnailUrl = (payload.thumbnailUrl || '').trim();

    const title = clampText(payload.title, 60) || '未命名素材';
    const subtitle = clampText(payload.subtitle, 80);
    const negativePrompt = payload.negativePrompt
      ? clampText(payload.negativePrompt)
      : null;
    const tags = sanitizeTags(payload.tags);

    const metadata: Record<string, unknown> = {
      source:
        payload.source === 'prompt_import' ? 'prompt_import' : 'user_upload'
    };
    if (payload.promptZh && payload.promptZh.trim()) {
      metadata.promptZh = clampText(payload.promptZh);
    }
    if (payload.negativePromptZh && payload.negativePromptZh.trim()) {
      metadata.negativePromptZh = clampText(payload.negativePromptZh);
    }
    if (
      payload.source === 'prompt_import' &&
      payload.sourcePrompt &&
      payload.sourcePrompt.trim()
    ) {
      metadata.sourcePrompt = clampText(payload.sourcePrompt, 4000);
    }

    const id =
      payload.id?.trim() ||
      `user-${userId.slice(0, 8)}-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;

    // 不传 published_at —— 该列 NOT NULL，依赖 DEFAULT now()。
    // 即使 is_published=false，published_at 也只是"创建时间戳"，对外不可见。
    const row = {
      id,
      slot,
      title,
      subtitle,
      prompt,
      negative_prompt: negativePrompt,
      tags,
      thumbnail_url: thumbnailUrl,
      provider: 'user',
      visual: {},
      metadata,
      sort_order: 0,
      is_published: false,
      owner_user_id: userId
    };

    const { data, error } = await supabase
      .from('prompt_assets')
      .upsert(row, { onConflict: 'id' })
      .select(
        'id, slot, title, subtitle, prompt, negative_prompt, tags, thumbnail_url, visual, metadata, sort_order, created_at, updated_at, owner_user_id'
      )
      .single();
    if (error || !data) {
      console.error('[UserPromptAssets] upsert failed:', error);
      return jsonResponse(
        { error: '保存失败', detail: error?.message || 'unknown' },
        500
      );
    }
    return jsonResponse({ item: rowToClient(data as PromptAssetRow) });
  }

  if (request.method === 'DELETE') {
    const url = new URL(request.url);
    const id = url.searchParams.get('id')?.trim();
    if (!id) {
      return jsonResponse({ error: 'missing id' }, 400);
    }
    const { error } = await supabase
      .from('prompt_assets')
      .delete()
      .eq('id', id)
      .eq('owner_user_id', userId);
    if (error) {
      console.error('[UserPromptAssets] delete failed:', error);
      return jsonResponse({ error: '删除失败' }, 500);
    }
    return jsonResponse({ success: true });
  }

  return jsonResponse({ error: 'Method not allowed' }, 405);
}
