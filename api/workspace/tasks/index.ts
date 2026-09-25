/**
 * Workspace Tasks API - Create Task
 * Node.js Runtime（maxDuration: 120s）
 * 直接调用 DeepSeek-V4-Flash-0731（OpenAI-compatible API），无需 server 依赖
 */

import type { VercelRequest, VercelResponse } from '../../utils/vercel-types';
import {
  buildInitialTaskRunInsert,
  getIdempotencyKey,
  getWorkspaceTaskSupabase,
  mapTaskRunRow,
  normalizeWorkspaceTaskRequest,
  shouldRunLegacySync
} from './shared';
import { verifyTokenAndGetUserId } from '../../utils/auth';
import {
  createAiProviderUsageTiming,
  estimateTokensFromText,
  extractGeminiUsage,
  extractOpenAICompatibleUsage,
  recordAiProviderUsage,
  resolveTokenUsageSource
} from '../../utils/ai-provider-usage';
import { fetchModelWithTimeout } from '../../utils/model-fetch';
import { consumeModelRateLimit } from '../../utils/model-rate-limit';
import {
  classifyModelProvider,
  getDeepSeekTextConnection,
  isOfficialGeminiEnabled
} from '../../utils/model-provider-routing';
import type {
  WorkspaceTaskRequest,
  WorkspaceTaskResult,
  WorkspaceTaskStep,
  WorkspaceTaskStatus
} from '../../../server/src/types/workspace-task';

export const config = {
  runtime: 'nodejs',
  maxDuration: 120
};

// ---------------------------------------------------------------------------
// AI API 配置（DeepSeek-V4-Flash-0731 通过 OpenAI-compatible API）
// ---------------------------------------------------------------------------

function getAIConfig(): { apiKey: string; baseURL: string; model: string } {
  const deepseek = getDeepSeekTextConnection();
  if (deepseek.apiKey) {
    return {
      apiKey: deepseek.apiKey,
      baseURL: deepseek.baseURL,
      model: deepseek.model
    };
  }

  // 回退到 Anthropic
  const anthropicKey = process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY || '';
  const anthropicBase = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '').replace(/\/v1$/, '');
  const anthropicModel = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

  return { apiKey: anthropicKey, baseURL: anthropicBase, model: anthropicModel };
}

function getWorkspaceTaskProvider(baseURL: string): string {
  return classifyModelProvider(baseURL);
}

