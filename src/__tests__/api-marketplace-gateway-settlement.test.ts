// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

// Only the upstream and Supabase transport are mocked. Accounting/recovery
// execute the actual migrations in isolated, in-process Postgres.
let db: PGlite;
let userId: string;
let keyId: string;
let sequence = 0;
type Fault =
  | 'error'
  | 'throw'
  | 'empty'
  | 'malformed'
  | 'hang'
  | 'commit-then-throw';
const faults = new Map<string, Fault | Fault[]>();
const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
const pending: Promise<unknown>[] = [];
const upstream =
  vi.fn<(...args: Parameters<typeof fetch>) => Promise<Response>>();
const context = {
  waitUntil: (promise: Promise<unknown>): void => {
    pending.push(promise);
  }
};

async function sqlRpc(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  if (
    ![
      'reserve_api_wallet',
      'settle_api_usage',
      'queue_api_usage_settlement'
    ].includes(name)
  ) {
    throw new Error(`Unexpected test RPC: ${name}`);
  }
  const names = Object.keys(args);
  const bindings = names.map((key, i) => `${key} => $${i + 1}`).join(', ');
  const result = await db.query<{ result: unknown }>(
    `SELECT public.${name}(${bindings}) AS result`,
    names.map((key) => args[key])
  );
  return result.rows[0].result;
}

const fakeSupabase = {
  from: () => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({
        data: { id: keyId, user_id: userId, name: 'test', status: 'active' },
        error: null
      })
    };
    return builder;
  },
  rpc: (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    const configured = faults.get(name);
    const fault = Array.isArray(configured) ? configured.shift() : configured;
    const run = async () => {
      if (name === 'check_api_gateway_rate_limit')
        return { data: { limited: false }, error: null };
      if (fault === 'error')
        return { data: null, error: { message: 'Mock database outage' } };
      if (fault === 'throw') throw new Error('Mock transport rejected');
      if (fault === 'empty') return { data: null, error: null };
      if (fault === 'malformed') return { data: {}, error: null };
      if (fault === 'hang') return new Promise<never>(() => {});
      const data = await sqlRpc(name, args);
      if (fault === 'commit-then-throw')
        throw new Error('Mock lost acknowledgement');
      return { data, error: null };
    };
    const result = run();
    // Mimic the abortable PostgREST builder; the hang fault deliberately ignores
    // abort to verify that our timeout still bounds a missing acknowledgement.
    return Object.assign(result, { abortSignal: () => result });
  }
};

vi.mock('../../api/utils/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/utils/auth')>()),
  getSupabaseAdmin: () => fakeSupabase
}));
vi.mock('../../api/api-marketplace/runtime', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../api/api-marketplace/runtime')
  >()),
  getApiMarketplaceCatalog: async () => ({
    models: [{ id: 'chat-model', pricingMode: 'token' }]
  }),
  estimateCustomerChargeCents: (
    _model: unknown,
    usage: { inputTokens?: number; outputTokens?: number }
  ) =>
    usage.outputTokens === 1024
      ? 100
      : (usage.inputTokens || 0) + (usage.outputTokens || 0),
  isApiMarketplaceAdminUserId: async () => true,
  isEndpointAllowed: () => true,
  isMarketplaceRelayRequired: () => false,
  isMarketplaceRelayConfigured: () => false,
  getUpstreamApiKey: () => 'mock-upstream-key',
  getUpstreamBaseUrl: () => 'https://upstream.test'
}));

import { legacyHandler as handler } from '../../api/api-marketplace/gateway';

function request(
  path = '/embeddings',
  stream = false,
  signal?: AbortSignal
): Request {
  return new Request(`https://gateway.test/v1${path}`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer sk-wtm_mock',
      'Content-Type': 'application/json',
      'Idempotency-Key': `req-${sequence}`
    },
    body: JSON.stringify({ model: 'chat-model', input: 'hello', stream }),
    signal
  });
}

const success = {
  data: [{ embedding: [0.5, 0.2] }],
  usage: { prompt_tokens: 30, completion_tokens: 20 }
};
const sse = [
  'data: {"id":"chat-1","choices":[{"delta":{"content":"Hello"}}]}\n\n',
  'data: {"choices":[{"delta":{"content":" world"},"finish_reason":"stop"}]}\n\n',
  'data: {"choices":[],"usage":{"prompt_tokens":30,"completion_tokens":20}}\n\n',
  'data: [DONE]\n\n'
];
const streamResponse = (body: BodyInit) =>
  new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });

