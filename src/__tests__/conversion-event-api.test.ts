import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../../api/analytics/conversion-event';
import { recordConversionEvent } from '../../api/utils/conversion-events';

vi.mock('../../api/utils/auth', () => ({
  getCorsHeadersForRequest: () => ({ 'Access-Control-Allow-Origin': '*' })
}));

vi.mock('../../api/utils/conversion-events', () => ({
  recordConversionEvent: vi.fn(async () => undefined)
}));

function request(
  body: Record<string, unknown>,
  options: { authenticated?: boolean; origin?: string; url?: string } = {}
) {
  const authenticated = options.authenticated !== false;
  return new Request(
    options.url || 'https://webtomind.test/api/analytics/conversion-event',
    {
      method: 'POST',
      headers: {
        ...(authenticated ? { Authorization: 'Bearer test-token' } : {}),
        ...(options.origin ? { Origin: options.origin } : {}),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }
  );
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe('conversion event API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = 'https://supabase.test';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              id: 'user-1',
              aud: 'authenticated',
              role: 'authenticated'
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            }
          )
      )
    );
  });

  it('records durable pricing funnel events for authenticated users', async () => {
    const response = await handler(
      request({
        eventName: 'pricing_cta_click',
        entityType: 'pricing_cta',
        entityId: 'pack_1k',
        productType: 'credit_package',
        productId: 'pack_1k',
        ctaSource: 'low_balance',
        idempotencyKey: 'pricing_cta:pack_1k',
        metadata: {
          pricing_mode: 'payg',
          checkout_type: 'credit_package'
        }
      })
    );
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(recordConversionEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventName: 'pricing_cta_click',
        eventSource: 'web_client',
        userId: 'user-1',
        entityType: 'pricing_cta',
        entityId: 'pack_1k',
        productType: 'credit_package',
        productId: 'pack_1k',
        ctaSource: 'low_balance',
        idempotencyKey: 'pricing_cta_click:user-1:pricing_cta:pack_1k',
        metadata: expect.objectContaining({
          pricing_mode: 'payg',
          checkout_type: 'credit_package'
        })
      })
    );
  });

  it('bridges the pre-login anonymous session to the authenticated user', async () => {
    const response = await handler(
      request({
        eventName: 'identity_linked',
        entityType: 'user',
        entityId: 'user-1',
        anonymousId: 'anonymous-session-123456',
        sessionId: 'anonymous-session-123456',
        idempotencyKey: 'anonymous-session-123456',
        metadata: { authenticated: true }
      })
    );

    expect(response.status).toBe(200);
    expect(recordConversionEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventName: 'identity_linked',
        userId: 'user-1',
        anonymousId: 'anonymous-session-123456',
        sessionId: 'anonymous-session-123456',
        idempotencyKey: 'identity_linked:user-1:anonymous-session-123456'
      })
    );
  });

  it('records durable prompt detail events for authenticated users', async () => {
    const response = await handler(
      request({
        eventName: 'prompt_detail_use',
        entityType: 'prompt_case',
        entityId: 'case_123',
        ctaSource: 'prompt_detail_use',
        idempotencyKey: 'prompt_detail_use:case_123:12345',
        metadata: {
          locale: 'en-US',
          slug: 'cinematic-product-shot',
          category: 'product-images',
          target: 'create'
        }
      })
    );
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(recordConversionEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventName: 'prompt_detail_use',
        eventSource: 'web_client',
        userId: 'user-1',
        entityType: 'prompt_case',
        entityId: 'case_123',
        ctaSource: 'prompt_detail_use',
        idempotencyKey:
          'prompt_detail_use:user-1:prompt_detail_use:case_123:12345',
        metadata: expect.objectContaining({
          locale: 'en-US',
          slug: 'cinematic-product-shot',
          target: 'create'
        })
      })
    );
  });

  it('records durable prompt preview events for authenticated users', async () => {
    const response = await handler(
      request({
        eventName: 'prompt_preview_copy',
        entityType: 'prompt_case',
        entityId: 'case_123',
        ctaSource: 'prompt_preview_copy',
        idempotencyKey: 'prompt_preview_copy:case_123:12345',
        metadata: {
          caseId: 'case_123',
          caseSlug: 'cinematic-product-shot',
          model: 'gpt-image-2',
          package: 'ecommerce-product-photo',
          source: 'prompt_preview_copy',
          path: '/ai-image-prompts?utm_source=seo',
          locale: 'en-US',
          copySuccess: false,
          failureReason: 'clipboard_unavailable_or_denied'
        }
      })
    );
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(recordConversionEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventName: 'prompt_preview_copy',
        eventSource: 'web_client',
        userId: 'user-1',
        entityType: 'prompt_case',
        entityId: 'case_123',
        ctaSource: 'prompt_preview_copy',
        idempotencyKey:
          'prompt_preview_copy:user-1:prompt_preview_copy:case_123:12345',
        metadata: expect.objectContaining({
          caseId: 'case_123',
          caseSlug: 'cinematic-product-shot',
          copySuccess: false,
          failureReason: 'clipboard_unavailable_or_denied'
        })
      })
    );
  });

  it('records privacy-safe prompt events for anonymous production sessions', async () => {
    const response = await handler(
      request(
        {
          eventName: 'prompt_preview_use',
          entityType: 'prompt_case',
          entityId: 'case_123',
          ctaSource: 'prompt_preview_use',
          anonymousId: 'anonymous-session-123456',
          sessionId: 'anonymous-session-123456',
          idempotencyKey: 'prompt_preview_use:case_123:12345',
          metadata: {
            caseId: 'case_123',
            caseSlug: 'cinematic-product-shot',
            canonicalPath: '/ai-image-prompts?utm_source=private-value',
            path: '/ai-image-prompts?q=private-value',
            referrer: 'https://search.example/private-query',
            target: 'create'
          }
        },
        {
          authenticated: false,
          origin: 'https://webtomind.com',
          url: 'https://webtomind.com/api/analytics/conversion-event'
        }
      )
    );

    expect(response.status).toBe(200);
    expect(recordConversionEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventName: 'prompt_preview_use',
        eventSource: 'web_client_anonymous',
        userId: undefined,
        anonymousId: 'anonymous-session-123456',
        sessionId: 'anonymous-session-123456',
        idempotencyKey:
          'prompt_preview_use:anonymous:anonymous-session-123456:prompt_preview_use:case_123:12345',
        metadata: {
          caseId: 'case_123',
          caseSlug: 'cinematic-product-shot',
          canonical_path: '/ai-image-prompts',
          path: '/ai-image-prompts',
          target: 'create'
        }
      })
    );
  });

  it('rejects anonymous events outside the production same-origin boundary', async () => {
    const response = await handler(
      request(
        {
          eventName: 'prompt_detail_view',
          anonymousId: 'anonymous-session-123456',
          sessionId: 'anonymous-session-123456'
        },
        {
          authenticated: false,
          origin: 'https://preview.webtomind.pages.dev',
          url: 'https://webtomind.com/api/analytics/conversion-event'
        }
      )
    );

    expect(response.status).toBe(401);
    expect(recordConversionEvent).not.toHaveBeenCalled();
  });

  it('rejects unsupported client conversion events', async () => {
    const response = await handler(
      request({
        eventName: 'arbitrary_event'
      })
    );

    expect(response.status).toBe(400);
    expect(await readJson(response)).toMatchObject({
      error: 'Unsupported event'
    });
    expect(recordConversionEvent).not.toHaveBeenCalled();
  });
});
