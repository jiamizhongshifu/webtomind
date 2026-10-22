// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let db: PGlite;
const migration = (name: string) =>
  readFileSync(`supabase/migrations/${name}.sql`, 'utf8');
const evidence = {
  source_verified: true,
  media_verified: true,
  content_verified: true
};

async function addCase(
  prompt: string,
  locale = 'zh-CN',
  overrides: Record<string, unknown> = {}
) {
  const record = {
    image_url: 'https://example.test/image.png',
    prompt,
    title: 'Synthetic editorial case',
    slug: `test-${crypto.randomUUID()}`,
    locale,
    model: 'test-model',
    prompt_preview: 'Synthetic example summary',
    seo_status: 'indexable',
    seo_reviewed_at: '2026-10-22T00:00:00Z',
    seo_evidence: evidence,
    ...overrides
  };
  const fields = Object.keys(record);
  const result = await db.query<{ id: string }>(
    `INSERT INTO prompt_cases (${fields.join(',')}) VALUES (${fields.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`,
    Object.values(record)
  );
  return result.rows[0].id;
}

async function state(id: string) {
  const result = await db.query<{
    seo_status: string;
    seo_reviewed_at: Date | null;
    seo_evidence: Record<string, unknown>;
    prompt: string;
    view_count: number;
  }>('SELECT * FROM prompt_cases WHERE id=$1', [id]);
  return result.rows[0];
}

// Start with a fully valid conflicting INSERT candidate. The conflict action
// may persist different values, or nothing at all; claims must follow that result.
async function upsertCandidate(
  id: string,
  clause: string,
  differentId = false
) {
  return db.query(
    `INSERT INTO prompt_cases
      (id, locale, title, slug, prompt, prompt_preview, model, image_url,
       seo_status, seo_reviewed_at, seo_evidence)
     SELECT ${differentId ? 'gen_random_uuid()' : 'id'}, locale, title, slug,
       'candidate not necessarily stored', prompt_preview, model, image_url,
       'indexable', '2026-10-25'::timestamptz, $2
     FROM prompt_cases WHERE id=$1 ${clause}`,
    [id, evidence]
  );
}

