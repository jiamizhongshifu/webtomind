import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock('../../api/utils/auth', () => ({
  getSupabaseAdmin: () => state.admin
}));

import { consumeModelRateLimit } from '../../api/utils/model-rate-limit';

describe('model rate limit', () => {
  beforeEach(() => {
    state.admin = null;
  });

  it('fails closed when the durable store is unavailable', async () => {
    const result = await consumeModelRateLimit({
      userId: 'user-1',
      bucket: 'test',
      maxRequests: 2
    });
    expect(result).toMatchObject({
      allowed: false,
      status: 503,
      error: 'RATE_LIMIT_SERVICE_UNAVAILABLE'
    });
  });

  it('returns a durable 429 decision with retry metadata', async () => {
    state.admin = {
      rpc: vi.fn(async () => ({
        data: { allowed: false, retry_after: 27, remaining: 0 },
        error: null
      }))
    };
    const result = await consumeModelRateLimit({
      userId: 'user-1',
      bucket: 'test',
      maxRequests: 2
    });
    expect(result).toMatchObject({
      allowed: false,
      status: 429,
      retryAfter: 27,
      error: 'RATE_LIMITED'
    });
  });
});
