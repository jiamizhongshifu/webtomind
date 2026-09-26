import { describe, expect, it, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => {
    let requestedId = '';
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        if (column === 'id' && typeof value === 'string') requestedId = value;
        return query;
      }),
      is: vi.fn(() => query),
      limit: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data:
          requestedId === 'redirect-case'
            ? {
                id: 'redirect-case',
                locale: 'zh-CN',
                title: 'Published prompt case',
                prompt: 'Create a reusable visual.',
                slug: 'published-prompt-case',
                is_published: true,
                deleted_at: null
              }
            : requestedId === 'legacy-no-slug'
              ? {
                  id: 'legacy-no-slug',
                  locale: 'zh-CN',
                  title: 'Legacy prompt case',
                  prompt: 'Create a reusable visual.',
                  slug: null,
                  is_published: true,
                  deleted_at: null
                }
              : null,
        error: null
      })),
      or: vi.fn(() => query),
      neq: vi.fn(() => query),
      order: vi.fn(() => query),
      then: (
        onFulfilled: (value: { data: unknown[]; error: null }) => unknown,
        onRejected?: (reason: unknown) => unknown
      ) =>
        Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected)
    };
    return {
      auth: {
        getUser: vi.fn(async (token: string) =>
          token === 'admin-token'
            ? {
                data: {
                  user: {
                    id: 'prompt-admin-user',
                    email: 'admin@example.com'
                  }
                },
                error: null
              }
            : {
                data: { user: null },
                error: new Error('Invalid token')
              }
        )
      },
      from: vi.fn(() => query)
    };
  })
}));

import {
  canonicalizePublicSeoTargetForCache,
  getPublicContentCacheKeyForTest,
  getSeoRouteLabelForTest,
  getSeoTargetForTest,
  shouldNoindexTrackingUrlForTest
} from '../../workers/webtomind';
import { createAppContentItems } from '../shared/create-apps';
import worker from '../../workers/webtomind';

