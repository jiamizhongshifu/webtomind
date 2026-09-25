import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSupabaseAdminMock, refreshSupabaseSignedStorageUrlsMock } =
  vi.hoisted(() => ({
    getSupabaseAdminMock: vi.fn(),
    refreshSupabaseSignedStorageUrlsMock: vi.fn(
      async (_supabase: unknown, urls: string[]) =>
        urls.map((url) => `${url}?fresh=1`)
    )
  }));

vi.mock('../../api/admin/prompt-case-auth', () => ({
  assertPromptCaseAdmin: vi.fn(async () => ({
    ok: true,
    status: 200,
    email: 'admin@example.com',
    userId: 'admin-user'
  })),
  getSupabaseAdmin: getSupabaseAdminMock,
  PROMPT_CASE_ADMIN_EMAIL: 'admin@example.com'
}));

vi.mock('../../api/utils/signed-storage-url', () => ({
  refreshSupabaseSignedStorageUrls: refreshSupabaseSignedStorageUrlsMock
}));

import handler from '../../api/admin/prompt-cases';

function createListSupabaseMock(rows: Array<Record<string, unknown>>) {
  const calls = {
    select: [] as Array<{ columns: string; options?: Record<string, unknown> }>,
    filters: [] as Array<[string, unknown]>,
    orders: [] as Array<[string, Record<string, unknown> | undefined]>,
    range: [] as Array<[number, number]>
  };
  const query = {
    select(columns: string, options?: Record<string, unknown>) {
      calls.select.push({ columns, options });
      return this;
    },
    is(field: string, value: unknown) {
      calls.filters.push([field, value]);
      return this;
    },
    eq(field: string, value: unknown) {
      calls.filters.push([field, value]);
      return this;
    },
    or() {
      return this;
    },
    order(field: string, options?: Record<string, unknown>) {
      calls.orders.push([field, options]);
      return this;
    },
    async range(from: number, to: number) {
      calls.range.push([from, to]);
      return { data: rows, error: null, count: 250 };
    }
  };
  const sb = {
    from(table: string) {
      expect(table).toBe('prompt_cases');
      return query;
    }
  };
  return { sb, calls };
}

describe('prompt case admin pagination', () => {
  beforeEach(() => {
    getSupabaseAdminMock.mockReset();
    refreshSupabaseSignedStorageUrlsMock.mockClear();
  });

  it('returns one bounded summary page and refreshes all page images in one batch', async () => {
    const { sb, calls } = createListSupabaseMock([
      {
        id: 'case-a',
        image_url: 'https://storage.test/a.webp',
        image_urls: [
          'https://storage.test/a.webp',
          'https://storage.test/a-2.webp'
        ],
        title: '案例 A',
        prompt_preview: '摘要 A',
        featured: true,
        sort_order: 1,
        created_at: '2026-08-05T00:00:00.000Z'
      },
      {
        id: 'case-b',
        image_url: 'https://storage.test/b.webp',
        image_urls: ['https://storage.test/b.webp'],
        title: '案例 B',
        prompt_preview: '摘要 B',
        featured: false,
        sort_order: 2,
        created_at: '2026-08-04T00:00:00.000Z'
      }
    ]);
    getSupabaseAdminMock.mockReturnValue(sb);

    const response = await handler(
      new Request(
        'https://webtomind.com/api/admin/prompt-cases?offset=100&limit=100&sort=created-desc&featured=1'
      )
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(calls.select[0].columns).not.toBe('*');
    expect(calls.select[0].columns).not.toContain('prompt,');
    expect(calls.select[0].options).toEqual({ count: 'exact' });
    expect(calls.filters).toContainEqual(['featured', true]);
    expect(calls.range).toEqual([[100, 199]]);
    expect(calls.orders.at(-1)?.[0]).toBe('id');
    expect(refreshSupabaseSignedStorageUrlsMock).toHaveBeenCalledTimes(1);
    expect(refreshSupabaseSignedStorageUrlsMock).toHaveBeenCalledWith(sb, [
      'https://storage.test/a.webp',
      'https://storage.test/a-2.webp',
      'https://storage.test/b.webp'
    ]);
    expect(result.cases).toHaveLength(2);
    expect(result.cases[0]).toMatchObject({
      id: 'case-a',
      prompt: '',
      promptPreview: '摘要 A'
    });
    expect(result.pagination).toEqual({
      offset: 100,
      limit: 100,
      total: 250,
      hasMore: true,
      nextOffset: 102
    });
  });

  it('paginates by the exact generate rate without loading full prompts', async () => {
    const metricRows = [
      { id: 'case-volume', view_count: 1000, generate_count: 200 },
      { id: 'case-rate', view_count: 10, generate_count: 5 },
      { id: 'case-low', view_count: 100, generate_count: 10 }
    ];
    const details = new Map(
      metricRows.map((item) => [
        item.id,
        {
          ...item,
          image_url: `https://storage.test/${item.id}.webp`,
          image_urls: [`https://storage.test/${item.id}.webp`],
          title: item.id,
          prompt_preview: `${item.id} preview`
        }
      ])
    );
    const sb = {
      from() {
        let selectedColumns = '';
        return {
          select(columns: string) {
            selectedColumns = columns;
            return this;
          },
          is() {
            return this;
          },
          eq() {
            return this;
          },
          or() {
            return this;
          },
          async range() {
            expect(selectedColumns).toBe('id,view_count,generate_count');
            return { data: metricRows, error: null };
          },
          async in(_field: string, ids: string[]) {
            expect(selectedColumns).not.toContain('prompt,');
            return {
              data: ids.map((id) => details.get(id)),
              error: null
            };
          }
        };
      }
    };
    getSupabaseAdminMock.mockReturnValue(sb);

    const response = await handler(
      new Request(
        'https://webtomind.com/api/admin/prompt-cases?sort=generate-rate&offset=0&limit=2'
      )
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.cases.map((item: { id: string }) => item.id)).toEqual([
      'case-rate',
      'case-volume'
    ]);
    expect(result.pagination).toEqual({
      offset: 0,
      limit: 2,
      total: 3,
      hasMore: true,
      nextOffset: 2
    });
  });
});
