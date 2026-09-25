/**
 * Workspace Summaries API - Single Summary Operations
 * GET: Get a single summary by ID
 * PATCH: Update a summary
 * DELETE: Delete a summary
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  getUserIdFromRequest,
  getCorsHeadersForRequest,
  getSupabaseAdmin,
  getRuntimeEnvValue
} from '../../utils/auth';
import {
  debugLog,
  safeErrorLog,
  safeWarnLog
} from '../../utils/logging';
import { processSummaryContentMedia } from './media';

export const config = {
  runtime: 'edge'
};

// 使用共享的 Supabase Admin 客户端
function getSupabase(): SupabaseClient | null {
  return getSupabaseAdmin();
}

function sanitizeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

// Extract ID from URL path
function getIdFromUrl(request: Request): string | null {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  // Path format: /api/workspace/summaries/[id]
  return pathParts[pathParts.length - 1] || null;
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const id = getIdFromUrl(request);
  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing summary ID' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const sb = getSupabase();
  if (!sb) {
    return new Response(JSON.stringify({ error: '数据库未配置' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const userId = await getUserIdFromRequest(request);

  // 调试日志
  if (!userId) {
    return new Response(JSON.stringify({ error: '请先登录' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // GET: Get a single summary
  if (request.method === 'GET') {
    try {
      let query = sb.from('summaries').select('*').eq('id', id);

      query = query.eq('user_id', userId);
      debugLog('[API] GET query with user filter');

      const { data, error } = await query.single();

      debugLog('[API] GET result', {
        found: !!data,
        hasError: !!error
      });

      if (error && error.code !== 'PGRST116') throw error;
      if (!data) {
        debugLog('[API] Summary not found', { hasUser: !!userId });
        return new Response(JSON.stringify({ error: '总结不存在' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Query share status for this summary
      let shareStatus = {
        is_shared: false,
        share_url: null as string | null,
        share_token: null as string | null
      };

      try {
        const { data: shareLink } = await sb
          .from('share_links')
          .select('token')
          .eq('summary_id', id)
          .eq('is_active', true)
          .single();

        if (shareLink) {
          const baseUrl =
            getRuntimeEnvValue('NEXT_PUBLIC_BASE_URL') || 'https://webtomind.com';
          shareStatus = {
            is_shared: true,
            share_url: `${baseUrl}/s/${shareLink.token}`,
            share_token: shareLink.token
          };
        }
      } catch {
        // No active share link found, that's fine
        debugLog('[API] No active share link for summary');
      }

      debugLog('[API] Summary found', {
        hasProject: !!data.project_id,
        hasContentType: !!data.content_type,
        isShared: shareStatus.is_shared,
        markdownLength: data.markdown?.length || 0
      });
      return new Response(
        JSON.stringify({
          summary: {
            id: data.id,
            title: data.title,
            url: data.url,
            markdown: data.markdown,
            tags: data.tags,
            projectId: data.project_id,
            contentType: data.content_type,
            metadata: sanitizeMetadata(data.metadata),
            createdAt: new Date(data.created_at).getTime(),
            shareStatus
          }
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    } catch (error) {
      safeErrorLog('[API] Get summary error', error);
      return new Response(JSON.stringify({ error: '获取总结失败' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // PATCH: Update a summary
  if (request.method === 'PATCH') {
    try {
      if (!userId) {
        return new Response(JSON.stringify({ error: '请先登录后再编辑笔记' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const body = (await request.json()) as {
        title?: string;
        markdown?: string;
        tags?: string[];
        metadata?: Record<string, unknown>;
      };
      const { title, markdown, tags, metadata } = body;

      // 只更新提供的字段
      const updates: Record<string, unknown> = {};
      if (title !== undefined) updates.title = title;
      if (tags !== undefined) updates.tags = tags;
      if (metadata !== undefined) updates.metadata = sanitizeMetadata(metadata);

      // 处理 markdown 中的 base64 媒体
      if (markdown !== undefined) {
        if (
          markdown.includes('data:image') ||
          markdown.includes('data:video')
        ) {
          debugLog('[API] PATCH - Processing base64 media in markdown', {
            markdownLength: markdown.length
          });
          try {
            updates.markdown = await processSummaryContentMedia(
              sb,
              markdown,
              userId
            );
          } catch (mediaError) {
            safeErrorLog('[API] PATCH - Media processing failed', mediaError);
            updates.markdown = markdown;
          }
        } else {
          updates.markdown = markdown;
        }
      }

      if (Object.keys(updates).length === 0) {
        return new Response(JSON.stringify({ error: '没有提供更新字段' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const query = sb
        .from('summaries')
        .update(updates)
        .eq('id', id)
        .eq('user_id', userId);

      const { error } = await query;

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (error) {
      safeErrorLog('[API] Update summary error', error);
      return new Response(JSON.stringify({ error: '更新失败' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // DELETE: Soft delete a summary (move to trash)
  if (request.method === 'DELETE') {
    try {
      debugLog('[API] Soft delete request', { hasUser: !!userId });

      // 软删除：设置 deleted_at 时间戳
      let query = sb
        .from('summaries')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .is('deleted_at', null); // 只能删除未删除的记录

      query = query.eq('user_id', userId);

      const { data, error } = await query.select();

      debugLog('[API] Soft delete result', {
        deletedCount: data?.length || 0,
        hasError: !!error
      });

      if (error) {
        safeErrorLog('[API] Soft delete query error', error);
        throw error;
      }

      // 检查是否真正删除了记录
      if (!data || data.length === 0) {
        safeWarnLog('[API] No records soft deleted', { hasUser: !!userId });
        return new Response(
          JSON.stringify({
            success: false,
            error: '记录不存在或无权限删除',
            deleted: false
          }),
          {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      debugLog('[API] Successfully soft deleted', { count: data.length });
      return new Response(
        JSON.stringify({ success: true, deleted: true, count: data.length }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    } catch (error) {
      safeErrorLog('[API] Soft delete summary error', error);
      return new Response(JSON.stringify({ error: '删除失败' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // Method not allowed
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
