import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  listSkillCatalog,
  type SkillCatalogItem,
  type SkillOutputType
} from '@/services/skill-catalog-api';
import { SkillCard } from './skillCatalogShared';
export function RelatedSkills({
  slug,
  outputType,
  locale,
  isZh
}: {
  slug: string;
  outputType: string;
  locale: string;
  isZh: boolean;
}) {
  const [items, setItems] = useState<SkillCatalogItem[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    setItems([]);
    listSkillCatalog(
      { outputType: outputType as SkillOutputType, sort: 'featured', limit: 5 },
      controller.signal
    )
      .then((result) => {
        if (!controller.signal.aborted)
          setItems(
            result.items.filter((item) => item.slug !== slug).slice(0, 4)
          );
      })
      .catch(() => {});
    return () => controller.abort();
  }, [slug, outputType]);
  if (!items.length) return null;
  return (
    <section className="skill-shelf">
      <div className="skill-section-head">
        <h2>{isZh ? '相关工作流' : 'Similar Skills'}</h2>
        <Link to={`/${locale}/skills?type=${outputType}`}>
          {isZh ? '查看全部' : 'View all'} →
        </Link>
      </div>
      <div className="skill-grid">
        {items.map((item) => (
          <SkillCard key={item.slug} skill={item} locale={locale} isZh={isZh} />
        ))}
      </div>
    </section>
  );
}
