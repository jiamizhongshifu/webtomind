import { replaceSeoTag } from './seo-render-utils.js';
import {
  SEO_BLOG_POSTS,
  SEO_PRICING_CONTENT,
  SEO_UPDATES,
  SEO_USE_CASES
} from './seo-content.js';
import { toPublicSeoBlogPost } from '../src/shared/seo-blog-public-post.js';
import {
  PROMPT_SEO_ALIASES,
  PROMPT_SEO_PAGES,
  getPromptSeoPage,
  type PromptSeoAlias,
  type PromptSeoPage,
  type PromptSeoPageType
} from '../src/shared/prompt-seo-content.js';
import {
  PROMPT_STYLE_GRID_CANONICAL_PATH,
  getPromptStyleGridSeoCopy,
  getPromptStyleGridTemplateSeoCopy,
  getPromptStyleGridTemplateSeoFromPath,
  isPromptStyleGridPath
} from '../src/shared/prompt-style-grid-seo.js';
import {
  getPromptSeoPublicCases,
  type PromptSeoPublicCase
} from '../src/shared/prompt-seo-match.js';
import {
  getOptimizedPromptCaseImageUrl,
  getPromptCaseResponsiveImageSet,
  PROMPT_LIBRARY_CARD_IMAGE_SIZES,
  PROMPT_LIBRARY_CARD_IMAGE_WIDTHS
} from '../src/shared/prompt-case-image.js';
import { SREF_EXTERNAL_REFERENCES } from '../src/shared/sref-external-references.js';
import {
  getLocalizedSeoPath,
  getSeoAlternatePaths
} from '../src/shared/seo-route-paths.js';
import { hasVideoPromptHubPublishingThreshold } from '../src/shared/prompt-seo-quality.js';
import { buildSeoBlogCta } from '../src/shared/seo-blog-cta.js';

const SITE_URL = 'https://webtomind.com';
const FALLBACK_IMAGE = `${SITE_URL}/icons/logo-icon.svg`;

// Google truncates titles around 60 characters. When the base title is already
// long, drop the brand suffix instead of pushing the visible title past the
// useful range.
function withSeoTitleSuffix(title: string, suffix: string): string {
  return [...title].length >= 50 ? title : `${title}${suffix}`;
}

type Locale = 'zh-CN' | 'en-US';

type SeoAlternate = {
  hreflang: string;
  href: string;
};

type SeoPageConfig = {
  title: string;
  description: string;
  canonical: string;
  locale: Locale;
  robots?: string;
  ogImage?: string;
  ogType?: string;
  alternates?: SeoAlternate[];
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
};

export type SeoPageRenderResult = {
  html: string;
  status: number;
};

export type SeoPageRenderOptions = {
  promptLibraryBootstrap?: Record<string, unknown> | null;
  pathname?: string;
};

type PromptSeoBodyLink = {
  title: string;
  description: string;
  href: string;
};

type PromptSeoBodyCase = {
  title: string;
  href: string;
  summary: string;
  meta: string[];
};

type PromptSeoBodySection = {
  title: string;
  body?: string;
  items: string[];
};

