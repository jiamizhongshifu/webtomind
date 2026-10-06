import { getImageModelReadiness } from './model-readiness.js';
import { supportsImageMaskEditing } from './generate.js';
import { sanitizeImageGenerateInput } from './generate/request.js';
import { getCorsHeadersForRequest, getSupabaseAdmin } from '../utils/auth.js';
import {
  TUZI_IMAGE_MODELS,
  isGptImage25Model,
  isSupportedChaoGptImage25ApiModel
} from '../../src/shared/tuzi-image-models.js';
import {
  buildImageProviderHealthLookup,
  safeFetchImageProviderHealth
} from './provider-health.js';
import { buildTuziImageAttemptPlan } from './generate/tuzi-routing.js';
import { resolveRuntimeImageModelAvailability } from './model-availability.js';
import { resolveOpenAICompatibleImageConfig } from './providers/openai-compatible-image.js';
import {
  KRILL_IMAGE_CHANNEL,
  getEnabledKrillImageModels
} from './generate/krill-routing.js';

export const config = { runtime: 'edge' };

function isTruthyEnv(value: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test((value || '').trim());
}

function getRuntimeFallbackRoutes(modelId: string) {
  if (isGptImage25Model(modelId)) {
    const openAICompatible = resolveOpenAICompatibleImageConfig();
    let isChaojitudou = false;
    try {
      isChaojitudou =
        new URL(openAICompatible.apiBaseUrl || '').hostname ===
        'api.chaojitudou.com';
    } catch {
      isChaojitudou = false;
    }
    return openAICompatible.enabled &&
      openAICompatible.apiBaseUrl &&
      openAICompatible.apiKey &&
      isSupportedChaoGptImage25ApiModel(openAICompatible.model) &&
      isChaojitudou
      ? [
          {
            provider: 'openai',
            model: openAICompatible.model,
            channel: 'openai-compatible'
          }
        ]
      : [];
  }
  if (modelId !== 'gpt-image-2') return [];
  const routes = [];
  if (
    !isTruthyEnv(process.env.OPENAI_COMPAT_IMAGE_DISABLE_KRILL_FALLBACK) &&
    Boolean(process.env.KRILL_IMAGE_API_KEY || process.env.KRILL_API_KEY)
  ) {
    routes.push(
      ...getEnabledKrillImageModels().map((model) => ({
        provider: 'krill',
        model,
        channel: KRILL_IMAGE_CHANNEL
      }))
    );
  }
  const openAICompatible = resolveOpenAICompatibleImageConfig();
  if (
    openAICompatible.enabled &&
    openAICompatible.apiBaseUrl &&
    openAICompatible.apiKey &&
    openAICompatible.model
  ) {
    routes.push({
      provider: 'openai',
      model: openAICompatible.model,
      channel: 'openai-compatible'
    });
  }
  return routes;
}

function jsonResponse(
  data: unknown,
  corsHeaders: Record<string, string>,
  status = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
  }

  const supabase = getSupabaseAdmin();
  const healthRecords = supabase
    ? await safeFetchImageProviderHealth(supabase, { minAttempts: 1 })
    : [];
  const healthLookup = buildImageProviderHealthLookup(healthRecords);
  const models = await Promise.all(
    TUZI_IMAGE_MODELS.map(async (model) => {
      const attempts = buildTuziImageAttemptPlan(model.id, {
        imageCount: 1,
        imageSize: model.recommendedImageSizes[0]
      });
      const readiness =
        attempts.length === 0
          ? 'ready'
          : supabase
            ? await getImageModelReadiness(supabase, model.id)
            : 'unknown';
      return {
        id: model.id,
        label: model.label,
        provider: model.provider,
        supportsTextToImage: model.supportsTextToImage,
        supportsReferenceImage: model.supportsReferenceImage,
        supportsMaskEditing: (() => {
          const input = sanitizeImageGenerateInput({
            model: model.id,
            prompt: 'Check selection editing support'
          });
          return input.ok && supportsImageMaskEditing(input.value);
        })(),
        supportsMultipleImages: model.supportsMultipleImages,
        maxImageCount: model.maxImageCount,
        maxReferenceImages: model.maxReferenceImages,
        referenceTransport: model.referenceTransport,
        preferredResponseFormat: model.preferredResponseFormat,
        allowProviderFallback: model.allowProviderFallback,
        group: model.group,
        description: model.description,
        badges: model.badges,
        recommendedImageSizes: model.recommendedImageSizes,
        creditMultiplier: model.creditMultiplier,
        ...resolveRuntimeImageModelAvailability(
          model,
          attempts,
          healthLookup,
          getRuntimeFallbackRoutes(model.id)
        ),
        ...(readiness !== 'ready'
          ? {
              status: 'unavailable',
              availabilityReason:
                readiness === 'configuration_required'
                  ? 'provider_configuration_required'
                  : 'readiness_unavailable'
            }
          : {})
      };
    })
  );

  return jsonResponse(
    {
      enabled: models.some((model) => model.status !== 'unavailable'),
      models
    },
    corsHeaders
  );
}
