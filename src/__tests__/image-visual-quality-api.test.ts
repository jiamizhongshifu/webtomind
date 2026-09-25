import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createImageVisualQualityScoreHandler } from '../../api/image/quality/score';

function createHandler(adminResult: {
  ok: boolean;
  status: number;
  error?: string;
  userId?: string;
}) {
  return createImageVisualQualityScoreHandler({
    getCorsHeadersForRequest: () => ({
      'Access-Control-Allow-Origin': '*'
    }),
    assertInternalAdmin: async () => adminResult,
    createSupabaseClient: () => ({}) as never
  });
}

describe('internal image visual quality API', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://supabase.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
  });

  it('keeps generation metadata outside authenticated direct reads', () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20260716162500_restrict_image_generation_metadata_reads.sql'
      ),
      'utf8'
    );

    expect(migration).toContain(
      'REVOKE SELECT ON TABLE public.image_generations FROM anon, authenticated'
    );
    expect(migration).toContain(
      'ON TABLE public.image_generations TO authenticated'
    );
    expect(
      migration.match(/GRANT SELECT \(([\s\S]*?)\) ON TABLE/)?.[1]
    ).not.toContain('metadata');
  });

  it('rejects an authenticated non-admin before parsing a scoring request', async () => {
    const handler = createHandler({
      ok: false,
      status: 403,
      error: 'Prompt case admin access required'
    });

    const response = await handler(
      new Request('https://webtomind.test/api/image/quality/score', {
        method: 'POST',
        body: JSON.stringify({ generationId: 'generation-1' })
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Prompt case admin access required'
    });
  });

  it('allows an admin through the permission gate', async () => {
    const handler = createHandler({
      ok: true,
      status: 200,
      userId: 'admin-1'
    });

    const response = await handler(
      new Request('https://webtomind.test/api/image/quality/score', {
        method: 'POST',
        body: JSON.stringify({})
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'generationId is required'
    });
  });
});
