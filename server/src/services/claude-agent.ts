/**
 * Claude Agent 服务
 * 使用 Anthropic SDK 实现 Agent 能力
 * 集成 Skills 系统实现渐进式披露
 * 支持重试机制提高可靠性
 */

import Anthropic from '@anthropic-ai/sdk';
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
import {
  isRetryableError,
  calculateBackoff,
  delay,
  CLAUDE_RETRY_CONFIG
} from '../utils/retry.js';

// Claude 模型配置
// 支持通过环境变量覆盖模型名称，以兼容第三方 API
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
const MAX_TOKENS = 8192;

function ensureClaudeCompatibleModel(): void {
  if (!MODEL.toLowerCase().includes('claude')) {
    throw new Error(
      `ANTHROPIC_MODEL is not Claude-compatible: ${MODEL}. Please use a Claude model name or switch auto provider to Gemini.`
    );
  }
}

/**
 * Claude Agent 服务
 * 支持 Function Calling 和流式响应
 */
export class ClaudeAgentService implements IAgentService {
  private client: Anthropic;
  private conversationHistory: Map<string, Anthropic.MessageParam[]> =
    new Map();
  private skillManager: SkillManager;
  private promptBuilder: PromptBuilder;

  constructor() {
    // 支持 ANTHROPIC_AUTH_TOKEN 作为第三方代理的认证方式
    const apiKey =
      process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY;
    const baseURL = process.env.ANTHROPIC_BASE_URL;

    if (!apiKey) {
      console.warn(
        '[ClaudeAgent] ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN not set'
      );
    }

    // 配置客户端
    const config: { apiKey?: string; baseURL?: string } = { apiKey };
    if (baseURL) {
      config.baseURL = baseURL;
      console.log('[ClaudeAgent] Using custom base URL:', baseURL);
    }

    this.client = new Anthropic(config);

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

    console.log('[ClaudeAgent] Skills system initialized');
  }

  getName(): string {
    return 'Claude Agent';
  }

  async isAvailable(): Promise<boolean> {
    // 支持原生 API Key 或第三方代理 Token
    return !!(
      process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY
    );
  }

