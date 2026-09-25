/**
 * Agent API 路由
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { providerFactory } from '../services/provider-factory.js';
import { getAllNotes, getNote } from '../tools/index.js';
import { requireAuth, getUserId } from '../middleware/auth.js';
import { updateNote, deleteNote, getSupabase } from '../services/supabase.js';
import type { ChatRequest, ToolConfirmRequest } from '../types/api.js';
import { resolveToolConfirmation } from '../services/tool-confirmation-store.js';

export const agentRoutes = new Hono();

// ============================================
// 聊天接口（流式 SSE）- 需要认证
// ============================================

agentRoutes.post('/chat', requireAuth, async (c) => {
  const body = await c.req.json<ChatRequest>();
  const { prompt, provider = 'auto', context, sessionId } = body;
  const userId = getUserId(c);

  if (!userId) {
    return c.json({ success: false, message: '未认证用户' }, 401);
  }

  if (!prompt || prompt.trim().length === 0) {
    return c.json({ error: '请输入内容' }, 400);
  }

  // 获取 AI 提供商（传递 prompt 用于 PPT 请求检测）
  let agent;
  try {
    agent = providerFactory.getProvider(
      provider as 'claude' | 'gemini' | 'auto',
      prompt
    );
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : '获取 AI 提供商失败'
      },
      500
    );
  }

  // 设置响应头
  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');

  // 如果有 sessionId，返回在响应头中
  if (sessionId) {
    c.header('X-Session-ID', sessionId);
  }

  // 流式返回，传递 userId 到 context
  return streamSSE(c, async (stream) => {
    try {
      // 将 userId 添加到 context 中
      const enrichedContext = {
        ...context,
        userId
      };

      for await (const chunk of agent.chat(
        prompt,
        enrichedContext,
        sessionId
      )) {
        await stream.writeSSE({
          event: chunk.type,
          data: JSON.stringify(chunk.data)
        });
      }
    } catch (error) {
      console.error('[AgentRoute] Chat error:', error);
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({
          message: error instanceof Error ? error.message : '聊天失败'
        })
      });
    }
  });
});

// ============================================
// 非流式聊天接口（简化版）- 需要认证
// ============================================

agentRoutes.post('/chat/sync', requireAuth, async (c) => {
  const body = await c.req.json<ChatRequest>();
  const { prompt, provider = 'auto', context, sessionId } = body;
  const userId = getUserId(c);

  if (!prompt || prompt.trim().length === 0) {
    return c.json({ error: '请输入内容' }, 400);
  }

  try {
    const agent = providerFactory.getProvider(
      provider as 'claude' | 'gemini' | 'auto'
    );

    let fullText = '';
    const toolCalls: unknown[] = [];
    const toolResults: unknown[] = [];

    // 将 userId 添加到 context 中
    const enrichedContext = {
      ...context,
      userId
    };

    for await (const chunk of agent.chat(prompt, enrichedContext, sessionId)) {
      switch (chunk.type) {
        case 'text':
          fullText += (chunk.data as { content: string }).content;
          break;
        case 'tool_call':
          toolCalls.push(chunk.data);
          break;
        case 'tool_result':
          toolResults.push(chunk.data);
          break;
      }
    }

    return c.json({
      success: true,
      data: {
        content: fullText,
        toolCalls,
        toolResults
      }
    });
  } catch (error) {
    console.error('[AgentRoute] Sync chat error:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '聊天失败'
      },
      500
    );
  }
});

// ============================================
// 智能对话接口（流式 SSE）- 需要认证
// 支持多模态输入（文本+图片）
// ============================================

agentRoutes.post('/smart-chat', requireAuth, async (c) => {
  const body = await c.req.json<ChatRequest>();
  const { prompt, context } = body;
  const userId = getUserId(c);

  if (!prompt || prompt.trim().length === 0) {
    return c.json({ error: '请输入内容' }, 400);
  }

  // 获取 AI 提供商（优先使用 Claude）
  let agent;
  try {
    agent = providerFactory.getProvider('auto');
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : '获取 AI 提供商失败'
      },
      500
    );
  }

  // 设置响应头
  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');

  // 流式返回
  return streamSSE(c, async (stream) => {
    try {
      // 将 userId 和 projectId 添加到 context 中
      const enrichedContext = {
        ...context,
        userId,
        projectId: context?.projectId
      };

      // 记录图片信息
      if (context?.referenceImages && context.referenceImages.length > 0) {
        console.log(
          `[AgentRoute] smart-chat with ${context.referenceImages.length} images`
        );
      }

      // 记录项目信息
      if (context?.projectId) {
        console.log(
          `[AgentRoute] smart-chat with projectId: ${context.projectId}`
        );
      }

      if (context?.retryStep?.stepId !== undefined) {
        console.log(
          `[AgentRoute] smart-chat retryStep: step=${context.retryStep.stepId}, type=${context.retryStep.stepType || 'unknown'}`
        );
      }

      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      const sb = getSupabase();

      for await (const chunk of agent.chat(prompt, enrichedContext)) {
        if (chunk.data && typeof chunk.data === 'object' && 'tokenUsage' in chunk.data) {
          const usage = (chunk.data as {
            tokenUsage?: { inputTokens?: number; outputTokens?: number };
          }).tokenUsage;
          totalInputTokens += usage?.inputTokens || 0;
          totalOutputTokens += usage?.outputTokens || 0;
        }

        const enrichedChunkData =
          context?.retryStep?.stepId !== undefined &&
          chunk.data &&
          typeof chunk.data === 'object'
            ? {
                ...(chunk.data as Record<string, unknown>),
                retryFromStepId: context.retryStep.stepId
              }
            : chunk.data;

        await stream.writeSSE({
          event: chunk.type,
          data: JSON.stringify(enrichedChunkData)
        });
      }

      // 在服务端彻底闭环扣除积分
      if (sb && userId) {
        // 根据当前引擎决定 provider 标记
        const providerName = process.env.AGENT_ENGINE === 'openagent'
          ? (process.env.OPENAGENT_PROVIDER || 'openai')
          : 'gemini';
        const defaultAction = 'ai_chat_basic';

        try {
          const { data: creditResult, error } = await sb.rpc('consume_credits', {
            p_user_id: userId,
            p_action: defaultAction,
            p_metadata: {
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
              provider: providerName,
              timestamp: new Date().toISOString()
            }
          });

          if (error) {
            console.error('[AgentRoute] consume_credits RPC error:', error);
          } else {
            console.log(`[AgentRoute] Server-side credit deducted for user ${userId}. Result:`, creditResult);
            // Optionally, we could send a 'credit_update' SSE chunk here so the client can refresh balance proactively.
          }
        } catch (err) {
          console.error('[AgentRoute] Post-payment deduction failed internally:', err);
        }
      }
    } catch (error) {
      console.error('[AgentRoute] Smart chat error:', error);
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({
          message: error instanceof Error ? error.message : '智能对话失败'
        })
      });
    }
  });
});

// ============================================
// 工具确认接口
// ============================================

agentRoutes.post('/confirm-tool', requireAuth, async (c) => {
  const body = await c.req.json<ToolConfirmRequest>();
  const { sessionId, toolCallId, approved } = body;
  const userId = getUserId(c);

  if (!userId) {
    return c.json({ success: false, message: '未认证用户' }, 401);
  }

  if (!sessionId || !toolCallId) {
    return c.json({
      success: false,
      message: '缺少 sessionId 或 toolCallId'
    }, 400);
  }

  const { delivered } = await resolveToolConfirmation({
    userId,
    sessionId,
    toolCallId,
    approved
  });

  console.log(
    `[AgentRoute] Tool execution ${approved ? 'approved' : 'rejected'}: ${toolCallId}, delivered=${delivered}`
  );

  return c.json({
    success: true,
    delivered,
    message: approved ? '工具已批准执行' : '工具已取消'
  });
});

// ============================================
// 提供商信息接口
// ============================================

agentRoutes.get('/providers', async (c) => {
  const providers = await providerFactory.getAvailableProviders();
  return c.json({ providers });
});

// ============================================
// 笔记接口 - 需要认证
// ============================================

// 获取所有笔记
agentRoutes.get('/notes', requireAuth, async (c) => {
  const userId = getUserId(c)!;

  try {
    const notes = await getAllNotes(userId);
    return c.json({ notes });
  } catch (error) {
    console.error('[AgentRoute] Get notes error:', error);
    return c.json({ error: '获取笔记失败' }, 500);
  }
});

// 获取单个笔记
agentRoutes.get('/notes/:id', requireAuth, async (c) => {
  const noteId = c.req.param('id');
  if (!noteId) {
    return c.json({ error: '缺少笔记 ID' }, 400);
  }
  const userId = getUserId(c)!;

  try {
    const note = await getNote(noteId, userId);

    if (!note) {
      return c.json({ error: '笔记不存在' }, 404);
    }

    return c.json({ note });
  } catch (error) {
    console.error('[AgentRoute] Get note error:', error);
    return c.json({ error: '获取笔记失败' }, 500);
  }
});

// 更新笔记
agentRoutes.patch('/notes/:id', requireAuth, async (c) => {
  const noteId = c.req.param('id');
  if (!noteId) {
    return c.json({ error: '缺少笔记 ID' }, 400);
  }
  const userId = getUserId(c)!;
  const body = await c.req.json<{
    title?: string;
    content?: string;
    tags?: string[];
  }>();

  try {
    await updateNote(noteId, body, userId);
    return c.json({ success: true });
  } catch (error) {
    console.error('[AgentRoute] Update note error:', error);
    return c.json({ error: '更新笔记失败' }, 500);
  }
});

// 删除笔记
agentRoutes.delete('/notes/:id', requireAuth, async (c) => {
  const noteId = c.req.param('id');
  if (!noteId) {
    return c.json({ error: '缺少笔记 ID' }, 400);
  }
  const userId = getUserId(c)!;

  try {
    await deleteNote(noteId, userId);
    return c.json({ success: true });
  } catch (error) {
    console.error('[AgentRoute] Delete note error:', error);
    return c.json({ error: '删除笔记失败' }, 500);
  }
});
