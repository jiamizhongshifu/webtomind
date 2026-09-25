/**
 * Skill References API
 * Layer 3: 参考文档管理
 * 
 * GET /api/workspace/skills/references?skill_id=xxx - 获取技能的所有参考文档
 * POST /api/workspace/skills/references - 创建参考文档
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getUserIdFromRequest } from '../../utils/auth';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errors,
} from '../../../server/src/utils/cors-handler';

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

interface ReferenceInput {
  skill_id: string;
  name: string;
  content: string;
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

  // GET: 获取技能的所有参考文档
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const skillId = url.searchParams.get('skill_id');
    
    if (!skillId) {
      return errors.badRequest('缺少 skill_id 参数');
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

      // 获取参考文档列表
      const { data: references, error } = await sb
        .from('skill_references')
        .select('id, name, description, word_count, created_at, updated_at')
        .eq('skill_id', skillId)
        .order('name');

      if (error) {
        console.error('[References API] Query error:', error);
        return errors.serverError('查询失败');
      }

      return jsonResponse({ references: references || [] });
    } catch (error) {
      console.error('[References API] Error:', error);
      return errors.serverError('服务器错误');
    }
  }

  // POST: 创建参考文档
  if (request.method === 'POST') {
    try {
      const body = await request.json() as ReferenceInput;
      
      if (!body.skill_id || !body.name || !body.content) {
        return errors.badRequest('缺少必需字段: skill_id, name, content');
      }

      // 验证用户拥有该技能
      const { data: skill, error: skillError } = await sb
        .from('skills')
        .select('id')
        .eq('id', body.skill_id)
        .eq('user_id', userId)
        .single();

      if (skillError || !skill) {
        return errors.notFound('技能不存在或无权访问');
      }

      // 创建参考文档
      const { data: reference, error } = await sb
        .from('skill_references')
        .insert({
          skill_id: body.skill_id,
          name: body.name,
          content: body.content,
          description: body.description,
        })
        .select('id, name, description, word_count, created_at')
        .single();

      if (error) {
        if (error.code === '23505') {
          return errors.badRequest('同名参考文档已存在');
        }
        console.error('[References API] Insert error:', error);
        return errors.serverError('创建失败');
      }

      return jsonResponse({ reference }, 201);
    } catch (error) {
      console.error('[References API] Error:', error);
      return errors.serverError('服务器错误');
    }
  }

  return errors.methodNotAllowed();
}
