import { afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  alternates: [] as Record<string, unknown>[]
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        neq: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: async () => ({ data: state.row, error: null }),
        or: async () => ({ data: state.alternates, error: null }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(resolve)
      };
      return query;
    }
  })
}));
import { renderPromptPageHtml } from '../../api/prompt-page-render';
afterEach(() => vi.unstubAllEnvs());
const base = {
  title: 'Product photograph',
  prompt: 'Create a clean product photograph.',
  prompt_preview: 'A reusable product photography workflow.',
  model: 'gpt-image-2',
  image_url: 'https://example.com/product.webp',
  is_published: true,
  seo_status: 'indexable',
  seo_reviewed_at: '2026-09-08',
  seo_evidence: { source_verified: true, media_verified: true }
};
describe('linked prompt translation canonicals', () => {
  it.each([
    ['zh-CN', 'en-US', 'zh-product', 'product'],
    ['en-US', 'zh-CN', 'product', 'zh-product']
  ] as const)(
    'redirects %s records requested in %s to the published translation',
    async (original, requested, slug, translatedSlug) => {
      vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
      vi.stubEnv('SUPABASE_ANON_KEY', 'test-key');
      state.row = {
        ...base,
        id: 'original',
        slug,
        locale: original,
        source_case_id: 'source'
      };
      state.alternates = [
        state.row,
        {
          ...base,
          id: 'translation',
          slug: translatedSlug,
          locale: requested,
          source_case_id: 'source'
        }
      ];
      const result = await renderPromptPageHtml({
        html: '<html><head></head><body></body></html>',
        slug,
        locale: requested
      });
      expect(result.status).toBe(308);
      expect(result.redirectPath).toBe(
        `/${requested}/prompts/${translatedSlug}`
      );
    }
  );
  it.each([false, true])(
    'preserves bilingual fallback when translation is absent or nonindexable (%s)',
    async (hasDraft) => {
      vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
      vi.stubEnv('SUPABASE_ANON_KEY', 'test-key');
      state.row = {
        ...base,
        id: 'source',
        slug: 'zh-product',
        locale: 'zh-CN',
        title_en: 'Product photograph'
      };
      state.alternates = [
        state.row,
        ...(hasDraft
          ? [
              {
                ...base,
                id: 'draft',
                slug: 'product',
                locale: 'en-US',
                seo_status: 'review'
              }
            ]
          : [])
      ];
      const result = await renderPromptPageHtml({
        html: '<html><head></head><body></body></html>',
        slug: 'zh-product',
        locale: 'en-US'
      });
      expect(result.status).toBe(200);
      expect(result.redirectPath).toBeUndefined();
    }
  );
});
