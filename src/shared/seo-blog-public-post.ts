import type { SeoBlogPost } from '../../api/seo-content.js';
import { buildSeoBlogCta } from './seo-blog-cta.js';

export type PublicBlogLocale = 'zh-CN' | 'en-US';

export type PublicBlogPost = {
  id: string;
  slug: string;
  locale: PublicBlogLocale;
  title: string;
  excerpt: string;
  tag: string;
  body_markdown: string;
  cover_image: string | null;
  published_at: string;
  color_chart?: SeoBlogPost['colorChart'];
  cta_links?: Array<{
    label: string;
    href: string;
    variant: 'primary' | 'secondary';
  }>;
};

export function toPublicSeoBlogPost(
  post: SeoBlogPost,
  locale: PublicBlogLocale
): PublicBlogPost {
  const isZh = locale === 'zh-CN';
  const trackedCta = post.cta
    ? buildSeoBlogCta({
        locale,
        slug: post.slug,
        href: post.cta.href,
        kind: post.cta.kind
      })
    : null;

  return {
    id: `seo-${post.slug}-${locale}`,
    slug: post.slug,
    locale,
    title: isZh ? post.title.zh : post.title.en,
    excerpt: isZh ? post.excerpt.zh : post.excerpt.en,
    tag: isZh ? 'AI 创作指南' : 'AI creation guide',
    body_markdown: (post.body || [])
      .map((section) => (isZh ? section.zh : section.en))
      .join('\n\n'),
    cover_image: post.coverImage || null,
    published_at: `${post.date}T00:00:00.000Z`,
    color_chart: post.colorChart,
    cta_links:
      post.cta && trackedCta
        ? [
            {
              label: isZh ? post.cta.title.zh : post.cta.title.en,
              href: trackedCta.href,
              variant: 'primary'
            }
          ]
        : []
  };
}
