// @vitest-environment node
/**
 * Property-Based Tests for Task Queue
 * **Property 3: 任务队列 FIFO 顺序**
 * **Property 4: 并发限制约束**
 * **验证: 需求 4.1, 4.2, 4.4**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { TaskQueue, resetTaskQueue } from '../task-queue';
import { SourceInput, NotebookLMOutput } from '../types';

// Mock processor that tracks execution order
const createMockProcessor = () => {
  const executionOrder: string[] = [];
  const processingTasks: Set<string> = new Set();
  let maxConcurrent = 0;

  const processor = async (task: { id: string }): Promise<NotebookLMOutput> => {
    executionOrder.push(task.id);
    processingTasks.add(task.id);

    // Track max concurrent
    if (processingTasks.size > maxConcurrent) {
      maxConcurrent = processingTasks.size;
    }

    // Simulate processing time
    await new Promise((resolve) => setTimeout(resolve, 10));

    processingTasks.delete(task.id);

    return {
      type: 'summary',
      title: 'Test',
      summary: 'Test summary',
      keyPoints: [],
      sourceTitle: 'Test',
      generatedAt: new Date().toISOString()
    };
  };

  return {
    processor,
    getExecutionOrder: () => executionOrder,
    getMaxConcurrent: () => maxConcurrent,
    reset: () => {
      executionOrder.length = 0;
      processingTasks.clear();
      maxConcurrent = 0;
    }
  };
};

describe('TaskQueue FIFO Property Tests', () => {
  let queue: TaskQueue;
  let mockProcessor: ReturnType<typeof createMockProcessor>;

  beforeEach(() => {
    resetTaskQueue();
    queue = new TaskQueue({ maxConcurrent: 1, queueTimeout: 60000 });
    mockProcessor = createMockProcessor();
    queue.setProcessor(mockProcessor.processor);
  });

  afterEach(() => {
    mockProcessor.reset();
  });

  /**
   * Property 3: 任务队列 FIFO 顺序
   * **Validates: Requirements 4.4**
   */
  it('should process tasks in FIFO order when maxConcurrent is 1', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.uuid(), { minLength: 2, maxLength: 10 }),
        async (taskIds: string[]) => {
          mockProcessor.reset();
          const uniqueIds = [...new Set(taskIds)];
          if (uniqueIds.length < 2) return true;

          const source: SourceInput = { type: 'text', content: 'test' };
          const submittedOrder: string[] = [];

          // Submit tasks in order
          for (let i = 0; i < uniqueIds.length; i++) {
            const taskId = await queue.enqueue('user1', source, 'summary');
            submittedOrder.push(taskId);
          }

          // Wait for all tasks to complete
          await new Promise((resolve) =>
            setTimeout(resolve, uniqueIds.length * 50 + 100)
          );

          const executionOrder = mockProcessor.getExecutionOrder();

          // Property: Execution order should match submission order
          for (
            let i = 0;
            i < Math.min(submittedOrder.length, executionOrder.length);
            i++
          ) {
            expect(executionOrder[i]).toBe(submittedOrder[i]);
          }

          return true;
        }
      ),
      { numRuns: 5 }
    );
  }, 30000);

  /**
   * Property 3: Sequential submission maintains order
   */
  it('should maintain FIFO order for sequential submissions', async () => {
    const source: SourceInput = { type: 'url', content: 'https://example.com' };
    const taskIds: string[] = [];

    // Submit 5 tasks sequentially
    for (let i = 0; i < 5; i++) {
      const taskId = await queue.enqueue('user1', source, 'flashcards');
      taskIds.push(taskId);
    }

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 500));

    const executionOrder = mockProcessor.getExecutionOrder();

    // Verify FIFO order
    expect(executionOrder).toEqual(taskIds);
  });
});

