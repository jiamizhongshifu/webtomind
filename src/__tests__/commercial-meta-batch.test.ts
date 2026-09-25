import { describe, expect, it } from 'vitest';
import { resolveSeoConfigForPath } from '../../api/seo-page';
import { renderCreateAppPageHtml } from '../../api/create-app-page-render';
import { injectPromptSeo } from '../../api/prompt-page-render';

const SHELL =
  '<!doctype html><html lang="zh-CN"><head><title>WebToMind</title><meta name="description" content="old" /></head><body><div id="root"></div></body></html>';

function zhLength(value: string): number {
  return [...value].length;
}

describe('commercial vertical meta batch (2026-08-09)', () => {
  const cases: Array<{ label: string; description: string }> = [
    {
      label: 'pindou tool',
      description:
        renderCreateAppPageHtml({
          html: SHELL,
          slug: 'pindou-pattern-maker',
          locale: 'zh-CN'
        }).html.match(/<meta name="description" content="([^"]*)"/)?.[1] || ''
    },
    {
      label: 'product-images category',
      description: resolveSeoConfigForPath(
        '/zh-CN/prompts/category/product-images'
      ).description
    },
    {
      label: 'wechat-cover-poster package',
      description: resolveSeoConfigForPath(
        '/zh-CN/prompts/package/wechat-cover-poster'
      ).description
    },
    {
      label: 'reproducible-portrait-shoot use case',
      description: resolveSeoConfigForPath(
        '/zh-CN/blog/reproducible-portrait-shoot'
      ).description
    }
  ];

  it.each(cases)('keeps $label description at 50-80 zh characters', (item) => {
    const length = zhLength(item.description);
    expect(length).toBeGreaterThanOrEqual(50);
    expect(length).toBeLessThanOrEqual(80);
  });

  it('keeps the commercial case intent free of placeholder copy', () => {
    // The database update is applied separately; this guards the copy style
    // used in the SEO landing pages that mirror it.
    expect(
      resolveSeoConfigForPath('/zh-CN/prompts/category/product-images')
        .description
    ).not.toMatch(/待人工|X\/Twitter 图片生成案例导入/);
  });
});

describe('en-US meta batch (2026-08-09)', () => {
  const enCases: Array<{ label: string; description: string }> = [
    {
      label: 'style grid',
      description: resolveSeoConfigForPath('/ai-image-style-grid').description
    },
    {
      label: 'use-cases list',
      description: resolveSeoConfigForPath('/en-US/use-cases').description
    },
    {
      label: 'image-splitter',
      description:
        renderCreateAppPageHtml({
          html: SHELL,
          slug: 'image-splitter',
          locale: 'en-US'
        }).html.match(/<meta name="description" content="([^"]*)"/)?.[1] || ''
    },
    {
      label: 'gpt-image-2-denoiser',
      description:
        renderCreateAppPageHtml({
          html: SHELL,
          slug: 'gpt-image-2-denoiser',
          locale: 'en-US'
        }).html.match(/<meta name="description" content="([^"]*)"/)?.[1] || ''
    },
    {
      label: 'image-compressor',
      description:
        renderCreateAppPageHtml({
          html: SHELL,
          slug: 'image-compressor',
          locale: 'en-US'
        }).html.match(/<meta name="description" content="([^"]*)"/)?.[1] || ''
    },
    {
      label: 'gpt-image-2-prompts alias',
      description: resolveSeoConfigForPath('/gpt-image-2-prompts').description
    },
    {
      label: 'image-to-prompt use case',
      description: resolveSeoConfigForPath(
        '/en-US/blog/image-to-prompt-generator-workflow'
      ).description
    },
    {
      label: 'spacexai use case',
      description: resolveSeoConfigForPath(
        '/en-US/blog/spacexai-ai-workflow-guide'
      ).description
    },
    {
      label: 'credit budget use case',
      description: resolveSeoConfigForPath('/en-US/blog/ai-tool-credit-budget')
        .description
    },
    {
      label: 'ai dedicated card blog',
      description: resolveSeoConfigForPath('/en-US/blog/ai-zhuanshu-card')
        .description
    }
  ];

  it.each(enCases)('keeps $label description at 120-155 characters', (item) => {
    expect(item.description.length).toBeGreaterThanOrEqual(120);
    expect(item.description.length).toBeLessThanOrEqual(155);
  });

  it('drops the brand suffix for long titles', () => {
    const longUseCase = resolveSeoConfigForPath(
      '/en-US/blog/image-to-prompt-generator-workflow'
    );
    expect(longUseCase.title).not.toContain(' | WebToMind');

    const longBlog = resolveSeoConfigForPath('/en-US/blog/ai-zhuanshu-card');
    expect(longBlog.title).not.toContain(' | WebToMind Blog');

    const longPromptHtml = injectPromptSeo(
      SHELL,
      {
        id: 'long-title-case',
        title:
          'Ultra-realistic Macro Photograph of a Logo Created from a Single Subject',
        prompt: 'macro product photography prompt',
        slug: 'long-title-case',
        locale: 'zh-CN' as const,
        sourceCaseId: null,
        category: 'ecommerce',
        model: 'gpt-image-2',
        packageSlug: null,
        commercialIntent: 'product macro prompt',
        promptPreview: 'macro product photo',
        memberOnly: false,
        tags: ['ecommerce'],
        imageUrls: ['https://cdn.example.com/case.webp'],
        mediaType: 'image' as const,
        videoUrls: [],
        posterUrl: 'https://cdn.example.com/case.webp',
        durationSeconds: null,
        uploadDate: null,
        seoIndexable: true,
        generationVerified: true
      },
      'zh-CN',
      'long-title-case',
      'slug'
    );
    expect(longPromptHtml).not.toContain(' | WebToMind Prompts');
  });
});
