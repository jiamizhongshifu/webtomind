import { getCorsHeadersForRequest } from '../utils/auth.js';
import { getSeedanceVideoModels } from '../../src/shared/seedance-video-models.js';
import {
  isArkVideoGenerationAvailable,
  isArkVideoGenerationEnabled,
  isArkVideoLaunchEnabled
} from '../../src/shared/ark-video-api.js';

export const config = { runtime: 'edge' };

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

  return jsonResponse(
    {
      enabled: isArkVideoGenerationAvailable(),
      message: isArkVideoGenerationAvailable()
        ? '视频生成通道已开启。'
        : '视频生成通道维护中，修复完成后再开放使用。',
      enablement: {
        generationEnabled: isArkVideoGenerationEnabled(),
        launchEnabled: isArkVideoLaunchEnabled()
      },
      models: getSeedanceVideoModels(process.env).map((model) => ({
        id: model.id,
        label: model.label,
        group: model.group,
        description: model.description,
        badges: model.badges,
        supportsTextToVideo: model.supportsTextToVideo,
        supportsImageToVideo: model.supportsImageToVideo,
        supportsReferenceVideo: model.supportsReferenceVideo,
        supportsReferenceAudio: model.supportsReferenceAudio,
        supportsGenerateAudio: model.supportsGenerateAudio,
        supportsWebSearch: model.supportsWebSearch,
        defaultGenerateAudio: model.defaultGenerateAudio,
        maxReferenceImages: model.maxReferenceImages,
        maxReferenceVideos: model.maxReferenceVideos,
        maxReferenceAudios: model.maxReferenceAudios,
        maxReferenceMediaDurationSeconds:
          model.maxReferenceMediaDurationSeconds,
        supportedDurations: model.supportedDurations,
        defaultDuration: model.defaultDuration,
        supportedAspectRatios: model.supportedAspectRatios,
        defaultAspectRatio: model.defaultAspectRatio,
        supportedResolutions: model.supportedResolutions,
        defaultResolution: model.defaultResolution,
        supportedOutputFormats: model.supportedOutputFormats,
        defaultOutputFormat: model.defaultOutputFormat,
        status: model.status
      }))
    },
    corsHeaders
  );
}
