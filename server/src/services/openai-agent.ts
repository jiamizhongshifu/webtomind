/**
 * OpenAI Agent 服务
 * 使用 OpenAI Chat Completions API（兼容第三方中转站）
 * 支持 function calling 和流式响应
 */

import type {
  IAgentService,
  StreamChunk,
  ChatContext,
  ToolCallData,
  ToolResultData
} from '../types/api.js';
import {
  executeTool,
  getToolDefinitions,
  requiresToolConfirmation
} from '../tools/index.js';
import { createSkillManager, createPromptBuilder } from '../skills/index.js';
import type { SkillManager } from '../skills/skill-manager.js';
import type { PromptBuilder } from '../skills/prompt-builder.js';
import {
  waitForToolConfirmation
} from './tool-confirmation-store.js';

// OpenAI-compatible 模型配置（默认使用 DeepSeek）
// API id `deepseek-v4-flash` currently resolves to DeepSeek-V4-Flash-0731.
const MODEL = 'deepseek-v4-flash';
const MAX_TOKENS = 8192;
const BASE_URL =
  process.env.DEEPSEEK_BASE_URL ||
  process.env.OPENAI_BASE_URL ||
  'https://api.deepseek.com';

// OpenAI API 类型
interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface OpenAIStreamChunk {
  id: string;
  choices: Array<{
    delta: {
      role?: string;
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
}

interface OpenAIResponse {
  id: string;
  choices: Array<{
    message: OpenAIMessage;
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * 将 Anthropic 工具定义转换为 OpenAI 格式
 */
function convertToolDefinitions(
  anthropicTools: ReturnType<typeof getToolDefinitions>
): OpenAITool[] {
  return anthropicTools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description || '',
      parameters: tool.input_schema || { type: 'object', properties: {} }
    }
  }));
}

/**
 * OpenAI Agent 服务
 */
export class OpenAIAgentService implements IAgentService {
  private conversationHistory: Map<string, OpenAIMessage[]> = new Map();
  private skillManager: SkillManager;
  private promptBuilder: PromptBuilder;

  constructor() {
    const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn('[OpenAIAgent] DEEPSEEK_API_KEY not set');
    }

    // 初始化 Skills 系统
    this.skillManager = createSkillManager({
      selectionStrategy: 'highest_score',
      minMatchScore: 0.3,
      maxActiveSkills: 3,
      enableProgressiveDisclosure: true,
      defaultSkills: ['content_understanding', 'information_search']
    });

    this.promptBuilder = createPromptBuilder(this.skillManager, {
      includeExamples: false,
      includeEdgeCases: false,
      language: 'zh-CN',
      maxLength: 8000
    });