async function ledger(): Promise<{
  balance: number;
  cost: number;
  status: string;
  metadata: Record<string, unknown>;
}> {
  const result = await db.query<{
    balance: unknown;
    cost: unknown;
    status: string;
    metadata: Record<string, unknown>;
  }>(
    `SELECT w.balance_cents AS balance, u.actual_customer_cents AS cost, u.status, u.metadata
     FROM api_usage_logs u JOIN api_wallets w USING (user_id) WHERE request_id = $1`,
    [`req-${sequence}`]
  );
  return {
    ...result.rows[0],
    balance: Number(result.rows[0].balance),
    cost: Number(result.rows[0].cost)
  };
}
async function recover(): Promise<void> {
  await db.query(
    `UPDATE api_usage_logs SET reserved_at = now() - interval '40 minutes' WHERE request_id = $1`,
    [`req-${sequence}`]
  );
  await db.exec(
    'SELECT expire_stale_api_usage(1800); SELECT process_api_usage_settlement_queue(50);'
  );
}
function rpcCalls(name: string) {
  return calls.filter((call) => call.name === name);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users (id UUID PRIMARY KEY, email TEXT);
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql AS $$ SELECT NULL::UUID $$;
    CREATE FUNCTION auth.role() RETURNS TEXT LANGUAGE sql AS $$ SELECT 'service_role'::TEXT $$;`);
  for (const file of [
    '20260825090000_api_marketplace.sql',
    '20260826160000_api_marketplace_ledger_hardening.sql',
    '20260826173000_api_credit_usd_integer_catalog.sql',
    '20260827090000_api_marketplace_shared_wallet.sql',
    '20260827200001_api_marketplace_gateway_rate_limit.sql',
    '20260925090000_api_marketplace_stale_expiry_skips_queued_settlement.sql'
  ])
    await db.exec(
      readFileSync(join(process.cwd(), 'supabase/migrations', file), 'utf8')
    );
}, 60_000);

beforeEach(async () => {
  sequence += 1;
  userId = `00000000-0000-0000-0000-${String(sequence).padStart(12, '0')}`;
  keyId = `10000000-0000-0000-0000-${String(sequence).padStart(12, '0')}`;
  await db.query('INSERT INTO auth.users (id) VALUES ($1)', [userId]);
  await db.query(
    `INSERT INTO api_keys (id, user_id, name, key_prefix, key_hash) VALUES ($1, $2, 'test', $3, $4)`,
    [keyId, userId, `sk-wtm_${sequence}`, String(sequence).padStart(64, '0')]
  );
  await db.query(
    `SELECT grant_api_wallet_credit($1, 1000, 'test', '{}'::jsonb)`,
    [userId]
  );
  faults.clear();
  calls.length = 0;
  pending.length = 0;
  upstream
    .mockReset()
    .mockResolvedValue(
      new Response(JSON.stringify(success), {
        headers: { 'Content-Type': 'application/json' }
      })
    );
  vi.stubGlobal('fetch', upstream);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(pending);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
afterAll(async () => {
  await db.close();
});

describe('successful gateway output and settlement recovery', () => {
  it.each(['/embeddings', '/chat/completions'])(
    'delivers %s output with pending billing, then recovers exactly once',
    async (path) => {
      faults.set('settle_api_usage', 'error');
      if (path === '/chat/completions')
        upstream.mockResolvedValueOnce(streamResponse(sse.join('')));
      const response = await handler(request(path));
      expect(response.status).toBe(200);
      expect(response.headers.get('X-WebToMind-Billing-Status')).toBe(
        'pending'
      );
      expect(response.headers.get('X-WebToMind-Cost-Cents')).toBeNull();
      expect(response.headers.get('Access-Control-Expose-Headers')).toContain(
        'X-WebToMind-Billing-Status'
      );
      const body = await response.json();
      if (path === '/chat/completions')
        expect(body.choices[0].message.content).toBe('Hello world');
      else expect(body).toEqual(success);
      expect(rpcCalls('settle_api_usage')).toHaveLength(3);
      expect(rpcCalls('queue_api_usage_settlement')).toHaveLength(1);
      expect(await ledger()).toMatchObject({
        balance: 900,
        status: 'reserved'
      });
      expect((await handler(request(path))).status).toBe(409);
      await recover();
      expect(await ledger()).toMatchObject({
        balance: 950,
        cost: 50,
        status: 'succeeded'
      });
      await sqlRpc(
        'queue_api_usage_settlement',
        rpcCalls('queue_api_usage_settlement')[0].args
      );
      await recover();
      expect(await ledger()).toMatchObject({
        balance: 950,
        cost: 50,
        status: 'succeeded'
      });
      expect((await handler(request(path))).status).toBe(409);
      expect(upstream).toHaveBeenCalledTimes(1);
      const transactions = await db.query(
        `SELECT id FROM api_wallet_transactions WHERE user_id = $1`,
        [userId]
      );
      expect(transactions.rows).toHaveLength(3); // seed, reservation, surplus refund
    }
  );

  it.each(['throw', 'empty', 'malformed'] as const)(
    'queues when settlement returns %s without losing output',
    async (fault) => {
      faults.set('settle_api_usage', fault);
      const response = await handler(request());
      expect(await response.json()).toEqual(success);
      expect(response.headers.get('X-WebToMind-Billing-Status')).toBe(
        'pending'
      );
      await recover();
      expect(await ledger()).toMatchObject({ balance: 950, cost: 50 });
    }
  );

  it('retries lost settlement acknowledgements without charging again', async () => {
    faults.set('settle_api_usage', ['commit-then-throw']);
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('X-WebToMind-Billing-Status')).toBe('settled');
    expect(response.headers.get('X-WebToMind-Cost-Cents')).toBe('50');
    expect(rpcCalls('settle_api_usage')).toHaveLength(2);
    expect(rpcCalls('queue_api_usage_settlement')).toHaveLength(0);
    expect(await ledger()).toMatchObject({ balance: 950, cost: 50 });
  });

  it('retries a queue insertion whose acknowledgement was lost', async () => {
    faults.set('settle_api_usage', 'throw');
    faults.set('queue_api_usage_settlement', ['commit-then-throw']);
    const response = await handler(request());
    expect(response.headers.get('X-WebToMind-Billing-Status')).toBe('pending');
    expect(rpcCalls('queue_api_usage_settlement')).toHaveLength(2);
    await recover();
    expect(await ledger()).toMatchObject({ balance: 950, cost: 50 });
  });

  it('does not double-charge recovery after all committed settlement acknowledgements are lost', async () => {
    faults.set('settle_api_usage', 'commit-then-throw');
    const response = await handler(request());
    expect(response.headers.get('X-WebToMind-Billing-Status')).toBe('pending');
    expect(await response.json()).toEqual(success);
    expect(await ledger()).toMatchObject({ balance: 950, cost: 50 });
    await recover();
    await recover();
    expect(await ledger()).toMatchObject({ balance: 950, cost: 50 });
    const result = await db.query(
      'SELECT status FROM api_usage_settlement_queue WHERE request_id = $1',
      [`req-${sequence}`]
    );
    expect(result.rows[0]).toEqual({ status: 'succeeded' });
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it.each(['error', 'throw', 'empty', 'malformed'] as const)(
    'surfaces unconfirmed durability when the queue returns %s',
    async (fault) => {
      faults.set('settle_api_usage', 'error');
      faults.set('queue_api_usage_settlement', fault);
      const response = await handler(request());
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(success);
      expect(response.headers.get('X-WebToMind-Billing-Status')).toBe(
        'unconfirmed'
      );
      expect(response.headers.get('X-WebToMind-Cost-Cents')).toBeNull();
      expect(rpcCalls('queue_api_usage_settlement')).toHaveLength(3);
      expect(console.error).toHaveBeenCalledWith(
        '[ApiMarketplace] Usage settlement durability unconfirmed:',
        expect.objectContaining({ customerCostCents: 50 })
      );
      expect((await handler(request())).status).toBe(409);
      expect(upstream).toHaveBeenCalledTimes(1);
      expect(await ledger()).toMatchObject({
        status: 'reserved',
        balance: 900
      });
    }
  );

  it('reports the actual ledger cap, not the requested charge', async () => {
    upstream.mockResolvedValueOnce(
      new Response(JSON.stringify({ usage: { prompt_tokens: 3000 } }), {
        headers: { 'Content-Type': 'application/json' }
      })
    );
    const response = await handler(request());
    expect(response.headers.get('X-WebToMind-Cost-Cents')).toBe('100');
    expect(await ledger()).toMatchObject({
      balance: 900,
      cost: 100,
      metadata: { settlement_adjustment: 'capped_to_reservation' }
    });
  });

  it('preserves the existing reservation fallback when final usage is missing', async () => {
    upstream.mockResolvedValueOnce(
      new Response('{"data":[]}', {
        headers: { 'Content-Type': 'application/json' }
      })
    );
    faults.set('settle_api_usage', 'error');
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(rpcCalls('queue_api_usage_settlement')[0].args).toMatchObject({
      p_actual_customer_cents: 100,
      p_metadata: { usage_source: 'missing' }
    });
    await recover();
    expect(await ledger()).toMatchObject({ balance: 900, cost: 100 });
  });

  it('preserves sanitized upstream errors while their refund is pending', async () => {
    faults.set('settle_api_usage', 'error');
    upstream.mockResolvedValueOnce(
      new Response('private provider diagnostic', { status: 429 })
    );
    const response = await handler(request());
    expect(response.status).toBe(429);
    expect((await response.json()).error.type).toBe('upstream_error');
    expect(response.headers.get('X-WebToMind-Billing-Status')).toBe('pending');
    await recover();
    expect(await ledger()).toMatchObject({
      balance: 1000,
      cost: 0,
      status: 'failed'
    });
  });
});

describe('stream delivery and accounting lifetime', () => {
  it('finishes the original SSE before billing retries complete', async () => {
    faults.set('settle_api_usage', 'error');
    upstream.mockResolvedValueOnce(streamResponse(sse.join('')));
    const response = await handler(request('/chat/completions', true), context);
    expect(response.headers.get('X-WebToMind-Billing-Status')).toBe('pending');
    expect(response.headers.get('X-WebToMind-Cost-Cents')).toBeNull();
    expect(await response.text()).toBe(sse.join(''));
    expect(rpcCalls('queue_api_usage_settlement')).toHaveLength(0);
    expect(pending).toHaveLength(1);
    await Promise.all(pending);
    await recover();
    expect(await ledger()).toMatchObject({ balance: 950, cost: 50 });
  });

  it.each(['body-cancel', 'request-abort'] as const)(
    'drains final split usage after %s without canceling upstream',
    async (disconnect) => {
      const encoder = new TextEncoder();
      let controller!: ReadableStreamDefaultController<Uint8Array>;
      const cancel = vi.fn();
      upstream.mockResolvedValueOnce(
        streamResponse(
          new ReadableStream({
            start(c) {
              controller = c;
            },
            cancel
          })
        )
      );
      const abort = new AbortController();
      const response = await handler(
        request('/chat/completions', true, abort.signal),
        context
      );
      const reader = response.body!.getReader();
      controller.enqueue(encoder.encode(sse[0]));
      expect((await reader.read()).done).toBe(false);
      if (disconnect === 'request-abort') abort.abort();
      await reader.cancel();
      const usageFrame = sse[2];
      controller.enqueue(encoder.encode(usageFrame.slice(0, 37)));
      controller.enqueue(encoder.encode(usageFrame.slice(37) + sse[3]));
      controller.close();
      await Promise.all(pending);
      expect(cancel).not.toHaveBeenCalled();
      expect(upstream.mock.calls[0][1]?.signal?.aborted).toBe(false);
      expect(await ledger()).toMatchObject({
        balance: 950,
        cost: 50,
        metadata: {
          stream_outcome: 'disconnected',
          input_tokens: 30,
          output_tokens: 20
        }
      });
    }
  );

  it('retains usage in the chunk whose downstream write is rejected', async () => {
    upstream.mockResolvedValueOnce(streamResponse(sse.join('')));
    const response = await handler(request('/chat/completions', true), context);
    await response.body!.cancel();
    await Promise.all(pending);
    expect(await ledger()).toMatchObject({ balance: 950, cost: 50 });
  });

  it('signals upstream truncation and settles best observed usage once', async () => {
    const encoder = new TextEncoder();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    upstream.mockResolvedValueOnce(
      streamResponse(
        new ReadableStream({
          start(c) {
            controller = c;
          }
        })
      )
    );
    const response = await handler(request('/chat/completions', true), context);
    const reader = response.body!.getReader();
    controller.enqueue(encoder.encode(sse[2]));
    await reader.read();
    controller.error(new Error('Mock upstream disconnected'));
    await expect(reader.read()).rejects.toThrow('Upstream stream interrupted');
    await Promise.all(pending);
    expect(rpcCalls('settle_api_usage')).toHaveLength(1);
    expect(await ledger()).toMatchObject({
      cost: 50,
      metadata: { stream_outcome: 'interrupted' }
    });
  });

  it('bounds disconnected draining and records missing-usage fallback', async () => {
    const cancel = vi.fn();
    upstream.mockResolvedValueOnce(
      streamResponse(new ReadableStream({ cancel }))
    );
    const response = await handler(request('/chat/completions', true), context);
    vi.useFakeTimers();
    await response.body!.cancel();
    await vi.advanceTimersByTimeAsync(15_000);
    vi.useRealTimers();
    await Promise.all(pending);
    expect(upstream.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(await ledger()).toMatchObject({
      balance: 900,
      cost: 100,
      metadata: { stream_outcome: 'interrupted', usage_source: 'missing' }
    });
  });

  it('bounds all hung settlement and queue acknowledgements after delivery', async () => {
    faults.set('settle_api_usage', 'hang');
    faults.set('queue_api_usage_settlement', 'hang');
    upstream.mockResolvedValueOnce(streamResponse(sse.join('')));
    const response = await handler(request('/chat/completions', true), context);
    vi.useFakeTimers();
    expect(await response.text()).toBe(sse.join(''));
    await vi.advanceTimersByTimeAsync(12_200);
    await Promise.all(pending);
    expect(rpcCalls('settle_api_usage')).toHaveLength(3);
    expect(rpcCalls('queue_api_usage_settlement')).toHaveLength(3);
    expect(console.error).toHaveBeenCalledWith(
      '[ApiMarketplace] Usage settlement durability unconfirmed:',
      expect.anything()
    );
  });
});
