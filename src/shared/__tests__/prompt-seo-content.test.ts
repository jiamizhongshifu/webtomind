import { describe, expect, it } from 'vitest';
import { resolveSeoConfigForPath } from '../../../api/seo-page';
import {
  renderSeoPageHtml,
  renderSeoPageHtmlWithStatus,
  resolveSeoConfigForPathOrNull
} from '../../../api/seo-page-render';
import { PROMPT_SEO_ALIASES } from '../prompt-seo-content';
import {
  PROMPT_STYLE_GRID_ALIAS_PATHS,
  PROMPT_STYLE_GRID_CANONICAL_PATH,
  PROMPT_STYLE_GRID_DETAIL_PATHS
} from '../prompt-style-grid-seo';

function getAlias(path: string) {
  const alias = PROMPT_SEO_ALIASES.find((item) => item.path === path);
  expect(alias).toBeTruthy();
  return alias!;
}

describe('prompt SEO aliases', () => {
  it('maps AI image prompt long-tail aliases to the canonical prompt hub', () => {
    expect(getAlias('/free-ai-image-prompts').canonicalPath).toBe(
      '/en-US/prompts'
    );
    expect(getAlias('/best-ai-image-prompts').canonicalPath).toBe(
      '/en-US/prompts'
    );
    expect(getAlias('/ai-image-prompt-examples').canonicalPath).toBe(
      '/en-US/prompts'
    );
    expect(getAlias('/ai-image-prompts-gallery').canonicalPath).toBe(
      '/en-US/prompts'
    );
    expect(getAlias('/free-ai-image-prompts-gallery').canonicalPath).toBe(
      '/en-US/prompts'
    );
    expect(getAlias('/ai-image-prompts').title.en).toBe(
      'AI Image Prompts Library'
    );
  });

  it('maps model gallery aliases to canonical model prompt pages', () => {
    expect(getAlias('/free-gpt-image-2-prompts').canonicalPath).toBe(
      '/gpt-image-2-prompts'
    );
    expect(getAlias('/gpt-image-2-prompts-gallery').canonicalPath).toBe(
      '/gpt-image-2-prompts'
    );
    expect(getAlias('/nano-banana-prompts-gallery').canonicalPath).toBe(
      '/nano-banana-prompts'
    );
    expect(getAlias('/nano-banana-2-prompts').canonicalPath).toBe(
      '/nano-banana-prompts'
    );
    expect(getAlias('/nano-banana-pro-prompts').canonicalPath).toBe(
      '/nano-banana-prompts'
    );
    expect(getAlias('/mona-lisa-1-prompts').canonicalPath).toBe(
      '/mona-lisa-1-prompts'
    );
    expect(getAlias('/mona-lisa-prompts').canonicalPath).toBe(
      '/mona-lisa-1-prompts'
    );
    expect(getAlias('/gpt-image-2-5-prompts').canonicalPath).toBe(
      '/gpt-image-2-5-prompts'
    );
    expect(getAlias('/luna-lisa-alpha-prompts').canonicalPath).toBe(
      '/luna-lisa-alpha-prompts'
    );
    expect(getAlias('/astra-prompts').canonicalPath).toBe('/astra-prompts');
    expect(getAlias('/gpt-6-astra-prompts').canonicalPath).toBe(
      '/astra-prompts'
    );
  });

  it('maps commercial long-tail aliases to existing prompt hubs', () => {
    expect(getAlias('/poster-design-prompts').canonicalPath).toBe(
      '/marketing-creative-prompts'
    );
    expect(getAlias('/gta-vi-cover-prompts').canonicalPath).toBe(
      '/gta-vi-cover-prompts'
    );
    expect(getAlias('/gta-6-cover-girls-prompts').canonicalPath).toBe(
      '/gta-6-cover-girls-prompts'
    );
    expect(getAlias('/brand-identity-prompts').canonicalPath).toBe(
      '/marketing-creative-prompts'
    );
    expect(getAlias('/3d-figurine-prompts').canonicalPath).toBe(
      '/character-design-prompts'
    );
    expect(getAlias('/clay-aesthetic-prompts').canonicalPath).toBe(
      '/en-US/prompts'
    );
  });

  it('keeps the reference-image page canonical while consolidating generic image-to-prompt', () => {
    expect(getAlias('/image-to-prompt-generator').canonicalPath).toBe(
      '/ai-image-prompt-generator'
    );
    expect(getAlias('/reference-image-to-prompt-generator').canonicalPath).toBe(
      '/reference-image-to-prompt-generator'
    );
  });

  it('maps rich aliases to focused prompt case targets', () => {
    expect(getAlias('/ai-image-prompts').caseTarget).toEqual({
      type: 'package',
      slug: 'ai-image-prompt-examples'
    });
    expect(getAlias('/image-to-prompt-generator').caseTarget).toEqual({
      type: 'package',
      slug: 'reference-image-to-prompt'
    });
    expect(getAlias('/ai-image-prompt-generator').caseTarget).toEqual({
      type: 'package',
      slug: 'reference-image-to-prompt'
    });
  });

  it('keeps sitemap candidates canonical-only for prompt SEO aliases', () => {
    const canonicalPaths = new Set(
      PROMPT_SEO_ALIASES.map((alias) => alias.canonicalPath)
    );

    expect(canonicalPaths.has('/en-US/prompts')).toBe(true);
    expect(canonicalPaths.has('/ai-image-prompt-generator')).toBe(true);
    expect(canonicalPaths.has('/free-ai-image-prompts')).toBe(false);
    expect(canonicalPaths.has('/best-ai-image-prompts')).toBe(false);
    expect(canonicalPaths.has('/ai-image-prompt-examples')).toBe(false);
    expect(canonicalPaths.has('/ai-image-prompts-gallery')).toBe(false);
    expect(canonicalPaths.has('/free-ai-image-prompts-gallery')).toBe(false);
    expect(canonicalPaths.has('/image-to-prompt-generator')).toBe(false);
    expect(canonicalPaths.has('/reference-image-to-prompt-generator')).toBe(
      true
    );
    expect(canonicalPaths.has('/free-gpt-image-2-prompts')).toBe(false);
    expect(canonicalPaths.has('/gpt-image-2-prompts-gallery')).toBe(false);
    expect(canonicalPaths.has('/nano-banana-prompts-gallery')).toBe(false);
    expect(canonicalPaths.has('/nano-banana-2-prompts')).toBe(false);
    expect(canonicalPaths.has('/nano-banana-pro-prompts')).toBe(false);
    expect(canonicalPaths.has('/mona-lisa-prompts')).toBe(false);
    expect(canonicalPaths.has('/gpt-image-2-5-prompts')).toBe(true);
    expect(canonicalPaths.has('/luna-lisa-alpha-prompts')).toBe(true);
    expect(canonicalPaths.has('/astra-prompts')).toBe(true);
    expect(canonicalPaths.has('/gpt-6-astra-prompts')).toBe(false);
    expect(canonicalPaths.has('/poster-design-prompts')).toBe(false);
    expect(canonicalPaths.has('/gta-vi-cover-prompts')).toBe(true);
    expect(canonicalPaths.has('/gta-6-cover-girls-prompts')).toBe(true);
    expect(canonicalPaths.has('/brand-identity-prompts')).toBe(false);
    expect(canonicalPaths.has('/3d-figurine-prompts')).toBe(false);
    expect(canonicalPaths.has('/clay-aesthetic-prompts')).toBe(false);
    expect(canonicalPaths.has('/boudoir-prompts')).toBe(false);
    expect(canonicalPaths.has('/glamour-prompts')).toBe(false);
  });

  it('maps boudoir and glamour aliases to portrait canonical pages', () => {
    expect(getAlias('/boudoir-prompts').canonicalPath).toBe(
      '/portrait-prompts'
    );
    expect(getAlias('/glamour-prompts').canonicalPath).toBe(
      '/ai-photo-prompts'
    );
    expect(getAlias('/boudoir-prompts').caseTarget).toEqual({
      type: 'category',
      slug: 'ai-portrait'
    });
    expect(getAlias('/glamour-prompts').caseTarget).toEqual({
      type: 'category',
      slug: 'ai-portrait'
    });
  });

  it('matches opportunity-page metadata to explicit search intent', () => {
    expect(resolveSeoConfigForPath('/portrait-prompts')).toMatchObject({
      title: 'Portrait Prompt Examples for Realistic AI Photos | WebToMind',
      canonical: 'https://webtomind.com/portrait-prompts'
    });
    expect(resolveSeoConfigForPath('/ai-photo-prompts')).toMatchObject({
      title: 'AI Photo Prompt Examples for Realistic Images | WebToMind',
      canonical: 'https://webtomind.com/ai-photo-prompts'
    });
    expect(resolveSeoConfigForPath('/boudoir-prompts')).toMatchObject({
      title: 'Boudoir Prompts for Tasteful AI Portraits | WebToMind',
      canonical: 'https://webtomind.com/portrait-prompts'
    });
    expect(resolveSeoConfigForPath('/glamour-prompts')).toMatchObject({
      title: 'Glamour Prompts for AI Portrait Photography | WebToMind',
      canonical: 'https://webtomind.com/ai-photo-prompts'
    });
    expect(
      resolveSeoConfigForPath('/reference-image-to-prompt-generator')
    ).toMatchObject({
      title: 'Reference Image to Prompt Generator & Examples | WebToMind',
      canonical: 'https://webtomind.com/reference-image-to-prompt-generator'
    });
    expect(
      resolveSeoConfigForPath('/en-US/tools/comfyui-workflow-checker')
    ).toMatchObject({
      title: 'ComfyUI Workflow Checker & JSON Validator',
      canonical: 'https://webtomind.com/en-US/tools/comfyui-workflow-checker'
    });
  });
});

