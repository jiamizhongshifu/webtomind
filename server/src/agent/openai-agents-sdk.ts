/**
 * OpenAI Agents SDK（@openai/agents-core + @openai/agents-openai）集成层
 *
 * 与 open-agent-sdk.ts（@codeany/open-agent-sdk）保持同一契约：
 *   createAgent(config) / defineTool(def) / OpenAgentInstance.query(): AsyncIterable<unknown>
 *
 * 面向 Cloudflare Worker（workerd + nodejs_compat）：
 * - 进程内 Agent 循环，无需子进程/CLI；
 * - DeepSeek 走 OpenAI-compatible Chat Completions（OpenAIProvider + useResponses:false）；
 * - 会话不落盘（persistSession 兼容参数被忽略）；
 * - 仅暴露调用方传入的工具，不触发 SDK 的 bash/文件类内置工具。
 *
 * query() 产出的消息形状与 codeany 路径保持一致（partial_message / assistant / tool_result / result），
 * 供上层 mapSdkMessageToEvents 直接复用，SSE 协议不变。
 */

import {
  Agent,
  Runner,
  tool,
  user,
  type Model,
  type RunStreamEvent
} from '@openai/agents-core';
import { OpenAIProvider } from '@openai/agents-openai';

// ---------------------------------------------------------------------------
// 契约（与 open-agent-sdk.ts 对齐）
// ---------------------------------------------------------------------------

export interface OpenAgentToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  call(input: Record<string, unknown>): Promise<string>;
}

export interface OpenAgentInstance {
  query(prompt: string): AsyncIterable<unknown>;
  close(): Promise<void>;
}

export interface OpenAgentCreateConfig {
  model: string;
  apiKey: string;
  baseURL?: string;
  /** 兼容层：仅支持 openai-completions（DeepSeek）；anthropic-messages 不支持时抛错 */
  apiType?: 'openai-completions' | 'anthropic-messages';
  /** 兼容层：openai-agents-js 会话在内存中，不落盘，忽略该参数 */
  persistSession?: boolean;
  tools: OpenAgentToolDefinition[];
  maxTurns: number;
  systemPrompt: string;
}

// ---------------------------------------------------------------------------
// Agent 输出消息（上层 mapSdkMessageToEvents 能识别的形状）
// ---------------------------------------------------------------------------

export type AgentSdkMessage =
  | { type: 'partial_message'; content: string }
  | {
      type: 'assistant';
      message: {
        role: 'assistant';
        content: Array<
          | { type: 'text'; text: string }
          | { type: 'tool_use'; id: string; name: string; input: unknown }
        >;
      };
    }
  | { type: 'tool_result'; tool_name: string; result: unknown; is_error?: boolean };

// ---------------------------------------------------------------------------
// 工具适配
// ---------------------------------------------------------------------------

/** 把平台工具（JSON Schema 入参）转换为 OpenAI Agents SDK 的 tool() */
export const defineTool = (def: OpenAgentToolDefinition) =>
  tool({
    name: def.name,
    description: def.description,
    parameters: {
      type: 'object' as const,
      properties: (def.inputSchema.properties ?? {}) as Record<
        string,
        Record<string, unknown>
      >,
      required: (def.inputSchema.required ?? []) as string[],
      additionalProperties: true as const
    },
    strict: false,
    execute: async (input: unknown) => {
      const result = await def.call(
        (input ?? {}) as Record<string, unknown>
      );
      return result;
    }
  });

// ---------------------------------------------------------------------------
// 流式事件 → AgentSdkMessage（纯函数，可单测）
// ---------------------------------------------------------------------------

function safeParseToolArgs(raw: unknown): unknown {
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** 从工具结果内容块中提取纯文本（成功输出 / 错误文本），供 extractImageUrl 复用 */
export function extractToolOutputText(output: unknown): string {
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) {
    return output
      .map((block) =>
        block && typeof block === 'object' && 'text' in block
          ? String((block as { text: unknown }).text ?? '')
          : ''
      )
      .join('');
  }
  if (
    output &&
    typeof output === 'object' &&
    'text' in output &&
    typeof (output as { text: unknown }).text === 'string'
  ) {
    return (output as { text: string }).text;
  }
  try {
    return JSON.stringify(output ?? '');
  } catch {
    return String(output ?? '');
  }
}

/** 把 OpenAI Agents SDK 的流式事件映射为上层 SSE 可识别的消息 */
export function mapRunStreamEvent(
  event: RunStreamEvent
): AgentSdkMessage | null {
  // 文本增量：partial_message（SSE text 事件流式输出）
  if (event.type === 'raw_model_stream_event') {
    const data = event.data as { type?: string; delta?: unknown } | null;
    if (
      data &&
      data.type === 'output_text_delta' &&
      typeof data.delta === 'string' &&
      data.delta
    ) {
      return { type: 'partial_message', content: data.delta };
    }
    return null;
  }

  if (event.type === 'run_item_stream_event') {
    const raw = (event.item as { rawItem?: unknown } | null)?.rawItem as
      | { type?: string; name?: string; callId?: string; id?: string; arguments?: string }
      | undefined;

    if (event.name === 'tool_called' && raw?.type === 'function_call') {
      return {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: raw.callId || raw.id || '',
              name: raw.name || '',
              input: safeParseToolArgs(raw.arguments)
            }
          ]
        }
      };
    }

    if (event.name === 'tool_output' && raw?.type === 'function_call_result') {
      const resultItem = event.item as {
        rawItem?: { status?: string; output?: unknown };
      };
      return {
        type: 'tool_result',
        tool_name: raw.name || '',
        result: extractToolOutputText(resultItem.rawItem?.output),
        is_error: resultItem.rawItem?.status === 'incomplete'
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// createAgent
// ---------------------------------------------------------------------------

export function createAgent(
  config: OpenAgentCreateConfig,
  /** 测试注入：自定义 Model（生产环境不传，走 DeepSeek OpenAIProvider） */
  modelOverride?: Model
): OpenAgentInstance {
  if (config.apiType && config.apiType !== 'openai-completions') {
    throw new Error(
      `openai-agents-sdk 仅支持 openai-completions（DeepSeek），收到: ${config.apiType}`
    );
  }

  const openaiProvider = new OpenAIProvider({
    apiKey: config.apiKey,
    baseURL: config.baseURL || 'https://api.deepseek.com/v1',
    // DeepSeek 只有 Chat Completions，不启用 Responses API
    useResponses: false
  });

  // 测试注入 Model 时直接使用；生产用模型名 + Runner 的 modelProvider 解析（DeepSeek）。
  // 注意：openai-agents-js 0.16.x 中 per-run options.modelProvider 不生效，须挂在 Runner 上。
  const agent = new Agent({
    name: 'image-creation-agent',
    instructions: config.systemPrompt,
    model: modelOverride ?? config.model,
    tools: config.tools.map(defineTool)
  });
  const runner = modelOverride
    ? new Runner()
    : new Runner({ modelProvider: openaiProvider });

  return {
    async *query(prompt: string): AsyncIterable<unknown> {
      try {
        const result = await runner.run(agent, [user(prompt)], {
          stream: true,
          maxTurns: config.maxTurns
        });
        for await (const event of result) {
          const msg = mapRunStreamEvent(event);
          if (msg) yield msg;
        }
      } catch (error) {
        yield {
          type: 'result',
          subtype: 'error_during_execution',
          result: error instanceof Error ? error.message : String(error)
        };
        return;
      }
      yield { type: 'result', subtype: 'success' };
    },
    async close() {
      // 会话在内存中，无持久磁盘资源需要释放
    }
  };
}
