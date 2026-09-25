import { beforeEach, describe, expect, it } from 'vitest';
import { createImageRecipesHandler } from '../../api/image/recipes';

type QueryState = {
  table: string;
  operation: 'select' | 'insert' | 'update';
  payload?: unknown;
  filters: Array<{ op: string; column: string; value: unknown }>;
  inFilters: Array<{ column: string; values: unknown[] }>;
  selectColumns?: string;
  limitCount?: number;
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
    filters: [],
    inFilters: []
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
    is(column: string, value: unknown) {
      query.filters.push({ op: 'is', column, value });
      return builder;
    },
    order() {
      return builder;
    },
    limit(count: number) {
      query.limitCount = count;
      state.queries.push(query);
      return state.resolveQuery(query, 'limit');
    },
    insert(payload: unknown) {
      query.operation = 'insert';
      query.payload = payload;
      return builder;
    },
    update(payload: unknown) {
      query.operation = 'update';
      query.payload = payload;
      return builder;
    },
    in(column: string, values: unknown[]) {
      query.inFilters.push({ column, values });
      state.queries.push(query);
      return state.resolveQuery(query, 'in');
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

const handler = createImageRecipesHandler({
  createSupabaseClient: () =>
    ({
      from: createBuilder
    }) as never,
  getCorsHeadersForRequest: () => ({
    'Access-Control-Allow-Origin': '*'
  }),
  getUserIdFromRequest: async () => state.userId
});

function recipeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'recipe-1',
    name: 'Pack',
    description: null,
    recipe_type: 'character_scene_pack',
    settings: {},
    selection: {},
    character_card_ids: [],
    character_reference_groups: [],
    scenes: [
      {
        id: 'scene-1',
        name: 'Scene 1',
        prompt: 'portrait',
        imageCount: 1,
        sortOrder: 0
      }
    ],
    metadata: {},
    created_at: '2026-06-07T00:00:00.000Z',
    updated_at: '2026-06-07T00:00:00.000Z',
    ...overrides
  };
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe('image recipes API', () => {
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
      new Request('https://webtomind.test/api/image/recipes')
    );

    expect(response.status).toBe(401);
    expect(await readJson(response)).toMatchObject({ error: '请先登录' });
  });

  it('creates a character scene pack and clamps scene imageCount', async () => {
    let savedPayload: Record<string, unknown> | null = null;
    state.resolveQuery = async (query, terminal) => {
      if (query.table === 'image_creator_recipes' && terminal === 'single') {
        savedPayload = query.payload as Record<string, unknown>;
        return {
          data: recipeRow({
            ...savedPayload,
            character_card_ids: savedPayload.character_card_ids || [],
            character_reference_groups:
              savedPayload.character_reference_groups || []
          }),
          error: null
        };
      }
      return { data: [], error: null };
    };

    const response = await handler(
      new Request('https://webtomind.test/api/image/recipes', {
        method: 'POST',
        body: JSON.stringify({
          name: ' Launch pack ',
          scenes: [{ prompt: 'scene prompt', imageCount: 9 }]
        })
      })
    );
    const body = await readJson(response);
    const payload = savedPayload as unknown as Record<string, unknown>;

    expect(response.status).toBe(201);
    expect(payload.recipe_type).toBe('character_scene_pack');
    expect(
      (payload.scenes as Array<{ imageCount: number }>)[0]?.imageCount
    ).toBe(4);
    expect(body.recipe).toMatchObject({ name: 'Launch pack' });
  });

  it('creates a style batch pack when recipeType is provided', async () => {
    let savedPayload: Record<string, unknown> | null = null;
    state.resolveQuery = async (query, terminal) => {
      if (query.table === 'image_creator_recipes' && terminal === 'single') {
        savedPayload = query.payload as Record<string, unknown>;
        return {
          data: recipeRow({
            ...savedPayload,
            character_card_ids: savedPayload.character_card_ids || [],
            character_reference_groups:
              savedPayload.character_reference_groups || []
          }),
          error: null
        };
      }
      return { data: [], error: null };
    };

    const response = await handler(
      new Request('https://webtomind.test/api/image/recipes', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Style batch',
          recipeType: 'style_batch_pack',
          scenes: [
            { prompt: 'base style' },
            { prompt: 'poster style', sortOrder: 1 }
          ]
        })
      })
    );
    const body = await readJson(response);
    const payload = savedPayload as unknown as Record<string, unknown>;

    expect(response.status).toBe(201);
    expect(payload.recipe_type).toBe('style_batch_pack');
    expect(body.recipe).toMatchObject({ recipeType: 'style_batch_pack' });
  });

  it('lists recipes with missing character and reference ids', async () => {
    state.resolveQuery = async (query, terminal) => {
      if (query.table === 'image_creator_recipes' && terminal === 'limit') {
        return {
          data: [
            recipeRow({
              character_card_ids: ['card-ok', 'card-missing'],
              character_reference_groups: [
                {
                  characterCardId: 'card-ok',
                  label: 'A',
                  referenceImageIds: ['ref-ok', 'ref-missing']
                }
              ]
            })
          ],
          error: null
        };
      }
      if (query.table === 'image_character_cards') {
        return { data: [{ id: 'card-ok' }], error: null };
      }
      if (query.table === 'image_reference_assets') {
        return { data: [{ id: 'ref-ok' }], error: null };
      }
      return { data: [], error: null };
    };

    const response = await handler(
      new Request('https://webtomind.test/api/image/recipes')
    );
    const body = await readJson(response);
    const recipe = (body.recipes as Array<Record<string, unknown>>)[0];

    expect(response.status).toBe(200);
    expect(recipe.missingCharacterCardIds).toEqual(['card-missing']);
    expect(recipe.missingReferenceImageIds).toEqual(['ref-missing']);
  });

  it('returns 404 when patching a recipe owned by another user', async () => {
    state.resolveQuery = async () => ({ data: null, error: null });

    const response = await handler(
      new Request('https://webtomind.test/api/image/recipes?id=recipe-other', {
        method: 'PATCH',
        body: JSON.stringify({
          name: 'Other pack',
          scenes: [{ prompt: 'scene prompt' }]
        })
      })
    );

    expect(response.status).toBe(404);
    expect(await readJson(response)).toMatchObject({
      error: '场景套件不存在或无权访问'
    });
  });

  it('returns 404 when deleting a recipe owned by another user', async () => {
    state.resolveQuery = async () => ({ data: null, error: null });

    const response = await handler(
      new Request('https://webtomind.test/api/image/recipes?id=recipe-other', {
        method: 'DELETE'
      })
    );

    expect(response.status).toBe(404);
    expect(await readJson(response)).toMatchObject({
      error: '场景套件不存在或无权访问'
    });
  });
});
