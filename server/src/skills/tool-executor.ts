/**
 * Tool Executor 模块
 * 统一的工具执行器，处理 Agent 调用的各种工具
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { extractURL } from './url-extractor.js';
import {
  summaryToolDefinitions,
  executeSummaryList,
  executeSummarySearch,
  executeSummaryGet,
  executeSummaryCreate,
  executeSummaryUpdate,
  executeSummaryDelete,
  type SummaryListParams,
  type SummarySearchParams,
  type SummaryGetParams,
  type SummaryCreateParams,
  type SummaryUpdateParams,
  type SummaryDeleteParams
} from '../tools/summary.js';
import {
  executeWechatPublish as executeWechatPublishTool,
  type WechatPublishParams
} from '../tools/wechat-publish.js';
import { grokXSearch, type GrokXSearchParams } from '../tools/grok-search.js';
import { e2bExecute, type E2BExecuteParams } from '../tools/e2b-execute.js';
import { withCreditCheck } from '../tools/tool-credit-middleware.js';

/**
 * 工具执行结果
 */
export interface ToolResult {
  /** 是否成功 */
  success: boolean;
  /** 返回数据（成功时） */
  data?: unknown;
  /** 错误信息（失败时） */
  error?: string;
}

/**
 * 工具定义
 */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

/**
 * SSE 事件发送函数类型
 */
export type SendEventFn = (event: string, data: unknown) => void;

/**
 * 工具执行器配置
 */
export interface ToolExecutorConfig {
  /** Supabase URL */
  supabaseUrl?: string;
  /** Supabase Key */
  supabaseKey?: string;
  /** NotebookLM Worker URL */
  nlmWorkerUrl?: string;
  /** Gemini API Key */
  geminiApiKey?: string;
  /** PPT 生成 API URL */
  pptApiUrl?: string;
  /** Script Executor URL (Python Worker) */
  scriptExecutorUrl?: string;
}

/**
 * 工具执行器类
 */
export class ToolExecutor {
  private userId: string;
  private projectId?: string; // 当前项目 ID（用于卡片工具的项目隔离）
  private sendEvent?: SendEventFn;
  private config: ToolExecutorConfig;
  private supabase: SupabaseClient | null = null;

  constructor(
    userId: string,
    sendEvent?: SendEventFn,
    config: ToolExecutorConfig = {},
    projectId?: string
  ) {
    this.userId = userId;
    this.projectId = projectId;
    this.sendEvent = sendEvent;
    this.config = {
      supabaseUrl: config.supabaseUrl || process.env.SUPABASE_URL,
      supabaseKey:
        config.supabaseKey ||
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_ANON_KEY,
      nlmWorkerUrl: config.nlmWorkerUrl || process.env.NLM_WORKER_URL,
      geminiApiKey: config.geminiApiKey || process.env.GEMINI_API_KEY,
      pptApiUrl: config.pptApiUrl || process.env.PPT_API_URL,
      scriptExecutorUrl:
        config.scriptExecutorUrl ||
        process.env.SCRIPT_EXECUTOR_URL ||
        process.env.NLM_WORKER_URL
    };
  }

  /**
   * 获取 Supabase 客户端
   */
  private getSupabase(): SupabaseClient | null {
    if (!this.supabase && this.config.supabaseUrl && this.config.supabaseKey) {
      this.supabase = createClient(
        this.config.supabaseUrl,
        this.config.supabaseKey
      );
    }
    return this.supabase;
  }

