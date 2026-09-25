import { describe, expect, it } from 'vitest';
import {
  getImageProviderHealthKey,
  type ImageProviderHealthRecord
} from '../../api/image/provider-health';
import { resolveRuntimeImageModelAvailability } from '../../api/image/model-availability';
import type { TuziImageAttempt } from '../../api/image/generate/tuzi-routing';
import { getTuziImageModelConfig } from '../shared/tuzi-image-models';

const model = getTuziImageModelConfig('gpt-image-2');
const attempt: TuziImageAttempt = {
  modelId: 'gpt-image-2',
  model: 'gpt-image-2',
  channel: 'default',
  apiKey: 'test-key',
  apiBaseUrl: 'https://provider.test'
};

function health(overrides: Partial<ImageProviderHealthRecord> = {}) {
  return {
    provider: 'tuzi',
    model: 'gpt-image-2',
    channel: 'default',
    totalAttempts: 10,
    succeededAttempts: 0,
    failedAttempts: 10,
    runningAttempts: 0,
    successRate: 0,
    avgDurationMs: 1000,
    p95DurationMs: 1000,
    authErrorCount: 0,
    rateLimitCount: 0,
    timeoutCount: 0,
    unavailableCount: 10,
    policyCount: 0,
    lastFailureAt: '2026-08-05T00:00:00.000Z',
    lastSuccessAt: null,
    healthScore: 0,
    healthState: 'degraded' as const,
    circuitBreakerUntil: null,
    ...overrides
  } satisfies ImageProviderHealthRecord;
}

describe('runtime image model availability', () => {
  it('marks models without configured routes unavailable', () => {
    expect(
      resolveRuntimeImageModelAvailability(model, [], new Map())
    ).toMatchObject({
      status: 'unavailable',
      availabilityReason: 'provider_not_configured'
    });
  });

  it('marks models unavailable when every route is repeatedly exhausted', () => {
    const record = health();
    const lookup = new Map([[getImageProviderHealthKey(record), record]]);
    expect(
      resolveRuntimeImageModelAvailability(model, [attempt], lookup)
    ).toMatchObject({
      status: 'unavailable',
      availabilityReason: 'all_routes_unhealthy'
    });
  });

  it('keeps a configured route available while health data is still sparse', () => {
    expect(
      resolveRuntimeImageModelAvailability(model, [attempt], new Map())
    ).toMatchObject({
      status: 'available',
      availabilityReason: 'insufficient_health_data'
    });
  });

  it('keeps the model degraded when an alternate provider remains viable', () => {
    const record = health();
    const lookup = new Map([[getImageProviderHealthKey(record), record]]);
    expect(
      resolveRuntimeImageModelAvailability(model, [attempt], lookup, [
        {
          provider: 'krill',
          model: 'gpt-image-2',
          channel: 'drawing'
        }
      ])
    ).toMatchObject({
      status: 'degraded',
      availabilityReason: 'provider_degraded',
      configuredRouteCount: 2,
      healthyRouteCount: 1
    });
  });
});
