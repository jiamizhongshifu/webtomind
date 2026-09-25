import { afterEach, describe, expect, it } from 'vitest';
import { applySeo } from '../seo';

describe('applySeo', () => {
  afterEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('lang');
  });

  it('replaces server-rendered alternate links instead of stacking client alternates', () => {
    document.head.innerHTML = `
      <title>Old</title>
      <meta name="description" content="old" />
      <meta name="robots" content="index,follow" />
      <link rel="canonical" href="https://webtomind.com/zh-CN/create/prompts/share/case-1" />
      <link rel="alternate" hreflang="zh-CN" href="https://webtomind.com/zh-CN/create/prompts/share/case-1" />
      <link rel="alternate" hreflang="en-US" href="https://webtomind.com/en-US/prompts/case-1" />
    `;

    const cleanup = applySeo({
      title: 'Prompt Library | WebToMind',
      description: 'Browse prompt cases.',
      canonical: 'https://webtomind.com/zh-CN/prompts',
      alternates: [
        {
          hreflang: 'zh-CN',
          href: 'https://webtomind.com/zh-CN/prompts'
        },
        {
          hreflang: 'en-US',
          href: 'https://webtomind.com/en-US/prompts'
        },
        {
          hreflang: 'x-default',
          href: 'https://webtomind.com/en-US/prompts'
        }
      ]
    });

    const alternates = [...document.querySelectorAll('link[rel="alternate"]')];
    expect(alternates.map((link) => link.getAttribute('href'))).toEqual([
      'https://webtomind.com/zh-CN/prompts',
      'https://webtomind.com/en-US/prompts',
      'https://webtomind.com/en-US/prompts'
    ]);
    expect(alternates).toHaveLength(3);

    cleanup();

    const restoredAlternates = [
      ...document.querySelectorAll('link[rel="alternate"]')
    ];
    expect(restoredAlternates.map((link) => link.getAttribute('href'))).toEqual([
      'https://webtomind.com/zh-CN/create/prompts/share/case-1',
      'https://webtomind.com/en-US/prompts/case-1'
    ]);
  });
});