type PromptSeoBodyContent = {
  locale: Locale;
  title: string;
  description: string;
  badge?: string;
  intent?: string;
  keywords: string[];
  workflow: string[];
  examples: string[];
  cases: PromptSeoBodyCase[];
  sections: PromptSeoBodySection[];
  faq: Array<{ question: string; answer: string }>;
  links: PromptSeoBodyLink[];
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJsonForHtml(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function normalizePath(rawPath: string): string {
  const pathOnly = rawPath.split(/[?#]/, 1)[0] || '/';
  const withSlash = pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
  return withSlash.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
}

function getLocaleFromPath(pathname: string): Locale {
  return pathname.startsWith('/en-US') ? 'en-US' : 'zh-CN';
}

function stripLocale(pathname: string): string {
  return pathname.replace(/^\/(?:zh-CN|en-US)(?=\/|$)/, '') || '/';
}

function getPromptStyleGridLocale(pathname: string): Locale {
  return pathname.startsWith('/zh-CN') ? 'zh-CN' : 'en-US';
}

function localizedText(
  value: { zh: string; en: string },
  locale: Locale
): string {
  return locale === 'en-US' ? value.en : value.zh;
}

function getLocalizedPath(locale: Locale, pathWithoutLocale: string): string {
  return getLocalizedSeoPath(locale, pathWithoutLocale);
}

function getAlternates(pathWithoutLocale: string): SeoAlternate[] {
  return getSeoAlternatePaths(pathWithoutLocale).map((alternate) => ({
    hreflang: alternate.hreflang,
    href: `${SITE_URL}${alternate.path}`
  }));
}

function absoluteImageUrl(imageUrl: string | undefined): string {
  if (!imageUrl) return FALLBACK_IMAGE;
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }
  if (imageUrl.startsWith('data:')) return FALLBACK_IMAGE;
  return `${SITE_URL}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
}

function replaceTag(
  html: string,
  pattern: RegExp,
  replacement: string
): string {
  return replaceSeoTag(html, pattern, replacement);
}

function removeExistingJsonLd(html: string): string {
  return html.replace(
    /\s*<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi,
    ''
  );
}

function getBaseJsonLd(locale: Locale): Array<Record<string, unknown>> {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'WebToMind',
      url: SITE_URL,
      logo: FALLBACK_IMAGE
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'WebToMind',
      url: SITE_URL,
      inLanguage: locale
    }
  ];
}

function buildHomeSeo(locale: Locale, canonicalPath: string): SeoPageConfig {
  const isEnglish = locale === 'en-US';
  const canonical = `${SITE_URL}${canonicalPath}`;
  const title = isEnglish
    ? 'WebToMind - Reproducible AI Image Creation Workflow'
    : 'WebToMind - 可复现的 AI 图片创作工作流';
  const description = isEnglish
    ? 'Reverse prompts from reference images, compose visual slots, generate AI images, and re-edit history in one reproducible WebToMind workflow.'
    : 'WebToMind 专注 AI 图片创作：支持参考图反推提示词、视觉 slot 组合、多模型出图与历史重编辑，让每张图都可复现、可迭代。';

  return {
    title,
    description,
    canonical,
    locale,
    ogImage: FALLBACK_IMAGE,
    alternates: getAlternates('/overview'),
    jsonLd: [
      ...getBaseJsonLd(locale),
      {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'WebToMind',
        applicationCategory: 'DesignApplication',
        operatingSystem: 'Web, Chrome Extension',
        url: SITE_URL,
        description,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD'
        }
      }
    ]
  };
}

function buildCreateSeo(locale: Locale, pathname: string): SeoPageConfig {
  const isPrompts =
    stripLocale(pathname) === '/create/prompts' ||
    stripLocale(pathname) === '/prompts';
  const isEnglish = locale === 'en-US';
  const canonicalPath = getLocalizedPath(
    locale,
    isPrompts ? '/prompts' : '/create'
  );
  const title = isPrompts
    ? isEnglish
      ? 'AI Image Prompt Library and Examples | WebToMind'
      : 'AI 图片 Prompt 案例库与提示词生成器 | WebToMind'
    : isEnglish
      ? 'AI Image Prompt Generator and Creation Studio | WebToMind'
      : 'AI 图片提示词生成器与创作台 | WebToMind';
  const description = isPrompts
    ? isEnglish
      ? 'Browse reusable AI image prompt examples, model settings, preview images, and open any case in the WebToMind image studio.'
      : '浏览可复用 AI 图片 Prompt 案例、模型参数和预览图，并一键带入 WebToMind 图片创作台继续生成。'
    : isEnglish
      ? 'Create reproducible AI images with reference-to-prompt reverse engineering, visual slot composition, model settings, and history re-editing.'
      : '通过参考图反推、视觉 slot 组合、模型参数和历史重编辑，生成可复现的 AI 图片。';

  return {
    title,
    description,
    canonical: `${SITE_URL}${canonicalPath}`,
    locale,
    ogImage: FALLBACK_IMAGE,
    alternates: getAlternates(isPrompts ? '/prompts' : '/create'),
    jsonLd: [
      ...getBaseJsonLd(locale),
      {
        '@context': 'https://schema.org',
        '@type': isPrompts ? 'CollectionPage' : 'SoftwareApplication',
        name: title,
        description,
        url: `${SITE_URL}${canonicalPath}`,
        inLanguage: locale
      }
    ]
  };
}

function getPromptSeoPath(type: PromptSeoPageType, slug: string): string {
  return `/prompts/${type}/${slug}`;
}

function getPromptSeoHref(locale: Locale, page: PromptSeoPage): string {
  return getLocalizedPath(locale, getPromptSeoPath(page.type, page.slug));
}

function getLocalizedKeywords(
  keywords: { zh: string[]; en: string[] } | undefined,
  locale: Locale
): string[] {
  if (!keywords) return [];
  return locale === 'en-US' ? keywords.en : keywords.zh;
}

function getLocalizedList(
  items: Array<{ zh: string; en: string }> | undefined,
  locale: Locale
): string[] {
  return (items || []).map((item) => localizedText(item, locale));
}

function getPromptSeoLinks(
  locale: Locale,
  currentPage?: PromptSeoPage
): PromptSeoBodyLink[] {
  const currentPath = currentPage
    ? getPromptSeoPath(currentPage.type, currentPage.slug)
    : '';
  const pages = PROMPT_SEO_PAGES.filter(
    (page) => getPromptSeoPath(page.type, page.slug) !== currentPath
  );
  const prioritized = currentPage
    ? [
        ...pages.filter((page) => page.type === currentPage.type),
        ...pages.filter((page) => page.type !== currentPage.type)
      ]
    : pages;

  const directLinks = (currentPage?.relatedLinks || []).map((link) => ({
    title: localizedText(link.title, locale),
    description: localizedText(link.description, locale),
    href: getLocalizedPath(locale, link.path)
  }));
  const topicLinks = prioritized.map((page) => ({
    title: localizedText(page.title, locale),
    description: localizedText(page.description, locale),
    href: getPromptSeoHref(locale, page)
  }));

  return [...directLinks, ...topicLinks].slice(0, 12);
}

function getPromptCaseHref(
  locale: Locale,
  caseItem: PromptSeoPublicCase
): string {
  return getLocalizedPath(locale, `/prompts/${caseItem.slug}`);
}

function getPromptSeoCases(
  locale: Locale,
  target: { type: PromptSeoPageType; slug: string } | undefined
): PromptSeoBodyCase[] {
  if (!target) return [];
  return getPromptSeoPublicCases({
    kind: target.type,
    slug: target.slug,
    locale,
    limit: 4
  }).map((caseItem) => ({
    title: caseItem.title,
    href: getPromptCaseHref(locale, caseItem),
    summary:
      caseItem.promptPreview ||
      caseItem.commercialIntent ||
      [caseItem.model, caseItem.category].filter(Boolean).join(' prompt case'),
    meta: [
      caseItem.model,
      caseItem.category,
      caseItem.packageSlug,
      ...(caseItem.tags || []).slice(0, 2)
    ].filter((item): item is string => Boolean(item))
  }));
}

function getPromptIndexBodyContent(locale: Locale): PromptSeoBodyContent {
  const isEnglish = locale === 'en-US';
  const modelPages = PROMPT_SEO_PAGES.filter((page) => page.type === 'model');
  const categoryPages = PROMPT_SEO_PAGES.filter(
    (page) => page.type === 'category'
  );
  const packagePages = PROMPT_SEO_PAGES.filter(
    (page) => page.type === 'package'
  );
  const keywordSet = new Set<string>();
  PROMPT_SEO_PAGES.forEach((page) => {
    getLocalizedKeywords(page.keywords, locale).forEach((keyword) =>
      keywordSet.add(keyword)
    );
  });

  return {
    locale,
    title: isEnglish
      ? 'Free AI Image Prompts Library'
      : '按模型和场景整理的 AI 图片 Prompt 案例',
    description: isEnglish
      ? 'WebToMind collects reusable AI image prompt cases for model-specific workflows, commercial image production, portrait prompts, product images, character consistency and reference-to-prompt work.'
      : 'WebToMind prompts 目录把可复用 AI 图片 Prompt 按模型、商业场景和创作任务拆开，方便搜索用户直接进入 GPT Image 2、Nano Banana、Flux、Seedream、商品图、人像写真、角色一致性和参考图反推等长尾页面。',
    badge: isEnglish ? 'Prompt index' : 'Prompt 目录',
    intent: isEnglish
      ? 'Use this index when you need copy-ready prompt structures, example summaries and the right topic page before opening the WebToMind image studio.'
      : '适合正在搜索 AI image prompts、AI 图片提示词案例、模型 prompt、商品图 prompt、写真 prompt 和可复制生图模板的用户。',
    keywords: [
      ...(isEnglish
        ? ['image prompt', 'AI image prompt examples', 'free AI prompts']
        : ['图片prompt', '图片 prompt 大全']),
      ...Array.from(keywordSet).slice(0, 18)
    ],
    workflow: isEnglish
      ? [
          'Choose a model or use case first, then open the matching topic page instead of starting from a blank prompt.',
          'Read the example summaries as reusable slots: subject, scene, lens, lighting, material, layout, constraints and output purpose.',
          'Copy a structure into WebToMind, generate candidates, then save the winning prompt, model settings and image history as a reusable case.'
        ]
      : [
          '先按模型或业务场景选择专题页，不从空白 prompt 开始写，避免只堆“高清、真实、高级感”。',
          '把案例摘要当作可复用 slot 阅读：主体、场景、镜头、光影、材质、版式、约束和输出用途都要分明。',
          '进入 WebToMind 后复制结构、生成候选图，再把成功 prompt、模型参数和历史版本保存成自己的可复用案例。'
        ],
    examples: PROMPT_SEO_PAGES.slice(0, 10).map((page) =>
      [
        localizedText(page.title, locale),
        localizedText(page.description, locale)
      ].join(' - ')
    ),
    cases: getPromptSeoCases(locale, {
      type: 'package',
      slug: 'ai-image-prompt-examples'
    }),
    sections: [
      {
        title: isEnglish ? 'Browse by model' : '按模型查找 Prompt',
        body: isEnglish
          ? 'Model pages help compare phrasing, settings and failure boundaries before you generate.'
          : '模型专题用于比较不同模型的提示词措辞、参数设置和失败边界，再决定从哪个工作流开始生成。',
        items: modelPages.map((page) =>
          [
            localizedText(page.title, locale),
            localizedText(page.intent, locale)
          ].join('：')
        )
      },
      {
        title: isEnglish ? 'Browse by use case' : '按商业场景查找 Prompt',
        body: isEnglish
          ? 'Use-case pages focus on the image job to be done, such as products, portraits, covers and characters.'
          : '场景专题更关注图片要完成的业务任务，例如商品主图、AI 写真、小红书封面、角色一致性和营销创意。',
        items: categoryPages.map((page) =>
          [
            localizedText(page.title, locale),
            localizedText(page.description, locale)
          ].join('：')
        )
      },
      {
        title: isEnglish ? 'Reusable prompt packages' : '可复用案例包',
        body: isEnglish
          ? 'Package pages group repeatable prompt templates and reference workflows for faster production.'
          : '案例包页面把高复用的提示词模板和参考图工作流集中起来，适合批量生产和团队沉淀。',
        items: packagePages
          .slice(0, 8)
          .map((page) =>
            [
              localizedText(page.title, locale),
              localizedText(page.description, locale)
            ].join('：')
          )
      }
    ],
    faq: isEnglish
      ? [
          {
            question: 'How should I choose an AI image prompt page?',
            answer:
              'Start with the model page when model behavior matters, and start with the use-case page when the output job matters more than the model.'
          },
          {
            question: 'Are these prompts only text snippets?',
            answer:
              'No. WebToMind treats prompts as reusable cases with model settings, ratios, reference context and editable generation history.'
          },
          {
            question: 'What is an image prompt?',
            answer:
              'An image prompt is the structured text that describes the image you want: subject, scene, lens, lighting, material, style, layout and constraints. WebToMind keeps the prompt together with model settings so results are repeatable.'
          },
          {
            question: 'How do I write a good image prompt?',
            answer:
              'Start from the output job, then fill reusable slots: subject, scene, composition, lens, lighting, material, style and constraints. Replace one variable at a time and keep model-specific keywords so results stay under control.'
          },
          {
            question: 'Where can I find free AI image prompt examples?',
            answer:
              'The prompt library lists real, reusable cases by model and use case, and the AI Image Prompt Examples guide breaks copy-ready examples into subject, scene, lens, lighting and constraints slots.'
          }
        ]
      : [
          {
            question: '应该先看模型页还是场景页？',
            answer:
              '如果你在比较 GPT Image 2、Nano Banana、Flux、Seedream 等模型，就先看模型页；如果目标是商品图、写真、角色图或封面，就先看场景页。'
          },
          {
            question: '这些 Prompt 只是文本片段吗？',
            answer:
              '不是。WebToMind 更强调可复现案例：prompt、模型、尺寸、质量、参考图语境和生成历史要一起保存，后续才能稳定迭代。'
          },
          {
            question: '图片 prompt 怎么写？',
            answer:
              '先定主体和输出用途，再写场景、镜头、光影、材质、风格、版式和约束；把关键词拆成可替换的结构，而不是堆叠“高清、真实、高级感”。案例页里的每条 prompt 都可以作为这种结构的参考。'
          }
        ],
    links: [
      {
        title: isEnglish
          ? 'AI image prompt examples guide'
          : 'AI 图片提示词案例指南',
        description: isEnglish
          ? 'Copy-ready AI image prompt and picture prompt examples broken into reusable slots.'
          : '把 AI image prompt examples 拆成可复用的主体、场景、镜头、光影、材质与约束结构。',
        href: getLocalizedPath(locale, '/blog/ai-image-prompt-examples-guide')
      },
      ...getPromptSeoLinks(locale)
    ]
  };
}

function getPromptTopicBodyContent(
  locale: Locale,
  page: PromptSeoPage
): PromptSeoBodyContent {
  return {
    locale,
    title: localizedText(page.title, locale),
    description: localizedText(page.description, locale),
    badge: localizedText(page.badge, locale),
    intent: localizedText(page.intent, locale),
    keywords: getLocalizedKeywords(page.keywords, locale),
    workflow: getLocalizedList(page.workflow, locale),
    examples: getLocalizedList(page.examples, locale),
    cases: getPromptSeoCases(locale, page),
    sections: (page.sections || []).map((section) => ({
      title: localizedText(section.title, locale),
      body: section.body ? localizedText(section.body, locale) : undefined,
      items: getLocalizedList(section.items, locale)
    })),
    faq: page.faq.map((item) => ({
      question: localizedText(item.question, locale),
      answer: localizedText(item.answer, locale)
    })),
    links: getPromptSeoLinks(locale, page)
  };
}

function getPromptAliasBodyContent(
  locale: Locale,
  alias: PromptSeoAlias
): PromptSeoBodyContent {
  const targetPage = alias.target
    ? getPromptSeoPage(alias.target.type, alias.target.slug)
    : undefined;
  const fallback = targetPage
    ? getPromptTopicBodyContent(locale, targetPage)
    : getPromptIndexBodyContent(locale);

  return {
    locale,
    title: localizedText(alias.title, locale),
    description: localizedText(alias.description, locale),
    badge: alias.badge ? localizedText(alias.badge, locale) : fallback.badge,
    intent: alias.intent
      ? localizedText(alias.intent, locale)
      : fallback.intent,
    keywords:
      alias.keywords || targetPage?.keywords
        ? getLocalizedKeywords(alias.keywords || targetPage?.keywords, locale)
        : fallback.keywords,
    workflow:
      alias.workflow || targetPage?.workflow
        ? getLocalizedList(alias.workflow || targetPage?.workflow, locale)
        : fallback.workflow,
    examples:
      alias.examples || targetPage?.examples
        ? getLocalizedList(alias.examples || targetPage?.examples, locale)
        : fallback.examples,
    cases:
      getPromptSeoCases(locale, alias.caseTarget || alias.target) ||
      fallback.cases,
    sections:
      alias.sections || targetPage?.sections
        ? (alias.sections || targetPage?.sections || []).map((section) => ({
            title: localizedText(section.title, locale),
            body: section.body
              ? localizedText(section.body, locale)
              : undefined,
            items: getLocalizedList(section.items, locale)
          }))
        : fallback.sections,
    faq:
      alias.faq || targetPage?.faq
        ? (alias.faq || targetPage?.faq || []).map((item) => ({
            question: localizedText(item.question, locale),
            answer: localizedText(item.answer, locale)
          }))
        : fallback.faq,
    links: [
      ...(alias.relatedLinks || []).map((link) => ({
        title: localizedText(link.title, locale),
        description: localizedText(link.description, locale),
        href: getLocalizedPath(locale, link.path)
      })),
      ...(targetPage ? getPromptSeoLinks(locale, targetPage) : fallback.links)
    ].slice(0, 12)
  };
}

function buildPromptSeo(
  locale: Locale,
  pathname: string
): SeoPageConfig | null {
  const pathWithoutLocale = stripLocale(pathname);
  const match = pathWithoutLocale.match(
    /^\/prompts\/(category|model|package)\/([^/]+)$/
  );
  if (!match) return null;

  const type = match[1] as PromptSeoPageType;
  const slug = match[2];
  const page = getPromptSeoPage(type, slug);
  if (!page) return null;

  const title = `${localizedText(page.title, locale)} | WebToMind`;
  const description = localizedText(page.description, locale);
  const promptPath = getPromptSeoPath(type, slug);
  const canonicalPath = getLocalizedPath(locale, promptPath);
  const faqJsonLd =
    page.faq.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: page.faq.map((item) => ({
            '@type': 'Question',
            name: localizedText(item.question, locale),
            acceptedAnswer: {
              '@type': 'Answer',
              text: localizedText(item.answer, locale)
            }
          }))
        }
      : null;
  const itemListSource = [
    ...getPromptSeoPublicCases({
      kind: page.type,
      slug: page.slug,
      locale,
      limit: 6
    }).map((caseItem) => ({
      name: caseItem.title,
      url: `${SITE_URL}${getPromptCaseHref(locale, caseItem)}`
    })),
    ...page.examples,
    ...(page.sections || []).map((section) => section.title),
    ...(page.type === 'category' && page.slug === 'sref-prompts'
      ? SREF_EXTERNAL_REFERENCES.map((item) => ({
          zh: `${item.title} --sref ${item.code}`,
          en: `${item.title} --sref ${item.code}`
        }))
      : [])
  ];

  return {
    title,
    description,
    canonical: `${SITE_URL}${canonicalPath}`,
    locale,
    ogImage: FALLBACK_IMAGE,
    alternates: getAlternates(promptPath),
    jsonLd: [
      ...getBaseJsonLd(locale),
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: localizedText(page.title, locale),
        description,
        url: `${SITE_URL}${canonicalPath}`,
        inLanguage: locale,
        about: (locale === 'en-US' ? page.keywords.en : page.keywords.zh).join(
          ', '
        ),
        isPartOf: {
          '@type': 'WebSite',
          name: 'WebToMind',
          url: SITE_URL
        }
      },
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: localizedText(page.title, locale),
        itemListElement: itemListSource.map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: 'name' in item ? item.name : localizedText(item, locale),
          ...('url' in item ? { url: item.url } : {})
        }))
      },
      ...(faqJsonLd ? [faqJsonLd] : [])
    ]
  };
}

function buildPromptIndexSeo(locale: Locale): SeoPageConfig {
  const isEnglish = locale === 'en-US';
  const canonicalPath = getLocalizedPath(locale, '/prompts');
  const title = isEnglish
    ? 'Free AI Image Prompts Library - Updated Daily | WebToMind'
    : '按模型和场景整理的 AI 图片 Prompt 案例 | WebToMind';
  const description = isEnglish
    ? 'Filter reusable AI image prompt cases by model and use case, then copy or generate in WebToMind.'
    : '按模型和场景筛选可复用 AI 图片 Prompt 案例，复制后直接进入创作。';

  return {
    title,
    description,
    canonical: `${SITE_URL}${canonicalPath}`,
    locale,
    ogImage: FALLBACK_IMAGE,
    alternates: getAlternates('/prompts'),
    jsonLd: [
      ...getBaseJsonLd(locale),
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: title,
        description,
        url: `${SITE_URL}${canonicalPath}`,
        inLanguage: locale
      },
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        itemListElement: PROMPT_SEO_PAGES.map(
          (page: PromptSeoPage, index: number) => ({
            '@type': 'ListItem',
            position: index + 1,
            url: `${SITE_URL}${getLocalizedPath(
              locale,
              getPromptSeoPath(page.type, page.slug)
            )}`,
            name: localizedText(page.title, locale)
          })
        )
      }
    ]
  };
}

function getPromptBootstrapItems(
  bootstrap?: Record<string, unknown> | null
): Record<string, unknown>[] {
  const items = Array.isArray(bootstrap?.items) ? bootstrap.items : [];
  return items.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === 'object' && !Array.isArray(item)
  );
}

function readBootstrapString(
  item: Record<string, unknown>,
  ...keys: string[]
): string {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function isVideoPromptHubEligible(
  bootstrap?: Record<string, unknown> | null
): boolean {
  return hasVideoPromptHubPublishingThreshold(
    getPromptBootstrapItems(bootstrap)
  );
}

function buildVideoPromptHubSeo(
  options: SeoPageRenderOptions = {}
): SeoPageConfig {
  const canonical = `${SITE_URL}/zh-CN/video-prompts`;
  const title = 'AI 视频 Prompt 案例与分镜模板 | WebToMind';
  const description =
    '浏览经过审核的 AI 视频 Prompt、运镜结构、动作节奏和真实视频结果，并按模型与场景复用到视频创作流程。';
  const items = getPromptBootstrapItems(options.promptLibraryBootstrap).filter(
    (item) => readBootstrapString(item, 'mediaType', 'media_type') === 'video'
  );
  return {
    title,
    description,
    canonical,
    locale: 'zh-CN',
    robots: isVideoPromptHubEligible(options.promptLibraryBootstrap)
      ? 'index,follow,max-video-preview:-1'
      : 'noindex,follow',
    ogImage:
      readBootstrapString(items[0] || {}, 'posterUrl', 'imageUrl') ||
      FALLBACK_IMAGE,
    alternates: [],
    jsonLd: [
      ...getBaseJsonLd('zh-CN'),
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: title,
        description,
        url: canonical,
        inLanguage: 'zh-CN'
      },
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        itemListElement: items.slice(0, 24).map((item, index) => {
          const slug = readBootstrapString(item, 'slug');
          return {
            '@type': 'ListItem',
            position: index + 1,
            name:
              readBootstrapString(item, 'title') || `AI 视频案例 ${index + 1}`,
            ...(slug
              ? { url: `${SITE_URL}/zh-CN/prompts/${encodeURIComponent(slug)}` }
              : {})
          };
        })
      }
    ]
  };
}

function renderVideoPromptHubBody(
  bootstrap?: Record<string, unknown> | null
): string {
  const items = getPromptBootstrapItems(bootstrap)
    .filter(
      (item) => readBootstrapString(item, 'mediaType', 'media_type') === 'video'
    )
    .slice(0, 24);
  const cards = items
    .map((item) => {
      const slug = readBootstrapString(item, 'slug');
      if (!slug) return '';
      const title = readBootstrapString(item, 'title') || 'AI 视频 Prompt 案例';
      const poster = readBootstrapString(
        item,
        'posterUrl',
        'imageUrl',
        'image_url'
      );
      const model = readBootstrapString(item, 'model');
      const category = readBootstrapString(item, 'category');
      return `<article>
        <a href="/zh-CN/prompts/${escapeHtml(encodeURIComponent(slug))}">
          ${
            poster
              ? `<img src="${escapeHtml(poster)}" alt="${escapeHtml(title)} 视频封面" loading="lazy" decoding="async" />`
              : ''
          }
          <h2>${escapeHtml(title)}</h2>
        </a>
        <p>${escapeHtml([model, category].filter(Boolean).join(' · '))}</p>
      </article>`;
    })
    .filter(Boolean)
    .join('');
  const eligibilityNote = isVideoPromptHubEligible(bootstrap)
    ? ''
    : '<p>当前合格案例尚未达到公开索引门槛；页面会继续补充经过审核的真实视频结果。</p>';
  return `<main id="video-prompt-hub-ssr" class="seo-fallback marketing-seo-fallback" data-webtomind-ssr="video-prompt-hub">
    <article>
      <p>VIDEO PROMPT LIBRARY</p>
      <h1>AI 视频 Prompt 案例与分镜模板</h1>
      <p>按模型、动作、运镜和商业场景浏览经过审核的视频 Prompt，并查看真实视频结果。</p>
      ${eligibilityNote}
      <nav aria-label="视频 Prompt 主题">
        <a href="/zh-CN/prompts/model/seedance-2-0">Seedance 2.0 视频 Prompt</a>
        <a href="/zh-CN/prompts">全部 Prompt 案例</a>
        <a href="/zh-CN/video?source=video_hub_ssr">查看当前视频创作能力</a>
      </nav>
      <section aria-label="AI 视频 Prompt 案例">${cards}</section>
    </article>
  </main>`;
}

function buildPromptAliasSeo(
  locale: Locale,
  alias: PromptSeoAlias
): SeoPageConfig {
  const title = `${localizedText(alias.title, locale)} | WebToMind`;
  const description = localizedText(alias.description, locale);
  const canonical = `${SITE_URL}${alias.canonicalPath}`;
  const targetPage = alias.target
    ? getPromptSeoPage(alias.target.type, alias.target.slug)
    : undefined;
  const itemPages = targetPage ? [targetPage] : PROMPT_SEO_PAGES;
  const itemExamples = targetPage ? targetPage.examples : alias.examples || [];
  const caseItems = targetPage
    ? getPromptSeoPublicCases({
        kind: targetPage.type,
        slug: targetPage.slug,
        locale,
        limit: 6
      })
    : alias.caseTarget
      ? getPromptSeoPublicCases({
          kind: alias.caseTarget.type,
          slug: alias.caseTarget.slug,
          locale,
          limit: 6
        })
      : [];
  const keywords = targetPage
    ? locale === 'en-US'
      ? targetPage.keywords.en
      : targetPage.keywords.zh
    : alias.keywords
      ? locale === 'en-US'
        ? alias.keywords.en
        : alias.keywords.zh
      : [];
  const faqItems = targetPage ? targetPage.faq : alias.faq || [];
  const faqJsonLd =
    faqItems.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faqItems.map((item) => ({
            '@type': 'Question',
            name: localizedText(item.question, locale),
            acceptedAnswer: {
              '@type': 'Answer',
              text: localizedText(item.answer, locale)
            }
          }))
        }
      : null;

  return {
    title,
    description,
    canonical,
    locale,
    ogImage: FALLBACK_IMAGE,
    // Unlocalized aliases are independent English canonicals. Keep their
    // alternates self-contained instead of pairing them with a localized topic
    // whose canonical points elsewhere.
    alternates: [
      { hreflang: 'en-US', href: canonical },
      { hreflang: 'x-default', href: canonical }
    ],
    jsonLd: [
      ...getBaseJsonLd(locale),
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: localizedText(alias.title, locale),
        description,
        url: canonical,
        inLanguage: locale,
        about: keywords.length > 0 ? keywords.join(', ') : undefined,
        isPartOf: {
          '@type': 'WebSite',
          name: 'WebToMind',
          url: SITE_URL
        }
      },
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        itemListElement:
          caseItems.length > 0
            ? caseItems.map((caseItem, index) => ({
                '@type': 'ListItem',
                position: index + 1,
                url: `${SITE_URL}${getPromptCaseHref(locale, caseItem)}`,
                name: caseItem.title
              }))
            : itemExamples.length > 0
              ? itemExamples.map((example, index) => ({
                  '@type': 'ListItem',
                  position: index + 1,
                  name: localizedText(example, locale)
                }))
              : itemPages.map((page, index) => ({
                  '@type': 'ListItem',
                  position: index + 1,
                  url: `${SITE_URL}${getLocalizedPath(
                    locale,
                    getPromptSeoPath(page.type, page.slug)
                  )}`,
                  name: localizedText(page.title, locale)
                }))
      },
      ...(faqJsonLd ? [faqJsonLd] : [])
    ]
  };
}

function buildPromptStyleGridSeo(
  pathWithoutLocale = PROMPT_STYLE_GRID_CANONICAL_PATH,
  locale: Locale = 'en-US'
): SeoPageConfig {
  const template = getPromptStyleGridTemplateSeoFromPath(pathWithoutLocale);
  const templateCopy = template
    ? getPromptStyleGridTemplateSeoCopy(template.slug, locale)
    : null;
  const seoCopy = getPromptStyleGridSeoCopy(locale);
  const canonicalPath = template
    ? `${PROMPT_STYLE_GRID_CANONICAL_PATH}/${template.slug}`
    : PROMPT_STYLE_GRID_CANONICAL_PATH;
  const canonical = `${SITE_URL}${canonicalPath}`;
  const title = template
    ? `${templateCopy?.title || template.title} | WebToMind`
    : seoCopy.title;
  const description = template
    ? templateCopy?.description || template.description
    : seoCopy.description;
  const h1 = template ? templateCopy?.title || template.title : seoCopy.h1;
  const keywords = template
    ? [
        templateCopy?.title || template.title,
        `${templateCopy?.category || template.category} theme card`,
        ...seoCopy.keywords
      ]
    : [...seoCopy.keywords];
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: seoCopy.faq.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer
      }
    }))
  };

  return {
    title,
    description,
    canonical,
    locale,
    ogImage: FALLBACK_IMAGE,
    // The style-grid canonical is currently unlocalized. Do not point
    // hreflang at localized app routes that canonicalize elsewhere.
    alternates: [],
    jsonLd: [
      ...getBaseJsonLd(locale),
      {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: h1,
        applicationCategory: 'DesignApplication',
        operatingSystem: 'Web',
        url: canonical,
        description,
        inLanguage: locale,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD'
        }
      },
      {
        '@context': 'https://schema.org',
        '@type': template ? 'WebPage' : 'CollectionPage',
        name: h1,
        description,
        url: canonical,
        inLanguage: locale,
        about: keywords.join(', ')
      },
      ...(template
        ? [
            {
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              itemListElement: [
                {
                  '@type': 'ListItem',
                  position: 1,
                  name: seoCopy.h1,
                  item: `${SITE_URL}${PROMPT_STYLE_GRID_CANONICAL_PATH}`
                },
                {
                  '@type': 'ListItem',
                  position: 2,
                  name: templateCopy?.title || template.title,
                  item: canonical
                }
              ]
            }
          ]
        : []),
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: template
          ? locale === 'zh-CN'
            ? `${templateCopy?.title || template.title}网格`
            : `${templateCopy?.title || template.title} slots`
          : locale === 'zh-CN'
            ? 'WebToMind 主题卡片'
            : 'WebToMind theme cards',
        itemListElement: (locale === 'zh-CN'
          ? ['风格', '光线', '背景', '构图', '主体', '版式', '镜头', '细节']
          : [
              'Style',
              'Lighting',
              'Background',
              'Composition',
              'Subject',
              'Layout',
              'Lens',
              'Detail'
            ]
        ).map((name, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name
        }))
      },
      faqJsonLd
    ]
  };
}

function renderListItems(items: string[]): string {
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
}

function renderPromptStyleGridBody(
  pathWithoutLocale = PROMPT_STYLE_GRID_CANONICAL_PATH,
  locale: Locale = 'en-US'
): string {
  const template = getPromptStyleGridTemplateSeoFromPath(pathWithoutLocale);
  const templateCopy = template
    ? getPromptStyleGridTemplateSeoCopy(template.slug, locale)
    : null;
  const seoCopy = getPromptStyleGridSeoCopy(locale);
  const title = template ? templateCopy?.title || template.title : seoCopy.h1;
  const description = template
    ? templateCopy?.description || template.description
    : seoCopy.description;
  const keywords = [
    ...(template
      ? [
          templateCopy?.title || template.title,
          locale === 'zh-CN'
            ? `${templateCopy?.category || template.category}主题卡片`
            : `${templateCopy?.category || template.category} theme card`
        ]
      : [locale === 'zh-CN' ? '主题卡片广场' : 'theme card plaza']),
    ...seoCopy.keywords
  ]
    .map((keyword) => `<span>${escapeHtml(keyword)}</span>`)
    .join(' ');
  const faq = seoCopy.faq
    .map(
      (item) => `<article>
        <h3>${escapeHtml(item.question)}</h3>
        <p>${escapeHtml(item.answer)}</p>
      </article>`
    )
    .join('');
  const labels =
    locale === 'zh-CN'
      ? {
          kicker: 'WebToMind 主题卡片',
          workflow: '主题卡片流程',
          steps: [
            template
              ? `选择一个适合${escapeHtml(
                  templateCopy?.category || template.category
                )}工作流的可复用主题卡片。`
              : '选择适合人像、商品摄影、角色设计或社媒封面的主题卡片。',
            '填充风格、光线、背景、构图、主体、版式、镜头和细节网格。',
            '下载或分享卡片，并在需要时进入 WebToMind 创作台辅助生成内容。'
          ],
          keywords: '相关关键词',
          faq: '主题卡片 FAQ'
        }
      : {
          kicker: 'WebToMind Theme Cards',
          workflow: 'Theme card workflow',
          steps: [
            `Pick a reusable theme card${
              template
                ? ` for ${escapeHtml(
                    (templateCopy?.category || template.category).toLowerCase()
                  )} workflows`
                : ' for portraits, product photography, character design or social covers'
            }.`,
            'Fill style, lighting, background, composition, subject, layout, lens and detail slots.',
            'Download or share the card, then use assisted generation in WebToMind Create when needed.'
          ],
          keywords: 'Related keywords',
          faq: 'Theme Card FAQ'
        };

  return `<main id="prompt-style-grid-ssr" class="seo-fallback prompt-seo-fallback" data-webtomind-ssr="prompt-style-grid">
    <article>
      <p>${escapeHtml(labels.kicker)}</p>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(description)}</p>
      <section>
        <h2>${escapeHtml(labels.workflow)}</h2>
        <ol>
          ${labels.steps.map((step) => `<li>${step}</li>`).join('')}
        </ol>
      </section>
      <section><h2>${escapeHtml(labels.keywords)}</h2><p>${keywords}</p></section>
      <section><h2>${escapeHtml(labels.faq)}</h2>${faq}</section>
    </article>
  </main>`;
}

function renderPromptSeoBody(content: PromptSeoBodyContent): string {
  const isEnglish = content.locale === 'en-US';
  const labels = {
    keywords: isEnglish ? 'Related prompt keywords' : '相关 Prompt 关键词',
    links: isEnglish ? 'Prompt topic links' : '子分类与专题内链',
    cases: isEnglish ? 'Related prompt case links' : '相关真实 Prompt 案例',
    examples: isEnglish
      ? 'Featured prompt case summaries'
      : '精选 Prompt 案例摘要',
    workflow: isEnglish
      ? 'Reusable AI image prompt workflow'
      : '可复用 AI 图片 Prompt 工作流',
    faq: isEnglish ? 'Prompt FAQ' : 'Prompt 常见问题'
  };
  const keywords = content.keywords
    .map((keyword) => `<span>${escapeHtml(keyword)}</span>`)
    .join(' ');
  const workflow = renderListItems(content.workflow);
  const examples = renderListItems(content.examples);
  const sections = content.sections
    .filter((section) => section.items.length > 0 || section.body)
    .map(
      (section) => `<section>
        <h2>${escapeHtml(section.title)}</h2>
        ${section.body ? `<p>${escapeHtml(section.body)}</p>` : ''}
        ${section.items.length > 0 ? `<ul>${renderListItems(section.items)}</ul>` : ''}
      </section>`
    )
    .join('');
  const faq = content.faq
    .map(
      (item) => `<article>
        <h3>${escapeHtml(item.question)}</h3>
        <p>${escapeHtml(item.answer)}</p>
      </article>`
    )
    .join('');
  const links = content.links
    .map(
      (link) => `<li>
        <a href="${escapeHtml(link.href)}">${escapeHtml(link.title)}</a>
        <span>${escapeHtml(link.description)}</span>
      </li>`
    )
    .join('');
  const cases = content.cases
    .map(
      (caseItem) => `<li>
        <a href="${escapeHtml(caseItem.href)}">${escapeHtml(caseItem.title)}</a>
        <span>${escapeHtml(caseItem.summary)}</span>
        ${
          caseItem.meta.length > 0
            ? `<small>${caseItem.meta.map((item) => escapeHtml(item)).join(' · ')}</small>`
            : ''
        }
      </li>`
    )
    .join('');

  return `<main id="prompt-seo-ssr" class="seo-fallback prompt-seo-fallback" data-webtomind-ssr="prompt-seo">
    <article>
      ${content.badge ? `<p>${escapeHtml(content.badge)}</p>` : ''}
      <h1>${escapeHtml(content.title)}</h1>
      <p>${escapeHtml(content.description)}</p>
      ${content.intent ? `<p>${escapeHtml(content.intent)}</p>` : ''}
      <p class="prompt-seo-ssr-cta"><a href="/image?source=seo_prompt_landing">${isEnglish ? 'Start creating' : '开始创作'}</a></p>
      ${keywords ? `<section><h2>${labels.keywords}</h2><p>${keywords}</p></section>` : ''}
      ${cases ? `<section><h2>${labels.cases}</h2><ul>${cases}</ul></section>` : ''}
      ${links ? `<section><h2>${labels.links}</h2><ul>${links}</ul></section>` : ''}
      ${examples ? `<section><h2>${labels.examples}</h2><ul>${examples}</ul></section>` : ''}
      ${workflow ? `<section><h2>${labels.workflow}</h2><ol>${workflow}</ol></section>` : ''}
      ${sections}
      ${faq ? `<section><h2>${labels.faq}</h2>${faq}</section>` : ''}
    </article>
  </main>`;
}

function renderSeoLinks(links: PromptSeoBodyLink[]): string {
  return links
    .map(
      (link) => `<li>
        <a href="${escapeHtml(link.href)}">${escapeHtml(link.title)}</a>
        <span>${escapeHtml(link.description)}</span>
      </li>`
    )
    .join('');
}

function getCoreSeoLinks(locale: Locale): PromptSeoBodyLink[] {
  const isEnglish = locale === 'en-US';
  return [
    {
      title: isEnglish ? 'Open the image studio' : '进入 AI 图片创作台',
      description: isEnglish
        ? 'Start from a prompt, a reference image or a reusable prompt case.'
        : '从 prompt、参考图或可复用案例开始生成图片。',
      href: getLocalizedPath(locale, '/create')
    },
    {
      title: isEnglish ? 'Browse prompt examples' : '浏览 Prompt 案例库',
      description: isEnglish
        ? 'Find reusable AI image prompts by model, category and package.'
        : '按模型、场景和案例包查找可复用 AI 图片 Prompt。',
      href: getLocalizedPath(locale, '/prompts')
    },
    {
      title: isEnglish ? 'Compare pricing and credits' : '查看价格与积分套餐',
      description: isEnglish
        ? 'Choose monthly credits, membership access or extra credits for production.'
        : '根据月度创作、会员权益和额外积分需求选择方案。',
      href: getLocalizedPath(locale, '/pricing')
    }
  ];
}

function renderBlogHubSeoBody(locale: Locale): string {
  const isEnglish = locale === 'en-US';
  const title = isEnglish ? 'WebToMind Blog' : 'WebToMind 博客';
  const intro = isEnglish
    ? 'AI image tutorials, hot-keyword guides and reproducible prompt workflows for portraits, product visuals, social covers, character consistency and agent-era creation.'
    : 'AI 图片生成教程、热门关键词指南与可复现 Prompt 工作流，覆盖 AI 写真、商品图、小红书封面、角色一致性和 Agent 时代创作方法。';
  const useCases = SEO_USE_CASES.map(
    (item) => `<article>
      <h2><a href="${escapeHtml(getLocalizedPath(locale, `/blog/${item.slug}`))}">${escapeHtml(localizedText(item.title, locale))}</a></h2>
      <p>${escapeHtml(localizedText(item.summary, locale))}</p>
    </article>`
  ).join('');
  const posts = SEO_BLOG_POSTS.map(
    (post) => `<article>
      <h2><a href="${escapeHtml(getLocalizedPath(locale, `/blog/${post.slug}`))}">${escapeHtml(localizedText(post.title, locale))}</a></h2>
      <time datetime="${escapeHtml(post.date)}">${escapeHtml(post.date)}</time>
      <p>${escapeHtml(localizedText(post.excerpt, locale))}</p>
    </article>`
  ).join('');
  const links = renderSeoLinks([
    {
      title: isEnglish ? 'Prompt case library' : 'Prompt 案例库',
      description: isEnglish
        ? 'Filter reusable image prompts by model and use case.'
        : '按模型和使用场景筛选可复用 AI 图片 Prompt。',
      href: getLocalizedPath(locale, '/prompts')
    },
    ...getCoreSeoLinks(locale)
  ]);

  return `<main id="marketing-seo-ssr" class="seo-fallback marketing-seo-fallback" data-webtomind-ssr="marketing-seo">
    <article>
      <p>${isEnglish ? 'WebToMind blog' : 'WebToMind 博客'}</p>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(intro)}</p>
      <section><h2>${isEnglish ? 'Hot-keyword and workflow guides' : '热门关键词与使用场景指南'}</h2>${useCases}</section>
      <section><h2>${isEnglish ? 'Blog articles' : '博客文章'}</h2>${posts}</section>
      <section><h2>${isEnglish ? 'Continue in WebToMind' : '继续使用 WebToMind'}</h2><ul>${links}</ul></section>
    </article>
  </main>`;
}

function renderPindouColorChartHtml(
  chart: { systems: string[]; rows: Array<{ hex: string; codes: string[] }> },
  isEnglish: boolean
): string {
  const systemNames: Record<string, string> = {
    mard: 'MARD',
    coco: 'COCO',
    manman: '漫漫',
    panpan: '盼盼',
    mixiaowo: '咪小窝'
  };
  const header = chart.systems
    .map((system) => `<th>${escapeHtml(systemNames[system] || system)}</th>`)
    .join('');
  const rows = chart.rows
    .map((row) => {
      const cells = row.codes
        .map((code) => `<td>${escapeHtml(code || '—')}</td>`)
        .join('');
      return `<tr><td><span style="display:inline-block;width:14px;height:14px;border:1px solid #ddd;background:${escapeHtml(
        row.hex
      )}"></span> ${escapeHtml(row.hex)}</td>${cells}</tr>`;
    })
    .join('');
  return `<div style="max-height:480px;overflow:auto;border:1px solid rgba(23,17,13,0.14);border-radius:12px"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th>${escapeHtml(
    isEnglish ? 'Color' : '颜色'
  )}</th>${header}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderBlogDetailSeoBody(locale: Locale, slug: string): string | null {
  const post = SEO_BLOG_POSTS.find((item) => item.slug === slug);
  if (!post) return renderUseCaseDetailSeoBody(locale, slug);
  const isEnglish = locale === 'en-US';
  const body = (post.body || [])
    .map(
      (paragraph) => `<p>${escapeHtml(localizedText(paragraph, locale))}</p>`
    )
    .join('');
  const chartHtml = post.colorChart
    ? `<section><h2>${
        isEnglish ? 'Color code chart (291 colors)' : '色号对照表（291 色）'
      }</h2>${renderPindouColorChartHtml(post.colorChart, isEnglish)}</section>`
    : '';
  const trackedCta = post.cta
    ? buildSeoBlogCta({
        locale,
        slug: post.slug,
        href: post.cta.href,
        kind: post.cta.kind
      })
    : null;
  const cta =
    post.cta && trackedCta
      ? {
          title: localizedText(post.cta.title, locale),
          href: trackedCta.href,
          source: trackedCta.source,
          kind: post.cta.kind
        }
      : null;
  const relatedUseCases = SEO_USE_CASES.slice(0, 4).map((item) => ({
    title: localizedText(item.title, locale),
    description: localizedText(item.summary, locale),
    href: getLocalizedPath(locale, `/blog/${item.slug}`)
  }));
  const isPindouPost = post.slug.startsWith('pindou-');
  const relatedPosts = isPindouPost
    ? [
        ...SEO_BLOG_POSTS.filter(
          (item) => item.slug !== post.slug && item.slug.startsWith('pindou-')
        ),
        ...SEO_BLOG_POSTS.filter(
          (item) => item.slug !== post.slug && !item.slug.startsWith('pindou-')
        )
      ].slice(0, 3)
    : SEO_BLOG_POSTS.filter((item) => item.slug !== post.slug).slice(0, 3);
  const relatedReading = [
    ...relatedUseCases.slice(0, isPindouPost ? 1 : 3).map(
      (item) => `<article>
        <h3><a href="${escapeHtml(item.href)}">${escapeHtml(item.title)}</a></h3>
        <p>${escapeHtml(item.description)}</p>
      </article>`
    ),
    ...relatedPosts.map(
      (item) => `<article>
        <h3><a href="${escapeHtml(getLocalizedPath(locale, `/blog/${item.slug}`))}">${escapeHtml(localizedText(item.title, locale))}</a></h3>
        <p>${escapeHtml(localizedText(item.excerpt, locale))}</p>
      </article>`
    )
  ].join('');
  const bodyPoints = (
    isPindouPost
      ? isEnglish
        ? [
            'Choose a brand palette before generating so the chart matches the beads you buy.',
            'Keep the grid readable: print at 300 DPI on A4 and use the paginated PDF for large charts.',
            'Iron at medium heat in small circles and cool flat under weight before lifting the pegboard.'
          ]
        : [
            '生成前先选好品牌色板，图纸才和手里的珠子对得上。',
            '打印保持可读：300 DPI、A4 纸，大图用分页 PDF。',
            '熨烫中温画圈，趁热压平冷却后再取底板。'
          ]
      : isEnglish
        ? [
            'Start by naming the image job: cover, portrait, product visual, character sheet, reference analysis or history re-edit.',
            'Break the prompt into reusable slots such as subject, scene, lens, lighting, material, style, layout and constraints.',
            'Generate a small batch in WebToMind, save the winning prompt and model settings, then reuse the history instead of rewriting from scratch.'
          ]
        : [
            '先明确图片任务：封面、写真、商品图、角色图、参考图反推或历史重编辑。',
            '把 prompt 拆成主体、场景、镜头、光影、材质、风格、版式和约束等可复用 slot。',
            '在 WebToMind 里小批量生成，保存有效 prompt、模型参数和历史版本，后续复用而不是从零重写。'
          ]
  )
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('');
  const links = renderSeoLinks([
    ...getCoreSeoLinks(locale),
    ...relatedUseCases
  ]);
  const bootstrap = `<script id="webtomind-blog-bootstrap" type="application/json">${escapeJsonForHtml(
    toPublicSeoBlogPost(post, locale)
  )}</script>`;

  return `<main id="marketing-seo-ssr" class="seo-fallback marketing-seo-fallback" data-webtomind-ssr="marketing-seo">
    <article>
      <p>${escapeHtml(localizedText(post.author, locale))} · <time datetime="${escapeHtml(post.date)}">${escapeHtml(post.date)}</time></p>
      <h1>${escapeHtml(localizedText(post.title, locale))}</h1>
      <p>${escapeHtml(localizedText(post.excerpt, locale))}</p>
      ${body ? `<section>${body}</section>` : ''}
      ${chartHtml}
      ${
        cta
          ? `<section><h2>${isEnglish ? 'Next step' : '下一步'}</h2><p><a href="${escapeHtml(cta.href)}" data-cta-source="${escapeHtml(cta.source)}" data-cta-kind="${escapeHtml(cta.kind)}">${escapeHtml(cta.title)}</a></p></section>`
          : ''
      }
      <section><h2>${isEnglish ? 'Key workflow points' : '主体要点'}</h2><ol>${bodyPoints}</ol></section>
      ${relatedReading ? `<section><h2>${isEnglish ? 'More articles' : '更多文章'}</h2>${relatedReading}</section>` : ''}
      <section><h2>${isEnglish ? 'Related prompts and creation links' : '相关 Prompt 与创作入口'}</h2><ul>${links}</ul></section>
    </article>
    ${bootstrap}
  </main>`;
}

function renderUseCaseDetailSeoBody(
  locale: Locale,
  slug: string
): string | null {
  const useCase = SEO_USE_CASES.find((item) => item.slug === slug);
  if (!useCase) return null;
  const isEnglish = locale === 'en-US';
  const faq = (useCase.faq || [])
    .map(
      (item) => `<article>
        <h3>${escapeHtml(localizedText(item.question, locale))}</h3>
        <p>${escapeHtml(localizedText(item.answer, locale))}</p>
      </article>`
    )
    .join('');
  const steps = useCase.steps
    .map((step) => `<li>${escapeHtml(localizedText(step, locale))}</li>`)
    .join('');
  const relatedBlogPosts = SEO_BLOG_POSTS.slice(0, 4).map((post) => ({
    title: localizedText(post.title, locale),
    description: localizedText(post.excerpt, locale),
    href: getLocalizedPath(locale, `/blog/${post.slug}`)
  }));
  const relatedReading = [
    ...relatedBlogPosts.slice(0, 3).map(
      (post) => `<article>
        <h3><a href="${escapeHtml(post.href)}">${escapeHtml(post.title)}</a></h3>
        <p>${escapeHtml(post.description)}</p>
      </article>`
    ),
    ...SEO_USE_CASES.filter((item) => item.slug !== useCase.slug)
      .slice(0, 3)
      .map(
        (item) => `<article>
          <h3><a href="${escapeHtml(getLocalizedPath(locale, `/blog/${item.slug}`))}">${escapeHtml(localizedText(item.title, locale))}</a></h3>
          <p>${escapeHtml(localizedText(item.summary, locale))}</p>
        </article>`
      )
  ].join('');
  const relatedLinks = (useCase.relatedLinks || []).map((link) => ({
    title: localizedText(link.title, locale),
    description: localizedText(link.description, locale),
    href: getLocalizedPath(locale, link.path)
  }));
  const links = renderSeoLinks([
    ...getCoreSeoLinks(locale),
    ...relatedLinks,
    ...relatedBlogPosts
  ]);

  return `<main id="marketing-seo-ssr" class="seo-fallback marketing-seo-fallback" data-webtomind-ssr="marketing-seo">
    <article>
      <p>${isEnglish ? 'WebToMind use case' : 'WebToMind 使用场景'}</p>
      <h1>${escapeHtml(localizedText(useCase.title, locale))}</h1>
      <p>${escapeHtml(localizedText(useCase.summary, locale))}</p>
      <section><h2>${isEnglish ? 'Workflow steps' : '步骤摘要'}</h2><ol>${steps}</ol></section>
      ${faq ? `<section><h2>${isEnglish ? 'Common questions' : '常见问题'}</h2>${faq}</section>` : ''}
      ${relatedReading ? `<section><h2>${isEnglish ? 'More articles' : '更多文章'}</h2>${relatedReading}</section>` : ''}
      <section><h2>${isEnglish ? 'Related prompts and creation links' : '相关 Prompt 与创作入口'}</h2><ul>${links}</ul></section>
    </article>
  </main>`;
}

function renderPricingSeoBody(locale: Locale): string {
  const isEnglish = locale === 'en-US';
  const plans = SEO_PRICING_CONTENT.plans
    .map(
      (plan) => `<article>
        <h2>${escapeHtml(localizedText(plan.name, locale))}</h2>
        <p>${escapeHtml(localizedText(plan.summary, locale))}</p>
      </article>`
    )
    .join('');
  const creditUses = renderListItems(
    SEO_PRICING_CONTENT.creditUses.map((item) => localizedText(item, locale))
  );
  const faq = SEO_PRICING_CONTENT.faq
    .map(
      (item) => `<article>
        <h3>${escapeHtml(localizedText(item.question, locale))}</h3>
        <p>${escapeHtml(localizedText(item.answer, locale))}</p>
      </article>`
    )
    .join('');
  const links = renderSeoLinks([
    {
      title: isEnglish ? 'Start creating images' : '开始生成图片',
      description: isEnglish
        ? 'Use credits in the WebToMind image studio.'
        : '在 WebToMind 创作台使用积分生成图片。',
      href: getLocalizedPath(locale, '/create')
    },
    {
      title: isEnglish ? 'Buy extra credits' : '购买额外积分',
      description: isEnglish
        ? 'Use one-time credits for campaign spikes or batch tests.'
        : '用一次性积分承接活动高峰、批量测试和客户改稿。',
      href: getLocalizedPath(locale, '/recharge')
    },
    {
      title: isEnglish ? 'Review prompt workflows' : '查看 Prompt 工作流',
      description: isEnglish
        ? 'Estimate what you need before spending credits.'
        : '先理解工作流，再决定积分和套餐预算。',
      href: getLocalizedPath(locale, '/prompts')
    }
  ]);
  return `<main id="marketing-seo-ssr" class="seo-fallback marketing-seo-fallback" data-webtomind-ssr="marketing-seo">
    <article>
      <p>${isEnglish ? 'Pricing' : '价格'}</p>
      <h1>${escapeHtml(localizedText(SEO_PRICING_CONTENT.title, locale))}</h1>
      <p>${escapeHtml(localizedText(SEO_PRICING_CONTENT.intro, locale))}</p>
      <section><h2>${isEnglish ? 'Plans' : '套餐'}</h2>${plans}</section>
      <section><h2>${isEnglish ? 'What credits cover' : '积分用途'}</h2><ul>${creditUses}</ul></section>
      <section><h2>${isEnglish ? 'Pricing FAQ' : '价格 FAQ'}</h2>${faq}</section>
      <section><h2>${isEnglish ? 'Entry links' : '入口链接'}</h2><ul>${links}</ul></section>
    </article>
  </main>`;
}

function renderComfySeoBody(locale: Locale): string {
  const isEnglish = locale === 'en-US';
  const title = isEnglish
    ? 'ComfyUI Workflow Checker & JSON Validator'
    : 'ComfyUI Workflow 检查器';
  const intro = isEnglish
    ? 'Paste or upload a ComfyUI workflow JSON to inspect missing models, custom nodes, prompts, dimensions and migration risks before generating in WebToMind.'
    : '粘贴或上传 ComfyUI workflow JSON，检查缺失模型、custom nodes、prompt、尺寸和迁移风险，再带入 WebToMind 生成。';
  const checks = renderListItems(
    isEnglish
      ? [
          'Detect model, LoRA, VAE and ControlNet references before a workflow fails.',
          'Surface custom node clues and risky unknown node names for migration planning.',
          'Review prompts, image dimensions and generation settings before rebuilding the workflow.',
          'Convert the workflow diagnosis into a cleaner WebToMind prompt and image creation brief.',
          'Keep the original workflow private while still producing a shareable repair summary for teammates.'
        ]
      : [
          '在 workflow 失败前识别模型、LoRA、VAE 和 ControlNet 引用。',
          '提示 custom node 线索和未知节点名称，帮助提前规划迁移。',
          '检查 prompt、图片尺寸和生成设置，再决定如何重建工作流。',
          '把诊断结果转成更清晰的 WebToMind prompt 与图片创作 brief。',
          '在不公开原始 workflow 的前提下，生成可分享给团队的修复摘要。'
        ]
  );
  const workflow = renderListItems(
    isEnglish
      ? [
          'Open the checker and paste the workflow JSON exported from ComfyUI.',
          'Scan the missing-model and custom-node sections before downloading or rebuilding anything.',
          'Copy the usable prompt, model intent and dimensions into the WebToMind creative workspace.',
          'Save the repaired workflow notes as a reusable prompt case for future image batches.'
        ]
      : [
          '打开检查器，粘贴从 ComfyUI 导出的 workflow JSON。',
          '先阅读缺失模型和 custom node 区域，再决定下载、替换或重建。',
          '把可复用 prompt、模型意图和尺寸带入 WebToMind 创意工作台。',
          '将修复后的工作流笔记沉淀为可复用 Prompt 案例，服务后续批量出图。'
        ]
  );
  const faq = (
    isEnglish
      ? [
          {
            question: 'Does the checker upload my workflow?',
            answer:
              'No. The checker parses the workflow in the browser and does not upload the raw JSON.'
          },
          {
            question: 'Can it replace missing ComfyUI nodes automatically?',
            answer:
              'It focuses on diagnosis and migration planning. Use the findings to decide whether to install nodes, replace models or rebuild the prompt in WebToMind.'
          }
        ]
      : [
          {
            question: '检查器会上传我的 workflow 吗？',
            answer: '不会。检查器在浏览器内解析 workflow，不上传原始 JSON。'
          },
          {
            question: '它会自动替换缺失的 ComfyUI 节点吗？',
            answer:
              '它聚焦诊断和迁移规划。你可以根据结果决定安装节点、替换模型，或在 WebToMind 中重建 prompt。'
          }
        ]
  )
    .map(
      (item) => `<article>
        <h3>${escapeHtml(item.question)}</h3>
        <p>${escapeHtml(item.answer)}</p>
      </article>`
    )
    .join('');
  const links = renderSeoLinks([
    {
      title: isEnglish ? 'Open the checker' : '打开 Workflow 检查器',
      description: isEnglish
        ? 'Inspect a workflow before rebuilding image generation.'
        : '先诊断 workflow，再重建图片生成流程。',
      href: getLocalizedPath(locale, '/tools/comfyui-workflow-checker')
    },
    {
      title: isEnglish ? 'Open Creative Workspace' : '进入创意工作台',
      description: isEnglish
        ? 'Turn repaired workflow notes into reusable image prompts.'
        : '把修复后的工作流笔记转成可复用图片 prompt。',
      href: getLocalizedPath(locale, '/create')
    },
    {
      title: isEnglish ? 'Browse prompt examples' : '浏览 Prompt 案例',
      description: isEnglish
        ? 'Compare prompt structures before rebuilding a workflow.'
        : '重建 workflow 前先参考可复用 prompt 结构。',
      href: getLocalizedPath(locale, '/prompts')
    }
  ]);

  return `<main id="marketing-seo-ssr" class="seo-fallback marketing-seo-fallback" data-webtomind-ssr="marketing-seo">
    <article>
      <p>${isEnglish ? 'Developer utility' : '开发者工具'}</p>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(intro)}</p>
      <section><h2>${isEnglish ? 'What the checker reviews' : '检查内容'}</h2><ul>${checks}</ul></section>
      <section><h2>${isEnglish ? 'Migration workflow' : '迁移工作流'}</h2><ol>${workflow}</ol></section>
      <section><h2>${isEnglish ? 'Checker FAQ' : '检查器 FAQ'}</h2>${faq}</section>
      <section><h2>${isEnglish ? 'Entry links' : '入口链接'}</h2><ul>${links}</ul></section>
    </article>
  </main>`;
}

export function renderPindouSeoBody(locale: Locale): string {
  const isEnglish = locale === 'en-US';
  const title = isEnglish
    ? 'Free Perler Bead Pattern Maker'
    : '免费在线拼豆图案生成器';
  const intro = isEnglish
    ? 'A bead pattern maker turns photos, pixel art or line art into printable fuse-bead charts. Upload an image, pick a brand palette, then download a PNG chart with color codes, a CSV material list or a PDF worksheet with paginated pages for large grids.'
    : '拼豆生成器把照片、像素图或线稿变成可打印的拼豆图纸：上传图片，选择品牌色板，生成后直接下载带坐标和色号的 PNG 图纸、CSV 采购清单或 PDF 制作说明（大图自动分页）。';
  const facts = (
    isEnglish
      ? [
          ['Price', 'Free to use, no registration or sign-up required.'],
          [
            'Privacy',
            'All conversion happens in the browser; the original image is never uploaded for pattern generation.'
          ],
          [
            'Palettes',
            '8 brand palettes (Perler, Hama and Artkal basics plus five Chinese brand palettes: MARD, COCO, Manman, Panpan and Mixiaowo), 1502 standard color codes in total.'
          ],
          [
            'Exports',
            'PNG chart with coordinates and per-cell codes, CSV material list and PDF worksheet that paginates large grids at 50x50 cells per page.'
          ],
          ['Grid size', '16-140 beads wide and 4-32 colors per pattern.'],
          [
            'Editing',
            'Dominant or average-color pixelation, one-click background removal, similar-color merge, paint, color replace, connected erase, undo/redo and share codes.'
          ]
        ]
      : [
          ['价格', '完全免费，无需注册。'],
          [
            '隐私',
            '转换全部在浏览器本地完成，原图不会因为生成拼豆图案而上传。'
          ],
          [
            '色板',
            '8 套品牌色板：Perler、Hama、Artkal，以及 MARD、COCO、漫漫、盼盼、咪小窝 5 套中文品牌色板，共 1502 个标准色号。'
          ],
          [
            '导出',
            'PNG 图纸（带坐标与每格色号）、CSV 采购清单、PDF 制作说明（大图按 50×50 格分页）。'
          ],
          ['尺寸', '图纸宽度 16-140 珠，最多 4-32 色。'],
          [
            '编辑',
            '主色/平均色像素化、自动去背景、相似色合并、画笔、整色替换、连通擦除、撤销/重做与分享码。'
          ]
        ]
  )
    .map(
      ([name, value]) =>
        `<div><dt>${escapeHtml(name)}</dt><dd>${escapeHtml(value)}</dd></div>`
    )
    .join('');
  const quickReference = (
    isEnglish
      ? [
          [
            'Choosing beads',
            'Beginners should start with 5mm beads and a basic palette; use 2.6mm beads and 291-color palettes for detailed photo-like pieces.'
          ],
          [
            'Color planning',
            '72-color kits cover most simple patterns; choose a 291-color palette for photos, gradients and skin tones.'
          ],
          [
            'Printing',
            'Print charts at 300 DPI on A4, paginate large grids at 50x50 cells, and keep the blueprint under the transparent pegboard while placing beads.'
          ],
          [
            'Ironing',
            'Iron at medium heat (about 145-165°C), move in small circles and cool the piece flat under weight before lifting.'
          ]
        ]
      : [
          [
            '选豆',
            '新手先用 5mm 大颗拼豆和基础色板练手；做照片级细节再换 2.6mm 拼豆和 291 色板。'
          ],
          [
            '配色',
            '简单图案用基础色板就够；照片、渐变和肤色建议切到 291 色板，过渡更自然。'
          ],
          [
            '打印',
            '图纸按 300 DPI、A4 纸打印，大图按 50×50 格分页；把蓝图垫在透明拼板下面对照着摆豆。'
          ],
          [
            '熨烫',
            '中温（约 145-165°C）画圈均匀移动，熨完趁热压重物冷却，再取下底板防卷边。'
          ]
        ]
  )
    .map(
      ([name, value]) =>
        `<div><dt>${escapeHtml(name)}</dt><dd>${escapeHtml(value)}</dd></div>`
    )
    .join('');
  const colorReferenceLinks = renderSeoLinks([
    {
      title: isEnglish ? 'MARD bead color chart' : 'MARD 拼豆色卡与色号对照表',
      description: isEnglish
        ? 'Read the 291-color MARD chart and map codes before buying beads.'
        : '查看 291 色 MARD 拼豆色卡，按色号对照后再备料。',
      href: getLocalizedPath(locale, '/blog/mard-bead-color-chart')
    },
    {
      title: isEnglish ? 'Print a bead chart' : '打印拼豆图纸',
      description: isEnglish
        ? 'Use the 300 DPI and A4 pagination guide for large charts.'
        : '了解 300 DPI、A4 与大图分页，减少打印返工。',
      href: getLocalizedPath(locale, '/blog/pindou-printing-guide')
    }
  ]);
  const features = renderListItems(
    isEnglish
      ? [
          'Convert portraits, pet photos, icons, anime-style images and simple illustrations into bead grids.',
          'Match colors against 8 brand palettes including Perler, Hama, Artkal, MARD and COCO before buying materials.',
          'Control bead width, max color count and grid visibility for printable craft planning.',
          'Use dominant-color or average-color pixelation and optional one-click background removal for cleaner charts.',
          'Review bead counts by color code so you can estimate the materials needed for a project.',
          'Process the image in the browser, keeping the original photo on your device.'
        ]
      : [
          '把头像、宠物照、像素图、动漫风图片和简单插画转成拼豆网格。',
          '用 Perler、Hama、Artkal、MARD、COCO 等 8 套品牌色板做颜色匹配，方便提前备料。',
          '控制图纸宽度、最多颜色数量和网格显示，生成更适合打印的拼豆图纸。',
          '支持主色/平均色两种像素化模式，可一键去除纯色背景，让图纸更干净。',
          '按色号统计每种珠子的数量，帮助估算项目所需材料。',
          '导出的 CSV 可以作为采购清单，PNG 或 PDF 图纸可以直接放进教程、亲子手作或摊位备料流程。',
          '图片在浏览器本地处理，原图不会因为生成图案而上传到服务器。'
        ]
  );
  const workflow = renderListItems(
    isEnglish
      ? [
          'Open the tool and upload a JPG, PNG or WebP image.',
          'Choose one of 8 brand bead palettes and set the grid width for your pegboard or final object size.',
          'Pick dominant-color or average-color pixelation and turn on background removal when your photo has a plain background.',
          'Lower the max color count when you need a simpler beginner-friendly pattern.',
          'Download the PNG pattern, export CSV color counts or save a PDF worksheet.'
        ]
      : [
          '打开工具并上传 JPG、PNG 或 WebP 图片。',
          '从 Perler、Hama、Artkal、MARD、COCO 等 8 套品牌色板中选择，并根据底板或成品尺寸设置宽度珠子数。',
          '需要更干净的图纸时，开启自动去背景，或切换主色/平均色像素化模式。',
          '如果想做新手友好的图案，可以降低最多颜色数量。',
          '下载 PNG 图纸、导出 CSV 色号清单，或保存 PDF 制作清单。'
        ]
  );
  const patternIdeas = [
    {
      nameZh: '宠物肖像',
      nameEn: 'Pet portrait',
      specZh: '50–100 珠宽 · 6–10 色 · 进阶',
      specEn: '50-100 beads wide · 6-10 colors · advanced',
      href: '/blog/bead-pattern-pet-portrait'
    },
    {
      nameZh: '动漫同人角色',
      nameEn: 'Anime fan-art character',
      specZh: '40–80 珠宽 · 8–12 色 · 进阶',
      specEn: '40-80 beads wide · 8-12 colors · advanced',
      href: '/blog/bead-pattern-anime-fanart'
    },
    {
      nameZh: '像素画与游戏图标',
      nameEn: 'Pixel art and game icons',
      specZh: '24–64 珠宽 · 4–8 色 · 入门',
      specEn: '24-64 beads wide · 4-8 colors · beginner',
      href: '/blog/bead-pattern-pixel-art'
    },
    {
      nameZh: '亲子手工与课堂',
      nameEn: 'Kids crafts and classrooms',
      specZh: '30–50 珠宽 · 6–10 色 · 入门',
      specEn: '30-50 beads wide · 6-10 colors · beginner',
      href: '/blog/bead-pattern-kids-craft'
    },
    {
      nameZh: '3D 立体作品',
      nameEn: '3D objects',
      specZh: '按展开图拼接 · 6–12 色 · 挑战',
      specEn: 'built from flat panels · 6-12 colors · challenging',
      href: '/tools/pindou-pattern-maker'
    },
    {
      nameZh: '自由创作',
      nameEn: 'Free drawing',
      specZh: '任意尺寸 · 自选配色 · 自由',
      specEn: 'any size · custom palette · open-ended',
      href: '/tools/pindou-pattern-maker'
    }
  ];
  const patternIdeaItems = patternIdeas
    .map((item) => {
      const href = getLocalizedPath(locale, item.href);
      return `<li>${escapeHtml(isEnglish ? item.nameEn : item.nameZh)}（${escapeHtml(
        isEnglish ? item.specEn : item.specZh
      )}）— <a href="${href}">${isEnglish ? 'view guide' : '查看教程'}</a></li>`;
    })
    .join('');
  const faq = (
    isEnglish
      ? [
          {
            question: 'Is the bead pattern maker free?',
            answer:
              'Yes. The WebToMind bead pattern maker is free to open and can export the generated pattern without sign-up.'
          },
          {
            question: 'Are uploaded photos saved?',
            answer:
              'No. The conversion runs in the browser and the original image is not uploaded for pattern generation.'
          },
          {
            question: 'Which bead palettes are supported?',
            answer:
              'The tool includes 8 brand palettes: Perler, Hama, Artkal, MARD, COCO, 漫漫, 盼盼 and 咪小窝. MARD, COCO, 漫漫, 盼盼 and 咪小窝 each ship 291 bead colors for precise material planning.'
          },
          {
            question: 'What image size works best?',
            answer:
              'Square or portrait photos with clear subjects work best. Start at 40-80 beads wide; lower the width for pixel-art style and raise it for more detail.'
          },
          {
            question: 'Can I mix beads from different brands?',
            answer:
              'Yes, but colors differ slightly between brands. Pick one palette in the tool, then buy that brand so the chart matches your beads.'
          },
          {
            question: 'How do I avoid warping when ironing?',
            answer:
              'Iron evenly with medium heat, keep the parchment paper flat, and let the piece cool under a heavy book before removing it from the pegboard.'
          },
          {
            question: 'Where can I find bead pattern ideas?',
            answer:
              'The pattern idea gallery on this page lists directions by size and difficulty: pet portraits, anime fan art, pixel art, kids crafts and 3D builds. Turn any reference image into a printable chart with the maker.'
          },
          {
            question: 'Does the PDF split large charts into printable pages?',
            answer:
              'Yes. Large charts are paginated at 50x50 cells per page with coordinates and color codes, so you can print and assemble section by section.'
          },
          {
            question: 'How many colors does the tool support?',
            answer:
              '8 brand palettes totaling 1502 standard color codes: Perler, Hama and Artkal basics, plus the MARD, COCO, Manman, Panpan and Mixiaowo Chinese brand palettes.'
          }
        ]
      : [
          {
            question: '这个拼豆图案生成器免费吗？',
            answer:
              '免费。你可以直接打开 WebToMind 拼豆图案生成器，生成并导出图纸，不需要先注册。'
          },
          {
            question: '上传的图片会被保存吗？',
            answer:
              '不会。图片转换在浏览器本地运行，原始图片不会因为生成拼豆图案而上传。'
          },
          {
            question: '支持哪些拼豆色板？',
            answer:
              '当前内置 Perler、Hama、Artkal、MARD、COCO、漫漫、盼盼、咪小窝 8 套色板，共 1502 个标准色号，可以更精确地规划备料。'
          },
          {
            question: '什么尺寸的图片效果最好？',
            answer:
              '主体清晰的正方形或竖版照片效果最好。新手建议从 40-80 珠宽开始，宽度越小越接近像素画风格，越大细节越丰富。'
          },
          {
            question: '可以混用不同品牌的珠子吗？',
            answer:
              '可以，但不同品牌同一色号会有轻微色差。建议在工具里选定一个品牌色板，并按该品牌采购，图纸才和珠子对得上。'
          },
          {
            question: '熨烫时如何避免变形？',
            answer:
              '用中温均匀熨烫，保持烘焙纸平整，熨完趁热压上重物冷却，再取下底板，图案就不容易卷边变形。'
          },
          {
            question: '拼豆图案去哪里找？',
            answer:
              '本页的「拼豆图案大全与灵感」按尺寸和难度整理了宠物、动漫、像素画、亲子手工和 3D 等方向；也可以用生成器把任意图片转成可打印图纸。'
          },
          {
            question: 'PDF 会把大图纸分页吗？',
            answer:
              '会。大图纸按每页 50×50 格分页，每页带坐标与色号，可逐页打印后拼合制作。'
          },
          {
            question: '工具支持多少色号？',
            answer:
              '共 8 套品牌色板、1502 个标准色号：Perler、Hama、Artkal 基础色板，以及 MARD、COCO、漫漫、盼盼、咪小窝 5 套中文品牌色板。'
          }
        ]
  )
    .map(
      (item) => `<article>
        <h3>${escapeHtml(item.question)}</h3>
        <p>${escapeHtml(item.answer)}</p>
      </article>`
    )
    .join('');
  const links = renderSeoLinks([
    {
      title: isEnglish ? 'Open bead pattern maker' : '打开拼豆图案生成器',
      description: isEnglish
        ? 'Upload an image and generate a printable bead grid.'
        : '上传图片并生成可打印拼豆图纸。',
      href: getLocalizedPath(locale, '/tools/pindou-pattern-maker')
    },
    {
      title: isEnglish ? 'Open Creative Workspace' : '进入创意工作台',
      description: isEnglish
        ? 'Organize palette notes, tutorial copy and craft project ideas.'
        : '整理配色说明、教程文案和手作项目创意。',
      href: getLocalizedPath(locale, '/create')
    },
    {
      title: isEnglish ? 'Browse prompt examples' : '浏览 Prompt 案例',
      description: isEnglish
        ? 'Use generated pattern notes as source material for posts and visuals.'
        : '把图案说明继续变成内容、封面或教程视觉素材。',
      href: getLocalizedPath(locale, '/prompts')
    }
  ]);
  const relatedTools = renderSeoLinks([
    {
      title: isEnglish ? 'Image compressor' : '图片压缩工具',
      description: isEnglish
        ? 'Shrink PNG, JPG and WebP files locally before sharing charts.'
        : '在分享图纸前本地压缩 PNG、JPG、WebP 体积。',
      href: getLocalizedPath(locale, '/tools/image-compressor')
    },
    {
      title: isEnglish ? 'AI image upscaler' : 'AI 图像放大器',
      description: isEnglish
        ? 'Enlarge bead photos and illustrations to 2K or 4K.'
        : '把拼豆参考图放大到 2K 或 4K，方便看清细节。',
      href: getLocalizedPath(locale, '/tools/image-upscaler')
    },
    {
      title: isEnglish ? 'Image splitter' : '图像分割器',
      description: isEnglish
        ? 'Slice large charts into printable sections.'
        : '把大幅图纸切成可打印的分块。',
      href: getLocalizedPath(locale, '/tools/image-splitter')
    },
    {
      title: isEnglish ? 'Watermark remover' : '去水印工具',
      description: isEnglish
        ? 'Clean unwanted marks from reference images.'
        : '清理参考图上不需要的水印和文字。',
      href: getLocalizedPath(locale, '/tools/watermark-remover')
    }
  ]);
  const pindouScenarioSlugs = [
    'bead-pattern-pet-portrait',
    'bead-pattern-anime-fanart',
    'bead-pattern-kids-craft',
    'bead-pattern-pixel-art'
  ];
  const scenarioLinks = renderSeoLinks(
    SEO_USE_CASES.filter((item) => pindouScenarioSlugs.includes(item.slug)).map(
      (item) => ({
        title: localizedText(item.title, locale),
        description: localizedText(item.summary, locale),
        href: getLocalizedPath(locale, `/blog/${item.slug}`)
      })
    )
  );
  const pindouTutorialSlugs = [
    'pindou-beginner-guide',
    'pindou-ironing-guide',
    'mard-bead-color-chart',
    'pindou-printing-guide',
    'pindou-bead-size-guide'
  ];
  const tutorialLinks = renderSeoLinks(
    SEO_BLOG_POSTS.filter((item) =>
      pindouTutorialSlugs.includes(item.slug)
    ).map((item) => ({
      title: localizedText(item.title, locale),
      description: localizedText(item.excerpt, locale),
      href: getLocalizedPath(locale, `/blog/${item.slug}`)
    }))
  );

  return `<main id="marketing-seo-ssr" class="seo-fallback marketing-seo-fallback" data-webtomind-ssr="marketing-seo">
    <article>
      <p>${isEnglish ? 'Craft utility' : '手作工具'}</p>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(intro)}</p>
      <section><h2>${isEnglish ? 'Bead pattern maker at a glance' : '拼豆生成器速览'}</h2><dl class="seo-facts">${facts}</dl></section>
      <section><h2>${isEnglish ? 'Quick reference for beginners' : '拼豆新手速查'}</h2><dl class="seo-facts">${quickReference}</dl></section>
      <section><h2>${isEnglish ? 'Bead color charts and MARD references' : '拼豆颜色表、色号对照表与 MARD 色卡'}</h2><p>${isEnglish ? 'If you are looking for a bead color chart, bead color code chart or an MARD bead color card, choose the matching palette first. The generated PNG and CSV keep each cell code visible; use the linked 291-color reference when you need RGB/HEX comparison before purchasing materials.' : '如果你在找拼豆颜色表、拼豆色号对照表、MARD 拼豆色卡或拼豆色号 RGB 转换表，可以先在工具里选择对应品牌色板。生成的 PNG 和 CSV 会保留每格色号；需要采购前核对 RGB/HEX 时，再打开 291 色对照表。'}</p><ul>${colorReferenceLinks}</ul></section>
      <section><h2>${isEnglish ? 'What the generator creates' : '生成器能做什么'}</h2><ul>${features}</ul></section>
      <section><h2>${isEnglish ? 'How to make a bead pattern' : '如何生成拼豆图纸'}</h2><ol>${workflow}</ol></section>
      <section><h2>${isEnglish ? 'Bead pattern ideas and gallery' : '拼豆图案大全与灵感'}</h2><p>${isEnglish ? 'Curated pattern directions sorted by size, color count and difficulty. Turn any idea into a printable chart with the generator.' : '按尺寸、颜色数和难度整理的拼豆图案灵感方向。选一个方向，用生成器把图片转成可打印图纸。'}</p><ul>${patternIdeaItems}</ul></section>
      <section><h2>${isEnglish ? 'Bead pattern maker FAQ' : '拼豆图案生成器 FAQ'}</h2>${faq}</section>
      <section><h2>${isEnglish ? 'Bead pattern ideas by project' : '按项目选择拼豆图纸教程'}</h2><ul>${scenarioLinks}</ul></section>
      <section><h2>${isEnglish ? 'Bead pattern tutorials' : '拼豆教程'}</h2><ul>${tutorialLinks}</ul></section>
      <section><h2>${isEnglish ? 'Related free tools' : '相关免费工具'}</h2><ul>${relatedTools}</ul></section>
      <section><h2>${isEnglish ? 'Entry links' : '入口链接'}</h2><ul>${links}</ul></section>
      <p class="seo-last-updated"><time datetime="2026-08-11">${isEnglish ? 'Last reviewed: 2026-08-11 · maintained by the WebToMind product team' : '最后更新：2026-08-11 · WebToMind 产品团队维护'}</time></p>
    </article>
  </main>`;
}

function getPromptSeoBodyForPath(
  rawPath: string,
  options: SeoPageRenderOptions = {}
): string | null {
  const pathname = normalizePath(rawPath);
  const pathWithoutLocale = stripLocale(pathname);
  if (pathname === '/zh-CN/video-prompts') {
    return renderVideoPromptHubBody(options.promptLibraryBootstrap);
  }
  if (
    isPromptStyleGridPath(pathWithoutLocale) ||
    getPromptStyleGridTemplateSeoFromPath(pathWithoutLocale)
  ) {
    return renderPromptStyleGridBody(
      pathWithoutLocale,
      getPromptStyleGridLocale(pathname)
    );
  }
  const alias = PROMPT_SEO_ALIASES.find(
    (item) => item.path === pathWithoutLocale
  );

  if (alias) {
    const locale = getLocaleFromPath(pathname);
    return renderPromptSeoBody(
      getPromptAliasBodyContent(locale === 'zh-CN' ? 'en-US' : locale, alias)
    );
  }

  const locale = getLocaleFromPath(pathname);
  if (pathWithoutLocale === '/create/prompts') {
    return renderPromptSeoBody(getPromptIndexBodyContent(locale));
  }
  if (pathWithoutLocale === '/prompts') {
    return renderPromptSeoBody(getPromptIndexBodyContent(locale));
  }

  const match = pathWithoutLocale.match(
    /^\/prompts\/(category|model|package)\/([^/]+)$/
  );
  if (match) {
    const page = getPromptSeoPage(match[1] as PromptSeoPageType, match[2]);
    if (page) {
      return renderPromptSeoBody(getPromptTopicBodyContent(locale, page));
    }
  }

  if (pathWithoutLocale.startsWith('/prompts/')) {
    return renderPromptSeoBody(getPromptIndexBodyContent(locale));
  }

  return null;
}

function getMarketingSeoBodyForPath(rawPath: string): string | null {
  const pathname = normalizePath(rawPath);
  const pathWithoutLocale = stripLocale(pathname);
  const locale = getLocaleFromPath(pathname);

  if (pathWithoutLocale === '/blog' || pathWithoutLocale === '/use-cases') {
    return renderBlogHubSeoBody(locale);
  }

  const blogSlug = pathWithoutLocale.match(/^\/blog\/([^/]+)$/)?.[1];
  if (blogSlug) {
    return renderBlogDetailSeoBody(locale, blogSlug);
  }

  const useCaseSlug = pathWithoutLocale.match(/^\/use-cases\/([^/]+)$/)?.[1];
  if (useCaseSlug) {
    return renderUseCaseDetailSeoBody(locale, useCaseSlug);
  }

  if (pathWithoutLocale === '/pricing' || pathname === '/pricing') {
    return renderPricingSeoBody(locale);
  }

  if (pathWithoutLocale === '/tools/comfyui-workflow-checker') {
    return renderComfySeoBody(locale);
  }

  if (pathWithoutLocale === '/tools/pindou-pattern-maker') {
    return renderPindouSeoBody(locale);
  }

  if (
    pathWithoutLocale === '/overview' ||
    pathWithoutLocale === '/ai-image-generator' ||
    pathWithoutLocale === '/updates' ||
    pathWithoutLocale === '/privacy' ||
    pathWithoutLocale === '/terms'
  ) {
    const seo = resolveSeoConfigForPathOrNull(pathname);
    if (!seo) return null;
    const isEnglish = locale === 'en-US';
    const links = renderSeoLinks([
      {
        title: isEnglish ? 'Prompt library' : 'Prompt 案例库',
        description: isEnglish
          ? 'Browse reusable AI image prompts and visual recipes.'
          : '浏览可复用的 AI 图片 Prompt 与视觉配方。',
        href: getLocalizedPath(locale, '/prompts')
      },
      {
        title: isEnglish ? 'Workflow guides' : '创作工作流指南',
        description: isEnglish
          ? 'Learn reproducible AI image creation workflows.'
          : '学习可复现的 AI 图片创作工作流。',
        href: getLocalizedPath(locale, '/blog')
      },
      {
        title: isEnglish ? 'Product updates' : '产品更新',
        description: isEnglish
          ? 'Follow improvements to WebToMind creation tools.'
          : '了解 WebToMind 创作工具的最新改进。',
        href: getLocalizedPath(locale, '/updates')
      }
    ]);
    const updateItems =
      pathWithoutLocale === '/updates'
        ? `<section><h2>${isEnglish ? 'Latest improvements' : '近期改进'}</h2><ul>${SEO_UPDATES.map(
            (item) =>
              `<li>${escapeHtml(localizedText(item.title, locale))}</li>`
          ).join('')}</ul></section>`
        : '';
    return `<main id="marketing-seo-ssr" class="seo-fallback marketing-seo-fallback" data-webtomind-ssr="marketing-seo">
      <article>
        <h1>${escapeHtml(seo.title)}</h1>
        <p>${escapeHtml(seo.description)}</p>
        ${updateItems}
        <section><h2>${isEnglish ? 'Explore WebToMind' : '继续探索 WebToMind'}</h2><ul>${links}</ul></section>
      </article>
    </main>`;
  }

  return null;
}

function isPromptSeoFallbackBody(body: string): boolean {
  return /\bprompt-seo-fallback\b/.test(body);
}

function getPromptLibraryBootstrapImages(
  bootstrap?: Record<string, unknown> | null,
  limit = 1
): string[] {
  const items = Array.isArray(bootstrap?.items) ? bootstrap.items : [];
  return items
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item)
    )
    .map((item) => {
      const imageUrl =
        typeof item.imageUrl === 'string' ? item.imageUrl.trim() : '';
      if (imageUrl) return imageUrl;
      const imageUrls = Array.isArray(item.imageUrls) ? item.imageUrls : [];
      return (
        imageUrls
          .find(
            (value): value is string =>
              typeof value === 'string' && Boolean(value.trim())
          )
          ?.trim() || ''
      );
    })
    .filter(Boolean)
    .slice(0, limit);
}

function getPromptLibraryBootstrapFirstImage(
  bootstrap?: Record<string, unknown> | null
): string {
  return getPromptLibraryBootstrapImages(bootstrap, 1)[0] || '';
}

function renderPromptLibraryBootstrapHead(
  bootstrap?: Record<string, unknown> | null
): string {
  if (!bootstrap || !Array.isArray(bootstrap.items)) return '';
  // Both mobile first-row cards can be LCP; desktop column tops are selected
  // by the client once the actual responsive column layout is known.
  const preload = getPromptLibraryBootstrapImages(bootstrap, 2)
    .map(
      (imageUrl) =>
        `<link rel="preload" as="image" href="${escapeHtml(
          getOptimizedPromptCaseImageUrl(imageUrl, {
            width: 520,
            quality: 72
          })
        )}" imagesrcset="${escapeHtml(
          getPromptCaseResponsiveImageSet(
            imageUrl,
            PROMPT_LIBRARY_CARD_IMAGE_WIDTHS
          )
        )}" imagesizes="${PROMPT_LIBRARY_CARD_IMAGE_SIZES}" fetchpriority="high" data-webtomind-prompt-library-preload="1" />`
    )
    .join('\n    ');
  const payload = `<script id="webtomind-prompt-library-bootstrap" type="application/json">${escapeJsonForHtml(
    bootstrap
  )}</script>`;
  return [preload, payload].filter(Boolean).join('\n    ');
}

