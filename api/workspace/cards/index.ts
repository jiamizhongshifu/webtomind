/**
 * Workspace Cards API - List & Create
 * GET: 获取项目卡片列表
 * POST: 创建卡片
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

interface CreateCardRequest {
  projectId: string;
  type: CardType;
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

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return jsonResponse({ error: '请先登录' }, corsHeaders, 401);
  }

  const sb = getSupabase();
  if (!sb) {
    return jsonResponse({ error: '数据库未配置' }, corsHeaders, 500);
  }

  if (request.method === 'GET') {
    try {
      const url = new URL(request.url);
      const projectId = url.searchParams.get('project_id') || '';
      const limit = Math.min(
        Math.max(parseInt(url.searchParams.get('limit') || '100', 10), 1),
        200
      );
      const offset = Math.max(
        parseInt(url.searchParams.get('offset') || '0', 10),
        0
      );

      if (!projectId || !isValidUuid(projectId)) {
        return jsonResponse({ error: 'Invalid project_id' }, corsHeaders, 400);
      }

      const { data: project, error: projectError } = await sb
        .from('workspace_projects')
        .select('id')
        .eq('id', projectId)
        .eq('user_id', userId)
        .single();

      if (projectError || !project) {
        return jsonResponse(
          { error: '项目不存在或无权限访问' },
          corsHeaders,
          403
        );
      }

      const { data: cards, error: cardsError } = await sb
        .from('cards')
        .select('*')
        .eq('project_id', projectId)
        .order('position', { ascending: true })
        .range(offset, offset + limit - 1);

      if (cardsError) {
        throw cardsError;
      }

      return jsonResponse(
        {
          cards: cards || [],
          hasMore: (cards || []).length === limit
        },
        corsHeaders
      );
    } catch (error: unknown) {
      return jsonResponse(
        {
          error: '获取卡片失败',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        corsHeaders,
        500
      );
    }
  }

  if (request.method === 'POST') {
    try {
      const body = (await request.json()) as CreateCardRequest;
      const projectId = body.projectId;

      if (!projectId || !isValidUuid(projectId)) {
        return jsonResponse({ error: 'Invalid projectId' }, corsHeaders, 400);
      }

      if (!ALLOWED_CARD_TYPES.has(body.type)) {
        return jsonResponse({ error: 'Invalid card type' }, corsHeaders, 400);
      }

      if (body.parentId && !isValidUuid(body.parentId)) {
        return jsonResponse({ error: 'Invalid parentId' }, corsHeaders, 400);
      }

      const { data: project, error: projectError } = await sb
        .from('workspace_projects')
        .select('id')
        .eq('id', projectId)
        .eq('user_id', userId)
        .single();

      if (projectError || !project) {
        return jsonResponse(
          { error: '项目不存在或无权限访问' },
          corsHeaders,
          403
        );
      }

      let position = body.position;
      if (typeof position !== 'number' || Number.isNaN(position)) {
        const { data: lastCard } = await sb
          .from('cards')
          .select('position')
          .eq('project_id', projectId)
          .order('position', { ascending: false })
          .limit(1)
          .single();

        position = (lastCard?.position ?? 0) + 1;
      }

      const { data: card, error: insertError } = await sb
        .from('cards')
        .insert({
          project_id: projectId,
          type: body.type,
          content: body.content || {},
          meta_data: body.metaData || {},
          position,
          parent_id: body.parentId || null
        })
        .select('*')
        .single();

      if (insertError) {
        throw insertError;
      }

      return jsonResponse(
        {
          success: true,
          card
        },
        corsHeaders
      );
    } catch (error: unknown) {
      return jsonResponse(
        {
          error: '创建卡片失败',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        corsHeaders,
        500
      );
    }
  }

  return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
}
