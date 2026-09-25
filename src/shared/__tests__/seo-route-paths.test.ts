import { describe, expect, it } from 'vitest';
import { PROMPT_SEO_ALIASES } from '../prompt-seo-content';
import {
  buildPromptCaseShareRedirectPath,
  isExactSeoPath,
  isMarketingRoutePath,
  PROMPT_SEO_ALIAS_PATHS
} from '../seo-route-paths';

describe('shared SEO route paths', () => {
  it('keeps prompt SEO route paths aligned with prompt alias content', () => {
    expect(PROMPT_SEO_ALIAS_PATHS).toEqual(
      PROMPT_SEO_ALIASES.map((alias) => alias.path)
    );
  });

  it('uses the same prompt alias paths for Worker SEO and marketing routes', () => {
    expect(isExactSeoPath('/free-gpt-image-2-prompts')).toBe(true);
    expect(isExactSeoPath('/nano-banana-prompts-gallery')).toBe(true);
    expect(isExactSeoPath('/mona-lisa-1-prompts')).toBe(true);
    expect(isExactSeoPath('/mona-lisa-prompts')).toBe(true);
    expect(isExactSeoPath('/gpt-image-2-5-prompts')).toBe(true);
    expect(isExactSeoPath('/luna-lisa-alpha-prompts')).toBe(true);
    expect(isExactSeoPath('/astra-prompts')).toBe(true);
    expect(isExactSeoPath('/gpt-6-astra-prompts')).toBe(true);
    expect(isMarketingRoutePath('/free-gpt-image-2-prompts')).toBe(true);
    expect(isMarketingRoutePath('/nano-banana-prompts-gallery')).toBe(true);
    expect(isMarketingRoutePath('/mona-lisa-1-prompts')).toBe(true);
    expect(isMarketingRoutePath('/gpt-image-2-5-prompts')).toBe(true);
    expect(isMarketingRoutePath('/luna-lisa-alpha-prompts')).toBe(true);
    expect(isMarketingRoutePath('/astra-prompts')).toBe(true);
    expect(isMarketingRoutePath('/gpt-6-astra-prompts')).toBe(true);
  });

  it('keeps only canonical prompt library URLs on prompt-page SSR', () => {
    expect(isExactSeoPath('/zh-CN/prompts')).toBe(true);
    expect(isExactSeoPath('/zh-CN/create/prompts')).toBe(true);
    expect(isExactSeoPath('/en-US/prompts')).toBe(true);
  });

  it('routes public utility tools through Worker SEO rendering', () => {
    expect(isExactSeoPath('/zh-CN/tools/pindou-pattern-maker')).toBe(true);
    expect(isExactSeoPath('/en-US/tools/pindou-pattern-maker')).toBe(true);
    expect(isMarketingRoutePath('/zh-CN/tools/pindou-pattern-maker')).toBe(
      true
    );
  });

  it('builds legacy prompt case share redirects without dropping query state', () => {
    expect(
      buildPromptCaseShareRedirectPath({
        pathname: '/create/prompts/share/case-123',
        search: '?utm=test',
        hash: '#preview',
        caseId: 'case-123'
      })
    ).toBe('/zh-CN/prompts?utm=test&caseId=case-123#preview');

    expect(
      buildPromptCaseShareRedirectPath({
        pathname: '/en-US/create/prompts/share/case-123',
        search: '?caseSlug=case-one',
        hash: '',
        caseId: 'case-123'
      })
    ).toBe('/en-US/prompts?caseSlug=case-one');
  });
});