function renderPromptSeoHandoffStyle(): string {
  return `<style id="prompt-seo-handoff-style">
    #root.webtomind-seo-handoff{min-height:100vh;background:#eef0f2}
    #root.webtomind-seo-handoff .prompt-seo-handoff-shell{--wt-sidebar:220px;--wt-gutter:32px;--wt-max:2280px;min-height:100vh;background:#eef0f2;color:#171412;font-family:Poppins,'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue','PingFang SC',system-ui,sans-serif}
    #root.webtomind-seo-handoff .prompt-seo-handoff-sidebar{position:fixed;inset:0 auto 0 0;z-index:50;display:flex;width:var(--wt-sidebar);box-sizing:border-box;flex-direction:column;padding:22px 14px 18px;border-right:1px solid rgba(29,29,31,.09);background:rgba(250,250,252,.94);color:#1d1d1f}
    #root.webtomind-seo-handoff .prompt-seo-handoff-brand{display:inline-flex;min-height:36px;align-items:center;gap:10px;font-size:16px;font-weight:720;letter-spacing:-.02em}
    #root.webtomind-seo-handoff .prompt-seo-handoff-brand-mark{display:inline-flex;width:28px;height:28px;align-items:center;justify-content:center;border-radius:9px;background:#1d1d1f;color:#fff;font-size:13px;font-weight:760}
    #root.webtomind-seo-handoff .prompt-seo-handoff-nav-links{display:grid;gap:5px;margin-top:44px}
    #root.webtomind-seo-handoff .prompt-seo-handoff-link{display:flex;min-height:42px;align-items:center;gap:11px;padding:0 11px;border-radius:12px;color:rgba(29,29,31,.66);font-size:13px;font-weight:620;background:rgba(29,29,31,.045)}
    #root.webtomind-seo-handoff .prompt-seo-handoff-link.is-active{background:#fff;color:#1d1d1f;box-shadow:0 1px 0 rgba(255,255,255,.8) inset,0 5px 18px rgba(29,29,31,.09)}
    #root.webtomind-seo-handoff .prompt-seo-handoff-create{margin-top:auto;min-height:44px;border-radius:13px;background:#1d1d1f}
    #root.webtomind-seo-handoff .prompt-seo-handoff-main{box-sizing:border-box;width:min(var(--wt-max),calc(100vw - var(--wt-sidebar) - var(--wt-gutter)*2));margin-left:calc(var(--wt-sidebar) + max(var(--wt-gutter),(100vw - var(--wt-sidebar) - var(--wt-max))/2));padding:38px 0 80px}
    #root.webtomind-seo-handoff .prompt-seo-handoff-copy{margin:0 0 24px}
    #root.webtomind-seo-handoff .prompt-seo-handoff-kicker{margin:0 0 12px;color:#943c27;font-size:12px;font-weight:860;letter-spacing:0}
    #root.webtomind-seo-handoff .prompt-seo-handoff-copy h1{margin:0;max-width:980px;color:#171412;font-size:clamp(24px,3vw,44px);font-weight:860;line-height:1.08;letter-spacing:0}
    #root.webtomind-seo-handoff .prompt-seo-handoff-copy>p:last-child{margin:12px 0 0;max-width:620px;color:#6f6a65;font-size:14px;font-weight:620;line-height:1.55}
    #root.webtomind-seo-handoff .prompt-seo-handoff-tools{height:44px;max-width:520px;border:1px solid rgba(36,32,29,.08);border-radius:999px;background:rgba(255,255,255,.74);box-shadow:0 12px 30px rgba(35,24,16,.08),inset 0 1px 0 rgba(255,255,255,.72);margin-bottom:16px}
    #root.webtomind-seo-handoff .prompt-seo-handoff-tabs{display:inline-flex;align-items:center;gap:4px;max-width:100%;min-height:34px;padding:3px;border:1px solid rgba(36,32,29,.08);border-radius:999px;background:rgba(255,255,255,.62);box-shadow:0 8px 20px rgba(35,24,16,.05),inset 0 1px 0 rgba(255,255,255,.58);margin-bottom:22px}
    #root.webtomind-seo-handoff .prompt-seo-handoff-tab{width:64px;height:28px;border-radius:999px;background:rgba(36,32,29,.08)}
    #root.webtomind-seo-handoff .prompt-seo-handoff-tab.is-active{background:#241916}
    #root.webtomind-seo-handoff .prompt-seo-handoff-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:18px}
    #root.webtomind-seo-handoff .prompt-seo-handoff-card{display:block;aspect-ratio:4/5;overflow:hidden;border-radius:16px;background:linear-gradient(110deg,#e0e3e6 8%,#f5f6f7 18%,#e0e3e6 33%);background-size:200% 100%;animation:prompt-seo-handoff-shimmer 1.35s linear infinite}
    #root.webtomind-seo-handoff .prompt-seo-handoff-card img{display:block;width:100%;height:100%;object-fit:cover}
    #root.webtomind-seo-handoff .prompt-seo-fallback{position:absolute!important;inset:auto auto auto -10000px!important;width:1px!important;height:1px!important;overflow:hidden!important;clip-path:inset(50%)!important;white-space:normal!important}
    #root.webtomind-seo-handoff .prompt-seo-handoff-mobile-nav{display:none}
    @keyframes prompt-seo-handoff-shimmer{to{background-position-x:-200%}}
    @media (min-width:821px) and (max-width:1199px){#root.webtomind-seo-handoff .prompt-seo-handoff-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}}
    @media (max-width:820px){
      #root.webtomind-seo-handoff .prompt-seo-handoff-sidebar{display:none}
      #root.webtomind-seo-handoff .prompt-seo-handoff-main{width:100%;margin-left:0;padding:24px 14px 96px}
      #root.webtomind-seo-handoff .prompt-seo-handoff-copy h1{font-size:32px}
      #root.webtomind-seo-handoff .prompt-seo-handoff-tabs{max-width:100%;overflow:hidden}
      #root.webtomind-seo-handoff .prompt-seo-handoff-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      #root.webtomind-seo-handoff .prompt-seo-handoff-mobile-nav{position:fixed;inset:auto 0 0;z-index:50;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:2px;box-sizing:border-box;padding:8px max(8px,env(safe-area-inset-left)) calc(8px + env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-right));border-top:1px solid rgba(29,29,31,.1);background:rgba(250,250,252,.96);box-shadow:0 -10px 30px rgba(29,29,31,.08)}
      #root.webtomind-seo-handoff .prompt-seo-handoff-mobile-nav span{min-height:44px;border-radius:10px;background:rgba(29,29,31,.06)}
    }
  </style>`;
}

