import { useEffect, useMemo, useState } from 'react';
import { applySeo } from '../lib/seo';
import { PRODUCT_UPDATES } from '../data/marketing-content';
import { getPublicUpdates, type PublicUpdate } from '@/services/marketing-api';
import { shouldUseEnglishFallback } from '../lib/locale-content';
import { MarketingPageShell, useMarketingLocale } from './MarketingPageShell';
export function UpdatesPage() {
  const { locale, isZh } = useMarketingLocale();
  const [updates, setUpdates] = useState<PublicUpdate[] | null>(null);
  const [isFallback, setIsFallback] = useState(false);
  const shouldFallbackToLocal =
    isFallback ||
    (updates !== null &&
      shouldUseEnglishFallback(
        locale,
        updates,
        (item) => `${item.title} ${item.highlights.join(' ')}`
      ));
  const remoteUpdates = !shouldFallbackToLocal ? updates : null;
  const localUpdates = useMemo(
    () =>
      PRODUCT_UPDATES.map((item) => ({
        id: item.id,
        version: item.version,
        date: item.date,
        title: isZh ? item.title.zh : item.title.en,
        highlights: item.highlights.map((highlight) =>
          isZh ? highlight.zh : highlight.en
        )
      })),
    [isZh]
  );
  const pageUpdates = useMemo(() => {
    const remotePageUpdates = remoteUpdates
      ? remoteUpdates.map((item) => ({
          id: item.id,
          version: item.version,
          date: item.published_at.slice(0, 10),
          title: item.title,
          highlights: item.highlights
        }))
      : [];
    const remoteOnlyUpdates = remotePageUpdates.filter(
      (item) =>
        !localUpdates.some(
          (localItem) =>
            localItem.version === item.version || localItem.title === item.title
        )
    );
    return [...localUpdates, ...remoteOnlyUpdates].slice(0, 20);
  }, [localUpdates, remoteUpdates]);

  useEffect(() => {
    const canonical = `${window.location.origin}/${locale}/updates`;
    const zhHref = `${window.location.origin}/zh-CN/updates`;
    const enHref = `${window.location.origin}/en-US/updates`;
    return applySeo({
      title: isZh ? 'WebToMind 更新日志' : 'WebToMind Product Updates',
      description: isZh
        ? '查看 WebToMind AI 图片创作工作台、参考图反推、Prompt 素材库、历史重编辑和官网 SEO 的最新产品迭代。'
        : 'Read the latest WebToMind updates for the AI image creation studio, reference-to-prompt, prompt asset libraries, history re-editing and website SEO.',
      canonical,
      alternates: [
        { hreflang: 'zh-CN', href: zhHref },
        { hreflang: 'en-US', href: enHref },
        { hreflang: 'x-default', href: isZh ? zhHref : enHref }
      ],
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: isZh ? 'WebToMind 更新日志' : 'WebToMind Product Updates',
        url: canonical
      }
    });
  }, [isZh, locale]);

  useEffect(() => {
    let active = true;
    getPublicUpdates(locale, 20)
      .then((data) => {
        if (active) {
          setUpdates(data);
          setIsFallback(false);
        }
      })
      .catch((error) => {
        console.warn(
          '[UpdatesPage] Failed to fetch public updates, fallback to local content:',
          error
        );
        if (active) {
          setIsFallback(true);
        }
      });
    return () => {
      active = false;
    };
  }, [locale]);

  return (
    <MarketingPageShell
      rootClassName="marketing-dayos"
      title={isZh ? '更新' : 'Updates'}
      subtitle={
        isZh
          ? '公开展示 AI 图片创作工作台、Prompt 素材库、历史重编辑和官网 SEO 的近期迭代。'
          : 'Public changelog for the AI image studio, prompt asset library, history re-editing and website SEO improvements.'
      }
    >
      {isFallback && (
        <div className="marketing-source-notice">
          {isZh
            ? '当前展示的是本地备用内容（线上内容服务暂不可用）。'
            : 'Showing local fallback content because live data is unavailable.'}
        </div>
      )}
      <section className="marketing-timeline">
        {pageUpdates.length > 0 ? (
          pageUpdates.map((item) => (
            <article key={item.id} className="marketing-card update-card">
              <div className="update-header">
                <span className="update-version">{item.version}</span>
                <span className="update-date">{item.date}</span>
              </div>
              <h3>{item.title}</h3>
              <ul>
                {item.highlights.map((highlight, index) => (
                  <li key={`${item.id}-${index}`}>{highlight}</li>
                ))}
              </ul>
            </article>
          ))
        ) : (
          <article className="marketing-card update-card">
            <h3>{isZh ? '暂无已发布更新' : 'No published updates yet'}</h3>
          </article>
        )}
      </section>
    </MarketingPageShell>
  );
}
