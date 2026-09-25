import { describe, expect, it, vi } from 'vitest';
import { createAiUsageSummaryHandler } from '../../api/admin/ai-usage/summary';

function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*'
  };
}

class SummaryQueryMock {
  filters: Array<{ op: string; column: string; value: unknown }> = [];
  orders: Array<{ column: string; ascending?: boolean }> = [];
  selected = '';
  limitValue = 0;

  constructor(
    private rows: Array<Record<string, unknown>>,
    private error: { code?: string; message: string } | null = null
  ) {}

  select(value: string) {
    this.selected = value;
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

  eq(column: string, value: unknown) {
    this.filters.push({ op: 'eq', column, value });
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
    }) => void,
    reject?: (reason: unknown) => void
  ) {
    return Promise.resolve({
      data: this.error ? null : this.rows,
      error: this.error
    }).then(resolve, reject);
  }
}

function createHandler(input: {
  admin?: Awaited<
    ReturnType<
      typeof import('../../api/admin/prompt-case-drafts/_shared').assertPromptCaseAdmin
    >
  >;
  rows?: Array<Record<string, unknown>>;
  error?: { code?: string; message: string } | null;
  supabaseConfigured?: boolean;
  now?: Date;
} = {}) {
  const query = new SummaryQueryMock(input.rows || [], input.error || null);
  const from = vi.fn(() => query);
  const handler = createAiUsageSummaryHandler({
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
            from
          } as never),
    now: () => input.now || new Date('2026-06-18T12:00:00.000Z')
  });
  return { handler, query, from };
}

describe('admin AI usage summary API', () => {
  it('requires prompt-case admin access before reading usage summary', async () => {
    const { handler, from } = createHandler({
      admin: {
        ok: false,
        status: 403,
        error: 'Prompt case admin access required'
      }
    });

    const response = await handler(
      new Request('https://webtomind.test/api/admin/ai-usage/summary')
    );

    expect(response.status).toBe(403);
    expect(await readJson(response)).toMatchObject({
      error: 'Prompt case admin access required'
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('queries the read-only summary view with bounded filters and maps totals', async () => {
    const { handler, query, from } = createHandler({
      rows: [
        {
          usage_date: '2026-06-18',
          provider: 'openai',
          model: 'gpt-image-2',
          source: 'image_create_page',
          event_count: '3',
          succeeded_count: '2',
          failed_count: '1',
          input_tokens: '100',
          output_tokens: '20',
          total_tokens: '120',
          image_count: '2',
          avg_latency_ms: '1200',
          p95_latency_ms: '1900'
        },
        {
          usage_date: '2026-06-18',
          provider: 'gemini',
          model: 'gemini-2.5-flash',
          source: 'workspace_studio_ai',
          event_count: 1,
          succeeded_count: 1,
          failed_count: 0,
          input_tokens: 80,
          output_tokens: 40,
          total_tokens: 120,
          image_count: 0,
          avg_latency_ms: null,
          p95_latency_ms: null
        }
      ]
    });

    const response = await handler(
      new Request(
        'https://webtomind.test/api/admin/ai-usage/summary?from=2026-06-01&to=2026-06-18&provider=openai&source=image_create_page&limit=5000'
      )
    );
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledWith('ai_usage_daily_summary');
    expect(query.selected).toBe('*');
    expect(query.limitValue).toBe(1000);
    expect(query.filters).toEqual([
      { op: 'gte', column: 'usage_date', value: '2026-06-01' },
      { op: 'lte', column: 'usage_date', value: '2026-06-18' },
      { op: 'eq', column: 'provider', value: 'openai' },
      { op: 'eq', column: 'source', value: 'image_create_page' }
    ]);
    expect(Array.isArray(body.items) ? body.items[0] : null).toMatchObject({
      usageDate: '2026-06-18',
      provider: 'openai',
      model: 'gpt-image-2',
      source: 'image_create_page',
      eventCount: 3,
      succeededCount: 2,
      failedCount: 1,
      totalTokens: 120,
      imageCount: 2,
      avgLatencyMs: 1200,
      p95LatencyMs: 1900
    });
    expect(body.totals).toMatchObject({
      eventCount: 4,
      succeededCount: 3,
      failedCount: 1,
      inputTokens: 180,
      outputTokens: 60,
      totalTokens: 240,
      imageCount: 2
    });
  });

  it('defaults to the last 30 days and rejects invalid ranges', async () => {
    const { handler: defaultHandler, query } = createHandler();
    const defaultResponse = await defaultHandler(
      new Request('https://webtomind.test/api/admin/ai-usage/summary')
    );
    expect(defaultResponse.status).toBe(200);
    expect(query.filters.slice(0, 2)).toEqual([
      { op: 'gte', column: 'usage_date', value: '2026-05-20' },
      { op: 'lte', column: 'usage_date', value: '2026-06-18' }
    ]);

    const { handler } = createHandler();
    const response = await handler(
      new Request(
        'https://webtomind.test/api/admin/ai-usage/summary?from=2026-06-18&to=2026-06-01'
      )
    );

    expect(response.status).toBe(400);
    expect(await readJson(response)).toMatchObject({
      error: 'from must be on or before to'
    });
  });

  it('returns setup guidance when the summary view is missing', async () => {
    const { handler } = createHandler({
      error: {
        code: 'PGRST205',
        message: 'Could not find ai_usage_daily_summary'
      }
    });

    const response = await handler(
      new Request('https://webtomind.test/api/admin/ai-usage/summary')
    );
    const body = await readJson(response);

    expect(response.status).toBe(424);
    expect(body).toMatchObject({
      needsSetup: true,
      items: []
    });
  });
});
