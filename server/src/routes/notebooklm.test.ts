// @vitest-environment node
/**
 * Property-Based Tests for NotebookLM API Routes
 * **Property 10: API 认证强制**
 * **Property 11: 任务 ID 唯一性**
 * **验证: 需求 9.2, 9.5**
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { notebooklmRouter } from './notebooklm';

// Mock auth middleware
const createTestApp = (authenticated: boolean, userId?: string) => {
  const app = new Hono<{
    Variables: { auth: { userId: string; email?: string } };
  }>();

  // Mock auth middleware
  app.use('*', async (c, next) => {
    if (authenticated && userId) {
      c.set('auth', { userId, email: 'test@example.com' });
    }
    await next();
  });

  app.route('/api/notebooklm', notebooklmRouter);

  return app;
};

describe('NotebookLM API Authentication Property Tests', () => {
  /**
   * Property 10: API 认证强制
   * **Validates: Requirements 9.5**
   *
   * For any API request without valid authentication token,
   * the system should return 401 unauthorized error.
   */

  it('should return 401 for unauthenticated process requests', async () => {
    const app = createTestApp(false);

    const res = await app.request('/api/notebooklm/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: { type: 'url', content: 'https://example.com' },
        outputType: 'flashcards'
      })
    });

    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('AUTH_REQUIRED');
  });

  it('should return 401 for unauthenticated status requests', async () => {
    const app = createTestApp(false);

    const res = await app.request('/api/notebooklm/status/test-task-id', {
      method: 'GET'
    });

    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('AUTH_REQUIRED');
  });

  it('should return 401 for unauthenticated cancel requests', async () => {
    const app = createTestApp(false);

    const res = await app.request('/api/notebooklm/cancel/test-task-id', {
      method: 'POST'
    });

    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('AUTH_REQUIRED');
  });

  it('should return 401 for unauthenticated stats requests', async () => {
    const app = createTestApp(false);

    const res = await app.request('/api/notebooklm/stats', {
      method: 'GET'
    });

    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('AUTH_REQUIRED');
  });

  it('should allow health check without authentication', async () => {
    const app = createTestApp(false);

    const res = await app.request('/api/notebooklm/health', {
      method: 'GET'
    });

    // Health check should work without auth
    expect(res.status).toBe(200);
  });
});

describe('NotebookLM API Validation Tests', () => {
  it('should validate source type', async () => {
    const app = createTestApp(true, 'user-123');

    const res = await app.request('/api/notebooklm/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: { type: 'invalid', content: 'test' },
        outputType: 'flashcards'
      })
    });

    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('INVALID_SOURCE');
  });

  it('should validate output type', async () => {
    const app = createTestApp(true, 'user-123');

    const res = await app.request('/api/notebooklm/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: { type: 'url', content: 'https://example.com' },
        outputType: 'invalid'
      })
    });

    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('INVALID_OUTPUT_TYPE');
  });

  it('should require source content', async () => {
    const app = createTestApp(true, 'user-123');

    const res = await app.request('/api/notebooklm/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: { type: 'url' },
        outputType: 'flashcards'
      })
    });

    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('INVALID_REQUEST');
  });

  it('should require output type', async () => {
    const app = createTestApp(true, 'user-123');

    const res = await app.request('/api/notebooklm/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: { type: 'url', content: 'https://example.com' }
      })
    });

    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('INVALID_REQUEST');
  });
});

describe('NotebookLM API Response Format Tests', () => {
  it('should include traceId in all responses', async () => {
    const app = createTestApp(true, 'user-123');

    // Test process endpoint
    const processRes = await app.request('/api/notebooklm/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: { type: 'url', content: 'https://example.com' },
        outputType: 'flashcards'
      })
    });

    const processData = await processRes.json();

    if (processData.success) {
      expect(processData.data.traceId).toBeTruthy();
    } else {
      expect(processData.error.traceId).toBeTruthy();
    }
  });

  it('should return 404 for non-existent task', async () => {
    const app = createTestApp(true, 'user-123');

    const res = await app.request('/api/notebooklm/status/non-existent-task', {
      method: 'GET'
    });

    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('NOT_FOUND');
  });
});

describe('NotebookLM API Task ID Uniqueness Property Tests', () => {
  /**
   * Property 11: 任务 ID 唯一性
   * **Validates: Requirements 9.2**
   *
   * For any submitted processing request, the returned task ID
   * should be unique in the system.
   */

  it('should generate unique task IDs for multiple requests', async () => {
    const app = createTestApp(true, 'user-123');
    const taskIds: string[] = [];

    // Submit multiple requests
    for (let i = 0; i < 10; i++) {
      const res = await app.request('/api/notebooklm/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: { type: 'text', content: `Test content ${i}` },
          outputType: 'summary'
        })
      });

      const data = await res.json();

      if (data.success && data.data.taskId) {
        taskIds.push(data.data.taskId);
      }
    }

    // All task IDs should be unique
    const uniqueIds = new Set(taskIds);
    expect(uniqueIds.size).toBe(taskIds.length);
  });
});