async function callOpenAICompatible(
  apiKey: string,
  baseURL: string,
  model: string,
  userContent: string,
  userId?: string | null
): Promise<string> {
  const url = baseURL.includes('anthropic')
    ? `${baseURL}/v1/messages`
    : `${baseURL}/chat/completions`;

  const isAnthropic = baseURL.includes('anthropic');
  const provider = getWorkspaceTaskProvider(baseURL);
  const timing = createAiProviderUsageTiming();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let body: string;

  if (isAnthropic) {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    body = JSON.stringify({
      model,
      max_tokens: 8192,
      messages: [{ role: 'user', content: userContent }]
    });
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`;
    body = JSON.stringify({
      model,
      max_tokens: 8192,
      messages: [{ role: 'user', content: userContent }]
    });
  }

  const resp = await fetchModelWithTimeout(
    url,
    { method: 'POST', headers, body },
    { timeoutMs: 45_000, label: 'workspace task text generation' }
  );

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    console.warn('[Tasks] Primary AI failed:', resp.status, errText);
    await recordAiProviderUsage({
      userId,
      provider,
      model,
      endpoint: isAnthropic ? '/v1/messages' : '/chat/completions',
      source: 'workspace_task_ai',
      status: 'failed',
      inputTokens: estimateTokensFromText(userContent),
      tokenUsageSource: 'estimated',
      promptChars: userContent.length,
      latencyMs: timing.mark(),
      errorMessage: `AI request failed: ${resp.status} ${errText.slice(0, 500)}`,
      startedAt: timing.startedAt
    });

    // Gemini 兜底
    const geminiKey = process.env.GEMINI_API_KEY || '';
    if (geminiKey && isOfficialGeminiEnabled()) {
      console.log('[Tasks] Falling back to Gemini');
      const geminiModel = process.env.SMARTCHAT_TEXT_MODEL || 'gemini-3.5-flash';
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`;
      const geminiTiming = createAiProviderUsageTiming();
      const geminiResp = await fetchModelWithTimeout(
        geminiUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: userContent }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } }
          })
        },
        { timeoutMs: 45_000, label: 'workspace task Gemini fallback' }
      );

      if (geminiResp.ok) {
        const geminiResult = await geminiResp.json() as Record<string, unknown>;
        const candidates = (geminiResult.candidates || []) as Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        const content = candidates[0]?.content?.parts?.map(p => p.text || '').join('') || '';
        const usage = extractGeminiUsage(geminiResult);
        await recordAiProviderUsage({
          userId,
          provider: 'gemini',
          model: geminiModel,
          endpoint: 'generateContent',
          source: 'workspace_task_ai',
          status: content ? 'succeeded' : 'failed',
          fallbackOf: provider,
          fallbackUsed: true,
          inputTokens: usage.inputTokens ?? estimateTokensFromText(userContent),
          outputTokens: usage.outputTokens ?? estimateTokensFromText(content),
          totalTokens: usage.totalTokens,
          tokenUsageSource: resolveTokenUsageSource({
            ...usage,
            estimated: !usage.totalTokens && !usage.inputTokens && !usage.outputTokens
          }),
          promptChars: userContent.length,
          responseChars: content.length,
          latencyMs: geminiTiming.mark(),
          errorMessage: content ? null : 'Gemini fallback returned empty content',
          startedAt: geminiTiming.startedAt
        });
        return content;
      }
      const geminiErrText = await geminiResp.text().catch(() => '');
      console.error('[Tasks] Gemini fallback also failed:', geminiResp.status);
      await recordAiProviderUsage({
        userId,
        provider: 'gemini',
        model: geminiModel,
        endpoint: 'generateContent',
        source: 'workspace_task_ai',
        status: 'failed',
        fallbackOf: provider,
        fallbackUsed: true,
        inputTokens: estimateTokensFromText(userContent),
        tokenUsageSource: 'estimated',
        promptChars: userContent.length,
        latencyMs: geminiTiming.mark(),
        errorMessage: `Gemini fallback failed: ${geminiResp.status} ${geminiErrText.slice(0, 500)}`,
        startedAt: geminiTiming.startedAt
      });
    }

    throw new Error(`AI 调用失败 (${resp.status})`);
  }

  const result = await resp.json() as Record<string, unknown>;

  if (isAnthropic) {
    const blocks = (result.content || []) as Array<{ type: string; text?: string }>;
    const content = blocks
      .filter((b) => b.type === 'text')
      .map((b) => b.text || '')
      .join('');
    await recordAiProviderUsage({
      userId,
      provider,
      model,
      endpoint: '/v1/messages',
      source: 'workspace_task_ai',
      status: content ? 'succeeded' : 'failed',
      inputTokens: estimateTokensFromText(userContent),
      outputTokens: estimateTokensFromText(content),
      tokenUsageSource: 'estimated',
      promptChars: userContent.length,
      responseChars: content.length,
      latencyMs: timing.mark(),
      errorMessage: content ? null : 'Anthropic-compatible request returned empty content',
      startedAt: timing.startedAt
    });
    return content;
  }

  const choices = (result.choices || []) as Array<{ message?: { content?: string } }>;
  const content = choices[0]?.message?.content || '';
  const usage = extractOpenAICompatibleUsage(result);
  await recordAiProviderUsage({
    userId,
    provider,
    model,
    endpoint: '/chat/completions',
    source: 'workspace_task_ai',
    status: content ? 'succeeded' : 'failed',
    inputTokens: usage.inputTokens ?? estimateTokensFromText(userContent),
    outputTokens: usage.outputTokens ?? estimateTokensFromText(content),
    totalTokens: usage.totalTokens,
    tokenUsageSource: resolveTokenUsageSource({
      ...usage,
      estimated: !usage.totalTokens && !usage.inputTokens && !usage.outputTokens
    }),
    promptChars: userContent.length,
    responseChars: content.length,
    latencyMs: timing.mark(),
    errorMessage: content ? null : 'OpenAI-compatible request returned empty content',
    startedAt: timing.startedAt
  });
  return content;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

