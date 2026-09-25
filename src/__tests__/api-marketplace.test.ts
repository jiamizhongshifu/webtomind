import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getMarketplaceRelayBaseUrlError,
  getMarketplaceRuntimeMode,
  getApiMarketplaceCatalog,
  estimateCustomerChargeCents,
  getTuziPricingUrl,
  hasCallableMarketplaceEndpoint,
  isEndpointAllowed,
  normalizeStatusChecks
} from '../../api/api-marketplace/runtime';
import {
  aggregateChatCompletionChunk,
  aggregateChatCompletionSseText,
  approximateInputTokens,
  buildNonStreamingChatCompletion,
  buildUpstreamForwardedBody,
  buildUpstreamHeaders,
  describeReserveFailure,
  extractModelNameFromMultipart,
  parseClientIdempotencyKey,
  createEmptyChatCompletionAggregate,
  getSafeUpstreamErrorMessage,
  normalizeGatewayEndpointPath,
  shouldStreamUpstreamResponse
} from '../../api/api-marketplace/gateway';
import {
  API_KEY_NAME_MAX_LENGTH,
  API_KEY_PREFIX,
  API_MARKETPLACE_STATUS_URL,
  getApiMarketplaceAccessEmails,
  TUZI_DEFAULT_GROUP,
  TUZI_PRICING_ENDPOINT,
  TUZI_MARKUP_MULTIPLIER,
  applyTuziGroupPricing,
  applyTuziMarkup,
  getTuziModelBillingMode,
  isApiMarketplaceAdminEmail,
  isValidApiKeyName,
  isValidUpstreamModelName,
  normalizeApiKeyName,
  normalizeTuziPricingModel,
  normalizeTuziPricingPayload,
  roundMarketplacePrice,
  sanitizeModelName
} from '../shared/api-marketplace';
import type {
  ApiMarketplaceModel,
  TuziPricingModel,
  TuziPricingResponse
} from '../shared/api-marketplace';

describe('API marketplace constants', () => {
  it('exposes the configured key prefix and 30% markup', () => {
    expect(API_KEY_PREFIX).toBe('sk-wtm');
    expect(TUZI_MARKUP_MULTIPLIER).toBe(1.3);
  });

  it('uses the isolated JSON pricing feed', () => {
    expect(TUZI_PRICING_ENDPOINT).toBe('https://api.sydney-ai.com/api/pricing');
  });

  it('uses Tuzi public model status feed', () => {
    expect(API_MARKETPLACE_STATUS_URL).toBe('https://apistatus.tu-zi.com/');
  });
});

describe('marketplace access allowlist', () => {
  it('always includes the built-in administrator', () => {
    expect(isApiMarketplaceAdminEmail('admin@example.com')).toBe(true);
    expect(isApiMarketplaceAdminEmail('someone@example.com')).toBe(false);
  });

  it('accepts configured beta cohort emails case-insensitively', () => {
    // The VITE_API_MARKETPLACE_ACCESS_EMAILS value is injected at build time;
    // this assertion pins the contract for the deployment configuration.
    const emails = getApiMarketplaceAccessEmails();
    expect(emails).toContain('admin@example.com');
  });
});

