/**
 * Workspace Cards Reorder API
 * POST: 批量更新卡片 position
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

interface ReorderItem {
  id: string;
  position: number;
}

interface ReorderRequest {
  projectId: string;
  items: ReorderItem[];
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

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
  }

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return jsonResponse({ error: '请先登录' }, corsHeaders, 401);
  }

  const sb = getSupabase();
  if (!sb) {
    return jsonResponse({ error: '数据库未配置' }, corsHeaders, 500);
  }

  try {
    const body = (await request.json()) as ReorderRequest;

    if (!body.projectId || !isValidUuid(body.projectId)) {
      return jsonResponse({ error: 'Invalid projectId' }, corsHeaders, 400);
    }

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return jsonResponse({ error: 'items 不能为空' }, corsHeaders, 400);
    }

    if (body.items.length > 200) {
      return jsonResponse(
        { error: '单次重排最多 200 张卡片' },
        corsHeaders,
        400
      );
    }

    for (const item of body.items) {
      if (!isValidUuid(item.id)) {
        return jsonResponse(
          { error: 'Invalid card id in items' },
          corsHeaders,
          400
        );
      }
      if (typeof item.position !== 'number' || Number.isNaN(item.position)) {
        return jsonResponse(
          { error: 'Invalid position in items' },
          corsHeaders,
          400
        );
      }
    }

    const { data: project, error: projectError } = await sb
      .from('workspace_projects')
      .select('id')
      .eq('id', body.projectId)
      .eq('user_id', userId)
      .single();

    if (projectError || !project) {
      return jsonResponse(
        { error: '项目不存在或无权限访问' },
        corsHeaders,
        403
      );
    }

    const cardIds = body.items.map((item) => item.id);

    const { data: cards, error: cardsError } = await sb
      .from('cards')
      .select('id')
      .eq('project_id', body.projectId)
      .in('id', cardIds);

    if (cardsError) {
      throw cardsError;
    }

    const existingIds = new Set((cards || []).map((card) => card.id));
    if (existingIds.size !== cardIds.length) {
      return jsonResponse(
        { error: '包含不存在或无权限的卡片' },
        corsHeaders,
        400
      );
    }

    const updates = body.items.map((item) =>
      sb.from('cards').update({ position: item.position }).eq('id', item.id)
    );

    const results = await Promise.all(updates);
    const failed = results.find((result) => result.error);

    if (failed?.error) {
      return jsonResponse(
        {
          error: '更新排序失败',
          details: failed.error.message
        },
        corsHeaders,
        500
      );
    }

    return jsonResponse(
      { success: true, updated: body.items.length },
      corsHeaders
    );
  } catch (error: unknown) {
    return jsonResponse(
      {
        error: '重排失败',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      corsHeaders,
      500
    );
  }
}
