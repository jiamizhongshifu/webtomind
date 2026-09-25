/**
 * NotebookLM API Routes
 * RESTful API endpoints for NotebookLM content processing
 * 
 * Requirements covered:
 * - 9.1: RESTful API design
 * - 9.2: Task ID return
 * - 9.3: Status query endpoint
 * - 9.4: SSE status push
 * - 9.5: Authentication
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { v4 as uuidv4 } from 'uuid';
import { getNotebookLMService } from '../services/notebooklm';
import { SourceType, OutputType, ProcessOptions } from '../services/notebooklm/types';

// Types
interface ProcessRequestBody {
  source: {
    type: SourceType;
    content: string;
    fileName?: string;
  };
  outputType: OutputType;
  options?: ProcessOptions;
}

interface AuthContext {
  userId: string;
  email?: string;
}

// Create router
const notebooklmRouter = new Hono<{ Variables: { auth: AuthContext } }>();

/**
 * POST /api/notebooklm/process
 * Submit content for processing
 */
notebooklmRouter.post('/process', async (c) => {
  const traceId = uuidv4();
  
  try {
    // Get authenticated user
    const auth = c.get('auth');
    if (!auth?.userId) {
      return c.json({
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: '请先登录',
          traceId,
        },
      }, 401);
    }

    // Parse request body
    const body = await c.req.json<ProcessRequestBody>();

    // Validate request
    if (!body.source?.type || !body.source?.content) {
      return c.json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: '请提供有效的内容来源',
          traceId,
        },
      }, 400);
    }

    if (!body.outputType) {
      return c.json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: '请指定输出类型',
          traceId,
        },
      }, 400);
    }

    // Validate source type
    const validSourceTypes: SourceType[] = ['url', 'youtube', 'pdf', 'text'];
    if (!validSourceTypes.includes(body.source.type)) {
      return c.json({
        success: false,
        error: {
          code: 'INVALID_SOURCE',
          message: '不支持的来源类型',
          traceId,
        },
      }, 400);
    }

    // Validate output type
    const validOutputTypes: OutputType[] = ['flashcards', 'mindmap', 'report', 'quiz', 'summary'];
    if (!validOutputTypes.includes(body.outputType)) {
      return c.json({
        success: false,
        error: {
          code: 'INVALID_OUTPUT_TYPE',
          message: '不支持的输出类型',
          traceId,
        },
      }, 400);
    }

    // Submit task
    const service = getNotebookLMService();
    const { taskId, estimatedTime } = await service.submitTask(
      auth.userId,
      body.source,
      body.outputType,
      body.options
    );

    return c.json({
      success: true,
      data: {
        taskId,
        status: 'queued',
        estimatedTime,
        traceId,
      },
    });

  } catch (error) {
    console.error('[NotebookLM] Process error:', error);
    
    return c.json({
      success: false,
      error: {
        code: 'PROCESSING_FAILED',
        message: error instanceof Error ? error.message : '处理请求失败',
        traceId,
      },
    }, 500);
  }
});

/**
 * GET /api/notebooklm/status/:taskId
 * Query task status
 */
notebooklmRouter.get('/status/:taskId', async (c) => {
  const traceId = uuidv4();
  
  try {
    // Get authenticated user
    const auth = c.get('auth');
    if (!auth?.userId) {
      return c.json({
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: '请先登录',
          traceId,
        },
      }, 401);
    }

    const taskId = c.req.param('taskId');
    
    if (!taskId) {
      return c.json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: '请提供任务 ID',
          traceId,
        },
      }, 400);
    }

    // Get task status
    const service = getNotebookLMService();
    const status = await service.getTaskStatus(taskId);

    if (!status) {
      return c.json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: '任务不存在',
          traceId,
        },
      }, 404);
    }

    return c.json({
      success: true,
      data: {
        taskId,
        ...status,
        traceId,
      },
    });

  } catch (error) {
    console.error('[NotebookLM] Status error:', error);
    
    return c.json({
      success: false,
      error: {
        code: 'QUERY_FAILED',
        message: error instanceof Error ? error.message : '查询状态失败',
        traceId,
      },
    }, 500);
  }
});

