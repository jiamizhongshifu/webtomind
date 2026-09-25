/**
 * Workspace Studio Documents API - Single Document Operations
 * GET: 获取单个 Studio 文档
 * PATCH: 更新 Studio 文档
 * DELETE: 删除 Studio 文档
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

interface UpdateStudioDocumentRequest {
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

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function getIdFromUrl(request: Request): string | null {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  return pathParts[pathParts.length - 1] || null;
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

  const documentId = getIdFromUrl(request);
  if (!documentId || !isValidUuid(documentId)) {
    return jsonResponse({ error: 'Invalid document id' }, corsHeaders, 400);
  }

  const sb = getSupabase();
  if (!sb) {
    return jsonResponse({ error: '数据库未配置' }, corsHeaders, 500);
  }

  const { data: document, error: documentError } = await sb
    .from('studio_documents')
    .select('id, project_id')
    .eq('id', documentId)
    .single();

  if (documentError || !document) {
    return jsonResponse({ error: '文档不存在' }, corsHeaders, 404);
  }

  const { data: project, error: projectError } = await sb
    .from('workspace_projects')
    .select('id')
    .eq('id', document.project_id)
    .eq('user_id', userId)
    .single();

  if (projectError || !project) {
    return jsonResponse({ error: '无权限访问该文档' }, corsHeaders, 403);
  }

  if (request.method === 'GET') {
    const { data, error } = await sb
      .from('studio_documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (error || !data) {
      return jsonResponse({ error: '文档不存在' }, corsHeaders, 404);
    }

    return jsonResponse({ document: data }, corsHeaders);
  }

  if (request.method === 'PATCH') {
    try {
      const body = (await request.json()) as UpdateStudioDocumentRequest;
      const updates: Record<string, unknown> = {};

      if (body.title !== undefined) {
        if (typeof body.title !== 'string') {
          return jsonResponse({ error: 'Invalid title' }, corsHeaders, 400);
        }
        updates.title = body.title.trim().length > 0 ? body.title.trim() : '未命名草稿';
      }

      if (body.content !== undefined) {
        updates.content = body.content;
      }

      if (body.content_type !== undefined) {
        if (typeof body.content_type === 'string' && body.content_type.trim()) {
          updates.content_type = body.content_type.trim();
        }
      }

      if (body.status !== undefined) {
        if (!ALLOWED_STATUS.has(body.status)) {
          return jsonResponse({ error: 'Invalid status' }, corsHeaders, 400);
        }
        updates.status = body.status;
      }

      if (Object.keys(updates).length === 0) {
        return jsonResponse({ error: 'No updates provided' }, corsHeaders, 400);
      }

      let data;
      let error;

      ({ data, error } = await sb
        .from('studio_documents')
        .update(updates)
        .eq('id', documentId)
        .select('*')
        .single());

      // If update fails due to unknown column content_type, retry without it
      if (error && error.message?.includes('content_type') && 'content_type' in updates) {
        delete updates.content_type;
        if (Object.keys(updates).length > 0) {
          ({ data, error } = await sb
            .from('studio_documents')
            .update(updates)
            .eq('id', documentId)
            .select('*')
            .single());
        } else {
          // Only content_type was being updated, nothing else to do
          ({ data, error } = await sb
            .from('studio_documents')
            .select('*')
            .eq('id', documentId)
            .single());
        }
      }

      if (error) {
        throw error;
      }

      return jsonResponse({ success: true, document: data }, corsHeaders);
    } catch (error: unknown) {
      return jsonResponse(
        {
          error: '更新 Studio 文档失败',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        corsHeaders,
        500
      );
    }
  }

  if (request.method === 'DELETE') {
    const { error } = await sb
      .from('studio_documents')
      .delete()
      .eq('id', documentId);

    if (error) {
      return jsonResponse(
        {
          error: '删除 Studio 文档失败',
          details: error.message
        },
        corsHeaders,
        500
      );
    }

    return jsonResponse({ success: true }, corsHeaders);
  }

  return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
}