describe('prompt SEO SSR config', () => {
  it('canonicalizes image-to-prompt generator to the generator page', () => {
    const seo = resolveSeoConfigForPath('/image-to-prompt-generator');

    expect(seo.canonical).toBe(
      'https://webtomind.com/ai-image-prompt-generator'
    );
    expect(seo.alternates).toContainEqual({
      hreflang: 'en-US',
      href: 'https://webtomind.com/ai-image-prompt-generator'
    });
    expect(seo.alternates).toContainEqual({
      hreflang: 'x-default',
      href: 'https://webtomind.com/ai-image-prompt-generator'
    });
    expect(Array.isArray(seo.jsonLd)).toBe(true);
    expect(seo.jsonLd as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ '@type': 'CollectionPage' }),
        expect.objectContaining({ '@type': 'FAQPage' })
      ])
    );
  });

  it('canonicalizes free prompt aliases to the AI image prompts hub', () => {
    const seo = resolveSeoConfigForPath('/free-ai-image-prompts');

    expect(seo.canonical).toBe('https://webtomind.com/en-US/prompts');
    expect(seo.title).toBe('Free AI Image Prompts | WebToMind');
  });

  it('canonicalizes gallery and model aliases to existing strong pages', () => {
    expect(resolveSeoConfigForPath('/ai-image-prompts-gallery').canonical).toBe(
      'https://webtomind.com/en-US/prompts'
    );
    expect(
      resolveSeoConfigForPath('/free-ai-image-prompts-gallery').canonical
    ).toBe('https://webtomind.com/en-US/prompts');
    expect(resolveSeoConfigForPath('/free-gpt-image-2-prompts').canonical).toBe(
      'https://webtomind.com/gpt-image-2-prompts'
    );
    expect(
      resolveSeoConfigForPath('/gpt-image-2-prompts-gallery').canonical
    ).toBe('https://webtomind.com/gpt-image-2-prompts');
    expect(
      resolveSeoConfigForPath('/nano-banana-prompts-gallery').canonical
    ).toBe('https://webtomind.com/nano-banana-prompts');
    expect(resolveSeoConfigForPath('/nano-banana-2-prompts').canonical).toBe(
      'https://webtomind.com/nano-banana-prompts'
    );
    expect(resolveSeoConfigForPath('/nano-banana-pro-prompts').canonical).toBe(
      'https://webtomind.com/nano-banana-prompts'
    );
    expect(resolveSeoConfigForPath('/mona-lisa-1-prompts').canonical).toBe(
      'https://webtomind.com/mona-lisa-1-prompts'
    );
    expect(resolveSeoConfigForPath('/mona-lisa-prompts').canonical).toBe(
      'https://webtomind.com/mona-lisa-1-prompts'
    );
    expect(resolveSeoConfigForPath('/gpt-image-2-5-prompts').canonical).toBe(
      'https://webtomind.com/gpt-image-2-5-prompts'
    );
    expect(resolveSeoConfigForPath('/luna-lisa-alpha-prompts').canonical).toBe(
      'https://webtomind.com/luna-lisa-alpha-prompts'
    );
    expect(resolveSeoConfigForPath('/astra-prompts').canonical).toBe(
      'https://webtomind.com/astra-prompts'
    );
    expect(resolveSeoConfigForPath('/gpt-6-astra-prompts').canonical).toBe(
      'https://webtomind.com/astra-prompts'
    );
  });

  it('canonicalizes boudoir and glamour aliases to portrait pages', () => {
    expect(resolveSeoConfigForPath('/boudoir-prompts').canonical).toBe(
      'https://webtomind.com/portrait-prompts'
    );
    expect(resolveSeoConfigForPath('/glamour-prompts').canonical).toBe(
      'https://webtomind.com/ai-photo-prompts'
    );
    expect(
      resolveSeoConfigForPath('/boudoir-prompts').alternates
    ).toContainEqual({
      hreflang: 'en-US',
      href: 'https://webtomind.com/portrait-prompts'
    });
    expect(
      resolveSeoConfigForPath('/glamour-prompts').alternates
    ).toContainEqual({
      hreflang: 'x-default',
      href: 'https://webtomind.com/ai-photo-prompts'
    });
  });

  it('canonicalizes AI image style grid aliases to the style grid page', () => {
    const canonical = `https://webtomind.com${PROMPT_STYLE_GRID_CANONICAL_PATH}`;

    expect(
      resolveSeoConfigForPath(PROMPT_STYLE_GRID_CANONICAL_PATH).canonical
    ).toBe(canonical);
    PROMPT_STYLE_GRID_ALIAS_PATHS.forEach((path) => {
      expect(resolveSeoConfigForPath(path).canonical).toBe(canonical);
    });
    expect(
      resolveSeoConfigForPath('/ai-image-style-grid?template=portrait')
        .canonical
    ).toBe(canonical);
    expect(resolveSeoConfigForPath('/gpt-image-2-prompt-grid').canonical).toBe(
      canonical
    );
    expect(
      resolveSeoConfigForPath('/ai-sticker-prompt-generator').canonical
    ).toBe(canonical);
    PROMPT_STYLE_GRID_DETAIL_PATHS.forEach((path) => {
      expect(resolveSeoConfigForPath(path).canonical).toBe(
        `https://webtomind.com${path}`
      );
    });
  });

  it('renders dedicated SSR metadata for stable theme card editor pages', () => {
    const seo = resolveSeoConfigForPath('/ai-image-style-grid/product');
    const html = renderSeoPageHtml(
      '<html><head><title>old</title></head><body><div id="root"></div></body></html>',
      '/ai-image-style-grid/product'
    );

    expect(seo.title).toBe('Product Photography Theme Card | WebToMind');
    expect(seo.canonical).toBe(
      'https://webtomind.com/ai-image-style-grid/product'
    );
    expect(html).toContain('Product Photography Theme Card');
    expect(html).toContain('Product theme card');
    expect(html).toContain('BreadcrumbList');
  });

  it('renders WebApplication and FAQ metadata for the theme card plaza', () => {
    const seo = resolveSeoConfigForPath('/gpt-image-2-style-grid');
    const html = renderSeoPageHtml(
      '<html><head><title>old</title></head><body><div id="root"></div></body></html>',
      '/gpt-image-2-style-grid'
    );

    expect(seo.title).toBe('Theme Card Plaza | WebToMind');
    expect(seo.jsonLd as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ '@type': 'WebApplication' }),
        expect.objectContaining({ '@type': 'FAQPage' })
      ])
    );
    expect(html).toContain('id="prompt-style-grid-ssr"');
    expect(html).toContain('Theme Card Plaza');
  });

  it('strengthens the GPT Image 2 canonical page for free prompt examples', () => {
    const seo = resolveSeoConfigForPath('/gpt-image-2-prompts');
    const html = renderSeoPageHtml(
      '<html><head><title>old</title></head><body><div id="root"></div></body></html>',
      '/gpt-image-2-prompts'
    );

    expect(seo.canonical).toBe('https://webtomind.com/gpt-image-2-prompts');
    expect(seo.title).toContain('GPT Image 2 Prompt Examples');
    expect(seo.description).toContain('free GPT Image 2 prompts');
    expect(html).toContain('Free GPT Image 2 prompt examples');
    expect(html).toContain('GPT Image 2 prompt structure');
    expect(html).toContain('Map GPT Image 2 prompts into portrait');
    expect(html).toContain('Where can I find free GPT Image 2 prompts?');
    expect(html).toContain(
      'When should I use portrait prompts with GPT Image 2 prompts?'
    );
    expect(html).toContain(
      'Can SREF prompts be used directly inside GPT Image 2 prompts?'
    );
    expect(html).toContain('Related prompt case links');
    expect(html).toContain('GPT Image 2 Ecommerce Hero Image Prompt');
    expect(html).toContain(
      '/en-US/prompts/gpt-image-2-ecommerce-hero-image-prompt'
    );
    expect(html).toContain(
      'Free GPT Image 2 prompt example for ecommerce hero images'
    );
    expect(html).not.toContain(
      'Use GPT Image 2 to create an ecommerce hero image for premium wireless headphones'
    );
    expect(html).not.toContain('LartAI');
  });

  it('renders model SEO SSR with localized real prompt case links', () => {
    const html = renderSeoPageHtml(
      '<html><head><title>old</title></head><body><div id="root"></div></body></html>',
      '/zh-CN/prompts/model/seedream'
    );

    expect(html).toContain('相关真实 Prompt 案例');
    expect(html).toContain('Seedream 写实人像 Prompt 案例');
    expect(html).toContain(
      '/zh-CN/prompts/zh-seedream-editorial-portrait-prompt'
    );
    expect(html).toContain(
      'Seedream portrait prompt with adult subject, soft directional key light'
    );
    expect(html).not.toContain('生成一张 4:5 竖版写实商业人像');
  });

  it('renders generic game cover art prompt case links without third-party brand terms', () => {
    const html = renderSeoPageHtml(
      '<html><head><title>old</title></head><body><div id="root"></div></body></html>',
      '/poster-design-prompts'
    );

    expect(html).toContain('Related prompt case links');
    expect(html).toContain('Open World Crime Game Cover Art Prompt');
    expect(html).toContain('Female Protagonist Game Cover Art Prompt');
    expect(html).toContain('Neon Open World Game Key Art Prompt');
    expect(html).toContain(
      '/en-US/prompts/open-world-crime-game-cover-art-prompt'
    );
    expect(html).toContain(
      '/en-US/prompts/female-protagonist-game-cover-art-prompt'
    );
    expect(html).toContain(
      '/en-US/prompts/neon-open-world-game-key-art-prompt'
    );
    expect(html).toContain('Original game cover art prompt');
    expect(html).toContain('Original female protagonist game cover prompt');
    expect(html).toContain('Original neon open-world game key art prompt');
    expect(html).not.toMatch(/rockstar|gta/i);
    expect(html).not.toContain(
      'Create a 4:5 vertical original open-world crime game cover visual'
    );
    expect(html).not.toContain(
      'Create a 4:5 vertical original female protagonist game cover visual'
    );
    expect(html).not.toContain(
      'Create a 4:5 vertical original neon open-world game key art image'
    );
  });

  it('renders a direct GTA VI Cover landing page with game cover prompt cases', () => {
    const html = renderSeoPageHtml(
      '<html><head><title>old</title></head><body><div id="root"></div></body></html>',
      '/gta-vi-cover-prompts'
    );
    const seo = resolveSeoConfigForPath('/gta-vi-cover-prompts');

    expect(seo.canonical).toBe('https://webtomind.com/gta-vi-cover-prompts');
    expect(seo.title).toBe('GTA VI Cover AI Prompt Examples | WebToMind');
    expect(html).toContain('<h1>GTA VI Cover AI Prompt Examples</h1>');
    expect(html).toContain('GTA VI Cover');
    expect(html).toContain('GTA 6 cover art');
    expect(html).toContain('Related prompt case links');
    expect(html).toContain('Open World Crime Game Cover Art Prompt');
    expect(html).toContain('Female Protagonist Game Cover Art Prompt');
    expect(html).toContain('Neon Open World Game Key Art Prompt');
    expect(html).toContain(
      '/en-US/prompts/open-world-crime-game-cover-art-prompt'
    );
  });

  it("renders a direct GTA 6's Cover Girls landing page with focused prompt cases", () => {
    const html = renderSeoPageHtml(
      '<html><head><title>old</title></head><body><div id="root"></div></body></html>',
      '/gta-6-cover-girls-prompts'
    );
    const seo = resolveSeoConfigForPath('/gta-6-cover-girls-prompts');

    expect(seo.canonical).toBe(
      'https://webtomind.com/gta-6-cover-girls-prompts'
    );
    expect(seo.title).toBe(
      "GTA 6's Cover Girls AI Prompt Examples | WebToMind"
    );
    expect(html).toContain(
      '<h1>GTA 6&#39;s Cover Girls AI Prompt Examples</h1>'
    );
    expect(html).toContain('GTA 6&#39;s cover girls');
    expect(html).toContain('GTA 6 cover girl');
    expect(html).toContain('Related prompt case links');
    expect(html).toContain('GTA 6&#39;s Cover Girls Sunset Protagonist Prompt');
    expect(html).toContain('GTA 6&#39;s Cover Girls Neon Duo Prompt');
    expect(html).toContain('GTA 6&#39;s Cover Girls Ensemble Prompt');
    expect(html).toContain(
      '/en-US/prompts/gta-6-cover-girls-sunset-protagonist-prompt'
    );
  });

  it('canonicalizes commercial long-tail aliases to existing hubs', () => {
    expect(resolveSeoConfigForPath('/poster-design-prompts').canonical).toBe(
      'https://webtomind.com/marketing-creative-prompts'
    );
    expect(resolveSeoConfigForPath('/brand-identity-prompts').canonical).toBe(
      'https://webtomind.com/marketing-creative-prompts'
    );
    expect(resolveSeoConfigForPath('/3d-figurine-prompts').canonical).toBe(
      'https://webtomind.com/character-design-prompts'
    );
    expect(resolveSeoConfigForPath('/clay-aesthetic-prompts').canonical).toBe(
      'https://webtomind.com/en-US/prompts'
    );
  });

  it('renders localized package prompt pages with self canonical URLs', () => {
    const zhSeo = resolveSeoConfigForPath(
      '/zh-CN/prompts/package/xiaohongshu-cover'
    );
    const enSeo = resolveSeoConfigForPath(
      '/en-US/prompts/package/xiaohongshu-cover'
    );

    expect(zhSeo.canonical).toBe(
      'https://webtomind.com/zh-CN/prompts/package/xiaohongshu-cover'
    );
    expect(enSeo.canonical).toBe(
      'https://webtomind.com/en-US/prompts/package/xiaohongshu-cover'
    );
    expect(zhSeo.canonical).not.toBe('https://webtomind.com/');
    expect(enSeo.canonical).not.toBe('https://webtomind.com/');
  });

  it('marks private and share routes as noindex in SSR output', () => {
    expect(resolveSeoConfigForPath('/boards').robots).toBe('noindex,nofollow');
    expect(resolveSeoConfigForPath('/boards/example').robots).toBe(
      'noindex,nofollow'
    );
    expect(resolveSeoConfigForPath('/login').robots).toBe('noindex,nofollow');
    expect(resolveSeoConfigForPath('/auth/callback').robots).toBe(
      'noindex,nofollow'
    );
    expect(resolveSeoConfigForPath('/s/example-token').robots).toBe(
      'noindex,nofollow'
    );
  });

  it('renders SSR HowTo metadata for the image-to-prompt tutorial', () => {
    const seo = resolveSeoConfigForPath(
      '/en-US/blog/image-to-prompt-generator-workflow'
    );

    expect(seo.canonical).toBe(
      'https://webtomind.com/en-US/blog/image-to-prompt-generator-workflow'
    );
    expect(seo.title).toContain('Image to Prompt Generator');
    expect(seo.jsonLd as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          '@type': 'HowTo',
          name: expect.stringContaining('Image to Prompt Generator')
        })
      ])
    );
  });

  it('renders SSR HowTo metadata for the spacexai long-tail landing page', () => {
    const seo = resolveSeoConfigForPath(
      '/en-US/blog/spacexai-ai-workflow-guide'
    );
    const html = renderSeoPageHtml(
      '<html><head><title>old</title></head><body><div id="root"></div></body></html>',
      '/en-US/blog/spacexai-ai-workflow-guide'
    );

    expect(seo.canonical).toBe(
      'https://webtomind.com/en-US/blog/spacexai-ai-workflow-guide'
    );
    expect(seo.title).toContain('spacexai');
    expect(seo.description).toContain('SpaceXAI');
    expect(seo.jsonLd as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          '@type': 'HowTo',
          name: expect.stringContaining('spacexai')
        })
      ])
    );
    expect(html).toContain('<h1>What is spacexai?');
    expect(html).toContain('not affiliated with SpaceXAI');
    expect(html).toContain('Related prompts and creation links');
  });

  it('does not fallback missing SEO detail pages to the homepage canonical', () => {
    const baseHtml =
      '<html><head><title>old</title><meta name="description" content="old" /><meta name="robots" content="index,follow" /><link rel="canonical" href="https://webtomind.com/" /><meta property="og:type" content="website" /><meta property="og:title" content="old" /><meta property="og:description" content="old" /><meta property="og:url" content="https://webtomind.com/" /><meta property="og:image" content="https://webtomind.com/icons/logo-icon.svg" /><meta name="twitter:title" content="old" /><meta name="twitter:description" content="old" /><meta name="twitter:image" content="https://webtomind.com/icons/logo-icon.svg" /></head><body><div id="root"></div></body></html>';

    for (const path of [
      '/zh-CN/blog/missing-post',
      '/en-US/blog/missing-use-case',
      '/zh-CN/prompts/model/missing-model'
    ]) {
      expect(resolveSeoConfigForPathOrNull(path)).toBeNull();
      const rendered = renderSeoPageHtmlWithStatus(baseHtml, path);
      expect(rendered.status).toBe(404);
      expect(rendered.html).toContain(
        '<meta name="robots" content="noindex,follow" />'
      );
      expect(rendered.html).toContain(
        '<title>Page not found | WebToMind</title>'
      );
    }
  });
});