/**
 * POST /api/notebooklm/cancel/:taskId
 * Cancel a queued task
 */
notebooklmRouter.post('/cancel/:taskId', async (c) => {
  const traceId = uuidv4();
  
  try {
    const auth = c.get('auth');
    if (!auth?.userId) {
      return c.json({
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: '请先登录',
          traceId,
        },
      }, 401);
    }

    const taskId = c.req.param('taskId');
    
    const service = getNotebookLMService();
    const cancelled = await service.cancelTask(taskId);

    if (!cancelled) {
      return c.json({
        success: false,
        error: {
          code: 'CANCEL_FAILED',
          message: '无法取消任务（可能已在处理中或不存在）',
          traceId,
        },
      }, 400);
    }

    return c.json({
      success: true,
      data: {
        taskId,
        status: 'cancelled',
        traceId,
      },
    });

  } catch (error) {
    console.error('[NotebookLM] Cancel error:', error);
    
    return c.json({
      success: false,
      error: {
        code: 'CANCEL_FAILED',
        message: error instanceof Error ? error.message : '取消任务失败',
        traceId,
      },
    }, 500);
  }
});

/**
 * GET /api/notebooklm/stream/:taskId
 * SSE endpoint for real-time status updates
 */
notebooklmRouter.get('/stream/:taskId', async (c) => {
  const auth = c.get('auth');
  if (!auth?.userId) {
    return c.json({
      success: false,
      error: {
        code: 'AUTH_REQUIRED',
        message: '请先登录',
      },
    }, 401);
  }

  const taskId = c.req.param('taskId');
  const service = getNotebookLMService();

  return streamSSE(c, async (stream) => {
    let lastStatus = '';
    let attempts = 0;
    const maxAttempts = 120; // 2 minutes max

    while (attempts < maxAttempts) {
      const status = await service.getTaskStatus(taskId);

      if (!status) {
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ error: 'Task not found' }),
        });
        break;
      }

      // Only send if status changed
      const statusJson = JSON.stringify(status);
      if (statusJson !== lastStatus) {
        await stream.writeSSE({
          event: 'status',
          data: statusJson,
        });
        lastStatus = statusJson;
      }

      // Stop if completed or failed
      if (status.status === 'completed' || status.status === 'failed') {
        await stream.writeSSE({
          event: 'done',
          data: statusJson,
        });
        break;
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }

    if (attempts >= maxAttempts) {
      await stream.writeSSE({
        event: 'timeout',
        data: JSON.stringify({ error: 'Stream timeout' }),
      });
    }
  });
});

/**
 * GET /api/notebooklm/stats
 * Get queue statistics
 */
notebooklmRouter.get('/stats', async (c) => {
  const traceId = uuidv4();
  
  try {
    const auth = c.get('auth');
    if (!auth?.userId) {
      return c.json({
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: '请先登录',
          traceId,
        },
      }, 401);
    }

    const service = getNotebookLMService();
    const stats = await service.getQueueStats();

    return c.json({
      success: true,
      data: {
        ...stats,
        traceId,
      },
    });

  } catch (error) {
    console.error('[NotebookLM] Stats error:', error);
    
    return c.json({
      success: false,
      error: {
        code: 'QUERY_FAILED',
        message: error instanceof Error ? error.message : '获取统计失败',
        traceId,
      },
    }, 500);
  }
});

/**
 * GET /api/notebooklm/health
 * Health check endpoint
 */
notebooklmRouter.get('/health', async (c) => {
  try {
    const service = getNotebookLMService();
    const health = await service.healthCheck();

    return c.json({
      success: true,
      data: health,
    });

  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: 'HEALTH_CHECK_FAILED',
        message: error instanceof Error ? error.message : '健康检查失败',
      },
    }, 500);
  }
});

export { notebooklmRouter };
