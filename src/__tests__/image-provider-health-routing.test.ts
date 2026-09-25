import { describe, expect, it } from 'vitest';
import {
  getImageProviderRoutingDecision,
  IMAGE_PROVIDER_HEALTH_THRESHOLDS,
  isModelUnavailableBlocked,
  type ImageProviderHealthRecord
} from '../../api/image/provider-health';

function buildRecord(
  overrides: Record<string, unknown>
): Parameters<typeof getImageProviderRoutingDecision>[0] {
  return {
    provider: 'tuzi',
    model: 'seedream-5-0-lite',
    channel: 'default',
    totalAttempts: 12,
    succeededAttempts: 0,
    failedAttempts: 12,
    runningAttempts: 0,
    successRate: 0,
    avgDurationMs: null,
    p95DurationMs: 700,
    authErrorCount: 0,
    rateLimitCount: 0,
    timeoutCount: 0,
    unavailableCount: 4,
    policyCount: 0,
    lastFailureAt: '2026-08-10T00:00:00.000Z',
    lastSuccessAt: null,
    healthScore: 20,
    healthState: 'degraded',
    circuitBreakerUntil: null,
    ...overrides
  } as Parameters<typeof getImageProviderRoutingDecision>[0];
}

describe('image provider health routing decision', () => {
  it('blocks a route after sustained unavailable failures', () => {
    const decision = getImageProviderRoutingDecision(
      buildRecord({
        unavailableCount: IMAGE_PROVIDER_HEALTH_THRESHOLDS.unavailableCircuitCount,
        healthState: 'degraded'
      })
    );

    expect(decision.blocked).toBe(true);
    expect(decision.deprioritized).toBe(true);
    expect(decision.reason).toBe('unavailable');
  });

  it('only deprioritizes (does not block) below the unavailable circuit threshold', () => {
    const decision = getImageProviderRoutingDecision(
      buildRecord({
        unavailableCount:
          IMAGE_PROVIDER_HEALTH_THRESHOLDS.unavailableCircuitCount - 1,
        healthState: 'degraded'
      })
    );

    expect(decision.blocked).toBe(false);
    expect(decision.deprioritized).toBe(true);
    expect(decision.reason).toBe('unavailable');
  });

  it('keeps a healthy route unblocked', () => {
    const decision = getImageProviderRoutingDecision(
      buildRecord({
        unavailableCount: 0,
        healthScore: 95,
        healthState: 'healthy',
        totalAttempts: 10,
        succeededAttempts: 9,
        failedAttempts: 1,
        successRate: 0.9
      })
    );

    expect(decision.blocked).toBe(false);
    expect(decision.deprioritized).toBe(false);
  });

  it('blocks a model when unavailable counts aggregate across channels', () => {
    const healthLookup = new Map<string, ImageProviderHealthRecord>();
    for (const channel of ['default', 'official', 'openai_original']) {
      healthLookup.set(`tuzi::seedream-5-0-lite::${channel}`, {
        provider: 'tuzi',
        model: 'seedream-5-0-lite',
        channel,
        totalAttempts: 3,
        succeededAttempts: 0,
        failedAttempts: 3,
        runningAttempts: 0,
        successRate: 0,
        avgDurationMs: 300,
        p95DurationMs: 700,
        authErrorCount: 0,
        rateLimitCount: 0,
        timeoutCount: 0,
        unavailableCount: 1,
        policyCount: 0,
        lastFailureAt: '2026-08-11T00:00:00.000Z',
        lastSuccessAt: null,
        healthScore: 20,
        healthState: 'degraded',
        circuitBreakerUntil: null
      });
    }

    expect(
      isModelUnavailableBlocked(
        { provider: 'tuzi', model: 'seedream-5-0-lite' },
        healthLookup
      )
    ).toBe(true);
    expect(
      isModelUnavailableBlocked(
        { provider: 'tuzi', model: 'gpt-image-2' },
        healthLookup
      )
    ).toBe(false);
  });

  it('does not block a model below the aggregate threshold', () => {
    const healthLookup = new Map<string, ImageProviderHealthRecord>([
      [
        'tuzi::wan-image-2.7-pro::default',
        {
          provider: 'tuzi',
          model: 'wan-image-2.7-pro',
          channel: 'default',
          totalAttempts: 3,
          succeededAttempts: 0,
          failedAttempts: 3,
          runningAttempts: 0,
          successRate: 0,
          avgDurationMs: 300,
          p95DurationMs: 500,
          authErrorCount: 0,
          rateLimitCount: 0,
          timeoutCount: 0,
          unavailableCount: 2,
          policyCount: 0,
          lastFailureAt: '2026-08-11T00:00:00.000Z',
          lastSuccessAt: null,
          healthScore: 30,
          healthState: 'degraded',
          circuitBreakerUntil: null
        }
      ]
    ]);

    expect(
      isModelUnavailableBlocked(
        { provider: 'tuzi', model: 'wan-image-2.7-pro' },
        healthLookup
      )
    ).toBe(false);
  });
});
