import { describe, expect, it } from 'vitest';

import {
  checkRateLimit,
  DISCOVERY_IMAGE_ANALYSIS_RATE_LIMIT
} from '../../api/utils/rate-limiter';

describe('discovery image analysis rate limit', () => {
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
