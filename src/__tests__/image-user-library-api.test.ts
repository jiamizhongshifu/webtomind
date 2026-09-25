import { beforeEach, describe, expect, it } from 'vitest';
import { createImageUserLibraryHandler } from '../../api/image/user-library';

type QueryState = {
  table: string;
  operation: 'select' | 'upsert';
  payload?: unknown;
  filters: Array<{ op: string; column: string; value: unknown }>;
  selectColumns?: string;
};

type QueryResult = Promise<{ data: unknown; error: unknown }>;

const state: {
  userId: string | null;
  queries: QueryState[];
  resolveQuery: (query: QueryState, terminal: string) => QueryResult;
} = {
  userId: 'user-1',
  queries: [],
  resolveQuery: async () => ({ data: null, error: null })
};

function createBuilder(table: string) {
  const query: QueryState = {
    table,
    operation: 'select',
    filters: []
  };
  const builder = {
    select(columns?: string) {
      query.selectColumns = columns;
      return builder;
    },
    eq(column: string, value: unknown) {
      query.filters.push({ op: 'eq', column, value });
      return builder;
    },
    upsert(payload: unknown) {
      query.operation = 'upsert';
      query.payload = payload;
      return builder;
    },
    maybeSingle() {
      state.queries.push(query);
      return state.resolveQuery(query, 'maybeSingle');
    },
    single() {
      state.queries.push(query);
      return state.resolveQuery(query, 'single');
    }
  };
  return builder;
}

const handler = createImageUserLibraryHandler({
  createSupabaseClient: () =>
    ({
      from: createBuilder
    }) as never,
  getCorsHeadersForRequest: () => ({
    'Access-Control-Allow-Origin': '*'
  }),
  getUserIdFromRequest: async () => state.userId
});

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe('image user library API', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://supabase.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
    state.userId = 'user-1';
    state.queries = [];
    state.resolveQuery = async () => ({ data: null, error: null });
  });

  it('requires authentication', async () => {
    state.userId = null;

    const response = await handler(
      new Request('https://webtomind.test/api/image/user-library')
    );

    expect(response.status).toBe(401);
    expect(await readJson(response)).toMatchObject({
      error: '请先登录',
      presets: [],
      promptLibrary: []
    });
  });

  it('loads an empty library when the user has no row yet', async () => {
    const response = await handler(
      new Request('https://webtomind.test/api/image/user-library')
    );
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body.presets).toEqual([]);
    expect(body.promptLibrary).toEqual([]);
  });

  it('sanitizes and saves presets and prompt library items', async () => {
    let savedPayload: Record<string, unknown> | null = null;
    state.resolveQuery = async (query, terminal) => {
      if (
        query.table === 'image_creator_user_libraries' &&
        terminal === 'single'
      ) {
        savedPayload = query.payload as Record<string, unknown>;
        return {
          data: {
            presets: savedPayload.presets,
            prompt_library: savedPayload.prompt_library,
            updated_at: '2026-06-08T00:00:00.000Z'
          },
          error: null
        };
      }
      return { data: null, error: null };
    };

    const response = await handler(
      new Request('https://webtomind.test/api/image/user-library', {
        method: 'PUT',
        body: JSON.stringify({
          presets: [
            {
              id: 'preset-1',
              name: ' Beach pack ',
              selection: { character: 'asset-1' },
              settings: { model: 'gpt-image-2' },
              createdAt: 10
            }
          ],
          promptLibrary: [
            {
              id: 'prompt-1',
              title: ' Beach prompt ',
              prompt: '  sunset portrait  ',
              negativePrompt: ' blur ',
              createdAt: 12
            },
            {
              id: 'prompt-duplicate',
              title: 'Duplicate',
              prompt: 'sunset portrait',
              negativePrompt: 'blur',
              createdAt: 13
            },
            {
              id: 'invalid',
              prompt: ''
            }
          ]
        })
      })
    );
    const body = await readJson(response);
    const payload = savedPayload as unknown as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload.user_id).toBe('user-1');
    expect(payload.presets).toMatchObject([{ name: 'Beach pack' }]);
    expect(payload.prompt_library).toHaveLength(1);
    expect(body.promptLibrary).toMatchObject([
      {
        title: 'Beach prompt',
        prompt: 'sunset portrait',
        negativePrompt: 'blur'
      }
    ]);
  });
});
