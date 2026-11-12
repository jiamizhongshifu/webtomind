import { describe, expect, it } from 'vitest';
import {
  getSkillDetailSlugFromPath,
  renderSeoPageHtmlWithStatus,
  resolveSeoConfigForPathOrNull
} from '../../api/seo-page-render';
import { loadPublishedSkillDetail } from '../../api/skill-catalog/handlers';
import type {
  SkillCatalogStore,
  SkillExampleRecord,
  SkillRecord,
  SkillVersionRecord
} from '../../api/skill-catalog/service';
import {
  buildSkillSitemapUrls,
  getStaticSitemapPathsForTest
} from '../../api/sitemap-render';

const BASE_HTML = `<!DOCTYPE html><html lang="zh-CN"><head>
<title>WebToMind</title>
<meta name="description" content="" />
<meta name="robots" content="index,follow" />
<link rel="canonical" href="https://webtomind.com/" />
<meta property="og:type" content="website" />
<meta property="og:title" content="" />
<meta property="og:description" content="" />
<meta property="og:url" content="" />
<meta property="og:image" content="" />
<meta name="twitter:title" content="" />
<meta name="twitter:description" content="" />
<meta name="twitter:image" content="" />
</head><body><div id="root"></div></body></html>`;

function skillRecord(overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    id: 'skill-1',
    slug: 'xhs-cover',
    name: { 'zh-CN': '小红书封面', 'en-US': 'Xiaohongshu Cover' },
    summary: {
      'zh-CN': '一条命令产出小红书爆款封面。',
      'en-US': 'Ship a scroll-stopping Xiaohongshu cover in one command.'
    },
    description: { 'zh-CN': '详细说明', 'en-US': 'Long description' },
    outputTypes: ['image'],
    sceneTags: ['social', 'cover'],
    languages: ['zh-CN', 'en-US'],
    tier: 'free',
    installCount: 12,
    ratingAvg: 4.6,
    ratingCount: 5,
    latestVersionId: 'v-2',
    publishedAt: '2026-10-01T00:00:00.000Z',
    ...overrides
  };
}

const VERSIONS: SkillVersionRecord[] = [
  {
    id: 'v-2',
    version: '1.1.0',
    status: 'published',
    r2ObjectKey: 'skills/xhs-cover/1.1.0.tar.gz',
    archiveFormat: 'tar.gz',
    sha256: 'b'.repeat(64),
    sizeBytes: 2048,
    compatibleAgents: ['claude-code', 'codex'],
    changelog: {},
    publishedAt: '2026-10-15T08:00:00.000Z'
  },
  {
    id: 'v-1',
    version: '1.0.0',
    status: 'published',
    r2ObjectKey: 'skills/xhs-cover/1.0.0.tar.gz',
    archiveFormat: 'tar.gz',
    sha256: 'a'.repeat(64),
    sizeBytes: 1024,
    compatibleAgents: ['claude-code'],
    changelog: {},
    publishedAt: '2026-10-01T00:00:00.000Z'
  }
];

const EXAMPLES: SkillExampleRecord[] = [
  {
    versionId: 'v-2',
    mediaType: 'video',
    mediaUrl: 'https://cdn.webtomind.com/skills/xhs-cover/demo.mp4',
    posterUrl: 'https://cdn.webtomind.com/skills/xhs-cover/poster.jpg',
    title: {},
    description: {}
  },
  {
    versionId: 'v-2',
    mediaType: 'image',
    mediaUrl: 'https://cdn.webtomind.com/skills/xhs-cover/cover-1.png',
    posterUrl: null,
    title: {},
    description: {}
  }
];

function fakeStore(skills: SkillRecord[]): SkillCatalogStore {
  return {
    getPublishedSkill: async (slug: string) =>
      skills.find((skill) => skill.slug === slug) || null,
    listPublishedVersions: async () => VERSIONS,
    listExamples: async () => EXAMPLES
  } as unknown as SkillCatalogStore;
}

async function renderSkill(path: string, skills: SkillRecord[]) {
  const slug = getSkillDetailSlugFromPath(path);
  const skillDetail = slug
    ? await loadPublishedSkillDetail(slug, () => fakeStore(skills))
    : undefined;
  return renderSeoPageHtmlWithStatus(BASE_HTML, path, { skillDetail });
}

function readJsonLd(html: string): Array<Record<string, unknown>> {
  return [
    ...html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g
    )
  ].map((match) => JSON.parse(match[1]));
}

