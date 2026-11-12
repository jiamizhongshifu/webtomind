import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  checkRateLimit,
  DISCOVERY_IMAGE_ANALYSIS_RATE_LIMIT
} from '../../api/utils/rate-limiter';

describe('discovery image analysis rate limit', () => {
  afterEach(() => vi.useRealTimers());

  it('resets at the exact boundary without returning a zero-second 429', () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const userId = crypto.randomUUID();
    const config = { ...DISCOVERY_IMAGE_ANALYSIS_RATE_LIMIT, maxRequests: 1 };
    expect(checkRateLimit(userId, config).allowed).toBe(true);
    vi.setSystemTime(160_000);
    expect(checkRateLimit(userId, config)).toMatchObject({ allowed: true, remaining: 0 });
  });

  it('limits each user to six multimodal analyses per minute', () => {
    const userId = `test-user-${crypto.randomUUID()}`;

    for (let index = 0; index < 6; index += 1) {
      expect(
        checkRateLimit(userId, DISCOVERY_IMAGE_ANALYSIS_RATE_LIMIT).allowed
      ).toBe(true);
    }

    const blocked = checkRateLimit(
      userId,
      DISCOVERY_IMAGE_ANALYSIS_RATE_LIMIT
    );
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });
});
