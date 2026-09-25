import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../../api/api-marketplace/usage';
import { requireUserContextPublic } from '../../api/api-marketplace/runtime';
import { getAccessToken } from '../services/workspace-api';
import { getApiUsage } from '../services/api-marketplace';

vi.mock('../../api/api-marketplace/runtime', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../api/api-marketplace/runtime')>();
  return {
    ...actual,
    requireUserContextPublic: vi.fn()
  };
});

vi.mock('../services/workspace-api', () => ({
  getAccessToken: vi.fn()
}));

const mockedRequireUserContext = vi.mocked(requireUserContextPublic);
const mockedGetAccessToken = vi.mocked(getAccessToken);

type QueryChain = {
  data: unknown;
  error: unknown;
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
};

function makeChain(data: unknown, error: unknown = null): QueryChain {
  const query = { data, error } as QueryChain;
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.order = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.maybeSingle = vi.fn(() => query);
  query.single = vi.fn(() => query);
  return query;
}

function createSupabase(options: {
  ownedKey?: unknown;
  keyError?: unknown;
  usageRecords?: unknown;
  usageError?: unknown;
  totalSum?: unknown;
  totalError?: unknown;
} = {}) {
  const from = vi.fn((table: string) => {
    if (table === 'api_keys') {
      return {
        select: vi.fn(() => makeChain(options.ownedKey ?? null, options.keyError ?? null))
      };
    }
    return {
      select: vi.fn(() => {
        return makeChain(
          options.usageError ? null : options.usageRecords ?? [],
          options.usageError ?? null
        );
      })
    };
  });
  return {
    from,
    rpc: vi.fn(async (name: string) => {
      if (name === 'get_api_usage_total') {
        return {
          data: options.totalError ? null : options.totalSum ?? 0,
          error: options.totalError ?? null
        };
      }
      return { data: null, error: new Error(`unexpected rpc: ${name}`) };
    })
  };
}

