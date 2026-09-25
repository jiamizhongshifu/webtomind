/**
 * Source Extract API - 批量提取 URL 内容并导入为素材
 * POST: 提取选中 URL 的内容，保存为 summaries
 *
 * 使用 Jina Reader 提取网页全文 Markdown
 */

import {
  getUserIdFromRequest,
  getCorsHeadersForRequest,
  getSupabaseAdmin
} from '../utils/auth';
import { debugLog, safeErrorLog } from '../utils/logging';

export const config = {
  runtime: 'edge',
  maxDuration: 60
};

interface ExtractRequest {
  urls: string[];
  projectId: string;
}

interface ExtractResult {
  url: string;
  title: string;
  markdown: string;
  success: boolean;
  summaryId?: string;
  error?: string;
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

/**
 * 通过 Jina Reader 提取 URL 内容
 */
async function extractWithJina(url: string): Promise<{
  title: string;
  markdown: string;
  success: boolean;
  error?: string;
}> {
  try {
    const readerUrl = `https://r.jina.ai/${url}`;
    const response = await fetch(readerUrl, {
      headers: {
        'Accept': 'text/markdown',
        'X-Return-Format': 'markdown'
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      return {
        title: '',
        markdown: '',
        success: false,
        error: `HTTP ${response.status}`
      };
    }

    const content = await response.text();

    // 从 Markdown 中提取标题
    const titleMatch = content.match(/^#\s+(.+)$/m);
    let title = titleMatch?.[1] || '';

    // 如果没有标题，用域名
    if (!title) {
      try {
        title = new URL(url).hostname;
      } catch {
        title = url;
      }
    }

    return { title, markdown: content, success: true };
  } catch (error) {
    return {
      title: '',
      markdown: '',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
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

  let body: ExtractRequest;
  try {
    body = (await request.json()) as ExtractRequest;
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, corsHeaders, 400);
  }

  const { urls, projectId } = body;
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return jsonResponse({ error: '请选择要导入的来源' }, corsHeaders, 400);
  }

  if (urls.length > 20) {
    return jsonResponse({ error: '一次最多导入 20 个来源' }, corsHeaders, 400);
  }

  if (!projectId) {
    return jsonResponse({ error: '缺少项目 ID' }, corsHeaders, 400);
  }

  debugLog('[SourceExtract] Extract requested', {
    urlCount: urls.length
  });

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return jsonResponse({ error: '数据库未配置' }, corsHeaders, 500);
  }

  // 防越权写:service_role 绕过 RLS,必须自行校验该项目归属当前用户,
  // 否则可传入他人 projectId 把抓取内容塞进别人的项目 FK 下污染数据。
  const { data: ownedProject, error: projectError } = await supabase
    .from('workspace_projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle();
  if (projectError || !ownedProject) {
    return jsonResponse({ error: '项目不存在或无权访问' }, corsHeaders, 403);
  }

  // 并行提取（限制并发为 5）
  const concurrency = 5;
  const results: ExtractResult[] = [];

  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (url, batchIndex): Promise<ExtractResult> => {
        const sourceIndex = i + batchIndex;
        const extracted = await extractWithJina(url);

        if (!extracted.success) {
          return {
            url,
            title: '',
            markdown: '',
            success: false,
            error: extracted.error
          };
        }

        // 保存为 summary
        try {
          const { data, error } = await supabase
            .from('summaries')
            .insert({
              user_id: userId,
              title: extracted.title,
              url,
              markdown: extracted.markdown,
              project_id: projectId,
              tags: ['web-search'],
              content_type: 'article'
            })
            .select('id')
            .single();

          if (error) {
            safeErrorLog('[SourceExtract] DB insert failed', error, {
              sourceIndex,
              urlCount: urls.length
            });
            return {
              url,
              title: extracted.title,
              markdown: extracted.markdown,
              success: false,
              error: `保存失败: ${error.message}`
            };
          }

          return {
            url,
            title: extracted.title,
            markdown: extracted.markdown,
            success: true,
            summaryId: data.id
          };
        } catch (dbError) {
          safeErrorLog('[SourceExtract] DB insert threw', dbError, {
            sourceIndex,
            urlCount: urls.length
          });
          return {
            url,
            title: extracted.title,
            markdown: extracted.markdown,
            success: false,
            error: dbError instanceof Error ? dbError.message : 'DB error'
          };
        }
      })
    );

    results.push(...batchResults);
  }

  const successCount = results.filter((r) => r.success).length;
  debugLog('[SourceExtract] Extract completed', {
    successCount,
    total: urls.length
  });

  return jsonResponse({
    results,
    imported: successCount,
    total: urls.length
  }, corsHeaders);
}
