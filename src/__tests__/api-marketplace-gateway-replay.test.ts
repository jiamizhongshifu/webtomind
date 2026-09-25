import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpcResults = new Map<string, unknown>();
const rpcCalls: string[] = [];

function createQueryBuilder(result: unknown): Record<string, unknown> {
  const builder: Record<string, unknown> = {};
  const chain = (): Record<string, unknown> => builder;
  builder.select = chain;
  builder.update = chain;
  builder.eq = chain;
  builder.maybeSingle = async (): Promise<unknown> => result;
  builder.then = (resolve: (value: unknown) => unknown): unknown =>
    resolve({ data: null, error: null });
  return builder;
}

const fakeSupabase = {
  from: (): Record<string, unknown> =>
    createQueryBuilder({
      data: {
        id: 'key-1',
        user_id: 'user-1',
        name: 'test',
        status: 'active',
        expires_at: null
      },
      error: null
    }),
  rpc: async (name: string): Promise<{ data: unknown; error: null }> => {
    rpcCalls.push(name);
    return { data: rpcResults.get(name) ?? null, error: null };
  }
};

vi.mock('../../api/utils/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/utils/auth')>()),
  getSupabaseAdmin: (): typeof fakeSupabase => fakeSupabase
}));

vi.mock('../../api/api-marketplace/runtime', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../api/api-marketplace/runtime')>();
  return {
    ...actual,
    getApiMarketplaceCatalog: async (): Promise<unknown> => ({
      models: [{ id: 'chat-model', pricingMode: 'token' }]
    }),
    estimateCustomerChargeCents: (): number => 10,
    isApiMarketplaceAdminUserId: async (): Promise<boolean> => true,
    isEndpointAllowed: (): boolean => true,
    isMarketplaceRelayRequired: (): boolean => false,
    isMarketplaceRelayConfigured: (): boolean => false,
    getUpstreamApiKey: (): string => 'upstream-key',
    getUpstreamBaseUrl: (): string => 'https://upstream.test/v1'
  };
});

import handler, {
  classifyReservationReplay
} from '../../api/api-marketplace/gateway';

function gatewayRequest(idempotencyKey: string): Request {
  return new Request('https://webtomind.test/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer sk-wtm_test',
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify({ model: 'chat-model', input: 'hello' })
  });
}

describe('classifyReservationReplay', () => {
  it('treats only a fresh reservation as forwardable', () => {
    expect(classifyReservationReplay({ ok: true, idempotent: false })).toBe('new');
    expect(classifyReservationReplay(null)).toBe('new');
    expect(
      classifyReservationReplay({ ok: true, idempotent: true, status: 'reserved' })
    ).toBe('in_progress');
    expect(
      classifyReservationReplay({ ok: true, idempotent: true, status: 'succeeded' })
    ).toBe('completed');
    expect(
      classifyReservationReplay({ ok: true, idempotent: true, status: 'failed' })
    ).toBe('completed');
  });
});

describe('gateway Idempotency-Key replay', () => {
  const upstreamFetch = vi.fn(
    async (): Promise<Response> =>
      new Response(
        JSON.stringify({ data: [], usage: { prompt_tokens: 3, total_tokens: 3 } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
  );

  beforeEach(() => {
    rpcResults.clear();
    rpcCalls.length = 0;
    upstreamFetch.mockClear();
    vi.stubGlobal('fetch', upstreamFetch);
    rpcResults.set('check_api_gateway_rate_limit', { ok: true, limited: false });
    rpcResults.set('settle_api_usage', { ok: true, wallet_balance_cents: 90 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('forwards a fresh reservation upstream once', async () => {
    rpcResults.set('reserve_api_wallet', { ok: true, idempotent: false });
    const response = await handler(gatewayRequest('fresh-key'));
    expect(response.status).toBe(200);
    expect(upstreamFetch).toHaveBeenCalledTimes(1);
    expect(rpcCalls).toContain('settle_api_usage');
  });

  it('rejects a replay whose first request still holds the reservation', async () => {
    rpcResults.set('reserve_api_wallet', {
      ok: true,
      idempotent: true,
      status: 'reserved'
    });
    const response = await handler(gatewayRequest('in-flight-key'));
    expect(response.status).toBe(409);
    const payload = (await response.json()) as { error: { type: string } };
    expect(payload.error.type).toBe('idempotent_request_in_progress');
    expect(response.headers.get('X-WebToMind-Request-Id')).toBe('in-flight-key');
    expect(upstreamFetch).not.toHaveBeenCalled();
    expect(rpcCalls).not.toContain('settle_api_usage');
  });

  it('keeps streaming settlement alive through the execution context', async () => {
    rpcResults.set('reserve_api_wallet', { ok: true, idempotent: false });
    upstreamFetch.mockImplementationOnce(
      async (): Promise<Response> =>
        new Response(
          'data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2}}\n\ndata: [DONE]\n\n',
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
        )
    );
    const pending: Promise<unknown>[] = [];
    const response = await handler(gatewayRequest('stream-key'), {
      waitUntil: (promise: Promise<unknown>): void => {
        pending.push(promise);
      }
    });
    expect(response.status).toBe(200);
    expect(pending).toHaveLength(1);
    await response.text();
    await Promise.all(pending);
    expect(rpcCalls).toContain('settle_api_usage');
  });

  it('keeps rejecting replays of an already settled request', async () => {
    rpcResults.set('reserve_api_wallet', {
      ok: true,
      idempotent: true,
      status: 'succeeded'
    });
    const response = await handler(gatewayRequest('settled-key'));
    expect(response.status).toBe(409);
    const payload = (await response.json()) as { error: { type: string } };
    expect(payload.error.type).toBe('idempotent_replay_rejected');
    expect(upstreamFetch).not.toHaveBeenCalled();
  });
});
