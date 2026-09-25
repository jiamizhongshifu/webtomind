import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { applySeo } from '../lib/seo';
import {
  BLOG_POSTS,
  USE_CASES,
  USE_CASE_TUTORIALS
} from '../data/marketing-content';
import {
  getPublicBlogPosts,
  type PublicBlogPost
} from '@/services/marketing-api';
import { imageFetchPriority } from '@/shared/ui';
import { shouldUseEnglishFallback } from '../lib/locale-content';
import { useMarketingLocale } from './MarketingPageShell';
import { CreateWorkspaceFrame } from '@/web/components/image-create/CreateWorkspaceFrame';
import '../styles/usecases-workspace.css';

type HubCard = {
  id: string;
  href: string;
  title: string;
  excerpt: string;
  category: string;
  date?: string;
  coverImage: string;
};

const MAX_VISIBLE_HUB_POSTS = 60;
// 有教程详情的 use-case 卡片统一进入详情页，而不是直接跳转创作台/灵感页。
const TUTORIAL_SLUGS = new Set(USE_CASE_TUTORIALS.map((item) => item.slug));

// 把过细的标签归并为大类，避免筛选栏标签过多。
const BROAD_CATEGORY_ZH: Record<string, string> = {
  精选: '精选',
  反推: '教程',
  参考图反推: '教程',
  图片转Prompt: '教程',
  '图片转 Prompt': '教程',
  AIprompt案例: '教程',
  'AI Prompt 案例': '教程',
  Prompt库: '教程',
  'Prompt 库': '教程',
  个人库: '教程',
  迭代: '教程',
  历史重编: '教程',
  历史重编辑: '教程',
  素材库: '教程',
  学习: '教程',
  学习与研究: '教程',
  写作: '教程',
  功能解读: '教程',
  方法论: '教程',
  高级技巧: '教程',
  积分预算: '教程',
  创作效率: '教程',
  素材管理: '教程',
  图片: '创作场景',
  配图: '创作场景',
  创作: '创作场景',
  商品摄影Prompt: '创作场景',
  '商品摄影 Prompt': '创作场景',
  电商图: '创作场景',
  商品图: '创作场景',
  小红书: '创作场景',
  小红书封面: '创作场景',
  AI写真: '创作场景',
  'AI 写真': '创作场景',
  AI封面: '创作场景',
  'AI 封面': '创作场景',
  角色一致性: '创作场景',
  GPTImage2: '模型',
  'GPT Image 2': '模型',
  'mona-lisa-1': '模型',
  热点研究: '趋势与运营',
  AI支付趋势: '趋势与运营',
  'AI 支付趋势': '趋势与运营',
  拼豆图纸: '工具',
  拼豆入门: '工具',
  拼豆技巧: '工具',
  拼豆色号: '工具',
  拼豆打印: '工具',
  拼豆选材: '工具'
};

const BROAD_CATEGORY_EN: Record<string, string> = {
  Featured: 'Featured',
  'Reverse Engineering': 'Tutorials',
  'Reference Reverse': 'Tutorials',
  'Image to Prompt': 'Tutorials',
  'AI Prompt Examples': 'Tutorials',
  'Prompt Library': 'Tutorials',
  'Personal Library': 'Tutorials',
  Iteration: 'Tutorials',
  'History Re-Edit': 'Tutorials',
  'Asset Library': 'Tutorials',
  Learning: 'Tutorials',
  'Learning & Research': 'Tutorials',
  Writing: 'Tutorials',
  'Feature Deep-dive': 'Tutorials',
  Method: 'Tutorials',
  'Power User': 'Tutorials',
  'Credit Budget': 'Tutorials',
  Image: 'Creation',
  'Cover Design': 'Creation',
  Creation: 'Creation',
  'Product Prompts': 'Creation',
  'Product Images': 'Creation',
  'RED / Xiaohongshu': 'Creation',
  'RED Cover': 'Creation',
  'Xiaohongshu Covers': 'Creation',
  'AI Portrait': 'Creation',
  'AI Portraits': 'Creation',
  'AI Cover Design': 'Creation',
  'Character Consistency': 'Creation',
  'GPT Image 2': 'Models',
  'mona-lisa-1': 'Models',
  'Trend Research': 'Trends',
  'AI Payments': 'Trends',
  'Bead Pattern': 'Tools',
  'Bead Beginner': 'Tools',
  'Bead Technique': 'Tools',
  'Bead Color Codes': 'Tools',
  'Bead Printing': 'Tools',
  'Bead Sizing': 'Tools'
};

function toBroadCategory(label: string, isZh: boolean): string {
  const map = isZh ? BROAD_CATEGORY_ZH : BROAD_CATEGORY_EN;
  return map[label] || label;
}