function renderPromptSeoHandoffShell(
  body: string,
  bootstrap?: Record<string, unknown> | null,
  pathname?: string
): string {
  const headingMatch = body.match(/<h1>([\s\S]*?)<\/h1>/i);
  let heading = headingMatch?.[1] || 'WebToMind Prompt Library';
  const contentAfterHeading =
    headingMatch?.index !== undefined
      ? body.slice(headingMatch.index + headingMatch[0].length)
      : body;
  let description =
    contentAfterHeading.match(/<p>([\s\S]*?)<\/p>/i)?.[1] ||
    'Browse reusable AI image prompts and visual recipes.';
  const pathWithoutLocale = pathname ? stripLocale(pathname) : '';
  if (pathWithoutLocale === '/prompts') {
    // 提示词库根路径：SSR handoff 可见标题与客户端页面保持一致，
    // 避免刷新瞬间出现“另一套页面”的观感（SEO 正文仍保留在隐藏 fallback 中）。
    const isEnglish = getLocaleFromPath(pathname || '/') === 'en-US';
    heading = isEnglish
      ? 'Free AI Image Prompts Library'
      : 'AI 图片 Prompt 案例库';
    description = isEnglish
      ? 'Filter reusable prompt cases by model and use case, then copy or generate.'
      : '按模型和场景筛选可复用案例，复制 Prompt 后直接进入创作。';
  }
  const imageUrl = getPromptLibraryBootstrapFirstImage(bootstrap);
  const firstCard = imageUrl
    ? `<span class="prompt-seo-handoff-card"><img src="${escapeHtml(
        getOptimizedPromptCaseImageUrl(imageUrl, {
          width: 520,
          quality: 72
        })
      )}" srcset="${escapeHtml(
        getPromptCaseResponsiveImageSet(
          imageUrl,
          PROMPT_LIBRARY_CARD_IMAGE_WIDTHS
        )
      )}" sizes="${PROMPT_LIBRARY_CARD_IMAGE_SIZES}" alt="${escapeHtml(
        `${heading}案例预览`
      )}" loading="eager" decoding="sync" fetchpriority="high" width="520" height="650" /></span>`
    : '<span class="prompt-seo-handoff-card"></span>';
  const navLinks = [
    ['首页', false],
    ['提示词库', true],
    ['图像创作', false],
    ['视频创作', false],
    ['资产库', false],
    ['账户', false]
  ]
    .map(
      ([label, active]) =>
        `<span class="prompt-seo-handoff-link${
          active ? ' is-active' : ''
        }">${label}</span>`
    )
    .join('');
  const filterTabs = [true, false, false, false, false]
    .map(
      (active) =>
        `<span class="prompt-seo-handoff-tab${
          active ? ' is-active' : ''
        }"></span>`
    )
    .join('');
  const emptyCards = Array.from(
    { length: 9 },
    () => '<span class="prompt-seo-handoff-card"></span>'
  ).join('');
  return `<div class="prompt-seo-handoff-shell" data-webtomind-ssr="prompt-handoff">
    <aside class="prompt-seo-handoff-sidebar" aria-hidden="true">
      <div class="prompt-seo-handoff-brand">
        <span class="prompt-seo-handoff-brand-mark" aria-hidden="true">W</span>
        <span>WebToMind</span>
      </div>
      <nav class="prompt-seo-handoff-nav-links">${navLinks}</nav>
      <div class="prompt-seo-handoff-create"></div>
    </aside>
    <main class="prompt-seo-handoff-main">
      <header class="prompt-seo-handoff-copy">
        <p class="prompt-seo-handoff-kicker">PROMPT LIBRARY</p>
        <h1>${heading}</h1>
        <p>${description}</p>
      </header>
      <div class="prompt-seo-handoff-tools" aria-hidden="true"></div>
      <div class="prompt-seo-handoff-tabs" aria-hidden="true">${filterTabs}</div>
      <div class="prompt-seo-handoff-grid" aria-hidden="true">
        ${firstCard}
        ${emptyCards}
      </div>
    </main>
    <nav class="prompt-seo-handoff-mobile-nav" aria-hidden="true">
      <span></span><span></span><span></span><span></span><span></span><span></span>
    </nav>
  </div>`;
}

