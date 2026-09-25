import { useEffect, useMemo } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { applySeo } from '../lib/seo';
import { MARKET_SKILLS } from '@/workspace/data/youmind-market-skills';
import { MarketingPageShell, useMarketingLocale } from './MarketingPageShell';
import { createSkillCoverDataUrl } from '../lib/skill-cover';
export function PublicSkillDetailPage() {
  const { locale, isZh } = useMarketingLocale();
  const { id } = useParams<{ id: string }>();

  const skill = useMemo(
    () => MARKET_SKILLS.find((item) => item.id === id),
    [id]
  );

  useEffect(() => {
    if (!skill) return;
    const canonical = `${window.location.origin}/${locale}/skills/${skill.id}`;
    const zhHref = `${window.location.origin}/zh-CN/skills/${skill.id}`;
    const enHref = `${window.location.origin}/en-US/skills/${skill.id}`;
    const cover = createSkillCoverDataUrl(
      skill.name,
      skill.category || 'Skill'
    );
    return applySeo({
      title: `${skill.name} | WebToMind Skills`,
      description: skill.description,
      canonical,
      robots: 'noindex,follow',
      ogType: 'article',
      ogImage: cover,
      alternates: [
        { hreflang: 'zh-CN', href: zhHref },
        { hreflang: 'en-US', href: enHref },
        { hreflang: 'x-default', href: isZh ? zhHref : enHref }
      ],
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'CreativeWork',
        name: skill.name,
        description: skill.description,
        image: cover,
        author: {
          '@type': 'Person',
          name: skill.author
        },
        keywords: [skill.category],
        mainEntityOfPage: canonical
      }
    });
  }, [isZh, locale, skill]);

  if (!skill) {
    return <Navigate to={`/${locale}/skills`} replace />;
  }

  const coverPrimary = createSkillCoverDataUrl(
    skill.name,
    skill.category || 'Skill'
  );

  return (
    <MarketingPageShell title={skill.name} subtitle={skill.description}>
      <nav className="marketing-breadcrumb" aria-label="Breadcrumb">
        <Link to={`/${locale}/skills`} className="marketing-breadcrumb-link">
          {isZh ? '作品模板' : 'Templates'}
        </Link>
        <span className="marketing-breadcrumb-sep">/</span>
        <span className="marketing-breadcrumb-current">{skill.name}</span>
      </nav>

      <article className="marketing-card ui-card--web public-skill-detail-card">
        <div className="marketing-detail-cover-wrap public-skill-detail-cover">
          <img
            src={coverPrimary}
            alt={skill.name}
            className="marketing-detail-cover"
          />
        </div>

        <div className="public-skill-meta-grid">
          <div>
            <div className="public-skill-meta-label">
              {isZh ? '作者' : 'Author'}
            </div>
            <div className="public-skill-meta-value">{skill.author}</div>
          </div>
          <div>
            <div className="public-skill-meta-label">
              {isZh ? '类别' : 'Category'}
            </div>
            <div className="public-skill-meta-value">
              {skill.category || (isZh ? '更多' : 'More')}
            </div>
          </div>
        </div>

        <div className="public-skill-prompt-wrap">
          <h3>{isZh ? '指令' : 'Prompt'}</h3>
          <div className="public-skill-prompt-hidden">
            <p>
              {isZh
                ? '该模板的完整指令已隐藏。加入工作台后，可直接在项目右侧作品模板中使用。'
                : 'The full prompt is hidden on the public website. Add it to your workspace and use it from the project template panel.'}
            </p>
            <a
              href={`/skills?template=${encodeURIComponent(skill.id)}&add=true`}
              className="marketing-black-btn public-skill-install-link"
            >
              {isZh ? '加入作品模板' : 'Add to templates'}
            </a>
          </div>
        </div>
      </article>
    </MarketingPageShell>
  );
}