function request(
  url = 'https://webtomind.test/api/api-marketplace/usage',
  method = 'GET'
) {
  return new Request(url, { method });
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

const USAGE_ROW = {
  id: 'usage-1',
  key_id: 'key-1',
  request_id: 'req-1',
  status: 'succeeded',
  model: 'gpt-5.6-luna',
  endpoint: '/v1/chat/completions',
  reserved_cents: 10,
  actual_customer_cents: 7,
  upstream_cost_cents: 5,
  input_tokens: 1200,
  output_tokens: 340,
  total_tokens: 1540,
  settled_at: '2026-08-25T12:00:00.000Z',
  created_at: '2026-08-25T12:00:00.000Z'
};

describe('API marketplace usage handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the latest usage and customer total for the authenticated user', async () => {
    const supabase = createSupabase({
      usageRecords: [USAGE_ROW],
      totalSum: 137
    });
    mockedRequireUserContext.mockResolvedValue({
      userId: 'user-1',
      email: 'user@example.com',
      supabase: supabase as never
    });

    const response = await handler(request());
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body.keyId).toBeNull();
    expect(body.limit).toBe(50);
    expect(body.totalSpentCents).toBe(137);
    const usage = body.usage as Array<Record<string, unknown>>;
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({
      id: 'usage-1',
      key_id: 'key-1',
      request_id: 'req-1',
      status: 'succeeded',
      model: 'gpt-5.6-luna',
      endpoint: '/v1/chat/completions',
      reserved_cents: 10,
      actual_customer_cents: 7,
      input_tokens: 1200,
      output_tokens: 340,
      total_tokens: 1540,
      settled_at: expect.any(String),
      created_at: expect.any(String)
    });
    // The customer payload must not leak the reseller cost basis or metadata.
    const payloadText = JSON.stringify(body);
    expect(payloadText).not.toContain('upstream_cost_cents');
    expect(payloadText).not.toContain('"metadata"');
    expect(payloadText).not.toContain('provider');
    expect(supabase.from).toHaveBeenCalledWith('api_usage_logs');
    expect(supabase.from).not.toHaveBeenCalledWith('api_keys');
  });

  it('filters by an owned keyId and honors a small limit', async () => {
    const supabase = createSupabase({
      ownedKey: { id: 'key-1' },
      usageRecords: [USAGE_ROW],
      totalSum: 7
    });
    mockedRequireUserContext.mockResolvedValue({
      userId: 'user-1',
      email: 'user@example.com',
      supabase: supabase as never
    });

    const response = await handler(
      request('https://webtomind.test/api/api-marketplace/usage?keyId=key-1&limit=3')
    );
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body.keyId).toBe('key-1');
    expect(body.limit).toBe(3);
    expect(supabase.from).toHaveBeenNthCalledWith(1, 'api_keys');
    expect(supabase.from).toHaveBeenNthCalledWith(2, 'api_usage_logs');
  });

  it('returns 404 when the keyId does not belong to the user and never reads usage', async () => {
    const supabase = createSupabase({ ownedKey: null });
    mockedRequireUserContext.mockResolvedValue({
      userId: 'user-1',
      email: 'user@example.com',
      supabase: supabase as never
    });

    const response = await handler(
      request('https://webtomind.test/api/api-marketplace/usage?keyId=other-key')
    );

    expect(response.status).toBe(404);
    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(supabase.from).toHaveBeenCalledWith('api_keys');
    expect(supabase.from).not.toHaveBeenCalledWith('api_usage_logs');
  });

  it('rejects unauthenticated requests', async () => {
    mockedRequireUserContext.mockResolvedValue(null);
    const response = await handler(request());
    expect(response.status).toBe(401);
  });

  it('caps the limit at 50', async () => {
    const supabase = createSupabase({ usageRecords: [], totalSum: 0 });
    mockedRequireUserContext.mockResolvedValue({
      userId: 'user-1',
      email: 'user@example.com',
      supabase: supabase as never
    });
    const response = await handler(
      request('https://webtomind.test/api/api-marketplace/usage?limit=999')
    );
    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body.limit).toBe(50);
  });

  it('returns 503 when the usage list query fails', async () => {
    const supabase = createSupabase({ usageError: new Error('db down') });
    mockedRequireUserContext.mockResolvedValue({
      userId: 'user-1',
      email: 'user@example.com',
      supabase: supabase as never
    });
    const response = await handler(request());
    expect(response.status).toBe(503);
  });

  it('returns 503 when the total query fails', async () => {
    const supabase = createSupabase({ totalError: new Error('db down') });
    mockedRequireUserContext.mockResolvedValue({
      userId: 'user-1',
      email: 'user@example.com',
      supabase: supabase as never
    });
    const response = await handler(request());
    expect(response.status).toBe(503);
  });

  it('rejects non-GET methods', async () => {
    const response = await handler(request(undefined, 'POST'));
    expect(response.status).toBe(405);
  });
});

describe('getApiUsage client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('requests usage with optional keyId and limit query parameters', async () => {
    mockedGetAccessToken.mockReturnValue('test-token');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        usage: [USAGE_ROW],
        totalSpentCents: 137,
        limit: 50,
        keyId: 'key-1'
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getApiUsage({ keyId: 'key-1', limit: 50 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'http://localhost:3000/api/api-marketplace/usage?keyId=key-1&limit=50'
    );
    expect(new Headers(init.headers).get('Authorization')).toBe(
      'Bearer test-token'
    );
    expect(result.usage[0].actual_customer_cents).toBe(7);
    expect(result.totalSpentCents).toBe(137);
  });

  it('omits query parameters when no filter is requested', async () => {
    mockedGetAccessToken.mockReturnValue(null);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ usage: [], totalSpentCents: 0, limit: 50, keyId: null })
    });
    vi.stubGlobal('fetch', fetchMock);

    await getApiUsage();

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('http://localhost:3000/api/api-marketplace/usage');
  });
});
