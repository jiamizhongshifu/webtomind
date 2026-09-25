import { describe, expect, it } from 'vitest';

import handler, {
  analyzePromptCaseMirrorState,
  repairPromptCaseMirrors
} from '../../api/admin/prompt-cases';

type PromptCaseRow = Record<string, unknown>;

class PromptCaseQuery {
  private filters: Array<{ field: string; value: unknown }> = [];
  private limitCount: number | null = null;
  private action: 'select' | 'update' | 'insert' = 'select';
  private patch: PromptCaseRow | null = null;
  private insertRow: PromptCaseRow | null = null;

  constructor(
    private rows: PromptCaseRow[],
    private updates: PromptCaseRow[],
    private inserts: PromptCaseRow[]
  ) {}

  select() {
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push({ field, value });
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  update(patch: PromptCaseRow) {
    this.action = 'update';
    this.patch = patch;
    return this;
  }

  insert(row: PromptCaseRow) {
    this.action = 'insert';
    this.insertRow = row;
    return this;
  }

  async single() {
    if (this.action === 'insert') {
      const row = {
        id: `inserted-${this.inserts.length + 1}`,
        ...this.insertRow
      };
      this.rows.push(row);
      this.inserts.push(row);
      return { data: { id: row.id }, error: null };
    }

    if (this.action === 'update') {
      const row = this.applyFilters(this.rows)[0];
      if (!row) return { data: null, error: { message: 'not found' } };
      Object.assign(row, this.patch);
      this.updates.push({ id: row.id, ...this.patch });
      return { data: { id: row.id }, error: null };
    }

    const row = this.applyFilters(this.rows)[0] || null;
    return { data: row, error: null };
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute() {
    const data = this.applyFilters(this.rows);
    return { data, error: null };
  }

  private applyFilters(rows: PromptCaseRow[]) {
    let result = rows.filter((row) =>
      this.filters.every(({ field, value }) => row[field] === value)
    );
    if (this.limitCount !== null) result = result.slice(0, this.limitCount);
    return result;
  }
}

function createPromptCaseSupabaseMock(rows: PromptCaseRow[]) {
  const updates: PromptCaseRow[] = [];
  const inserts: PromptCaseRow[] = [];
  const sb = {
    from(table: string) {
      expect(table).toBe('prompt_cases');
      return new PromptCaseQuery(rows, updates, inserts);
    }
  } as unknown as Parameters<typeof repairPromptCaseMirrors>[0];

  return { sb, rows, updates, inserts };
}

describe('prompt case mirror governance', () => {
  it('diagnoses missing, stale, duplicate, and orphan English mirrors', () => {
    const sourceId = '11111111-1111-1111-1111-111111111111';
    const diagnostic = analyzePromptCaseMirrorState([
      {
        id: sourceId,
        locale: 'zh-CN',
        deleted_at: null,
        image_url: 'https://example.com/source.webp',
        image_urls: ['https://example.com/source.webp'],
        category: 'portrait',
        model: 'gemini-image',
        featured: true,
        members_only: false,
        is_published: true,
        sort_order: 1
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        locale: 'zh-CN',
        deleted_at: null,
        image_url: 'https://example.com/missing.webp',
        prompt: 'missing mirror'
      },
      {
        id: 'en-linked',
        locale: 'en-US',
        deleted_at: null,
        source_case_id: sourceId,
        slug: 'en-case-111111111111',
        image_url: 'https://example.com/old.webp',
        image_urls: [],
        category: 'featured',
        model: 'gemini-image',
        featured: false,
        members_only: false,
        is_published: true,
        sort_order: 9
      },
      {
        id: 'en-orphan',
        locale: 'en-US',
        deleted_at: null,
        source_case_id: 'missing-source',
        slug: 'orphan'
      }
    ]);

    expect(diagnostic.stats).toMatchObject({
      zhSourceCount: 2,
      enMirrorCount: 2,
      missingMirrorCount: 1,
      staleMirrorCount: 1,
      orphanMirrorCount: 1
    });
    expect(diagnostic.issues.missingMirrors[0].sourceId).toBe(
      '22222222-2222-2222-2222-222222222222'
    );
    expect(diagnostic.issues.staleMirrors[0].reasons).toContain(
      'coreField:image_url'
    );
  });

  it('repairs an existing slug-matched mirror by linking and syncing core fields', async () => {
    const sourceId = '11111111-1111-1111-1111-111111111111';
    const { sb, rows, updates, inserts } = createPromptCaseSupabaseMock([
      {
        id: sourceId,
        locale: 'zh-CN',
        deleted_at: null,
        image_url: 'https://example.com/new.webp',
        image_urls: ['https://example.com/new.webp'],
        prompt: '中文提示词',
        category: 'portrait',
        model: 'gemini-image',
        featured: true,
        members_only: true,
        package_slug: 'creator-pack',
        commercial_intent: 'ads',
        prompt_preview: 'preview',
        source_draft_id: 'draft-1',
        author_url: 'https://example.com/author',
        sort_order: 7,
        is_published: true
      },
      {
        id: 'en-existing',
        locale: 'en-US',
        deleted_at: null,
        source_case_id: null,
        slug: 'en-case-111111111111',
        image_url: 'https://example.com/old.webp',
        image_urls: [],
        category: 'featured',
        model: 'old-model',
        featured: false,
        members_only: false,
        package_slug: null,
        commercial_intent: null,
        prompt_preview: null,
        source_draft_id: null,
        author_url: null,
        sort_order: 1,
        is_published: true,
        title: 'Existing English title',
        prompt: 'Existing English prompt',
        tags: ['existing']
      }
    ]);

    const { result, error } = await repairPromptCaseMirrors(
      sb,
      'admin@example.com',
      'admin-user'
    );

    expect(error).toBeUndefined();
    expect(result?.repaired).toMatchObject({
      linkedMirrors: 1,
      syncedMirrors: 1,
      createdMirrors: 0
    });
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(1);
    expect(rows[1]).toMatchObject({
      source_case_id: sourceId,
      image_url: 'https://example.com/new.webp',
      category: 'portrait',
      model: 'gemini-image',
      featured: true,
      members_only: true,
      sort_order: 7,
      title: 'Existing English title',
      prompt: 'Existing English prompt'
    });
  });

  it('skips duplicate English mirrors instead of deleting or choosing one', async () => {
    const sourceId = '11111111-1111-1111-1111-111111111111';
    const { sb, updates, inserts } = createPromptCaseSupabaseMock([
      {
        id: sourceId,
        locale: 'zh-CN',
        deleted_at: null,
        image_url: 'https://example.com/source.webp',
        prompt: '中文提示词'
      },
      {
        id: 'en-a',
        locale: 'en-US',
        deleted_at: null,
        source_case_id: sourceId,
        slug: 'en-case-111111111111'
      },
      {
        id: 'en-b',
        locale: 'en-US',
        deleted_at: null,
        source_case_id: sourceId,
        slug: 'another-slug'
      }
    ]);

    const { result } = await repairPromptCaseMirrors(
      sb,
      'admin@example.com',
      'admin-user'
    );

    expect(result?.repaired.skippedDuplicateMirrors).toHaveLength(1);
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it('keeps mirror actions behind the existing admin guard', async () => {
    const response = await handler(
      new Request('https://webtomind.com/api/admin/prompt-cases', {
        method: 'POST',
        body: JSON.stringify({ action: 'diagnoseMirrors' })
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Missing Authorization header'
    });
  });
});
