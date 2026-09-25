/**
 * 工具模块导出
 */

import { webSearch, webSearchDefinition } from './web-search.js';
import { extractUrl, extractUrlDefinition } from './url-extract.js';
import {
  saveNote,
  saveNoteDefinition,
  getAllNotes,
  getNote,
  type ToolContext
} from './save-note.js';
import {
  notebookLMTools,
  executeNotebookLMProcess,
  executeNotebookLMStatus,
  executeNotebookLMHealth
} from './notebooklm.js';
import { slideDeckDefinition, executeSlideDeckGenerate } from './slide-deck.js';
import {
  generateImageDefinition,
  executeGenerateImage,
  type GenerateImageParams
} from './generate-image.js';
import {
  wechatPublishDefinition,
  executeWechatPublish,
  type WechatPublishParams
} from './wechat-publish.js';
import { injectSkillOptions } from './skill-options-injector.js';
import {
  grokXSearchDefinition,
  grokXSearch,
  type GrokXSearchParams
} from './grok-search.js';
import {
  e2bExecuteDefinition,
  e2bExecute,
  type E2BExecuteParams
} from './e2b-execute.js';
import { withCreditCheck } from './tool-credit-middleware.js';
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
} from './summary.js';
import type { ToolResult } from '../types/api.js';

// ============================================
// 工具注册表
// ============================================

export const tools = {
  web_search: webSearch,
  extract_url: extractUrl,
  save_note: saveNote,
  notebooklm_process: null, // 特殊处理，需要 userId
  notebooklm_status: null, // 特殊处理
  notebooklm_health: null, // 特殊处理
  slide_deck_generate: null, // 特殊处理，需要 userId
  generate_image: null, // 特殊处理
  wechat_publish: null, // 特殊处理
  grok_x_search: null, // 特殊处理，Twitter/X 搜索
  e2b_execute: null // 特殊处理，E2B 脚本执行
} as const;

export type ToolName = keyof typeof tools;

const DEFAULT_CONFIRMATION_REQUIRED_TOOLS = [
  'wechat_publish',
  'e2b_execute',
  'summary_delete'
] as const;

const confirmationToolsEnv = process.env.AGENT_CONFIRMATION_TOOLS;
const parsedConfirmationTools = confirmationToolsEnv
  ? confirmationToolsEnv
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  : null;

const CONFIRM_ALL_TOOLS = !!parsedConfirmationTools?.includes('all');
const DISABLE_ALL_CONFIRMATIONS = !!parsedConfirmationTools?.includes('none');

const CONFIRMATION_REQUIRED_TOOLS = new Set<string>(
  parsedConfirmationTools && !CONFIRM_ALL_TOOLS && !DISABLE_ALL_CONFIRMATIONS
    ? parsedConfirmationTools
    : DEFAULT_CONFIRMATION_REQUIRED_TOOLS
);

export function requiresToolConfirmation(name: string): boolean {
  if (DISABLE_ALL_CONFIRMATIONS) {
    return false;
  }
  if (CONFIRM_ALL_TOOLS) {
    return true;
  }
  return CONFIRMATION_REQUIRED_TOOLS.has(name);
}
// 导出 ToolContext 类型
export type { ToolContext };

// ============================================
// 工具定义（Anthropic 格式）
// ============================================

export function getToolDefinitions() {
  return [
    webSearchDefinition,
    extractUrlDefinition,
    saveNoteDefinition,
    // NotebookLM 工具定义
    {
      name: notebookLMTools.notebooklm_process.name,
      description: notebookLMTools.notebooklm_process.description,
      input_schema: {
        type: 'object' as const,
        properties: notebookLMTools.notebooklm_process.parameters.properties,
        required: notebookLMTools.notebooklm_process.parameters.required
      }
    },
    {
      name: notebookLMTools.notebooklm_status.name,
      description: notebookLMTools.notebooklm_status.description,
      input_schema: {
        type: 'object' as const,
        properties: notebookLMTools.notebooklm_status.parameters.properties,
        required: notebookLMTools.notebooklm_status.parameters.required
      }
    },
    {
      name: notebookLMTools.notebooklm_health.name,
      description: notebookLMTools.notebooklm_health.description,
      input_schema: {
        type: 'object' as const,
        properties: notebookLMTools.notebooklm_health.parameters.properties,
        required: notebookLMTools.notebooklm_health.parameters.required
      }
    },
    // Slide Deck 工具定义
    slideDeckDefinition,
    // 图片生成工具定义
    generateImageDefinition,
    // 微信公众号发布工具定义
    wechatPublishDefinition,
    // Grok X 搜索工具定义
    grokXSearchDefinition,
    // E2B 脚本执行工具定义
    e2bExecuteDefinition,
    // Summary (卡片) 工具定义
    ...summaryToolDefinitions
  ];
}

