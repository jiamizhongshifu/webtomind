import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureFirstTouchAcquisition,
  captureSeoContentCtaAttribution,
  isSeoPromptUseSource,
  readSeoConversionAttribution,
  rememberSeoConversionAttribution
} from '../seo-conversion-attribution';

describe('SEO conversion attribution', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.useRealTimers();
  });

  it('stores only a canonical path and restores the same anonymous session', () => {
    const attribution = rememberSeoConversionAttribution({
      canonicalPath: '/ai-image-prompts?utm_source=google#case',
      caseId: 'case-123',
      caseSlug: 'cinematic-product-shot',
      source: 'prompt_preview_use'
    });

    expect(attribution).toMatchObject({
      canonicalPath: '/ai-image-prompts',
      caseId: 'case-123',
      caseSlug: 'cinematic-product-shot',
      source: 'prompt_preview_use'
    });
    expect(attribution?.sessionId).toBeTruthy();
    expect(
      readSeoConversionAttribution({ source: 'prompt_preview_use' })
    ).toEqual(attribution);
  });

  it('does not restore attribution for a different create source', () => {
    rememberSeoConversionAttribution({
      canonicalPath: '/en-US/prompts/example',
      caseId: 'case-123',
      source: 'prompt_detail_use'
    });

    expect(
      readSeoConversionAttribution({ source: 'direct_create' })
    ).toBeUndefined();
  });

  it('recognizes only supported prompt-to-create sources', () => {
    expect(isSeoPromptUseSource('prompt_detail_use')).toBe(true);
    expect(isSeoPromptUseSource('prompt_preview_use')).toBe(true);
    expect(isSeoPromptUseSource('prompt_preview_cta')).toBe(true);
    expect(isSeoPromptUseSource('prompt_detail_recipe_use')).toBe(true);
    expect(isSeoPromptUseSource('prompt_case_recipe')).toBe(true);
    expect(isSeoPromptUseSource('direct_create')).toBe(false);
  });

  it('matches the preview CTA route alias to the persisted preview use source', () => {
    const attribution = rememberSeoConversionAttribution({
      canonicalPath: '/ai-image-prompts',
      caseId: 'case-123',
      source: 'prompt_preview_use'
    });

    expect(
      readSeoConversionAttribution({ source: 'prompt_preview_cta' })
    ).toEqual(attribution);
  });

  it('matches prompt recipe event sources to the create route source', () => {
    const attribution = rememberSeoConversionAttribution({
      canonicalPath: '/en-US/prompts/product-shot',
      caseId: 'case-123',
      source: 'prompt_detail_recipe_use'
    });

    expect(attribution?.source).toBe('prompt_case_recipe');
    expect(
      readSeoConversionAttribution({ source: 'prompt_case_recipe' })
    ).toEqual(attribution);
  });

  it('captures first-touch UTM, click id and ref code from the landing URL', () => {
    window.history.replaceState(
      {},
      '',
      '/zh-CN/prompts?utm_source=google&utm_medium=cpc&gclid=abc123&ref=PH20'
    );

    const acquisition = captureFirstTouchAcquisition();

    expect(acquisition).toMatchObject({
      utm: { utm_source: 'google', utm_medium: 'cpc' },
      clickId: 'abc123',
      refCode: 'PH20'
    });
  });

  it('does not overwrite the first-touch snapshot on later navigations', () => {
    window.history.replaceState({}, '', '/?utm_source=google&ref=PH20');
    const first = captureFirstTouchAcquisition();
    window.history.replaceState({}, '', '/zh-CN/create');

    expect(captureFirstTouchAcquisition()).toEqual(first);
  });

  it('ignores trusted workflow referrers and strips query from referrer', () => {
    Object.defineProperty(window.document, 'referrer', {
      configurable: true,
      value: 'https://accounts.google.com/?token=secret'
    });
    window.history.replaceState({}, '', '/');

    expect(captureFirstTouchAcquisition()).toBeUndefined();

    Object.defineProperty(window.document, 'referrer', {
      configurable: true,
      value: 'https://x.com/some/user?utm_source=bad'
    });
    window.history.replaceState({}, '', '/?utm_source=x');

    expect(captureFirstTouchAcquisition()?.externalReferrer).toBe(
      'https://x.com/some/user'
    );
  });

  it('merges the first-touch acquisition into the prompt-use snapshot', () => {
    window.history.replaceState({}, '', '/?utm_source=bing&ref=PH20');
    captureFirstTouchAcquisition();

    const attribution = rememberSeoConversionAttribution({
      canonicalPath: '/zh-CN/prompts/example',
      caseId: 'case-456',
      source: 'prompt_detail_use'
    });

    expect(attribution?.acquisition).toMatchObject({
      utm: { utm_source: 'bing' },
      refCode: 'PH20'
    });
    expect(
      readSeoConversionAttribution({ source: 'prompt_detail_use' })?.acquisition
    ).toEqual(attribution?.acquisition);
  });

  it('captures a validated blog CTA without storing arbitrary query data', () => {
    window.history.replaceState(
      {},
      '',
      '/zh-CN/prompts?source=seo_blog_product-image-ai-guide_use_template&cta_source=seo_blog_product-image-ai-guide_use_template&seo_content_id=product-image-ai-guide&seo_content_path=%2Fzh-CN%2Fblog%2Fproduct-image-ai-guide&seo_cta_kind=use_template&secret=discard-me'
    );

    expect(captureSeoContentCtaAttribution()).toMatchObject({
      canonicalPath: '/zh-CN/blog/product-image-ai-guide',
      contentId: 'product-image-ai-guide',
      source: 'seo_blog_product-image-ai-guide_use_template',
      ctaKind: 'use_template'
    });
  });

  it('carries the blog origin into the later prompt-to-generation attribution', () => {
    window.history.replaceState(
      {},
      '',
      '/zh-CN/prompts?cta_source=seo_blog_product-image-ai-guide_use_template&seo_content_id=product-image-ai-guide&seo_content_path=%2Fzh-CN%2Fblog%2Fproduct-image-ai-guide&seo_cta_kind=use_template'
    );
    captureSeoContentCtaAttribution();
    window.history.replaceState({}, '', '/zh-CN/prompts/product-shot');

    const attribution = rememberSeoConversionAttribution({
      canonicalPath: '/zh-CN/prompts/product-shot',
      caseId: 'case-product-1',
      caseSlug: 'product-shot',
      source: 'prompt_detail_use'
    });

    expect(attribution).toMatchObject({
      canonicalPath: '/zh-CN/blog/product-image-ai-guide',
      caseId: 'case-product-1',
      source: 'prompt_detail_use',
      cluster: 'seo_blog',
      contentId: 'product-image-ai-guide',
      cta: 'seo_blog_product-image-ai-guide_use_template'
    });
  });
});
