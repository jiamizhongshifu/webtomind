import { describe, expect, it } from 'vitest';
import {
  buildPromptOgCacheKey,
  buildPromptOgImageUrl,
  PROMPT_OG_RESPONSE_CACHE_CONTROL
} from '../../api/prompt-og-cache';
import {
  PROMPT_OG_CTA,
  createOverlaySvg,
  isAllowedPromptOgImageUrl
} from '../../api/prompt-og';

describe('prompt case social image overlay', () => {
  it('keeps the OG image free of text blocks that render poorly on X', () => {
    const svg = createOverlaySvg({
      title: '中文精选案例标题',
      prompt: '',
      imageUrl: '',
      locale: 'zh-CN'
    }).toString('utf8');

    expect(svg).not.toContain(PROMPT_OG_CTA);
    expect(svg).not.toContain('<text');
    expect(svg).not.toContain('fill-opacity="0.72"');
    expect(svg).not.toContain('paint-order="stroke"');
    expect(svg).not.toContain('width="812" height="68"');
    expect(svg).not.toContain('fill-opacity="0.82"');
    expect(svg).not.toContain('url(#shade)');
    expect(svg).not.toContain('中文精选案例标题');
    expect(svg).not.toContain('使用这个 Prompt');
    expect(svg).not.toContain('Try this Prompt in WebToMind');
    expect(svg).not.toContain('Open the case and generate images in WebToMind');
    expect(svg).not.toContain('Reusable visual prompt case');
    expect(svg).not.toContain('WebToMind</text>');
    expect(svg).not.toContain('width="104" height="40"');
    expect(svg).not.toContain('fill="#ffffff" fill-opacity="0.9"');
  });

  it('uses a versioned persistent cache key for generated PNGs', () => {
    expect(
      buildPromptOgCacheKey({
        version: '20260609-image-only-card',
        locale: 'zh-CN',
        slug: 'portrait prompt'
      })
    ).toBe('prompt-og/20260609-image-only-card/zh-CN/portrait%20prompt.png');

    expect(PROMPT_OG_RESPONSE_CACHE_CONTROL).toContain('immutable');
  });

  it('keeps the SEO OG URL on the versioned prompt-og endpoint', () => {
    expect(
      buildPromptOgImageUrl({
        locale: 'en-US',
        id: 'case-123',
        version: '20260609-image-only-card',
        siteUrl: 'https://webtomind.com/'
      })
    ).toBe(
      'https://webtomind.com/api/prompt-og?locale=en-US&id=case-123&v=20260609-image-only-card'
    );
  });

  it('only fetches OG source images from approved public storage hosts', () => {
    expect(
      isAllowedPromptOgImageUrl(
        'https://webtomind.com/prompt-cases/example.webp'
      )
    ).toBe(true);
    expect(
      isAllowedPromptOgImageUrl(
        'https://project.supabase.co/storage/v1/object/public/example.webp'
      )
    ).toBe(true);
    expect(isAllowedPromptOgImageUrl('http://127.0.0.1/admin')).toBe(false);
    expect(
      isAllowedPromptOgImageUrl('https://webtomind.com@127.0.0.1/admin')
    ).toBe(false);
    expect(isAllowedPromptOgImageUrl('https://example.com/redirect')).toBe(
      false
    );
  });
});
