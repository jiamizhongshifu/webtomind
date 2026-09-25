import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BLOG_POSTS,
  MARKETING_COVERS,
  USE_CASE_TUTORIALS
} from '@/web/data/marketing-content';
import {
  getPublicBlogPosts,
  type PublicBlogPost
} from '@/services/marketing-api';
import { imageFetchPriority } from '@/shared/ui';
import { useMarketingLocale } from '@/web/lib/marketing-locale';

const MAX_RECOMMENDATIONS = 3;

type Recommendation = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  date?: string;
  coverImage: string;
};

function buildRecommendations(
  locale: 'zh-CN' | 'en-US',
  currentSlug: string,
  remotePosts: PublicBlogPost[]
): Recommendation[] {
  const isZh = locale === 'zh-CN';
  const recommendations = new Map<string, Recommendation>();

  for (const tutorial of USE_CASE_TUTORIALS) {
    recommendations.set(tutorial.slug, {
      id: tutorial.id,
      slug: tutorial.slug,
      title: isZh ? tutorial.title.zh : tutorial.title.en,
      excerpt: isZh ? tutorial.summary.zh : tutorial.summary.en,
      category: isZh ? tutorial.category.zh : tutorial.category.en,
      coverImage: tutorial.coverImage
    });
  }

  for (const post of BLOG_POSTS) {
    recommendations.set(post.slug, {
      id: post.id,
      slug: post.slug,
      title: isZh ? post.title.zh : post.title.en,
      excerpt: isZh ? post.excerpt.zh : post.excerpt.en,
      category: isZh ? post.tag.zh : post.tag.en,
      date: post.date,
      coverImage: post.coverImage
    });
  }

  // 远程内容覆盖同 slug 的本地备用卡片，保证推荐区跟随最新发布内容。
  for (const post of remotePosts) {
    recommendations.set(post.slug, {
      id: post.id,
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      category: post.tag,
      date: post.published_at.slice(0, 10),
      coverImage: post.cover_image || MARKETING_COVERS.fallback
    });
  }

  return [...recommendations.values()]
    .filter((item) => item.slug !== currentSlug)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, MAX_RECOMMENDATIONS);
}

export function MarketingArticleRecommendations({
  currentSlug
}: {
  currentSlug: string;
}) {
  const { locale, isZh } = useMarketingLocale();
  const [remotePosts, setRemotePosts] = useState<PublicBlogPost[]>([]);

  useEffect(() => {
    let active = true;
    getPublicBlogPosts(locale, 30)
      .then((posts) => {
        if (active) setRemotePosts(posts);
      })
      .catch(() => {
        // 本地内容足以渲染推荐区，远程内容失败时保持页面可用。
      });
    return () => {
      active = false;
    };
  }, [locale]);

  const recommendations = useMemo(
    () => buildRecommendations(locale, currentSlug, remotePosts),
    [currentSlug, locale, remotePosts]
  );

  if (recommendations.length === 0) return null;

  return (
    <section
      className="marketing-more-articles"
      aria-labelledby="marketing-more-articles-title"
    >
      <div className="marketing-more-articles-header">
        <div>
          <p className="usecases-workspace-eyebrow">
            {isZh ? '继续探索' : 'Keep exploring'}
          </p>
          <h2 id="marketing-more-articles-title">
            {isZh ? '更多文章' : 'More articles'}
          </h2>
        </div>
        <Link to={`/${locale}/blog`} className="marketing-more-articles-link">
          {isZh ? '查看全部 →' : 'View all →'}
        </Link>
      </div>

      <div className="usecases-grid marketing-more-articles-grid">
        {recommendations.map((item, index) => (
          <Link
            key={item.id}
            to={`/${locale}/blog/${item.slug}`}
            className="usecases-card marketing-more-article-card"
          >
            <div className="usecases-card-media">
              <img
                src={item.coverImage}
                alt={item.title}
                loading={index === 0 ? 'eager' : 'lazy'}
                decoding="async"
                {...imageFetchPriority(index === 0 ? 'high' : 'auto')}
              />
              <span className="usecases-card-category">{item.category}</span>
            </div>
            <div className="usecases-card-copy">
              <h3>{item.title}</h3>
              <p>{item.excerpt}</p>
              <footer>
                {item.date ? (
                  <span className="blog-date">{item.date}</span>
                ) : null}
                <span className="usecases-card-action">
                  {isZh ? '阅读 →' : 'Read →'}
                </span>
              </footer>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
