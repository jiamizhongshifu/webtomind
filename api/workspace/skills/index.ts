/**
 * Skills API - List & Create
 * GET: 获取用户的 Skills 列表
 * POST: 创建新 Skill
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
  SKILLS_CREATE_RATE_LIMIT,
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

/**
 * 验证字符串数组
 */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

/**
 * 验证 Skill 名称格式
 * - 长度 1-100
 * - 只允许字母、数字、下划线、中划线、中文
 */
function isValidSkillName(name: unknown): name is string {
  if (typeof name !== 'string') return false;
  if (name.length < 1 || name.length > 100) return false;
  // 允许字母、数字、下划线、中划线、中文
  return /^[\w\u4e00-\u9fa5-]+$/.test(name);
}

/**
 * 验证触发词
 * - 必须是字符串数组
 * - 每个触发词长度 1-50
 */
function isValidTriggers(triggers: unknown): triggers is string[] {
  if (!isStringArray(triggers)) return false;
  return triggers.every(t => t.length >= 1 && t.length <= 50);
}

/**
 * 验证优先级
 * - 必须是 0-100 的整数
 */
function isValidPriority(priority: unknown): priority is number {
  if (typeof priority !== 'number') return false;
  return Number.isInteger(priority) && priority >= 0 && priority <= 100;
}

/**
 * 验证图标
 * - 必须是 emoji 或短字符串
 */
function isValidIcon(icon: unknown): icon is string {
  if (typeof icon !== 'string') return false;
  return icon.length >= 1 && icon.length <= 10;
}

/**
 * 验证分类
 */
const VALID_CATEGORIES = ['custom', 'content', 'search', 'export', 'analysis', 'creative', 'utility', 'template'];
function isValidCategory(category: unknown): category is string {
  return typeof category === 'string' && VALID_CATEGORIES.includes(category);
}

export interface Skill {
  id: string;
  source: 'user';
  name: string;
  displayName: string;
  description: string | null;
  icon: string;
  triggers: string[];
  coreInstructions: string;
  outputType: string | null;
  associatedTools: string[];
  defaultOptions: Record<string, unknown>;
  category: string;
  priority: number;
  sortOrder: number;
  isActive: boolean;
  useCount: number;
  createdAt: number;
  updatedAt: number;
  // 官方标准字段
  allowedTools: string[];
  license: string | null;
  compatibility: string | null;
  metadata: Record<string, string>;
}

