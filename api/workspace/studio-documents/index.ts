/**
 * Workspace Studio Documents API - List & Create
 * GET: 获取项目下 Studio 文档列表
 * POST: 创建 Studio 文档
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

type StudioDocumentStatus = 'draft' | 'published';

const ALLOWED_STATUS = new Set<StudioDocumentStatus>(['draft', 'published']);

interface CreateStudioDocumentRequest {
  projectId: string;
  title?: string;
  content?: Record<string, unknown>;
  content_type?: string;
  status?: StudioDocumentStatus;
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

function isRelationMissingError(error: unknown, relationName: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybe = error as { code?: string; message?: string };
  if (maybe.code === '42P01') return true;
  return (maybe.message || '').includes(`relation "${relationName}" does not exist`);
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
        Math.max(parseInt(url.searchParams.get('limit') || '50', 10), 1),
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

      const { data: documents, error: documentsError } = await sb
        .from('studio_documents')
        .select('*')
        .eq('project_id', projectId)
        .order('updated_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (documentsError && isRelationMissingError(documentsError, 'studio_documents')) {
        // 兼容迁移未执行的环境，避免工作台直接报错中断
        return jsonResponse(
          {
            documents: [],
            hasMore: false,
            migrationRequired: true,
            warning: 'studio_documents 表不存在，请先执行 v1.3 migration 057'
          },
          corsHeaders
        );
      }

      if (documentsError) {
        throw documentsError;
      }

      return jsonResponse(
        {
          documents: documents || [],
          hasMore: (documents || []).length === limit
        },
        corsHeaders
      );
    } catch (error: unknown) {
      return jsonResponse(
        {
          error: '获取 Studio 文档失败',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        corsHeaders,
        500
      );
    }
  }

  if (request.method === 'POST') {
    try {
      const body = (await request.json()) as CreateStudioDocumentRequest;
      const projectId = body.projectId;

      if (!projectId || !isValidUuid(projectId)) {
        return jsonResponse({ error: 'Invalid projectId' }, corsHeaders, 400);
      }

      const title =
        typeof body.title === 'string' && body.title.trim().length > 0
          ? body.title.trim()
          : '未命名草稿';

      const status: StudioDocumentStatus = body.status || 'draft';
      if (!ALLOWED_STATUS.has(status)) {
        return jsonResponse({ error: 'Invalid status' }, corsHeaders, 400);
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

      const insertPayload: Record<string, unknown> = {
          project_id: projectId,
          title,
          content: body.content || {},
          status
      };

      // content_type column may not exist yet (requires migration 068)
      if (typeof body.content_type === 'string' && body.content_type.trim()) {
        insertPayload.content_type = body.content_type.trim();
      }

      const { data: document, error: insertError } = await sb
        .from('studio_documents')
        .insert(insertPayload)
        .select('*')
        .single();

      // If insert fails due to unknown column content_type, retry without it
      if (insertError && insertError.message?.includes('content_type')) {
        delete insertPayload.content_type;
        const { data: retryDoc, error: retryError } = await sb
          .from('studio_documents')
          .insert(insertPayload)
          .select('*')
          .single();

        if (retryError && isRelationMissingError(retryError, 'studio_documents')) {
          return jsonResponse(
            {
              error: 'Studio 文档表未初始化',
              details: '请先执行 migration 057_studio_documents.sql'
            },
            corsHeaders,
            503
          );
        }

        if (retryError) {
          throw retryError;
        }

        return jsonResponse({ success: true, document: retryDoc }, corsHeaders);
      }

      if (insertError && isRelationMissingError(insertError, 'studio_documents')) {
        return jsonResponse(
          {
            error: 'Studio 文档表未初始化',
            details: '请先执行 migration 057_studio_documents.sql'
          },
          corsHeaders,
          503
        );
      }

      if (insertError) {
        throw insertError;
      }

      return jsonResponse({ success: true, document }, corsHeaders);
    } catch (error: unknown) {
      return jsonResponse(
        {
          error: '创建 Studio 文档失败',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        corsHeaders,
        500
      );
    }
  }

  return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
}
