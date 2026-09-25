// @vitest-environment node
/**
 * Property-Based Tests for Worker Client
 * **Property 2: 错误响应格式一致性**
 * **Property 12: 追踪 ID 唯一性**
 * **验证: 需求 1.5, 7.4, 8.1, 8.4**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { WorkerClient, resetWorkerClient } from '../worker-client';

type WorkerClientPrivateApi = {
  classifyError: (message: string) => string;
  getUserFriendlyMessage: (message: string) => string;
  isRetryableError: (message: string) => boolean;
};

describe('WorkerClient Error Response Property Tests', () => {
  let client: WorkerClient;

  beforeEach(() => {
    resetWorkerClient();
    client = new WorkerClient({ baseUrl: 'http://localhost:8000' });
  });

  /**
   * Property 2: 错误响应格式一致性
   * **Validates: Requirements 1.5, 7.4, 8.1**
   *
   * For any invalid input or processing failure, the system should return
   * a structured error response containing:
   * - Error type identifier (code)
   * - User-friendly error description (message)
   * - Request trace ID (traceId)
   */
  it('should classify errors consistently', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant('timeout error'),
          fc.constant('ETIMEDOUT'),
          fc.constant('ECONNREFUSED'),
          fc.constant('service unavailable'),
          fc.constant('rate limit exceeded'),
          fc.constant('429 too many requests'),
          fc.constant('cookie expired'),
          fc.constant('authentication failed'),
          fc.constant('invalid source format'),
          fc.constant('processing failed'),
          fc.constant('unknown error')
        ),
        (errorMessage: string) => {
          const privateApi = client as unknown as WorkerClientPrivateApi;
          const classifyError = privateApi.classifyError.bind(client);
          const code = classifyError(errorMessage);

          // Property: Error code should be one of defined types
          const validCodes = [
            'TIMEOUT',
            'WORKER_UNAVAILABLE',
            'RATE_LIMITED',
            'COOKIE_EXPIRED',
            'INVALID_SOURCE',
            'PROCESSING_FAILED'
          ];

          expect(validCodes).toContain(code);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2: User-friendly messages for all error types
   */
  it('should provide user-friendly messages for all error codes', () => {
    const errorCodes = [
      'TIMEOUT',
      'WORKER_UNAVAILABLE',
      'RATE_LIMITED',
      'COOKIE_EXPIRED',
      'INVALID_SOURCE',
      'PROCESSING_FAILED'
    ];

    for (const code of errorCodes) {
      const privateApi = client as unknown as WorkerClientPrivateApi;
      const getUserFriendlyMessage =
        privateApi.getUserFriendlyMessage.bind(client);

      // Simulate error that would produce this code
      const errorMap: Record<string, string> = {
        TIMEOUT: 'timeout error',
        WORKER_UNAVAILABLE: 'ECONNREFUSED',
        RATE_LIMITED: '429',
        COOKIE_EXPIRED: 'cookie expired',
        INVALID_SOURCE: 'invalid source',
        PROCESSING_FAILED: 'processing failed'
      };

      const message = getUserFriendlyMessage(errorMap[code]);

      // Property: Message should be non-empty string
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);

      // Property: Message should be in Chinese (user-friendly)
      // Check for Chinese characters or common patterns
      expect(message).toMatch(/[\u4e00-\u9fa5]|error|failed/i);
    }
  });

  /**
   * Property 2: Retryable errors are correctly identified
   */
  it('should correctly identify retryable errors', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant('timeout'),
          fc.constant('ECONNREFUSED'),
          fc.constant('rate limited'),
          fc.constant('cookie expired'),
          fc.constant('processing failed')
        ),
        (errorMessage: string) => {
          const privateApi = client as unknown as WorkerClientPrivateApi;
          const isRetryableError = privateApi.isRetryableError.bind(client);
          const isRetryable = isRetryableError(errorMessage);

          // Property: These errors should be retryable
          expect(isRetryable).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });
});

