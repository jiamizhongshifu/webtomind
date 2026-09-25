import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { applySeo } from '../lib/seo';
import { MARKET_SKILLS } from '@/workspace/data/youmind-market-skills';
import { MarketingPageShell, useMarketingLocale } from './MarketingPageShell';
import { createSkillCoverDataUrl } from '../lib/skill-cover';
import { ButtonLink } from '@/shared/ui';
const CATEGORY_ORDER = ['学习', '写作', '图片', 'Slides', '网页', '更多'];

function sortCategory(a: string, b: string) {
  const aIndex = CATEGORY_ORDER.indexOf(a);
  const bIndex = CATEGORY_ORDER.indexOf(b);
  if (aIndex === -1 && bIndex === -1) return a.localeCompare(b, 'zh-Hans');
  if (aIndex === -1) return 1;
  if (bIndex === -1) return -1;
  return aIndex - bIndex;
}

export function PublicSkillsPage() {
  const { locale, isZh } = useMarketingLocale();
  const [activeCategory, setActiveCategory] = useState<string>(
    isZh ? '全部' : 'All'
  );
  const [search, setSearch] = useState('');
  const allSkills = useMemo(
    () =>
      MARKET_SKILLS.map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        author: skill.author,
        category: skill.category || (isZh ? '更多' : 'More'),
        source: 'skills' as const,
        coverImage: createSkillCoverDataUrl(
          skill.name,
          skill.category || 'Skill'
        )
      })),
    [isZh]
  );
  const categories = useMemo(() => {
    const allLabel = isZh ? '全部' : 'All';
    const deduped = Array.from(
      new Set(
        allSkills
          .map((skill) => skill.category)
          .filter((category) => category !== allLabel)
      )
    ).sort(sortCategory);
    return [allLabel, ...deduped];
  }, [allSkills, isZh]);
  const filteredSkills = useMemo(() => {
    const allLabel = isZh ? '全部' : 'All';
    const q = search.trim().toLowerCase();
    return allSkills.filter((skill) => {
      if (activeCategory !== allLabel && skill.category !== activeCategory)
        return false;
      if (!q) return true;
      return `${skill.name} ${skill.description} ${skill.author} ${skill.category}`
        .toLowerCase()
        .includes(q);
    });
  }, [activeCategory, allSkills, isZh, search]);

  useEffect(() => {
    const canonical = `${window.location.origin}/${locale}/skills`;
    const zhHref = `${window.location.origin}/zh-CN/skills`;
    const enHref = `${window.location.origin}/en-US/skills`;
    return applySeo({
      title: isZh ? 'WebToMind 技能广场' : 'WebToMind Skills Plaza',
      description: isZh
        ? '浏览 WebToMind 作品模板，快速加入写作、学习、配图等创作模板。'
        : 'Browse WebToMind creation templates and add writing, learning, and visual templates quickly.',
      canonical,
      robots: 'noindex,follow',
      ogImage: allSkills[0]?.coverImage,
      alternates: [
        { hreflang: 'zh-CN', href: zhHref },
        { hreflang: 'en-US', href: enHref },
        { hreflang: 'x-default', href: isZh ? zhHref : enHref }
      ],
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: isZh ? 'WebToMind 技能广场' : 'WebToMind Skills Plaza',
          url: canonical
        },
        {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          itemListElement: allSkills.map((skill, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: skill.name
          }))
        }
      ]
    });
  }, [allSkills, isZh, locale]);

  return (
    <MarketingPageShell
      title={isZh ? '作品模板' : 'Creation Templates'}
      subtitle={
        isZh
          ? `与工作台作品模板同步，当前共 ${allSkills.length} 个模板。`
          : `${allSkills.length} synced templates from the workspace.`
      }
    >
      {/* 产品定位转向视觉创意工作流,顶部加引导卡跳 /create */}
      <section className="public-skills-studio-callout">
        <div className="public-skills-studio-copy">
          <h3 className="public-skills-studio-title">
            {isZh
              ? '推荐:试试新的视觉提示词工作台'
              : 'Recommended: Try the new Visual Prompt Studio'}
          </h3>
          <p className="public-skills-studio-text">
            {isZh
              ? 'WebToMind 已转向以图片生成为核心,上传参考图 AI 反推 + 看图组合 + 一键生成。下方技能模板待重新规划。'
              : 'WebToMind has pivoted to image-first creation. Upload references, AI reverses prompts, pick visual slots and generate. Skill templates below are pending rework.'}
          </p>
        </div>
        <ButtonLink
          to="/create"
          variant="primary"
          size="md"
          className="public-skills-studio-link"
        >
          {isZh ? '进入创作台 →' : 'Open Studio →'}
        </ButtonLink>
      </section>

      <div className="marketing-skill-toolbar">
        <div className="marketing-skill-categories">
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setActiveCategory(item)}
              className={`marketing-category-pill ${activeCategory === item ? 'active' : ''}`}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="marketing-skill-search-wrap">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="marketing-skill-search"
            placeholder={isZh ? '搜索技能' : 'Search skills'}
            aria-label={isZh ? '搜索技能' : 'Search skills'}
          />
        </div>
      </div>

      <section className="marketing-grid four-col public-skills-grid">
        {filteredSkills.length > 0 ? (
          filteredSkills.map((skill) => (
            <Link
              key={skill.id}
              to={`/${locale}/skills/${skill.id}`}
              className="marketing-media-link-card public-skill-card-link"
            >
              <article className="marketing-card ui-card--web skill-showcase-card clickable">
                <div className="skill-cover-wrap">
                  <img
                    src={skill.coverImage}
                    alt={skill.name}
                    className="skill-cover-image"
                    loading="lazy"
                  />
                </div>
                <h3>{skill.name}</h3>
                <p>{skill.description}</p>
              </article>
            </Link>
          ))
        ) : (
          <article className="marketing-card ui-card--web skill-showcase-card">
            <h3>{isZh ? '没有匹配到技能' : 'No matching skills'}</h3>
          </article>
        )}
      </section>
    </MarketingPageShell>
  );
}
