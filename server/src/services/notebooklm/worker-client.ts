/**
 * Worker Client for Python Worker Communication
 * Handles HTTP communication with Python NotebookLM Worker
 * 
 * Requirements covered:
 * - 7.1: HTTP API communication
 * - 7.5: Health check
 * - 8.1: Error handling
 * - 8.2: Logging
 * - 8.4: Trace ID generation
 */

import { v4 as uuidv4 } from 'uuid';
import {
  NotebookLMTask,
  NotebookLMOutput,
  WorkerProcessRequest,
  WorkerProcessResponse,
  WorkerHealthResponse,
  NotebookLMError,
} from './types';
import { getNotebookLMConfig } from './config';

interface WorkerClientConfig {
  baseUrl?: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
}

interface LogEntry {
  traceId: string;
  timestamp: string;
  action: string;
  request?: Record<string, unknown>;
  response?: Record<string, unknown>;
  error?: string;
  duration?: number;
}

export class WorkerClient {
  private config: WorkerClientConfig;
  private logs: LogEntry[] = [];
  private maxLogs = 1000;
  private baseUrlCache: string | null = null;

  constructor(config?: Partial<WorkerClientConfig>) {
    this.config = {
      baseUrl: config?.baseUrl,
      timeout: config?.timeout ?? 120000, // 2 minutes
      retryAttempts: config?.retryAttempts ?? 3,
      retryDelay: config?.retryDelay ?? 2000,
    };
  }