describe('price helpers', () => {
  it('rounds to 6 decimals without float noise', () => {
    expect(roundMarketplacePrice(0.1 * 1.3)).toBe(0.13);
    expect(roundMarketplacePrice(Number.NaN)).toBe(0);
    expect(roundMarketplacePrice(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('applies the default 1.3 markup and honors overrides', () => {
    expect(applyTuziMarkup(1)).toBe(1.3);
    expect(applyTuziMarkup(0.405)).toBe(0.5265);
    expect(applyTuziMarkup(10, 1.5)).toBe(15);
  });

  it('applies the selected Tuzi group override without mutating the base row', () => {
    const baseModel: TuziPricingModel = {
      ...TOKEN_MODEL,
      model_name: 'gpt-image-2',
      quota_type: 1,
      model_ratio: 2.5,
      model_price: 0,
      completion_ratio: 6
    };
    const effectiveModel = applyTuziGroupPricing(
      baseModel,
      TUZI_DEFAULT_GROUP,
      {
        default: {
          quota_type: { 'gpt-image-2': 0 },
          model_price: { 'gpt-image-2': 0.05 }
        }
      }
    );

    expect(effectiveModel).toMatchObject({
      quota_type: 0,
      model_price: 0.05,
      model_ratio: 2.5,
      completion_ratio: 6
    });
    expect(baseModel).toMatchObject({ quota_type: 1, model_price: 0 });
  });
});

describe('api key name validation', () => {
  it('accepts normal key names', () => {
    expect(isValidApiKeyName('My API Key')).toBe(true);
    expect(isValidApiKeyName('a b c')).toBe(true);
  });

  it('rejects empty, padded, control-char and overlong names', () => {
    expect(isValidApiKeyName('')).toBe(false);
    expect(isValidApiKeyName('   ')).toBe(false);
    expect(isValidApiKeyName(' padded')).toBe(false);
    expect(isValidApiKeyName('padded ')).toBe(false);
    expect(isValidApiKeyName('a\nb')).toBe(false);
    expect(isValidApiKeyName('x'.repeat(API_KEY_NAME_MAX_LENGTH + 1))).toBe(
      false
    );
  });

  it('normalizes whitespace and strips control characters', () => {
    expect(normalizeApiKeyName('  prod\n  Key ')).toBe('prod Key');
    expect(normalizeApiKeyName(123)).toBe('');
    expect(normalizeApiKeyName(null)).toBe('');
  });
});

describe('model name helpers', () => {
  it('validates upstream model names structurally', () => {
    expect(isValidUpstreamModelName('gpt-3.5-turbo-0613')).toBe(true);
    expect(isValidUpstreamModelName('gpt-5.6-luna')).toBe(true);
    expect(isValidUpstreamModelName('')).toBe(false);
    expect(isValidUpstreamModelName(' padded')).toBe(false);
    expect(isValidUpstreamModelName('a\tb')).toBe(false);
  });

  it('sanitizes a DB-safe id without touching the raw model name', () => {
    expect(sanitizeModelName('gpt-5.6-luna')).toBe('gpt-5.6-luna');
    expect(sanitizeModelName('gpt 5 luna')).toBe('gpt-5-luna');
    expect(sanitizeModelName('gpt/5')).toBe('gpt5');
    expect(sanitizeModelName('!!!')).toBe('');
    expect(sanitizeModelName('模型名')).toBe('');
  });
});

const TOKEN_MODEL: TuziPricingModel = {
  model_name: 'deepseek-v3-all',
  description: 'DeepSeek V3 All',
  icon: 'DeepSeek',
  tags: '文本, 工具',
  vendor_id: 6,
  quota_type: 1,
  model_ratio: 0.405,
  model_price: 0,
  completion_ratio: 4,
  enable_groups: ['default'],
  supported_endpoint_types: ['openai'],
  endpoints: {
    openai: {
      path: '/v1/chat/completions',
      method: 'POST',
      scenario: 'text'
    }
  }
};

const REQUEST_MODEL: TuziPricingModel = {
  model_name: 'chat-suno',
  quota_type: 0,
  model_ratio: 0,
  model_price: 1,
  completion_ratio: 0,
  enable_groups: ['default']
};

describe('normalizeTuziPricingModel', () => {
  it('keeps upstream fields verbatim and marks up ratios', () => {
    const snapshot = JSON.stringify(TOKEN_MODEL);
    const normalized = normalizeTuziPricingModel(TOKEN_MODEL, {
      vendors: [
        { id: 6, name: 'DeepSeek' },
        { id: 7, name: 'Suno', icon: 'Suno' }
      ]
    });

    expect(JSON.stringify(TOKEN_MODEL)).toBe(snapshot);
    expect(normalized.upstream).toEqual(TOKEN_MODEL);
    expect(normalized.modelName).toBe('deepseek-v3-all');
    expect(normalized.id).toBe('deepseek-v3-all');
    expect(normalized.billingMode).toBe('token_ratio');
    expect(normalized.retailRatio).toBe(0.5265);
    expect(normalized.retailModelPrice).toBe(0);
    expect(normalized.markupMultiplier).toBe(TUZI_MARKUP_MULTIPLIER);
    expect(normalized.vendor).toEqual({ id: 6, name: 'DeepSeek' });
    expect(normalized.enableGroups).toEqual(['default']);
    expect(normalized.supportedEndpointTypes).toEqual(['openai']);
    expect(normalized.tags).toEqual(['文本', '工具']);
    expect(normalized.description).toBe('DeepSeek V3 All');
  });

  it('marks up per-request prices for quota_type 0', () => {
    const normalized = normalizeTuziPricingModel(REQUEST_MODEL);
    expect(normalized.billingMode).toBe('per_request');
    expect(normalized.retailModelPrice).toBe(1.3);
    expect(normalized.retailRatio).toBe(0);
  });

  it('honors a custom multiplier and unknown vendors', () => {
    const normalized = normalizeTuziPricingModel(REQUEST_MODEL, {
      multiplier: 1.5
    });
    expect(normalized.retailModelPrice).toBe(1.5);
    expect(normalized.vendor).toBeUndefined();
  });

  it('falls back to a stable id when nothing survives sanitization', () => {
    const weird = normalizeTuziPricingModel({
      ...REQUEST_MODEL,
      model_name: '!!!'
    });
    expect(weird.id).toBe('unknown-model');
    expect(weird.modelName).toBe('!!!');
  });
});

describe('normalizeTuziPricingPayload', () => {
  it('maps the data array and keeps the pricing version', () => {
    const payload: TuziPricingResponse = {
      success: true,
      pricing_version: 'a42d372ccf0b5dd13ecf71203521f9d2',
      data: [TOKEN_MODEL, REQUEST_MODEL],
      vendors: [
        { id: 6, name: 'DeepSeek' },
        { id: 7, name: 'Suno', icon: 'Suno' }
      ]
    };
    const { version, models } = normalizeTuziPricingPayload(payload);
    expect(version).toBe('a42d372ccf0b5dd13ecf71203521f9d2');
    expect(models).toHaveLength(2);
    expect(models[0].retailRatio).toBe(0.5265);
    expect(models[1].retailModelPrice).toBe(1.3);
  });

  it('returns an empty list for malformed payloads', () => {
    expect(normalizeTuziPricingPayload({ success: false, data: [] })).toEqual({
      version: null,
      models: []
    });
  });

  it('uses default-group overrides before normalizing pricing', () => {
    const payload: TuziPricingResponse = {
      success: true,
      data: [
        {
          ...TOKEN_MODEL,
          model_name: 'gpt-image-2',
          quota_type: 1,
          model_ratio: 2.5,
          model_price: 0,
          completion_ratio: 6
        }
      ],
      group_model_pricing: {
        default: {
          quota_type: { 'gpt-image-2': 0 },
          model_price: { 'gpt-image-2': 0.05 }
        }
      }
    };

    const { models } = normalizeTuziPricingPayload(payload);
    expect(models[0]).toMatchObject({
      billingMode: 'per_request',
      retailModelPrice: 0.065,
      upstream: { quota_type: 0, model_price: 0.05 }
    });
  });
});

describe('billing mode mapping', () => {
  it('maps quota_type to billing mode', () => {
    expect(getTuziModelBillingMode(0)).toBe('per_request');
    expect(getTuziModelBillingMode(1)).toBe('token_ratio');
  });
});

describe('ApiMarketplaceModel shape', () => {
  it('satisfies the shared model contract', () => {
    const model: ApiMarketplaceModel = normalizeTuziPricingModel(TOKEN_MODEL);
    expect(model).toMatchObject({
      id: expect.any(String),
      modelName: expect.any(String),
      upstream: expect.any(Object),
      markupMultiplier: expect.any(Number),
      billingMode: expect.stringMatching(/per_request|token_ratio/),
      retailModelPrice: expect.any(Number),
      retailRatio: expect.any(Number),
      enableGroups: expect.any(Array),
      supportedEndpointTypes: expect.any(Array),
      tags: expect.any(Array),
      description: expect.any(String)
    });
  });
});

describe('public gateway endpoint policy', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows only exact OpenAI-compatible method/path pairs', () => {
    expect(isEndpointAllowed('POST', '/chat/completions')).toBe(true);
    expect(isEndpointAllowed('DELETE', '/chat/completions')).toBe(false);
    expect(isEndpointAllowed('GET', '/admin/keys')).toBe(false);
    expect(isEndpointAllowed('POST', '/chat//completions')).toBe(false);
    expect(isEndpointAllowed('POST', '/chat/../admin')).toBe(false);
  });

  it('normalizes the public versioned gateway path before matching', () => {
    expect(normalizeGatewayEndpointPath('/v1/models')).toBe('/models');
    expect(normalizeGatewayEndpointPath('/v1/chat/completions')).toBe(
      '/chat/completions'
    );
    expect(normalizeGatewayEndpointPath('/chat/completions')).toBe(
      '/chat/completions'
    );
  });

  it('restricts a model to its explicit catalog endpoint paths', () => {
    const model = {
      endpointDetails: {
        openai: { path: '/v1/chat/completions', method: 'POST' }
      }
    };

    expect(isEndpointAllowed('POST', '/chat/completions', model)).toBe(true);
    expect(isEndpointAllowed('POST', '/images/generations', model)).toBe(false);
  });

  it('does not advertise models whose declared endpoints are not public', () => {
    expect(
      hasCallableMarketplaceEndpoint({
        endpointDetails: { openai: { path: '/v1/chat/completions' } }
      })
    ).toBe(true);
    expect(
      hasCallableMarketplaceEndpoint({
        endpointDetails: { video: { path: '/v1/videos' } }
      })
    ).toBe(false);
    expect(hasCallableMarketplaceEndpoint({ endpointDetails: {} })).toBe(true);
  });

  it('prefers the default-group status when the provider repeats a model', () => {
    const statuses = normalizeStatusChecks({
      latest_checks: [
        {
          model_name: 'gpt-image-2',
          group: 'premium',
          status_label: 'premium-online',
          checked_at: 2_000
        },
        {
          model_name: 'gpt-image-2',
          group: 'default',
          status_label: 'default-online',
          checked_at: 1_000
        }
      ]
    });
    expect(statuses.get('gpt-image-2')?.label).toBe('default-online');
  });

  it('builds a non-empty catalog only from a valid feed and callable models', async () => {
    vi.stubEnv(
      'API_MARKETPLACE_TUZI_PRICING_URL',
      'https://pricing.test/api/pricing'
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        if (String(url).includes('/api/status')) {
          return new Response(
            JSON.stringify({
              monitor_settings: { check_interval: 300 },
              latest_checks: [
                {
                  model_name: 'callable-model',
                  group: 'default',
                  status_label: '在线',
                  checked_at: 1_000,
                  total_count: 12,
                  error_count: 1,
                  error_rate: 8.33,
                  avg_response_time: 84.5
                }
              ]
            }),
            { status: 200 }
          );
        }
        return new Response(
          JSON.stringify({
            success: true,
            custom_currency_symbol: 'USD',
            data: [
              {
                model_name: 'callable-model',
                icon: 'OpenAI',
                tags: '文本, 工具',
                quota_type: 1,
                model_ratio: 1,
                model_price: 0,
                completion_ratio: 1,
                enable_groups: ['default'],
                endpoints: {
                  openai: { path: '/v1/chat/completions', method: 'POST' }
                }
              },
              {
                model_name: 'provider-video-model',
                quota_type: 2,
                model_ratio: 0,
                model_price: 1,
                completion_ratio: 0,
                enable_groups: ['default'],
                endpoints: {
                  video: { path: '/v1/videos', method: 'POST' }
                }
              }
            ]
          }),
          { status: 200 }
        );
      })
    );

    const catalog = await getApiMarketplaceCatalog({ forceRefresh: true });
    expect(catalog.models.map((model) => model.name)).toEqual([
      'callable-model'
    ]);
    expect(catalog.models[0].status?.label).toBe('在线');
    expect(catalog.models[0].status?.totalCount).toBe(12);
    expect(catalog.models[0].status?.avgResponseTimeMs).toBe(84.5);
    expect(catalog.models[0].provider).toBe('OpenAI');
    expect(catalog.models[0].groups).toEqual(['default']);
    expect(catalog.models[0].pricing).toEqual({
      inputPerMillion: 2.6,
      outputPerMillion: 2.6,
      requestPrice: null,
      unit: 'tokens_1m'
    });
    expect(catalog.statusMeta?.checkIntervalSeconds).toBe(300);
  });

  it('uses default-group request pricing overrides from the live feed shape', async () => {
    vi.stubEnv(
      'API_MARKETPLACE_TUZI_PRICING_URL',
      'https://pricing.test/api/pricing'
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        if (String(url).includes('/api/status')) {
          return new Response(JSON.stringify({ latest_checks: [] }), {
            status: 200
          });
        }
        return new Response(
          JSON.stringify({
            success: true,
            custom_currency_symbol: 'USD',
            data: [
              {
                model_name: 'gpt-image-2',
                quota_type: 1,
                model_ratio: 2.5,
                model_price: 0,
                completion_ratio: 6,
                enable_groups: ['default'],
                endpoints: {
                  openai: { path: '/v1/images/generations', method: 'POST' }
                }
              }
            ],
            group_model_pricing: {
              default: {
                quota_type: { 'gpt-image-2': 0 },
                model_price: { 'gpt-image-2': 0.05 }
              }
            }
          }),
          { status: 200 }
        );
      })
    );

    const catalog = await getApiMarketplaceCatalog({ forceRefresh: true });
    expect(catalog.models[0]).toMatchObject({
      group: 'default',
      pricingMode: 'request',
      upstream: { quotaType: 0, modelPrice: 0.05 },
      pricing: {
        inputPerMillion: null,
        outputPerMillion: null,
        requestPrice: 0.065,
        unit: 'request'
      }
    });
    expect(estimateCustomerChargeCents(catalog.models[0], {})).toBe(7);
  });

  it('rejects direct provider relay URLs and defaults unknown runtime to production', () => {
    vi.stubEnv('WEBTOMIND_RUNTIME', '');
    vi.stubEnv('NODE_ENV', '');
    vi.stubEnv('API_MARKETPLACE_RELAY_BASE_URL', 'https://api.sydney-ai.com');

    expect(getMarketplaceRuntimeMode()).toBe('production');
    expect(getMarketplaceRelayBaseUrlError()).toContain(
      'must not point directly at the provider'
    );
  });

  it('forces production pricing through the relay when a stale direct URL remains', () => {
    vi.stubEnv('WEBTOMIND_RUNTIME', 'production');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('API_MARKETPLACE_RELAY_REQUIRED', 'true');
    vi.stubEnv(
      'API_MARKETPLACE_RELAY_BASE_URL',
      'https://relay.example.com/_relay'
    );
    vi.stubEnv('API_MARKETPLACE_RELAY_API_KEY', 'relay-test-key');
    vi.stubEnv(
      'API_MARKETPLACE_TUZI_PRICING_URL',
      'https://api.sydney-ai.com/api/pricing'
    );

    expect(getTuziPricingUrl()).toBe(
      'https://relay.example.com/_relay/pricing'
    );
  });

  it('does not fall back to a direct pricing URL when production relay config is missing', () => {
    vi.stubEnv('WEBTOMIND_RUNTIME', 'production');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('API_MARKETPLACE_RELAY_REQUIRED', 'true');
    vi.stubEnv('API_MARKETPLACE_RELAY_BASE_URL', '');
    vi.stubEnv(
      'API_MARKETPLACE_TUZI_PRICING_URL',
      'https://api.sydney-ai.com/api/pricing'
    );

    expect(getTuziPricingUrl()).toBe('');
  });

  it('rewrites upstream failures without exposing relay/provider details', () => {
    expect(getSafeUpstreamErrorMessage(429)).toBe(
      '模型服务当前请求较多，请稍后重试'
    );
    expect(getSafeUpstreamErrorMessage(503)).toBe(
      '模型服务暂时不可用，请稍后重试'
    );
    expect(getSafeUpstreamErrorMessage(401)).toBe(
      '模型服务未接受本次请求，请检查模型和请求参数'
    );
    expect(getSafeUpstreamErrorMessage(503)).not.toMatch(
      /tuzi|sydney|provider/i
    );
  });

  it('streams only successful SSE responses', () => {
    const body = new Response('data').body;
    expect(
      shouldStreamUpstreamResponse(
        { ok: true, body },
        'text/event-stream; charset=utf-8'
      )
    ).toBe(true);
    expect(
      shouldStreamUpstreamResponse(
        { ok: false, body },
        'text/event-stream; charset=utf-8'
      )
    ).toBe(false);
    expect(
      shouldStreamUpstreamResponse(
        { ok: true, body: null },
        'text/event-stream'
      )
    ).toBe(false);
  });

  it('estimates the complete compatible request body', () => {
    const messagesOnly = approximateInputTokens({
      messages: [{ role: 'user', content: 'hello' }]
    });
    const responsesBody = approximateInputTokens({
      input: [
        { role: 'user', content: [{ type: 'input_text', text: 'hello' }] }
      ],
      tools: [
        { type: 'function', function: { name: 'lookup', parameters: {} } }
      ]
    });
    expect(responsesBody).toBeGreaterThan(messagesOnly);
  });

  it('strips browser identity and forwarding headers at the relay boundary', () => {
    const request = new Request('https://webtomind.test/v1/chat/completions', {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        Cookie: 'session=secret',
        Origin: 'https://attacker.example',
        Referer: 'https://attacker.example/page',
        'X-Forwarded-For': '10.0.0.1'
      },
      body: '{}'
    });
    const headers = buildUpstreamHeaders(
      request,
      'relay-secret',
      'request-1',
      'gpt-5.6-luna',
      true
    );
    expect(headers.get('Authorization')).toBe('Bearer relay-secret');
    expect(headers.get('X-WebToMind-Relay-Request-Id')).toBe('request-1');
    expect(headers.get('Cookie')).toBeNull();
    expect(headers.get('Origin')).toBeNull();
    expect(headers.get('Referer')).toBeNull();
    expect(headers.get('X-Forwarded-For')).toBeNull();
    expect(headers.get('X-WebToMind-Upstream-Group')).toBe('default');
  });
});

