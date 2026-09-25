/**
 * OpenAgentService v2
 * 基于 @codeany/open-agent-sdk 新 API (createAgent + query)
 *
 * 使用 createAgent() 统一管理 LLM 调用和工具执行，
 * 通过 query() 流式输出响应。
 *
 * 通过环境变量 AGENT_ENGINE=openagent 启用。
 */

import {
  createAgent,
  type OpenAgentInstance
} from '../agent/open-agent-sdk.js';
import type { IAgentService, StreamChunk, ChatContext } from '../types/api.js';
import { buildAgentTools, type AdapterContext } from '../agent/tool-adapter.js';
import { getSkillToAgentBridge } from '../agent/skill-to-agent.js';
import { analyzeImages } from '../agent/vision-preprocessor.js';

/**
 * 查询项目自定义指令(ChatGPT-style)。在 Node runtime 里直接调 Supabase REST。
 * 失败/空 → 返回 ''(对话回到默认行为)。
 */
async function loadProjectInstructions(
  projectId: string,
  userId: string | undefined
): Promise<string> {
  try {
    // 安全:没有 userId 不查(防止越权);查询必须同时按 user_id 过滤,
    // 否则用户 A 传 B 的 projectId 就能加载 B 的私有指令(service_role 绕过 RLS)
    if (!userId) return '';
    const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!sbUrl || !sbKey) return '';
    const url = `${sbUrl.replace(/\/+$/, '')}/rest/v1/workspace_projects?id=eq.${encodeURIComponent(projectId)}&user_id=eq.${encodeURIComponent(userId)}&select=instructions`;
    const resp = await fetch(url, {
      headers: {
        apikey: sbKey,
        Authorization: `Bearer ${sbKey}`,
        Accept: 'application/json'
      }
    });
    if (!resp.ok) return '';
    const rows = (await resp.json()) as Array<{ instructions?: string | null }>;
    const v = rows?.[0]?.instructions;
    return typeof v === 'string' && v.trim() ? v.trim() : '';
  } catch (err) {
    console.warn('[OpenAgentService] load project instructions failed:', err);
    return '';
  }
}

const MAX_TURNS = 10;
const DEEPSEEK_V4_FLASH_0731_MODEL = 'deepseek-v4-flash';

function resolveModel(): string {
  return DEEPSEEK_V4_FLASH_0731_MODEL;
}

function resolveApiKey(): string {
  return (
    process.env.DEEPSEEK_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    ''
  );
}

function resolveBaseURL(): string | undefined {
  return (
    process.env.DEEPSEEK_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    process.env.ANTHROPIC_BASE_URL ||
    'https://api.deepseek.com'
  );
}

export class OpenAgentService implements IAgentService {
  private skillBridge = getSkillToAgentBridge();

  getName(): string {
    return 'OpenAgent (@codeany/open-agent-sdk)';
  }

  async isAvailable(): Promise<boolean> {
    return !!resolveApiKey();
  }

  async *chat(
    prompt: string,
    context?: ChatContext,
    sessionId?: string
  ): AsyncIterable<StreamChunk> {
    let agent: OpenAgentInstance | null = null;
    try {
      yield makeStatusChunk('analyzing', '正在分析请求...');

      // 双模型图片处理：VLM 分析图片 → 文本上下文注入
      let enrichedPrompt = prompt;
      if (context?.referenceImages && context.referenceImages.length > 0) {
        yield makeStatusChunk('analyzing', '正在分析图片内容...');
        const imageAnalysis = await analyzeImages(prompt, context.referenceImages);
        enrichedPrompt += `\n\n---\n## 图片分析结果（由视觉模型提供）\n${imageAnalysis}\n`;
        console.log(`[OpenAgentService] ${context.referenceImages.length} image(s) analyzed by VLM`);
      }

      // 项目自定义指令 — 若存在则 prepend 到 system prompt(必须校验归属)
      const projectInstructions = context?.projectId
        ? await loadProjectInstructions(context.projectId, context?.userId)
        : '';

      // 构建系统提示
      const agentConfig = this.skillBridge.buildAgentConfig(
        enrichedPrompt,
        context,
        projectInstructions
      );

      // 构建工具（注入用户上下文）
      const adapterCtx: AdapterContext = {
        userId: context?.userId,
        projectId: context?.projectId,
        sessionId
      };
      const tools = buildAgentTools(adapterCtx);

      // 创建 Agent（新 SDK API）
      agent = createAgent({
        model: resolveModel(),
        apiKey: resolveApiKey(),
        baseURL: resolveBaseURL(),
        tools,
        maxTurns: MAX_TURNS,
        systemPrompt: agentConfig.systemPrompt
      });

      yield makeStatusChunk('generating', '正在生成回复...');

      // 流式输出
      for await (const msg of agent.query(enrichedPrompt)) {
        const chunks = mapMessageToChunks(msg as unknown as SDKMsg);
        for (const chunk of chunks) {
          yield chunk;
        }
      }
    } catch (error) {
      console.error('[OpenAgentService] Error:', error);
      yield makeErrorChunk(
        error instanceof Error ? error.message : '未知错误'
      );
    } finally {
      if (agent) {
        try {
          await agent.close();
        } catch (closeError) {
          console.warn('[OpenAgentService] Agent cleanup failed:', closeError);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Message → StreamChunk 映射
// ---------------------------------------------------------------------------

interface SDKMsg {
  type: string;
  message?: {
    content?: Array<{
      type: string;
      text?: string;
      id?: string;
      name?: string;
      input?: unknown;
    }>;
  };
  content?: string | Array<{ type: string; text?: string }>;
  tool_use_id?: string;
  id?: string;
  tool_name?: string;
  name?: string;
  result?: unknown;
  is_error?: boolean;
  subtype?: string;
  usage?: unknown;
  total_cost_usd?: number;
  duration_ms?: number;
}

function mapMessageToChunks(msg: SDKMsg): StreamChunk[] {
  const chunks: StreamChunk[] = [];

  switch (msg.type) {
    case 'partial_message': {
      // 流式文本增量
      const content = typeof msg.content === 'string' ? msg.content : '';
      if (content) {
        chunks.push({ type: 'text', data: { content } });
      }
      break;
    }

    case 'assistant': {
      // 完整的 assistant 消息（可能包含 text + tool_use blocks）
      const contentBlocks = msg.message?.content || [];
      for (const block of contentBlocks) {
        if (block.type === 'text' && block.text) {
          chunks.push({ type: 'text', data: { content: block.text } });
        } else if (block.type === 'tool_use') {
          chunks.push({
            type: 'tool_call',
            data: {
              id: block.id || '',
              name: block.name || '',
              input: block.input ?? {},
              status: 'running'
            }
          });
        }
      }
      break;
    }

    case 'tool_result': {
      chunks.push({
        type: 'tool_result',
        data: {
          id: msg.tool_use_id || msg.id || '',
          name: msg.tool_name || msg.name || '',
          result: msg.result ?? msg.content,
          success: !msg.is_error
        }
      });
      break;
    }

    case 'result': {
      // 最终完成信号
      if (msg.subtype && msg.subtype.startsWith('error')) {
        chunks.push({
          type: 'error',
          data: { message: String(msg.result || '执行失败') }
        });
      }
      chunks.push({ type: 'done', data: {} });
      break;
    }

    default:
      break;
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStatusChunk(status: string, message: string): StreamChunk {
  return { type: 'status', data: { status, message } };
}

function makeErrorChunk(message: string): StreamChunk {
  return { type: 'error', data: { message } };
}

export const openAgentService = new OpenAgentService();
