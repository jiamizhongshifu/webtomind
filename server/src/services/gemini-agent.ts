/**
 * Gemini Agent 服务
 * 支持工具调用的完整 Agent 实现
 */

import {
  GoogleGenerativeAI,
  GenerativeModel,
  Content,
  Part,
  FunctionCallingMode
} from '@google/generative-ai';
import type {
  IAgentService,
  StreamChunk,
  ChatContext,
  ToolCallData,
  ToolResultData
} from '../types/api.js';
import { executeTool, requiresToolConfirmation } from '../tools/index.js';
import { getGeminiToolsConfig } from '../tools/gemini-adapter.js';
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
  GEMINI_RETRY_CONFIG
} from '../utils/retry.js';

// Gemini 模型配置
const MODEL = process.env.GEMINI_AGENT_MODEL || 'gemini-3.5-flash';
const MAX_OUTPUT_TOKENS = 8192;
const MAX_LOOPS = 10;

/**
 * Gemini Agent 服务
 * 完整支持工具调用的 Agent 实现
 */
export class GeminiAgentService implements IAgentService {
  private client: GoogleGenerativeAI | null = null;
  private model: GenerativeModel | null = null;
  private conversationHistory: Map<string, Content[]> = new Map();
  private skillManager: SkillManager;
  private promptBuilder: PromptBuilder;

  constructor() {
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

    console.log('[GeminiAgent] Skills system initialized');
  }