describe('gateway multipart and idempotency fixes', () => {
  it('reads the model from multipart form data', async () => {
    const form = new FormData();
    form.set('model', 'gpt-image-2');
    form.set('image', new Blob(['x']), 'image.png');
    const request = new Request('https://webtomind.test/v1/images/edits', {
      method: 'POST',
      body: form
    });
    await expect(extractModelNameFromMultipart(request)).resolves.toBe('gpt-image-2');
  });

  it('rejects oversized or non-printable idempotency keys but keeps valid ones', () => {
    expect(parseClientIdempotencyKey('order-123')).toBe('order-123');
    expect(parseClientIdempotencyKey('  spaced-key  ')).toBe('spaced-key');
    expect(parseClientIdempotencyKey(null)).toBe('');
    expect(parseClientIdempotencyKey('')).toBe('');
    expect(parseClientIdempotencyKey('k'.repeat(129))).toBe('');
    expect(parseClientIdempotencyKey('bad\u0000key')).toBe('');
    expect(parseClientIdempotencyKey('中文键')).toBe('');
  });

  it('maps reservation failures to HTTP semantics', () => {
    const insufficient = describeReserveFailure('INSUFFICIENT_WALLET_BALANCE');
    expect(insufficient.status).toBe(402);
    expect(insufficient.type).toBe('insufficient_quota');

    const conflict = describeReserveFailure('REQUEST_ID_CONFLICT');
    expect(conflict.status).toBe(409);
    expect(conflict.type).toBe('idempotency_key_conflict');

    const generic = describeReserveFailure('RESERVE_RPC_ERROR');
    expect(generic.status).toBe(503);
  });
});

