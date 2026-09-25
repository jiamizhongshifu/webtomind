/**
 * Vercel Serverless Function - /api/credits/video-cost
 *
 * Public video-generation credit estimate. This shares the execution pricing
 * contract so the UI does not guess or hard-code provider-specific multipliers.
 */

import { getCorsHeadersForRequest } from '../utils/auth';
import {
  VIDEO_GENERATION_BASE_UNIT_CREDIT_COST,
  VIDEO_GENERATION_BASE_UNIT_SECONDS,
  VIDEO_GENERATION_MIN_CREDIT_COST,
  VIDEO_GENERATION_REFERENCE_VIDEO_SURCHARGE,
  estimateVideoGenerationCreditCost
} from '../../src/shared/video-generation-pricing';

export const config = {
  runtime: 'edge'
};

function jsonResponse(
  data: unknown,
  corsHeaders: Record<string, string>,
  status = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
      ...corsHeaders
    }
  });
}

function parseCount(value: string | null): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
  }

  const url = new URL(request.url);
  const duration = Number(url.searchParams.get('duration') || 0);
  const referenceVideoDurations = (
    url.searchParams.get('referenceVideoDurations') || ''
  )
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
  const estimate = estimateVideoGenerationCreditCost({
    model: url.searchParams.get('model') || undefined,
    duration: Number.isFinite(duration) && duration > 0 ? duration : undefined,
    resolution: url.searchParams.get('resolution') || undefined,
    referenceImageCount: parseCount(
      url.searchParams.get('referenceImageCount')
    ),
    referenceVideoCount: parseCount(url.searchParams.get('referenceVideoCount')),
    referenceVideoDurations:
      referenceVideoDurations.length > 0
        ? referenceVideoDurations
        : undefined,
    referenceAudioCount: parseCount(url.searchParams.get('referenceAudioCount'))
  });

  return jsonResponse(
    {
      action: 'video_generation',
      ...estimate,
      tiers: {
        baseUnitSeconds: VIDEO_GENERATION_BASE_UNIT_SECONDS,
        baseUnitCost: VIDEO_GENERATION_BASE_UNIT_CREDIT_COST,
        referenceImage: 0,
        referenceVideo: VIDEO_GENERATION_REFERENCE_VIDEO_SURCHARGE,
        minCost: VIDEO_GENERATION_MIN_CREDIT_COST
      }
    },
    corsHeaders
  );
}
