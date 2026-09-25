import { describe, expect, it, vi } from 'vitest';
import {
  buildImageProviderHealthLookup,
  fetchImageProviderHealth,
  getImageProviderHealthKey,
  getImageProviderRoutingDecision,
  safeFetchImageProviderHealth,
  shouldSkipImageProviderFallbackRoute,
  type ImageProviderHealthRecord
} from '../../api/image/provider-health';

function makeHealthRecord(
  overrides: Partial<ImageProviderHealthRecord> = {}
): ImageProviderHealthRecord {
  return {
    provider: 'tuzi',
    model: 'gpt-image-2',
    channel: 'official',
    totalAttempts: 10,
    succeededAttempts: 9,
    failedAttempts: 1,
    runningAttempts: 0,
    successRate: 0.9,
    avgDurationMs: 80_000,
    p95DurationMs: 120_000,
    authErrorCount: 0,
    rateLimitCount: 0,
    timeoutCount: 0,
    unavailableCount: 0,
    policyCount: 0,
    lastFailureAt: null,
    lastSuccessAt: '2026-06-16T10:00:00.000Z',
    healthScore: 90,
    healthState: 'healthy',
    circuitBreakerUntil: null,
    ...overrides
  };
}

describe('image provider health', () => {
  it('normalizes provider health RPC rows', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          provider: 'tuzi',
          model: 'gpt-image-2',
          channel: 'official',
          total_attempts: '4',
          succeeded_attempts: '3',
          failed_attempts: '1',
          running_attempts: '0',
          success_rate: '0.7500',
          avg_duration_ms: '81000.00',
          p95_duration_ms: 120000,
          auth_error_count: '0',
          rate_limit_count: '1',
          timeout_count: '0',
          unavailable_count: '0',
          policy_count: '0',
          last_failure_at: '2026-06-16T10:00:00.000Z',
          last_success_at: '2026-06-16T10:01:00.000Z',
          health_score: '65.50',
          health_state: 'degraded',
          circuit_breaker_until: null
        }
      ],
      error: null
    });
    const rows = await fetchImageProviderHealth({ rpc } as never, {
      windowMinutes: 30,
      minAttempts: 2
    });

    expect(rpc).toHaveBeenCalledWith('get_image_provider_health', {
      p_window: '30 minutes',
      p_min_attempts: 2
    });
    expect(rows[0]).toMatchObject({
      provider: 'tuzi',
      model: 'gpt-image-2',
      channel: 'official',
      totalAttempts: 4,
      successRate: 0.75,
      avgDurationMs: 81000,
      healthScore: 65.5,
      healthState: 'degraded'
    });
  });

  it('uses a 24 hour default window so dormant broken routes stay isolated', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    await fetchImageProviderHealth({ rpc } as never);
    expect(rpc).toHaveBeenCalledWith('get_image_provider_health', {
      p_window: '1440 minutes',
      p_min_attempts: 3
    });
  });

  it('builds stable provider/model/channel lookup keys', () => {
    const rows = [
      makeHealthRecord({ channel: 'official' }),
      makeHealthRecord({ channel: null, healthScore: 72 })
    ];
    const lookup = buildImageProviderHealthLookup(rows);

    expect(
      lookup.get(
        getImageProviderHealthKey({
          provider: 'tuzi',
          model: 'gpt-image-2',
          channel: 'official'
        })
      )?.healthScore
    ).toBe(90);
    expect(
      lookup.get(
        getImageProviderHealthKey({
          provider: 'tuzi',
          model: 'gpt-image-2',
          channel: null
        })
      )?.healthScore
    ).toBe(72);
  });

  it('turns auth circuit state into a hard block', () => {
    const decision = getImageProviderRoutingDecision(
      makeHealthRecord({
        authErrorCount: 2,
        healthScore: 0,
        healthState: 'circuit_open',
        circuitBreakerUntil: '2026-06-16T10:30:00.000Z'
      })
    );

    expect(decision).toEqual({
      blocked: true,
      deprioritized: true,
      reason: 'auth_circuit',
      score: 0,
      circuitBreakerUntil: '2026-06-16T10:30:00.000Z'
    });
  });

  it('deprioritizes noisy but non-auth routes', () => {
    expect(
      getImageProviderRoutingDecision(
        makeHealthRecord({ rateLimitCount: 3, healthScore: 58 })
      )
    ).toMatchObject({
      blocked: false,
      deprioritized: true,
      reason: 'rate_limit'
    });

    expect(
      getImageProviderRoutingDecision(
        makeHealthRecord({ totalAttempts: 6, timeoutCount: 2, healthScore: 70 })
      )
    ).toMatchObject({ blocked: false, deprioritized: true, reason: 'timeout' });
  });

  it('hard-skips a repeatedly exhausted route with a zero health score', () => {
    expect(
      shouldSkipImageProviderFallbackRoute(
        makeHealthRecord({
          totalAttempts: 43,
          succeededAttempts: 0,
          failedAttempts: 43,
          successRate: 0,
          unavailableCount: 42,
          healthScore: 0,
          healthState: 'degraded'
        })
      )
    ).toBe(true);
  });

  it('fails open when the health RPC is unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const rows = await safeFetchImageProviderHealth({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'function not found' }
      })
    } as never);

    expect(rows).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
