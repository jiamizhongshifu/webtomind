// @vitest-environment node
/**
 * OpenAI Agents SDK 适配层单测：
 * - mapRunStreamEvent：流式事件 → 上层 SSE 消息（partial_message / assistant / tool_result）
 * - extractToolOutputText：工具结果内容块 → 纯文本
 * - defineTool：平台工具 → Agents SDK tool()
 * - createAgent：端到端 Agent 循环（ScriptedModel 驱动：工具调用 → 工具结果 → 终稿）
 */
import { describe, it, expect } from 'vitest';
import { Usage } from '@openai/agents-core';
import {
  ScriptedModel,
  modelStream,
  modelError,
  functionCall,
  assistantMessage
} from '@openai/agents-core/testing';
import {
  createAgent,
  defineTool,
  extractToolOutputText,
  mapRunStreamEvent,
  type OpenAgentToolDefinition
} from '../openai-agents-sdk';

// ---------------------------------------------------------------------------
// mapRunStreamEvent 纯函数
// ---------------------------------------------------------------------------

describe('mapRunStreamEvent', () => {
  it('maps output_text_delta to partial_message', () => {
    const msg = mapRunStreamEvent({
      type: 'raw_model_stream_event',
      data: { type: 'output_text_delta', delta: '正在生成' },
      source: undefined
    } as never);
    expect(msg).toEqual({ type: 'partial_message', content: '正在生成' });
  });

  it('ignores non-text raw events', () => {
    expect(
      mapRunStreamEvent({
        type: 'raw_model_stream_event',
        data: { type: 'response_started' },
        source: undefined
      } as never)
    ).toBeNull();
  });

  it('maps tool_called item to assistant/tool_use with parsed args', () => {
    const msg = mapRunStreamEvent({
      type: 'run_item_stream_event',
      name: 'tool_called',
      item: {
        type: 'tool_call_item',
        rawItem: {
          type: 'function_call',
          name: 'generate_image',
          callId: 'call_1',
          arguments: '{"prompt":"a cat","imageSize":"1k"}'
        }
      }
    } as never);
    expect(msg).toEqual({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'call_1',
            name: 'generate_image',
            input: { prompt: 'a cat', imageSize: '1k' }
          }
        ]
      }
    });
  });

  it('maps tool_output item to tool_result (text output)', () => {
    const msg = mapRunStreamEvent({
      type: 'run_item_stream_event',
      name: 'tool_output',
      item: {
        type: 'tool_call_output_item',
        rawItem: {
          type: 'function_call_result',
          name: 'generate_image',
          callId: 'call_1',
          status: 'completed',
          output: { type: 'text', text: '{"ok":true}' }
        }
      }
    } as never);
    expect(msg).toEqual({
      type: 'tool_result',
      tool_name: 'generate_image',
      result: '{"ok":true}',
      is_error: false
    });
  });

  it('marks incomplete tool output as error', () => {
    const msg = mapRunStreamEvent({
      type: 'run_item_stream_event',
      name: 'tool_output',
      item: {
        type: 'tool_call_output_item',
        rawItem: {
          type: 'function_call_result',
          name: 'generate_image',
          callId: 'call_1',
          status: 'incomplete',
          output: 'timeout'
        }
      }
    } as never);
    expect(msg).toMatchObject({ type: 'tool_result', is_error: true });
  });

  it('ignores unrelated run item events', () => {
    expect(
      mapRunStreamEvent({
        type: 'run_item_stream_event',
        name: 'message_output_created',
        item: { type: 'message_output_item' }
      } as never)
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractToolOutputText
// ---------------------------------------------------------------------------

describe('extractToolOutputText', () => {
  it('passes strings through', () => {
    expect(extractToolOutputText('plain')).toBe('plain');
  });

  it('extracts text from a single content block', () => {
    expect(
      extractToolOutputText({ type: 'text', text: '{"imageUrl":"x"}' })
    ).toBe('{"imageUrl":"x"}');
  });

  it('joins array content blocks', () => {
    expect(
      extractToolOutputText([
        { type: 'text', text: 'a' },
        { type: 'text', text: 'b' }
      ])
    ).toBe('ab');
  });

  it('stringifies plain objects', () => {
    expect(extractToolOutputText({ ok: true })).toBe('{"ok":true}');
  });
});

// ---------------------------------------------------------------------------
// defineTool
// ---------------------------------------------------------------------------

describe('defineTool', () => {
  const toolDef: OpenAgentToolDefinition = {
    name: 'generate_image',
    description: 'Generate an image',
    inputSchema: {
      type: 'object',
      properties: { prompt: { type: 'string' } },
      required: ['prompt']
    },
    call: async (input) => JSON.stringify({ ok: true, prompt: input.prompt })
  };

  it('exposes name/description and executes call() with parsed input', async () => {
    const sdkTool = defineTool(toolDef);
    expect(sdkTool.name).toBe('generate_image');
    expect(sdkTool.description).toBe('Generate an image');

    // invoke like the SDK runner does: (runContext, input: JSON string)
    const result = await (sdkTool as unknown as {
      invoke: (runContext: unknown, input: string) => Promise<unknown>;
    }).invoke({} as never, JSON.stringify({ prompt: 'a cat' }));
    expect(result).toBe('{"ok":true,"prompt":"a cat"}');
  });
});

// ---------------------------------------------------------------------------
// createAgent：端到端 Agent 循环（ScriptedModel）
// ---------------------------------------------------------------------------

function responseDone(id: string, output: unknown[]) {
  return {
    type: 'response_done',
    response: {
      id,
      usage: new Usage({
        requests: 1,
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15
      }),
      output
    }
  } as never;
}

describe('createAgent (openai-agents-js)', () => {
  it('runs a tool-call loop and emits codeany-compatible messages', async () => {
    const generateImageTool: OpenAgentToolDefinition = {
      name: 'generate_image',
      description: 'Generate an image via platform channel',
      inputSchema: {
        type: 'object',
        properties: { prompt: { type: 'string' } },
        required: ['prompt']
      },
      call: async (input) =>
        JSON.stringify({ ok: true, prompt: input.prompt, imageUrl: 'data:image/png;base64,AAA' })
    };

    const script = new ScriptedModel([
      modelStream([responseDone('resp-0', [
        functionCall('generate_image', { prompt: 'a cat' }, { callId: 'call_1', id: 'fc_1' })
      ])]),
      modelStream([
        { type: 'output_text_delta', delta: '已生成' },
        responseDone('resp-1', [assistantMessage('已生成')])
      ])
    ]);

    const instance = createAgent(
      {
        model: 'deepseek-v4-flash',
        apiKey: 'sk-test',
        baseURL: 'https://api.deepseek.com/v1',
        systemPrompt: 'You are an image agent.',
        tools: [generateImageTool],
        maxTurns: 5
      },
      script
    );

    const messages: unknown[] = [];
    for await (const msg of instance.query('画一只猫')) {
      messages.push(msg);
    }

    // 1) tool_call → assistant/tool_use（input 为解析后的对象）
    expect(messages).toContainEqual({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'call_1',
            name: 'generate_image',
            input: { prompt: 'a cat' }
          }
        ]
      }
    });

    // 2) tool_result（文本输出）
    expect(messages).toContainEqual({
      type: 'tool_result',
      tool_name: 'generate_image',
      result: '{"ok":true,"prompt":"a cat","imageUrl":"data:image/png;base64,AAA"}',
      is_error: false
    });

    // 3) 终稿文本增量（partial_message）
    expect(messages).toContainEqual({ type: 'partial_message', content: '已生成' });

    // 4) 正常结束
    expect(messages).toContainEqual({ type: 'result', subtype: 'success' });

    // 5) 两条模型请求都被消费（无多余轮次）
    script.assertComplete();
  });

  it('emits an error result when the model loop throws', async () => {
    const script = new ScriptedModel([modelError(new Error('boom'))]);

    const instance = createAgent(
      {
        model: 'deepseek-v4-flash',
        apiKey: 'sk-test',
        systemPrompt: 'x',
        tools: [],
        maxTurns: 5
      },
      script
    );

    const messages: unknown[] = [];
    for await (const msg of instance.query('hi')) {
      messages.push(msg);
    }
    expect(messages).toContainEqual({
      type: 'result',
      subtype: 'error_during_execution',
      result: 'boom'
    });
  });
});
