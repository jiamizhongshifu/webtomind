/**
 * Workspace Cards API - Single Card Operations
 * GET: 获取卡片
 * PATCH: 更新卡片
 * DELETE: 删除卡片
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  getUserIdFromRequest,
  getCorsHeadersForRequest,
  getSupabaseAdmin
} from '../../utils/auth';

export const config = {
  runtime: 'edge'
};

type CardType = 'source' | 'note' | 'ai_gen' | 'insight';

const ALLOWED_CARD_TYPES = new Set<CardType>([
  'source',
  'note',
  'ai_gen',
  'insight'
]);

interface UpdateCardRequest {
  type?: CardType;
  content?: Record<string, unknown>;
  metaData?: Record<string, unknown>;
  position?: number;
  parentId?: string | null;
}

function getSupabase(): SupabaseClient | null {
  return getSupabaseAdmin();
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

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function getIdFromUrl(request: Request): string | null {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  return pathParts[pathParts.length - 1] || null;
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return jsonResponse({ error: '请先登录' }, corsHeaders, 401);
  }

  const cardId = getIdFromUrl(request);
  if (!cardId || !isValidUuid(cardId)) {
    return jsonResponse({ error: 'Invalid card id' }, corsHeaders, 400);
  }

  const sb = getSupabase();
  if (!sb) {
    return jsonResponse({ error: '数据库未配置' }, corsHeaders, 500);
  }

  const { data: card, error: cardError } = await sb
    .from('cards')
    .select('id, project_id')
    .eq('id', cardId)
    .single();

  if (cardError || !card) {
    return jsonResponse({ error: '卡片不存在' }, corsHeaders, 404);
  }

  const { data: project, error: projectError } = await sb
    .from('workspace_projects')
    .select('id')
    .eq('id', card.project_id)
    .eq('user_id', userId)
    .single();

  if (projectError || !project) {
    return jsonResponse({ error: '无权限访问该卡片' }, corsHeaders, 403);
  }

  if (request.method === 'GET') {
    const { data, error } = await sb
      .from('cards')
      .select('*')
      .eq('id', cardId)
      .single();

    if (error || !data) {
      return jsonResponse({ error: '卡片不存在' }, corsHeaders, 404);
    }

    return jsonResponse({ card: data }, corsHeaders);
  }

  if (request.method === 'PATCH') {
    try {
      const body = (await request.json()) as UpdateCardRequest;
      const updates: Record<string, unknown> = {};

      if (body.type !== undefined) {
        if (!ALLOWED_CARD_TYPES.has(body.type)) {
          return jsonResponse({ error: 'Invalid card type' }, corsHeaders, 400);
        }
        updates.type = body.type;
      }

      if (body.content !== undefined) {
        updates.content = body.content;
      }

      if (body.metaData !== undefined) {
        updates.meta_data = body.metaData;
      }

      if (body.position !== undefined) {
        if (typeof body.position !== 'number' || Number.isNaN(body.position)) {
          return jsonResponse({ error: 'Invalid position' }, corsHeaders, 400);
        }
        updates.position = body.position;
      }

      if (body.parentId !== undefined) {
        if (body.parentId !== null && !isValidUuid(body.parentId)) {
          return jsonResponse({ error: 'Invalid parentId' }, corsHeaders, 400);
        }
        updates.parent_id = body.parentId;
      }

      if (Object.keys(updates).length === 0) {
        return jsonResponse({ error: 'No updates provided' }, corsHeaders, 400);
      }

      const { data, error } = await sb
        .from('cards')
        .update(updates)
        .eq('id', cardId)
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      return jsonResponse({ success: true, card: data }, corsHeaders);
    } catch (error: unknown) {
      return jsonResponse(
        {
          error: '更新卡片失败',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        corsHeaders,
        500
      );
    }
  }

  if (request.method === 'DELETE') {
    const { error } = await sb.from('cards').delete().eq('id', cardId);
    if (error) {
      return jsonResponse(
        {
          error: '删除卡片失败',
          details: error.message
        },
        corsHeaders,
        500
      );
    }

    return jsonResponse({ success: true }, corsHeaders);
  }

  return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
}
