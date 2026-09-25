import { useEffect } from 'react';
import { applySeo } from '../lib/seo';
import { MarketingPageShell, useMarketingLocale } from './MarketingPageShell';
const PARTNER_LINKS = [
  {
    name: 'SeekTool.ai',
    href: 'https://seektool.ai/',
    title: 'SeekTool.ai Tools Directory',
    description: {
      zh: 'AI 工具导航与目录收录平台。',
      en: 'AI tools directory and discovery platform.'
    }
  },
  {
    name: 'SubmitAITools',
    href: 'https://submitaitools.org/',
    title: 'SubmitAITools Directory',
    description: {
      zh: '面向 AI 产品的提交与展示目录。',
      en: 'A submission and listing directory for AI products.'
    }
  },
  {
    name: 'AIToolzDir',
    href: 'https://aitoolzdir.com/',
    title: 'AIToolzDir AI Tools',
    description: {
      zh: '聚合型 AI 工具目录站点。',
      en: 'Aggregated AI tools discovery directory.'
    }
  },
  {
    name: 'ToolPilot',
    href: 'https://toolpilot.ai/',
    title: 'ToolPilot AI Tools',
    description: {
      zh: '面向创作者的 AI 工具索引与发现。',
      en: 'AI tools index and discovery for creators.'
    }
  }
];

export function LinksPage() {
  const { locale, isZh } = useMarketingLocale();

  useEffect(() => {
    const canonical = `${window.location.origin}/${locale}/links`;
    const zhHref = `${window.location.origin}/zh-CN/links`;
    const enHref = `${window.location.origin}/en-US/links`;
    return applySeo({
      title: isZh ? 'WebToMind 合作链接' : 'WebToMind Partner Links',
      description: isZh
        ? 'WebToMind 的合作目录站点与相关外部链接。'
        : 'Partner directories and related external links for WebToMind.',
      canonical,
      robots: 'noindex,follow',
      alternates: [
        { hreflang: 'zh-CN', href: zhHref },
        { hreflang: 'en-US', href: enHref },
        { hreflang: 'x-default', href: isZh ? zhHref : enHref }
      ],
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: isZh ? 'WebToMind 合作链接' : 'WebToMind Partner Links',
        url: canonical
      }
    });
  }, [isZh, locale]);

  return (
    <MarketingPageShell
      title={isZh ? '链接' : 'Links'}
      subtitle={
        isZh
          ? '合作目录站点统一展示页。'
          : 'A single page for partner directories.'
      }
    >
      <section className="marketing-grid one-col">
        {PARTNER_LINKS.map((item) => (
          <article
            key={item.name}
            className="marketing-card ui-card--web links-card"
          >
            <h3>{item.name}</h3>
            <p>{isZh ? item.description.zh : item.description.en}</p>
            <a
              href={item.href}
              title={item.title}
              className="marketing-text-link"
            >
              {item.href}
            </a>
          </article>
        ))}
      </section>
    </MarketingPageShell>
  );
}