describe('Skill detail SEO', () => {
  it('extracts the slug only for localized detail paths', () => {
    expect(getSkillDetailSlugFromPath('/zh-CN/skills/xhs-cover')).toBe(
      'xhs-cover'
    );
    expect(getSkillDetailSlugFromPath('/en-US/skills/xhs-cover/')).toBe(
      'xhs-cover'
    );
    expect(getSkillDetailSlugFromPath('/en-US/skills/pricing')).toBeNull();
    expect(getSkillDetailSlugFromPath('/en-US/skills')).toBeNull();
    expect(getSkillDetailSlugFromPath('/skills/xhs-cover')).toBeNull();
    expect(getSkillDetailSlugFromPath('/en-US/skills/%E0%A4%A')).toBeNull();
  });

  it('renders indexable localized metadata for a published Skill', async () => {
    const en = await renderSkill('/en-US/skills/xhs-cover', [skillRecord()]);
    expect(en.status).toBe(200);
    expect(en.html).toContain('<html lang="en"');
    expect(en.html).toContain(
      '<title>Xiaohongshu Cover · Agent Skill | WebToMind</title>'
    );
    expect(en.html).toContain(
      '<meta name="description" content="Ship a scroll-stopping Xiaohongshu cover in one command." />'
    );
    expect(en.html).toContain('<meta name="robots" content="index,follow" />');
    expect(en.html).toContain(
      '<link rel="canonical" href="https://webtomind.com/en-US/skills/xhs-cover" />'
    );
    expect(en.html).toContain(
      '<meta property="og:image" content="https://cdn.webtomind.com/skills/xhs-cover/cover-1.png" />'
    );
    for (const [hreflang, locale] of [
      ['zh-CN', 'zh-CN'],
      ['en-US', 'en-US'],
      ['x-default', 'en-US']
    ]) {
      expect(en.html).toContain(
        `<link rel="alternate" hreflang="${hreflang}" href="https://webtomind.com/${locale}/skills/xhs-cover" />`
      );
    }

    const app = readJsonLd(en.html).find(
      (item) => item['@type'] === 'SoftwareApplication'
    );
    expect(app).toMatchObject({
      name: 'Xiaohongshu Cover',
      url: 'https://webtomind.com/en-US/skills/xhs-cover',
      image: 'https://cdn.webtomind.com/skills/xhs-cover/cover-1.png',
      softwareVersion: '1.1.0',
      dateModified: '2026-10-15T08:00:00.000Z',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      aggregateRating: { ratingValue: 4.6, ratingCount: 5 }
    });

    const zh = await renderSkill('/zh-CN/skills/xhs-cover', [skillRecord()]);
    expect(zh.html).toContain('<html lang="zh-CN"');
    expect(zh.html).toContain(
      '<title>小红书封面 · Agent Skill | WebToMind</title>'
    );
    expect(zh.html).toContain(
      '<meta name="description" content="一条命令产出小红书爆款封面。" />'
    );
    expect(zh.html).toContain(
      '<link rel="canonical" href="https://webtomind.com/zh-CN/skills/xhs-cover" />'
    );
  });

  it('marks Pro Skills as not free and omits a fixed price offer', async () => {
    const result = await renderSkill('/en-US/skills/brand-deck', [
      skillRecord({ slug: 'brand-deck', tier: 'premium', ratingCount: 0 })
    ]);
    expect(result.status).toBe(200);
    expect(result.html).toContain(
      '<meta name="robots" content="index,follow" />'
    );
    const app = readJsonLd(result.html).find(
      (item) => item['@type'] === 'SoftwareApplication'
    );
    expect(app).toMatchObject({ isAccessibleForFree: false });
    expect(app).not.toHaveProperty('offers');
    expect(app).not.toHaveProperty('aggregateRating');
  });

  it('returns a noindex 404 for an unknown or malformed slug', async () => {
    for (const path of [
      '/en-US/skills/does-not-exist',
      '/zh-CN/skills/Not_A_Slug'
    ]) {
      const result = await renderSkill(path, [skillRecord()]);
      expect(result.status).toBe(404);
      expect(result.html).toContain(
        '<meta name="robots" content="noindex,follow" />'
      );
      expect(result.html).not.toContain('SoftwareApplication');
    }
  });

  it('falls back to the noindex shell when the catalog lookup failed', () => {
    const seo = resolveSeoConfigForPathOrNull('/en-US/skills/xhs-cover');
    expect(seo?.robots).toBe('noindex,follow');
    expect(seo?.canonical).toBe('https://webtomind.com/en-US/skills/xhs-cover');
  });

  it('does not index a catalog entry with no published version', async () => {
    const store = fakeStore([skillRecord()]);
    store.listPublishedVersions = async () => [];
    const skillDetail = await loadPublishedSkillDetail(
      'xhs-cover',
      () => store
    );
    expect(skillDetail).toBeNull();
    const result = renderSeoPageHtmlWithStatus(
      BASE_HTML,
      '/en-US/skills/xhs-cover',
      { skillDetail }
    );
    expect(result.status).toBe(404);
    expect(result.html).toContain('content="noindex,follow"');
  });

  it('propagates store failures so the worker can skip caching', async () => {
    await expect(
      loadPublishedSkillDetail(
        'xhs-cover',
        () =>
          ({
            getPublishedSkill: async () => {
              throw new Error('db down');
            }
          }) as unknown as SkillCatalogStore
      )
    ).rejects.toThrow('db down');
    await expect(
      loadPublishedSkillDetail('xhs-cover', () => null)
    ).rejects.toThrow();
  });
});

