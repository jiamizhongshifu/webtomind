import type { SupabaseClient } from '@supabase/supabase-js';
import { getConfiguredTuziApiModel } from './generate/tuzi-routing.js';
import type { TuziImageModelId } from '../../src/shared/tuzi-image-models.js';

import { isImageModelConfigurationError } from './providers/policy-error.js';
export { isImageModelConfigurationError } from './providers/policy-error.js';

export type ImageModelReadiness =
  | 'ready'
  | 'configuration_required'
  | 'unknown';

/** Configuration failures do not heal when a rolling health window expires.
 * A later successful attempt is the evidence that the provider was repaired.
 * Query only configuration failures and successes, never users' prompts.
 */
export async function getImageModelReadiness(
  sb: SupabaseClient,
  model: TuziImageModelId
): Promise<ImageModelReadiness> {
  try {
    const { data, error } = await sb
      .from('image_generation_attempts')
      .select('status,error_message')
      .eq('provider', 'tuzi')
      .eq('model', getConfiguredTuziApiModel(model))
      .or(
        'status.eq.succeeded,and(status.eq.failed,or(error_message.ilike.*not been priced*,error_message.ilike.*not priced*,error_message.ilike.*价格尚未*配置*,error_message.ilike.*未配置价格*))'
      )
      .order('started_at', { ascending: false })
      .limit(1);
    if (error) return 'unknown';
    const latest = data?.[0];
    return latest?.status === 'failed' &&
      isImageModelConfigurationError(latest.error_message || '')
      ? 'configuration_required'
      : 'ready';
  } catch {
    return 'unknown';
  }
}

export function imageModelReadinessFailure(readiness: ImageModelReadiness) {
  if (readiness === 'ready') return null;
  const configurationRequired = readiness === 'configuration_required';
  return {
    error: configurationRequired
      ? 'IMAGE_MODEL_CONFIGURATION_REQUIRED'
      : 'IMAGE_MODEL_READINESS_UNAVAILABLE',
    message: configurationRequired
      ? '该模型的上游价格尚未配置，暂时无法生成。请切换其他可用模型；本次未扣费。'
      : '暂时无法确认模型可用性，请稍后重试；本次未扣费。',
    errorDetails: {
      code: configurationRequired
        ? 'IMAGE_MODEL_CONFIGURATION_REQUIRED'
        : 'IMAGE_MODEL_READINESS_UNAVAILABLE',
      category: configurationRequired
        ? 'provider_configuration'
        : 'provider_unavailable',
      retryable: !configurationRequired
    }
  };
}