describe('prompt SEO SSR body rendering', () => {
  const baseHtml = `
    <html lang="zh-CN">
      <head>
        <title>WebToMind</title>
        <meta name="description" content="old" />
        <meta name="robots" content="index,follow" />
        <link rel="canonical" href="https://webtomind.com/" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="old" />
        <meta property="og:description" content="old" />
        <meta property="og:url" content="https://webtomind.com/" />
        <meta property="og:image" content="https://webtomind.com/icons/logo-icon.svg" />
        <meta name="twitter:title" content="old" />
        <meta name="twitter:description" content="old" />
        <meta name="twitter:image" content="https://webtomind.com/icons/logo-icon.svg" />
      </head>
      <body><div id="root"></div></body>
    </html>
  `;

  function getVisibleBodyText(html: string): string {
    const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || '';
    return body
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  it.each([
    ['/zh-CN/prompts', 'AI 图片 Prompt 案例库'],
    ['/en-US/prompts', 'Free AI Image Prompts Library'],
    ['/zh-CN/prompts/model/gpt-image-2', 'GPT Image 2 提示词案例与生成器'],
    ['/zh-CN/prompts/category/product-images', 'AI 商品图 Prompt 生成工作流'],
    [
      '/en-US/prompts/category/comfyui-prompts',
      'ComfyUI Prompt Examples &amp; Workflow Checker'
    ]
  ])('renders crawlable prompt body content for %s', (path, h1) => {
    const html = renderSeoPageHtml(baseHtml, path);
    const bodyText = getVisibleBodyText(html);

    expect(html).toContain('<main id="prompt-seo-ssr"');
    expect(html).toContain('data-webtomind-ssr="prompt-handoff"');
    expect(html).toContain('class="prompt-seo-handoff-grid"');
    expect(html).toContain(`<h1>${h1}</h1>`);
    expect(html).toContain('<a href=');
    expect(html).toMatch(/精选 Prompt 案例摘要|Featured prompt case summaries/);
    expect(html).toMatch(
      /Prompt 常见问题|Prompt FAQ|Prompt 工作流|prompt workflow/i
    );
    expect(bodyText.length).toBeGreaterThan(800);
  });

  it('connects the ComfyUI prompt opportunity page to its workflow checker', () => {
    const html = renderSeoPageHtml(
      baseHtml,
      '/en-US/prompts/category/comfyui-prompts'
    );

    expect(html).toContain(
      '<title>ComfyUI Prompt Examples &amp; Workflow Checker | WebToMind</title>'
    );
    expect(html).toContain('href="/en-US/tools/comfyui-workflow-checker"');
    expect(html).toContain('Open the ComfyUI Workflow Checker');
  });
});

describe('non-prompt SEO SSR body rendering', () => {
  const baseHtml = `
    <html lang="zh-CN">
      <head>
        <title>WebToMind</title>
        <meta name="description" content="old" />
        <meta name="robots" content="index,follow" />
        <link rel="canonical" href="https://webtomind.com/" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="old" />
        <meta property="og:description" content="old" />
        <meta property="og:url" content="https://webtomind.com/" />
        <meta property="og:image" content="https://webtomind.com/icons/logo-icon.svg" />
        <meta name="twitter:title" content="old" />
        <meta name="twitter:description" content="old" />
        <meta name="twitter:image" content="https://webtomind.com/icons/logo-icon.svg" />
      </head>
      <body><div id="root"></div></body>
    </html>
  `;

  function getVisibleBodyText(html: string): string {
    const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || '';
    return body
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  it.each([
    ['/zh-CN/blog', 'WebToMind 博客', 'AI专属卡是什么', 'Blog'],
    ['/en-US/use-cases', 'WebToMind Blog', 'Image to Prompt Generator', 'Blog'],
    [
      '/zh-CN/blog/ai-zhuanshu-card',
      'AI专属卡是什么？从 AI 支付到 AI 工具消费预算',
      '主体要点',
      'BlogPosting'
    ],
    [
      '/en-US/blog/image-to-prompt-generator-workflow',
      'Image to Prompt Generator: reusable prompts from reference images',
      'Workflow steps',
      'HowTo'
    ],
    ['/zh-CN/pricing', 'WebToMind 价格与积分套餐', '积分用途', 'Organization'],
    [
      '/zh-CN/tools/comfyui-workflow-checker',
      'ComfyUI Workflow 检查器',
      '检查内容',
      'FAQPage'
    ],
    [
      '/zh-CN/tools/pindou-pattern-maker',
      '免费在线拼豆图案生成器',
      '生成器能做什么',
      'FAQPage'
    ]
  ])(
    'renders crawlable non-prompt body content for %s',
    (path, h1, expectedBody, expectedJsonLdType) => {
      const html = renderSeoPageHtml(baseHtml, path);
      const seo = resolveSeoConfigForPath(path);
      const bodyText = getVisibleBodyText(html);

      expect(html).toContain('<main id="marketing-seo-ssr"');
      expect(html).toContain(`<h1>${h1}</h1>`);
      expect(html).toContain(expectedBody);
      expect(html).toContain('<a href=');
      expect(html).toContain(seo.canonical);
      expect(html).toContain(`"@type":"${expectedJsonLdType}"`);
      expect(bodyText.length).toBeGreaterThan(700);
    }
  );

  it('keeps pricing metadata while adding plans, FAQ and entry links', () => {
    const html = renderSeoPageHtml(baseHtml, '/en-US/pricing');

    expect(html).toContain('<title>WebToMind Pricing</title>');
    expect(html).toContain(
      '<link rel="canonical" href="https://webtomind.com/en-US/pricing" />'
    );
    expect(html).toContain('<h2>Plans</h2>');
    expect(html).toContain('<h2>What credits cover</h2>');
    expect(html).toContain('<h2>Pricing FAQ</h2>');
    expect(html).toContain('href="/en-US/create"');
    expect(html).toContain('href="/en-US/recharge"');
  });

  it('adds long-tail metadata for the pindou pattern maker', () => {
    const html = renderSeoPageHtml(
      baseHtml,
      '/zh-CN/tools/pindou-pattern-maker'
    );

    expect(html).toContain(
      '<title>免费拼豆生成器 - 在线拼豆图案图纸生成</title>'
    );
    expect(html).toContain('拼豆图案大全与灵感');
    expect(html).toContain(
      '<link rel="canonical" href="https://webtomind.com/zh-CN/tools/pindou-pattern-maker" />'
    );
    expect(html).toContain('Perler、Hama、Artkal、MARD');
    expect(html).toContain('href="/zh-CN/create"');
    expect(html).toContain('"@type":"SoftwareApplication"');
    expect(html).toContain('"price":"0"');
  });

  it('replaces template JSON-LD when rendering the pindou SEO page', () => {
    const htmlWithTemplateJsonLd = baseHtml.replace(
      '</head>',
      '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Template"}</script></head>'
    );
    const html = renderSeoPageHtml(
      htmlWithTemplateJsonLd,
      '/zh-CN/tools/pindou-pattern-maker'
    );
    const jsonLdScripts = [
      ...html.matchAll(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g
      )
    ].map((match) => JSON.parse(match[1]));

    expect(jsonLdScripts).toHaveLength(6);
    expect(
      jsonLdScripts.filter((item) => item['@type'] === 'Organization')
    ).toHaveLength(1);
    expect(
      jsonLdScripts.some((item) => item['@type'] === 'SoftwareApplication')
    ).toBe(true);
    expect(jsonLdScripts.some((item) => item['@type'] === 'FAQPage')).toBe(
      true
    );
    expect(jsonLdScripts.some((item) => item['@type'] === 'HowTo')).toBe(true);
    expect(
      jsonLdScripts.some((item) => item['@type'] === 'BreadcrumbList')
    ).toBe(true);
    expect(html).not.toContain('"name":"Template"');
  });

  it('covers image-prompt long-tail queries in the prompts index SSR', () => {
    const html = renderSeoPageHtml(baseHtml, '/zh-CN/prompts');

    expect(html).toContain('图片prompt');
    expect(html).toContain('图片 prompt 怎么写？');
    expect(html).toContain(
      '先定主体和输出用途，再写场景、镜头、光影、材质、风格、版式和约束'
    );
  });

  it('adds credits FAQ and pricing CTA to the AI dedicated card blog', () => {
    const html = renderSeoPageHtml(baseHtml, '/zh-CN/blog/ai-zhuanshu-card');

    expect(html).toContain('下一步');
    expect(html).toContain('查看积分与会员方案');
    expect(html).toContain('href="/zh-CN/pricing"');
    expect(html).toContain('AI 专属卡和 WebToMind 积分有什么区别');
    expect(html).toContain('创作预算怎么管');
  });

  it('renders the 291-color chart table in the MARD blog post', () => {
    const html = renderSeoPageHtml(
      baseHtml,
      '/zh-CN/blog/mard-bead-color-chart'
    );
    expect(html).toContain('色号对照表（291 色）');
    expect(html).toContain('>MARD</th>');
    expect(html).toContain('>COCO</th>');
    expect(html).toContain('>漫漫</th>');
    expect(html).toContain('A01');
    const rowCount = (html.match(/<tr>/g) || []).length;
    expect(rowCount).toBeGreaterThan(290);
  });

  it('covers English image-prompt long-tail queries in the prompts index SSR', () => {
    const html = renderSeoPageHtml(baseHtml, '/en-US/prompts');

    expect(html).toContain('image prompt');
    expect(html).toContain('AI image prompt examples');
    expect(html).toContain('How do I write a good image prompt?');
    expect(html).toContain('href="/en-US/blog/ai-image-prompt-examples-guide"');
  });

  it('strengthens the AI image prompt examples guide with variant FAQ', () => {
    const html = renderSeoPageHtml(
      baseHtml,
      '/en-US/blog/ai-image-prompt-examples-guide'
    );

    expect(html).toContain('AI Image Prompt Examples Guide');
    expect(html).toContain('What makes a good AI image prompt example?');
    expect(html).toContain('picture prompt examples');
    expect(html).toContain('Where can I copy free picture prompt examples?');
  });
});