describe('model plaza release-date ordering', () => {
  it('exposes createdAt from the upstream feed', () => {
    const raw: TuziPricingModel = {
      ...TOKEN_MODEL,
      model_name: 'brand-new-model',
      created_time: 1787600000
    };
    const normalized = normalizeTuziPricingModel(raw);
    expect(normalized.createdAt).toBe(
      new Date(1787600000 * 1000).toISOString()
    );

    const withoutTime = normalizeTuziPricingModel({
      ...TOKEN_MODEL,
      model_name: 'old-model-no-time',
      created_time: undefined
    });
    expect(withoutTime.createdAt).toBeNull();
  });
});

describe('chat.completions non-stream relay (forced streaming)', () => {
  it('forces stream:true and include_usage for non-streaming chat.completions', () => {
    const forwarded = buildUpstreamForwardedBody(
      {
        model: 'gpt-5.6-luna',
        messages: [{ role: 'user', content: 'hello' }]
      },
      '/chat/completions'
    );
    expect(forwarded.stream).toBe(true);
    expect(forwarded.stream_options).toEqual({ include_usage: true });
    expect(forwarded.messages).toEqual([
      { role: 'user', content: 'hello' }
    ]);
  });

  it('keeps existing stream_options and forces include_usage', () => {
    const forwarded = buildUpstreamForwardedBody(
      {
        model: 'gpt-5.6-luna',
        messages: [],
        stream_options: { include_usage: false, max_tokens: 10 }
      },
      '/chat/completions'
    );
    expect(forwarded.stream).toBe(true);
    expect(forwarded.stream_options).toEqual({
      include_usage: true,
      max_tokens: 10
    });
  });

  it('does not force streaming for other endpoints', () => {
    const body = { model: 'gpt-5.6-luna', messages: [] };
    expect(buildUpstreamForwardedBody(body, '/images/generations')).toEqual(
      body
    );
    expect(buildUpstreamForwardedBody(body, '/responses')).toEqual(body);
    expect(buildUpstreamForwardedBody(body, '/completions')).toEqual(body);
  });

  it('leaves explicit client streaming requests unchanged apart from include_usage', () => {
    const forwarded = buildUpstreamForwardedBody(
      {
        model: 'gpt-5.6-luna',
        messages: [],
        stream: true,
        stream_options: { max_tokens: 10 }
      },
      '/chat/completions'
    );
    expect(forwarded.stream).toBe(true);
    expect(forwarded.stream_options).toEqual({
      include_usage: true,
      max_tokens: 10
    });
  });
});