function demotePromptSeoFallbackHeading(body: string): string {
  return body.replace(
    /<h1>([\s\S]*?)<\/h1>/i,
    '<p class="prompt-seo-fallback-heading">$1</p>'
  );
}

function injectBootWatchdog(html: string): string {
  if (html.includes('data-webtomind-boot-watchdog')) return html;
  const tag =
    '<script src="/boot-watchdog.js" data-webtomind-boot-watchdog="1"></script>';
  return html.replace('</body>', `${tag}\n  </body>`);
}

function injectBodyIntoRoot(
  html: string,
  body: string,
  options: SeoPageRenderOptions = {}
): string {
  const isPromptBody = isPromptSeoFallbackBody(body);
  const injectedBody = isPromptBody
    ? `${renderPromptSeoHandoffStyle()}${renderPromptSeoHandoffShell(
        body,
        options.promptLibraryBootstrap,
        options.pathname
      )}${demotePromptSeoFallbackHeading(body)}`
    : body;
  if (/<div id="root"\s*><\/div>/i.test(html)) {
    return html.replace(
      /<div id="root"\s*><\/div>/i,
      isPromptBody
        ? `<div id="root" class="webtomind-seo-handoff">${injectedBody}</div>`
        : `<div id="root">${injectedBody}</div>`
    );
  }
  return html.replace('</body>', `${injectedBody}\n  </body>`);
}