async function expectClaimMatches(id: string, hasClaim = true) {
  const result = await db.query<{ matches: boolean }>(
    `SELECT c.locale = p.locale AND c.fingerprint =
      public.prompt_case_content_fingerprint(p.locale, p.prompt, p.prompt_zh, p.prompt_en)
      AS matches FROM prompt_case_content_claims c
      JOIN prompt_cases p ON p.id=c.case_id WHERE p.id=$1`,
    [id]
  );
  expect(result.rows).toEqual(hasClaim ? [{ matches: true }] : []);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE TABLE public.prompt_cases (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      locale text NOT NULL DEFAULT 'zh-CN',
      title text, title_zh text, title_en text, slug text UNIQUE,
      prompt text, prompt_zh text, prompt_en text,
      prompt_preview text, prompt_preview_zh text, prompt_preview_en text,
      commercial_intent text, model text, category text, tags jsonb,
      image_url text, image_urls jsonb, media_type text DEFAULT 'image',
      video_url text, video_urls jsonb, author_url text, source_case_id uuid,
      source_draft_id uuid, created_by_email text,
      is_published boolean DEFAULT true, deleted_at timestamptz,
      members_only boolean DEFAULT false, created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(), view_count integer DEFAULT 0,
      sort_order integer DEFAULT 0
    );
  `);
  await db.exec(migration('20260806210000_prompt_case_seo_quality_gate'));
  // A pre-existing duplicate group must not make migration deployment fail
  // or silently change editorial state.
  await addCase('legacy exact duplicate');
  await addCase('legacy exact duplicate');
  await db.exec(migration('20261022065856_prompt_content_review_guard'));
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe('prompt content review database guard', () => {
  it('installs with legacy duplicates without rewriting their content or visibility', async () => {
    const rows = await db.query<{ seo_status: string }>(
      "SELECT seo_status FROM prompt_cases WHERE prompt='legacy exact duplicate'"
    );
    expect(rows.rows).toEqual([
      { seo_status: 'indexable' },
      { seo_status: 'indexable' }
    ]);
    const claims = await db.query('SELECT * FROM prompt_case_content_claims');
    expect(claims.rows).toHaveLength(1);
  });

  it('saves an unreviewed direct content edit but withdraws its SEO approval', async () => {
    const id = await addCase('original alpha');
    await db.query(
      "UPDATE prompt_cases SET prompt='changed alpha' WHERE id=$1",
      [id]
    );
    expect(await state(id)).toMatchObject({
      prompt: 'changed alpha',
      seo_status: 'review',
      seo_reviewed_at: null,
      seo_evidence: {
        content_review_required: true,
        content_review_reason: 'unreviewed-content'
      }
    });
    expect((await state(id)).seo_evidence.content_verified).toBeUndefined();
  });

  it('requires both explicit fresh review time and content approval', async () => {
    const id = await addCase('review timestamp test');
    await db.query(
      "UPDATE prompt_cases SET prompt='new review timestamp test', seo_reviewed_at='2026-10-23', seo_evidence=$2 WHERE id=$1",
      [id, { source_verified: true, media_verified: true }]
    );
    expect((await state(id)).seo_status).toBe('review');
    await db.query(
      "UPDATE prompt_cases SET seo_status='indexable', seo_reviewed_at='2026-10-24', seo_evidence=$2 WHERE id=$1",
      [id, evidence]
    );
    expect((await state(id)).seo_status).toBe('indexable');
    expect(
      (await state(id)).seo_evidence.content_review_required
    ).toBeUndefined();
  });

  it('demotes newly inserted unreviewed publications instead of rejecting content storage', async () => {
    const id = await addCase('unreviewed insert', 'zh-CN', {
      seo_evidence: { source_verified: true, media_verified: true }
    });
    expect((await state(id)).seo_status).toBe('review');
  });

  it('allows an explicitly reviewed unique content repair in one statement', async () => {
    const id = await addCase('repair before');
    await db.query(
      "UPDATE prompt_cases SET prompt='repair after', seo_reviewed_at='2026-10-23', seo_evidence=$2 WHERE id=$1",
      [id, evidence]
    );
    expect((await state(id)).seo_status).toBe('indexable');
  });

  it('compares the displayed locale field and ignores whitespace variation', async () => {
    await addCase('unused base 1', 'zh-CN', {
      prompt_zh: 'displayed  duplicate\ncontent'
    });
    const duplicate = await addCase('different unused base 2', 'zh-CN', {
      prompt_zh: ' displayed duplicate content '
    });
    expect(await state(duplicate)).toMatchObject({
      seo_status: 'review',
      seo_evidence: { content_review_reason: 'duplicate-prompt' }
    });
    const sibling = await addCase('unused base 3', 'en-US', {
      prompt_en: 'displayed duplicate content'
    });
    expect((await state(sibling)).seo_status).toBe('indexable');
  });

  it('uses the renderer fallback for whitespace-only localized prompts', async () => {
    await addCase('fallback duplicate content');
    for (const whitespace of [
      '\n',
      '\t',
      '\u00a0',
      '\u2003',
      '\u2028',
      '\ufeff'
    ]) {
      const duplicate = await addCase('fallback duplicate content', 'zh-CN', {
        prompt_zh: whitespace
      });
      expect((await state(duplicate)).seo_status).toBe('review');
    }
    await addCase('English fallback duplicate', 'en-US');
    const duplicate = await addCase('English fallback duplicate', 'en-US', {
      prompt_en: '\n\t\u3000'
    });
    expect((await state(duplicate)).seo_status).toBe('review');
  });

  it('leaves claims intact for primary-key and slug conflicts that do nothing', async () => {
    const id = await addCase('original conflict-do-nothing');
    await upsertCandidate(id, 'ON CONFLICT(id) DO NOTHING');
    await upsertCandidate(id, 'ON CONFLICT(slug) DO NOTHING', true);
    await upsertCandidate(
      id,
      'ON CONFLICT(id) DO UPDATE SET prompt=excluded.prompt WHERE false'
    );
    expect((await state(id)).prompt).toBe('original conflict-do-nothing');
    await expectClaimMatches(id);
    const phantom =
      await db.query(`SELECT * FROM prompt_case_content_claims WHERE fingerprint=
      public.prompt_case_content_fingerprint('zh-CN', 'candidate not necessarily stored', NULL, NULL)`);
    expect(phantom.rows).toHaveLength(0);
  });

  it('does not change claims when an upsert only changes counters', async () => {
    const id = await addCase('original counter upsert');
    await upsertCandidate(
      id,
      'ON CONFLICT(id) DO UPDATE SET view_count=prompt_cases.view_count+1'
    );
    expect(await state(id)).toMatchObject({
      prompt: 'original counter upsert',
      view_count: 1,
      seo_status: 'indexable'
    });
    await expectClaimMatches(id);
  });

  it('claims the actual reviewed upsert result, not the discarded insert candidate', async () => {
    const id = await addCase('original reviewed upsert');
    await upsertCandidate(
      id,
      `ON CONFLICT(id) DO UPDATE SET prompt='actual reviewed upsert',
      seo_reviewed_at=excluded.seo_reviewed_at, seo_evidence=excluded.seo_evidence`
    );
    expect(await state(id)).toMatchObject({
      prompt: 'actual reviewed upsert',
      seo_status: 'indexable'
    });
    await expectClaimMatches(id);
    const replacement = await addCase('original reviewed upsert');
    expect((await state(replacement)).seo_status).toBe('indexable');
    await expectClaimMatches(replacement);
  });

  it('releases the claim when an upsert changes content without fresh approval', async () => {
    const id = await addCase('original unreviewed upsert');
    const result = await upsertCandidate(
      id,
      'ON CONFLICT(id) DO UPDATE SET prompt=excluded.prompt RETURNING seo_status'
    );
    expect(result.rows).toEqual([{ seo_status: 'review' }]);
    expect(await state(id)).toMatchObject({
      prompt: 'candidate not necessarily stored',
      seo_status: 'review'
    });
    await expectClaimMatches(id, false);
  });

  it('rolls back a late claim conflict with retryable 40001 instead of returning a false publication', async () => {
    // PGlite has one connection. Reserve the unique claim directly to exercise
    // the late-conflict path (a publisher that committed after BEFORE checked).
    const owner = await addCase('reserved late-conflict prompt', 'zh-CN', {
      seo_status: 'draft'
    });
    await db.query(
      `INSERT INTO prompt_case_content_claims(locale, fingerprint, case_id)
      VALUES('zh-CN', public.prompt_case_content_fingerprint('zh-CN', 'reserved late-conflict prompt', NULL, NULL), $1)`,
      [owner]
    );
    await expect(
      addCase('reserved late-conflict prompt')
    ).rejects.toMatchObject({ code: '40001' });
    const stored = await db.query(
      'SELECT id FROM prompt_cases WHERE prompt=$1',
      ['reserved late-conflict prompt']
    );
    expect(stored.rows).toEqual([{ id: owner }]);
    await db.query(
      `UPDATE prompt_cases SET seo_status='indexable', seo_reviewed_at='2026-10-26' WHERE id=$1`,
      [owner]
    );
    const retry = await addCase('reserved late-conflict prompt');
    expect((await state(retry)).seo_status).toBe('review');
    await expectClaimMatches(owner);
    await expectClaimMatches(retry, false);
  });

  it('does not demote counters, sorting, or no-op content saves', async () => {
    const result = await db.query<{ id: string }>(
      "SELECT id FROM prompt_cases WHERE prompt='legacy exact duplicate'"
    );
    for (const { id } of result.rows) {
      await db.query(
        'UPDATE prompt_cases SET view_count=view_count+1, sort_order=3 WHERE id=$1',
        [id]
      );
      await db.query('UPDATE prompt_cases SET prompt=prompt WHERE id=$1', [id]);
      expect(await state(id)).toMatchObject({
        seo_status: 'indexable',
        view_count: 1
      });
    }
  });

  it('releases claims for retired content and still detects unclaimed legacy duplicates', async () => {
    const old = await addCase('reusable retired prompt');
    await db.query("UPDATE prompt_cases SET seo_status='retired' WHERE id=$1", [
      old
    ]);
    const replacement = await addCase('reusable retired prompt');
    expect((await state(replacement)).seo_status).toBe('indexable');

    await db.exec(`DELETE FROM prompt_cases WHERE id IN (
      SELECT case_id FROM prompt_case_content_claims WHERE fingerprint=
        public.prompt_case_content_fingerprint('zh-CN', 'legacy exact duplicate', NULL, NULL)
    )`);
    const duplicate = await addCase('legacy exact duplicate');
    expect((await state(duplicate)).seo_status).toBe('review');
  });

  it('invalidates approvals for localized titles and media changes, but does not republish drafts', async () => {
    const id = await addCase('localized title test');
    await db.query(
      "UPDATE prompt_cases SET title_zh='Changed title' WHERE id=$1",
      [id]
    );
    expect((await state(id)).seo_status).toBe('review');
    const draft = await addCase('draft media test', 'zh-CN', {
      seo_status: 'draft'
    });
    await db.query(
      "UPDATE prompt_cases SET image_url='https://example.test/new.png' WHERE id=$1",
      [draft]
    );
    expect((await state(draft)).seo_status).toBe('draft');
    expect((await state(draft)).seo_evidence.content_verified).toBeUndefined();
  });

  it('keeps fingerprint claims inaccessible to public roles', async () => {
    await db.exec('SET ROLE anon');
    await expect(
      db.query('SELECT * FROM prompt_case_content_claims')
    ).rejects.toThrow(/permission denied/);
    await db.exec('RESET ROLE');
  });
});
