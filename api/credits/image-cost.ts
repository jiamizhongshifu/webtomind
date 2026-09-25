/**
 * Vercel Serverless Function - /api/credits/image-cost
 *
 * 返回图片生成的当前积分价格。后端扣费使用 consume_credits(metadata.dynamicCredits),
 * 本接口用同一 shared pricing 公式给前端做预估。
 *
 * 无需鉴权:价格对所有用户一致且公开(credit_costs 有公开读 RLS 策略)。
 */

import { createClient } from '@supabase/supabase-js';
import { getCorsHeadersForRequest } from '../utils/auth';
import {
  estimateImageGenerationCreditCost,
  IMAGE_GENERATION_4K_CREDIT_COST,
  IMAGE_GENERATION_BASE_CREDIT_COST,
  IMAGE_GENERATION_LARGE_2K_CREDIT_COST
} from '../../src/shared/image-generation-pricing';

export const config = {
  runtime: 'edge'
};

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        // 价格变动不频繁,允许 CDN/浏览器缓存 5 分钟,降低请求量
        'Cache-Control': 'public, max-age=300',
        ...corsHeaders
      }
    });
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse({ error: 'Database not configured' }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const url = new URL(request.url);
    const model = url.searchParams.get('model') || undefined;
    const imageSize = url.searchParams.get('imageSize') || undefined;
    const quality = url.searchParams.get('quality') || undefined;
    const referenceMode = url.searchParams.get('referenceMode') || undefined;
    const referenceImageCount = Number(
      url.searchParams.get('referenceImageCount') || 0
    );
    let referenceImageSizes:
      | Array<{ width: number; height: number }>
      | undefined;
    try {
      const parsed = JSON.parse(
        url.searchParams.get('referenceImageSizes') || ''
      );
      if (Array.isArray(parsed)) {
        referenceImageSizes = parsed
          .filter(
            (item): item is { width: number; height: number } =>
              !!item &&
              typeof item === 'object' &&
              Number.isFinite(Number(item.width)) &&
              Number.isFinite(Number(item.height)) &&
              Number(item.width) > 0 &&
              Number(item.height) > 0
          )
          .map((item) => ({
            width: Math.floor(Number(item.width)),
            height: Math.floor(Number(item.height))
          }));
      }
    } catch {
      // 忽略非法尺寸参数，回退按张计费
    }
    const estimate = estimateImageGenerationCreditCost({
      model,
      imageSize,
      quality,
      referenceMode,
      referenceImageCount: Number.isFinite(referenceImageCount)
        ? referenceImageCount
        : 0,
      ...(referenceImageSizes && referenceImageSizes.length > 0
        ? { referenceImageSizes }
        : {})
    });

    const { data, error } = await supabase
      .from('credit_costs')
      .select('cost, min_cost, max_cost')
      .eq('action', 'image_generation')
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data || typeof data.cost !== 'number') {
      return jsonResponse({ error: 'COST_UNAVAILABLE' }, 502);
    }

    const minCost =
      typeof data.min_cost === 'number'
        ? data.min_cost
        : IMAGE_GENERATION_BASE_CREDIT_COST;
    // Official-ready pricing can exceed the old single-image 4K ceiling when
    // high quality, references, or character consistency are selected.
    const cost = Math.max(estimate.cost, minCost);

    return jsonResponse({
      action: 'image_generation',
      cost,
      baseCost: data.cost,
      imageSize: estimate.imageSize,
      tier: estimate.tier,
      megapixels: estimate.megapixels,
      qualityAdjustment: estimate.qualityAdjustment,
      referenceAdjustment: estimate.referenceAdjustment,
      modeAdjustment: estimate.modeAdjustment,
      modelMultiplier: estimate.modelMultiplier,
      modelAdjustment: estimate.modelAdjustment,
      tiers: {
        base: IMAGE_GENERATION_BASE_CREDIT_COST,
        large2k: IMAGE_GENERATION_LARGE_2K_CREDIT_COST,
        fourK: IMAGE_GENERATION_4K_CREDIT_COST,
        legacyMax: data.max_cost
      }
    });
  } catch (err) {
    console.error('[ImageCost] query failed:', err);
    return jsonResponse({ error: 'COST_UNAVAILABLE' }, 502);
  }
}