function buildAiImageGeneratorSeo(locale: Locale): SeoPageConfig {
  const isEnglish = locale === 'en-US';
  const title = isEnglish
    ? 'AI Image Generator with Copy-Ready Prompts | WebToMind'
    : 'AI 图片生成器与可复用 Prompt | WebToMind';
  const description = isEnglish
    ? 'Generate AI images from prompts, reference images and reusable prompt cases in the WebToMind image creation studio.'
    : '在 WebToMind 图片创作台中，通过 prompt、参考图和可复用案例生成 AI 图片。';

  return {
    title,
    description,
    canonical: `${SITE_URL}/ai-image-generator`,
    locale,
    ogImage: FALLBACK_IMAGE,
    alternates: [
      { hreflang: 'zh-CN', href: `${SITE_URL}/zh-CN/create` },
      { hreflang: 'en-US', href: `${SITE_URL}/ai-image-generator` },
      { hreflang: 'x-default', href: `${SITE_URL}/ai-image-generator` }
    ],
    jsonLd: [
      ...getBaseJsonLd(locale),
      {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: title,
        applicationCategory: 'DesignApplication',
        operatingSystem: 'Web',
        url: `${SITE_URL}/ai-image-generator`,
        description,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD'
        }
      }
    ]
  };
}

function buildTutorialSeo(
  locale: Locale,
  tutorial: (typeof SEO_USE_CASES)[number]
): SeoPageConfig {
  const title = withSeoTitleSuffix(
    localizedText(tutorial.title, locale),
    ' | WebToMind'
  );
  const description = localizedText(tutorial.summary, locale);
  const canonicalPath = getLocalizedPath(locale, `/blog/${tutorial.slug}`);
  return {
    title,
    description,
    canonical: `${SITE_URL}${canonicalPath}`,
    locale,
    ogImage: absoluteImageUrl(tutorial.coverImage),
    alternates: getAlternates(`/blog/${tutorial.slug}`),
    jsonLd: [
      ...getBaseJsonLd(locale),
      {
        '@context': 'https://schema.org',
        '@type': 'HowTo',
        name: localizedText(tutorial.title, locale),
        description,
        inLanguage: locale,
        image: absoluteImageUrl(tutorial.coverImage),
        step: tutorial.steps.map((step, index) => ({
          '@type': 'HowToStep',
          position: index + 1,
          text: localizedText(step, locale)
        }))
      }
    ]
  };
}