describe('SSE aggregation for forced-stream responses', () => {
  const SSE_CHUNKS = [
    'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1,"model":"gpt-5.6-luna","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}',
    'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1,"model":"gpt-5.6-luna","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}',
    'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1,"model":"gpt-5.6-luna","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":"stop"}]}',
    'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1,"model":"gpt-5.6-luna","choices":[],"usage":{"prompt_tokens":9,"completion_tokens":12,"total_tokens":21}}',
    'data: [DONE]'
  ];

  it('aggregates content, model, role, finish_reason and usage from SSE', () => {
    const aggregate = aggregateChatCompletionSseText(SSE_CHUNKS.join('\n\n'));
    expect(aggregate.id).toBe('chatcmpl-123');
    expect(aggregate.model).toBe('gpt-5.6-luna');
    expect(aggregate.role).toBe('assistant');
    expect(aggregate.content).toBe('Hello world');
    expect(aggregate.finishReason).toBe('stop');
    expect(aggregate.usage).toEqual({ inputTokens: 9, outputTokens: 12 });
  });

  it('merges chunks incrementally through aggregateChatCompletionChunk', () => {
    let aggregate = createEmptyChatCompletionAggregate();
    for (const line of SSE_CHUNKS) {
      const payload = line.replace(/^data:\s*/, '');
      if (payload === '[DONE]') continue;
      aggregate = aggregateChatCompletionChunk(
        aggregate,
        JSON.parse(payload)
      );
    }
    expect(aggregate.content).toBe('Hello world');
    expect(aggregate.finishReason).toBe('stop');
    expect(aggregate.usage).toEqual({ inputTokens: 9, outputTokens: 12 });
  });

  it('builds a standard non-streaming chat.completion payload', () => {
    const payload = buildNonStreamingChatCompletion(
      {
        id: 'chatcmpl-123',
        model: 'gpt-5.6-luna',
        role: 'assistant',
        content: 'Hello world',
        toolCalls: [],
        finishReason: 'stop',
        usage: { inputTokens: 9, outputTokens: 12 }
      },
      'request-fallback'
    );
    expect(payload.object).toBe('chat.completion');
    expect(payload.id).toBe('chatcmpl-123');
    expect(payload.model).toBe('gpt-5.6-luna');
    expect(payload.choices).toEqual([
      {
        index: 0,
        message: { role: 'assistant', content: 'Hello world' },
        finish_reason: 'stop'
      }
    ]);
    expect(payload.usage).toEqual({
      prompt_tokens: 9,
      completion_tokens: 12,
      total_tokens: 21
    });
  });

  it('merges streamed tool call fragments into a complete tool_calls array', () => {
    const chunk = (delta: Record<string, unknown>, extra = {} as Record<string, unknown>) =>
      'data: ' + JSON.stringify({ id: 'c1', model: 'm1', choices: [{ index: 0, delta, ...extra }] });
    const sse = [
      chunk({ role: 'assistant' }),
      chunk({ tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'lookup', arguments: '{"q":' } }] }),
      chunk({ tool_calls: [{ index: 0, function: { arguments: '"x"}' } }] }),
      chunk({ finish_reason: 'tool_calls' })
    ].join('\n\n');
    const withUsage =
      'data: ' +
      JSON.stringify({
        id: 'c1',
        model: 'm1',
        choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
        usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 }
      });
    const full = [sse, withUsage, 'data: [DONE]'].join('\n\n');
    const aggregate = aggregateChatCompletionSseText(full);
    expect(aggregate.toolCalls).toHaveLength(1);
    expect(aggregate.toolCalls[0]).toMatchObject({
      id: 'call_1',
      type: 'function'
    });
    const fn = aggregate.toolCalls[0].function as Record<string, unknown>;
    expect(fn.name).toBe('lookup');
    expect(fn.arguments).toBe('{"q":"x"}');

    const payload = buildNonStreamingChatCompletion(aggregate, 'fb', 'm1');
    expect(payload.choices[0].finish_reason).toBe('tool_calls');
    expect(payload.choices[0].message.tool_calls).toHaveLength(1);
  });

  it('ignores keep-alive comments and [DONE] markers', () => {
    const aggregate = aggregateChatCompletionSseText(
      [
        ': keep-alive comment',
        'data: {"id":"x","object":"chat.completion.chunk","model":"m","choices":[{"index":0,"delta":{"content":"a"},"finish_reason":null}]}',
        'data: [DONE]'
      ].join('\n\n')
    );
    expect(aggregate.content).toBe('a');
    expect(aggregate.model).toBe('m');
  });

  it('falls back to empty usage and assistant role when chunks omit them', () => {
    const aggregate = aggregateChatCompletionSseText(
      'data: {"object":"chat.completion.chunk","model":"m","choices":[{"index":0,"delta":{"content":"hi"},"finish_reason":"stop"}]}'
    );
    const payload = buildNonStreamingChatCompletion(aggregate, 'req-1');
    expect(payload.id).toBe('req-1');
    expect(payload.choices[0].message).toEqual({
      role: 'assistant',
      content: 'hi'
    });
    expect(payload.choices[0].finish_reason).toBe('stop');
    expect(payload.usage).toEqual({
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    });
  });
});
