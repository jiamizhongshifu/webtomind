import { getSupabaseAdmin } from './auth';

export interface ModelRateLimitResult {
  allowed: boolean;
  status: 200 | 429 | 503;
  retryAfter: number;
  remaining?: number;
  error?: string;
}

export async function consumeModelRateLimit(input: {
  userId: string;
  bucket: string;
  maxRequests: number;
  windowSeconds?: number;
}): Promise<ModelRateLimitResult> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return {
      allowed: false,
      status: 503,
      retryAfter: 30,
      error: 'RATE_LIMIT_SERVICE_UNAVAILABLE'
    };
  }

  const windowSeconds = input.windowSeconds ?? 60;
  const { data, error } = await admin.rpc('consume_model_rate_limit', {
    p_user_id: input.userId,
    p_bucket: input.bucket,
    p_window_seconds: windowSeconds,
    p_max_requests: input.maxRequests
  });

  if (error || !data || typeof data.allowed !== 'boolean') {
    console.error('[ModelRateLimit] consume failed:', error || 'invalid RPC response');
    return {
      allowed: false,
      status: 503,
      retryAfter: 30,
      error: 'RATE_LIMIT_SERVICE_UNAVAILABLE'
    };
  }

  const retryAfter = Math.max(1, Number(data.retry_after) || windowSeconds);
  return data.allowed
    ? {
        allowed: true,
        status: 200,
        retryAfter,
        remaining: Math.max(0, Number(data.remaining) || 0)
      }
    : {
        allowed: false,
        status: 429,
        retryAfter,
        remaining: 0,
        error: 'RATE_LIMITED'
      };
}

export function createModelRateLimitResponse(
  result: ModelRateLimitResult,
  corsHeaders: Record<string, string>
): Response {
  return new Response(
    JSON.stringify({
      error: result.error || 'RATE_LIMITED',
      retryAfter: result.retryAfter
    }),
    {
      status: result.status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': String(result.retryAfter)
      }
    }
  );
}