function buildUseCasesSeo(
  locale: Locale,
  pathname: string
): SeoPageConfig | null {
  const pathWithoutLocale = stripLocale(pathname);
  const slug = pathWithoutLocale.match(/^\/use-cases\/([^/]+)$/)?.[1];
  if (slug) {
    const tutorial = SEO_USE_CASES.find((item) => item.slug === slug);
    return tutorial ? buildTutorialSeo(locale, tutorial) : null;
  }

  const isEnglish = locale === 'en-US';
  const canonicalPath = getLocalizedPath(locale, '/blog');
  const title = isEnglish ? 'WebToMind Blog' : 'WebToMind 博客';
  const description = isEnglish
    ? 'AI image tutorials, hot-keyword guides and reproducible prompt workflows for portraits, product visuals, social covers and character consistency.'
    : 'AI 图片生成教程、热门关键词指南与可复现 Prompt 工作流，覆盖 AI 写真、商品图、小红书封面、角色一致性和 Agent 时代创作方法。';
  const itemList = [
    ...SEO_USE_CASES.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${SITE_URL}${getLocalizedPath(locale, `/blog/${item.slug}`)}`,
      name: localizedText(item.title, locale)
    })),
    ...SEO_BLOG_POSTS.map((post, index) => ({
      '@type': 'ListItem',
      position: SEO_USE_CASES.length + index + 1,
      url: `${SITE_URL}${getLocalizedPath(locale, `/blog/${post.slug}`)}`,
      name: localizedText(post.title, locale)
    }))
  ];

  return {
    title,
    description,
    canonical: `${SITE_URL}${canonicalPath}`,
    locale,
    ogImage: FALLBACK_IMAGE,
    alternates: getAlternates('/blog'),
    jsonLd: [
      ...getBaseJsonLd(locale),
      {
        '@context': 'https://schema.org',
        '@type': 'Blog',
        name: title,
        description,
        url: `${SITE_URL}${canonicalPath}`,
        inLanguage: locale
      },
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        itemListElement: itemList
      }
    ]
  };
}

function buildBlogSeo(locale: Locale, pathname: string): SeoPageConfig | null {
  const pathWithoutLocale = stripLocale(pathname);
  const slug = pathWithoutLocale.match(/^\/blog\/([^/]+)$/)?.[1];
  if (slug) {
    const post = SEO_BLOG_POSTS.find((item) => item.slug === slug);
    if (!post) {
      const tutorial = SEO_USE_CASES.find((item) => item.slug === slug);
      return tutorial ? buildTutorialSeo(locale, tutorial) : null;
    }
    const title = withSeoTitleSuffix(
      localizedText(post.title, locale),
      ' | WebToMind Blog'
    );
    const description = localizedText(post.excerpt, locale);
    const canonicalPath = getLocalizedPath(locale, `/blog/${slug}`);
    return {
      title,
      description,
      canonical: `${SITE_URL}${canonicalPath}`,
      locale,
      ogImage: absoluteImageUrl(post.coverImage),
      alternates: getAlternates(`/blog/${slug}`),
      jsonLd: [
        ...getBaseJsonLd(locale),
        {
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: localizedText(post.title, locale),
          description,
          image: absoluteImageUrl(post.coverImage),
          datePublished: post.date,
          dateModified: post.date,
          author: {
            '@type': 'Organization',
            name: localizedText(post.author, locale)
          },
          mainEntityOfPage: `${SITE_URL}${canonicalPath}`,
          inLanguage: locale
        }
      ]
    };
  }

  const isEnglish = locale === 'en-US';
  const canonicalPath = getLocalizedPath(locale, '/blog');
  const title = isEnglish ? 'WebToMind Blog' : 'WebToMind 博客';
  const description = isEnglish
    ? 'AI image tutorials, hot-keyword guides and reproducible prompt workflows for portraits, product visuals, social covers and character consistency.'
    : 'AI 图片生成教程、热门关键词指南与可复现 Prompt 工作流，覆盖 AI 写真、商品图、小红书封面、角色一致性和 Agent 时代创作方法。';
  const itemList = [
    ...SEO_USE_CASES.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${SITE_URL}${getLocalizedPath(locale, `/blog/${item.slug}`)}`,
      name: localizedText(item.title, locale)
    })),
    ...SEO_BLOG_POSTS.map((post, index) => ({
      '@type': 'ListItem',
      position: SEO_USE_CASES.length + index + 1,
      url: `${SITE_URL}${getLocalizedPath(locale, `/blog/${post.slug}`)}`,
      name: localizedText(post.title, locale)
    }))
  ];

  return {
    title,
    description,
    canonical: `${SITE_URL}${canonicalPath}`,
    locale,
    ogImage: FALLBACK_IMAGE,
    alternates: getAlternates('/blog'),
    jsonLd: [
      ...getBaseJsonLd(locale),
      {
        '@context': 'https://schema.org',
        '@type': 'Blog',
        name: title,
        description,
        url: `${SITE_URL}${canonicalPath}`,
        inLanguage: locale
      },
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        itemListElement: itemList
      }
    ]
  };
}

function buildComfySeo(locale: Locale): SeoPageConfig {
  const isEnglish = locale === 'en-US';
  const canonicalPath = getLocalizedPath(
    locale,
    '/tools/comfyui-workflow-checker'
  );
  const title = isEnglish
    ? 'ComfyUI Workflow Checker & JSON Validator'
    : 'ComfyUI Workflow 检查器 | 缺失模型与节点诊断';
  const description = isEnglish
    ? 'Validate a ComfyUI workflow JSON online. Find missing models and custom nodes, inspect prompts and dimensions, and flag migration risks before running it.'
    : '粘贴或上传 ComfyUI workflow JSON，检查缺失模型、custom nodes、prompt、尺寸和迁移风险，再带入 WebToMind 生成。';
  return {
    title,
    description,
    canonical: `${SITE_URL}${canonicalPath}`,
    locale,
    ogImage: FALLBACK_IMAGE,
    alternates: getAlternates('/tools/comfyui-workflow-checker'),
    jsonLd: [
      ...getBaseJsonLd(locale),
      {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: title,
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Web',
        url: `${SITE_URL}${canonicalPath}`,
        description
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: isEnglish
              ? 'Does the checker upload my ComfyUI workflow?'
              : '检查器会上传我的 ComfyUI workflow 吗？',
            acceptedAnswer: {
              '@type': 'Answer',
              text: isEnglish
                ? 'No. The v1 checker parses the workflow in the browser and does not upload the raw JSON.'
                : '不会。v1 检查器只在浏览器内解析 workflow，不上传原始 JSON。'
            }
          },
          {
            '@type': 'Question',
            name: isEnglish ? 'What can it detect?' : '它能检查什么？',
            acceptedAnswer: {
              '@type': 'Answer',
              text: isEnglish
                ? 'It detects model references, LoRA, VAE, ControlNet, custom node clues, prompts, dimensions and migration risks.'
                : '它会检查模型、LoRA、VAE、ControlNet、custom node 线索、prompt、尺寸和迁移风险。'
            }
          }
        ]
      }
    ]
  };
}

function buildPindouSeo(locale: Locale): SeoPageConfig {
  const isEnglish = locale === 'en-US';
  const canonicalPath = getLocalizedPath(locale, '/tools/pindou-pattern-maker');
  const title = isEnglish
    ? 'Free Bead Pattern Ideas & Perler Bead Pattern Maker'
    : '免费拼豆生成器 - 在线拼豆图案图纸生成';
  const description = isEnglish
    ? 'Free bead pattern ideas for pet portraits, anime, pixel art and kids crafts, plus a photo-to-grid maker with 8 brand palettes, bead counts and PDF export.'
    : '免费拼豆生成器：上传图片在线生成拼豆图案图纸，支持 8 套品牌色板匹配、色号统计与 PNG/CSV/PDF 分页导出，无需注册。';
  return {
    title,
    description,
    canonical: `${SITE_URL}${canonicalPath}`,
    locale,
    ogImage: FALLBACK_IMAGE,
    alternates: getAlternates('/tools/pindou-pattern-maker'),
    jsonLd: [
      ...getBaseJsonLd(locale),
      {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: title,
        applicationCategory: 'DesignApplication',
        operatingSystem: 'Web',
        inLanguage: locale,
        url: `${SITE_URL}${canonicalPath}`,
        description,
        dateModified: '2026-08-11',
        featureList: [
          isEnglish ? 'Free to use without registration' : '免费使用、无需注册',
          isEnglish
            ? '8 brand palettes with 1502 standard color codes'
            : '8 套品牌色板、1502 个标准色号',
          isEnglish
            ? 'Browser-local processing, images never uploaded'
            : '浏览器本地处理，原图不上传',
          isEnglish
            ? 'PNG chart with coordinates and per-cell color codes'
            : 'PNG 图纸（坐标与每格色号）',
          isEnglish
            ? 'CSV material list and paginated PDF worksheet'
            : 'CSV 采购清单与分页 PDF 制作说明',
          isEnglish
            ? 'Dominant/average pixelation, background removal and manual editing'
            : '主色/平均色像素化、自动去背景与手工编辑'
        ],
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD'
        }
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: isEnglish
              ? 'Is the bead pattern maker free?'
              : '这个拼豆图案生成器免费吗？',
            acceptedAnswer: {
              '@type': 'Answer',
              text: isEnglish
                ? 'Yes. The tool can generate and export bead patterns without sign-up.'
                : '免费。工具可以直接生成并导出拼豆图纸，不需要先注册。'
            }
          },
          {
            '@type': 'Question',
            name: isEnglish
              ? 'Are uploaded photos saved?'
              : '上传的图片会被保存吗？',
            acceptedAnswer: {
              '@type': 'Answer',
              text: isEnglish
                ? 'No. Image conversion runs locally in the browser for the pattern-making workflow.'
                : '不会。拼豆图案转换在浏览器本地运行，原始图片不会因此上传。'
            }
          },
          {
            '@type': 'Question',
            name: isEnglish
              ? 'Which bead palettes are supported?'
              : '支持哪些拼豆色板？',
            acceptedAnswer: {
              '@type': 'Answer',
              text: isEnglish
                ? 'The tool includes 8 brand palettes: Perler, Hama and Artkal basics, plus MARD, COCO, 漫漫, 盼盼 and 咪小窝 Chinese brand palettes — 1502 standard color codes in total.'
                : '工具内置 Perler、Hama、Artkal、MARD、COCO、漫漫、盼盼、咪小窝 8 套色板，共 1502 个标准色号。'
            }
          },
          {
            '@type': 'Question',
            name: isEnglish
              ? 'What image size works best?'
              : '什么尺寸的图片效果最好？',
            acceptedAnswer: {
              '@type': 'Answer',
              text: isEnglish
                ? 'Start at 40-80 beads wide for photos with clear subjects; lower the width for pixel-art style.'
                : '主体清晰的照片建议从 40-80 珠宽开始，宽度越小越接近像素画风格。'
            }
          },
          {
            '@type': 'Question',
            name: isEnglish
              ? 'Can I mix beads from different brands?'
              : '可以混用不同品牌的珠子吗？',
            acceptedAnswer: {
              '@type': 'Answer',
              text: isEnglish
                ? 'Yes, but pick one brand palette in the tool so the chart matches the beads you buy.'
                : '可以，但建议选定一个品牌色板并按该品牌采购，避免色差。'
            }
          },
          {
            '@type': 'Question',
            name: isEnglish
              ? 'How do I avoid warping when ironing?'
              : '熨烫时如何避免变形？',
            acceptedAnswer: {
              '@type': 'Answer',
              text: isEnglish
                ? 'Iron evenly at medium heat and cool the piece under weight before removing it from the pegboard.'
                : '中温均匀熨烫，熨完压上重物冷却后再取下底板。'
            }
          },
          {
            '@type': 'Question',
            name: isEnglish
              ? 'Where can I find bead pattern ideas?'
              : '拼豆图案去哪里找？',
            acceptedAnswer: {
              '@type': 'Answer',
              text: isEnglish
                ? 'Browse the pattern idea gallery for pet portraits, anime fan art, pixel art, kids crafts and 3D builds, then turn any image into a printable chart with the maker.'
                : '在图案大全与灵感里按宠物、动漫、像素画、亲子手工和 3D 等方向挑选，再用生成器把任意图片转成可打印图纸。'
            }
          },
          {
            '@type': 'Question',
            name: isEnglish
              ? 'Does the PDF split large charts into printable pages?'
              : 'PDF 会把大图纸分页吗？',
            acceptedAnswer: {
              '@type': 'Answer',
              text: isEnglish
                ? 'Yes. Large charts are paginated at 50x50 cells per page with coordinates and color codes, so you can print and assemble section by section.'
                : '会。大图纸按每页 50×50 格分页，每页带坐标与色号，可逐页打印后拼合制作。'
            }
          },
          {
            '@type': 'Question',
            name: isEnglish
              ? 'How many colors does the tool support?'
              : '工具支持多少色号？',
            acceptedAnswer: {
              '@type': 'Answer',
              text: isEnglish
                ? '8 brand palettes totaling 1502 standard color codes: Perler, Hama and Artkal basics, plus the MARD, COCO, Manman, Panpan and Mixiaowo Chinese brand palettes.'
                : '共 8 套品牌色板、1502 个标准色号：Perler、Hama、Artkal 基础色板，以及 MARD、COCO、漫漫、盼盼、咪小窝 5 套中文品牌色板。'
            }
          }
        ]
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: isEnglish ? 'Free tools' : '免费工具',
            item: `${SITE_URL}${getLocalizedPath(locale, '/apps')}`
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: title,
            item: `${SITE_URL}${canonicalPath}`
          }
        ]
      },
      {
        '@context': 'https://schema.org',
        '@type': 'HowTo',
        name: title,
        description,
        totalTime: 'PT15M',
        step: [
          {
            '@type': 'HowToStep',
            position: 1,
            name: isEnglish ? 'Upload an image' : '上传图片',
            text: isEnglish
              ? 'Upload a JPG, PNG or WebP image, or import an existing bead-grid CSV.'
              : '上传 JPG、PNG、WebP 图片，或导入已有的拼豆图纸 CSV。'
          },
          {
            '@type': 'HowToStep',
            position: 2,
            name: isEnglish
              ? 'Pick a palette and grid size'
              : '选择色板与图纸宽度',
            text: isEnglish
              ? 'Choose one of 8 brand palettes and set the bead width for your pegboard.'
              : '从 8 套品牌色板中选择，并根据底板设置宽度珠子数。'
          },
          {
            '@type': 'HowToStep',
            position: 3,
            name: isEnglish ? 'Generate and refine' : '生成并精修',
            text: isEnglish
              ? 'Generate the chart, then use paint, color replace or connected erase to refine it.'
              : '生成图纸后，用画笔、整色替换或连通擦除精修细节。'
          },
          {
            '@type': 'HowToStep',
            position: 4,
            name: isEnglish ? 'Export the chart' : '导出图纸',
            text: isEnglish
              ? 'Download PNG with per-cell color codes, CSV material counts, or a PDF worksheet that paginates large charts at 50x50 cells.'
              : '下载带色号的 PNG 图纸、CSV 采购清单，或按 50×50 格分页的 PDF 制作说明。'
          }
        ]
      }
    ]
  };
}