function localizeHubHref(href: string, locale: 'zh-CN' | 'en-US'): string {
  if (href.startsWith('/use-cases/')) {
    return `/${locale}/blog/${href.slice('/use-cases/'.length)}`;
  }
  if (href === '/use-cases') return `/${locale}/blog`;
  if (href.startsWith('/blog/') || href === '/blog') return `/${locale}${href}`;
  return href;
}

export function UseCasesPage() {
  const { locale, isZh } = useMarketingLocale();
  const [posts, setPosts] = useState<PublicBlogPost[] | null>(null);
  const [isFallback, setIsFallback] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  const [categoryExpanded, setCategoryExpanded] = useState(false);
  const [categoryOverflow, setCategoryOverflow] = useState(false);
  const categoryRowRef = useRef<HTMLDivElement>(null);

  const shouldFallbackToLocal =
    isFallback ||
    (posts !== null &&
      shouldUseEnglishFallback(
        locale,
        posts,
        (post) => `${post.title} ${post.excerpt} ${post.tag}`
      ));
  const remotePosts = !shouldFallbackToLocal ? posts : null;

  const useCaseCards = useMemo<HubCard[]>(
    () =>
      USE_CASES.map((item) => ({
        id: item.id,
        href: localizeHubHref(
          TUTORIAL_SLUGS.has(item.slug) ? `/blog/${item.slug}` : item.href,
          locale
        ),
        title: isZh ? item.title.zh : item.title.en,
        excerpt: isZh ? item.summary.zh : item.summary.en,
        category: toBroadCategory(
          isZh ? item.category.zh : item.category.en,
          isZh
        ),
        coverImage: item.coverImage
      })),
    [isZh, locale]
  );

  const blogCards = useMemo<HubCard[]>(() => {
    const localCards = BLOG_POSTS.map((post) => ({
      id: post.id,
      href: `/${locale}/blog/${post.slug}`,
      title: isZh ? post.title.zh : post.title.en,
      excerpt: isZh ? post.excerpt.zh : post.excerpt.en,
      category: toBroadCategory(isZh ? post.tag.zh : post.tag.en, isZh),
      date: post.date,
      coverImage: post.coverImage
    }));
    const remoteCards = (remotePosts || [])
      .filter((post) => !localCards.some((card) => card.id === post.id))
      .map((post) => ({
        id: post.id,
        href: `/${locale}/blog/${post.slug}`,
        title: post.title,
        excerpt: post.excerpt,
        category: toBroadCategory(post.tag, isZh),
        date: post.published_at.slice(0, 10),
        coverImage: post.cover_image || localCards[0]?.coverImage || ''
      }));
    return [...localCards, ...remoteCards].sort((a, b) =>
      (b.date || '').localeCompare(a.date || '')
    );
  }, [isZh, locale, remotePosts]);

  const categories = useMemo(() => {
    const labels = [
      ...useCaseCards.map((item) => item.category),
      ...blogCards.map((item) => item.category)
    ];
    return Array.from(new Set(labels));
  }, [blogCards, useCaseCards]);

  const filteredCards = useMemo(() => {
    const all = [...useCaseCards, ...blogCards];
    if (activeCategory === 'all') return all;
    return all.filter((item) => item.category === activeCategory);
  }, [activeCategory, blogCards, useCaseCards]);

  useEffect(() => {
    const canonical = `${window.location.origin}/${locale}/blog`;
    const zhHref = `${window.location.origin}/zh-CN/blog`;
    const enHref = `${window.location.origin}/en-US/blog`;
    const allItems = [
      ...USE_CASES.map((item) => ({
        slug: item.slug,
        title: isZh ? item.title.zh : item.title.en,
        href: localizeHubHref(item.href, locale)
      })),
      ...blogCards.map((card) => ({
        slug: card.id,
        title: card.title,
        href: card.href
      }))
    ];
    return applySeo({
      title: isZh ? 'WebToMind 博客' : 'WebToMind Blog',
      description: isZh
        ? 'WebToMind 博客聚合 AI 图片生成教程、热门关键词指南与可复现 Prompt 工作流，覆盖 AI 写真、商品图、小红书封面、角色一致性和 Agent 时代创作方法。'
        : 'The WebToMind blog covers AI image tutorials, hot-keyword guides and reproducible prompt workflows for portraits, product visuals, social covers and character consistency.',
      canonical,
      ogImage: useCaseCards[0]?.coverImage,
      alternates: [
        { hreflang: 'zh-CN', href: zhHref },
        { hreflang: 'en-US', href: enHref },
        { hreflang: 'x-default', href: isZh ? zhHref : enHref }
      ],
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'Blog',
          name: isZh ? 'WebToMind 博客' : 'WebToMind Blog',
          url: canonical
        },
        {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          itemListElement: allItems.map((item, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            url: `${window.location.origin}${item.href}`,
            name: item.title
          }))
        }
      ]
    });
  }, [blogCards, isZh, locale, useCaseCards]);

  useEffect(() => {
    let active = true;
    setIsLoaded(false);
    getPublicBlogPosts(locale, MAX_VISIBLE_HUB_POSTS)
      .then((data) => {
        if (active) {
          setPosts(data);
          setIsFallback(false);
          setIsLoaded(true);
        }
      })
      .catch((error) => {
        console.warn(
          '[UseCasesPage] Failed to fetch public blog posts, fallback to local content:',
          error
        );
        if (active) {
          setIsFallback(true);
          setIsLoaded(true);
        }
      });

    return () => {
      active = false;
    };
  }, [locale]);

  // 收起状态下标签最多展示两行；测量真实高度判断是否需要展开按钮。
  useLayoutEffect(() => {
    const row = categoryRowRef.current;
    if (!row) return;
    const measure = () => {
      const overflows = row.scrollHeight > row.clientHeight + 2;
      setCategoryOverflow(overflows);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [categories, categoryExpanded]);

  return (
    <CreateWorkspaceFrame className="usecases-route">
      <div className="usecases-workspace-main">
        <header className="usecases-workspace-header">
          <p className="usecases-workspace-eyebrow">
            {isZh ? '博客与教程' : 'Blog & tutorials'}
          </p>
          <h1>{isZh ? '博客' : 'Blog'}</h1>
          <p>
            {isZh
              ? 'AI 图片生成教程、热门关键词指南与可复现 Prompt 工作流。'
              : 'AI image tutorials, hot-keyword guides and reproducible prompt workflows.'}
          </p>
        </header>

        <div className="use-cases-category-wrap">
          <div
            ref={categoryRowRef}
            className={`use-cases-category-row${categoryExpanded ? '' : ' collapsed'}`}
            role="tablist"
            aria-label={isZh ? '按分类筛选' : 'Filter by category'}
          >
            <button
              type="button"
              className={`marketing-category-pill ${activeCategory === 'all' ? 'active' : ''}`}
              aria-pressed={activeCategory === 'all'}
              onClick={() => setActiveCategory('all')}
            >
              {isZh ? '全部' : 'All'}
            </button>
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                className={`marketing-category-pill ${activeCategory === category ? 'active' : ''}`}
                aria-pressed={activeCategory === category}
                onClick={() => setActiveCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>
          {(categoryOverflow || categoryExpanded) && (
            <button
              type="button"
              className="use-cases-category-toggle"
              aria-expanded={categoryExpanded}
              onClick={() => setCategoryExpanded((current) => !current)}
            >
              <span>
                {categoryExpanded
                  ? isZh
                    ? '收起'
                    : 'Collapse'
                  : isZh
                    ? `展开全部 ${categories.length}`
                    : `Show all ${categories.length}`}
              </span>
              {categoryExpanded ? (
                <ChevronUp size={15} aria-hidden="true" />
              ) : (
                <ChevronDown size={15} aria-hidden="true" />
              )}
            </button>
          )}
        </div>

        {isFallback && isLoaded && (
          <div className="marketing-source-notice">
            {isZh
              ? '当前展示的是本地备用内容（线上内容服务暂不可用）。'
              : 'Showing local fallback content because live data is unavailable.'}
          </div>
        )}

        {!isLoaded ? (
          <section className="usecases-grid" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={`blog-skeleton-${index}`}
                className="usecases-card loading"
              >
                <div className="usecases-card-media skeleton-block" />
                <div className="usecases-card-copy">
                  <div className="skeleton-line" />
                  <div className="skeleton-line medium" />
                  <div className="skeleton-line short" />
                </div>
              </div>
            ))}
          </section>
        ) : (
          <section
            className="usecases-grid"
            aria-label={isZh ? '博客与教程列表' : 'Blog and tutorial list'}
          >
            {filteredCards.map((card, index) => (
              <Link key={card.id} to={card.href} className="usecases-card">
                <div className="usecases-card-media">
                  <img
                    src={card.coverImage}
                    alt={card.title}
                    loading={index === 0 ? 'eager' : 'lazy'}
                    decoding="async"
                    {...imageFetchPriority(index === 0 ? 'high' : 'auto')}
                  />
                  <span className="usecases-card-category">
                    {card.category}
                  </span>
                </div>
                <div className="usecases-card-copy">
                  <h2>{card.title}</h2>
                  <p>{card.excerpt}</p>
                  <footer>
                    {card.date ? (
                      <span className="blog-date">{card.date}</span>
                    ) : null}
                    <span className="usecases-card-action">
                      {isZh ? '阅读 →' : 'Read →'}
                    </span>
                  </footer>
                </div>
              </Link>
            ))}
          </section>
        )}
      </div>
    </CreateWorkspaceFrame>
  );
}
