import { describe, expect, it } from 'vitest';
import {
  buildCreateAppSeoConfig,
  injectCreateAppSeo,
  renderCreateAppPageHtml
} from '../../api/create-app-page';
import {
  DISABLED_CREATE_APP_SLUGS,
  createAppContentItems,
  getCreateAppContent,
  getLocalizedCreateAppContentItems
} from '../shared/create-apps';

describe('image tool directory', () => {
  it('contains the approved independent tools', () => {
    expect(createAppContentItems.map((item) => item.slug)).toEqual([
      'image-editor',
      'pindou-pattern-maker',
      'image-upscaler',
      'image-splitter',
      'background-remover',
      'watermark-remover',
      'gpt-image-2-denoiser',
      'image-compressor'
    ]);
    createAppContentItems.forEach((item) => {
      expect(item.href).toBe(`/tools/${item.slug}`);
      expect(item.coverImage).toMatch(
        new RegExp(`^/create-apps/tool-${item.slug}\\.(?:webp|svg)$`)
      );
      expect(item.inputFormats).toEqual(['JPEG', 'PNG', 'WebP']);
      expect(item.seoKeywords.length).toBeGreaterThanOrEqual(3);
      expect(item.useCases.length).toBeGreaterThanOrEqual(3);
      expect(item.steps.length).toBeGreaterThanOrEqual(3);
      expect(item.capabilityNote).toBeTruthy();
    });
  });

  it('keeps the AI watermark tool paused and out of public discovery', () => {
    expect(DISABLED_CREATE_APP_SLUGS.has('ai-mark-remover')).toBe(true);
    expect(getCreateAppContent('ai-mark-remover')).toBeUndefined();
    expect(
      getLocalizedCreateAppContentItems('zh-CN').some(
        (item) => item.slug === 'ai-mark-remover'
      )
    ).toBe(false);
  });

  it('keeps local privacy explicit and reserves hybrid processing for cloud-backed tools', () => {
    expect(
      createAppContentItems
        .filter((item) => item.processing === 'hybrid')
        .map((item) => item.slug)
    ).toEqual(['image-editor', 'gpt-image-2-denoiser']);
    expect(getCreateAppContent('image-splitter')?.capabilityNote).toContain(
      '纯浏览器'
    );
  });

  it('provides English copy without Han characters', () => {
    const englishApps = getLocalizedCreateAppContentItems('en-US');
    const hanPattern = /[\u3400-\u9fff]/u;
    englishApps.forEach((item) => {
      expect(
        [
          item.title,
          item.description,
          item.seoTitle || '',
          item.seoDescription || '',
          ...item.useCases,
          ...item.steps,
          item.capabilityNote,
          ...(item.faq || []).flatMap((entry) => [entry.question, entry.answer])
        ].join(' ')
      ).not.toMatch(hanPattern);
    });
  });
});

describe('image tool SEO injection', () => {
  const baseHtml = `<html><head><title>WebToMind</title>
    <meta name="description" content="old" />
    <link rel="canonical" href="https://webtomind.com/" />
    </head><body><div id="root"></div></body></html>`;

  it('injects canonical SoftwareApplication metadata for a tool', () => {
    const seo = buildCreateAppSeoConfig({
      slug: 'image-upscaler',
      locale: 'zh-CN'
    });
    const html = injectCreateAppSeo(baseHtml, seo);
    expect(seo.canonical).toBe(
      'https://webtomind.com/zh-CN/tools/image-upscaler'
    );
    expect(html).toContain('AI 图像放大器');
    expect(html).toContain('SoftwareApplication');
    expect(html).toContain('hreflang="en-US"');
  });

  it('renders the public directory with direct tool links', () => {
    const seo = buildCreateAppSeoConfig({ slug: '', locale: 'en-US' });
    const html = injectCreateAppSeo(baseHtml, seo);
    expect(html).toContain('Free Online Image Tools');
    expect(html).toContain('/en-US/tools/image-splitter');
    expect(html).not.toContain('/create/apps/image-splitter');
  });

  it('uses dual-intent SEO title and description for the pindou tool', () => {
    const zh = buildCreateAppSeoConfig({
      slug: 'pindou-pattern-maker',
      locale: 'zh-CN'
    });
    const en = buildCreateAppSeoConfig({
      slug: 'pindou-pattern-maker',
      locale: 'en-US'
    });

    expect(zh.title).toBe(
      '免费拼豆生成器 - 在线拼豆图案图纸生成 | WebToMind 图片工具'
    );
    expect(zh.description).toContain('拼豆生成器');
    expect(en.title).toBe(
      'Free Bead Pattern Ideas & Perler Bead Pattern Maker | WebToMind Tool'
    );
    expect(en.description).toContain('bead pattern ideas');
    expect(injectCreateAppSeo(baseHtml, zh)).toContain(
      '免费拼豆生成器 - 在线拼豆图案图纸生成'
    );
  });

  it('injects the bead pattern ideas SSR body into the pindou tool page', () => {
    const rendered = renderCreateAppPageHtml({
      html: baseHtml,
      slug: 'pindou-pattern-maker',
      locale: 'zh-CN'
    });

    expect(rendered.status).toBe(200);
    expect(rendered.html).toContain('拼豆图案大全与灵感');
    expect(rendered.html).toContain('bead-pattern-pet-portrait');
    expect(rendered.html).toMatch(
      /<div id="root">[\s\S]*拼豆图案大全与灵感[\s\S]*<\/div>/
    );
  });

  it('gives indexable tool covers descriptive alt text', () => {
    const rendered = renderCreateAppPageHtml({
      html: baseHtml,
      slug: 'image-upscaler',
      locale: 'zh-CN'
    });

    expect(rendered.html).toMatch(/<img[^>]+alt="AI 图像放大器 工具封面"/);
  });
});
