import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { applySeo } from '../lib/seo';
import { BLOG_POSTS, MARKETING_COVERS } from '../data/marketing-content';
import {
  getPublicBlogPostBySlug,
  getPublicBlogPosts,
  type PublicBlogPost
} from '@/services/marketing-api';
import { useMarketingLocale } from './MarketingPageShell';
import { CreateWorkspaceFrame } from '@/web/components/image-create/CreateWorkspaceFrame';
import { MarketingArticleRecommendations } from '@/web/components/MarketingArticleRecommendations';
import '../styles/usecases-workspace.css';

const MAX_BLOG_DETAIL_PARAGRAPHS = 6;
const BLOG_BOOTSTRAP_ID = 'webtomind-blog-bootstrap';

const PINDOU_CHART_SYSTEM_NAMES: Record<string, string> = {
  mard: 'MARD',
  coco: 'COCO',
  manman: '漫漫',
  panpan: '盼盼',
  mixiaowo: '咪小窝'
};

function toParagraphs(markdown: string): string[] {
  return markdown
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function readBlogBootstrap(
  locale: 'zh-CN' | 'en-US',
  slug?: string
): PublicBlogPost | null {
  if (!slug || typeof document === 'undefined') return null;
  const element = document.getElementById(BLOG_BOOTSTRAP_ID);
  if (!element?.textContent) return null;
  try {
    const post = JSON.parse(element.textContent) as PublicBlogPost;
    return post.locale === locale && post.slug === slug ? post : null;
  } catch {
    return null;
  }
}

export function BlogDetailPage() {
  const { locale, isZh } = useMarketingLocale();
  const { slug } = useParams<{ slug: string }>();
  const bootstrapPost = useMemo(
    () => readBlogBootstrap(locale, slug),
    [locale, slug]
  );
  const [remotePost, setRemotePost] = useState<PublicBlogPost | null>(
    bootstrapPost
  );
  const [isRemoteLoaded, setIsRemoteLoaded] = useState(Boolean(bootstrapPost));
  const [contentExpanded, setContentExpanded] = useState(false);

  const localPost = useMemo(
    () => BLOG_POSTS.find((post) => post.slug === slug),
    [slug]
  );
  useEffect(() => {
    if (!slug) {
      setRemotePost(null);
      setIsRemoteLoaded(true);
      return;
    }

    let active = true;
    getPublicBlogPostBySlug(locale, slug)
      .then((post) => {
        if (active) {
          setRemotePost(post || bootstrapPost);
          setIsRemoteLoaded(true);
        }
      })
      .catch(async () => {
        try {
          const posts = await getPublicBlogPosts(locale, 100);
          if (active) {
            setRemotePost(
              posts.find((post) => post.slug === slug) || bootstrapPost
            );
            setIsRemoteLoaded(true);
          }
        } catch {
          if (active) {
            setRemotePost(bootstrapPost);
            setIsRemoteLoaded(true);
          }
        }
      });
    return () => {
      active = false;
    };
  }, [bootstrapPost, locale, slug]);

  const post = useMemo(() => {
    if (remotePost) {
      return {
        slug: remotePost.slug,
        title: remotePost.title,
        excerpt: remotePost.excerpt,
        tag: remotePost.tag,
        date: remotePost.published_at.slice(0, 10),
        readTime: isZh ? '5 分钟阅读' : '5 min read',
        author: isZh ? 'WebToMind 编辑部' : 'WebToMind Editorial',
        keywords: [
          remotePost.tag,
          isZh ? 'AI 图片生成' : 'AI image generation'
        ],
        coverImage: remotePost.cover_image || MARKETING_COVERS.fallback,
        content: toParagraphs(remotePost.body_markdown || remotePost.excerpt),
        colorChart: remotePost.color_chart,
        ctaLinks: remotePost.cta_links || []
      };
    }

    if (localPost) {
      return {
        slug: localPost.slug,
        title: isZh ? localPost.title.zh : localPost.title.en,
        excerpt: isZh ? localPost.excerpt.zh : localPost.excerpt.en,
        tag: isZh ? localPost.tag.zh : localPost.tag.en,
        date: localPost.date,
        readTime: isZh ? localPost.readTime.zh : localPost.readTime.en,
        author: isZh ? localPost.author.zh : localPost.author.en,
        keywords: localPost.keywords.map((item) => (isZh ? item.zh : item.en)),
        coverImage: localPost.coverImage,
        content: localPost.content.map((section) =>
          isZh ? section.zh : section.en
        ),
        colorChart: localPost.colorChart,
        ctaLinks:
          localPost.ctaLinks?.map((item) => ({
            label: isZh ? item.label.zh : item.label.en,
            href: isZh ? item.href.zh : item.href.en,
            variant: item.variant || 'secondary'
          })) || []
      };
    }

    return null;
  }, [isZh, localPost, remotePost]);

  useEffect(() => {
    if (!post) return;
    const canonical = `${window.location.origin}/${locale}/blog/${post.slug}`;
    const zhHref = `${window.location.origin}/zh-CN/blog/${post.slug}`;
    const enHref = `${window.location.origin}/en-US/blog/${post.slug}`;
    return applySeo({
      title: `${post.title} | WebToMind`,
      description: post.excerpt,
      canonical,
      ogType: 'article',
      ogImage: post.coverImage,
      alternates: [
        { hreflang: 'zh-CN', href: zhHref },
        { hreflang: 'en-US', href: enHref },
        { hreflang: 'x-default', href: isZh ? zhHref : enHref }
      ],
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.excerpt,
        image: post.coverImage,
        keywords: post.keywords,
        articleSection: post.tag,
        wordCount: post.content
          .slice(0, MAX_BLOG_DETAIL_PARAGRAPHS)
          .join(' ')
          .split(/\s+/)
          .filter(Boolean).length,
        datePublished: post.date,
        dateModified: post.date,
        author: {
          '@type': 'Person',
          name: post.author
        },
        mainEntityOfPage: canonical
      }
    });
  }, [isZh, locale, post]);

  if (!post && isRemoteLoaded) {
    return <Navigate to={`/${locale}/blog`} replace />;
  }
  if (!post) return null;
  const contentTruncated = post.content.length > MAX_BLOG_DETAIL_PARAGRAPHS;
  const visibleContent = contentExpanded
    ? post.content
    : post.content.slice(0, MAX_BLOG_DETAIL_PARAGRAPHS);

  return (
    <CreateWorkspaceFrame className="blog-detail-route">
      <div className="usecases-workspace-main">
        <nav className="usecases-breadcrumb" aria-label="Breadcrumb">
          <Link
            to={`/${locale}/blog`}
            className="usecases-breadcrumb-link"
          >
            {isZh ? '博客' : 'Blog'}
          </Link>
          <span className="usecases-breadcrumb-sep">/</span>
          <span className="usecases-breadcrumb-current">{post.title}</span>
        </nav>

        <article className="marketing-article blog-detail-article">
          <h1 className="marketing-article-title">{post.title}</h1>

          <div className="marketing-article-meta">
            <span className="blog-tag">{post.tag}</span>
            <span className="blog-date">{post.date}</span>
            <span className="blog-date">{post.readTime}</span>
            <span className="blog-date">{post.author}</span>
          </div>

          <div className="blog-detail-content">
            {visibleContent.map((paragraph, index) => (
              <ReactMarkdown
                key={`${post.slug}-${index}`}
                remarkPlugins={[remarkGfm]}
              >
                {paragraph}
              </ReactMarkdown>
            ))}
          </div>
          {contentTruncated ? (
            <button
              type="button"
              className="blog-detail-expand"
              onClick={() => setContentExpanded((current) => !current)}
            >
              {contentExpanded
                ? isZh
                  ? '收起'
                  : 'Collapse'
                : isZh
                  ? '展开全文'
                  : 'Read full article'}
            </button>
          ) : null}

          {post.colorChart && (
            <div className="pindou-color-chart">
              <h2>
                {isZh
                  ? '色号对照表（291 色）'
                  : 'Color code chart (291 colors)'}
              </h2>
              <div className="pindou-color-chart-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{isZh ? '颜色' : 'Color'}</th>
                      {post.colorChart.systems.map((system) => (
                        <th key={system}>
                          {PINDOU_CHART_SYSTEM_NAMES[system] || system}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {post.colorChart.rows.map((row) => (
                      <tr key={row.hex}>
                        <td>
                          <span
                            className="pindou-color-chart-swatch"
                            style={{ backgroundColor: row.hex }}
                          />
                          {row.hex}
                        </td>
                        {row.codes.map((code, index) => (
                          <td key={`${row.hex}-${index}`}>{code || '—'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {post.ctaLinks.length > 0 && (
            <div className="marketing-article-cta-row">
              {post.ctaLinks.map((item) => (
                <Link
                  key={`${post.slug}-${item.href}`}
                  to={item.href}
                  className={
                    item.variant === 'primary'
                      ? 'marketing-cta-btn'
                      : 'marketing-cta-link'
                  }
                >
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </article>
        <MarketingArticleRecommendations currentSlug={post.slug} />
      </div>
    </CreateWorkspaceFrame>
  );
}