describe('Cloudflare Worker SEO route matching', () => {
  it('allows the validated ZPay checkout form destination in the recharge HTML policy', async () => {
    const response = await worker.fetch(
      new Request('https://webtomind.com/zh-CN/recharge'),
      {
        CANONICAL_HOST: 'webtomind.com',
        ASSETS: {
          fetch: vi.fn(async () => new Response(
            '<!doctype html><html><head></head><body><div id="root"></div></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          ))
        }
      } as never,
      { waitUntil: () => undefined } as never
    );
    expect(response.status).toBe(200);
    const formAction = response.headers.get('Content-Security-Policy')
      ?.split(';').map((directive) => directive.trim())
      .find((directive) => directive.startsWith('form-action '));
    expect(formAction?.split(/\s+/).slice(1)).toEqual([
      "'self'", 'https://zpayz.cn', 'https://api.z-pay.cn'
    ]);
  });

  it('consolidates the unlocalized ComfyUI tool into its declared canonical URL', async () => {
    const response = await worker.fetch(
      new Request(
        'https://webtomind.com/tools/comfyui-workflow-checker?utm_source=gsc',
        {
          headers: { 'accept-language': 'en-US', cookie: 'locale=en-US' }
        }
      ),
      { CANONICAL_HOST: 'webtomind.com' } as never,
      { waitUntil: () => undefined } as never
    );
    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(
      'https://webtomind.com/zh-CN/tools/comfyui-workflow-checker?utm_source=gsc'
    );
    expect(
      getSeoRouteLabelForTest('/zh-CN/tools/comfyui-workflow-checker')
    ).toBe('worker-seo');
    expect(
      getSeoRouteLabelForTest('/en-US/tools/comfyui-workflow-checker')
    ).toBe('worker-seo');
  });

  it('normalizes tracking parameters out of public SEO cache targets', () => {
    expect(
      canonicalizePublicSeoTargetForCache(
        '/api/seo-page?path=%2Fzh-CN%2Fprompts&utm_source=test'
      )
    ).toBe('/api/seo-page?path=%2Fzh-CN%2Fprompts');
  });

  it('serves the release manifest through the static asset binding', async () => {
    expect(getSeoRouteLabelForTest('/release-manifest.json')).toBe('asset');
    const assetFetch = vi.fn(async () =>
      Response.json({ schemaVersion: 1, commit: 'release-commit' })
    );

    const response = await worker.fetch(
      new Request('https://webtomind.com/release-manifest.json?check=1'),
      {
        ASSETS: { fetch: assetFetch },
        CANONICAL_HOST: 'webtomind.com'
      } as never,
      { waitUntil: () => undefined } as never
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      schemaVersion: 1,
      commit: 'release-commit'
    });
    expect(assetFetch).toHaveBeenCalledOnce();
  });

  it('routes package prompt SEO pages through the Worker SEO renderer', () => {
    expect(
      getSeoRouteLabelForTest('/zh-CN/prompts/package/xiaohongshu-cover')
    ).toBe('worker-seo');
    expect(
      getSeoRouteLabelForTest('/en-US/prompts/package/xiaohongshu-cover')
    ).toBe('worker-seo');
  });

  it('routes private/noindex entry pages through the Worker SEO renderer', () => {
    expect(getSeoRouteLabelForTest('/login')).toBe('worker-seo');
    expect(getSeoRouteLabelForTest('/auth/callback')).toBe('worker-seo');
  });

  it('redirects canonical host HTTP requests to HTTPS', async () => {
    expect(
      getSeoRouteLabelForTest('http://webtomind.com/gpt-image-2-prompts')
    ).toBe('redirect:http-to-https');
    expect(
      getSeoRouteLabelForTest('http://www.webtomind.com/gpt-image-2-prompts')
    ).toBe('redirect:http-to-https');

    const response = await worker.fetch(
      new Request('http://www.webtomind.com/gpt-image-2-prompts?utm=test'),
      { CANONICAL_HOST: 'webtomind.com' } as never,
      { waitUntil: () => undefined } as never
    );

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(
      'https://webtomind.com/gpt-image-2-prompts?utm=test'
    );
  });

  it('redirects the deprecated landing page to the English prompt library by default', async () => {
    expect(getSeoRouteLabelForTest('/')).toBe('redirect:/');

    const response = await worker.fetch(
      new Request('https://webtomind.com/?utm_source=landing'),
      { CANONICAL_HOST: 'webtomind.com' } as never,
      { waitUntil: () => undefined } as never
    );

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(
      'https://webtomind.com/en-US/prompts?utm_source=landing'
    );
  });

  it('redirects the deprecated landing page to the Chinese prompt library for zh browsers', async () => {
    const response = await worker.fetch(
      new Request('https://webtomind.com/?utm_source=landing', {
        headers: { 'Accept-Language': 'zh-CN,zh;q=0.9' }
      }),
      { CANONICAL_HOST: 'webtomind.com' } as never,
      { waitUntil: () => undefined } as never
    );

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(
      'https://webtomind.com/zh-CN/prompts?utm_source=landing'
    );
  });

  it('redirects the deprecated landing page to the English prompt library for en browsers', async () => {
    const response = await worker.fetch(
      new Request('https://webtomind.com/?utm_source=landing', {
        headers: { 'Accept-Language': 'en-US,en;q=0.9' }
      }),
      { CANONICAL_HOST: 'webtomind.com' } as never,
      { waitUntil: () => undefined } as never
    );

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(
      'https://webtomind.com/en-US/prompts?utm_source=landing'
    );
  });

  it('redirects /nsfw-prompts-guide to the localized guide page', async () => {
    expect(getSeoRouteLabelForTest('/nsfw-prompts-guide')).toBe(
      'redirect:/nsfw-prompts-guide'
    );

    const en = await worker.fetch(
      new Request('https://webtomind.com/nsfw-prompts-guide'),
      { CANONICAL_HOST: 'webtomind.com' } as never,
      { waitUntil: () => undefined } as never
    );
    expect(en.status).toBe(308);
    expect(en.headers.get('location')).toBe(
      'https://webtomind.com/en-US/blog/nsfw-prompts-guide'
    );

    const zh = await worker.fetch(
      new Request('https://webtomind.com/nsfw-prompts-guide', {
        headers: { 'Accept-Language': 'zh-CN,zh;q=0.9' }
      }),
      { CANONICAL_HOST: 'webtomind.com' } as never,
      { waitUntil: () => undefined } as never
    );
    expect(zh.status).toBe(308);
    expect(zh.headers.get('location')).toBe(
      'https://webtomind.com/zh-CN/blog/nsfw-prompts-guide'
    );
  });

  it('redirects legacy localized article URLs to the unified blog namespace', async () => {
    expect(
      getSeoRouteLabelForTest('/zh-CN/use-cases/ai-tool-credit-budget')
    ).toBe('redirect:legacy-blog-detail');

    const response = await worker.fetch(
      new Request(
        'https://webtomind.com/zh-CN/use-cases/ai-tool-credit-budget?utm_source=legacy'
      ),
      { CANONICAL_HOST: 'webtomind.com' } as never,
      { waitUntil: () => undefined } as never
    );

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(
      'https://webtomind.com/zh-CN/blog/ai-tool-credit-budget?utm_source=legacy'
    );
  });

  it('redirects verified legacy prompt slugs to their current canonical URLs', async () => {
    expect(
      getSeoRouteLabelForTest(
        '/en-US/prompts/botanical-medic-character-design-prompt'
      )
    ).toBe('redirect:legacy-prompt-slug');

    const response = await worker.fetch(
      new Request(
        'https://webtomind.com/en-US/prompts/botanical-medic-character-design-prompt?utm_source=gsc&caseId=obsolete'
      ),
      { CANONICAL_HOST: 'webtomind.com' } as never,
      { waitUntil: () => undefined } as never
    );

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(
      'https://webtomind.com/en-US/prompts/zh-botanical-medic-character-design-prompt?utm_source=gsc'
    );
  });

  it('redirects legacy prompt preview queries directly to the canonical detail', async () => {
    const url =
      '/en-US/prompts?caseId=73c403e4-9031-4b7b-bf02-a533b22ae3f6&caseSlug=en-white-vase-reference-image-to-prompt-workflow';
    expect(getSeoRouteLabelForTest(url)).toBe('redirect:legacy-prompt-preview');

    const response = await worker.fetch(
      new Request(`https://webtomind.com${url}`),
      { CANONICAL_HOST: 'webtomind.com' } as never,
      { waitUntil: () => undefined } as never
    );

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(
      'https://webtomind.com/en-US/prompts/zh-reference-image-to-prompt-vase-workflow-example'
    );
  });

  it('returns a noindex 410 for the retired thin article', async () => {
    expect(getSeoRouteLabelForTest('/zh-CN/blog/ai-workflow-sop')).toBe(
      'worker-retired:seo-page'
    );

    const response = await worker.fetch(
      new Request('https://webtomind.com/zh-CN/blog/ai-workflow-sop'),
      { CANONICAL_HOST: 'webtomind.com' } as never,
      { waitUntil: () => undefined } as never
    );

    expect(response.status).toBe(410);
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });

  it('respects the explicit language cookie over Accept-Language', async () => {
    const response = await worker.fetch(
      new Request('https://webtomind.com/?utm_source=landing', {
        headers: {
          'Accept-Language': 'en-US,en;q=0.9',
          Cookie: 'theme=dark; webtomind-language=zh-CN'
        }
      }),
      { CANONICAL_HOST: 'webtomind.com' } as never,
      { waitUntil: () => undefined } as never
    );

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(
      'https://webtomind.com/zh-CN/prompts?utm_source=landing'
    );
  });

  it('serves the Chinese prompt library home as an SEO page', async () => {
    expect(getSeoRouteLabelForTest('/zh-CN/prompts')).toBe('worker-seo');

    const indexHtml =
      '<!doctype html><html><head><script type="module" src="/assets/index.prompt-library.js"></script></head><body><div id="root"></div></body></html>';
    const response = await worker.fetch(
      new Request(
        'https://webtomind.com/zh-CN/prompts?sort=latest&utm_source=legacy'
      ),
      {
        CANONICAL_HOST: 'webtomind.com',
        ASSETS: { fetch: vi.fn(async () => new Response(indexHtml)) }
      } as never,
      { waitUntil: () => undefined } as never
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-webtomind-seo-renderer')).toBe(
      'cloudflare-assets'
    );
  });

  it('serves standalone boards URLs as app routes', () => {
    expect(getSeoRouteLabelForTest('/boards')).toBe('worker-noindex-shell');
    expect(getSeoRouteLabelForTest('/boards/project-123')).toBe(
      'worker-noindex-shell'
    );
  });

  it('redirects unlocalized public prompt detail URLs to the localized canonical path', () => {
    expect(getSeoRouteLabelForTest('/prompts/published-prompt-case')).toBe(
      'redirect:prompt-detail'
    );
    expect(getSeoRouteLabelForTest('/prompts/foo/bar')).not.toBe(
      'redirect:prompt-detail'
    );
    expect(getSeoRouteLabelForTest('/prompts/admin')).toBe(
      'worker-noindex-shell'
    );
  });

  it('redirects legacy id-based prompt URLs to the share route before slug resolution', () => {
    const legacyId = '3ef20b2a-db59-430d-82a5-bbea3cf8e43d';
    expect(getSeoRouteLabelForTest(`/prompts/${legacyId}`)).toBe(
      'redirect:prompt-detail'
    );
    expect(getSeoRouteLabelForTest(`/zh-CN/prompts/${legacyId}`)).toBe(
      'redirect:prompt-id'
    );
    expect(getSeoRouteLabelForTest(`/en-US/prompts/${legacyId}`)).toBe(
      'redirect:prompt-id'
    );
    expect(getSeoRouteLabelForTest('/zh-CN/prompts/not-a-uuid')).toBe(
      'worker-seo'
    );
  });

  it('redirects legacy create moodboard deep links and serves the new top-level routes as noindex app shells', () => {
    for (const path of [
      '/create/moodboards',
      '/create/moodboards/new',
      '/create/moodboards/board-123',
      '/zh-CN/create/moodboards',
      '/zh-CN/create/moodboards/new',
      '/zh-CN/create/moodboards/board-123',
      '/en-US/create/moodboards/board-123'
    ]) {
      expect(getSeoRouteLabelForTest(path)).toBe(
        'redirect:legacy-creator-route'
      );
    }
    for (const path of [
      '/moodboards',
      '/moodboards/new',
      '/moodboards/board-123',
      '/zh-CN/moodboards',
      '/zh-CN/moodboards/new',
      '/zh-CN/moodboards/board-123',
      '/en-US/moodboards/board-123'
    ]) {
      expect(getSeoRouteLabelForTest(path)).toBe('worker-noindex-shell');
    }
    expect(getSeoRouteLabelForTest('/create/moodboards/a/b')).toBe(
      'redirect:legacy-creator-route'
    );
  });

  it('serves localized and unlocalized create pricing deep links as noindex app shells', () => {
    for (const path of [
      '/create/pricing',
      '/zh-CN/create/pricing',
      '/en-US/create/pricing'
    ]) {
      expect(getSeoRouteLabelForTest(path)).toBe('worker-noindex-shell');
    }
  });

  it('redirects old create boards URLs to the standalone boards route', async () => {
    expect(getSeoRouteLabelForTest('/create/boards')).toBe(
      'redirect:create-boards'
    );
    expect(getSeoRouteLabelForTest('/zh-CN/create/boards/project-123')).toBe(
      'redirect:create-boards'
    );

    const response = await worker.fetch(
      new Request(
        'https://webtomind.com/create/boards/project-123?summary-id=abc&view=trash'
      ),
      { CANONICAL_HOST: 'webtomind.com' } as never,
      { waitUntil: () => undefined } as never
    );

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(
      'https://webtomind.com/boards/project-123?summary-id=abc&view=trash'
    );
  });

  it('redirects the legacy AI image prompts landing page to the prompt library', async () => {
    expect(getSeoRouteLabelForTest('/ai-image-prompts')).toBe(
      'redirect:/ai-image-prompts'
    );

    const response = await worker.fetch(
      new Request('https://webtomind.com/ai-image-prompts?utm_source=old'),
      { CANONICAL_HOST: 'webtomind.com' } as never,
      { waitUntil: () => undefined } as never
    );

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(
      'https://webtomind.com/en-US/prompts'
    );
  });

  it('renders legacy prompt case share URLs through the prompt detail SEO route', () => {
    expect(getSeoRouteLabelForTest('/create/prompts/share/case-123')).toBe(
      'worker-seo'
    );
    expect(getSeoTargetForTest('/create/prompts/share/case-123')).toBe(
      '/api/prompt-page?locale=zh-CN&id=case-123&redirect=id-to-slug'
    );
    expect(
      getSeoRouteLabelForTest('/zh-CN/create/prompts/share/case-123')
    ).toBe('worker-seo');
    expect(getSeoTargetForTest('/zh-CN/create/prompts/share/case-123')).toBe(
      '/api/prompt-page?locale=zh-CN&id=case-123&redirect=id-to-slug'
    );
    expect(
      getSeoRouteLabelForTest('/en-US/create/prompts/share/case-123')
    ).toBe('worker-seo');
    expect(getSeoTargetForTest('/en-US/create/prompts/share/case-123')).toBe(
      '/api/prompt-page?locale=en-US&id=case-123&redirect=id-to-slug'
    );
  });

  it('permanently redirects published UUID share URLs to their slug path', async () => {
    const indexHtml =
      '<!doctype html><html><head></head><body><div id="root"></div></body></html>';
    const response = await worker.fetch(
      new Request(
        'https://webtomind.com/zh-CN/create/prompts/share/redirect-case?utm_source=google&utm_campaign=seo&caseId=internal'
      ),
      {
        CANONICAL_HOST: 'webtomind.com',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'anon',
        ASSETS: { fetch: vi.fn(async () => new Response(indexHtml)) }
      } as never,
      { waitUntil: () => undefined } as never
    );

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(
      'https://webtomind.com/zh-CN/prompts/published-prompt-case?utm_source=google&utm_campaign=seo'
    );
    expect(response.headers.get('x-webtomind-seo-renderer')).toBe(
      'cloudflare-prompt-slug-redirect'
    );
  });

  it('keeps published UUID share URLs without a slug renderable', async () => {
    const indexHtml =
      '<!doctype html><html lang="zh-CN"><head><title>Home</title><meta name="description" content="home" /><meta name="robots" content="index,follow" /><link rel="canonical" href="https://webtomind.com/" /></head><body><div id="root"></div></body></html>';
    const response = await worker.fetch(
      new Request(
        'https://webtomind.com/zh-CN/create/prompts/share/legacy-no-slug'
      ),
      {
        CANONICAL_HOST: 'webtomind.com',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'anon',
        ASSETS: { fetch: vi.fn(async () => new Response(indexHtml)) }
      } as never,
      { waitUntil: () => undefined } as never
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(html).toContain(
      '<link rel="canonical" href="https://webtomind.com/zh-CN/create/prompts/share/legacy-no-slug" />'
    );
  });

  it('renders prompt library preview URLs through the prompt detail SEO route', () => {
    expect(getSeoTargetForTest('/zh-CN/prompts?caseId=case-123')).toBe(
      '/api/prompt-page?locale=zh-CN&id=case-123'
    );
    expect(
      getSeoTargetForTest('/zh-CN/prompts?caseId=case-123&caseSlug=case-one')
    ).toBe('/api/prompt-page?locale=zh-CN&slug=case-one');
    expect(getSeoTargetForTest('/zh-CN/create/prompts')).toBe(
      '/api/seo-page?path=%2Fzh-CN%2Fcreate%2Fprompts'
    );
  });

  it.each(['', '?utm_source=google', '?q=portrait', '?view=favorites'])(
    'enhances only unfiltered human library navigations, without SSR flicker: %s',
    async (search) => {
      const indexHtml =
        '<html><head><script id="webtomind-prompt-route-assets" type="application/json">["/assets/Prompt.hash.js"]</script></head><body><div id="root"></div></body></html>';
      const snapshot = {
        items: [
          {
            id: 'public-case',
            title: 'Public',
            imageUrl: 'https://example.test/a.jpg'
          }
        ],
        generatedAt: new Date().toISOString(),
        queryEcho: {
          locale: 'en-US',
          sort: 'latest',
          limit: 48,
          seoOnly: false
        },
        pageInfo: { hasMore: false }
      };
      const response = await worker.fetch(
        new Request(`https://webtomind.com/en-US/prompts${search}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 Chrome/150',
            Accept: 'text/html'
          }
        }),
        {
          CANONICAL_HOST: 'webtomind.com',
          ASSETS: { fetch: vi.fn(async () => new Response(indexHtml)) },
          WEBTOMIND_PUBLIC_CACHE: {
            get: vi.fn(async (key: string) =>
              key === 'prompt-library-bootstrap:browser-v1:/en-US/prompts'
                ? JSON.stringify(snapshot)
                : null
            ),
            put: vi.fn(async () => undefined)
          }
        } as never,
        { waitUntil: () => undefined } as never
      );
      const html = await response.text();
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toContain('no-store');
      expect(html).toContain('<div id="root"></div>');
      expect(html).not.toContain('prompt-seo-handoff');
      expect(html).toContain('data-webtomind-prompt-route-preload');
      expect(html.includes('id="webtomind-prompt-library-bootstrap"')).toBe(
        !search || search.startsWith('?utm_')
      );
    }
  );

  it.each(['expired', 'timeout', 'error', 'empty'])(
    'fails open for unusable human bootstrap snapshots: %s',
    async (mode) => {
      const get = vi.fn(async (key: string) => {
        if (mode === 'timeout') return new Promise<string>(() => undefined);
        if (mode === 'error') throw new Error('KV unavailable');
        if (mode === 'empty') return null;
        if (!key.startsWith('prompt-library-bootstrap:')) return null;
        return JSON.stringify({
          generatedAt: new Date(Date.now() - 600_000).toISOString(),
          queryEcho: { locale: 'en-US', seoOnly: false },
          items: [{ id: 'stale-public-case' }]
        });
      });
      const response = await worker.fetch(
        new Request('https://webtomind.com/en-US/prompts', {
          headers: {
            'User-Agent': 'Mozilla/5.0 Chrome/150',
            Accept: 'text/html'
          }
        }),
        {
          CANONICAL_HOST: 'webtomind.com',
          ASSETS: {
            fetch: vi.fn(
              async () =>
                new Response(
                  '<html><head></head><body><div id="root"></div></body></html>'
                )
            )
          },
          WEBTOMIND_PUBLIC_CACHE: { get, put: vi.fn(async () => undefined) }
        } as never,
        { waitUntil: () => undefined } as never
      );
      const html = await response.text();
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toContain('no-store');
      expect(html).not.toContain('stale-public-case');
      expect(html).not.toContain('id="webtomind-prompt-library-bootstrap"');
      expect(get).toHaveBeenCalledWith(
        'prompt-library-bootstrap:browser-v1:/en-US/prompts'
      );
    }
  );

  it('browser-caches public SEO briefly while keeping CDN caching disabled', async () => {
    const indexHtml =
      '<!doctype html><html><head><script type="module" src="/assets/index.test.js"></script></head><body><div id="root"></div></body></html>';
    const response = await worker.fetch(
      new Request('https://webtomind.com/zh-CN/prompts'),
      {
        CANONICAL_HOST: 'webtomind.com',
        ASSETS: {
          fetch: vi.fn(async () => new Response(indexHtml))
        }
      } as never,
      { waitUntil: () => undefined } as never
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-webtomind-seo-renderer')).toBe(
      'cloudflare-assets'
    );
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=60, stale-while-revalidate=300'
    );
    expect(response.headers.get('cdn-cache-control')).toBe('no-store');
    expect(response.headers.get('cloudflare-cdn-cache-control')).toBe(
      'no-store'
    );
    await expect(response.text()).resolves.toContain('/assets/index.test.js');
  });

  it('reuses build-fingerprinted public SEO HTML from KV', async () => {
    const indexHtml =
      '<!doctype html><html><head><script type="module" src="/assets/index.build-a.js"></script></head><body><div id="root"></div></body></html>';
    const values = new Map<string, string>();
    const cache = {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      put: vi.fn(
        async (
          key: string,
          value: string,
          _options: { expirationTtl: number }
        ) => {
          values.set(key, value);
        }
      )
    };
    const env = {
      CANONICAL_HOST: 'webtomind.com',
      WEBTOMIND_PUBLIC_CACHE: cache,
      ASSETS: { fetch: vi.fn(async () => new Response(indexHtml)) }
    } as never;
    const executionContext = {
      waitUntil: (promise: Promise<unknown>) => promise
    } as never;

    const first = await worker.fetch(
      new Request('https://webtomind.com/zh-CN/prompts'),
      env,
      executionContext
    );
    await Promise.resolve();
    const second = await worker.fetch(
      new Request('https://webtomind.com/zh-CN/prompts'),
      env,
      executionContext
    );

    expect(first.headers.get('x-webtomind-kv-cache')).toBe('MISS');
    expect(second.headers.get('x-webtomind-kv-cache')).toBe('HIT');
    expect(cache.put).toHaveBeenCalledWith(
      expect.stringContaining(
        'public-seo-html:v2:index.build-a.js:/api/seo-page?path=%2Fzh-CN%2Fprompts'
      ),
      expect.any(String),
      { expirationTtl: 300 }
    );
  });

  it('embeds cached prompt-library data and preloads both mobile LCP candidates', async () => {
    const indexHtml =
      '<!doctype html><html><head><title>Home</title><meta name="description" content="home" /><meta name="robots" content="index,follow" /><link rel="canonical" href="https://webtomind.com/" /><script type="module" src="/assets/index.prompt-lcp.js"></script></head><body><div id="root"></div></body></html>';
    const promptLibraryPath =
      '/api/content/prompt-cases?library=1&limit=48&sort=latest&v=prompt-library-v3&locale=zh-CN&requireImage=1&seoOnly=1';
    const promptLibraryKey = getPublicContentCacheKeyForTest(promptLibraryPath);
    const cacheGet = vi.fn(async (key: string) => {
      if (key !== promptLibraryKey) return null;
      return JSON.stringify({
        items: [
          {
            id: 'case-1',
            imageUrl:
              'https://pbs.twimg.com/media/HOeplUrXUAAyvkY.jpg?name=large',
            imageUrls: [
              'https://pbs.twimg.com/media/HOeplUrXUAAyvkY.jpg?name=large'
            ],
            title: '冷欲猫系妆',
            prompt: ''
          },
          {
            id: 'case-2',
            imageUrl: 'https://images.example.test/mobile-lcp.jpg',
            imageUrls: ['https://images.example.test/mobile-lcp.jpg'],
            title: 'Mobile LCP candidate',
            prompt: ''
          }
        ],
        total: 2,
        pageInfo: { nextCursor: null, hasMore: false },
        facets: { models: [], labels: [], sorts: [] },
        queryEcho: { locale: 'zh-CN', sort: 'latest', limit: 48 },
        version: 'prompt-library-v2',
        source: 'rpc'
      });
    });

    const response = await worker.fetch(
      new Request('https://webtomind.com/zh-CN/prompts'),
      {
        CANONICAL_HOST: 'webtomind.com',
        WEBTOMIND_PUBLIC_CACHE: {
          get: cacheGet,
          put: vi.fn(async () => undefined)
        },
        ASSETS: { fetch: vi.fn(async () => new Response(indexHtml)) }
      } as never,
      { waitUntil: () => undefined } as never
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(cacheGet).toHaveBeenCalledWith(promptLibraryKey);
    expect(html).toContain('id="webtomind-prompt-library-bootstrap"');
    expect(
      html.match(/data-webtomind-prompt-library-preload="1"/g)
    ).toHaveLength(2);
    expect(html).toContain('HOeplUrXUAAyvkY.jpg?name=small&amp;format=jpg');
    expect(html).toContain('https://images.example.test/mobile-lcp.jpg');
    expect(html).not.toContain('media="(max-width: 820px)"');
    expect(html).toContain('loading="eager"');
    expect(html).toContain('decoding="sync"');
    expect(html).toContain('fetchpriority="high"');
    expect(html.match(/<h1\b/gi)).toHaveLength(1);
  });

  it(
    'serves the last-known-good prompt snapshot while refresh loading stalls',
    // Wall-clock budget under parallel CI workers; a stalled refresh should
    // resolve in milliseconds, 5s only absorbs runner CPU contention.
    { timeout: 15000 },
    async () => {
      const indexHtml =
        '<!doctype html><html><head><title>Home</title><meta name="description" content="home" /><meta name="robots" content="index,follow" /><link rel="canonical" href="https://webtomind.com/" /><script type="module" src="/assets/index.prompt-timeout.js"></script></head><body><div id="root"></div></body></html>';
      const promptLibraryPath =
        '/api/content/prompt-cases?library=1&limit=48&sort=latest&v=prompt-library-v3&locale=zh-CN&requireImage=1&seoOnly=1';
      const promptLibraryKey =
        getPublicContentCacheKeyForTest(promptLibraryPath);
      const snapshotKey = 'prompt-library-bootstrap:v3:/zh-CN/prompts';
      const snapshot = {
        items: [
          {
            id: 'case-lkg',
            imageUrl: 'https://images.example.test/lkg.jpg',
            imageUrls: ['https://images.example.test/lkg.jpg'],
            title: '稳定快照案例',
            prompt: '稳定快照 Prompt'
          }
        ],
        total: 1,
        pageInfo: { nextCursor: null, hasMore: false },
        facets: { models: [], labels: [], sorts: [] },
        queryEcho: { locale: 'zh-CN', sort: 'latest', limit: 48 },
        version: 'prompt-library-v2',
        source: 'rpc'
      };
      const stalledRead = new Promise<null>(() => undefined);
      const cacheGet = vi.fn((key: string) => {
        if (key === snapshotKey)
          return Promise.resolve(JSON.stringify(snapshot));
        return key === promptLibraryKey ? stalledRead : Promise.resolve(null);
      });
      const startedAt = Date.now();

      const response = await worker.fetch(
        new Request('https://webtomind.com/zh-CN/prompts'),
        {
          CANONICAL_HOST: 'webtomind.com',
          WEBTOMIND_PUBLIC_CACHE: {
            get: cacheGet,
            put: vi.fn(async () => undefined)
          },
          ASSETS: { fetch: vi.fn(async () => new Response(indexHtml)) }
        } as never,
        { waitUntil: vi.fn() } as never
      );
      const elapsedMs = Date.now() - startedAt;
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(cacheGet).toHaveBeenCalledWith(snapshotKey);
      expect(cacheGet).toHaveBeenCalledWith(promptLibraryKey);
      expect(elapsedMs).toBeLessThan(5000);
      expect(html).toContain('data-webtomind-ssr="prompt-handoff"');
      expect(html).toContain('id="webtomind-prompt-library-bootstrap"');
      expect(html).toContain('稳定快照案例');
    }
  );

  it('uses the canonical category label for category-route bootstrap data', async () => {
    const indexHtml =
      '<!doctype html><html><head><script type="module" src="/assets/index.prompt-category.js"></script></head><body><div id="root"></div></body></html>';
    const promptLibraryKey = getPublicContentCacheKeyForTest(
      '/api/content/prompt-cases?library=1&limit=48&sort=latest&v=prompt-library-v3&locale=zh-CN&requireImage=1&seoOnly=1&label=portrait-photography'
    );
    const cacheGet = vi.fn(async (key: string) => {
      if (key !== promptLibraryKey) return null;
      return JSON.stringify({
        items: [
          {
            id: 'portrait-case',
            imageUrl: 'https://images.example.test/portrait.jpg',
            imageUrls: ['https://images.example.test/portrait.jpg'],
            title: 'Portrait case',
            prompt: ''
          }
        ],
        total: 1,
        pageInfo: { nextCursor: null, hasMore: false },
        facets: { models: [], labels: [], sorts: [] },
        queryEcho: {
          locale: 'zh-CN',
          label: 'portrait-photography',
          sort: 'latest',
          limit: 48
        },
        version: 'prompt-library-v2',
        source: 'rpc'
      });
    });

    const response = await worker.fetch(
      new Request('https://webtomind.com/zh-CN/prompts/category/ai-portrait'),
      {
        CANONICAL_HOST: 'webtomind.com',
        WEBTOMIND_PUBLIC_CACHE: {
          get: cacheGet,
          put: vi.fn(async () => undefined)
        },
        ASSETS: { fetch: vi.fn(async () => new Response(indexHtml)) }
      } as never,
      { waitUntil: () => undefined } as never
    );

    expect(response.status).toBe(200);
    expect(cacheGet).toHaveBeenCalledWith(promptLibraryKey);
    await expect(response.text()).resolves.toContain(
      '"label":"portrait-photography"'
    );
  });

  it('does not leak asset cache status headers onto SPA app shells', async () => {
    const indexHtml =
      '<!doctype html><html><head><script type="module" src="/assets/index.test.js"></script></head><body><div id="root"></div></body></html>';
    const response = await worker.fetch(
      new Request('https://webtomind.com/zh-CN/create'),
      {
        CANONICAL_HOST: 'webtomind.com',
        ASSETS: {
          fetch: vi.fn(
            async () =>
              new Response(indexHtml, {
                headers: {
                  'Content-Type': 'text/html',
                  'CF-Cache-Status': 'HIT',
                  Age: '120'
                }
              })
          )
        }
      } as never,
      { waitUntil: () => undefined } as never
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe(
      'no-cache, no-store, must-revalidate, max-age=0'
    );
    expect(response.headers.get('cf-cache-status')).toBeNull();
    expect(response.headers.get('age')).toBeNull();
    await expect(response.text()).resolves.toContain('/assets/index.test.js');
  });

  it('renders known workspace routes as self-canonical noindex shells', async () => {
    const indexHtml =
      '<!doctype html><html><head><title>Home</title><meta name="description" content="home" /><meta name="robots" content="index,follow" /><link rel="canonical" href="https://webtomind.com/" /></head><body><div id="root"></div></body></html>';
    const response = await worker.fetch(
      new Request('https://webtomind.com/zh-CN/gallery'),
      {
        CANONICAL_HOST: 'webtomind.com',
        ASSETS: { fetch: vi.fn(async () => new Response(indexHtml)) }
      } as never,
      { waitUntil: () => undefined } as never
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('x-webtomind-seo-renderer')).toBe(
      'cloudflare-noindex-shell'
    );
    expect(html).toContain('<meta name="robots" content="noindex,nofollow" />');
    expect(html).toContain(
      '<link rel="canonical" href="https://webtomind.com/zh-CN/gallery" />'
    );
  });

  it('returns a real noindex 404 response for unknown page routes', async () => {
    const indexHtml =
      '<!doctype html><html><head><title>Home</title><meta name="description" content="home" /><meta name="robots" content="index,follow" /><link rel="canonical" href="https://webtomind.com/" /></head><body><div id="root"></div></body></html>';
    const response = await worker.fetch(
      new Request('https://webtomind.com/not-a-real-page'),
      {
        CANONICAL_HOST: 'webtomind.com',
        ASSETS: { fetch: vi.fn(async () => new Response(indexHtml)) }
      } as never,
      { waitUntil: () => undefined } as never
    );
    const html = await response.text();

    expect(response.status).toBe(404);
    expect(html).toContain('<title>Page not found | WebToMind</title>');
    expect(html).toContain('<meta name="robots" content="noindex,follow" />');
    expect(html).toContain(
      '<link rel="canonical" href="https://webtomind.com/not-a-real-page" />'
    );
  });

  it('routes private/noindex dynamic share pages through the Worker SEO renderer', () => {
    expect(getSeoRouteLabelForTest('/s/example-token')).toBe('worker-seo');
  });

  it('serves prompt OG image cache through the Worker front door', () => {
    expect(
      getSeoRouteLabelForTest(
        '/api/prompt-og?locale=zh-CN&id=case-123&v=20260609-image-only-card'
      )
    ).toBe('worker-api:/api/prompt-og');
  });

  it('renders prompt OG fallback SVG on the Worker without legacy origin', async () => {
    const response = await worker.fetch(
      new Request(
        'https://webtomind.com/api/prompt-og?locale=en-US&slug=case-one'
      ),
      { CANONICAL_HOST: 'webtomind.com' } as never,
      { waitUntil: () => undefined } as never
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('image/svg+xml');
    expect(response.headers.get('x-prompt-og-cache')).toBe('WORKER-SVG');
    expect(response.headers.get('x-webtomind-origin-runtime')).toBe(
      'cloudflare-worker'
    );
    await expect(response.text()).resolves.toContain('Reusable visual prompt');
  });

  it('runs video generation auth rejection on the Worker without legacy origin', async () => {
    expect(getSeoRouteLabelForTest('/api/video/generate')).toBe(
      'queue-worker:/api/video/generate'
    );

    const response = await worker.fetch(
      new Request('https://webtomind.com/api/video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'A slow cinematic product reveal',
          model: 'seedance-2-0',
          aspectRatio: '16:9',
          duration: 5
        })
      }),
      {
        CANONICAL_HOST: 'webtomind.com',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'anon',
        SUPABASE_SERVICE_ROLE_KEY: 'service',
        ARK_VIDEO_GENERATION_ENABLED: 'true',
        ARK_VIDEO_LAUNCH_ENABLED: 'true',
        ARK_API_KEY: 'ark',
        ARK_VIDEO_API_BASE_URL: 'https://api.example.test',
        VIDEO_QUEUE_PROVIDER: 'cloudflare'
      } as never,
      { waitUntil: () => undefined } as never
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('x-webtomind-origin-runtime')).toBe(
      'cloudflare-worker'
    );
    await expect(response.json()).resolves.toMatchObject({
      error: 'Unauthorized'
    });
  });

  it('blocks video generation at the Worker front door while launch is disabled', async () => {
    const response = await worker.fetch(
      new Request('https://webtomind.com/api/video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'A slow cinematic product reveal',
          model: 'seedance-2-0',
          aspectRatio: '16:9',
          duration: 5
        })
      }),
      {
        CANONICAL_HOST: 'webtomind.com',
        ARK_VIDEO_GENERATION_ENABLED: 'true',
        VIDEO_QUEUE_PROVIDER: 'cloudflare'
      } as never,
      { waitUntil: () => undefined } as never
    );

    expect(response.status).toBe(501);
    expect(response.headers.get('x-webtomind-video-queue-enqueue')).toBe(
      'skipped-maintenance'
    );
    await expect(response.json()).resolves.toMatchObject({
      error: 'VIDEO_GENERATION_NOT_ENABLED',
      enablement: {
        generationEnabled: true,
        launchEnabled: false
      }
    });
  });

  it('serves video model availability from the Worker front door without KV cache', async () => {
    const response = await worker.fetch(
      new Request('https://webtomind.com/api/video/models?codex=1'),
      {
        CANONICAL_HOST: 'webtomind.com',
        ARK_VIDEO_GENERATION_ENABLED: 'true'
      } as never,
      { waitUntil: () => undefined } as never
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as {
      enabled: boolean;
      enablement: Record<string, unknown>;
      models: Array<Record<string, unknown>>;
    };
    expect(body).toMatchObject({
      enabled: false,
      enablement: {
        generationEnabled: true,
        launchEnabled: false
      }
    });
    expect(
      body.models.find((model) => model.id === 'seedance-2-0')
    ).toMatchObject({
      defaultAspectRatio: 'adaptive',
      maxReferenceImages: 9,
      maxReferenceVideos: 3,
      maxReferenceAudios: 3,
      supportsReferenceVideo: true,
      supportsReferenceAudio: true,
      supportedDurations: expect.arrayContaining([4, 10, 15]),
      supportedResolutions: ['480p', '720p', '1080p', '4k'],
      supportsGenerateAudio: true
    });
    expect(body.models.map((model) => model.id)).toEqual([
      'seedance-2-5',
      'seedance-2-0',
      'seedance-2-0-fast',
      'seedance-2-0-mini'
    ]);
    expect(
      body.models.find((model) => model.id === 'seedance-2-5')
    ).toMatchObject({
      status: 'available',
      maxReferenceImages: 30,
      maxReferenceVideos: 10,
      maxReferenceAudios: 10,
      maxReferenceMediaDurationSeconds: 30,
      supportedDurations: expect.arrayContaining([4, 15, 30]),
      supportedResolutions: ['480p', '720p'],
      supportedOutputFormats: ['mp4', 'mov']
    });
    expect(body.enablement).not.toHaveProperty('requiredEnv');
    expect(body.models[0]).not.toHaveProperty('provider');
    expect(body.models[0]).not.toHaveProperty('apiModel');
    expect(body.models[0]).not.toHaveProperty('creditMultiplier');
    expect(JSON.stringify(body)).not.toMatch(/tuzi/i);
  });

  it('labels the public model gateway as a Worker API route', () => {
    expect(getSeoRouteLabelForTest('/v1/models')).toBe('worker-api:/v1/:path');
    expect(getSeoRouteLabelForTest('/v1/chat/completions')).toBe(
      'worker-api:/v1/:path'
    );
  });

  it('serves reference media upload auth rejection from the Worker', async () => {
    expect(getSeoRouteLabelForTest('/api/video/references/upload')).toBe(
      'worker-api:/api/video/references/upload'
    );

    const response = await worker.fetch(
      new Request('https://webtomind.com/api/video/references/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      }),
      {
        CANONICAL_HOST: 'webtomind.com',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'anon',
        SUPABASE_SERVICE_ROLE_KEY: 'service'
      } as never,
      { waitUntil: () => undefined } as never
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('x-webtomind-origin-runtime')).toBe(
      'cloudflare-worker'
    );
    await expect(response.json()).resolves.toMatchObject({
      error: '请先登录'
    });
  });

  it('returns gone for the retired NLM service', async () => {
    expect(getSeoRouteLabelForTest('/api/nlm/process')).toBe(
      'worker-retired:/api/nlm/*'
    );

    const response = await worker.fetch(
      new Request('https://webtomind.com/api/nlm/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_type: 'text',
          source_content: 'hello',
          output_type: 'summary'
        })
      }),
      {
        CANONICAL_HOST: 'webtomind.com'
      } as never,
      { waitUntil: () => undefined } as never
    );

    expect(response.status).toBe(410);
    expect(response.headers.get('x-webtomind-origin-runtime')).toBe(
      'cloudflare-worker'
    );
    await expect(response.json()).resolves.toMatchObject({
      error: 'NLM_SERVICE_RETIRED'
    });
  });

  it('serves anonymous public content API responses from Cloudflare KV', async () => {
    const key = getPublicContentCacheKeyForTest(
      '/api/content/blog?locale=zh-CN&limit=1'
    );
    const cacheGet = vi.fn(async (requestedKey: string) =>
      requestedKey === key
        ? JSON.stringify({
            posts: [{ id: 'post-1', title: 'Cached post' }]
          })
        : null
    );
    const cachePut = vi.fn();

    const response = await worker.fetch(
      new Request(
        'https://webtomind.com/api/content/blog?limit=1&locale=zh-CN'
      ),
      {
        CANONICAL_HOST: 'webtomind.com',
        WEBTOMIND_PUBLIC_CACHE: {
          get: cacheGet,
          put: cachePut
        }
      } as never,
      { waitUntil: () => undefined } as never
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-webtomind-kv-cache')).toBe('HIT');
    expect(response.headers.get('vary')).toBe(
      'Authorization, Cookie, Origin, x-cron-secret'
    );
    await expect(response.json()).resolves.toMatchObject({
      posts: [{ id: 'post-1', title: 'Cached post' }]
    });
    expect(cacheGet).toHaveBeenCalledWith(key);
    expect(cachePut).not.toHaveBeenCalled();
  });

  it('serves static SEO blog detail through the existing content API route', async () => {
    const response = await worker.fetch(
      new Request(
        'https://webtomind.com/api/content/blog?locale=zh-CN&slug=product-image-ai-guide'
      ),
      {
        CANONICAL_HOST: 'webtomind.com'
      } as never,
      { waitUntil: () => undefined } as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      post: {
        slug: 'product-image-ai-guide',
        locale: 'zh-CN',
        title: 'AI 商品图生成工作流：从白底图到场景图',
        cta_links: [
          {
            href: expect.stringContaining(
              'cta_source=seo_blog_product-image-ai-guide_use_template'
            )
          }
        ]
      }
    });
  });

  it('falls back to the Cloudflare edge cache when KV has no public content entry', async () => {
    const path =
      '/api/content/prompt-cases?library=1&limit=48&sort=latest&v=prompt-library-v2&locale=zh-CN&requireImage=1';
    const edgeMatch = vi.fn(async () =>
      Response.json({
        items: [{ id: 'edge-case', title: 'Edge cached case' }],
        total: 1
      })
    );
    vi.stubGlobal('caches', {
      default: {
        match: edgeMatch,
        put: vi.fn()
      }
    });

    try {
      const cacheGet = vi.fn(async () => null);
      const response = await worker.fetch(
        new Request(`https://webtomind.com${path}`),
        {
          CANONICAL_HOST: 'webtomind.com',
          WEBTOMIND_PUBLIC_CACHE: {
            get: cacheGet,
            put: vi.fn()
          }
        } as never,
        { waitUntil: () => undefined } as never
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('x-webtomind-edge-cache')).toBe('HIT');
      expect(response.headers.get('x-webtomind-kv-cache')).toBe('MISS');
      await expect(response.json()).resolves.toMatchObject({
        items: [{ id: 'edge-case', title: 'Edge cached case' }]
      });
      expect(edgeMatch).toHaveBeenCalledOnce();
      expect(cacheGet).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('uses the short versioned KV contract for public prompt assets', async () => {
    const path = '/api/content/prompt-assets?limit=1000';
    const key = getPublicContentCacheKeyForTest(path);
    const cacheGet = vi.fn(async (requestedKey: string) =>
      requestedKey === key ? JSON.stringify({ assets: [] }) : null
    );

    expect(key).toContain('public-content:v2:/api/content/prompt-assets:');

    const response = await worker.fetch(
      new Request(`https://webtomind.com${path}`),
      {
        CANONICAL_HOST: 'webtomind.com',
        WEBTOMIND_PUBLIC_CACHE: {
          get: cacheGet,
          put: vi.fn()
        }
      } as never,
      { waitUntil: () => undefined } as never
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-webtomind-kv-cache')).toBe('HIT');
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=60, stale-while-revalidate=60'
    );
  });

  it('bypasses Cloudflare KV for authenticated public content requests', async () => {
    const cacheGet = vi.fn();
    const response = await worker.fetch(
      new Request('https://webtomind.com/api/content/blog?limit=1', {
        headers: { Authorization: 'Bearer test-token' }
      }),
      {
        CANONICAL_HOST: 'webtomind.com',
        WEBTOMIND_PUBLIC_CACHE: {
          get: cacheGet,
          put: vi.fn()
        }
      } as never,
      { waitUntil: () => undefined } as never
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('x-webtomind-kv-cache')).toBe('BYPASS');
    expect(response.headers.get('vary')).toBe(
      'Authorization, Cookie, Origin, x-cron-secret'
    );
    expect(cacheGet).not.toHaveBeenCalled();
  });

  it('bypasses Cloudflare KV when public content requests include unknown query params', async () => {
    const cacheGet = vi.fn();
    const cachePut = vi.fn();
    const response = await worker.fetch(
      new Request('https://webtomind.com/api/content/blog?limit=1&cacheBust=x'),
      {
        CANONICAL_HOST: 'webtomind.com',
        WEBTOMIND_PUBLIC_CACHE: {
          get: cacheGet,
          put: cachePut
        }
      } as never,
      { waitUntil: () => undefined } as never
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('x-webtomind-kv-cache')).toBe('BYPASS');
    expect(response.headers.get('vary')).toBe(
      'Authorization, Cookie, Origin, x-cron-secret'
    );
    expect(cacheGet).not.toHaveBeenCalled();
    expect(cachePut).not.toHaveBeenCalled();
  });

  it('protects the Hyperdrive diagnostic route on the Worker', async () => {
    expect(getSeoRouteLabelForTest('/api/debug/hyperdrive')).toBe(
      'worker-api:/api/debug/hyperdrive'
    );

    const response = await worker.fetch(
      new Request('https://webtomind.com/api/debug/hyperdrive'),
      { CANONICAL_HOST: 'webtomind.com' } as never,
      { waitUntil: () => undefined } as never
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('x-webtomind-origin-runtime')).toBe(
      'cloudflare-worker'
    );
    await expect(response.json()).resolves.toMatchObject({
      error: 'Missing Authorization header'
    });
  });

  it('keeps the Hyperdrive diagnostic route disabled by default after prompt admin auth passes', async () => {
    const response = await worker.fetch(
      new Request('https://webtomind.com/api/debug/hyperdrive', {
        headers: { Authorization: 'Bearer admin-token' }
      }),
      {
        CANONICAL_HOST: 'webtomind.com',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'anon'
      } as never,
      { waitUntil: () => undefined } as never
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toMatchObject({
      error: 'HYPERDRIVE_DIAGNOSTIC_DISABLED'
    });
  });

  it('returns a safe Hyperdrive setup error when diagnostics are enabled without a binding', async () => {
    const response = await worker.fetch(
      new Request('https://webtomind.com/api/debug/hyperdrive', {
        headers: { Authorization: 'Bearer admin-token' }
      }),
      {
        CANONICAL_HOST: 'webtomind.com',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'anon',
        HYPERDRIVE_DIAGNOSTIC_ENABLED: 'true'
      } as never,
      { waitUntil: () => undefined } as never
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toMatchObject({
      error: 'HYPERDRIVE_NOT_CONFIGURED'
    });
  });

  it('protects the queue diagnostic route on the Worker', async () => {
    expect(getSeoRouteLabelForTest('/api/debug/queues')).toBe(
      'worker-api:/api/debug/queues'
    );

    const response = await worker.fetch(
      new Request('https://webtomind.com/api/debug/queues'),
      { CANONICAL_HOST: 'webtomind.com' } as never,
      { waitUntil: () => undefined } as never
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Missing Authorization header'
    });
  });

  it('returns queue and DLQ backlog metrics for prompt admins', async () => {
    const response = await worker.fetch(
      new Request('https://webtomind.com/api/debug/queues', {
        headers: { Authorization: 'Bearer admin-token' }
      }),
      {
        CANONICAL_HOST: 'webtomind.com',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'anon',
        IMAGE_JOBS: {
          send: vi.fn(),
          metrics: vi.fn(async () => ({
            backlogCount: 2,
            backlogBytes: 200,
            oldestMessageTimestamp: 1_700_000_000_000
          }))
        },
        IMAGE_JOBS_DLQ: {
          send: vi.fn(),
          metrics: vi.fn(async () => ({
            backlogCount: 1,
            backlogBytes: 100,
            oldestMessageTimestamp: 1_700_000_100_000
          }))
        }
      } as never,
      { waitUntil: () => undefined } as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      route: '/api/debug/queues',
      deadLetterBacklogCount: 1,
      queues: expect.arrayContaining([
        expect.objectContaining({
          binding: 'IMAGE_JOBS',
          configured: true,
          backlogCount: 2
        }),
        expect.objectContaining({
          binding: 'IMAGE_JOBS_DLQ',
          configured: true,
          backlogCount: 1,
          kind: 'dead_letter'
        }),
        expect.objectContaining({
          binding: 'VIDEO_JOBS_DLQ',
          configured: false,
          error: 'QUEUE_BINDING_MISSING'
        })
      ])
    });
  });

  it('keeps prompt admin pages out of prompt detail SSR and search indexes', () => {
    expect(getSeoRouteLabelForTest('/zh-CN/prompts/admin')).toBe(
      'worker-noindex-shell'
    );
    expect(getSeoRouteLabelForTest('/en-US/prompts/admin')).toBe(
      'worker-noindex-shell'
    );
  });

  it('routes prompt admin APIs through the Cloudflare Worker', () => {
    expect(getSeoRouteLabelForTest('/api/admin/prompt-cases')).toBe(
      'worker-api:/api/admin/prompt-cases'
    );
    expect(getSeoRouteLabelForTest('/api/admin/prompt-cases/upload')).toBe(
      'worker-api:/api/admin/prompt-cases/upload'
    );
    expect(getSeoRouteLabelForTest('/api/admin/prompt-case-drafts')).toBe(
      'worker-api:/api/admin/prompt-case-drafts'
    );
    expect(
      getSeoRouteLabelForTest('/api/admin/prompt-case-drafts/draft-123')
    ).toBe('worker-api:/api/admin/prompt-case-drafts/:id');
    expect(
      getSeoRouteLabelForTest('/api/admin/prompt-case-drafts/draft-123/publish')
    ).toBe('worker-api:/api/admin/prompt-case-drafts/:id/publish');
    expect(getSeoRouteLabelForTest('/api/admin/ai-usage/summary')).toBe(
      'worker-api:/api/admin/ai-usage/summary'
    );
    expect(getSeoRouteLabelForTest('/api/admin/prompt-assets')).toBe(
      'worker-api:/api/admin/prompt-assets'
    );
    expect(
      getSeoRouteLabelForTest('/api/admin/prompt-case-asset-coverage/analyze')
    ).toBe('worker-api:/api/admin/prompt-case-asset-coverage/analyze');
    expect(
      getSeoRouteLabelForTest('/api/admin/prompt-asset-production-batches')
    ).toBe('worker-api:/api/admin/prompt-asset-production-batches');
    expect(
      getSeoRouteLabelForTest(
        '/api/admin/prompt-asset-production-batches/batch-123'
      )
    ).toBe('worker-api:/api/admin/prompt-asset-production-batches/:id');
    expect(
      getSeoRouteLabelForTest(
        '/api/admin/prompt-asset-production-batches/batch-123/run'
      )
    ).toBe('worker-api:/api/admin/prompt-asset-production-batches/:id/run');
  });

  it('routes image session detail APIs through the Cloudflare Worker', () => {
    expect(getSeoRouteLabelForTest('/api/image-sessions/session-123')).toBe(
      'worker-api:/api/image-sessions/:id'
    );
    expect(
      getSeoRouteLabelForTest('/api/image-sessions/session-123/turns')
    ).toBe('worker-api:/api/image-sessions/:id/turns');
  });

  it('routes workspace task dynamic APIs through the Cloudflare Worker', () => {
    expect(getSeoRouteLabelForTest('/api/workspace/tasks/task-123')).toBe(
      'worker-api:/api/workspace/tasks/:id'
    );
    expect(
      getSeoRouteLabelForTest('/api/workspace/tasks/task-123/result')
    ).toBe('worker-api:/api/workspace/tasks/:id/result');
    expect(
      getSeoRouteLabelForTest('/api/workspace/tasks/task-123/cancel')
    ).toBe('worker-api:/api/workspace/tasks/:id/cancel');
    expect(getSeoRouteLabelForTest('/api/workspace/tasks/task-123/retry')).toBe(
      'worker-api:/api/workspace/tasks/:id/retry'
    );
  });

  it('invokes workspace task dynamic API handlers through the Worker', async () => {
    const routes = [
      { method: 'GET', pathname: '/api/workspace/tasks/task-123' },
      { method: 'GET', pathname: '/api/workspace/tasks/task-123/result' },
      { method: 'POST', pathname: '/api/workspace/tasks/task-123/cancel' },
      { method: 'POST', pathname: '/api/workspace/tasks/task-123/retry' }
    ];

    for (const { method, pathname } of routes) {
      const response = await worker.fetch(
        new Request(`https://webtomind.com${pathname}`, {
          method,
          headers: { Origin: 'https://webtomind.com' }
        }),
        { CANONICAL_HOST: 'webtomind.com' } as never,
        { waitUntil: () => undefined } as never
      );

      expect(response.status).toBe(401);
      expect(response.headers.get('access-control-allow-origin')).toBe(
        'https://webtomind.com'
      );
      await expect(response.json()).resolves.toEqual({ error: '请先登录' });
    }
  });

  it('routes workspace task dynamic APIs through the Cloudflare Worker', () => {
    expect(getSeoRouteLabelForTest('/api/workspace/tasks/task-123')).toBe(
      'worker-api:/api/workspace/tasks/:id'
    );
    expect(
      getSeoRouteLabelForTest('/api/workspace/tasks/task-123/result')
    ).toBe('worker-api:/api/workspace/tasks/:id/result');
    expect(
      getSeoRouteLabelForTest('/api/workspace/tasks/task-123/cancel')
    ).toBe('worker-api:/api/workspace/tasks/:id/cancel');
    expect(getSeoRouteLabelForTest('/api/workspace/tasks/task-123/retry')).toBe(
      'worker-api:/api/workspace/tasks/:id/retry'
    );
  });

  it('invokes workspace task dynamic API handlers through the Worker', async () => {
    const routes = [
      { method: 'GET', pathname: '/api/workspace/tasks/task-123' },
      { method: 'GET', pathname: '/api/workspace/tasks/task-123/result' },
      { method: 'POST', pathname: '/api/workspace/tasks/task-123/cancel' },
      { method: 'POST', pathname: '/api/workspace/tasks/task-123/retry' }
    ];

    for (const { method, pathname } of routes) {
      const response = await worker.fetch(
        new Request(`https://webtomind.com${pathname}`, {
          method,
          headers: { Origin: 'https://webtomind.com' }
        }),
        { CANONICAL_HOST: 'webtomind.com' } as never,
        { waitUntil: () => undefined } as never
      );

      expect(response.status).toBe(401);
      expect(response.headers.get('access-control-allow-origin')).toBe(
        'https://webtomind.com'
      );
      await expect(response.json()).resolves.toEqual({ error: '请先登录' });
    }
  });

  it('serves curated image collections from Cloudflare assets', () => {
    expect(
      getSeoRouteLabelForTest(
        '/prompt-cases/2026-06-25-gta-6-cover-girls/sunset-cover-girl-game-key-art.webp'
      )
    ).toBe('asset');
    expect(
      getSeoRouteLabelForTest('/moodboards/curated/urban-film-1.webp')
    ).toBe('asset');
    expect(
      getSeoRouteLabelForTest(
        '/discovery/krea/ffffaa51-090b-5747-9951-5c745317e46e.webp'
      )
    ).toBe('asset');
    expect(
      getSeoRouteLabelForTest('/referral/creator-invite-collaboration-v1.webp')
    ).toBe('asset');
  });

  it('serves create workspace entry routes with noindex app shells', () => {
    expect(getSeoRouteLabelForTest('/create')).toBe('worker-noindex-shell');
    expect(getSeoRouteLabelForTest('/zh-CN/create')).toBe(
      'worker-noindex-shell'
    );
    expect(getSeoRouteLabelForTest('/en-US/create')).toBe(
      'worker-noindex-shell'
    );
  });

  it('serves API marketplace entry routes with noindex app shells', () => {
    expect(getSeoRouteLabelForTest('/models')).toBe('worker-noindex-shell');
    expect(getSeoRouteLabelForTest('/zh-CN/models')).toBe(
      'worker-noindex-shell'
    );
    expect(getSeoRouteLabelForTest('/api-console')).toBe(
      'worker-noindex-shell'
    );
    expect(getSeoRouteLabelForTest('/en-US/api-console')).toBe(
      'worker-noindex-shell'
    );
  });

  it('renders localized legal pages through the SEO renderer', () => {
    expect(getSeoRouteLabelForTest('/zh-CN/terms')).toBe('worker-seo');
    expect(getSeoRouteLabelForTest('/zh-CN/privacy')).toBe('worker-seo');
    expect(getSeoRouteLabelForTest('/en-US/terms')).toBe('worker-seo');
    expect(getSeoRouteLabelForTest('/en-US/privacy')).toBe('worker-seo');
  });

  it('marks tracking-parameter page variants as noindex without blocking clean URLs', () => {
    expect(
      shouldNoindexTrackingUrlForTest(
        '/zh-CN/blog/ai-zhuanshu-card?source=seo_ai_zhuanshu_card'
      )
    ).toBe(true);
    expect(
      shouldNoindexTrackingUrlForTest(
        '/zh-CN/pricing?returnTo=%2Fzh-CN%2Fblog%2Fai-zhuanshu-card'
      )
    ).toBe(true);
    expect(shouldNoindexTrackingUrlForTest('/zh-CN/prompts/foo?card=v1')).toBe(
      true
    );
    expect(
      shouldNoindexTrackingUrlForTest('/zh-CN/blog/ai-zhuanshu-card')
    ).toBe(false);
    expect(
      shouldNoindexTrackingUrlForTest('/api/content/blog?source=seo')
    ).toBe(false);
  });

  it('serves the pre-mount boot watchdog from the Worker itself', async () => {
    const response = await worker.fetch(
      new Request('https://webtomind.com/boot-watchdog.js'),
      {
        CANONICAL_HOST: 'webtomind.com'
      } as never,
      { waitUntil: vi.fn() } as never
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain(
      'application/javascript'
    );
    const body = await response.text();
    expect(body).toContain('__WEBTOMIND_APP_MOUNTED__');
    expect(body).toContain('/assets/');
  });

  it('caches content-hashed assets immutably but keeps sw.js uncached', async () => {
    const assetResponse = await worker.fetch(
      new Request('https://webtomind.com/assets/index.AbcDef12GhI.js'),
      {
        CANONICAL_HOST: 'webtomind.com',
        ASSETS: { fetch: vi.fn(async () => new Response('bundle')) }
      } as never,
      { waitUntil: vi.fn() } as never
    );
    expect(assetResponse.headers.get('cache-control')).toContain('immutable');
    expect(assetResponse.headers.get('cache-control')).toContain(
      'max-age=31536000'
    );

    const swResponse = await worker.fetch(
      new Request('https://webtomind.com/sw.js'),
      {
        CANONICAL_HOST: 'webtomind.com',
        ASSETS: { fetch: vi.fn(async () => new Response('sw')) }
      } as never,
      { waitUntil: vi.fn() } as never
    );
    expect(swResponse.headers.get('cache-control')).toContain('no-store');
  });

  it('routes every image tool directory page through the app page renderer for crawlers', () => {
    // Regression: background-remover was added to createAppContentItems (and the
    // sitemap) on 2026-08-15 but missed in the Worker isCreateAppPath() regex, so
    // Googlebot received a hard 404 on /tools/background-remover and Google Search
    // Console flagged a new "Not found (404)" indexing issue. Keep the Worker tool
    // list in sync with createAppContentItems (pindou-pattern-maker routes via
    // /api/seo-page through isExactSeoPath).
    const appPageToolSlugs = createAppContentItems
      .map((item) => item.slug)
      .filter((slug) => slug !== 'pindou-pattern-maker');

    for (const slug of appPageToolSlugs) {
      for (const locale of ['zh-CN', 'en-US']) {
        const path = '/' + locale + '/tools/' + slug;
        const expected =
          '/api/create-app-page?locale=' +
          locale +
          '&path=' +
          encodeURIComponent(path) +
          '&slug=' +
          slug;
        expect(getSeoTargetForTest(path)).toBe(expected);
        expect(getSeoRouteLabelForTest(path)).toBe('worker-seo');
      }
    }
  });
});