export default async function handler(request: Request) {
  // CORS 预检请求
  if (request.method === 'OPTIONS') {
    return handleCorsPreflightRequest();
  }

  // 验证用户 - 使用共享 JWT Parser
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return errors.unauthorized();
  }

  // ============================================
  // 速率限制检查
  // ============================================
  const rateLimitConfig = request.method === 'POST' 
    ? SKILLS_CREATE_RATE_LIMIT 
    : SKILLS_RATE_LIMIT;
  const rateLimitResult = checkRateLimit(userId, rateLimitConfig);
  
  if (!rateLimitResult.allowed) {
    return rateLimitExceededResponse(rateLimitResult);
  }

  const sb = getSupabase();
  if (!sb) {
    return errors.serverError('数据库未配置');
  }

  // GET: 获取 Skills 列表
  if (request.method === 'GET') {
    try {
      const url = new URL(request.url);
      const activeOnly = url.searchParams.get('active') !== 'false';
      const listMode = url.searchParams.get('mode') === 'list';

      // 列表模式：只获取必要字段（不含大文本 coreInstructions）
      const selectFields = listMode
        ? 'id, name, display_name, description, icon, triggers, output_type, associated_tools, default_options, category, priority, sort_order, is_active, use_count, created_at, updated_at, allowed_tools, license, compatibility, metadata'
        : '*';

      let query = sb
        .from('skills')
        .select(selectFields)
        .eq('user_id', userId)
        .order('sort_order', { ascending: true });

      // 服务端过滤激活状态
      if (activeOnly) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;

      if (error) throw error;

      // 添加速率限制响应头
      const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const skills: Skill[] = ((data || []) as any[]).map((s: Record<string, unknown>) => ({
        id: s.id as string,
        source: 'user',
        name: s.name as string,
        displayName: (s.display_name || s.name) as string,
        description: s.description as string | null,
        icon: (s.icon || '🔧') as string,
        triggers: (s.triggers || []) as string[],
        coreInstructions: (s.core_instructions || '') as string,
        outputType: s.output_type as string | null,
        associatedTools: (s.associated_tools || []) as string[],
        defaultOptions: (s.default_options || {}) as Record<string, unknown>,
        category: (s.category || 'custom') as string,
        priority: (s.priority || 50) as number,
        sortOrder: (s.sort_order || 0) as number,
        isActive: s.is_active !== false,
        useCount: (s.use_count || 0) as number,
        createdAt: new Date(s.created_at as string).getTime(),
        updatedAt: new Date(s.updated_at as string).getTime(),
        // 官方标准字段
        allowedTools: (s.allowed_tools || []) as string[],
        license: (s.license || null) as string | null,
        compatibility: (s.compatibility || null) as string | null,
        metadata: (s.metadata || {}) as Record<string, string>,
      }));

      return jsonResponse({ skills }, 200, rateLimitHeaders);
    } catch (error) {
      console.error('[API] Get skills error:', error);
      return errors.serverError('获取 Skills 失败');
    }
  }

  // POST: 创建新 Skill
  if (request.method === 'POST') {
    try {
      const body = await request.json() as {
        name: string;
        displayName?: string;
        description?: string;
        icon?: string;
        triggers: string[];
        coreInstructions: string;
        outputType?: string;
        associatedTools?: string[];
        defaultOptions?: Record<string, unknown>;
        category?: string;
        priority?: number;
        // 官方标准字段
        allowedTools?: string[];
        license?: string;
        compatibility?: string;
        metadata?: Record<string, string>;
      };

      // ============================================
      // 输入验证
      // ============================================
      
      // 必填字段验证
      if (!body.name || !body.coreInstructions) {
        return errors.badRequest('名称和核心指令不能为空');
      }

      // 名称格式验证
      if (!isValidSkillName(body.name)) {
        return errors.badRequest('名称格式无效：长度 1-100，只允许字母、数字、下划线、中划线、中文');
      }

      // 核心指令长度验证
      if (body.coreInstructions.length > 50000) {
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

      // 关联工具验证
      if (body.associatedTools !== undefined && !isStringArray(body.associatedTools)) {
        return errors.badRequest('关联工具格式无效：必须是字符串数组');
      }

      // 允许工具验证
      if (body.allowedTools !== undefined && !isStringArray(body.allowedTools)) {
        return errors.badRequest('允许工具格式无效：必须是字符串数组');
      }

      // 获取最小 sort_order
      const { data: minOrder } = await sb
        .from('skills')
        .select('sort_order')
        .eq('user_id', userId)
        .order('sort_order', { ascending: true })
        .limit(1)
        .single();

      const sortOrder = (minOrder?.sort_order ?? 1) - 1;

      const { data, error } = await sb
        .from('skills')
        .insert({
          user_id: userId,
          name: body.name,
          display_name: body.displayName || body.name,
          description: body.description,
          icon: body.icon || '🔧',
          triggers: body.triggers || [],
          core_instructions: body.coreInstructions,
          output_type: body.outputType,
          associated_tools: body.associatedTools || [],
          default_options: body.defaultOptions || {},
          category: body.category || 'custom',
          priority: body.priority || 50,
          sort_order: sortOrder,
          // 官方标准字段
          allowed_tools: body.allowedTools || [],
          license: body.license || null,
          compatibility: body.compatibility || null,
          metadata: body.metadata || {},
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          return errors.badRequest('已存在同名 Skill');
        }
        throw error;
      }

      return jsonResponse({ id: data.id, success: true }, 201, createRateLimitHeaders(rateLimitResult));
    } catch (error) {
      console.error('[API] Create skill error:', error);
      return errors.serverError('创建 Skill 失败');
    }
  }

  return errors.methodNotAllowed();
}