function getWorkspaceTaskCorsOrigin(origin: string | undefined): string {
  if (!origin) return '*';
  return origin;
}

function getWorkspaceTaskCorsHeaders(
  origin: string | undefined
): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': getWorkspaceTaskCorsOrigin(origin),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true'
  };
}

function workspaceTaskJsonResponse(
  body: unknown,
  headers: Record<string, string>,
  status = 200
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  });
}

export async function handleWorkspaceTasksRequest(
  request: Request
): Promise<Response> {
  const corsHeaders = getWorkspaceTaskCorsHeaders(
    request.headers.get('origin') || undefined
  );

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return workspaceTaskJsonResponse(
      { error: 'Method not allowed' },
      corsHeaders,
      405
    );
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const userId = token ? await verifyTokenAndGetUserId(token) : null;
  if (!userId) {
    return workspaceTaskJsonResponse({ error: '请先登录' }, corsHeaders, 401);
  }

  const body = await request.json().catch(() => null);
  const taskRequest = normalizeWorkspaceTaskRequest(body);
  if (!taskRequest) {
    return workspaceTaskJsonResponse(
      { error: '无效的任务请求' },
      corsHeaders,
      400
    );
  }

  const sb = getWorkspaceTaskSupabase();
  if (!sb) {
    return workspaceTaskJsonResponse(
      { error: '数据库未配置' },
      corsHeaders,
      500
    );
  }

  const idempotencyKey = getIdempotencyKey(body);
  if (idempotencyKey) {
    const { data: existing } = await sb
      .from('workspace_task_runs')
      .select('*')
      .eq('user_id', userId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existing) {
      return workspaceTaskJsonResponse(
        { task: mapTaskRunRow(existing) },
        corsHeaders
      );
    }
  }

  const syncCompat = shouldRunLegacySync(body);
  const insertPayload = buildInitialTaskRunInsert({
    userId,
    task: taskRequest,
    body,
    status: syncCompat ? 'running' : 'queued',
    idempotencyKey
  });

  const { data, error } = await sb
    .from('workspace_task_runs')
    .insert(insertPayload)
    .select('*')
    .single();

  if (error || !data) {
    return workspaceTaskJsonResponse(
      { error: error?.message || '创建任务失败' },
      corsHeaders,
      500
    );
  }

  if (!syncCompat) {
    return workspaceTaskJsonResponse(
      { task: mapTaskRunRow(data) },
      corsHeaders,
      201
    );
  }

  const createdTaskId = data.id as string;
  try {
    const execution = await executeLegacySyncTask(taskRequest, body, userId);
    const { data: updated, error: updateError } = await sb
      .from('workspace_task_runs')
      .update({
        status: execution.status,
        result_payload: execution.result,
        error_message: execution.error || null,
        progress: execution.progress,
        steps: execution.steps,
        executor: execution.executor,
        completed_at: new Date().toISOString()
      })
      .eq('id', createdTaskId)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (updateError || !updated) {
      return workspaceTaskJsonResponse(
        { error: updateError?.message || '任务更新失败' },
        corsHeaders,
        500
      );
    }

    return workspaceTaskJsonResponse(
      { task: mapTaskRunRow(updated) },
      corsHeaders,
      201
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '任务执行失败';
    const failed = buildLegacyExecutionResult(
      'failed',
      {
        content: '',
        documentId: taskRequest.context.targetDocumentId ?? null,
        metadata: { executor: 'legacy-sync', failed: true, error: message }
      },
      message
    );

    const { data: updated } = await sb
      .from('workspace_task_runs')
      .update({
        status: 'failed',
        result_payload: failed.result,
        error_message: message,
        progress: failed.progress,
        steps: failed.steps,
        executor: failed.executor,
        completed_at: new Date().toISOString()
      })
      .eq('id', createdTaskId)
      .eq('user_id', userId)
      .select('*')
      .single();

    return workspaceTaskJsonResponse(
      { task: updated ? mapTaskRunRow(updated) : mapTaskRunRow(data) },
      corsHeaders,
      201
    );
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const origin = (req.headers.origin as string) || '';
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const authHeader = (req.headers.authorization as string) || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const userId = token ? await verifyTokenAndGetUserId(token) : null;
  if (!userId) { res.status(401).json({ error: '请先登录' }); return; }

  const rateLimit = await consumeModelRateLimit({
    userId,
    bucket: 'workspace_tasks',
    maxRequests: 10
  });
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', String(rateLimit.retryAfter));
    res.status(rateLimit.status).json({
      error: rateLimit.error || 'RATE_LIMITED',
      retryAfter: rateLimit.retryAfter
    });
    return;
  }

  const body = req.body;
  const taskRequest = normalizeWorkspaceTaskRequest(body);
  if (!taskRequest) {
    res.status(400).json({ error: '无效的任务请求' });
    return;
  }

  const sb = getWorkspaceTaskSupabase();
  if (!sb) {
    res.status(500).json({ error: '数据库未配置' });
    return;
  }

  const idempotencyKey = getIdempotencyKey(body);
  if (idempotencyKey) {
    const { data: existing } = await sb
      .from('workspace_task_runs')
      .select('*')
      .eq('user_id', userId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existing) {
      res.status(200).json({ task: mapTaskRunRow(existing) });
      return;
    }
  }

  const syncCompat = shouldRunLegacySync(body);
  const insertPayload = buildInitialTaskRunInsert({
    userId,
    task: taskRequest,
    body,
    status: syncCompat ? 'running' : 'queued',
    idempotencyKey
  });

  const { data, error } = await sb
    .from('workspace_task_runs')
    .insert(insertPayload)
    .select('*')
    .single();

  if (error || !data) {
    res.status(500).json({ error: error?.message || '创建任务失败' });
    return;
  }

  if (!syncCompat) {
    res.status(201).json({ task: mapTaskRunRow(data) });
    return;
  }

  const createdTaskId = data.id as string;
  try {
    const execution = await executeLegacySyncTask(taskRequest, body, userId);
    const { data: updated, error: updateError } = await sb
      .from('workspace_task_runs')
      .update({
        status: execution.status,
        result_payload: execution.result,
        error_message: execution.error || null,
        progress: execution.progress,
        steps: execution.steps,
        executor: execution.executor,
        completed_at: new Date().toISOString()
      })
      .eq('id', createdTaskId)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (updateError || !updated) {
      res.status(500).json({ error: updateError?.message || '任务更新失败' });
      return;
    }

    res.status(201).json({ task: mapTaskRunRow(updated) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '任务执行失败';
    const failed = buildLegacyExecutionResult(
      'failed',
      {
        content: '',
        documentId: taskRequest.context.targetDocumentId ?? null,
        metadata: { executor: 'legacy-sync', failed: true, error: message }
      },
      message
    );

    const { data: updated } = await sb
      .from('workspace_task_runs')
      .update({
        status: 'failed',
        result_payload: failed.result,
        error_message: message,
        progress: failed.progress,
        steps: failed.steps,
        executor: failed.executor,
        completed_at: new Date().toISOString()
      })
      .eq('id', createdTaskId)
      .eq('user_id', userId)
      .select('*')
      .single();

    res.status(201).json({ task: updated ? mapTaskRunRow(updated) : mapTaskRunRow(data) });
  }
}

interface LegacyExecutionResult {
  status: Extract<WorkspaceTaskStatus, 'succeeded' | 'failed'>;
  result: WorkspaceTaskResult;
  steps: WorkspaceTaskStep[];
  progress: { percent: number; label: string };
  executor: string;
  error?: string;
}

async function executeLegacySyncTask(
  task: WorkspaceTaskRequest,
  body: unknown,
  userId: string
): Promise<LegacyExecutionResult> {
  const { apiKey, baseURL, model } = getAIConfig();
  if (!apiKey) {
    throw new Error('AI 服务未配置');
  }

  const skillId = task.skillId || task.type;
  const format = typeof task.params.format === 'string' ? task.params.format.trim() : '';
  const customPrompt =
    typeof task.params.customPrompt === 'string' ? task.params.customPrompt.trim() : '';

  let prompt: string;
  if (skillId === 'rewrite') {
    prompt = buildRewritePrompt(task as unknown as Record<string, unknown>, format, customPrompt);
  } else if (skillId === 'slide-deck') {
    prompt = buildSlideDeckPrompt(task as unknown as Record<string, unknown>, format, customPrompt);
  } else {
    prompt = buildGenericPrompt(skillId, task as unknown as Record<string, unknown>, format, customPrompt);
  }

  let references = '';
  const refContents = task.context.referenceContents || [];
  if (refContents.length > 0) {
    references = refContents
      .map((r) => `${r.title}\n${r.markdown || ''}`.trim())
      .filter(Boolean)
      .join('\n\n---\n\n');
  }

  const userContent = references ? `参考内容:\n\n${references}\n\n---\n\n${prompt}` : prompt;

  if (skillId === 'slide-deck') {
    const result = await generateSlideDeck(apiKey, baseURL, model, userContent, userId);
    return buildLegacyExecutionResult('succeeded', {
      content: result.markdown,
      documentId: task.context.targetDocumentId ?? null,
      metadata: {
        executor: 'slide-deck',
        compat: 'sync',
        model,
        slideCount: result.slideCount,
        imageUrls: result.imageUrls,
        requestKind: typeof body === 'object' && body ? (body as { kind?: unknown }).kind : undefined
      }
    });
  }

  const content = await callOpenAICompatible(apiKey, baseURL, model, userContent, userId);
  return buildLegacyExecutionResult('succeeded', {
    content: content || `技能 ${skillId} 执行完成。`,
    documentId: task.context.targetDocumentId ?? null,
    metadata: { executor: 'direct', compat: 'sync', model }
  });
}

function buildLegacyExecutionResult(
  status: Extract<WorkspaceTaskStatus, 'succeeded' | 'failed'>,
  result: WorkspaceTaskResult,
  error?: string
): LegacyExecutionResult {
  const now = Date.now();
  const succeeded = status === 'succeeded';
  return {
    status,
    result,
    error,
    executor: 'legacy-sync',
    progress: {
      percent: 100,
      label: succeeded ? '任务已完成' : '任务执行失败'
    },
    steps: succeeded
      ? [
          {
            id: 'prepare',
            title: '准备任务',
            kind: 'prepare',
            status: 'completed',
            startedAt: now,
            endedAt: now
          },
          {
            id: 'execute',
            title: '执行技能',
            kind: 'execute',
            status: 'completed',
            startedAt: now,
            endedAt: now
          },
          {
            id: 'finish',
            title: '整理结果',
            kind: 'finalize',
            status: 'completed',
            startedAt: now,
            endedAt: now
          }
        ]
      : [
          {
            id: 'prepare',
            title: '准备任务',
            kind: 'prepare',
            status: 'completed',
            startedAt: now,
            endedAt: now
          },
          {
            id: 'execute',
            title: '执行技能',
            kind: 'execute',
            status: 'failed',
            startedAt: now,
            endedAt: now,
            detail: error
          }
        ]
  };
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildRewritePrompt(body: Record<string, unknown>, format: string, customPrompt: string): string {
  const params = body.params as Record<string, unknown>;
  const context = body.context as Record<string, unknown>;
  const language = typeof params.language === 'string' ? params.language.trim() : '';
  const langMap: Record<string, string> = { 'zh-CN': '简体中文', 'en-US': '英文', 'ja-JP': '日文' };
  const parts = [
    '你是一个内容改写助手。',
    '你将收到一组已经提供好的参考正文。不要向用户索要原文，不要解释限制，不要输出任务说明。',
    '你的唯一目标是：直接基于已提供的参考正文产出改写结果。',
    '', '输出要求：',
    '- 直接输出改写后的正文', '- 保留原文核心信息，不要偏题',
    '- 语言更清晰、自然、适合发布',
    '- 不要输出"请把原文发我""我无法执行"等元话术',
    '- 如果有多条参考内容，优先融合为一版连贯成稿'
  ];
  if (language && langMap[language]) parts.push(`- 输出语言：${langMap[language]}`);
  if (format) parts.push(`- 输出格式要求：${format}`);
  if (customPrompt) parts.push(`- 额外要求：${customPrompt}`);
  if (context.targetDocumentId) parts.push('- 结果将写入当前文档，请输出可直接落稿的正文');
  parts.push('', '下面开始直接生成改写结果。');
  return parts.join('\n');
}

function buildSlideDeckPrompt(body: Record<string, unknown>, format: string, customPrompt: string): string {
  const params = body.params as Record<string, unknown>;
  const slideCount = typeof params.slideCount === 'number' ? params.slideCount : 8;
  const style = typeof params.style === 'string' ? params.style : '商务简约';
  const parts = [
    '你是一个专业的 PPT 演示文稿策划师。',
    '请基于提供的参考内容，为每一页 PPT 撰写详细的画面描述（用于 AI 生图）和演讲备注。',
    '',
    '输出格式要求（严格遵循 Markdown）：',
    `- 共 ${slideCount} 页`,
    `- 整体视觉风格：${style}`,
    '- 第一页为封面，最后一页为总结/致谢',
    '',
    '每页使用以下格式：',
    '## 第 N 页：页面标题',
    '**画面描述**：（详细描述这页 PPT 的视觉内容，包括布局、配色、图形元素、文字排版等，适合直接作为 AI 生图的 prompt）',
    '**核心文字**：（页面上展示的关键文字，精炼，每行不超过 15 字）',
    '**演讲备注**：（演讲者看到的备注，2-3 句话）',
    '',
    '---'
  ];
  if (format) parts.push(`额外格式要求：${format}`);
  if (customPrompt) parts.push(`额外要求：${customPrompt}`);
  parts.push('', '请直接输出，不要输出额外解释。');
  return parts.join('\n');
}

function buildGenericPrompt(skillId: string, body: Record<string, unknown>, format: string, customPrompt: string): string {
  const params = body.params as Record<string, unknown>;
  const context = body.context as Record<string, unknown>;
  const lines = [`执行技能: ${skillId}`];
  if (format) lines.push(`\n格式: ${format}`);
  if (customPrompt) lines.push(`\n额外要求:\n${customPrompt}`);
  const entries = Object.entries(params).filter(
    ([k, v]) => !['customPrompt', 'runtime', 'format', 'model'].includes(k) && v !== undefined && v !== null && v !== ''
  );
  if (entries.length > 0) {
    lines.push('\n参数设置:');
    for (const [k, v] of entries) lines.push(`- ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
  }
  if (context.targetDocumentId) lines.push('\n目标: 写入现有文档');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Slide Deck (PPT) 生成
// ---------------------------------------------------------------------------

interface SlideOutline {
  pageNumber: number;
  title: string;
  imagePrompt: string;
  coreText: string;
  speakerNotes: string;
}

interface SlideDeckResult {
  markdown: string;
  slideCount: number;
  imageUrls: string[];
}

const GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const SLIDE_BASE_DELAY_MS = 1000; // 基础排队间隔
const SLIDE_RETRY_DELAY_MS = 5000; // 限流重试等待
const SLIDE_MAX_RETRIES = 2; // 每页最大重试次数

/**
 * 生成 PPT：先用 AI 策划大纲，再用 Gemini 逐页生成 16:9 图片
 */
async function generateSlideDeck(
  aiApiKey: string,
  aiBaseURL: string,
  aiModel: string,
  userContent: string,
  userId: string
): Promise<SlideDeckResult> {
  // Step 1: 用 AI 生成结构化大纲
  const outlineText = await callOpenAICompatible(aiApiKey, aiBaseURL, aiModel, userContent, userId);
  const slides = parseSlideOutline(outlineText);

  if (slides.length === 0) {
    return { markdown: outlineText, slideCount: 0, imageUrls: [] };
  }

  // Step 2: 用 Gemini 逐页生成图片（16:9）
  const geminiKey = process.env.GEMINI_API_KEY || '';
  if (!geminiKey || !isOfficialGeminiEnabled()) {
    console.warn('[SlideDeck] Official Gemini image generation disabled or missing key; skipping image generation');
    return { markdown: outlineText, slideCount: slides.length, imageUrls: [] };
  }

  console.log(`[SlideDeck] Generating ${slides.length} slide images sequentially`);
  const imageUrls: string[] = [];

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    let imageUrl: string | null = null;

    // 带重试的图片生成（应对 429 限流）
    for (let attempt = 0; attempt <= SLIDE_MAX_RETRIES; attempt++) {
      try {
        console.log(`[SlideDeck] Page ${i + 1}/${slides.length}${attempt > 0 ? ` (retry ${attempt})` : ''}: ${slide.title}`);
        imageUrl = await generateSlideImage(geminiKey, slide, i + 1, slides.length, userId);
        break; // 成功则跳出重试
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const isRateLimit = errMsg.includes('429') || errMsg.includes('RATE') || errMsg.includes('quota');

        if (isRateLimit && attempt < SLIDE_MAX_RETRIES) {
          const waitMs = SLIDE_RETRY_DELAY_MS * (attempt + 1);
          console.warn(`[SlideDeck] Page ${i + 1} rate-limited, waiting ${waitMs}ms before retry`);
          await new Promise(resolve => setTimeout(resolve, waitMs));
        } else {
          console.error(`[SlideDeck] Page ${i + 1} failed after ${attempt + 1} attempts:`, errMsg);
          break;
        }
      }
    }

    imageUrls.push(imageUrl || '');

    // 排队间隔（最后一页不需要等待）
    if (i < slides.length - 1) {
      await new Promise(resolve => setTimeout(resolve, SLIDE_BASE_DELAY_MS));
    }
  }

  // Step 3: 组装最终 markdown（含图片）
  const markdownParts: string[] = [];
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const imgUrl = imageUrls[i];
    markdownParts.push(`## 第 ${i + 1} 页：${slide.title}`);
    if (imgUrl) {
      markdownParts.push(`![${slide.title}](${imgUrl})`);
    }
    markdownParts.push(`${slide.coreText}`);
    if (slide.speakerNotes) {
      markdownParts.push(`> 💡 ${slide.speakerNotes}`);
    }
    markdownParts.push('---');
  }

  return {
    markdown: markdownParts.join('\n\n'),
    slideCount: slides.length,
    imageUrls: imageUrls.filter(Boolean)
  };
}

/**
 * 从 AI 生成的文本中解析幻灯片大纲
 */
function parseSlideOutline(text: string): SlideOutline[] {
  const slides: SlideOutline[] = [];
  // 按 ## 分割页面
  const sections = text.split(/^## /m).filter(Boolean);

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i].trim();
    const lines = section.split('\n');
    const titleLine = lines[0]?.trim() || `第 ${i + 1} 页`;

    // 提取各字段
    let imagePrompt = '';
    let coreText = '';
    let speakerNotes = '';
    const fullText = section;

    const imageMatch = fullText.match(/\*\*画面描述\*\*[：:]\s*([\s\S]*?)(?=\*\*核心文字|$)/);
    const coreMatch = fullText.match(/\*\*核心文字\*\*[：:]\s*([\s\S]*?)(?=\*\*演讲备注|$)/);
    const notesMatch = fullText.match(/\*\*演讲备注\*\*[：:]\s*([\s\S]*?)(?=---|$)/);

    if (imageMatch) imagePrompt = imageMatch[1].trim();
    if (coreMatch) coreText = coreMatch[1].trim();
    if (notesMatch) speakerNotes = notesMatch[1].trim();

    // 如果没有结构化内容，用整个 section 作为 prompt
    if (!imagePrompt) {
      imagePrompt = `PPT slide: ${titleLine}\n${coreText || lines.slice(1).join('\n')}`;
    }

    slides.push({
      pageNumber: i + 1,
      title: titleLine.replace(/^第\s*\d+\s*页[：:]\s*/, ''),
      imagePrompt,
      coreText: coreText || lines.slice(1, 6).join('\n'),
      speakerNotes
    });
  }

  return slides;
}

/**
 * 用 Gemini 生成单页 PPT 图片（16:9 比例）
 */
async function generateSlideImage(
  geminiKey: string,
  slide: SlideOutline,
  pageNum: number,
  totalPages: number,
  userId: string
): Promise<string | null> {
  const timing = createAiProviderUsageTiming();
  const slidePrompt = [
    `Generate a professional presentation slide image (page ${pageNum}/${totalPages}).`,
    `Title: ${slide.title}`,
    `Visual description: ${slide.imagePrompt}`,
    slide.coreText ? `Key text to include on the slide: ${slide.coreText}` : '',
    'Style: Clean, modern, professional presentation design.',
    'The image should look like a real PPT slide with proper layout, typography, and visual hierarchy.',
    'Use a 16:9 aspect ratio.'
  ].filter(Boolean).join('\n');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${geminiKey}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: slidePrompt }] }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio: '16:9' }
      }
    })
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    console.error(`[SlideDeck] Gemini image error (page ${pageNum}):`, resp.status, errText);
    await recordAiProviderUsage({
      userId,
      provider: 'gemini',
      model: GEMINI_IMAGE_MODEL,
      endpoint: 'generateContent',
      source: 'workspace_slide_deck_image',
      status: 'failed',
      inputTokens: estimateTokensFromText(slidePrompt),
      tokenUsageSource: 'estimated',
      promptChars: slidePrompt.length,
      latencyMs: timing.mark(),
      errorMessage: `Gemini image request failed: ${resp.status} ${errText.slice(0, 500)}`,
      metadata: { pageNum, totalPages },
      startedAt: timing.startedAt
    });
    return null;
  }

  const result = await resp.json() as {
    usageMetadata?: Record<string, unknown>;
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
      };
    }>;
  };

  // 提取 base64 图片
  const parts = result.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      const usage = extractGeminiUsage(result);
      await recordAiProviderUsage({
        userId,
        provider: 'gemini',
        model: GEMINI_IMAGE_MODEL,
        endpoint: 'generateContent',
        source: 'workspace_slide_deck_image',
        status: 'succeeded',
        inputTokens: usage.inputTokens ?? estimateTokensFromText(slidePrompt),
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        tokenUsageSource: resolveTokenUsageSource({
          ...usage,
          estimated: !usage.totalTokens && !usage.inputTokens && !usage.outputTokens
        }),
        promptChars: slidePrompt.length,
        imageCount: 1,
        latencyMs: timing.mark(),
        metadata: { pageNum, totalPages, mimeType: part.inlineData.mimeType },
        startedAt: timing.startedAt
      });
      // 返回 data URI（前端可直接显示）
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }

  await recordAiProviderUsage({
    userId,
    provider: 'gemini',
    model: GEMINI_IMAGE_MODEL,
    endpoint: 'generateContent',
    source: 'workspace_slide_deck_image',
    status: 'failed',
    inputTokens: estimateTokensFromText(slidePrompt),
    tokenUsageSource: 'estimated',
    promptChars: slidePrompt.length,
    latencyMs: timing.mark(),
    errorMessage: 'Gemini image response did not include inline image data',
    metadata: { pageNum, totalPages },
    startedAt: timing.startedAt
  });
  return null;
}
