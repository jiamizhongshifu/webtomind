/**
 * Workspace Summaries API - List & Create
 * GET: List all summaries
 * POST: Create a new summary
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  getUserIdFromRequest,
  getCorsHeadersForRequest,
  getSupabaseAdmin
} from '../../utils/auth';
import {
  debugLog,
  safeErrorLog,
  safeErrorSummary,
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

interface SummaryListRow {
  id: string;
  title: string;
  url: string;
  markdown_preview: string | null;
  tags: string[] | null;
  project_id: string | null;
  content_type: string | null;
  created_at: string;
  total_count: number | null;
}

function sanitizeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function getErrorDetails(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const maybeError = error as { message?: string; code?: string };
    return maybeError.message || maybeError.code || 'Unknown error';
  }
  return 'Unknown error';
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // GET: List all summaries
  if (request.method === 'GET') {
    try {
      const sb = getSupabase();
      if (!sb) {
        return new Response(JSON.stringify({ summaries: [] }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const authHeader = request.headers.get('Authorization');
      const userId = await getUserIdFromRequest(request);
      if (!userId) {
        return new Response(
          JSON.stringify({ summaries: [], hasMore: false, total: 0 }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // 调试日志
      debugLog('[API] Summaries GET', {
        hasAuth: !!authHeader,
        hasUser: !!userId
      });

      // 解析查询参数
      const url = new URL(request.url);
      const projectId = url.searchParams.get('project_id');
      const limitParam = Number(url.searchParams.get('limit') || 50);
      const offsetParam = Number(url.searchParams.get('offset') || 0);
      const limit = Math.min(
        Math.max(Number.isFinite(limitParam) ? limitParam : 50, 1),
        100
      );
      const offset = Math.max(
        Number.isFinite(offsetParam) ? offsetParam : 0,
        0
      );

      const { data, error } = await sb.rpc('list_workspace_summaries', {
        p_user_id: userId,
        p_project_id: projectId || null,
        p_limit: limit,
        p_offset: offset,
        p_preview_chars: 1200
      });

      if (error) throw error;

      const rows = (data || []) as SummaryListRow[];
      const total = Number(rows[0]?.total_count || offset + rows.length);
      const metadataById = new Map<string, Record<string, unknown>>();
      const summaryIds = rows.map((row) => row.id).filter(Boolean);
      if (summaryIds.length > 0) {
        const { data: metadataRows, error: metadataError } = await sb
          .from('summaries')
          .select('id, metadata')
          .in('id', summaryIds);
        if (metadataError) {
          safeWarnLog('[API] Summary metadata load failed', {
            ...safeErrorSummary(metadataError),
            summaryCount: summaryIds.length
          });
        } else {
          (metadataRows || []).forEach((row) => {
            metadataById.set(
              row.id,
              sanitizeMetadata((row as { metadata?: unknown }).metadata)
            );
          });
        }
      }

      const formatted = rows.map((s) => ({
        id: s.id,
        title: s.title,
        url: s.url,
        markdown: s.markdown_preview || '',
        tags: s.tags,
        projectId: s.project_id,
        contentType: s.content_type,
        metadata: metadataById.get(s.id) || {},
        createdAt: new Date(s.created_at).getTime()
      }));

      return new Response(
        JSON.stringify({
          summaries: formatted,
          hasMore: total > offset + rows.length,
          total
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    } catch (error) {
      safeErrorLog('[API] Get summaries error', error);
      return new Response(JSON.stringify({ error: '获取总结失败' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // POST: Create a new summary
  if (request.method === 'POST') {
    try {
      const body = (await request.json()) as {
        title?: string;
        url?: string;
        markdown?: string;
        tags?: string[];
        project_id?: string;
        content_type?: string;
        metadata?: Record<string, unknown>;
      };
      const { title, url, markdown, tags, project_id, content_type, metadata } =
        body;

      const authHeader = request.headers.get('Authorization');
      const authHeaderLower = request.headers.get('authorization');
      const contentType = request.headers.get('Content-Type');

      debugLog('[API] Summaries POST request', {
        hasAuth: !!authHeader,
        hasLowercaseAuth: !!authHeaderLower,
        contentType,
        titleLength: title?.length,
        markdownLength: markdown?.length
      });

      if (!title || !markdown) {
        return new Response(JSON.stringify({ error: '标题和内容不能为空' }), {
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
      debugLog('[API] Summaries POST - auth resolved', { hasUser: !!userId });

      // 🔒 安全检查：必须登录才能创建笔记
      if (!userId) {
        safeWarnLog('[API] Summaries POST rejected: no user');
        return new Response(JSON.stringify({ error: '请先登录后再保存笔记' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 校验项目归属，防止写入到其他用户项目
      if (project_id) {
        const { data: project, error: projectError } = await sb
          .from('workspace_projects')
          .select('id')
          .eq('id', project_id)
          .eq('user_id', userId)
          .maybeSingle();

        if (projectError || !project) {
          return new Response(
            JSON.stringify({ error: '无权访问指定项目或项目不存在' }),
            {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }
      }

      // 🖼️ 处理 markdown 中的 base64 图片和视频，上传到 Storage
      let processedMarkdown = markdown;
      if (
        markdown &&
        (markdown.includes('data:image') || markdown.includes('data:video'))
      ) {
        debugLog('[API] Found base64 media, processing', {
          inputLength: markdown.length
        });
        try {
          processedMarkdown = await processSummaryContentMedia(
            sb,
            markdown,
            userId
          );
          debugLog('[API] Media processing complete', {
            outputLength: processedMarkdown.length,
            hasBase64Image: processedMarkdown.includes('data:image'),
            hasBase64Video: processedMarkdown.includes('data:video')
          });
        } catch (mediaError) {
          safeErrorLog('[API] Media processing failed', mediaError);
          // 继续使用原始 markdown，不阻塞保存
        }
      }

      debugLog('[API] About to insert summary', {
        markdownLength: processedMarkdown.length,
        hasProject: !!project_id,
        hasUrl: !!url,
        tagCount: tags?.length || 0
      });

      const { data, error } = await sb
        .from('summaries')
        .insert({
          title,
          url: url || 'note://local',
          markdown: processedMarkdown,
          tags: tags || [],
          user_id: userId,
          project_id: project_id || null,
          content_type: content_type || null,
          metadata: sanitizeMetadata(metadata)
        })
        .select()
        .single();

      if (error) throw error;

      debugLog('[API] Summary created', { hasId: !!data.id });
      return new Response(JSON.stringify({ id: data.id, success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      safeErrorLog('[API] Create summary error', error);
      return new Response(
        JSON.stringify({
          error: '创建失败',
          details: getErrorDetails(error)
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
  }

  // Method not allowed
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
