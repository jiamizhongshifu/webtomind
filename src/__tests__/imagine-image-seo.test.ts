import { describe, expect, it } from 'vitest';
import { renderSeoPageHtmlWithStatus } from '../../api/seo-page-render';

const SHELL =
  '<!doctype html><html lang="zh-CN"><head><title>WebToMind</title><meta name="robots" content="index,follow" /><link rel="canonical" href="https://webtomind.com/" /><meta property="og:type" content="website" /><meta property="og:title" content="old" /><meta property="og:description" content="old" /><meta property="og:url" content="https://webtomind.com/" /><meta property="og:image" content="old" /><meta name="twitter:card" content="summary_large_image" /></head><body><div id="root"></div></body></html>';

function serverTextLength(html: string): number {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
}

describe('Imagine Image 2.0 SEO landing', () => {
  it('renders the canonical alias with FAQ JSON-LD and rich body', () => {
    const rendered = renderSeoPageHtmlWithStatus(
      SHELL,
      '/imagine-image-2-0-prompts'
    );

    expect(rendered.status).toBe(200);
    expect(rendered.html).toContain(
      '<link rel="canonical" href="https://webtomind.com/imagine-image-2-0-prompts" />'
    );
    expect(rendered.html).toContain('Imagine Image 2.0 Prompts');
    expect(rendered.html).toContain(
      'rel="alternate" hreflang="en-US" href="https://webtomind.com/imagine-image-2-0-prompts"'
    );
    expect(rendered.html).toContain('"@type":"FAQPage"');
    expect(rendered.html).not.toContain(
      '<meta name="robots" content="noindex'
    );
    expect(rendered.html).toContain(
      'href="/image?source=seo_prompt_landing"'
    );
    expect(serverTextLength(rendered.html)).toBeGreaterThanOrEqual(1500);
  });

  it('points the Grok Imagine alias canonical to the Imagine Image 2.0 page', () => {
    const rendered = renderSeoPageHtmlWithStatus(
      SHELL,
      '/grok-imagine-image-2-0-prompts'
    );

    expect(rendered.status).toBe(200);
    expect(rendered.html).toContain(
      '<link rel="canonical" href="https://webtomind.com/imagine-image-2-0-prompts" />'
    );
    expect(rendered.html).toContain('Grok Imagine Image 2.0');
  });

  it('renders the localized model page with zh/en alternates', () => {
    const zh = renderSeoPageHtmlWithStatus(
      SHELL,
      '/zh-CN/prompts/model/grok-imagine'
    );
    const en = renderSeoPageHtmlWithStatus(
      SHELL,
      '/en-US/prompts/model/grok-imagine'
    );

    expect(zh.status).toBe(200);
    expect(zh.html).toContain(
      '<link rel="canonical" href="https://webtomind.com/zh-CN/prompts/model/grok-imagine" />'
    );
    expect(zh.html).toContain('rel="alternate" hreflang="zh-CN"');
    expect(zh.html).toContain('rel="alternate" hreflang="en-US"');
    expect(zh.html).toContain('Grok Imagine Image 2.0');
    expect(zh.html).not.toContain(
      '<meta name="robots" content="noindex'
    );
    expect(serverTextLength(zh.html)).toBeGreaterThanOrEqual(1500);

    expect(en.status).toBe(200);
    expect(en.html).toContain(
      '<link rel="canonical" href="https://webtomind.com/en-US/prompts/model/grok-imagine" />'
    );
    expect(serverTextLength(en.html)).toBeGreaterThanOrEqual(1500);
  });
});
