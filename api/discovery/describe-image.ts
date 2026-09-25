import { getUserIdFromRequest } from '../utils/auth.js';
import {
  createJsonResponder,
  estimateBase64Bytes,
  MAX_PROMPT_ASSET_IMAGE_BYTES,
  parseBase64Payload
} from '../prompt-assets/user/worker-compat.js';
import { analyzeDiscoveryImageForSearch } from './visual-search-analysis.js';
import {
  checkRateLimit,
  createRateLimitHeaders,
  DISCOVERY_IMAGE_ANALYSIS_RATE_LIMIT
} from '../utils/rate-limiter.js';

/** Convert a transient search image into text without persisting the file. */
export default async function describeDiscoveryImage(
  request: Request
): Promise<Response> {
  const { corsHeaders, jsonResponse } = createJsonResponder(request);
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return jsonResponse({ error: '请先登录后使用图片搜索' }, 401);
  }

  const rateLimit = checkRateLimit(
    userId,
    DISCOVERY_IMAGE_ANALYSIS_RATE_LIMIT
  );
  if (!rateLimit.allowed) {
    return new Response(
      JSON.stringify({
        error: '图片识别请求过于频繁，请稍后再试',
        retryAfter: rateLimit.retryAfter
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
          ...createRateLimitHeaders(rateLimit)
        }
      }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    imageBase64?: string;
    mimeType?: string;
    locale?: string;
  };
  const parsed = parseBase64Payload(body.imageBase64 || '');
  const mimeType = body.mimeType || parsed?.mimeType || '';
  if (!parsed || !mimeType.startsWith('image/')) {
    return jsonResponse({ error: '图片数据格式错误' }, 400);
  }
  if (estimateBase64Bytes(parsed.base64) > MAX_PROMPT_ASSET_IMAGE_BYTES) {
    return jsonResponse({ error: '图片超过大小限制' }, 413);
  }

  try {
    const descriptor = await analyzeDiscoveryImageForSearch({
      base64: parsed.base64,
      mimeType,
      locale: body.locale === 'en-US' ? 'en-US' : 'zh-CN',
      signal: request.signal
    });
    const { description } = descriptor;
    if (!description) {
      return jsonResponse(
        { error: '暂时无法识别这张图片，请尝试文本搜索' },
        422
      );
    }
    return jsonResponse({ success: true, ...descriptor }, 200);
  } catch (error) {
    console.error('[DiscoveryDescribeImage] reverse failed', error);
    return jsonResponse({ error: '图片识别暂时不可用，请稍后重试' }, 502);
  }
}