describe('Skill sitemap entries', () => {
  it('lists the Skill catalog and pricing pages in both locales', () => {
    const paths = getStaticSitemapPathsForTest();
    for (const path of [
      '/zh-CN/skills',
      '/en-US/skills',
      '/zh-CN/skills/pricing',
      '/en-US/skills/pricing'
    ]) {
      expect(paths).toContain(path);
    }
  });

  it('lists published Skills in both locales with the latest version date', () => {
    const urls = buildSkillSitemapUrls(
      [
        {
          id: 'skill-1',
          slug: 'xhs-cover',
          latest_version_id: 'v-2',
          published_at: '2026-10-01T00:00:00Z'
        },
        {
          id: 'skill-2',
          slug: 'no-version-yet',
          latest_version_id: null,
          published_at: '2026-10-02T00:00:00Z'
        },
        {
          id: 'skill-3',
          slug: 'stale-pointer',
          latest_version_id: 'missing',
          published_at: '2026-09-01T00:00:00Z'
        }
      ],
      [
        {
          id: 'v-1',
          skill_id: 'skill-1',
          published_at: '2026-10-01T00:00:00Z'
        },
        {
          id: 'v-2',
          skill_id: 'skill-1',
          published_at: '2026-10-15T08:00:00Z'
        },
        {
          id: 'v-3',
          skill_id: 'skill-3',
          published_at: '2026-09-03T00:00:00Z'
        },
        { id: 'v-4', skill_id: 'skill-3', published_at: '2026-09-20T00:00:00Z' }
      ]
    );

    expect(urls.map((url) => [url.loc, url.lastmod])).toEqual([
      [
        'https://webtomind.com/zh-CN/skills/xhs-cover',
        '2026-10-15T08:00:00.000Z'
      ],
      [
        'https://webtomind.com/en-US/skills/xhs-cover',
        '2026-10-15T08:00:00.000Z'
      ],
      [
        'https://webtomind.com/zh-CN/skills/stale-pointer',
        '2026-09-20T00:00:00.000Z'
      ],
      [
        'https://webtomind.com/en-US/skills/stale-pointer',
        '2026-09-20T00:00:00.000Z'
      ]
    ]);
    expect(urls[0].alternates).toEqual([
      {
        hreflang: 'zh-CN',
        href: 'https://webtomind.com/zh-CN/skills/xhs-cover'
      },
      {
        hreflang: 'en-US',
        href: 'https://webtomind.com/en-US/skills/xhs-cover'
      },
      {
        hreflang: 'x-default',
        href: 'https://webtomind.com/en-US/skills/xhs-cover'
      }
    ]);
  });
});

describe('Skill landing page SEO', () => {
  it.each(['en-US', 'zh-CN'])(
    'serves Skill discovery links before JavaScript for %s',
    (locale) => {
      const result = renderSeoPageHtmlWithStatus(
        BASE_HTML,
        `/${locale}/overview`
      );
      expect(result.status).toBe(200);
      const document = new DOMParser().parseFromString(
        result.html,
        'text/html'
      );
      const landing = document.querySelector('#marketing-seo-ssr');
      expect(landing).not.toBeNull();
      const links = [...landing!.querySelectorAll('a')].map((link) =>
        link.getAttribute('href')
      );
      for (const path of ['/skills', '/skills?tier=free', '/skills/pricing']) {
        expect(links.some((link) => link?.endsWith(`/${locale}${path}`))).toBe(
          true
        );
      }
      expect(links.some((link) => link?.endsWith('/prompts'))).toBe(false);
      expect(
        document.querySelector('link[rel="canonical"]')?.getAttribute('href')
      ).toBe(`https://webtomind.com/${locale}/overview`);
    }
  );
});