function buildSimpleSeo(
  locale: Locale,
  pathname: string
): SeoPageConfig | null {
  const pathWithoutLocale = stripLocale(pathname);
  const isEnglish = locale === 'en-US';

  if (
    pathWithoutLocale === '/login' ||
    pathWithoutLocale === '/auth/callback' ||
    pathWithoutLocale === '/boards' ||
    pathWithoutLocale.startsWith('/boards/') ||
    pathWithoutLocale.startsWith('/s/')
  ) {
    const title = isEnglish ? 'WebToMind Account Area' : 'WebToMind 账号区域';
    const description = isEnglish
      ? 'Private WebToMind account and shared workspace routes.'
      : 'WebToMind 私有账号与分享工作区页面。';
    return {
      title,
      description,
      canonical: `${SITE_URL}${pathname}`,
      locale,
      robots: 'noindex,nofollow',
      ogImage: FALLBACK_IMAGE
    };
  }

  if (
    pathWithoutLocale === '/skills' ||
    pathWithoutLocale.startsWith('/skills/')
  ) {
    const canonicalPath = getLocalizedPath(locale, pathWithoutLocale);
    return {
      title: isEnglish ? 'WebToMind Creation Templates' : 'WebToMind 作品模板',
      description: isEnglish
        ? 'Legacy WebToMind creation templates are being reworked for the image-first workflow.'
        : 'WebToMind 旧作品模板正在按图片创作工作流重新规划。',
      canonical: `${SITE_URL}${canonicalPath}`,
      locale,
      robots: 'noindex,follow',
      ogImage: FALLBACK_IMAGE,
      alternates: getAlternates(pathWithoutLocale)
    };
  }

  if (pathWithoutLocale === '/updates') {
    const canonicalPath = getLocalizedPath(locale, '/updates');
    const title = isEnglish
      ? 'WebToMind Product Updates'
      : 'WebToMind 产品更新';
    const description = isEnglish
      ? 'Follow WebToMind updates for AI image creation, prompt libraries, prompt reverse engineering and workflow improvements.'
      : '查看 WebToMind 在 AI 图片创作、Prompt 案例库、参考图反推和工作流体验上的产品更新。';
    return {
      title,
      description,
      canonical: `${SITE_URL}${canonicalPath}`,
      locale,
      ogImage: FALLBACK_IMAGE,
      alternates: getAlternates('/updates'),
      jsonLd: [
        ...getBaseJsonLd(locale),
        {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: title,
          itemListElement: SEO_UPDATES.map((item, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: localizedText(item.title, locale)
          }))
        }
      ]
    };
  }

  if (pathWithoutLocale === '/links') {
    const canonicalPath = getLocalizedPath(locale, '/links');
    return {
      title: isEnglish ? 'WebToMind Partner Links' : 'WebToMind 合作链接',
      description: isEnglish
        ? 'Partner directories and related external links for WebToMind.'
        : 'WebToMind 的合作目录站点与相关外部链接。',
      canonical: `${SITE_URL}${canonicalPath}`,
      locale,
      robots: 'noindex,follow',
      ogImage: FALLBACK_IMAGE,
      alternates: getAlternates('/links')
    };
  }

  if (pathWithoutLocale === '/pricing' || pathname === '/pricing') {
    const canonicalPath =
      pathname === '/pricing'
        ? '/zh-CN/pricing'
        : getLocalizedPath(locale, '/pricing');
    return {
      title: isEnglish ? 'WebToMind Pricing' : 'WebToMind 价格与积分套餐',
      description: isEnglish
        ? 'Choose WebToMind credit packages and memberships for AI image generation, prompt reuse and workflow automation.'
        : '选择 WebToMind AI 图片生成、Prompt 复用和工作流自动化所需的积分套餐与会员方案。',
      canonical: `${SITE_URL}${canonicalPath}`,
      locale,
      ogImage: FALLBACK_IMAGE,
      alternates: getAlternates('/pricing'),
      jsonLd: getBaseJsonLd(locale)
    };
  }

  if (pathWithoutLocale === '/privacy' || pathWithoutLocale === '/terms') {
    const isPrivacy = pathWithoutLocale === '/privacy';
    const canonicalPath = getLocalizedPath(locale, pathWithoutLocale);
    return {
      title: isPrivacy
        ? isEnglish
          ? 'Privacy Policy | WebToMind'
          : '隐私政策 | WebToMind'
        : isEnglish
          ? 'Terms of Service | WebToMind'
          : '服务条款 | WebToMind',
      description: isPrivacy
        ? isEnglish
          ? 'Learn how WebToMind collects, uses, stores and protects account, payment and creative workflow data.'
          : '了解 WebToMind 如何收集、使用、存储和保护账号、支付及 AI 创作工作流相关数据。'
        : isEnglish
          ? 'Review the terms that govern WebToMind accounts, AI creation services, credits, payments and acceptable use.'
          : '查看适用于 WebToMind 账号、AI 创作服务、积分、支付及合理使用行为的服务条款。',
      canonical: `${SITE_URL}${canonicalPath}`,
      locale,
      ogImage: FALLBACK_IMAGE,
      alternates: getAlternates(pathWithoutLocale)
    };
  }

  return null;
}

export function resolveSeoConfigForPath(
  rawPath: string,
  options: SeoPageRenderOptions = {}
): SeoPageConfig {
  return (
    resolveSeoConfigForPathOrNull(rawPath, options) ||
    buildHomeSeo('zh-CN', '/')
  );
}

export function resolveSeoConfigForPathOrNull(
  rawPath: string,
  options: SeoPageRenderOptions = {}
): SeoPageConfig | null {
  const pathname = normalizePath(rawPath);
  const locale = getLocaleFromPath(pathname);
  const pathWithoutLocale = stripLocale(pathname);
  const promptAlias = PROMPT_SEO_ALIASES.find(
    (alias) => alias.path === pathWithoutLocale
  );

  if (
    isPromptStyleGridPath(pathWithoutLocale) ||
    getPromptStyleGridTemplateSeoFromPath(pathWithoutLocale)
  ) {
    return buildPromptStyleGridSeo(
      pathWithoutLocale,
      getPromptStyleGridLocale(pathname)
    );
  }

  if (promptAlias) {
    return buildPromptAliasSeo(
      locale === 'zh-CN' ? 'en-US' : locale,
      promptAlias
    );
  }

  if (pathWithoutLocale === '/ai-image-generator') {
    return buildAiImageGeneratorSeo('en-US');
  }

  if (pathname === '/' || pathWithoutLocale === '/overview') {
    const canonicalPath =
      pathname === '/' ? '/' : getLocalizedPath(locale, '/overview');
    return buildHomeSeo(locale, canonicalPath);
  }

  if (
    pathWithoutLocale === '/create' ||
    pathWithoutLocale === '/create/prompts'
  ) {
    return buildCreateSeo(locale, pathname);
  }

  if (pathWithoutLocale === '/prompts') {
    return buildPromptIndexSeo(locale);
  }

  if (pathname === '/zh-CN/video-prompts') {
    return buildVideoPromptHubSeo(options);
  }

  if (pathWithoutLocale.startsWith('/prompts/')) {
    return buildPromptSeo(locale, pathname);
  }

  if (pathWithoutLocale.startsWith('/use-cases')) {
    return buildUseCasesSeo(locale, pathname);
  }

  if (pathWithoutLocale.startsWith('/blog')) {
    return buildBlogSeo(locale, pathname);
  }

  if (pathWithoutLocale === '/tools/comfyui-workflow-checker') {
    return buildComfySeo(locale);
  }

  if (pathWithoutLocale === '/tools/pindou-pattern-maker') {
    return buildPindouSeo(locale);
  }

  return buildSimpleSeo(locale, pathname) || null;
}

export function injectSeo(html: string, seo: SeoPageConfig): string {
  const htmlLang = seo.locale === 'en-US' ? 'en' : 'zh-CN';
  const ogType = seo.ogType || 'website';
  const ogImage = absoluteImageUrl(seo.ogImage);
  const robots = seo.robots || 'index,follow';
  const alternates = seo.alternates || [];
  const jsonLd = Array.isArray(seo.jsonLd)
    ? seo.jsonLd
    : seo.jsonLd
      ? [seo.jsonLd]
      : [];

  let nextHtml = html.replace(
    /<html\s+lang="[^"]*"/,
    `<html lang="${htmlLang}"`
  );
  nextHtml = replaceTag(
    nextHtml,
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeHtml(seo.title)}</title>`
  );
  nextHtml = replaceTag(
    nextHtml,
    /<meta\s+name="description"[\s\S]*?\/>/i,
    `<meta name="description" content="${escapeHtml(seo.description)}" />`
  );
  nextHtml = replaceTag(
    nextHtml,
    /<meta\s+name="robots"[\s\S]*?\/>/i,
    `<meta name="robots" content="${escapeHtml(robots)}" />`
  );
  nextHtml = replaceTag(
    nextHtml,
    /<link\s+rel="canonical"[\s\S]*?\/>/i,
    `<link rel="canonical" href="${escapeHtml(seo.canonical)}" />`
  );
  nextHtml = replaceTag(
    nextHtml,
    /<meta\s+property="og:type"[\s\S]*?\/>/i,
    `<meta property="og:type" content="${escapeHtml(ogType)}" />`
  );
  nextHtml = replaceTag(
    nextHtml,
    /<meta\s+property="og:title"[\s\S]*?\/>/i,
    `<meta property="og:title" content="${escapeHtml(seo.title)}" />`
  );
  nextHtml = replaceTag(
    nextHtml,
    /<meta\s+property="og:description"[\s\S]*?\/>/i,
    `<meta property="og:description" content="${escapeHtml(seo.description)}" />`
  );
  nextHtml = replaceTag(
    nextHtml,
    /<meta\s+property="og:url"[\s\S]*?\/>/i,
    `<meta property="og:url" content="${escapeHtml(seo.canonical)}" />`
  );
  nextHtml = replaceTag(
    nextHtml,
    /<meta\s+property="og:image"[\s\S]*?\/>/i,
    `<meta property="og:image" content="${escapeHtml(ogImage)}" />`
  );
  nextHtml = replaceTag(
    nextHtml,
    /<meta\s+name="twitter:title"[\s\S]*?\/>/i,
    `<meta name="twitter:title" content="${escapeHtml(seo.title)}" />`
  );
  nextHtml = replaceTag(
    nextHtml,
    /<meta\s+name="twitter:description"[\s\S]*?\/>/i,
    `<meta name="twitter:description" content="${escapeHtml(seo.description)}" />`
  );
  nextHtml = replaceTag(
    nextHtml,
    /<meta\s+name="twitter:image"[\s\S]*?\/>/i,
    `<meta name="twitter:image" content="${escapeHtml(ogImage)}" />`
  );

  const alternateHtml = alternates
    .map(
      (alternate) =>
        `<link rel="alternate" hreflang="${escapeHtml(alternate.hreflang)}" href="${escapeHtml(alternate.href)}" />`
    )
    .join('\n    ');
  if (jsonLd.length > 0) {
    nextHtml = removeExistingJsonLd(nextHtml);
  }

  const jsonLdHtml = jsonLd
    .map(
      (item) =>
        `<script type="application/ld+json">${escapeJsonForHtml(item)}</script>`
    )
    .join('\n    ');
  const injectedHead = [alternateHtml, jsonLdHtml]
    .filter(Boolean)
    .join('\n    ');

  return injectedHead
    ? nextHtml.replace('</head>', `    ${injectedHead}\n  </head>`)
    : nextHtml;
}

export function injectPromptLibraryBootstrap(
  html: string,
  options: SeoPageRenderOptions,
  preloadRoute = false
): string {
  // Build-generated paths keep preloads aligned with the deployed release.
  // Do not execute the route here or preload its dynamic preview dependencies.
  if (options.promptLibraryBootstrap || preloadRoute) {
    const rawAssets = html.match(
      /<script\b[^>]*id="webtomind-prompt-route-assets"[^>]*>([\s\S]*?)<\/script>/i
    )?.[1];
    try {
      const assets: unknown = rawAssets ? JSON.parse(rawAssets) : [];
      if (Array.isArray(assets)) {
        const links = [...new Set(assets)]
          .filter(
            (asset): asset is string =>
              typeof asset === 'string' &&
              /^\/assets\/[a-zA-Z0-9._-]+\.js$/.test(asset)
          )
          .filter(
            (asset) =>
              !html.includes(
                `rel="modulepreload" crossorigin href="${asset}"`
              ) && !html.includes(`src="${asset}"`)
          )
          .map(
            (asset) =>
              `<link rel="modulepreload" crossorigin href="${asset}" data-webtomind-prompt-route-preload="1" />`
          )
          .join('\n');
        if (links) html = html.replace('</head>', `${links}\n</head>`);
      }
    } catch {
      // Old builds without the metadata remain valid app shells.
    }
  }
  const bootstrapHead = renderPromptLibraryBootstrapHead(
    options.promptLibraryBootstrap
  );
  return bootstrapHead
    ? html.replace('</head>', `    ${bootstrapHead}\n  </head>`)
    : html;
}

export function renderSeoPageHtml(
  html: string,
  rawPath: string,
  options: SeoPageRenderOptions = {}
): string {
  const renderOptions = { ...options, pathname: rawPath };
  const nextHtml = injectPromptLibraryBootstrap(
    injectSeo(html, resolveSeoConfigForPath(rawPath, renderOptions)),
    renderOptions
  );
  const seoBody =
    getPromptSeoBodyForPath(rawPath, renderOptions) ||
    getMarketingSeoBodyForPath(rawPath);
  return injectBootWatchdog(
    seoBody ? injectBodyIntoRoot(nextHtml, seoBody, renderOptions) : nextHtml
  );
}

export function renderSeoPageHtmlWithStatus(
  html: string,
  rawPath: string,
  options: SeoPageRenderOptions = {}
): SeoPageRenderResult {
  const renderOptions = { ...options, pathname: rawPath };
  const seo = resolveSeoConfigForPathOrNull(rawPath, renderOptions);
  if (!seo) {
    const pathname = normalizePath(rawPath);
    return {
      html: injectBootWatchdog(
        injectSeo(html, {
          title: 'Page not found | WebToMind',
          description: 'The requested WebToMind SEO page was not found.',
          canonical: `${SITE_URL}${pathname}`,
          locale: getLocaleFromPath(pathname),
          robots: 'noindex,follow',
          ogImage: FALLBACK_IMAGE
        })
      ),
      status: 404
    };
  }

  const nextHtml = injectPromptLibraryBootstrap(
    injectSeo(html, seo),
    renderOptions
  );
  const seoBody =
    getPromptSeoBodyForPath(rawPath, renderOptions) ||
    getMarketingSeoBodyForPath(rawPath);
  return {
    html: injectBootWatchdog(
      seoBody ? injectBodyIntoRoot(nextHtml, seoBody, renderOptions) : nextHtml
    ),
    status: 200
  };
}

export function renderNoindexAppShellHtml(
  html: string,
  rawPath: string,
  localeOverride?: 'zh-CN' | 'en-US'
): string {
  const pathname = normalizePath(rawPath);
  const locale = localeOverride ?? getLocaleFromPath(pathname);
  const isEnglish = locale === 'en-US';
  return injectBootWatchdog(
    injectSeo(html, {
      title: isEnglish ? 'WebToMind Workspace' : 'WebToMind 工作台',
      description: isEnglish
        ? 'Private WebToMind workspace and account area.'
        : 'WebToMind 私有工作台与账号区域。',
      canonical: `${SITE_URL}${pathname}`,
      locale,
      robots: 'noindex,nofollow',
      ogImage: FALLBACK_IMAGE
    })
  );
}