  /**
   * 流式聊天 - 支持工具调用
   */
  async *chat(
    prompt: string,
    context?: ChatContext,
    sessionId?: string
  ): AsyncIterable<StreamChunk> {
    // 构建系统提示
    // 使用 Skills 系统构建动态提示
    const systemPrompt = this.buildSystemPrompt(prompt, context);

    // 获取或创建会话历史
    const history = sessionId
      ? this.conversationHistory.get(sessionId) || []
      : [];

    // 添加用户消息
    const userMessage: Anthropic.MessageParam = {
      role: 'user',
      content: prompt
    };
    history.push(userMessage);

    // 获取工具定义
    const toolDefinitions = getToolDefinitions();

    try {
      // 发送状态
      yield {
        type: 'status',
        data: { status: 'analyzing', message: '正在分析请求...' }
      };

      console.log(
        '[ClaudeAgent] Starting chat with prompt:',
        prompt.substring(0, 100)
      );

      // Agent 循环：处理工具调用
      let continueLoop = true;
      let loopCount = 0;
      const maxLoops = 10;

      while (continueLoop && loopCount < maxLoops) {
        loopCount++;

        console.log('[ClaudeAgent] Loop', loopCount, '- Calling Claude API...');
        ensureClaudeCompatibleModel();

        // 带重试的 API 调用
        let stream: ReturnType<typeof this.client.messages.stream> | undefined;
        let retryAttempt = 0;
        const maxRetries = CLAUDE_RETRY_CONFIG.maxRetries || 3;

        while (retryAttempt <= maxRetries) {
          try {
            // 调用 Claude API（流式）
            // 使用数组格式的 system 参数，兼容第三方代理
            stream = this.client.messages.stream({
              model: MODEL,
              max_tokens: MAX_TOKENS,
              system: [{ type: 'text', text: systemPrompt }],
              messages: history,
              tools: toolDefinitions
            });
            break; // 成功则跳出重试循环
          } catch (error) {
            const err =
              error instanceof Error ? error : new Error(String(error));
            retryAttempt++;

            const retryConfig = {
              maxRetries: CLAUDE_RETRY_CONFIG.maxRetries || 3,
              baseDelay: CLAUDE_RETRY_CONFIG.baseDelay || 1000,
              maxDelay: CLAUDE_RETRY_CONFIG.maxDelay || 15000,
              retryableErrors: CLAUDE_RETRY_CONFIG.retryableErrors || []
            };

            if (
              retryAttempt > maxRetries ||
              !isRetryableError(err, retryConfig)
            ) {
              throw err;
            }

            const backoffDelay = calculateBackoff(
              retryAttempt,
              retryConfig.baseDelay,
              retryConfig.maxDelay
            );

            console.log(
              `[ClaudeAgent] API call failed (attempt ${retryAttempt}/${maxRetries}): ${err.message}. ` +
                `Retrying in ${backoffDelay}ms...`
            );

            // 通知前端重试状态
            yield {
              type: 'status',
              data: {
                status: 'analyzing',
                message: `正在重试... (${retryAttempt}/${maxRetries})`
              }
            };

            await delay(backoffDelay);
          }
        }

        if (!stream) {
          throw new Error('无法创建流式响应');
        }

        console.log('[ClaudeAgent] Stream created, waiting for response...');
        const streamStartTime = Date.now();


        // 处理流式响应
        for await (const event of stream) {
          if (event.type === 'content_block_delta') {
            const delta = event.delta;

            // 文本内容
            if (delta.type === 'text_delta') {
              yield {
                type: 'text',
                data: { content: delta.text }
              };
            }
          }
        }

        console.log(
          `[ClaudeAgent] Stream completed in ${Date.now() - streamStartTime}ms`
        );

        // 获取完整响应
        const response = (await stream.finalMessage()) as Anthropic.Message;

        // 将助手响应添加到历史
        history.push({
          role: 'assistant',
          content: response.content
        });

        // 检查是否需要执行工具
        const toolUseBlocks = response.content.filter(
          (block: Anthropic.ContentBlock): block is Anthropic.ToolUseBlock =>
            block.type === 'tool_use'
        );

        if (toolUseBlocks.length > 0) {
          const hasConfirmationStep = toolUseBlocks.some(
            (toolUse: Anthropic.ToolUseBlock) =>
              requiresToolConfirmation(toolUse.name)
          );

          yield {
            type: 'status',
            data: {
              status: 'executing',
              message: hasConfirmationStep
                ? '等待工具确认...'
                : '正在执行工具...'
            }
          };

          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          // 构建工具执行上下文
          const toolContext = {
            userId: context?.userId,
            projectId: context?.projectId
          };

          for (const toolUse of toolUseBlocks) {
            const toolInput =
              toolUse.input && typeof toolUse.input === 'object'
                ? (toolUse.input as Record<string, unknown>)
                : {};
            const needsConfirmation = requiresToolConfirmation(toolUse.name);
            const canWaitForConfirmation =
              needsConfirmation && !!sessionId && !!context?.userId;

            yield {
              type: 'tool_call',
              data: {
                id: toolUse.id,
                name: toolUse.name,
                input: toolInput,
                status: canWaitForConfirmation ? 'pending' : 'running',
                requiresConfirmation: needsConfirmation
              } as ToolCallData
            };

            if (canWaitForConfirmation) {
              const decision = await waitForToolConfirmation({
                userId: context.userId!,
                sessionId,
                toolCallId: toolUse.id
              });

              if (!decision.approved) {
                const cancelMessage = decision.timedOut
                  ? '工具确认超时，已取消执行'
                  : '用户取消了该工具调用';

                yield {
                  type: 'tool_result',
                  data: {
                    id: toolUse.id,
                    name: toolUse.name,
                    result: null,
                    success: false,
                    cancelled: true,
                    message: cancelMessage
                  } as ToolResultData
                };

                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: toolUse.id,
                  content: JSON.stringify({
                    success: false,
                    error: cancelMessage,
                    cancelled: true
                  })
                });
                continue;
              }

              yield {
                type: 'tool_call',
                data: {
                  id: toolUse.id,
                  name: toolUse.name,
                  input: toolInput,
                  status: 'running',
                  requiresConfirmation: true
                } as ToolCallData
              };
            }

            console.log(
              `[ClaudeAgent] Executing tool: ${toolUse.name}, userId: ${context?.userId || 'none'}`
            );

            const result = await executeTool(toolUse.name, toolInput, toolContext);

            // 发送工具结果
            yield {
              type: 'tool_result',
              data: {
                id: toolUse.id,
                name: toolUse.name,
                result: result.data,
                success: result.success
              } as ToolResultData
            };

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result)
            });
          }

          // 添加工具结果到历史
          history.push({
            role: 'user',
            content: toolResults
          });

          // 继续循环，让 Claude 处理工具结果
          continueLoop = true;
        } else {
          // 没有工具调用，结束循环
          continueLoop = false;
        }
      }

      // 保存会话历史
      if (sessionId) {
        this.conversationHistory.set(sessionId, history);
      }

      // 完成
      yield {
        type: 'done',
        data: {}
      };
    } catch (error) {
      console.error('[ClaudeAgent] Error:', error);
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
   * 使用 Skills 系统的渐进式披露
   */
  private buildSystemPrompt(prompt: string, context?: ChatContext): string {
    // 使用 PromptBuilder 构建基于用户输入的动态提示
    let systemPrompt = this.promptBuilder.buildSystemPrompt(prompt);

    // 添加上下文信息
    if (context?.references) {
      systemPrompt += `\n\n---\n## 用户提供的参考内容\n${context.references}\n`;
    }

    if (context?.pageInfo) {
      systemPrompt += `\n\n---\n## 当前页面信息\n- URL: ${context.pageInfo.url}\n- 标题: ${context.pageInfo.title}\n`;
    }

    if (context?.retryStep?.stepId !== undefined) {
      const completedTools =
        context.retryStep.completedToolsBeforeStep?.length
          ? context.retryStep.completedToolsBeforeStep.join('、')
          : '无';
      systemPrompt += `\n\n---\n## 步骤级重试上下文\n- 目标步骤: Step ${context.retryStep.stepId}\n- 步骤类型: ${context.retryStep.stepType || 'unknown'}\n- 步骤描述: ${context.retryStep.stepLabel || '未提供'}\n- 已完成工具步骤: ${completedTools}\n\n请优先从目标步骤继续执行，避免重复已完成步骤；仅补齐必要后续步骤并输出完整结果。`;
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
export const claudeAgent = new ClaudeAgentService();
