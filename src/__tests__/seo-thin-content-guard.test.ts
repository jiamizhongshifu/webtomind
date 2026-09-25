import { describe, expect, it } from 'vitest';
import {
  renderSeoPageHtmlWithStatus,
  resolveSeoConfigForPath
} from '../../api/seo-page-render';
import { renderCreateAppPageHtml } from '../../api/create-app-page-render';

const SHELL =
  '<!doctype html><html lang="zh-CN"><head><title>WebToMind</title></head><body><div id="root"></div></body></html>';

function serverTextLength(html: string): number {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
}

describe('SEO thin-content guard', () => {
  it('keeps flagged blog detail pages above the indexing threshold', () => {
    const slugs = [
      'xiaohongshu-ai-cover-image-guide',
      'ai-product-image-generation-workflow',
      'regenerate-ai-images-from-history-guide',
      'project-instructions-power-user-guide',
      'why-ai-image-generation-needs-slots'
    ];
    for (const slug of slugs) {
      const rendered = renderSeoPageHtmlWithStatus(
        SHELL,
        `/zh-CN/blog/${slug}`
      );
      expect(rendered.status).toBe(200);
      expect(serverTextLength(rendered.html)).toBeGreaterThanOrEqual(1300);
    }
  });

  it('keeps flagged use-case pages above the indexing threshold', () => {
    const slugs = [
      'ai-product-image-generation',
      'consistent-ai-character-images',
      'cover-image-pipeline',
      'history-reedit-loop',
      'personal-asset-library',
      'reproducible-portrait-shoot',
      'reverse-engineer-references',
      'ai-tool-credit-budget',
      'deepseek-harness-agent-workflow-guide',
      'nsfw-prompts-guide'
    ];
    for (const slug of slugs) {
      const rendered = renderSeoPageHtmlWithStatus(
        SHELL,
        `/zh-CN/blog/${slug}`
      );
      expect(rendered.status).toBe(200);
      expect(serverTextLength(rendered.html)).toBeGreaterThanOrEqual(1150);
    }
  });

  it('renders the honest NSFW guide page with boundary FAQ and related prompt links', () => {
    const zh = renderSeoPageHtmlWithStatus(
      SHELL,
      '/zh-CN/blog/nsfw-prompts-guide'
    );
    expect(zh.status).toBe(200);
    expect(zh.html).toContain('NSFW Prompts 是什么意思？');
    expect(zh.html).toContain('WebToMind 能生成 NSFW 内容吗？');
    expect(zh.html).toContain('不能。WebToMind 只生成合法 SFW 内容');
    expect(zh.html).toContain('href="/zh-CN/boudoir-prompts"');
    expect(zh.html).toContain('href="/zh-CN/glamour-prompts"');
    expect(serverTextLength(zh.html)).toBeGreaterThanOrEqual(1150);

    const seo = resolveSeoConfigForPath('/en-US/blog/nsfw-prompts-guide');
    expect(seo.canonical).toBe(
      'https://webtomind.com/en-US/blog/nsfw-prompts-guide'
    );
  });

  it('keeps the mona-lisa-1 model page above the indexing threshold', () => {
    const rendered = renderSeoPageHtmlWithStatus(SHELL, '/mona-lisa-1-prompts');
    expect(rendered.status).toBe(200);
    expect(rendered.html).toContain(
      'https://webtomind.com/mona-lisa-1-prompts'
    );
    expect(rendered.html).toContain('mona-lisa-1 prompts');
    expect(serverTextLength(rendered.html)).toBeGreaterThanOrEqual(1300);
  });

  it('keeps the luna-lisa-alpha model page above the indexing threshold', () => {
    const rendered = renderSeoPageHtmlWithStatus(
      SHELL,
      '/luna-lisa-alpha-prompts'
    );
    expect(rendered.status).toBe(200);
    expect(rendered.html).toContain(
      'https://webtomind.com/luna-lisa-alpha-prompts'
    );
    expect(rendered.html).toContain('luna-lisa-alpha');
    expect(serverTextLength(rendered.html)).toBeGreaterThanOrEqual(1300);
  });

  it('keeps the gpt-image-2-5 model page above the indexing threshold', () => {
    const rendered = renderSeoPageHtmlWithStatus(
      SHELL,
      '/gpt-image-2-5-prompts'
    );
    expect(rendered.status).toBe(200);
    expect(rendered.html).toContain(
      'https://webtomind.com/gpt-image-2-5-prompts'
    );
    expect(rendered.html).toContain('GPT Image 2.5');
    expect(rendered.html).toContain('gpt-image-2.5');
    expect(serverTextLength(rendered.html)).toBeGreaterThanOrEqual(1300);
  });

  it('keeps the gpt-6-astra model page above the indexing threshold', () => {
    const rendered = renderSeoPageHtmlWithStatus(SHELL, '/astra-prompts');
    expect(rendered.status).toBe(200);
    expect(rendered.html).toContain('https://webtomind.com/astra-prompts');
    expect(rendered.html).toContain('GPT-6 Astra');
    expect(rendered.html).toContain('A6TRA');
    expect(serverTextLength(rendered.html)).toBeGreaterThanOrEqual(1300);
  });

  it('renders the unified blog hub and canonicalizes the blog alias', () => {
    const zh = renderSeoPageHtmlWithStatus(SHELL, '/zh-CN/blog');
    expect(zh.status).toBe(200);
    expect(resolveSeoConfigForPath('/zh-CN/blog').canonical).toBe(
      'https://webtomind.com/zh-CN/blog'
    );
    expect(resolveSeoConfigForPath('/zh-CN/use-cases').canonical).toBe(
      'https://webtomind.com/zh-CN/blog'
    );
    expect(zh.html).toContain('deepseek-harness-agent-workflow-guide');
    expect(zh.html).toContain('mona-lisa-1-openai-image-model-guide');
    expect(serverTextLength(zh.html)).toBeGreaterThanOrEqual(3000);

    const blogAlias = renderSeoPageHtmlWithStatus(SHELL, '/zh-CN/blog');
    expect(blogAlias.status).toBe(200);
    expect(resolveSeoConfigForPath('/en-US/blog').canonical).toBe(
      'https://webtomind.com/en-US/blog'
    );
  });

  it('adds related article exposure to both blog and tutorial detail SSR', () => {
    const blogDetail = renderSeoPageHtmlWithStatus(
      SHELL,
      '/zh-CN/blog/ai-zhuanshu-card'
    );
    expect(blogDetail.status).toBe(200);
    expect(blogDetail.html).toContain('更多文章');
    expect(blogDetail.html).toContain('href="/zh-CN/blog');

    const tutorialDetail = renderSeoPageHtmlWithStatus(
      SHELL,
      '/zh-CN/blog/ai-tool-credit-budget'
    );
    expect(tutorialDetail.status).toBe(200);
    expect(tutorialDetail.html).toContain('更多文章');
    expect(tutorialDetail.html).toContain('HowTo');
    expect(tutorialDetail.html).toContain('href="/zh-CN/blog');
  });

  it('keeps flagged image tools above the indexing threshold', () => {
    const slugs = [
      'image-splitter',
      'image-compressor',
      'gpt-image-2-denoiser'
    ];
    for (const slug of slugs) {
      const rendered = renderCreateAppPageHtml({
        html: SHELL,
        slug,
        locale: 'zh-CN'
      });
      expect(rendered.status).toBe(200);
      expect(serverTextLength(rendered.html)).toBeGreaterThanOrEqual(700);
    }
  });
});
