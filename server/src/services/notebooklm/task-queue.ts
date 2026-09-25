/**
 * Task Queue Service for NotebookLM
 * Manages task queuing, concurrency control, and FIFO processing
 * 
 * Requirements covered:
 * - 4.1: Limit concurrent requests
 * - 4.2: Queue excess requests
 * - 4.3: Timeout handling
 * - 4.4: FIFO processing order
 * - 4.5: Retry on error
 */

import { v4 as uuidv4 } from 'uuid';
import {
  NotebookLMTask,
  TaskStatus,
  TaskStatusInfo,
  SourceInput,
  OutputType,
  ProcessOptions,
  NotebookLMOutput,
  QueueStats,
} from './types';

interface TaskRecord {
  task: NotebookLMTask;
  status: TaskStatus;
  progress: number;
  result?: NotebookLMOutput;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  retryCount: number;
}

interface TaskQueueConfig {
  maxConcurrent: number;
  queueTimeout: number; // milliseconds
  maxRetries: number;
  retryDelay: number; // milliseconds
}

type TaskProcessor = (task: NotebookLMTask) => Promise<NotebookLMOutput>;

export class TaskQueue {
  private tasks: Map<string, TaskRecord> = new Map();
  private queue: string[] = []; // Task IDs in FIFO order
  private processing: Set<string> = new Set();
  private config: TaskQueueConfig;
  private processor?: TaskProcessor;
  private isProcessing = false;

  constructor(config?: Partial<TaskQueueConfig>) {
    this.config = {
      maxConcurrent: config?.maxConcurrent ?? 3,
      queueTimeout: config?.queueTimeout ?? 300000, // 5 minutes
      maxRetries: config?.maxRetries ?? 3,
      retryDelay: config?.retryDelay ?? 5000, // 5 seconds
    };
  }

  /**
   * Set the task processor function
   */
  setProcessor(processor: TaskProcessor): void {
    this.processor = processor;
    // 设置 processor 后继续处理积压的队列。
    this.processQueue();
  }

  /**
   * Add a task to the queue
   * Returns unique task ID
   */
  async enqueue(
    userId: string,
    source: SourceInput,
    outputType: OutputType,
    options: ProcessOptions = {},
    priority = 0
  ): Promise<string> {
    const taskId = uuidv4();
    
    const task: NotebookLMTask = {
      id: taskId,
      userId,
      source,
      outputType,
      options,
      createdAt: new Date(),
      priority,
    };

    const record: TaskRecord = {
      task,
      status: 'queued',
      progress: 0,
      retryCount: 0,
    };

    this.tasks.set(taskId, record);
    this.queue.push(taskId);

    // Start processing if not already running
    this.processQueue();

    return taskId;
  }

  /**
   * Get task status
   */
  async getStatus(taskId: string): Promise<TaskStatusInfo | null> {
    const record = this.tasks.get(taskId);
    if (!record) return null;

    const position = this.queue.indexOf(taskId);

    return {
      status: record.status,
      position: position >= 0 ? position + 1 : undefined,
      progress: record.progress,
      result: record.result,
      error: record.error,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
    };
  }

  /**
   * Cancel a queued task
   */
  async cancel(taskId: string): Promise<boolean> {
    const record = this.tasks.get(taskId);
    if (!record) return false;

    // Can only cancel queued tasks
    if (record.status !== 'queued') return false;

    record.status = 'cancelled';
    
    // Remove from queue
    const index = this.queue.indexOf(taskId);
    if (index >= 0) {
      this.queue.splice(index, 1);
    }

    return true;
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<QueueStats> {
    let queued = 0;
    let processing = 0;
    let completed = 0;
    let failed = 0;

    for (const record of this.tasks.values()) {
      switch (record.status) {
        case 'queued':
          queued++;
          break;
        case 'processing':
          processing++;
          break;
        case 'completed':
          completed++;
          break;
        case 'failed':
          failed++;
          break;
      }
    }

    return {
      totalTasks: this.tasks.size,
      queuedTasks: queued,
      processingTasks: processing,
      completedTasks: completed,
      failedTasks: failed,
    };
  }

  /**
   * Update task progress
   */
  updateProgress(taskId: string, progress: number): void {
    const record = this.tasks.get(taskId);
    if (record) {
      record.progress = Math.min(100, Math.max(0, progress));
    }
  }

  /**
   * Get current concurrent task count
   */
  getProcessingCount(): number {
    return this.processing.size;
  }

  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Process queue - FIFO order
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.queue.length > 0 && this.processing.size < this.config.maxConcurrent) {
        // 尚未设置 processor 时，任务保持 queued，等待 processor 就绪后再处理。
        if (!this.processor) break;
        const taskId = this.queue.shift();
        if (!taskId) break;

        const record = this.tasks.get(taskId);
        if (!record || record.status !== 'queued') continue;

        // Check timeout
        const waitTime = Date.now() - record.task.createdAt.getTime();
        if (waitTime > this.config.queueTimeout) {
          record.status = 'failed';
          record.error = 'Queue timeout exceeded';
          continue;
        }

        // Start processing
        this.processing.add(taskId);
        record.status = 'processing';
        record.startedAt = new Date();

        // Process asynchronously
        this.processTask(taskId, record).catch(console.error);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single task with retry logic
   */
  private async processTask(taskId: string, record: TaskRecord): Promise<void> {
    try {
      if (!this.processor) {
        throw new Error('No processor configured');
      }

      const result = await this.processor(record.task);
      
      record.status = 'completed';
      record.result = result;
      record.progress = 100;
      record.completedAt = new Date();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Check if should retry
      if (record.retryCount < this.config.maxRetries && this.isRetryableError(errorMessage)) {
        record.retryCount++;
        record.status = 'queued';
        
        // Re-queue with delay
        setTimeout(() => {
          this.queue.unshift(taskId); // Add to front for priority
          this.processQueue();
        }, this.config.retryDelay * record.retryCount);
        
      } else {
        record.status = 'failed';
        record.error = errorMessage;
        record.completedAt = new Date();
      }
    } finally {
      this.processing.delete(taskId);
      
      // Continue processing queue
      this.processQueue();
    }
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: string): boolean {
    const retryablePatterns = [
      'RATE_LIMITED',
      'COOKIE_EXPIRED',
      'PROCESSING_FAILED',
      'WORKER_UNAVAILABLE',
      'timeout',
      'ECONNREFUSED',
      'ETIMEDOUT',
    ];
    
    return retryablePatterns.some(pattern => 
      error.toUpperCase().includes(pattern.toUpperCase())
    );
  }

  /**
   * Clear completed/failed tasks older than specified age
   */
  cleanup(maxAgeMs: number = 3600000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [taskId, record] of this.tasks.entries()) {
      if (record.status === 'completed' || record.status === 'failed' || record.status === 'cancelled') {
        const completedAt = record.completedAt?.getTime() ?? record.task.createdAt.getTime();
        if (now - completedAt > maxAgeMs) {
          this.tasks.delete(taskId);
          cleaned++;
        }
      }
    }

    return cleaned;
  }
}

// Singleton instance
let taskQueueInstance: TaskQueue | null = null;

export function getTaskQueue(config?: Partial<TaskQueueConfig>): TaskQueue {
  if (!taskQueueInstance) {
    taskQueueInstance = new TaskQueue(config);
  }
  return taskQueueInstance;
}

export function resetTaskQueue(): void {
  taskQueueInstance = null;
}
