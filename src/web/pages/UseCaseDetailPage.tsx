import { useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { applySeo } from '../lib/seo';
import { USE_CASE_TUTORIALS } from '../data/marketing-content';
import { CreateWorkspaceFrame } from '@/web/components/image-create/CreateWorkspaceFrame';
import { MarketingArticleRecommendations } from '@/web/components/MarketingArticleRecommendations';
import { useMarketingLocale } from '../lib/marketing-locale';
import '../styles/usecases-workspace.css';
export function UseCaseDetailPage() {
  const { locale, isZh } = useMarketingLocale();
  const { slug } = useParams<{ slug: string }>();

  const tutorial = USE_CASE_TUTORIALS.find((item) => item.slug === slug);

  useEffect(() => {
    if (!tutorial) return;
    const title = isZh ? tutorial.title.zh : tutorial.title.en;
    const description = isZh ? tutorial.summary.zh : tutorial.summary.en;
    const canonical = `${window.location.origin}/${locale}/blog/${tutorial.slug}`;
    const zhHref = `${window.location.origin}/zh-CN/blog/${tutorial.slug}`;
    const enHref = `${window.location.origin}/en-US/blog/${tutorial.slug}`;

    return applySeo({
      title: `${title} | WebToMind`,
      description,
      canonical,
      ogType: 'article',
      ogImage: tutorial.coverImage,
      alternates: [
        { hreflang: 'zh-CN', href: zhHref },
        { hreflang: 'en-US', href: enHref },
        { hreflang: 'x-default', href: isZh ? zhHref : enHref }
      ],
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'HowTo',
        name: title,
        headline: title,
        description,
        image: tutorial.coverImage,
        totalTime: isZh ? tutorial.duration.zh : tutorial.duration.en,
        supply: [],
        tool: [],
        step: tutorial.steps.map((step, index) => ({
          '@type': 'HowToStep',
          position: index + 1,
          name: isZh ? step.zh : step.en
        })),
        datePublished: '2026-06-08',
        dateModified: '2026-06-08',
        author: {
          '@type': 'Organization',
          name: 'WebToMind'
        },
        mainEntityOfPage: canonical
      }
    });
  }, [isZh, locale, tutorial]);

  if (!tutorial) {
    return <Navigate to={`/${locale}/blog`} replace />;
  }

  const ctaLinks =
    tutorial.ctaLinks?.map((item) => ({
      label: isZh ? item.label.zh : item.label.en,
      href: isZh ? item.href.zh : item.href.en,
      variant: item.variant || 'secondary'
    })) || [];

  return (
    <CreateWorkspaceFrame className="usecases-detail-route">
      <div className="usecases-workspace-main">
        <nav className="usecases-breadcrumb" aria-label="Breadcrumb">
          <Link to={`/${locale}/blog`} className="usecases-breadcrumb-link">
            {isZh ? '博客' : 'Blog'}
          </Link>
          <span className="usecases-breadcrumb-sep" aria-hidden="true">
            /
          </span>
          <span className="usecases-breadcrumb-current">
            {isZh ? tutorial.title.zh : tutorial.title.en}
          </span>
        </nav>

        <article className="usecases-detail">
          <header className="usecases-detail-header">
            <p className="usecases-workspace-eyebrow">
              {isZh ? tutorial.category.zh : tutorial.category.en}
            </p>
            <h1>{isZh ? tutorial.title.zh : tutorial.title.en}</h1>
            <p>{isZh ? tutorial.summary.zh : tutorial.summary.en}</p>
          </header>

          <div className="usecases-detail-meta">
            <span>{isZh ? tutorial.category.zh : tutorial.category.en}</span>
            <span>{isZh ? tutorial.audience.zh : tutorial.audience.en}</span>
            <span>{isZh ? tutorial.duration.zh : tutorial.duration.en}</span>
            <span>
              {isZh ? tutorial.difficulty.zh : tutorial.difficulty.en}
            </span>
          </div>

          <section className="usecases-detail-section">
            <h2>{isZh ? '执行步骤' : 'Execution Steps'}</h2>
            <ol className="usecases-step-list">
              {tutorial.steps.map((step, index) => (
                <li key={`${tutorial.id}-${index}`}>
                  {isZh ? step.zh : step.en}
                </li>
              ))}
            </ol>
          </section>

          <section className="usecases-detail-section">
            <h2>{isZh ? '预期结果' : 'Expected Outcomes'}</h2>
            <ul className="usecases-outcomes-list">
              {tutorial.outcomes.map((item, index) => (
                <li key={`${tutorial.id}-outcome-${index}`}>
                  {isZh ? item.zh : item.en}
                </li>
              ))}
            </ul>
          </section>

          {ctaLinks.length > 0 && (
            <div className="usecases-detail-cta">
              {ctaLinks.map((item) => (
                <Link
                  key={`${tutorial.id}-${item.href}`}
                  to={item.href}
                  className={
                    item.variant === 'primary'
                      ? 'usecases-cta-primary'
                      : 'usecases-cta-secondary'
                  }
                >
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </article>
        <MarketingArticleRecommendations currentSlug={tutorial.slug} />
      </div>
    </CreateWorkspaceFrame>
  );
}