// ============================================
// 工具执行
// ============================================

/**
 * 执行指定工具
 * @param name 工具名称
 * @param params 工具参数
 * @param context 执行上下文（包含 userId 等）
 */
export async function executeTool(
  name: string,
  params: Record<string, unknown>,
  context?: ToolContext
): Promise<ToolResult> {
  // 使用积分中间件包装工具执行
  return withCreditCheck(name, context?.userId, async () => {
    return executeToolInternal(name, params, context);
  });
}

/**
 * 内部工具执行逻辑（不含积分检查）
 */
async function executeToolInternal(
  name: string,
  params: Record<string, unknown>,
  context?: ToolContext
): Promise<ToolResult> {
  try {
    // NotebookLM 工具特殊处理
    if (name === 'notebooklm_process') {
      if (!context?.userId) {
        return {
          success: false,
          error: '需要用户认证才能使用 NotebookLM'
        };
      }
      const result = await executeNotebookLMProcess(
        context.userId,
        params as unknown as Parameters<typeof executeNotebookLMProcess>[1]
      );
      return { success: true, data: result };
    }

    if (name === 'notebooklm_status') {
      const result = await executeNotebookLMStatus(
        params as unknown as Parameters<typeof executeNotebookLMStatus>[0]
      );
      return { success: true, data: result };
    }

    if (name === 'notebooklm_health') {
      const result = await executeNotebookLMHealth();
      return { success: true, data: result };
    }

    // Slide Deck 工具特殊处理
    if (name === 'slide_deck_generate') {
      if (!context?.userId) {
        return {
          success: false,
          error: '需要用户认证才能生成 PPT'
        };
      }
      const result = await executeSlideDeckGenerate(
        context.userId,
        params as unknown as Parameters<typeof executeSlideDeckGenerate>[1]
      );
      return { success: result.success, data: result, error: result.error };
    }

    // 图片生成工具 — 注入上下文中的参考图片
    if (name === 'generate_image') {
      const imgParams = { ...params } as unknown as GenerateImageParams;
      if (context?.referenceImages && context.referenceImages.length > 0 && !imgParams.referenceImages) {
        imgParams.referenceImages = context.referenceImages;
      }
      return await executeGenerateImage(imgParams);
    }

    // 微信公众号发布工具 - 需要从 Skill 配置注入凭证
    if (name === 'wechat_publish') {
      const injectedParams = await injectSkillOptions(name, params, context?.userId);
      return await executeWechatPublish(injectedParams as unknown as WechatPublishParams);
    }

    // Grok X 搜索工具
    if (name === 'grok_x_search') {
      return await grokXSearch(params as unknown as GrokXSearchParams);
    }

    // E2B 脚本执行工具
    if (name === 'e2b_execute') {
      return await e2bExecute(params as unknown as E2BExecuteParams);
    }

    // Summary (卡片) 工具特殊处理
    if (name === 'summary_list') {
      if (!context?.userId) {
        return { success: false, error: '请先登录' };
      }
      return await executeSummaryList(
        params as unknown as SummaryListParams,
        context
      );
    }

    if (name === 'summary_search') {
      if (!context?.userId) {
        return { success: false, error: '请先登录' };
      }
      return await executeSummarySearch(
        params as unknown as SummarySearchParams,
        context
      );
    }

    if (name === 'summary_get') {
      if (!context?.userId) {
        return { success: false, error: '请先登录' };
      }
      return await executeSummaryGet(
        params as unknown as SummaryGetParams,
        context
      );
    }

    if (name === 'summary_create') {
      if (!context?.userId) {
        return { success: false, error: '请先登录' };
      }
      return await executeSummaryCreate(
        params as unknown as SummaryCreateParams,
        context
      );
    }

    if (name === 'summary_update') {
      if (!context?.userId) {
        return { success: false, error: '请先登录' };
      }
      return await executeSummaryUpdate(
        params as unknown as SummaryUpdateParams,
        context
      );
    }

    if (name === 'summary_delete') {
      if (!context?.userId) {
        return { success: false, error: '请先登录' };
      }
      return await executeSummaryDelete(
        params as unknown as SummaryDeleteParams,
        context
      );
    }

    // save_note 需要 context
    if (name === 'save_note') {
      return await saveNote(
        params as unknown as Parameters<typeof saveNote>[0],
        context
      );
    }

    // 其他工具
    const toolFn = tools[name as ToolName];
    if (!toolFn) {
      return {
        success: false,
        error: `未知工具: ${name}`
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await toolFn(params as any);
  } catch (error) {
    console.error(`[Tools] Error executing ${name}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '工具执行失败'
    };
  }
}

// ============================================
// 辅助导出
// ============================================

export { getAllNotes, getNote };
