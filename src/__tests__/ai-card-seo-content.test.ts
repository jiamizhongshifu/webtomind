import { describe, expect, it } from 'vitest';
import { resolveSeoConfigForPath } from '../../api/seo-page';
import { BLOG_POSTS, USE_CASE_TUTORIALS } from '../web/data/marketing-content';

describe('AI dedicated card SEO pages', () => {
  it('renders localized blog metadata with BlogPosting JSON-LD', () => {
    const zhSeo = resolveSeoConfigForPath('/zh-CN/blog/ai-zhuanshu-card');
    const enSeo = resolveSeoConfigForPath('/en-US/blog/ai-zhuanshu-card');

    expect(zhSeo.canonical).toBe(
      'https://webtomind.com/zh-CN/blog/ai-zhuanshu-card'
    );
    expect(enSeo.canonical).toBe(
      'https://webtomind.com/en-US/blog/ai-zhuanshu-card'
    );
    expect(zhSeo.title).toContain('AI专属卡是什么');
    expect(enSeo.title).toContain('AI dedicated card');
    expect(zhSeo.alternates).toEqual(
      expect.arrayContaining([
        {
          hreflang: 'zh-CN',
          href: 'https://webtomind.com/zh-CN/blog/ai-zhuanshu-card'
        },
        {
          hreflang: 'en-US',
          href: 'https://webtomind.com/en-US/blog/ai-zhuanshu-card'
        }
      ])
    );
    expect(zhSeo.jsonLd as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          '@type': 'BlogPosting',
          headline: expect.stringContaining('AI专属卡')
        })
      ])
    );
  });

  it('renders localized credit budget use-case metadata with HowTo JSON-LD', () => {
    const zhSeo = resolveSeoConfigForPath('/zh-CN/blog/ai-tool-credit-budget');
    const enSeo = resolveSeoConfigForPath('/en-US/blog/ai-tool-credit-budget');

    expect(zhSeo.canonical).toBe(
      'https://webtomind.com/zh-CN/blog/ai-tool-credit-budget'
    );
    expect(enSeo.canonical).toBe(
      'https://webtomind.com/en-US/blog/ai-tool-credit-budget'
    );
    expect(zhSeo.title).toContain('AI 工具积分预算');
    expect(enSeo.title).toContain('AI tool credit budget');
    expect(enSeo.alternates).toEqual(
      expect.arrayContaining([
        {
          hreflang: 'zh-CN',
          href: 'https://webtomind.com/zh-CN/blog/ai-tool-credit-budget'
        },
        {
          hreflang: 'en-US',
          href: 'https://webtomind.com/en-US/blog/ai-tool-credit-budget'
        },
        {
          hreflang: 'x-default',
          href: 'https://webtomind.com/en-US/blog/ai-tool-credit-budget'
        }
      ])
    );
    expect(enSeo.jsonLd as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          '@type': 'HowTo',
          name: expect.stringContaining('AI tool credit budget')
        })
      ])
    );
  });

  it('keeps the frontend copy positioned as credit budgeting with tracked CTAs', () => {
    const post = BLOG_POSTS.find((item) => item.slug === 'ai-zhuanshu-card');
    const tutorial = USE_CASE_TUTORIALS.find(
      (item) => item.slug === 'ai-tool-credit-budget'
    );

    expect(post).toBeTruthy();
    expect(tutorial).toBeTruthy();

    const zhBlogCopy = post!.content.map((item) => item.zh).join('\n');
    const enBlogCopy = post!.content.map((item) => item.en).join('\n');
    const zhTutorialCopy = [
      tutorial!.summary.zh,
      ...tutorial!.steps.map((item) => item.zh),
      ...tutorial!.outcomes.map((item) => item.zh)
    ].join('\n');
    const enTutorialCopy = [
      tutorial!.summary.en,
      ...tutorial!.steps.map((item) => item.en),
      ...tutorial!.outcomes.map((item) => item.en)
    ].join('\n');

    expect(zhBlogCopy).toContain('不提供微信支付 AI 专属卡');
    expect(enBlogCopy).toContain('not provide a WeChat Pay AI dedicated card');
    expect(zhTutorialCopy).toContain('不是微信官方申请入口');
    expect(enTutorialCopy).toContain('not as an official application path');
    expect(`${zhBlogCopy}\n${zhTutorialCopy}`).toContain(
      'source=seo_ai_zhuanshu_card'
    );
    expect(`${enBlogCopy}\n${enTutorialCopy}`).toContain(
      'source=seo_ai_zhuanshu_card'
    );
    expect(post!.content.length).toBeGreaterThan(3);
    expect(post!.ctaLinks?.map((item) => item.href.zh).join('\n')).toContain(
      'source=seo_ai_zhuanshu_card_blog_recharge'
    );
    expect(tutorial!.ctaLinks?.map((item) => item.href.zh)).toContain(
      '/zh-CN/blog/ai-zhuanshu-card'
    );
  });
});
