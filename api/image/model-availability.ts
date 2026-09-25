import type { TuziImageModelConfig } from '../../src/shared/tuzi-image-models.js';
import {
  getImageProviderHealthKey,
  shouldSkipImageProviderFallbackRoute,
  type ImageProviderHealthRecord
} from './provider-health.js';
import type { TuziImageAttempt } from './generate/tuzi-routing.js';

export interface RuntimeImageRoute {
  provider: string;
  model: string;
  channel?: string | null;
}

export type RuntimeImageModelStatus = 'available' | 'degraded' | 'unavailable';

export interface RuntimeImageModelAvailability {
  status: RuntimeImageModelStatus;
  availabilityReason:
    | 'configured'
    | 'insufficient_health_data'
    | 'provider_degraded'
    | 'provider_not_configured'
    | 'all_routes_unhealthy';
  configuredRouteCount: number;
  healthyRouteCount: number;
}

export function resolveRuntimeImageModelAvailability(
  _model: TuziImageModelConfig,
  attempts: TuziImageAttempt[],
  healthLookup: Map<string, ImageProviderHealthRecord>,
  fallbackRoutes: RuntimeImageRoute[] = []
): RuntimeImageModelAvailability {
  const routes: RuntimeImageRoute[] = [
    ...attempts.map((attempt) => ({
      provider: 'tuzi',
      model: attempt.model,
      channel: attempt.channel
    })),
    ...fallbackRoutes
  ];
  if (routes.length === 0) {
    return {
      status: 'unavailable',
      availabilityReason: 'provider_not_configured',
      configuredRouteCount: 0,
      healthyRouteCount: 0
    };
  }

  const records = routes
    .map((route) => healthLookup.get(getImageProviderHealthKey(route)))
    .filter((record): record is ImageProviderHealthRecord => Boolean(record));
  const viableRoutes = routes.filter((route) => {
    const record = healthLookup.get(getImageProviderHealthKey(route));
    return !shouldSkipImageProviderFallbackRoute(record);
  });

  if (viableRoutes.length === 0) {
    return {
      status: 'unavailable',
      availabilityReason: 'all_routes_unhealthy',
      configuredRouteCount: routes.length,
      healthyRouteCount: 0
    };
  }

  if (records.length === 0) {
    return {
      status: 'available',
      availabilityReason: 'insufficient_health_data',
      configuredRouteCount: routes.length,
      healthyRouteCount: viableRoutes.length
    };
  }

  const degraded = records.some(
    (record) =>
      record.healthState === 'degraded' || record.healthState === 'circuit_open'
  );
  return {
    status: degraded ? 'degraded' : 'available',
    availabilityReason: degraded ? 'provider_degraded' : 'configured',
    configuredRouteCount: routes.length,
    healthyRouteCount: viableRoutes.length
  };
}
