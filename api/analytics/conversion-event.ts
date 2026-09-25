import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCorsHeadersForRequest } from '../utils/auth';
import { recordConversionEvent } from '../utils/conversion-events';

export const config = {
  runtime: 'edge'
};

const ALLOWED_EVENTS = new Set([
  'pricing_view',
  'pricing_item_view',
  'pricing_promo_view',
  'pricing_cta_click',
  'pricing_mode_change',
  'pricing_bulk_packages_expand',
  'identity_linked',
  'checkout_session_create_failed',
  'post_purchase_return',
  'prompt_detail_view',
  'prompt_detail_unlock_click',
  'prompt_detail_copy',
  'prompt_detail_use',
  'prompt_preview_view',
  'prompt_preview_copy',
  'prompt_preview_use'
]);

const ANONYMOUS_ALLOWED_EVENTS = new Set([
  'prompt_detail_view',
  'prompt_detail_copy',
  'prompt_detail_use',
  'prompt_preview_view',
  'prompt_preview_copy',
  'prompt_preview_use'
]);

const ANONYMOUS_METADATA_KEYS = new Set([
  'caseId',
  'caseSlug',
  'slug',
  'model',
  'package',
  'source',
  'path',
  'canonicalPath',
  'locale',
  'pageType',
  'pageSlug',
  'authenticated',
  'can_view_prompt',
  'locked',
  'member_only',
  'target',
  'copySuccess',
  'failureReason',
  'traffic_type',
  'test_run_id'
]);

function cleanString(value: unknown, maxLength = 500): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function cleanPath(value: unknown): string | undefined {
  const text = cleanString(value, 500);
  if (!text) return undefined;
  try {
    const parsed = new URL(text, 'https://webtomind.com');
    return parsed.pathname.startsWith('/')
      ? parsed.pathname.slice(0, 500)
      : undefined;
  } catch {
    return undefined;
  }
}

function cleanMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const trafficType =
    input.traffic_type === 'internal_test' ? 'internal_test' : undefined;
  const testRunId = cleanString(input.test_run_id, 120);
  return {
    ...input,
    ...(trafficType ? { traffic_type: trafficType } : {}),
    ...(testRunId ? { test_run_id: testRunId } : {})
  };
}

function cleanAnonymousMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, rawValue] of Object.entries(input)) {
    if (!ANONYMOUS_METADATA_KEYS.has(key)) continue;
    if (key === 'path' || key === 'canonicalPath') {
      const path = cleanPath(rawValue);
      if (path) {
        output[key === 'canonicalPath' ? 'canonical_path' : key] = path;
      }
      continue;
    }
    if (typeof rawValue === 'boolean' || typeof rawValue === 'number') {
      output[key] = rawValue;
      continue;
    }
    const text = cleanString(rawValue, 300);
    if (text) output[key] = text;
  }
  return output;
}

function getConversionEventClient(
  fallback?: SupabaseClient
): SupabaseClient | undefined {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return fallback;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function isTrustedAnonymousRequest(request: Request): boolean {
  const requestHost = new URL(request.url).hostname.toLowerCase();
  if (requestHost !== 'webtomind.com' && requestHost !== 'www.webtomind.com') {
    return false;
  }
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  try {
    const originUrl = new URL(origin);
    return (
      originUrl.protocol === 'https:' &&
      (originUrl.hostname === 'webtomind.com' ||
        originUrl.hostname === 'www.webtomind.com')
    );
  } catch {
    return false;
  }
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const eventName = cleanString(body.eventName, 120);
  const authHeader = request.headers.get('Authorization');
  if (!eventName || !ALLOWED_EVENTS.has(eventName)) {
    if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);
    return jsonResponse({ error: 'Unsupported event' }, 400);
  }

  let authSupabase: SupabaseClient | undefined;
  let userId: string | undefined;
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '');
    authSupabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_ANON_KEY || '',
      {
        global: { headers: { Authorization: `Bearer ${token}` } }
      }
    );
    const {
      data: { user },
      error: authError
    } = await authSupabase.auth.getUser(token);
    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    userId = user.id;
  }

  const sessionId = cleanString(body.sessionId, 160);
  const anonymousId = cleanString(body.anonymousId, 160);
  const isAnonymous = !userId;
  if (
    isAnonymous &&
    (!ANONYMOUS_ALLOWED_EVENTS.has(eventName) ||
      !sessionId ||
      !anonymousId ||
      sessionId !== anonymousId ||
      !isTrustedAnonymousRequest(request))
  ) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const conversionClient = getConversionEventClient(authSupabase);
  if (!conversionClient) {
    return jsonResponse({ error: 'Conversion service unavailable' }, 503);
  }

  const orderId = cleanString(body.orderId, 120);
  const rawIdempotencyKey = cleanString(body.idempotencyKey, 180);
  const identityKey = userId || `anonymous:${sessionId}`;
  await recordConversionEvent(conversionClient, {
    eventName,
    eventSource: isAnonymous ? 'web_client_anonymous' : 'web_client',
    userId,
    anonymousId:
      isAnonymous || eventName === 'identity_linked'
        ? anonymousId
        : undefined,
    sessionId,
    entityType: cleanString(body.entityType, 80),
    entityId: cleanString(body.entityId, 160),
    orderId,
    productType: cleanString(body.productType, 80),
    productId: cleanString(body.productId, 160),
    ctaSource: cleanString(body.ctaSource, 120),
    idempotencyKey: rawIdempotencyKey
      ? `${eventName}:${identityKey}:${rawIdempotencyKey}`
      : orderId
        ? `${eventName}:${identityKey}:${orderId}`
        : `${eventName}:${identityKey}:${Date.now()}`,
    metadata: isAnonymous
      ? cleanAnonymousMetadata(body.metadata)
      : cleanMetadata(body.metadata)
  });

  return jsonResponse({ success: true });
}