  /**
   * Get worker base URL from online config
   * For Vercel deployment, uses relative path to Python Functions
   */
  private async getBaseUrl(): Promise<string> {
    if (this.config.baseUrl) {
      return this.config.baseUrl;
    }
    
    // Check if running on Vercel (use relative path)
    if (process.env.VERCEL || process.env.VERCEL_URL) {
      const vercelUrl = process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}` 
        : '';
      return `${vercelUrl}/api/nlm`;
    }
    
    if (this.baseUrlCache) {
      return this.baseUrlCache;
    }

    try {
      const nlmConfig = await getNotebookLMConfig();
      this.baseUrlCache = nlmConfig.worker_url;
      return this.baseUrlCache;
    } catch {
      // Default to local Python worker for development
      return 'http://localhost:8000';
    }
  }

  /**
   * Invalidate URL cache (call when config changes)
   */
  invalidateUrlCache(): void {
    this.baseUrlCache = null;
  }

  /**
   * Generate unique trace ID for request tracking
   */
  generateTraceId(): string {
    return uuidv4();
  }

  /**
   * Check worker health
   */
  async healthCheck(): Promise<WorkerHealthResponse> {
    const traceId = this.generateTraceId();
    const startTime = Date.now();
    const baseUrl = await this.getBaseUrl();

    try {
      const response = await this.fetchWithTimeout(
        `${baseUrl}/health`,
        { method: 'GET' },
        10000 // 10 second timeout for health check
      );

      const data = await response.json() as WorkerHealthResponse;

      this.log({
        traceId,
        timestamp: new Date().toISOString(),
        action: 'health_check',
        response: data as unknown as Record<string, unknown>,
        duration: Date.now() - startTime,
      });

      return data;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.log({
        traceId,
        timestamp: new Date().toISOString(),
        action: 'health_check',
        error: errorMessage,
        duration: Date.now() - startTime,
      });

      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        version: 'unknown',
        notebooklm_available: false,
        accounts_available: 0,
      };
    }
  }

  /**
   * Process task through worker
   */
  async processTask(task: NotebookLMTask): Promise<NotebookLMOutput> {
    const traceId = this.generateTraceId();
    const startTime = Date.now();
    const baseUrl = await this.getBaseUrl();

    const request: WorkerProcessRequest = {
      task_id: task.id,
      source_type: task.source.type,
      source_content: task.source.content,
      output_type: task.outputType,
      options: task.options,
    };

    this.log({
      traceId,
      timestamp: new Date().toISOString(),
      action: 'process_request',
      request: request as unknown as Record<string, unknown>,
    });

    try {
      const response = await this.fetchWithRetry(
        `${baseUrl}/process`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Trace-ID': traceId,
          },
          body: JSON.stringify(request),
        }
      );

      const data = await response.json() as WorkerProcessResponse;

      this.log({
        traceId,
        timestamp: new Date().toISOString(),
        action: 'process_response',
        response: data as unknown as Record<string, unknown>,
        duration: Date.now() - startTime,
      });

      if (data.status === 'failed') {
        throw this.createError(
          'PROCESSING_FAILED',
          data.error ?? 'Worker processing failed',
          traceId,
          true
        );
      }

      return data.result as unknown as NotebookLMOutput;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.log({
        traceId,
        timestamp: new Date().toISOString(),
        action: 'process_error',
        error: errorMessage,
        duration: Date.now() - startTime,
      });

      // Re-throw if already a NotebookLMError
      if (this.isNotebookLMError(error)) {
        throw error;
      }

      throw this.createError(
        this.classifyError(errorMessage),
        this.getUserFriendlyMessage(errorMessage),
        traceId,
        this.isRetryableError(errorMessage)
      );
    }
  }

  /**
   * Fetch with timeout
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeout: number = this.config.timeout
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Fetch with retry logic
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, options);
        
        if (response.ok) {
          return response;
        }

        // Check if should retry based on status code
        if (response.status >= 500 || response.status === 429) {
          lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
          await this.delay(this.config.retryDelay * (attempt + 1));
          continue;
        }

        // Non-retryable error
        return response;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (attempt < this.config.retryAttempts - 1) {
          await this.delay(this.config.retryDelay * (attempt + 1));
        }
      }
    }

    throw lastError ?? new Error('Max retries exceeded');
  }

  /**
   * Create structured error
   */
  private createError(
    code: string,
    message: string,
    traceId: string,
    retryable: boolean,
    retryAfter?: number
  ): NotebookLMError {
    return {
      code,
      message,
      traceId,
      retryable,
      retryAfter,
    };
  }

  /**
   * Classify error type
   */
  private classifyError(error: string): string {
    const errorLower = error.toLowerCase();
    
    if (errorLower.includes('timeout') || errorLower.includes('etimedout')) {
      return 'TIMEOUT';
    }
    if (errorLower.includes('econnrefused') || errorLower.includes('unavailable')) {
      return 'WORKER_UNAVAILABLE';
    }
    if (errorLower.includes('rate') || errorLower.includes('429')) {
      return 'RATE_LIMITED';
    }
    if (errorLower.includes('cookie') || errorLower.includes('auth')) {
      return 'COOKIE_EXPIRED';
    }
    if (errorLower.includes('invalid') || errorLower.includes('source')) {
      return 'INVALID_SOURCE';
    }
    
    return 'PROCESSING_FAILED';
  }

  /**
   * Get user-friendly error message
   */
  private getUserFriendlyMessage(error: string): string {
    const code = this.classifyError(error);
    
    const messages: Record<string, string> = {
      TIMEOUT: '处理超时，请稍后重试',
      WORKER_UNAVAILABLE: '服务暂时不可用，请稍后重试',
      RATE_LIMITED: '请求过于频繁，请稍后重试',
      COOKIE_EXPIRED: '认证已过期，正在刷新',
      INVALID_SOURCE: '无法处理该来源，请检查链接或内容',
      PROCESSING_FAILED: '处理失败，请重试',
    };

    return messages[code] ?? '发生未知错误';
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: string): boolean {
    const code = this.classifyError(error);
    return ['TIMEOUT', 'WORKER_UNAVAILABLE', 'RATE_LIMITED', 'COOKIE_EXPIRED', 'PROCESSING_FAILED'].includes(code);
  }

  /**
   * Check if error is NotebookLMError
   */
  private isNotebookLMError(error: unknown): error is NotebookLMError {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      'message' in error &&
      'traceId' in error
    );
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Log entry
   */
  private log(entry: LogEntry): void {
    this.logs.push(entry);
    
    // Trim old logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Console log for debugging
    console.log(`[NotebookLM] ${entry.action}`, {
      traceId: entry.traceId,
      duration: entry.duration,
      error: entry.error,
    });
  }

  /**
   * Get recent logs
   */
  getLogs(limit = 100): LogEntry[] {
    return this.logs.slice(-limit);
  }

  /**
   * Get logs by trace ID
   */
  getLogsByTraceId(traceId: string): LogEntry[] {
    return this.logs.filter(log => log.traceId === traceId);
  }
}

// Singleton instance
let workerClientInstance: WorkerClient | null = null;

export function getWorkerClient(config?: Partial<WorkerClientConfig>): WorkerClient {
  if (!workerClientInstance) {
    workerClientInstance = new WorkerClient(config);
  }
  return workerClientInstance;
}

export function resetWorkerClient(): void {
  workerClientInstance = null;
}