  private getClient(): GoogleGenerativeAI {
    if (!this.client) {
      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        throw new Error('GOOGLE_API_KEY 未配置');
      }
      console.log(
        '[GeminiAgent] Initializing with API Key:',
        apiKey.substring(0, 10) + '...'
      );
      this.client = new GoogleGenerativeAI(apiKey);
    }
    return this.client;
  }

  private getModel(): GenerativeModel {
    if (!this.model) {
      this.model = this.getClient().getGenerativeModel({ model: MODEL });
    }
    return this.model;
  }

  getName(): string {
    return 'Gemini Agent';
  }

  async isAvailable(): Promise<boolean> {
    return !!process.env.GOOGLE_API_KEY;
  }

  /**
   * 检测是否为需要强制工具调用的 PPT 生成请求
   */
  private isImageGenerationRequest(prompt: string, context?: ChatContext): boolean {
    // 如果有参考图片，很可能是图片生成请求
    if (context?.referenceImages && context.referenceImages.length > 0) {
      return true;
    }
    const imageKeywords = [
      '画', '生成图', '生成一', '生成一张', '生图', '配图', '插画',
      '图片', '创建图', '制作图', 'draw', 'generate image', 'create image',
      'generate_image', '雷军版', '版本的图'
    ];
    const lowerPrompt = prompt.toLowerCase();
    return imageKeywords.some((keyword) =>
      lowerPrompt.includes(keyword.toLowerCase())
    );
  }

  private isPPTGenerationRequest(prompt: string): boolean {
    const pptKeywords = [
      'PPT',
      'ppt',
      '幻灯片',
      '演示文稿',
      '演示',
      'slides',
      'slide deck',
      'presentation',
      'powerpoint',
      '生成PPT',
      '制作PPT',
      '做个PPT',
      '转成PPT',
      '[PPT 生成设置]' // 前端自动添加的标记
    ];
    const lowerPrompt = prompt.toLowerCase();
    return pptKeywords.some((keyword) =>
      lowerPrompt.includes(keyword.toLowerCase())
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
    // 使用 Skills 系统构建动态提示
    const systemPrompt = this.buildSystemPrompt(prompt, context);

    // 获取或创建会话历史
    const history: Content[] = sessionId
      ? this.conversationHistory.get(sessionId) || []
      : [];

    // 构建用户消息的 parts
    const userParts: Part[] = [{ text: prompt }];

    // 添加参考图片（如果有）
    if (context?.referenceImages && context.referenceImages.length > 0) {
      console.log(
        `[GeminiAgent] Adding ${context.referenceImages.length} reference images`
      );
      for (const img of context.referenceImages) {
        let base64Data = img.data;
        if (base64Data.includes(',')) {
          base64Data = base64Data.split(',')[1];
        }
        userParts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: base64Data
          }
        });
      }
    }

    // 添加用户消息到历史
    history.push({
      role: 'user',
      parts: userParts
    });

    // 获取 Gemini 格式的工具定义
    const toolsConfig = getGeminiToolsConfig();

    // 检测是否为 PPT 生成请求，如果是则强制工具调用
    const isPPTRequest = this.isPPTGenerationRequest(prompt);
    const functionCallingMode = isPPTRequest
      ? FunctionCallingMode.ANY
      : FunctionCallingMode.AUTO;

    console.log('[GeminiAgent] PPT request detection:', {
      isPPTRequest,
      functionCallingMode: isPPTRequest ? 'ANY' : 'AUTO',
      promptPreview: prompt.substring(0, 200)
    });

    if (isPPTRequest) {
      console.log(
        '[GeminiAgent] PPT generation detected, forcing tool call with FunctionCallingMode.ANY'
      );
    }

    try {
      yield {
        type: 'status',
        data: { status: 'analyzing', message: '正在分析请求...' }
      };

      console.log(
        '[GeminiAgent] Starting chat with prompt:',
        prompt.substring(0, 100)
      );

      // Agent 循环：处理工具调用
      let continueLoop = true;
      let loopCount = 0;

      while (continueLoop && loopCount < MAX_LOOPS) {
        loopCount++;
        console.log('[GeminiAgent] Loop', loopCount, '- Calling Gemini API...');

        // 带重试的 API 调用
        const model = this.getModel();
        let response;
        let retryAttempt = 0;
        const maxRetries = GEMINI_RETRY_CONFIG.maxRetries || 3;

        while (retryAttempt <= maxRetries) {
          try {
            // 调用 Gemini API（非流式，以便正确处理工具调用）
            response = await model.generateContent({
              contents: history,
              systemInstruction: systemPrompt,
              tools: [toolsConfig],
              toolConfig: {
                functionCallingConfig: {
                  mode: functionCallingMode,
                  // 如果是 PPT 请求，限制只能调用 slide_deck_generate
                  ...(isPPTRequest && {
                    allowedFunctionNames: ['slide_deck_generate']
                  })
                }
              },
              generationConfig: {
                maxOutputTokens: MAX_OUTPUT_TOKENS,
                temperature: 0.7,
                // SDK 类型未跟进 thinkingConfig,用 as 绕过
                ...({ thinkingConfig: { thinkingBudget: 0 } } as Record<string, unknown>)
              }
            });
            break;
          } catch (error) {
            const err =
              error instanceof Error ? error : new Error(String(error));
            retryAttempt++;

            if (
              retryAttempt > maxRetries ||
              !isRetryableError(err, {
                ...GEMINI_RETRY_CONFIG,
                retryableErrors: GEMINI_RETRY_CONFIG.retryableErrors || []
              } as Parameters<typeof isRetryableError>[1])
            ) {
              throw err;
            }

            const backoffDelay = calculateBackoff(
              retryAttempt,
              GEMINI_RETRY_CONFIG.baseDelay || 1000,
              GEMINI_RETRY_CONFIG.maxDelay || 15000
            );

            console.log(
              `[GeminiAgent] API call failed (attempt ${retryAttempt}/${maxRetries}): ${err.message}. ` +
                `Retrying in ${backoffDelay}ms...`
            );

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

        if (!response) {
          throw new Error('无法获取响应');
        }

        const candidate = response.response.candidates?.[0];
        if (!candidate) {
          throw new Error('无有效响应');
        }

        // 将助手响应添加到历史
        history.push({
          role: 'model',
          parts: candidate.content.parts
        });

        // 检查是否有工具调用
        const functionCalls = response.response.functionCalls();

        console.log('[GeminiAgent] Response analysis:', {
          hasFunctionCalls: !!functionCalls && functionCalls.length > 0,
          functionCallCount: functionCalls?.length || 0,
          functionNames: functionCalls?.map((fc) => fc.name) || [],
          hasTextParts: candidate.content.parts.some((p) => 'text' in p),
          isPPTRequest
        });

        if (functionCalls && functionCalls.length > 0) {
          const hasConfirmationStep =
            !!sessionId &&
            !!context?.userId &&
            functionCalls.some((call) => requiresToolConfirmation(call.name));

          // 有工具调用，执行工具
          yield {
            type: 'status',
            data: {
              status: 'executing',
              message: hasConfirmationStep
                ? '等待工具确认...'
                : '正在执行工具...'
            }
          };

          const functionResponses: Part[] = [];

          // 构建工具执行上下文
          const toolContext = {
            userId: context?.userId,
            projectId: context?.projectId,
            referenceImages: context?.referenceImages
          };

          for (const call of functionCalls) {
            const callArgs =
              call.args && typeof call.args === 'object'
                ? (call.args as Record<string, unknown>)
                : {};
            const needsConfirmation = requiresToolConfirmation(call.name);
            const canWaitForConfirmation =
              needsConfirmation && !!sessionId && !!context?.userId;
            const callId = `gemini-${call.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

            // 发送工具调用事件
            yield {
              type: 'tool_call',
              data: {
                id: callId,
                name: call.name,
                input: callArgs,
                status: canWaitForConfirmation ? 'pending' : 'running',
                requiresConfirmation: needsConfirmation
              } as ToolCallData
            };

            if (canWaitForConfirmation) {
              const decision = await waitForToolConfirmation({
                userId: context.userId!,
                sessionId,
                toolCallId: callId
              });

              if (!decision.approved) {
                const cancelMessage = decision.timedOut
                  ? '工具确认超时，已取消执行'
                  : '用户取消了该工具调用';

                yield {
                  type: 'tool_result',
                  data: {
                    id: callId,
                    name: call.name,
                    result: null,
                    success: false,
                    cancelled: true,
                    message: cancelMessage
                  } as ToolResultData
                };

                functionResponses.push({
                  functionResponse: {
                    name: call.name,
                    response: {
                      success: false,
                      error: cancelMessage,
                      cancelled: true
                    }
                  }
                });
                continue;
              }

              yield {
                type: 'tool_call',
                data: {
                  id: callId,
                  name: call.name,
                  input: callArgs,
                  status: 'running',
                  requiresConfirmation: true
                } as ToolCallData
              };
            }

            console.log(
              `[GeminiAgent] Executing tool: ${call.name}, userId: ${context?.userId || 'none'}`
            );

            // 执行工具
            const result = await executeTool(call.name, callArgs, toolContext);

            // 发送工具结果
            yield {
              type: 'tool_result',
              data: {
                id: callId,
                name: call.name,
                result: result.data,
                success: result.success
              } as ToolResultData
            };

            // 添加 functionResponse
            functionResponses.push({
              functionResponse: {
                name: call.name,
                response: result
              }
            });
          }

          // 添加工具结果到历史
          history.push({
            role: 'function',
            parts: functionResponses
          });

          // 继续循环，让 Gemini 处理工具结果
          continueLoop = true;
        } else {
          // 没有工具调用，输出文本响应
          const textParts = candidate.content.parts.filter(
            (part): part is Part & { text: string } => 'text' in part
          );

          for (const part of textParts) {
            if (part.text) {
              yield {
                type: 'text',
                data: { content: part.text }
              };
            }
          }

          // 结束循环
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
      console.error('[GeminiAgent] Error:', error);
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

    // 如果是图片生成请求，添加强制工具调用的指令
    if (this.isImageGenerationRequest(prompt, context)) {
      systemPrompt += `

---
## 重要：图片生成任务

用户请求生成图片。你必须：

1. **必须调用 generate_image 工具** 来生成图片
2. **不要**用文字描述图片，直接调用工具
3. **不要**解释你会怎么做，直接执行
4. 工具调用参数：
   - prompt: 英文图片描述（详细描述画面内容、风格、构图）
   - imageSize: 图片尺寸（默认 "2k"）
5. 如果用户提供了参考图片，参考图会自动传递给工具

记住：用户期望看到生成的图片，不是文字描述。`;
    }

    // 如果是 PPT 生成请求，添加强制工具调用的指令
    if (this.isPPTGenerationRequest(prompt)) {
      systemPrompt += `

---
## 重要：PPT 生成任务

用户请求生成 PPT/幻灯片演示文稿。你必须：

1. **必须调用 slide_deck_generate 工具** 来生成实际的 PPTX 文件
2. **不要**只输出文案或大纲
3. **不要**解释你会怎么做，直接调用工具执行
4. 工具调用参数：
   - title: 演示文稿标题
   - content: 用户提供的内容或要求
   - template: 模板风格（默认 "modern"）
   - slideCount: 幻灯片数量（默认 8）

记住：用户期望得到一个可下载的 PPTX 文件，而不是文字描述。`;
    }

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
export const geminiAgent = new GeminiAgentService();