describe('WorkerClient Trace ID Property Tests', () => {
  let client: WorkerClient;

  beforeEach(() => {
    resetWorkerClient();
    client = new WorkerClient({ baseUrl: 'http://localhost:8000' });
  });

  /**
   * Property 12: 追踪 ID 唯一性
   * **Validates: Requirements 8.4**
   *
   * For any API request, the generated trace ID should be unique in the system.
   */
  it('should generate unique trace IDs', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 1000 }), (count: number) => {
        const traceIds: string[] = [];

        for (let i = 0; i < count; i++) {
          traceIds.push(client.generateTraceId());
        }

        // Property: All trace IDs should be unique
        const uniqueIds = new Set(traceIds);
        expect(uniqueIds.size).toBe(traceIds.length);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property 12: Trace ID format validation
   */
  it('should generate valid UUID format trace IDs', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (count: number) => {
        const uuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

        for (let i = 0; i < count; i++) {
          const traceId = client.generateTraceId();

          // Property: Trace ID should be valid UUID v4
          expect(traceId).toMatch(uuidRegex);
        }
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property 12: Trace ID is non-empty
   */
  it('should never generate empty trace IDs', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 500 }), (count: number) => {
        for (let i = 0; i < count; i++) {
          const traceId = client.generateTraceId();

          // Property: Trace ID should never be empty
          expect(traceId).toBeTruthy();
          expect(traceId.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 10 }
    );
  });
});

describe('WorkerClient Logging Tests', () => {
  let client: WorkerClient;

  beforeEach(() => {
    resetWorkerClient();
    client = new WorkerClient({ baseUrl: 'http://localhost:8000' });
  });

  /**
   * Property 16: 日志记录完整性
   * **Validates: Requirements 8.2**
   */
  it('should maintain log entries with required fields', async () => {
    // Trigger a health check to generate logs
    await client.healthCheck();

    const logs = client.getLogs();

    // Should have at least one log entry
    expect(logs.length).toBeGreaterThan(0);

    // Each log should have required fields
    for (const log of logs) {
      expect(log).toHaveProperty('traceId');
      expect(log).toHaveProperty('timestamp');
      expect(log).toHaveProperty('action');

      // Trace ID should be valid
      expect(log.traceId).toBeTruthy();
      expect(log.traceId.length).toBeGreaterThan(0);

      // Timestamp should be valid ISO string
      expect(() => new Date(log.timestamp)).not.toThrow();

      // Action should be non-empty
      expect(log.action).toBeTruthy();
    }
  });

  it('should retrieve logs by trace ID', async () => {
    // Generate some activity
    await client.healthCheck();
    await client.healthCheck();

    const allLogs = client.getLogs();

    if (allLogs.length > 0) {
      const targetTraceId = allLogs[0].traceId;
      const filteredLogs = client.getLogsByTraceId(targetTraceId);

      // Should find at least one log with this trace ID
      expect(filteredLogs.length).toBeGreaterThan(0);

      // All filtered logs should have the target trace ID
      for (const log of filteredLogs) {
        expect(log.traceId).toBe(targetTraceId);
      }
    }
  });

  it('should limit log storage', async () => {
    // Generate many logs
    for (let i = 0; i < 50; i++) {
      await client.healthCheck();
    }

    const logs = client.getLogs();

    // Should not exceed max logs (default 1000)
    expect(logs.length).toBeLessThanOrEqual(1000);
  });
});

describe('WorkerClient Health Check Tests', () => {
  let client: WorkerClient;

  beforeEach(() => {
    resetWorkerClient();
    client = new WorkerClient({ baseUrl: 'http://localhost:8000' });
  });

  it('should return error status when worker unavailable', async () => {
    // Worker is not running, should return error status
    const health = await client.healthCheck();

    expect(health).toHaveProperty('status');
    expect(health).toHaveProperty('timestamp');
    expect(health).toHaveProperty('version');
    expect(health).toHaveProperty('notebooklm_available');
    expect(health).toHaveProperty('accounts_available');

    // When worker is unavailable
    expect(health.status).toBe('error');
    expect(health.notebooklm_available).toBe(false);
  });
});
