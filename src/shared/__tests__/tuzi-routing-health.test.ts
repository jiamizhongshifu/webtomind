import { describe, expect, it } from 'vitest';
import type { ImageProviderHealthRecord } from '../../../api/image/provider-health';
import {
  rankTuziAttemptsByProviderHealth,
  type TuziImageAttempt
} from '../../../api/image/generate/tuzi-routing';
import { getImageProviderHealthKey } from '../../../api/image/provider-health';

function attempt(channel: TuziImageAttempt['channel']): TuziImageAttempt {
  return {
    modelId: 'gpt-image-2',
    model: 'gpt-image-2',
    channel,
    apiKey: 'test-key',
    apiBaseUrl: `https://${channel}.test`
  };
}

function health(
  channel: TuziImageAttempt['channel'],
  overrides: Partial<ImageProviderHealthRecord> = {}
): ImageProviderHealthRecord {
  return {
    provider: 'tuzi',
    model: 'gpt-image-2',
    channel,
    totalAttempts: 8,
    succeededAttempts: 0,
    failedAttempts: 8,
    runningAttempts: 0,
    successRate: 0,
    avgDurationMs: 1000,
    p95DurationMs: 1000,
    authErrorCount: 0,
    rateLimitCount: 0,
    timeoutCount: 0,
    unavailableCount: 8,
    policyCount: 0,
    lastFailureAt: '2026-07-23T00:00:00.000Z',
    lastSuccessAt: null,
    healthScore: 0,
    healthState: 'degraded',
    circuitBreakerUntil: null,
    ...overrides
  };
}

describe('Tuzi provider-health routing', () => {
  it('skips sufficiently sampled zero-score fallback routes', () => {
    // Keep the model-level unavailable total below the circuit threshold so
    // this case isolates the fallback-route skip rather than the model-wide
    // block that would also remove the healthy default channel.
    const unavailable = health('official', { unavailableCount: 2 });
    const healthy = health('default', {
      succeededAttempts: 8,
      failedAttempts: 0,
      successRate: 1,
      unavailableCount: 0,
      healthScore: 100,
      healthState: 'healthy',
      lastSuccessAt: '2026-07-23T00:00:00.000Z'
    });
    const lookup = new Map([
      [getImageProviderHealthKey(unavailable), unavailable],
      [getImageProviderHealthKey(healthy), healthy]
    ]);

    expect(
      rankTuziAttemptsByProviderHealth(
        [attempt('official'), attempt('default')],
        lookup
      ).map((item) => item.channel)
    ).toEqual(['default']);
  });

  it('returns no attempt when every route is known unhealthy', () => {
    const official = health('official');
    const fallback = health('default');
    const lookup = new Map([
      [getImageProviderHealthKey(official), official],
      [getImageProviderHealthKey(fallback), fallback]
    ]);
    const plan = [attempt('official'), attempt('default')];

    expect(rankTuziAttemptsByProviderHealth(plan, lookup)).toEqual([]);
  });

  it('skips a zero-success route after the minimum sample even before its score reaches zero', () => {
    const zeroSuccess = health('official', {
      totalAttempts: 3,
      failedAttempts: 3,
      unavailableCount: 1,
      healthScore: 40,
      healthState: 'degraded'
    });
    const lookup = new Map([
      [getImageProviderHealthKey(zeroSuccess), zeroSuccess]
    ]);

    expect(
      rankTuziAttemptsByProviderHealth([attempt('official')], lookup)
    ).toEqual([]);
  });

  it('blocks a low-volume unavailable model across its Tuzi channels', () => {
    const channels: TuziImageAttempt['channel'][] = [
      'default',
      'official',
      'openai_original'
    ];
    const lookup = new Map(
      channels.map((channel) => {
        const record = health(channel, {
          totalAttempts: 1,
          failedAttempts: 1,
          unavailableCount: 1
        });
        return [
          getImageProviderHealthKey({ ...record, model: 'seedream-5-0-lite' }),
          { ...record, model: 'seedream-5-0-lite' }
        ] as const;
      })
    );
    const plan = channels.map((channel) => ({
      ...attempt(channel),
      modelId: 'seedream-5-0-lite' as TuziImageAttempt['modelId'],
      model: 'seedream-5-0-lite'
    }));

    expect(rankTuziAttemptsByProviderHealth(plan, lookup)).toEqual([]);
  });
});
