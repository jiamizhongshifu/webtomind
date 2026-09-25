/**
 * Skills API - Single Skill Operations
 * GET: 获取单个 Skill
 * PATCH: 更新 Skill
 * DELETE: 删除 Skill
 * 
 * 重构版本：使用共享模块，添加输入验证
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getUserIdFromRequest } from '../../utils/auth';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errors,
} from '../../../server/src/utils/cors-handler';
import {
  checkRateLimit,
  createRateLimitHeaders,
  rateLimitExceededResponse,
  SKILLS_RATE_LIMIT,
} from '../../utils/rate-limiter';

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

// ============================================
// 输入验证工具函数
// ============================================

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isValidSkillName(name: unknown): name is string {
  if (typeof name !== 'string') return false;
  if (name.length < 1 || name.length > 100) return false;
  return /^[\w\u4e00-\u9fa5-]+$/.test(name);
}

function isValidTriggers(triggers: unknown): triggers is string[] {
  if (!isStringArray(triggers)) return false;
  return triggers.every(t => t.length >= 1 && t.length <= 50);
}

function isValidPriority(priority: unknown): priority is number {
  if (typeof priority !== 'number') return false;
  return Number.isInteger(priority) && priority >= 0 && priority <= 100;
}

function isValidIcon(icon: unknown): icon is string {
  if (typeof icon !== 'string') return false;
  return icon.length >= 1 && icon.length <= 10;
}

const VALID_CATEGORIES = ['custom', 'content', 'search', 'export', 'analysis', 'creative', 'utility', 'template'];
function isValidCategory(category: unknown): category is string {
  return typeof category === 'string' && VALID_CATEGORIES.includes(category);
}

function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export default async function handler(request: Request) {
  // CORS 预检请求
  if (request.method === 'OPTIONS') {
    return handleCorsPreflightRequest();
  }

  // 从 URL 提取 ID
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const id = pathParts[pathParts.length - 1];

  if (!id) {
    return errors.badRequest('缺少 Skill ID');
  }

  // 验证 ID 格式
  if (!isValidUUID(id)) {
    return errors.badRequest('无效的 Skill ID 格式');
  }

  // 验证用户 - 使用共享 JWT Parser
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return errors.unauthorized();
  }

  // ============================================
  // 速率限制检查
  // ============================================
  const rateLimitResult = checkRateLimit(userId, SKILLS_RATE_LIMIT);
  
  if (!rateLimitResult.allowed) {
    return rateLimitExceededResponse(rateLimitResult);
  }

  const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);

  const sb = getSupabase();
  if (!sb) {
    return errors.serverError('数据库未配置');
  }

  // GET: 获取单个 Skill
  if (request.method === 'GET') {
    try {
      const { data, error } = await sb
        .from('skills')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        return errors.notFound('Skill 不存在');
      }

      return jsonResponse({
        skill: {
          id: data.id,
          source: 'user',
          name: data.name,
          displayName: data.display_name || data.name,
          description: data.description,
          icon: data.icon || '🔧',
          triggers: data.triggers || [],
          coreInstructions: data.core_instructions,
          outputType: data.output_type,
          associatedTools: data.associated_tools || [],
          defaultOptions: data.default_options || {},
          category: data.category || 'custom',
          priority: data.priority || 50,
          sortOrder: data.sort_order || 0,
          isActive: data.is_active !== false,
          useCount: data.use_count || 0,
          createdAt: new Date(data.created_at).getTime(),
          updatedAt: new Date(data.updated_at).getTime(),
          // 官方标准字段
          allowedTools: data.allowed_tools || [],
          license: data.license || null,
          compatibility: data.compatibility || null,
          metadata: data.metadata || {},
        }
      }, 200, rateLimitHeaders);
    } catch (error) {
      console.error('[API] Get skill error:', error);
      return errors.serverError('获取 Skill 失败');
    }
  }

  // PATCH: 更新 Skill
  if (request.method === 'PATCH') {
    try {
      const body = await request.json() as {
        name?: string;
        displayName?: string;
        description?: string;
        icon?: string;
        triggers?: string[];
        coreInstructions?: string;
        outputType?: string;
        associatedTools?: string[];
        defaultOptions?: Record<string, unknown>;
        category?: string;
        priority?: number;
        sortOrder?: number;
        isActive?: boolean;
        // 官方标准字段
        allowedTools?: string[];
        license?: string | null;
        compatibility?: string | null;
        metadata?: Record<string, string>;
      };

      // ============================================
      // 输入验证
      // ============================================

      // 名称验证
      if (body.name !== undefined && !isValidSkillName(body.name)) {
        return errors.badRequest('名称格式无效：长度 1-100，只允许字母、数字、下划线、中划线、中文');
      }

      // 核心指令长度验证
      if (body.coreInstructions !== undefined && body.coreInstructions.length > 50000) {
        return errors.badRequest('核心指令过长，最大 50000 字符');
      }

      // 触发词验证
      if (body.triggers !== undefined && !isValidTriggers(body.triggers)) {
        return errors.badRequest('触发词格式无效：必须是字符串数组，每项长度 1-50');
      }

      // 图标验证
      if (body.icon !== undefined && !isValidIcon(body.icon)) {
        return errors.badRequest('图标格式无效：长度 1-10');
      }

      // 分类验证
      if (body.category !== undefined && !isValidCategory(body.category)) {
        return errors.badRequest(`分类无效，允许值: ${VALID_CATEGORIES.join(', ')}`);
      }

      // 优先级验证
      if (body.priority !== undefined && !isValidPriority(body.priority)) {
        return errors.badRequest('优先级无效：必须是 0-100 的整数');
      }

      // 排序验证
      if (body.sortOrder !== undefined && typeof body.sortOrder !== 'number') {
        return errors.badRequest('排序值必须是数字');
      }

      // 激活状态验证
      if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
        return errors.badRequest('激活状态必须是布尔值');
      }

      // 关联工具验证
      if (body.associatedTools !== undefined && !isStringArray(body.associatedTools)) {
        return errors.badRequest('关联工具格式无效：必须是字符串数组');
      }

      // 允许工具验证
      if (body.allowedTools !== undefined && !isStringArray(body.allowedTools)) {
        return errors.badRequest('允许工具格式无效：必须是字符串数组');
      }

      // metadata 验证
      if (body.metadata !== undefined) {
        if (typeof body.metadata !== 'object' || body.metadata === null || Array.isArray(body.metadata)) {
          return errors.badRequest('metadata 必须是对象');
        }
        for (const [key, value] of Object.entries(body.metadata)) {
          if (typeof key !== 'string' || typeof value !== 'string') {
            return errors.badRequest('metadata 的键和值必须都是字符串');
          }
        }
      }

      // ============================================
      // 构建更新数据
      // ============================================

      const updateData: Record<string, unknown> = {};
      if (body.name !== undefined) updateData.name = body.name;
      if (body.displayName !== undefined) updateData.display_name = body.displayName;
      if (body.description !== undefined) updateData.description = body.description;
      if (body.icon !== undefined) updateData.icon = body.icon;
      if (body.triggers !== undefined) updateData.triggers = body.triggers;
      if (body.coreInstructions !== undefined) updateData.core_instructions = body.coreInstructions;
      if (body.outputType !== undefined) updateData.output_type = body.outputType;
      if (body.associatedTools !== undefined) updateData.associated_tools = body.associatedTools;
      if (body.defaultOptions !== undefined) updateData.default_options = body.defaultOptions;
      if (body.category !== undefined) updateData.category = body.category;
      if (body.priority !== undefined) updateData.priority = body.priority;
      if (body.sortOrder !== undefined) updateData.sort_order = body.sortOrder;
      if (body.isActive !== undefined) updateData.is_active = body.isActive;
      // 官方标准字段
      if (body.allowedTools !== undefined) updateData.allowed_tools = body.allowedTools;
      if (body.license !== undefined) updateData.license = body.license;
      if (body.compatibility !== undefined) updateData.compatibility = body.compatibility;
      if (body.metadata !== undefined) updateData.metadata = body.metadata;

      // 检查是否有更新内容
      if (Object.keys(updateData).length === 0) {
        return errors.badRequest('没有提供要更新的字段');
      }

      const { error } = await sb
        .from('skills')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;

      return jsonResponse({ success: true }, 200, rateLimitHeaders);
    } catch (error) {
      console.error('[API] Update skill error:', error);
      return errors.serverError('更新 Skill 失败');
    }
  }

  // DELETE: 删除 Skill
  if (request.method === 'DELETE') {
    try {
      const { error } = await sb
        .from('skills')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;

      return jsonResponse({ success: true }, 200, rateLimitHeaders);
    } catch (error) {
      console.error('[API] Delete skill error:', error);
      return errors.serverError('删除 Skill 失败');
    }
  }

  return errors.methodNotAllowed();
}