    console.log(`[OpenAIAgent] Initialized with model: ${MODEL}, base: ${BASE_URL}`);
  }

  getName(): string {
    return 'DeepSeek Agent';
  }

  async isAvailable(): Promise<boolean> {
    return !!(process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY);
  }

  /**
   * 调用 OpenAI Chat Completions API
   */
  private async callAPI(
    messages: OpenAIMessage[],
    tools?: OpenAITool[],
    stream = false
  ): Promise<Response> {
    const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('DEEPSEEK_API_KEY not configured');
    }

    const body: Record<string, unknown> = {
      model: MODEL,
      messages,
      max_tokens: MAX_TOKENS,
      stream
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepSeek API error ${response.status}: ${errorText}`);
    }

    return response;
  }

  /**
   * 解析非流式响应
   */
  private async parseResponse(response: Response): Promise<OpenAIResponse> {
    return response.json() as Promise<OpenAIResponse>;
  }

  /**
   * 流式聊天 - 支持工具调用
   */
  async *chat(
    prompt: string,
    context?: ChatContext,
    sessionId?: string
  ): AsyncIterable<StreamChunk> {
    const systemPrompt = this.buildSystemPrompt(prompt, context);

    // 获取或创建会话历史
    const history = sessionId
      ? this.conversationHistory.get(sessionId) || []
      : [];

    // 添加系统消息（如果是新会话）
    if (history.length === 0) {
      history.push({ role: 'system', content: systemPrompt });
    }

    // 添加用户消息
    history.push({ role: 'user', content: prompt });

    // 获取工具定义并转换
    const anthropicTools = getToolDefinitions();
    const tools = convertToolDefinitions(anthropicTools);

    try {
      yield {
        type: 'status',
        data: { status: 'analyzing', message: '正在分析请求...' }
      };

      console.log('[OpenAIAgent] Starting chat with prompt:', prompt.substring(0, 100));

      let continueLoop = true;
      let loopCount = 0;
      const maxLoops = 10;

      while (continueLoop && loopCount < maxLoops) {
        loopCount++;
        console.log('[OpenAIAgent] Loop', loopCount, '- Calling OpenAI API...');

        // 使用流式请求获取文本，非流式获取工具调用
        const streamResponse = await this.callAPI(history, tools, true);
        const reader = streamResponse.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let fullContent = '';
        const toolCalls: Map<number, { id: string; name: string; args: string }> = new Map();
        let finishReason = '';

        // 处理 SSE 流
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;

            try {
              const chunk = JSON.parse(data) as OpenAIStreamChunk;
              const choice = chunk.choices[0];
              if (!choice) continue;

              if (choice.finish_reason) {
                finishReason = choice.finish_reason;
              }

              // 文本内容
              if (choice.delta.content) {
                fullContent += choice.delta.content;
                yield {
                  type: 'text',
                  data: { content: choice.delta.content }
                };
              }

              // 工具调用（增量拼接）
              if (choice.delta.tool_calls) {
                for (const tc of choice.delta.tool_calls) {
                  const existing = toolCalls.get(tc.index);
                  if (existing) {
                    if (tc.function?.arguments) {
                      existing.args += tc.function.arguments;
                    }
                  } else {
                    toolCalls.set(tc.index, {
                      id: tc.id || '',
                      name: tc.function?.name || '',
                      args: tc.function?.arguments || ''
                    });
                  }
                }
              }
            } catch {
              // 忽略解析错误
            }
          }
        }

        // 构建助手消息
        const assistantMessage: OpenAIMessage = {
          role: 'assistant',
          content: fullContent || null
        };

        if (toolCalls.size > 0) {
          assistantMessage.tool_calls = Array.from(toolCalls.values()).map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: tc.args
            }
          }));
        }

        history.push(assistantMessage);

        // 处理工具调用
        if (finishReason === 'tool_calls' && toolCalls.size > 0) {
          yield {
            type: 'status',
            data: { status: 'executing', message: '正在执行工具...' }
          };

          for (const [, tc] of toolCalls) {
            let toolInput: Record<string, unknown> = {};
            try {
              toolInput = JSON.parse(tc.args);
            } catch {
              toolInput = {};
            }

            const needsConfirmation = requiresToolConfirmation(tc.name);
            const canWaitForConfirmation = needsConfirmation && !!sessionId && !!context?.userId;

            yield {
              type: 'tool_call',
              data: {
                id: tc.id,
                name: tc.name,
                input: toolInput,
                status: canWaitForConfirmation ? 'pending' : 'running',
                requiresConfirmation: needsConfirmation
              } as ToolCallData
            };

            if (canWaitForConfirmation) {
              const decision = await waitForToolConfirmation({
                userId: context!.userId!,
                sessionId,
                toolCallId: tc.id
              });

              if (!decision.approved) {
                const cancelMessage = decision.timedOut
                  ? '工具确认超时，已取消执行'
                  : '用户取消了该工具调用';

                yield {
                  type: 'tool_result',
                  data: {
                    id: tc.id,
                    name: tc.name,
                    result: null,
                    success: false,
                    cancelled: true,
                    message: cancelMessage
                  } as ToolResultData
                };

                history.push({
                  role: 'tool',
                  tool_call_id: tc.id,
                  content: JSON.stringify({ success: false, error: cancelMessage, cancelled: true })
                });
                continue;
              }

              yield {
                type: 'tool_call',
                data: {
                  id: tc.id,
                  name: tc.name,
                  input: toolInput,
                  status: 'running',
                  requiresConfirmation: true
                } as ToolCallData
              };
            }

            console.log(`[OpenAIAgent] Executing tool: ${tc.name}`);

            const toolContext = {
              userId: context?.userId,
              projectId: context?.projectId
            };

            const result = await executeTool(tc.name, toolInput, toolContext);

            yield {
              type: 'tool_result',
              data: {
                id: tc.id,
                name: tc.name,
                result: result.data,
                success: result.success
              } as ToolResultData
            };

            history.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify(result)
            });
          }

          continueLoop = true;
        } else {
          continueLoop = false;
        }
      }

      // 保存会话历史
      if (sessionId) {
        this.conversationHistory.set(sessionId, history);
      }

      yield { type: 'done', data: {} };
    } catch (error) {
      console.error('[OpenAIAgent] Error:', error);
      yield {
        type: 'error',
        data: {
          message: error instanceof Error ? error.message : '未知错误'
        }
      };
    }
  }

  /**
   * 构建系统提示
   */
  private buildSystemPrompt(prompt: string, context?: ChatContext): string {
    let systemPrompt = this.promptBuilder.buildSystemPrompt(prompt);

    if (context?.references) {
      systemPrompt += `\n\n---\n## 用户提供的参考内容\n${context.references}\n`;
    }

    if (context?.pageInfo) {
      systemPrompt += `\n\n---\n## 当前页面信息\n- URL: ${context.pageInfo.url}\n- 标题: ${context.pageInfo.title}\n`;
    }

    return systemPrompt;
  }

  /**
   * 清除会话历史
   */
  clearSession(sessionId: string): void {
    this.conversationHistory.delete(sessionId);
  }
}

// 导出单例
export const openaiAgent = new OpenAIAgentService();