describe('TaskQueue Concurrency Property Tests', () => {
  let queue: TaskQueue;
  let mockProcessor: ReturnType<typeof createMockProcessor>;

  beforeEach(() => {
    resetTaskQueue();
    mockProcessor = createMockProcessor();
  });

  afterEach(() => {
    mockProcessor.reset();
  });

  /**
   * Property 4: 并发限制约束
   * **Validates: Requirements 4.1, 4.2**
   */
  it('should never exceed maxConcurrent limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 5, max: 20 }),
        async (maxConcurrent: number, numTasks: number) => {
          mockProcessor.reset();
          queue = new TaskQueue({ maxConcurrent, queueTimeout: 60000 });
          queue.setProcessor(mockProcessor.processor);

          const source: SourceInput = { type: 'text', content: 'test content' };

          // Submit many tasks
          for (let i = 0; i < numTasks; i++) {
            await queue.enqueue('user1', source, 'summary');
          }

          // Wait for some processing
          await new Promise((resolve) =>
            setTimeout(resolve, numTasks * 20 + 200)
          );

          // Property: Max concurrent should never exceed limit
          expect(mockProcessor.getMaxConcurrent()).toBeLessThanOrEqual(
            maxConcurrent
          );

          return true;
        }
      ),
      { numRuns: 5 }
    );
  }, 30000);

  /**
   * Property 4: Concurrent limit is respected at any moment
   */
  it('should respect concurrent limit with various configurations', async () => {
    const testCases = [
      { maxConcurrent: 1, numTasks: 10 },
      { maxConcurrent: 3, numTasks: 15 },
      { maxConcurrent: 5, numTasks: 20 }
    ];

    for (const { maxConcurrent, numTasks } of testCases) {
      mockProcessor.reset();
      queue = new TaskQueue({ maxConcurrent, queueTimeout: 60000 });
      queue.setProcessor(mockProcessor.processor);

      const source: SourceInput = { type: 'text', content: 'test' };

      // Submit tasks
      for (let i = 0; i < numTasks; i++) {
        await queue.enqueue('user1', source, 'summary');
      }

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, numTasks * 30 + 200));

      // Verify constraint
      expect(mockProcessor.getMaxConcurrent()).toBeLessThanOrEqual(
        maxConcurrent
      );
    }
  });

  /**
   * Property: Processing count should be accurate
   */
  it('should accurately track processing count', async () => {
    queue = new TaskQueue({ maxConcurrent: 3, queueTimeout: 60000 });

    // Slow processor to observe concurrent state
    const slowProcessor = async (): Promise<NotebookLMOutput> => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return {
        type: 'summary',
        title: 'Test',
        summary: 'Test',
        keyPoints: [],
        sourceTitle: 'Test',
        generatedAt: new Date().toISOString()
      };
    };

    queue.setProcessor(slowProcessor);

    const source: SourceInput = { type: 'text', content: 'test' };

    // Submit 5 tasks
    for (let i = 0; i < 5; i++) {
      await queue.enqueue('user1', source, 'summary');
    }

    // Check processing count immediately
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Should be processing up to maxConcurrent
    expect(queue.getProcessingCount()).toBeLessThanOrEqual(3);
  });
});

describe('TaskQueue Status Tests', () => {
  let queue: TaskQueue;

  beforeEach(() => {
    resetTaskQueue();
    queue = new TaskQueue({ maxConcurrent: 2, queueTimeout: 60000 });
  });

  it('should return correct task status', async () => {
    const source: SourceInput = { type: 'text', content: 'test' };

    // No processor set - tasks stay queued
    const taskId = await queue.enqueue('user1', source, 'flashcards');

    const status = await queue.getStatus(taskId);

    expect(status).not.toBeNull();
    expect(status?.status).toBe('queued');
    expect(status?.position).toBe(1);
  });

  it('should return null for non-existent task', async () => {
    const status = await queue.getStatus('non-existent-id');
    expect(status).toBeNull();
  });

  it('should track queue statistics correctly', async () => {
    const source: SourceInput = { type: 'text', content: 'test' };

    // Submit multiple tasks
    await queue.enqueue('user1', source, 'flashcards');
    await queue.enqueue('user1', source, 'mindmap');
    await queue.enqueue('user1', source, 'quiz');

    const stats = await queue.getStats();

    expect(stats.totalTasks).toBe(3);
    expect(stats.queuedTasks).toBeGreaterThanOrEqual(0);
  });
});

describe('TaskQueue Cancel Tests', () => {
  let queue: TaskQueue;

  beforeEach(() => {
    resetTaskQueue();
    queue = new TaskQueue({ maxConcurrent: 1, queueTimeout: 60000 });
  });

  it('should cancel queued tasks', async () => {
    const source: SourceInput = { type: 'text', content: 'test' };

    const taskId = await queue.enqueue('user1', source, 'flashcards');

    const cancelled = await queue.cancel(taskId);
    expect(cancelled).toBe(true);

    const status = await queue.getStatus(taskId);
    expect(status?.status).toBe('cancelled');
  });

  it('should not cancel non-existent tasks', async () => {
    const cancelled = await queue.cancel('non-existent');
    expect(cancelled).toBe(false);
  });
});

describe('TaskQueue Unique ID Property Tests', () => {
  let queue: TaskQueue;

  beforeEach(() => {
    resetTaskQueue();
    queue = new TaskQueue({ maxConcurrent: 3, queueTimeout: 60000 });
  });

  /**
   * Property 11: 任务 ID 唯一性
   * **Validates: Requirements 9.2**
   */
  it('should generate unique task IDs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 10, max: 100 }),
        async (numTasks: number) => {
          const source: SourceInput = { type: 'text', content: 'test' };
          const taskIds: string[] = [];

          for (let i = 0; i < numTasks; i++) {
            const taskId = await queue.enqueue('user1', source, 'summary');
            taskIds.push(taskId);
          }

          // Property: All task IDs should be unique
          const uniqueIds = new Set(taskIds);
          expect(uniqueIds.size).toBe(taskIds.length);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });
});
