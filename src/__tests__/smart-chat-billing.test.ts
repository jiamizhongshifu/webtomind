import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  userId: 'user-1',
  events: [] as Array<{ type: 'rpc' | 'fetch'; name: string }>,
  rpcResults: new Map<string, unknown>()
}));

vi.mock('../../api/utils/auth', () => ({
  getCorsHeadersForRequest: () => ({ 'Access-Control-Allow-Origin': '*' }),
  getUserIdFromRequest: async () => state.userId,
  getSupabaseAdmin: () => createSupabaseAdmin()
}));

function createSupabaseAdmin() {
  return {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      state.events.push({ type: 'rpc', name });
      if (state.rpcResults.has(name)) {
        return state.rpcResults.get(name);
      }
      if (name === 'consume_credits') {
        return {
          data: {
            success: true,
            consumed: 1,
            credit_type: 'daily',
            credit_breakdown: { daily: 1 }
          },
          error: null
        };
      }
      if (name === 'consume_model_rate_limit') {
        return {
          data: { allowed: true, remaining: 19, retry_after: 60 },
          error: null
        };
      }
      if (name === 'calculate_credit_cost') {
        return { data: 1, error: null };
      }
      if (name === 'refund_generation_credit') {
        return {
          data: { success: true, refunded: args.p_amount || 1 },
          error: null
        };
      }
      return { data: { success: true }, error: null };
    }),
    from: (table: string) => {
      type Builder = {
        select: () => Builder;
        eq: () => Builder;
        maybeSingle: () => Promise<{ data: null; error: null }>;
        upsert: () => Promise<{ data: null; error: null }>;
        insert: () => Promise<{ data: null; error: null }>;
      };
      const builder: Builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => {
          if (table === 'user_credits') return { data: null, error: null };
          return { data: null, error: null };
        },
        upsert: async () => ({ data: null, error: null }),
        insert: async () => ({ data: null, error: null })
      };
      return builder;
    }
  };
}

function sseResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
        controller.close();
      }
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' }
    }
  );
}

async function readStream(response: Response) {
  return response.text();
}

describe('smart-chat text billing', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    state.userId = 'user-1';
    state.events = [];
    state.rpcResults = new Map();
    process.env.DEEPSEEK_API_KEY = 'deepseek-key';
    delete process.env.DEEPSEEK_MODEL;
    delete process.env.OPENAI_MODEL;
    delete process.env.GEMINI_API_KEY;
    process.env.GEMINI_OFFICIAL_ENABLED = 'false';
  });

  it('prepays text credits before calling the model provider', async () => {
    process.env.DEEPSEEK_MODEL = 'deepseek-v4-pro';
    process.env.OPENAI_MODEL = 'deepseek-chat';
    let providerModel = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        state.events.push({ type: 'fetch', name: 'provider' });
        providerModel = JSON.parse(String(init?.body)).model;
        return sseResponse([
          'data: {"choices":[{"delta":{"content":"你好"}}]}\n\n',
          'data: [DONE]\n\n'
        ]);
      })
    );
    const { default: handler } = await import('../../api/agent/smart-chat');

    const response = await handler(
      new Request('https://webtomind.test/api/agent/smart-chat', {
        method: 'POST',
        body: JSON.stringify({ prompt: '说一句话', mode: 'ask' })
      })
    );
    const body = await readStream(response);

    expect(body).toContain('你好');
    expect(providerModel).toBe('deepseek-v4-flash');
    const consumeIndex = state.events.findIndex(
      (event) => event.type === 'rpc' && event.name === 'consume_credits'
    );
    const providerIndex = state.events.findIndex(
      (event) => event.type === 'fetch' && event.name === 'provider'
    );
    expect(consumeIndex).toBeGreaterThanOrEqual(0);
    expect(providerIndex).toBeGreaterThan(consumeIndex);
  });

  it('refunds prepaid text credits when all text providers fail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        state.events.push({ type: 'fetch', name: 'provider' });
        return new Response('provider down', { status: 503 });
      })
    );
    const { default: handler } = await import('../../api/agent/smart-chat');

    const response = await handler(
      new Request('https://webtomind.test/api/agent/smart-chat', {
        method: 'POST',
        body: JSON.stringify({ prompt: '说一句话', mode: 'ask' })
      })
    );
    const body = await readStream(response);

    expect(body).toContain('AI 服务暂时不可用');
    expect(
      state.events.some(
        (event) => event.type === 'rpc' && event.name === 'refund_generation_credit'
      )
    ).toBe(true);
  });

  it('refunds prepaid text credits when the provider stream ends without DONE', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse(['data: {"choices":[{"delta":{"content":"半截回答"}}]}\n\n'])
      )
    );
    const { default: handler } = await import('../../api/agent/smart-chat');

    const response = await handler(
      new Request('https://webtomind.test/api/agent/smart-chat', {
        method: 'POST',
        body: JSON.stringify({ prompt: '说一句话', mode: 'ask' })
      })
    );
    const body = await readStream(response);

    expect(body).toContain('missing [DONE]');
    expect(
      state.events.some(
        (event) => event.type === 'rpc' && event.name === 'refund_generation_credit'
      )
    ).toBe(true);
    expect(
      state.events.some(
        (event) => event.type === 'rpc' && event.name === 'calculate_credit_cost'
      )
    ).toBe(false);
  });

  it('fails closed before image generation when credit charging errors', async () => {
    state.rpcResults.set('consume_credits', {
      data: null,
      error: { message: 'database unavailable' }
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { default: handler } = await import('../../api/agent/smart-chat');

    const response = await handler(
      new Request('https://webtomind.test/api/agent/smart-chat', {
        method: 'POST',
        body: JSON.stringify({
          prompt: '生成一张海报',
          mode: 'agent',
          feature: 'image'
        })
      })
    );
    const body = await readStream(response);

    expect(body).toContain('CREDIT_SERVICE_UNAVAILABLE');
    expect(body).toContain('积分服务暂时不可用');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
