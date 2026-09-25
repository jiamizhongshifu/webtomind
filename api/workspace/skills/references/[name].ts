/**
 * Skill Reference Detail API
 * Layer 3: 单个参考文档管理
 * 
 * GET /api/workspace/skills/references/[name]?skill_id=xxx - 获取参考文档内容
 * PATCH /api/workspace/skills/references/[name]?skill_id=xxx - 更新参考文档
 * DELETE /api/workspace/skills/references/[name]?skill_id=xxx - 删除参考文档
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getUserIdFromRequest } from '../../../utils/auth';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errors,
} from '../../../../server/src/utils/cors-handler';

export const config = {
  runtime: 'edge',
};

let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient | null {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    supabase = createClient(url, key);
  }
  return supabase;
}

interface ReferenceUpdate {
  content?: string;
  description?: string;
}

export default async function handler(request: Request) {
  // CORS 预检请求
  if (request.method === 'OPTIONS') {
    return handleCorsPreflightRequest();
  }

  // 验证用户
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return errors.unauthorized();
  }

  const sb = getSupabase();
  if (!sb) {
    return errors.serverError('数据库未配置');
  }

  // 从 URL 获取参数
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const referenceName = decodeURIComponent(pathParts[pathParts.length - 1]);
  const skillId = url.searchParams.get('skill_id');

  if (!referenceName || !skillId) {
    return errors.badRequest('缺少 name 或 skill_id 参数');
  }

  try {
    // 验证用户拥有该技能
    const { data: skill, error: skillError } = await sb
      .from('skills')
      .select('id')
      .eq('id', skillId)
      .eq('user_id', userId)
      .single();

    if (skillError || !skill) {
      return errors.notFound('技能不存在或无权访问');
    }

    // GET: 获取参考文档内容
    if (request.method === 'GET') {
      const { data: reference, error } = await sb
        .from('skill_references')
        .select('id, name, content, description, word_count, created_at, updated_at')
        .eq('skill_id', skillId)
        .eq('name', referenceName)
        .single();

      if (error || !reference) {
        return errors.notFound('参考文档不存在');
      }

      return jsonResponse({ reference });
    }

    // PATCH: 更新参考文档
    if (request.method === 'PATCH') {
      const body = await request.json() as ReferenceUpdate;

      const updateData: Record<string, unknown> = {};
      if (body.content !== undefined) updateData.content = body.content;
      if (body.description !== undefined) updateData.description = body.description;

      if (Object.keys(updateData).length === 0) {
        return errors.badRequest('没有要更新的字段');
      }

      const { data: reference, error } = await sb
        .from('skill_references')
        .update(updateData)
        .eq('skill_id', skillId)
        .eq('name', referenceName)
        .select('id, name, description, word_count, updated_at')
        .single();

      if (error) {
        console.error('[Reference API] Update error:', error);
        return errors.serverError('更新失败');
      }

      if (!reference) {
        return errors.notFound('参考文档不存在');
      }

      return jsonResponse({ reference });
    }

    // DELETE: 删除参考文档
    if (request.method === 'DELETE') {
      const { error } = await sb
        .from('skill_references')
        .delete()
        .eq('skill_id', skillId)
        .eq('name', referenceName);

      if (error) {
        console.error('[Reference API] Delete error:', error);
        return errors.serverError('删除失败');
      }

      return jsonResponse({ success: true });
    }

    return errors.methodNotAllowed();
  } catch (error) {
    console.error('[Reference API] Error:', error);
    return errors.serverError('服务器错误');
  }
}