  /**
   * 获取所有工具定义
   */
  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'extract_url',
        description: '提取指定 URL 的网页内容',
        input_schema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: '要提取的网页 URL' },
            maxLength: {
              type: 'number',
              description: '最大内容长度（可选，默认 10000）'
            }
          },
          required: ['url']
        }
      },
      {
        name: 'web_search',
        description: '网络搜索',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '搜索关键词' },
            maxResults: {
              type: 'number',
              description: '结果数量（可选，默认 5）'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'save_note',
        description: '保存笔记到数据库',
        input_schema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '笔记标题' },
            content: {
              type: 'string',
              description: '笔记内容（支持 Markdown）'
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: '标签列表（可选）'
            },
            sourceUrl: { type: 'string', description: '来源链接（可选）' }
          },
          required: ['title', 'content']
        }
      },
      {
        name: 'notebooklm_process',
        description: '使用 NotebookLM 生成学习内容',
        input_schema: {
          type: 'object',
          properties: {
            sourceUrl: { type: 'string', description: '来源 URL' },
            sourceText: {
              type: 'string',
              description: '来源文本（与 URL 二选一）'
            },
            outputType: {
              type: 'string',
              enum: [
                'flashcards',
                'mindmap',
                'quiz',
                'report',
                'summary',
                'audio',
                'video',
                'infographic',
                'slide_deck',
                'data_table'
              ],
              description: '输出类型'
            }
          },
          required: ['outputType']
        }
      },
      {
        name: 'notebooklm_status',
        description: '查询 NotebookLM 任务状态',
        input_schema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: '任务 ID' }
          },
          required: ['taskId']
        }
      },
      {
        name: 'notebooklm_health',
        description: '检查 NotebookLM 服务状态',
        input_schema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'slide_deck_generate',
        description: '生成 PPT 演示文稿',
        input_schema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: '要转换为 PPT 的内容' },
            style: {
              type: 'string',
              enum: [
                'blueprint',
                'notion',
                'corporate',
                'minimal',
                'sketch-notes',
                'chalkboard',
                'bold-editorial',
                'dark-atmospheric',
                'watercolor',
                'pixel-art',
                'scientific',
                'vintage'
              ],
              description: '视觉风格（可选，默认 blueprint）'
            },
            slideCount: {
              type: 'number',
              description: '幻灯片数量（可选，默认 10，范围 5-20）'
            },
            language: {
              type: 'string',
              enum: ['auto', 'zh', 'en'],
              description: '输出语言（可选，默认 auto）'
            },
            title: { type: 'string', description: 'PPT 标题（可选）' }
          },
          required: ['content']
        }
      },
      {
        name: 'create_skill',
        description: '创建一个新的 Skill（快捷指令）',
        input_schema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Skill 的唯一标识符' },
            displayName: { type: 'string', description: 'Skill 的显示名称' },
            description: { type: 'string', description: 'Skill 的简短描述' },
            icon: { type: 'string', description: 'Skill 的图标 emoji' },
            triggers: {
              type: 'array',
              items: { type: 'string' },
              description: '触发词数组'
            },
            coreInstructions: {
              type: 'string',
              description: 'Skill 的核心指令'
            },
            outputType: { type: 'string', description: '输出类型（可选）' },
            category: {
              type: 'string',
              enum: ['custom', 'content', 'analysis', 'search', 'export'],
              description: 'Skill 分类'
            }
          },
          required: ['name', 'displayName', 'triggers', 'coreInstructions']
        }
      },
      // Layer 3: 脚本执行工具
      {
        name: 'execute_script',
        description: '执行 Skill 关联的 Python 脚本（在 E2B 安全沙箱中运行）',
        input_schema: {
          type: 'object',
          properties: {
            skill_id: { type: 'string', description: 'Skill ID' },
            script_name: {
              type: 'string',
              description: '脚本名称 (e.g., "process_data.py")'
            },
            parameters: { type: 'object', description: '传递给脚本的参数' }
          },
          required: ['skill_id', 'script_name']
        }
      },
      // Layer 3: 参考文档读取工具
      {
        name: 'read_skill_reference',
        description: '读取 Skill 的参考文档内容',
        input_schema: {
          type: 'object',
          properties: {
            skill_id: { type: 'string', description: 'Skill ID' },
            reference_name: {
              type: 'string',
              description: '参考文档名称 (e.g., "api_docs.md")'
            }
          },
          required: ['skill_id', 'reference_name']
        }
      },
      // Summary 卡片工具（需要 projectId）
      ...summaryToolDefinitions,
      // 图片生成工具
      {
        name: 'generate_image',
        description: '使用 AI 生成图片（支持 Gemini 和阿里云 Z-Image）',
        input_schema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: '图片生成提示词（英文效果更好）'
            },
            referenceImages: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  data: {
                    type: 'string',
                    description: 'Base64 编码的图片数据'
                  },
                  mimeType: {
                    type: 'string',
                    description: '图片 MIME 类型，如 image/png'
                  }
                }
              },
              description: '参考图片列表（可选，用于风格参考）'
            }
          },
          required: ['prompt']
        }
      },
      // 微信公众号发布工具
      {
        name: 'wechat_publish',
        description: '将 Markdown 文章发布到微信公众号草稿箱',
        input_schema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'Markdown 格式的文章内容' },
            coverUrl: { type: 'string', description: '封面图 URL（必填）' },
            appId: {
              type: 'string',
              description: '微信公众号 AppID（从 Skill 设置获取）'
            },
            appSecret: {
              type: 'string',
              description: '微信公众号 AppSecret（从 Skill 设置获取）'
            },
            title: {
              type: 'string',
              description: '文章标题（可选，默认从内容提取）'
            },
            theme: {
              type: 'string',
              enum: ['autumn-warm', 'spring-fresh', 'ocean-calm'],
              description: '主题名称（可选，默认 autumn-warm）'
            },
            author: { type: 'string', description: '作者名（可选）' },
            digest: {
              type: 'string',
              description: '文章摘要（可选，默认自动提取）'
            }
          },
          required: ['content', 'coverUrl', 'appId', 'appSecret']
        }
      },
      // ============================================
      // 基础设施工具（按量计费）
      // ============================================
      // Grok X 搜索工具
      {
        name: 'grok_x_search',
        description:
          '使用 Grok AI 搜索 Twitter/X 上的热门帖子和讨论（15 积分/次）',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '搜索关键词' },
            maxResults: {
              type: 'number',
              description: '最大结果数量（可选，默认 10，最大 50）'
            }
          },
          required: ['query']
        }
      },
      // E2B 脚本执行工具
      {
        name: 'e2b_execute',
        description:
          '在云端安全沙箱中执行 Python 脚本（按执行时长计费：3-50 积分）',
        input_schema: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'Python 代码' },
            language: {
              type: 'string',
              enum: ['python'],
              description: '编程语言（目前仅支持 python）'
            },
            timeout: {
              type: 'number',
              description: '执行超时时间（秒，可选，默认 30，最大 300）'
            }
          },
          required: ['code']
        }
      }
    ];
  }

  /**
   * 执行工具
   */
  async execute(
    name: string,
    params: Record<string, unknown>
  ): Promise<ToolResult> {
    try {
      switch (name) {
        case 'extract_url':
          return this.executeExtractUrl(params);
        case 'web_search':
          return this.executeWebSearch(params);
        case 'save_note':
          return this.executeSaveNote(params);
        case 'notebooklm_process':
          return this.executeNotebookLMProcess(params);
        case 'notebooklm_status':
          return this.executeNotebookLMStatus(params);
        case 'notebooklm_health':
          return this.executeNotebookLMHealth();
        case 'slide_deck_generate':
          return this.executeSlideDeckGenerate(params);
        case 'create_skill':
          return this.executeCreateSkill(params);
        // Layer 3 工具
        case 'execute_script':
          return this.executeScript(params);
        case 'read_skill_reference':
          return this.executeReadSkillReference(params);
        // Summary 卡片工具
        case 'summary_list':
          return executeSummaryList(params as unknown as SummaryListParams, {
            userId: this.userId,
            projectId: this.projectId
          });
        case 'summary_search':
          return executeSummarySearch(
            params as unknown as SummarySearchParams,
            { userId: this.userId, projectId: this.projectId }
          );
        case 'summary_get':
          return executeSummaryGet(params as unknown as SummaryGetParams, {
            userId: this.userId,
            projectId: this.projectId
          });
        case 'summary_create':
          return executeSummaryCreate(
            params as unknown as SummaryCreateParams,
            { userId: this.userId, projectId: this.projectId },
            this.sendEvent
          );
        case 'summary_update':
          return executeSummaryUpdate(
            params as unknown as SummaryUpdateParams,
            { userId: this.userId, projectId: this.projectId },
            this.sendEvent
          );
        case 'summary_delete':
          return executeSummaryDelete(
            params as unknown as SummaryDeleteParams,
            { userId: this.userId, projectId: this.projectId },
            this.sendEvent
          );
        // 图片生成工具（走积分中间件，按尺寸动态扣费）
        case 'generate_image':
          return withCreditCheck('generate_image', this.userId, async () => {
            return this.executeGenerateImage(params);
          });
        // 微信公众号发布工具
        case 'wechat_publish':
          return this.executeWechatPublish(params);
        // ============================================
        // 基础设施工具（按量计费，需要积分检查）
        // ============================================
        case 'grok_x_search':
          return withCreditCheck('grok_x_search', this.userId, async () => {
            return grokXSearch(params as unknown as GrokXSearchParams);
          });
        case 'e2b_execute':
          return withCreditCheck('e2b_execute', this.userId, async () => {
            return e2bExecute(params as unknown as E2BExecuteParams);
          });
        default:
          return { success: false, error: `Unknown tool: ${name}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Tool execution failed'
      };
    }
  }

  // ============================================
  // 工具实现
  // ============================================

  /**
   * 提取 URL 内容
   */
  private async executeExtractUrl(
    params: Record<string, unknown>
  ): Promise<ToolResult> {
    const url = params.url as string;
    if (!url) {
      return { success: false, error: 'Missing required parameter: url' };
    }

    const maxLength = (params.maxLength as number) || 10000;
    const result = await extractURL(url, { maxLength });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return {
      success: true,
      data: {
        content: result.content,
        title: result.title,
        length: result.length
      }
    };
  }

  /**
   * 网络搜索
   */
  private async executeWebSearch(
    params: Record<string, unknown>
  ): Promise<ToolResult> {
    const query = params.query as string;
    if (!query) {
      return { success: false, error: 'Missing required parameter: query' };
    }

    if (!this.config.geminiApiKey) {
      return { success: false, error: 'Gemini API not configured' };
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${process.env.WEB_SEARCH_MODEL || 'gemini-3.5-flash'}:generateContent?key=${this.config.geminiApiKey}`;

    const timeoutMs = Number(process.env.WEB_SEARCH_TIMEOUT_MS) || 15000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: `搜索并总结：${query}` }] }
          ],
          tools: [{ googleSearch: {} }],
          generationConfig: { maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } }
        })
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      return { success: false, error: 'Search failed' };
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        groundingMetadata?: {
          groundingChunks?: Array<{ web?: { title?: string; uri?: string } }>;
        };
      }>;
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const sources =
      data.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((c) => ({
        title: c.web?.title,
        url: c.web?.uri
      })) || [];

    return { success: true, data: { summary: text, sources } };
  }

  /**
   * 保存笔记
   */
  private async executeSaveNote(
    params: Record<string, unknown>
  ): Promise<ToolResult> {
    const title = params.title as string;
    const content = params.content as string;

    if (!title || !content) {
      return {
        success: false,
        error: 'Missing required parameters: title and content'
      };
    }

    const supabase = this.getSupabase();
    if (!supabase) {
      return { success: false, error: 'Database not configured' };
    }

    const tags = (params.tags as string[]) || [];
    const sourceUrl = params.sourceUrl as string | undefined;

    const { data, error } = await supabase
      .from('notes')
      .insert({
        user_id: this.userId,
        title,
        content,
        tags,
        source_url: sourceUrl
      })
      .select('id')
      .single();

    if (error) {
      return { success: false, error: `Database error: ${error.message}` };
    }

    return {
      success: true,
      data: {
        id: data.id,
        message: '笔记已保存'
      }
    };
  }

  /**
   * NotebookLM 处理
   */
  private async executeNotebookLMProcess(
    params: Record<string, unknown>
  ): Promise<ToolResult> {
    if (!this.config.nlmWorkerUrl) {
      return { success: false, error: 'NotebookLM Worker not configured' };
    }

    const sourceUrl = params.sourceUrl as string | undefined;
    const sourceText = params.sourceText as string | undefined;
    const outputType = params.outputType as string;

    if (!outputType) {
      return {
        success: false,
        error: 'Missing required parameter: outputType'
      };
    }

    const response = await fetch(`${this.config.nlmWorkerUrl}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: this.userId,
        source: sourceUrl
          ? { type: 'url', content: sourceUrl }
          : { type: 'text', content: sourceText || '' },
        output_type: outputType,
        options: {}
      })
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        success: false,
        error: `NotebookLM processing failed: ${error}`
      };
    }

    const result = await response.json();
    return { success: true, data: result };
  }

  /**
   * NotebookLM 状态查询
   */
  private async executeNotebookLMStatus(
    params: Record<string, unknown>
  ): Promise<ToolResult> {
    if (!this.config.nlmWorkerUrl) {
      return { success: false, error: 'NotebookLM Worker not configured' };
    }

    const taskId = params.taskId as string;
    if (!taskId) {
      return { success: false, error: 'Missing required parameter: taskId' };
    }

    const response = await fetch(
      `${this.config.nlmWorkerUrl}/status/${taskId}`
    );
    if (!response.ok) {
      return { success: false, error: 'Failed to get task status' };
    }

    const result = await response.json();
    return { success: true, data: result };
  }

  /**
   * NotebookLM 健康检查
   */
  private async executeNotebookLMHealth(): Promise<ToolResult> {
    if (!this.config.nlmWorkerUrl) {
      return { success: false, error: 'NotebookLM Worker not configured' };
    }

    const response = await fetch(`${this.config.nlmWorkerUrl}/health`);
    if (!response.ok) {
      return { success: false, error: 'Service unavailable' };
    }

    const health = await response.json();
    return { success: true, data: health };
  }

  /**
   * 生成 PPT
   */
  private async executeSlideDeckGenerate(
    params: Record<string, unknown>
  ): Promise<ToolResult> {
    const content = params.content as string;
    if (!content) {
      return { success: false, error: 'Missing required parameter: content' };
    }

    // 使用 PPT API 或 Gemini + pptxgenjs
    const pptApiUrl =
      this.config.pptApiUrl ||
      `${this.config.nlmWorkerUrl?.replace('/nlm', '')}/api/ppt/generate`;

    if (!pptApiUrl) {
      return { success: false, error: 'PPT generation service not configured' };
    }

    const style = (params.style as string) || 'blueprint';
    const slideCount = Math.min(
      Math.max((params.slideCount as number) || 10, 5),
      20
    );
    const language = (params.language as string) || 'auto';
    const title = params.title as string | undefined;

    try {
      const response = await fetch(pptApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          style,
          slideCount,
          language,
          title,
          userId: this.userId
        })
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `PPT generation failed: ${error}` };
      }

      const result = (await response.json()) as {
        downloadUrl?: string;
        slideCount?: number;
        outline?: unknown;
      };

      return {
        success: true,
        data: {
          downloadUrl: result.downloadUrl,
          slideCount: result.slideCount,
          outline: result.outline,
          message: 'PPT 已生成，下载链接 24 小时内有效'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'PPT generation failed'
      };
    }
  }

  /**
   * 创建 Skill
   */
  private async executeCreateSkill(
    params: Record<string, unknown>
  ): Promise<ToolResult> {
    const requiredFields = [
      'name',
      'displayName',
      'triggers',
      'coreInstructions'
    ];
    const missingFields = requiredFields.filter((f) => !params[f]);
    if (missingFields.length > 0) {
      return {
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`
      };
    }

    const triggers = params.triggers as string[];
    if (!Array.isArray(triggers) || triggers.length === 0) {
      return { success: false, error: 'Triggers cannot be empty' };
    }

    // 格式化 name
    const name = (params.name as string)
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    const skillPreview = {
      name,
      displayName: params.displayName as string,
      description: (params.description as string) || undefined,
      icon: (params.icon as string) || '🔧',
      triggers,
      coreInstructions: params.coreInstructions as string,
      outputType: (params.outputType as string) || undefined,
      category: (params.category as string) || 'custom'
    };

    // 发送预览事件到前端
    if (this.sendEvent) {
      this.sendEvent('skill_create_preview', { skillPreview });
    }

    return {
      success: true,
      data: {
        message:
          'Skill preview sent to frontend, waiting for user confirmation',
        skillPreview
      }
    };
  }

  // ============================================
  // Layer 3 工具实现
  // ============================================

  /**
   * 执行 Skill 关联的脚本
   */
  private async executeScript(
    params: Record<string, unknown>
  ): Promise<ToolResult> {
    const skillId = params.skill_id as string;
    const scriptName = params.script_name as string;
    const scriptParams = params.parameters as
      | Record<string, unknown>
      | undefined;

    if (!skillId || !scriptName) {
      return { success: false, error: '缺少必需参数: skill_id 和 script_name' };
    }

    const supabase = this.getSupabase();
    if (!supabase) {
      return { success: false, error: '数据库未配置' };
    }

    // 1. 从数据库获取脚本
    const { data: script, error: fetchError } = await supabase
      .from('skill_scripts')
      .select('id, content, parameters')
      .eq('skill_id', skillId)
      .eq('name', scriptName)
      .single();

    if (fetchError || !script) {
      return { success: false, error: `脚本不存在: ${scriptName}` };
    }

    const blockedModules = [
      'os',
      'sys',
      'subprocess',
      'shutil',
      'socket',
      'http',
      'urllib',
      'requests',
      'asyncio',
      'threading',
      'multiprocessing',
      'pickle',
      'shelve',
      'marshal',
      'importlib',
      'builtins',
      '__builtins__',
      'ctypes',
      'cffi'
    ];
    const blockedBuiltins = [
      'exec',
      'eval',
      'compile',
      '__import__',
      'open',
      'input',
      'breakpoint',
      'globals',
      'locals',
      'vars',
      'getattr',
      'setattr',
      'delattr',
      'memoryview',
      'bytearray'
    ];
    const importPattern = new RegExp(
      `\\b(import|from)\\s+(${blockedModules.join('|')})(\\.|\\b)`
    );
    const builtinPattern = new RegExp(
      `\\b(${blockedBuiltins.join('|')})\\s*\\(`
    );

    if (
      importPattern.test(script.content) ||
      builtinPattern.test(script.content)
    ) {
      return {
        success: false,
        error: '脚本安全检查失败：包含被禁止的模块或内置函数'
      };
    }

    const paramsPayload = JSON.stringify(scriptParams || {});
    const paramsPrelude = `import json\nparams = json.loads(${JSON.stringify(paramsPayload)})\n`;
    const wrappedCode = `${paramsPrelude}${script.content}\n`;

    try {
      const e2bResult = await e2bExecute({
        runtime: 'python',
        code: wrappedCode,
        timeout: 30
      });

      const execution = (e2bResult.data || {}) as {
        stdout?: string;
        stderr?: string;
        exitCode?: number;
        executionTime?: number;
      };
      const stdout = execution.stdout || '';
      const stderr = execution.stderr || '';
      const exitCode = execution.exitCode ?? (e2bResult.success ? 0 : 1);
      const durationMs = execution.executionTime || 0;

      await supabase.from('script_executions').insert({
        user_id: this.userId,
        script_id: script.id,
        input: scriptParams || {},
        output: { stdout, stderr, exitCode },
        status: e2bResult.success ? 'success' : 'error',
        error_message: e2bResult.error || (exitCode !== 0 ? stderr : null),
        duration_ms: durationMs
      });

      if (!e2bResult.success) {
        return {
          success: false,
          error: e2bResult.error || stderr || '脚本执行失败'
        };
      }

      return {
        success: true,
        data: {
          output: stdout,
          result: undefined,
          duration_ms: durationMs,
          stderr,
          exitCode
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '脚本执行请求失败'
      };
    }
  }

  /**
   * 读取 Skill 的参考文档
   */
  private async executeReadSkillReference(
    params: Record<string, unknown>
  ): Promise<ToolResult> {
    const skillId = params.skill_id as string;
    const referenceName = params.reference_name as string;

    if (!skillId || !referenceName) {
      return {
        success: false,
        error: '缺少必需参数: skill_id 和 reference_name'
      };
    }

    const supabase = this.getSupabase();
    if (!supabase) {
      return { success: false, error: '数据库未配置' };
    }

    // 从数据库获取参考文档
    const { data: reference, error } = await supabase
      .from('skill_references')
      .select('name, content, description, word_count')
      .eq('skill_id', skillId)
      .eq('name', referenceName)
      .single();

    if (error || !reference) {
      return { success: false, error: `参考文档不存在: ${referenceName}` };
    }

    return {
      success: true,
      data: {
        name: reference.name,
        content: reference.content,
        description: reference.description,
        wordCount: reference.word_count
      }
    };
  }

  // ============================================
  // 图片生成工具实现
  // ============================================

  /**
   * 使用 Gemini 生成图片
   */
  private async generateImageWithGemini(
    prompt: string,
    referenceImages?: Array<{ data: string; mimeType: string }>
  ): Promise<string | null> {
    if (!this.config.geminiApiKey) {
      return null;
    }

    // 使用 gemini-3.1-flash-image-preview 模型
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${this.config.geminiApiKey}`;

    const parts: unknown[] = [];
    if (referenceImages && referenceImages.length > 0) {
      for (const img of referenceImages) {
        let base64Data = img.data;
        if (base64Data.includes(',')) {
          base64Data = base64Data.split(',')[1];
        }
        parts.push({
          inlineData: { mimeType: img.mimeType, data: base64Data }
        });
      }
    }
    parts.push({ text: prompt });

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
            imageConfig: {
              imageSize: '2048x2048'
            }
          }
        })
      });

      if (!response.ok) {
        console.error(
          '[ToolExecutor] Gemini image generation failed:',
          response.status
        );
        return null;
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{
              inlineData?: { mimeType: string; data: string };
            }>;
          };
        }>;
      };

      const part = data.candidates?.[0]?.content?.parts?.find(
        (p) => p.inlineData
      );
      return part?.inlineData
        ? `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
        : null;
    } catch (error) {
      console.error('[ToolExecutor] Gemini image generation error:', error);
      return null;
    }
  }

  /**
   * 执行图片生成
   */
  private async executeGenerateImage(
    params: Record<string, unknown>
  ): Promise<ToolResult> {
    const prompt = params.prompt as string;
    if (!prompt) {
      return { success: false, error: '缺少必需参数: prompt' };
    }

    const referenceImages = params.referenceImages as
      | Array<{ data: string; mimeType: string }>
      | undefined;

    // 使用 Gemini 生成图片
    const imageUrl = await this.generateImageWithGemini(
      prompt,
      referenceImages
    );

    if (imageUrl) {
      return {
        success: true,
        data: {
          imageUrl,
          message: '图片生成成功',
          // 供 tool-credit-middleware 按尺寸计费
          _billing: { imageSize: '2k' }
        }
      };
    }

    return { success: false, error: '图片生成失败，请稍后重试' };
  }

  // ============================================
  // 微信公众号发布工具实现
  // ============================================

  /**
   * 执行微信公众号发布
   */
  private async executeWechatPublish(
    params: Record<string, unknown>
  ): Promise<ToolResult> {
    const content = params.content as string;
    const coverUrl = params.coverUrl as string;
    const appId = params.appId as string;
    const appSecret = params.appSecret as string;

    if (!content) {
      return { success: false, error: '缺少必需参数: content' };
    }
    if (!coverUrl) {
      return { success: false, error: '缺少必需参数: coverUrl' };
    }
    if (!appId || !appSecret) {
      return {
        success: false,
        error: '缺少微信公众号凭证。请在 Skill 设置中配置 AppID 和 AppSecret'
      };
    }

    // 直接调用 wechat-publish 模块
    return await executeWechatPublishTool({
      content,
      coverUrl,
      appId,
      appSecret,
      title: params.title as string | undefined,
      theme: params.theme as WechatPublishParams['theme'],
      author: params.author as string | undefined,
      digest: params.digest as string | undefined
    });
  }
}

/**
 * 创建工具执行器实例
 */
export function createToolExecutor(
  userId: string,
  sendEvent?: SendEventFn,
  config?: ToolExecutorConfig,
  projectId?: string
): ToolExecutor {
  return new ToolExecutor(userId, sendEvent, config, projectId);
}
