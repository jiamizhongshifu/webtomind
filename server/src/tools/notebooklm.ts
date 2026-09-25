/**
 * NotebookLM Tools for Agent
 * Tool definitions for NotebookLM content processing
 * 
 * Requirements covered:
 * - 10.3: notebooklm_process tool
 * - 10.4: notebooklm_status tool
 * - 10.5: notebooklm_health tool (new)
 */

import { getNotebookLMService } from '../services/notebooklm';
import { getWorkerClient } from '../services/notebooklm/worker-client';
import { SourceType, OutputType, ProcessOptions } from '../services/notebooklm/types';

// Tool parameter types
interface NotebookLMProcessParams {
  source: {
    type: SourceType;
    content: string;
    fileName?: string;
  };
  outputType: OutputType;
  options?: {
    language?: 'zh-CN' | 'en-US';
    maxItems?: number;
    timeout?: number;
  };
}

interface NotebookLMStatusParams {
  taskId: string;
}

// Tool definitions for Agent
export const notebookLMTools = {
  /**
   * Process content through NotebookLM
   */
  notebooklm_process: {
    name: 'notebooklm_process',
    description: '使用 NotebookLM 处理资料并生成学习内容（闪卡、脑图、测验、报告、摘要、音频概览、视频概览、信息图、演示文稿、数据表格）',
    parameters: {
      type: 'object',
      properties: {
        source: {
          type: 'object',
          description: '内容来源',
          properties: {
            type: {
              type: 'string',
              enum: ['url', 'youtube', 'pdf', 'text'],
              description: '来源类型：url(网页)、youtube(视频)、pdf(文档)、text(文本)',
            },
            content: {
              type: 'string',
              description: 'URL 地址或文本内容',
            },
            fileName: {
              type: 'string',
              description: 'PDF 文件名（仅 pdf 类型需要）',
            },
          },
          required: ['type', 'content'],
        },
        outputType: {
          type: 'string',
          enum: ['flashcards', 'mindmap', 'report', 'quiz', 'summary', 'audio', 'video', 'infographic', 'slide_deck', 'data_table'],
          description: '输出类型：flashcards(闪卡)、mindmap(脑图)、report(报告)、quiz(测验)、summary(摘要)、audio(音频概览)、video(视频概览)、infographic(信息图)、slide_deck(演示文稿)、data_table(数据表格)',
        },
        options: {
          type: 'object',
          description: '可选配置',
          properties: {
            language: {
              type: 'string',
              enum: ['zh-CN', 'en-US'],
              description: '输出语言',
            },
            maxItems: {
              type: 'number',
              description: '最大数量（用于闪卡/测验）',
            },
            instructions: {
              type: 'string',
              description: '自定义指令（用于音频/视频/信息图/演示文稿）',
            },
          },
        },
      },
      required: ['source', 'outputType'],
    },
  },

  /**
   * Query task status
   */
  notebooklm_status: {
    name: 'notebooklm_status',
    description: '查询 NotebookLM 处理任务的状态和结果',
    parameters: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: '任务 ID（从 notebooklm_process 返回）',
        },
      },
      required: ['taskId'],
    },
  },

  /**
   * Check service health and account status
   */
  notebooklm_health: {
    name: 'notebooklm_health',
    description: '检查 NotebookLM 服务健康状态和账号可用性',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
};

/**
 * Execute notebooklm_process tool
 */
export async function executeNotebookLMProcess(
  userId: string,
  params: NotebookLMProcessParams
): Promise<{ taskId: string; status: string; estimatedTime: number; message: string }> {
  const service = getNotebookLMService();

  try {
    const { taskId, estimatedTime } = await service.submitTask(
      userId,
      {
        type: params.source.type,
        content: params.source.content,
        fileName: params.source.fileName,
      },
      params.outputType,
      params.options as ProcessOptions
    );

    const outputTypeNames: Record<OutputType, string> = {
      flashcards: '闪卡',
      mindmap: '脑图',
      report: '报告',
      quiz: '测验',
      summary: '摘要',
      audio: '音频概览',
      video: '视频概览',
      infographic: '信息图',
      slide_deck: '演示文稿',
      data_table: '数据表格',
    };

    return {
      taskId,
      status: 'queued',
      estimatedTime,
      message: `正在生成${outputTypeNames[params.outputType]}，预计需要 ${estimatedTime} 秒。任务 ID: ${taskId}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    throw new Error(`处理请求失败: ${errorMessage}`);
  }
}

/**
 * Execute notebooklm_status tool
 */
export async function executeNotebookLMStatus(
  params: NotebookLMStatusParams
): Promise<{
  status: string;
  progress?: number;
  result?: unknown;
  error?: string;
  message: string;
}> {
  const service = getNotebookLMService();

  try {
    const status = await service.getTaskStatus(params.taskId);

    if (!status) {
      return {
        status: 'not_found',
        message: `未找到任务 ${params.taskId}`,
      };
    }

    const statusMessages: Record<string, string> = {
      queued: `任务排队中，当前位置: ${status.position ?? '未知'}`,
      processing: `正在处理中，进度: ${status.progress ?? 0}%`,
      completed: '处理完成！',
      failed: `处理失败: ${status.error ?? '未知错误'}`,
      cancelled: '任务已取消',
    };

    return {
      status: status.status,
      progress: status.progress,
      result: status.result,
      error: status.error,
      message: statusMessages[status.status] ?? '未知状态',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    throw new Error(`查询状态失败: ${errorMessage}`);
  }
}

/**
 * Execute notebooklm_health tool
 */
export async function executeNotebookLMHealth(): Promise<{
  status: string;
  accountsAvailable: number;
  accountsTotal: number;
  message: string;
  details?: {
    accounts: Array<{
      id: string;
      source: string;
      valid: boolean;
      uses: number;
    }>;
    stats?: {
      totalRequests: number;
      successfulRequests: number;
      failedRequests: number;
      avgProcessingTime: number;
    };
  };
}> {
  const workerClient = getWorkerClient();

  try {
    const health = await workerClient.healthCheck();

    const accountsAvailable = health.accounts_available ?? 0;
    const accountsTotal = health.processor?.provider?.total ?? accountsAvailable;

    let message = '';
    if (health.status === 'ok' && accountsAvailable > 0) {
      message = `服务正常，${accountsAvailable}/${accountsTotal} 个账号可用`;
    } else if (accountsAvailable === 0) {
      message = '⚠️ 没有可用账号，服务可能无法正常工作';
    } else {
      message = `服务状态: ${health.status}`;
    }

    return {
      status: health.status,
      accountsAvailable,
      accountsTotal,
      message,
      details: {
        accounts: health.processor?.provider?.accounts?.map((a) => ({
          id: a.id,
          source: a.source,
          valid: a.valid,
          uses: a.uses,
        })) ?? [],
        stats: health.processor?.stats ? {
          totalRequests: health.processor.stats.total_requests,
          successfulRequests: health.processor.stats.successful_requests,
          failedRequests: health.processor.stats.failed_requests,
          avgProcessingTime: health.processor.stats.avg_processing_time,
        } : undefined,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    return {
      status: 'error',
      accountsAvailable: 0,
      accountsTotal: 0,
      message: `健康检查失败: ${errorMessage}`,
    };
  }
}

/**
 * Tool executor map
 */
export const notebookLMToolExecutors = {
  notebooklm_process: executeNotebookLMProcess,
  notebooklm_status: executeNotebookLMStatus,
  notebooklm_health: executeNotebookLMHealth,
};
