/**
 * NotebookLM Service Module
 * Main entry point for NotebookLM integration
 */

export * from './types';
export * from './task-queue';
export * from './worker-client';
export * from './config';

import { TaskQueue, getTaskQueue } from './task-queue';
import { WorkerClient, getWorkerClient } from './worker-client';
import { NotebookLMTask, NotebookLMOutput, SourceInput, OutputType, ProcessOptions } from './types';

/**
 * NotebookLM Service
 * High-level API for NotebookLM operations
 */
export class NotebookLMService {
  private taskQueue: TaskQueue;
  private workerClient: WorkerClient;

  constructor() {
    this.taskQueue = getTaskQueue();
    this.workerClient = getWorkerClient();

    // Set up task processor
    this.taskQueue.setProcessor(this.processTask.bind(this));
  }

  /**
   * Submit content for processing
   */
  async submitTask(
    userId: string,
    source: SourceInput,
    outputType: OutputType,
    options?: ProcessOptions
  ): Promise<{ taskId: string; estimatedTime: number }> {
    const taskId = await this.taskQueue.enqueue(userId, source, outputType, options ?? {});
    
    // Estimate based on queue position and output type
    const stats = await this.taskQueue.getStats();
    const baseTime = this.getBaseProcessingTime(outputType);
    const estimatedTime = baseTime + (stats.queuedTasks * 30); // 30s per queued task

    return { taskId, estimatedTime };
  }

  /**
   * Get task status
   */
  async getTaskStatus(taskId: string) {
    return this.taskQueue.getStatus(taskId);
  }

  /**
   * Cancel task
   */
  async cancelTask(taskId: string) {
    return this.taskQueue.cancel(taskId);
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    return this.taskQueue.getStats();
  }

  /**
   * Check service health
   */
  async healthCheck() {
    return this.workerClient.healthCheck();
  }

  /**
   * Process task through worker
   */
  private async processTask(task: NotebookLMTask): Promise<NotebookLMOutput> {
    return this.workerClient.processTask(task);
  }

  /**
   * Get base processing time estimate by output type
   */
  private getBaseProcessingTime(outputType: OutputType): number {
    const times: Record<OutputType, number> = {
      flashcards: 45,
      mindmap: 30,
      report: 60,
      quiz: 45,
      summary: 20,
      audio: 120,
      video: 180,
      infographic: 90,
      slide_deck: 90,
      data_table: 45,
    };
    return times[outputType] ?? 30;
  }
}

// Singleton instance
let serviceInstance: NotebookLMService | null = null;

export function getNotebookLMService(): NotebookLMService {
  if (!serviceInstance) {
    serviceInstance = new NotebookLMService();
  }
  return serviceInstance;
}
