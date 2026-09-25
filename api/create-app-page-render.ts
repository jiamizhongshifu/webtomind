import { replaceSeoTag } from './seo-render-utils.js';
import { renderPindouSeoBody } from './seo-page-render.js';
import {
  getLocalizedCreateAppContent,
  getLocalizedCreateAppContentItems,
  type LocalizedCreateAppContentItem
} from '../src/shared/create-apps.js';

const SITE_URL = 'https://webtomind.com';
const FALLBACK_IMAGE = `${SITE_URL}/icons/logo-icon.svg`;

type Locale = 'zh-CN' | 'en-US';

type CreateAppSeoConfig = {
  app: LocalizedCreateAppContentItem | null;
  locale: Locale;
  slug: string;
  title: string;
  description: string;
  canonical: string;
  robots?: string;
  alternates: Array<{ hreflang: string; href: string }>;
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

function absoluteImageUrl(imageUrl: string | undefined): string {
  if (!imageUrl) return FALLBACK_IMAGE;
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }
  if (imageUrl.startsWith('data:')) return FALLBACK_IMAGE;
  return `${SITE_URL}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
}

function getLocalizedPath(locale: Locale, slug: string): string {
  return `/${locale}/tools/${encodeURIComponent(slug)}`;
}

function upsertTag(html: string, pattern: RegExp, replacement: string): string {
  const replaced = replaceSeoTag(html, pattern, replacement);
  return replaced === html
    ? html.replace('</head>', `    ${replacement}\n  </head>`)
    : replaced;
}

export function buildCreateAppSeoConfig(params: {
  slug: string;
  locale: Locale;
}): CreateAppSeoConfig {
  const slug = params.slug.trim();
  const app = getLocalizedCreateAppContent(slug, params.locale) || null;
  const isIndex = !slug;
  const isEnglish = params.locale === 'en-US';
  const title = app
    ? `${app.seoTitle || app.title} | ${isEnglish ? 'WebToMind Tool' : 'WebToMind 图片工具'}`
    : !isIndex
      ? isEnglish
        ? 'App not found | WebToMind'
        : '应用不存在 | WebToMind'
      : isEnglish
        ? 'Free Online Image Tools | WebToMind'
        : '免费在线图片工具 | WebToMind';
  const description = app
    ? app.seoDescription || app.description
    : !isIndex
      ? isEnglish
        ? 'The requested WebToMind creator app could not be found.'
        : '未找到请求的 WebToMind 创作应用。'
      : isEnglish
        ? 'Use six focused tools for image upscaling, splitting, watermark removal, GPT Image 2 denoising, compression, and bead patterns.'
        : '使用六个专注的图片工具完成放大、分割、去水印、GPT Image 2 降噪、压缩和拼豆图案生成。';
  const canonicalPath = isIndex
    ? `/${params.locale}/apps`
    : getLocalizedPath(params.locale, slug);
  const zhHref = isIndex
    ? `${SITE_URL}/zh-CN/apps`
    : `${SITE_URL}${getLocalizedPath('zh-CN', slug)}`;
  const enHref = isIndex
    ? `${SITE_URL}/en-US/apps`
    : `${SITE_URL}${getLocalizedPath('en-US', slug)}`;

  return {
    app,
    locale: params.locale,
    slug,
    title,
    description,
    canonical: `${SITE_URL}${canonicalPath}`,
    robots: !isIndex && !app ? 'noindex,follow' : undefined,
    alternates: [
      { hreflang: 'zh-CN', href: zhHref },
      { hreflang: 'en-US', href: enHref },
      { hreflang: 'x-default', href: enHref }
    ]
  };
}

function buildJsonLd(seo: CreateAppSeoConfig): Array<Record<string, unknown>> {
  const localizedApps = getLocalizedCreateAppContentItems(seo.locale);
  const base = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'WebToMind',
      url: SITE_URL,
      logo: FALLBACK_IMAGE
    }
  ];

  if (!seo.app && !seo.slug) {
    return [
      ...base,
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: seo.title,
        description: seo.description,
        url: seo.canonical,
        inLanguage: seo.locale,
        hasPart: localizedApps.map((item) => ({
          '@type': 'SoftwareApplication',
          name: item.title,
          url: `${SITE_URL}${getLocalizedPath(seo.locale, item.slug)}`
        }))
      }
    ];
  }

  if (!seo.app) return base;

  return [
    ...base,
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: seo.title,
      applicationCategory: 'DesignApplication',
      operatingSystem: seo.app.operatingSystem || 'Web',
      url: seo.canonical,
      image: absoluteImageUrl(seo.app.coverImage),
      description: seo.description,
      keywords: seo.app.seoKeywords.join(', '),
      ...(seo.app.capabilityNote
        ? { featureList: [seo.app.capabilityNote] }
        : {}),
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD'
      }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name:
        seo.locale === 'en-US'
          ? `${seo.title} workflow`
          : `${seo.title} 使用流程`,
      description: seo.description,
      inLanguage: seo.locale,
      step: seo.app.steps.map((step, index) => ({
        '@type': 'HowToStep',
        position: index + 1,
        text: step
      }))
    }
  ];
}

function renderSeoBody(seo: CreateAppSeoConfig): string {
  const app = seo.app;
  const isEnglish = seo.locale === 'en-US';
  if (!app && seo.slug) {
    return `<main id="create-app-seo" class="seo-fallback">
      <h1>${isEnglish ? 'App not found' : '应用不存在'}</h1>
      <p>${escapeHtml(seo.description)}</p>
      <a href="/${seo.locale}/apps">${isEnglish ? 'Browse all apps' : '浏览全部应用'}</a>
    </main>`;
  }
  if (!app) {
    const items = getLocalizedCreateAppContentItems(seo.locale)
      .map(
        (item) =>
          `<li><a href="/${seo.locale}${escapeHtml(item.href)}">${escapeHtml(item.title)}</a> - ${escapeHtml(item.description)}</li>`
      )
      .join('');
    return `<main id="create-app-seo" class="seo-fallback">
      <h1>${escapeHtml(seo.title)}</h1>
      <p>${escapeHtml(seo.description)}</p>
      <ul>${items}</ul>
    </main>`;
  }

  const useCases = app.useCases
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('');
  const steps = app.steps
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('');
  const keywords = app.seoKeywords
    .map((item) => `<span>${escapeHtml(item)}</span>`)
    .join(' ');
  const faq = (app.faq || [])
    .map(
      (item) => `<article>
        <h3>${escapeHtml(item.question)}</h3>
        <p>${escapeHtml(item.answer)}</p>
      </article>`
    )
    .join('');
  const relatedTools = getLocalizedCreateAppContentItems(seo.locale)
    .filter((item) => item.slug !== app.slug)
    .slice(0, 3)
    .map(
      (item) => `<article>
        <h3><a href="/${seo.locale}${escapeHtml(item.href)}">${escapeHtml(item.title)}</a></h3>
        <p>${escapeHtml(item.description)}</p>
      </article>`
    )
    .join('');

  return `<main id="create-app-seo" class="seo-fallback">
    <article>
      <p>${app.processing === 'local' ? (isEnglish ? 'Local browser tool' : '浏览器本地工具') : app.processing === 'service' ? (isEnglish ? 'Connected cleaning service' : '连接式清理服务') : isEnglish ? 'Local-first hybrid tool' : '本地优先混合工具'}</p>
      <h1>${escapeHtml(app.title)}</h1>
      <p>${escapeHtml(seo.description)}</p>
      ${app.capabilityNote ? `<aside><strong>${isEnglish ? 'Capability boundary:' : '能力边界：'}</strong> ${escapeHtml(app.capabilityNote)}</aside>` : ''}
      <p>${isEnglish ? 'Supported formats' : '支持格式'}: ${escapeHtml(app.inputFormats.join(', '))} → ${escapeHtml(app.outputFormats.join(', '))}</p>
      <img src="${escapeHtml(absoluteImageUrl(app.coverImage))}" alt="${escapeHtml(app.title)} 工具封面" />
      <section>
        <h2>${isEnglish ? 'Creative problems this app solves' : '适合用它解决的创作问题'}</h2>
        <ul>${useCases}</ul>
      </section>
      <section>
        <h2>${isEnglish ? 'Start in three steps' : '三步开始'}</h2>
        <ol>${steps}</ol>
      </section>
      <section>
        <h2>${isEnglish ? 'Related search intent' : '相关搜索意图'}</h2>
        <p>${keywords}</p>
      </section>
      ${faq ? `<section><h2>${isEnglish ? 'Common questions' : '常见问题'}</h2>${faq}</section>` : ''}
      ${relatedTools ? `<section><h2>${isEnglish ? 'Related tools' : '相关工具'}</h2>${relatedTools}</section>` : ''}
    </article>
  </main>`;
}

export function injectCreateAppSeo(
  html: string,
  seo: CreateAppSeoConfig
): string {
  const ogImage = absoluteImageUrl(seo.app?.coverImage);
  const jsonLd = buildJsonLd(seo);
  const alternates = seo.alternates
    .map(
      (alternate) =>
        `<link rel="alternate" hreflang="${escapeHtml(alternate.hreflang)}" href="${escapeHtml(alternate.href)}" />`
    )
    .join('\n    ');

  let nextHtml = html;
  nextHtml = nextHtml.replace(
    /<html([^>]*)>/i,
    (_match, attrs: string) =>
      `<html${String(attrs).replace(/\s+lang=(["']).*?\1/i, '')} lang="${seo.locale}">`
  );
  nextHtml = upsertTag(
    nextHtml,
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeHtml(seo.title)}</title>`
  );
  nextHtml = upsertTag(
    nextHtml,
    /<meta\s+name=["']description["'][^>]*>/i,
    `<meta name="description" content="${escapeHtml(seo.description)}" />`
  );
  nextHtml = upsertTag(
    nextHtml,
    /<meta\s+name=["']robots["'][^>]*>/i,
    `<meta name="robots" content="${escapeHtml(seo.robots || 'index,follow')}" />`
  );
  nextHtml = upsertTag(
    nextHtml,
    /<link\s+rel=["']canonical["'][^>]*>/i,
    `<link rel="canonical" href="${escapeHtml(seo.canonical)}" />`
  );
  nextHtml = upsertTag(
    nextHtml,
    /<meta\s+property=["']og:title["'][^>]*>/i,
    `<meta property="og:title" content="${escapeHtml(seo.title)}" />`
  );
  nextHtml = upsertTag(
    nextHtml,
    /<meta\s+property=["']og:description["'][^>]*>/i,
    `<meta property="og:description" content="${escapeHtml(seo.description)}" />`
  );
  nextHtml = upsertTag(
    nextHtml,
    /<meta\s+property=["']og:type["'][^>]*>/i,
    `<meta property="og:type" content="website" />`
  );
  nextHtml = upsertTag(
    nextHtml,
    /<meta\s+property=["']og:url["'][^>]*>/i,
    `<meta property="og:url" content="${escapeHtml(seo.canonical)}" />`
  );
  nextHtml = upsertTag(
    nextHtml,
    /<meta\s+property=["']og:image["'][^>]*>/i,
    `<meta property="og:image" content="${escapeHtml(ogImage)}" />`
  );
  nextHtml = upsertTag(
    nextHtml,
    /<meta\s+name=["']twitter:card["'][^>]*>/i,
    `<meta name="twitter:card" content="summary_large_image" />`
  );
  nextHtml = upsertTag(
    nextHtml,
    /<meta\s+name=["']twitter:title["'][^>]*>/i,
    `<meta name="twitter:title" content="${escapeHtml(seo.title)}" />`
  );
  nextHtml = upsertTag(
    nextHtml,
    /<meta\s+name=["']twitter:description["'][^>]*>/i,
    `<meta name="twitter:description" content="${escapeHtml(seo.description)}" />`
  );
  nextHtml = upsertTag(
    nextHtml,
    /<meta\s+name=["']twitter:image["'][^>]*>/i,
    `<meta name="twitter:image" content="${escapeHtml(ogImage)}" />`
  );

  const injectedHead = [
    alternates,
    `<script type="application/ld+json">${escapeJsonForHtml(jsonLd)}</script>`
  ]
    .filter(Boolean)
    .join('\n    ');

  nextHtml = nextHtml.replace('</head>', `    ${injectedHead}\n  </head>`);
  const body = renderSeoBody(seo);
  nextHtml = nextHtml.replace(
    /<div id="root"><\/div>/,
    `<div id="root">${body}</div>`
  );
  return nextHtml;
}

export function renderCreateAppPageHtml(params: {
  html: string;
  slug: string;
  locale: Locale;
}): { html: string; status: number } {
  const seo = buildCreateAppSeoConfig({
    slug: params.slug,
    locale: params.locale
  });
  let html = injectCreateAppSeo(params.html, seo);
  if (params.slug === 'pindou-pattern-maker') {
    html = html.replace(
      /<div id="root">[\s\S]*?<\/div>/i,
      `<div id="root">${renderPindouSeoBody(params.locale)}</div>`
    );
  }
  return {
    html,
    status: seo.app || !params.slug ? 200 : 404
  };
}
