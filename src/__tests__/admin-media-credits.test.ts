import { describe, expect, it, vi } from 'vitest';
import { createMediaCreditsAdminHandler } from '../../api/admin/media-credits';

function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*'
  };
}

class QueryMock {
  filters: Array<{ op: string; column: string; value: unknown }> = [];
  orders: Array<{ column: string; ascending?: boolean }> = [];
  selected = '';
  limitValue = 0;

  constructor(
    private rows: Array<Record<string, unknown>>,
    private error: { code?: string; message: string } | null = null,
    private count: number | null = null
  ) {}

  select(value: string) {
    this.selected = value;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ op: 'eq', column, value });
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push({ op: 'gte', column, value });
    return this;
  }

  lte(column: string, value: unknown) {
    this.filters.push({ op: 'lte', column, value });
    return this;
  }

  in(column: string, value: unknown[]) {
    this.filters.push({ op: 'in', column, value });
    return this;
  }

  order(column: string, options: { ascending?: boolean }) {
    this.orders.push({ column, ascending: options.ascending });
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  then(
    resolve: (value: {
      data: Array<Record<string, unknown>> | null;
      error: { code?: string; message: string } | null;
      count?: number | null;
    }) => void,
    reject?: (reason: unknown) => void
  ) {
    return Promise.resolve({
      data: this.error ? null : this.rows,
      error: this.error,
      count: this.count
    }).then(resolve, reject);
  }
}

function createHandler(
  input: {
    admin?: Awaited<
      ReturnType<
        typeof import('../../api/admin/prompt-case-auth').assertPromptCaseAdmin
      >
    >;
    wallets?: Array<Record<string, unknown>>;
    summary?: Array<Record<string, unknown>>;
    transactions?: Array<Record<string, unknown>>;
    summaryError?: { code?: string; message: string } | null;
    rpcResult?: unknown;
    rpcError?: { message: string } | null;
    supabaseConfigured?: boolean;
    now?: Date;
  } = {}
) {
  const wallets = new QueryMock(
    input.wallets || [],
    null,
    input.wallets?.length || 0
  );
  const summary = new QueryMock(
    input.summary || [],
    input.summaryError || null
  );
  const transactions = new QueryMock(input.transactions || [], null);
  const from = vi.fn((table: string) => {
    if (table === 'user_credits') return wallets;
    if (table === 'media_credit_daily_summary') return summary;
    if (table === 'credit_transactions') return transactions;
    throw new Error(`Unexpected table ${table}`);
  });
  const rpc = vi.fn().mockResolvedValue({
    data: input.rpcResult ?? { success: true, delta: 500 },
    error: input.rpcError || null
  });
  const handler = createMediaCreditsAdminHandler({
    getCorsHeadersForRequest: corsHeaders,
    assertPromptCaseAdmin: vi.fn().mockResolvedValue(
      input.admin || {
        ok: true,
        status: 200,
        userId: 'admin-user',
        email: 'admin@example.com'
      }
    ),
    getSupabaseAdmin: () =>
      input.supabaseConfigured === false
        ? null
        : ({
            from,
            rpc
          } as never),
    now: () => input.now || new Date('2026-06-30T12:00:00.000Z')
  });
  return { handler, from, rpc, wallets, summary, transactions };
}

describe('admin media credits API', () => {
  it('requires prompt-case admin access', async () => {
    const { handler, from } = createHandler({
      admin: {
        ok: false,
        status: 403,
        error: 'Prompt case admin access required'
      }
    });

    const response = await handler(
      new Request('https://webtomind.test/api/admin/media-credits')
    );

    expect(response.status).toBe(403);
    expect(await readJson(response)).toMatchObject({
      error: 'Prompt case admin access required'
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('returns wallet, daily summary, transaction rows, and bounded totals', async () => {
    const { handler, from, wallets, summary, transactions } = createHandler({
      wallets: [
        {
          user_id: 'user-1',
          media_credits: 800,
          promo_media_credits: 200
        }
      ],
      summary: [
        {
          summary_date: '2026-06-30',
          source: 'image_generation',
          transaction_count: 3,
          media_delta: -300,
          promo_media_delta: -50,
          granted: 0,
          refunded: 100,
          consumed: 350
        }
      ],
      transactions: [
        {
          id: 'tx-1',
          user_id: 'user-1',
          credit_type: 'mixed',
          amount: -350
        }
      ]
    });

    const response = await handler(
      new Request(
        'https://webtomind.test/api/admin/media-credits?from=2026-06-01&to=2026-06-30&userId=user-1&source=image_generation&limit=9999'
      )
    );
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledWith('user_credits');
    expect(from).toHaveBeenCalledWith('media_credit_daily_summary');
    expect(from).toHaveBeenCalledWith('credit_transactions');
    expect(wallets.limitValue).toBe(500);
    expect(summary.filters).toEqual([
      { op: 'gte', column: 'summary_date', value: '2026-06-01' },
      { op: 'lte', column: 'summary_date', value: '2026-06-30' },
      { op: 'eq', column: 'source', value: 'image_generation' }
    ]);
    expect(transactions.filters).toEqual(
      expect.arrayContaining([
        {
          op: 'in',
          column: 'credit_type',
          value: ['media', 'promo_media', 'mixed']
        },
        { op: 'eq', column: 'user_id', value: 'user-1' },
        { op: 'eq', column: 'source', value: 'image_generation' }
      ])
    );
    expect(body.totals).toMatchObject({
      mediaDelta: -300,
      promoMediaDelta: -50,
      refunded: 100,
      consumed: 350,
      transactionCount: 3
    });
  });

  it('performs audited admin media credit adjustments through the atomic RPC', async () => {
    const { handler, rpc } = createHandler({
      rpcResult: {
        success: true,
        credit_type: 'promo_media',
        delta: 1200,
        balance: { media: 0, promoMedia: 1200 }
      }
    });

    const response = await handler(
      new Request('https://webtomind.test/api/admin/media-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'user-123',
          amount: 1200,
          creditType: 'promo_media',
          reason: 'founder compensation',
          idempotencyKey: 'manual-adjustment-1'
        })
      })
    );
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('admin_adjust_media_credits', {
      p_user_id: 'user-123',
      p_delta: 1200,
      p_credit_type: 'promo_media',
      p_source: 'admin_promo_media_adjustment',
      p_metadata: expect.objectContaining({
        reason: 'founder compensation',
        adjustedBy: 'admin-user',
        adjustedByEmail: 'admin@example.com',
        idempotency_key: 'manual-adjustment-1'
      })
    });
    expect(body.result).toMatchObject({
      credit_type: 'promo_media',
      delta: 1200
    });
  });

  it('rejects unsafe admin adjustments before calling the RPC', async () => {
    const { handler, rpc } = createHandler();
    const response = await handler(
      new Request('https://webtomind.test/api/admin/media-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'user-123',
          amount: 1_000_001
        })
      })
    );

    expect(response.status).toBe(400);
    expect(await readJson(response)).toMatchObject({
      error: 'amount cannot exceed 1000000'
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
