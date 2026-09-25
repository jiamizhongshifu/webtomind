import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createImageCharactersHandler } from '../../api/image/characters/index';

const mockState = vi.hoisted(() => ({
  userId: 'user-1' as string | null,
  referenceRows: [] as Array<{ id: string }>,
  deleteExisting: null as null | { id: string },
  insertCalls: 0,
  updateCalls: 0
}));

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*' };
}

function createSupabaseMock() {
  return {
    from: vi.fn((table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => {
        chain.operation = 'select';
        return chain;
      });
      chain.insert = vi.fn(async () => {
        mockState.insertCalls += 1;
        return { data: { id: 'new-card' }, error: null };
      });
      chain.update = vi.fn(() => {
        chain.operation = 'update';
        mockState.updateCalls += 1;
        return chain;
      });
      chain.eq = vi.fn(() => chain);
      chain.is = vi.fn(() => {
        if (chain.operation === 'update') {
          return Promise.resolve({ error: null });
        }
        return chain;
      });
      chain.in = vi.fn(async () => {
        if (table === 'image_reference_assets') {
          return { data: mockState.referenceRows, error: null };
        }
        return { data: [], error: null };
      });
      chain.maybeSingle = vi.fn(async () => ({
        data: mockState.deleteExisting,
        error: null
      }));
      return chain;
    }),
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn(async () => ({
          data: { signedUrl: 'https://signed.test/reference.png' },
          error: null
        }))
      }))
    }
  };
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe('image character API owner checks', () => {
  beforeEach(() => {
    mockState.userId = 'user-1';
    mockState.referenceRows = [];
    mockState.deleteExisting = null;
    mockState.insertCalls = 0;
    mockState.updateCalls = 0;
    process.env.SUPABASE_URL = 'https://supabase.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
  });

  it('rejects character creation when reference assets are not owned by the user', async () => {
    const handler = createImageCharactersHandler({
      getCorsHeadersForRequest: corsHeaders,
      getUserIdFromRequest: async () => mockState.userId,
      createSupabaseClient: () => createSupabaseMock() as never
    });

    const response = await handler(
      new Request('https://webtomind.test/api/image/characters', {
        method: 'POST',
        body: JSON.stringify({
          name: '角色 A',
          referenceImageIds: ['foreign-reference']
        })
      })
    );
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe('参考图不存在或无权访问');
    expect(mockState.insertCalls).toBe(0);
  });

  it('returns 404 instead of deleting when the character card is not owned by the user', async () => {
    const handler = createImageCharactersHandler({
      getCorsHeadersForRequest: corsHeaders,
      getUserIdFromRequest: async () => mockState.userId,
      createSupabaseClient: () => createSupabaseMock() as never
    });

    const response = await handler(
      new Request('https://webtomind.test/api/image/characters?id=foreign-card', {
        method: 'DELETE'
      })
    );
    const body = await readJson(response);

    expect(response.status).toBe(404);
    expect(body.error).toBe('角色卡不存在');
    expect(mockState.updateCalls).toBe(0);
  });
});
