import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, SearchField } from '@/shared/ui';
import {
  listSkillCatalog,
  type SkillCatalogItem,
  type SkillCatalogSort,
  type SkillOutputType,
  type SkillTier
} from '@/services/skill-catalog-api';
import { applySeo } from '../lib/seo';
import { MarketingPageShell, useMarketingLocale } from './MarketingPageShell';
import {
  OUTPUT_TYPES,
  SkillCard,
  SkillGridSkeleton,
  outputLabel
} from './skill-catalog/skillCatalogShared';
import '../styles/skill-catalog.css';

const SORTS: Array<{ value: SkillCatalogSort; zh: string; en: string }> = [
  { value: 'featured', zh: '精选', en: 'Featured' },
  { value: 'trending', zh: '趋势', en: 'Trending' },
  { value: 'newest', zh: '最新', en: 'Newest' }
];

function readEnum<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

export function SkillCatalogPage() {
  const { locale, isZh } = useMarketingLocale();
  const [params, setParams] = useSearchParams();
  const outputType = readEnum<SkillOutputType>(params.get('type'), OUTPUT_TYPES);
  const tier = readEnum<SkillTier>(params.get('tier'), ['free', 'premium']);
  const sort =
    readEnum<SkillCatalogSort>(params.get('sort'), ['featured', 'trending', 'newest']) ||
    'featured';
  const query = params.get('q') || '';
  const [draft, setDraft] = useState(query);
  const [state, setState] = useState<{
    status: 'loading' | 'ready' | 'error';
    items: SkillCatalogItem[];
    total: number;
  }>({ status: 'loading', items: [], total: 0 });
  const [reloadKey, setReloadKey] = useState(0);

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  useEffect(() => setDraft(query), [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (draft.trim() !== query) update('q', draft.trim() || null);
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  useEffect(() => {
    const controller = new AbortController();
    setState((prev) => ({ ...prev, status: 'loading' }));
    listSkillCatalog({ q: query, outputType, tier, sort, limit: 48 }, controller.signal)
      .then((result) =>
        setState({ status: 'ready', items: result.items, total: result.total })
      )
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({ status: 'error', items: [], total: 0 });
      });
    return () => controller.abort();
  }, [query, outputType, tier, sort, reloadKey]);

  useEffect(() => {
    const canonical = `${window.location.origin}/${locale}/skills`;
    const zhHref = `${window.location.origin}/zh-CN/skills`;
    const enHref = `${window.location.origin}/en-US/skills`;
    return applySeo({
      title: isZh
        ? 'Agent Skills 目录：商业视觉 Skill | WebToMind'
        : 'Agent Skills for commercial visuals | WebToMind',
      description: isZh
        ? '为 Claude Code、Codex、Cursor、Trae 等 Agent 安装封面、海报、幻灯片、落地页和短视频 Skill，一条命令装好，直接产出成品。'
        : 'Install Skills for covers, posters, decks, landing pages and short videos into Claude Code, Codex, Cursor and more. One command, finished results.',
      canonical,
      alternates: [
        { hreflang: 'zh-CN', href: zhHref },
        { hreflang: 'en-US', href: enHref },
        { hreflang: 'x-default', href: enHref }
      ]
    });
  }, [isZh, locale]);

  const filterLabel = isZh ? '产出类型' : 'Output type';

  return (
    <MarketingPageShell
      rootClassName="skill-catalog-root"
      title={isZh ? 'Skill 目录' : 'Skill library'}
      subtitle={
        isZh
          ? '每个 Skill 都由 WebToMind 设计、测试和维护，装进你的 Agent 就能产出可交付的成品。'
          : 'Every Skill is designed, tested and maintained by WebToMind. Install it into your agent and get a finished result.'
      }
    >
      <section className="skill-catalog-toolbar" aria-label={isZh ? '筛选 Skill' : 'Filter Skills'}>
        <SearchField
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onClear={() => setDraft('')}
          clearLabel={isZh ? '清除搜索' : 'Clear search'}
          placeholder={isZh ? '想做什么？如：小红书封面' : 'What to make? e.g. OG image'}
          aria-label={isZh ? '搜索 Skill' : 'Search Skills'}
          wrapperClassName="skill-catalog-search"
        />
        <div className="skill-filter-row">
          <div className="skill-pill-group" role="group" aria-label={filterLabel}>
            <button
              type="button"
              className="skill-pill"
              aria-pressed={!outputType}
              onClick={() => update('type', null)}
            >
              {isZh ? '全部' : 'All'}
            </button>
            {OUTPUT_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                className="skill-pill"
                aria-pressed={outputType === type}
                onClick={() => update('type', outputType === type ? null : type)}
              >
                {outputLabel(type, isZh)}
              </button>
            ))}
          </div>
          <div className="skill-pill-group" role="group" aria-label={isZh ? '档位' : 'Tier'}>
            {(['free', 'premium'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className="skill-pill"
                aria-pressed={tier === value}
                onClick={() => update('tier', tier === value ? null : value)}
              >
                {value === 'free' ? (isZh ? '免费' : 'Free') : 'Pro'}
              </button>
            ))}
          </div>
          <label className="skill-sort">
            <span>{isZh ? '排序' : 'Sort'}</span>
            <select
              value={sort}
              onChange={(event) =>
                update('sort', event.target.value === 'featured' ? null : event.target.value)
              }
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {isZh ? option.zh : option.en}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <p className="skill-catalog-count" aria-live="polite">
        {state.status === 'ready'
          ? isZh
            ? `共 ${state.total} 个 Skill`
            : `${state.total} Skills`
          : ''}
      </p>

      {state.status === 'loading' ? (
        <SkillGridSkeleton />
      ) : state.status === 'error' ? (
        <div className="skill-empty">
          <h2>{isZh ? 'Skill 目录暂时无法加载' : 'The Skill library could not load'}</h2>
          <Button variant="secondary" onClick={() => setReloadKey((key) => key + 1)}>
            {isZh ? '重试' : 'Try again'}
          </Button>
        </div>
      ) : state.items.length === 0 ? (
        <div className="skill-empty">
          <h2>{isZh ? '没有找到匹配的 Skill' : 'No matching Skills'}</h2>
          <p>
            {isZh
              ? '换个说法试试，或清除筛选条件。'
              : 'Try different words or clear the filters.'}
          </p>
          <Button variant="secondary" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
            {isZh ? '清除筛选' : 'Clear filters'}
          </Button>
        </div>
      ) : (
        <div className="skill-grid">
          {state.items.map((skill, index) => (
            <SkillCard key={skill.slug} skill={skill} locale={locale} isZh={isZh} eager={index < 4} />
          ))}
        </div>
      )}
    </MarketingPageShell>
  );
}

export default SkillCatalogPage;
