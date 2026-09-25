/**
 * Workspace Projects API - Detail, Update & Delete
 * GET: 获取单个项目详情
 * PATCH: 更新项目信息
 * DELETE: 删除项目（素材移至 Inbox）
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  getUserIdFromRequest,
  getCorsHeadersForRequest,
  getSupabaseAdmin
} from '../../utils/auth';

export const config = {
    runtime: 'edge',
};

// 使用共享的 Supabase Admin 客户端
function getSupabase(): SupabaseClient | null {
    return getSupabaseAdmin();
}

// 项目更新输入定义
interface ProjectUpdateInput {
    name?: string;
    description?: string;
    icon?: string;
    color?: string;
    sort_order?: number;
    archived?: boolean;
    favorited?: boolean;
    /** ChatGPT-style 项目自定义指令;传 null/'' 清空 */
    instructions?: string | null;
}

const INSTRUCTIONS_MAX_LENGTH = 8000;

export default async function handler(request: Request) {
    const corsHeaders = getCorsHeadersForRequest(request);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Get project ID from URL
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const projectId = pathParts[pathParts.length - 1];

    if (!projectId || projectId === '[id]') {
        return new Response(
            JSON.stringify({ error: '无效的项目 ID' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    const userId = await getUserIdFromRequest(request);
    if (!userId) {
        return new Response(
            JSON.stringify({ error: '请先登录' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    const sb = getSupabase();
    if (!sb) {
        return new Response(
            JSON.stringify({ error: '数据库未配置' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // GET: 获取项目详情
    if (request.method === 'GET') {
        try {
            const { data: project, error } = await sb
                .from('workspace_projects')
                .select('*')
                .eq('id', projectId)
                .eq('user_id', userId)
                .single();

            if (error || !project) {
                return new Response(
                    JSON.stringify({ error: '项目不存在' }),
                    { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            const [summariesResult, conversationsResult] = await Promise.all([
                sb
                    .from('summaries')
                    .select('id', { count: 'exact', head: true })
                    .eq('project_id', projectId)
                    .eq('user_id', userId),
                sb
                    .from('conversations')
                    .select('id', { count: 'exact', head: true })
                    .eq('project_id', projectId)
                    .eq('user_id', userId)
            ]);

            if (summariesResult.error) throw summariesResult.error;
            if (conversationsResult.error) throw conversationsResult.error;

            return new Response(
                JSON.stringify({
                    project: {
                        id: project.id,
                        name: project.name,
                        description: project.description,
                        icon: project.icon,
                        color: project.color,
                        isDefault: project.is_default,
                        sortOrder: project.sort_order,
                        summaryCount: summariesResult.count || 0,
                        conversationCount: conversationsResult.count || 0,
                        createdAt: new Date(project.created_at).getTime(),
                        updatedAt: new Date(project.updated_at).getTime(),
                        instructions: project.instructions ?? null
                    }
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        } catch (error: unknown) {
            return new Response(
                JSON.stringify({ error: '获取项目失败', details: error instanceof Error ? error.message : 'Unknown error' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }
    }

    // PATCH: 更新项目
    if (request.method === 'PATCH') {
        try {
            const body = await request.json() as ProjectUpdateInput;
            const { name, description, icon, color, sort_order, archived, favorited, instructions } = body;

            const updates: Record<string, unknown> = {};
            if (name !== undefined) updates.name = name;
            if (description !== undefined) updates.description = description;
            if (icon !== undefined) updates.icon = icon;
            if (color !== undefined) updates.color = color;
            if (sort_order !== undefined) updates.sort_order = sort_order;

            // 处理归档状态
            if (archived !== undefined) {
                updates.archived_at = archived ? new Date().toISOString() : null;
            }

            // 处理收藏状态
            if (favorited !== undefined) {
                updates.favorited_at = favorited ? new Date().toISOString() : null;
            }

            // 项目指令(ChatGPT-style):空串/null 清空,非空截断 8000 字符
            if (instructions !== undefined) {
                if (instructions === null || instructions === '') {
                    updates.instructions = null;
                } else if (typeof instructions === 'string') {
                    updates.instructions = instructions.slice(0, INSTRUCTIONS_MAX_LENGTH);
                }
            }

            const { data: project, error } = await sb
                .from('workspace_projects')
                .update(updates)
                .eq('id', projectId)
                .eq('user_id', userId)
                .select()
                .single();

            if (error) throw error;

            return new Response(
                JSON.stringify({ project, success: true }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        } catch (error: unknown) {
            return new Response(
                JSON.stringify({ error: '更新项目失败', details: error instanceof Error ? error.message : 'Unknown error' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }
    }

    // DELETE: 删除项目
    if (request.method === 'DELETE') {
        try {
            // 1. 验证项目存在且不是默认项目
            const { data: project, error: getError } = await sb
                .from('workspace_projects')
                .select('is_default')
                .eq('id', projectId)
                .eq('user_id', userId)
                .single();

            if (getError || !project) {
                return new Response(
                    JSON.stringify({ error: '项目不存在' }),
                    { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            if (project.is_default) {
                return new Response(
                    JSON.stringify({ error: '默认项目不能删除' }),
                    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            // 2. 获取默认项目 ID
            const { data: defaultProject } = await sb
                .from('workspace_projects')
                .select('id')
                .eq('user_id', userId)
                .eq('is_default', true)
                .single();

            if (defaultProject) {
                // 3. 将该项目的素材移至默认项目
                await sb
                    .from('summaries')
                    .update({ project_id: defaultProject.id })
                    .eq('project_id', projectId)
                    .eq('user_id', userId);

                await sb
                    .from('conversations')
                    .update({ project_id: defaultProject.id })
                    .eq('project_id', projectId)
                    .eq('user_id', userId);
            }

            // 4. 删除项目
            const { error: deleteError } = await sb
                .from('workspace_projects')
                .delete()
                .eq('id', projectId)
                .eq('user_id', userId);

            if (deleteError) throw deleteError;

            return new Response(
                JSON.stringify({ success: true }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        } catch (error: unknown) {
            return new Response(
                JSON.stringify({ error: '删除项目失败', details: error instanceof Error ? error.message : 'Unknown error' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }
    }

    return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
}
