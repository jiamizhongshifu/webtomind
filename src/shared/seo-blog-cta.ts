import { getLocalizedSeoPath, type SeoLocale } from './seo-route-paths';

export type SeoBlogCtaKind =
  | 'browse_prompts'
  | 'try_tool'
  | 'use_template'
  | 'view_pricing'
  | 'view_workflow';

export function buildSeoBlogCta(input: {
  locale: SeoLocale;
  slug: string;
  href: string;
  kind: SeoBlogCtaKind;
}): { href: string; source: string } {
  const source = `seo_blog_${input.slug}_${input.kind}`;
  const target = new URL(
    getLocalizedSeoPath(input.locale, input.href),
    'https://webtomind.com'
  );
  target.searchParams.set('source', source);
  target.searchParams.set('cta_source', source);
  target.searchParams.set('seo_content_id', input.slug);
  target.searchParams.set(
    'seo_content_path',
    getLocalizedSeoPath(input.locale, `/blog/${input.slug}`)
  );
  target.searchParams.set('seo_cta_kind', input.kind);
  return { href: `${target.pathname}${target.search}`, source };
}
