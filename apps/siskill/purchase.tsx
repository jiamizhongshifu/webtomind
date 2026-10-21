import { available, catalog } from './discovery';
import { useEffect, useState } from 'react';
import { Button, ButtonLink } from '../../src/shared/ui';
import type { Product } from './account';
export function SkillPurchaseLink({
  slug,
  locale
}: {
  slug: string;
  locale: string;
}) {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setProduct(null);
    setLoading(true);
    fetch('/api/siskill/products', { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) return;
        const data = await r.json();
        if (active && data.checkoutOpen)
          setProduct(
            data.products.find(
              (p: Product) => p.siskill_releases.slug === slug
            ) || null
          );
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug]);
  return product ? (
    <ButtonLink
      variant="primary"
      to={`/${locale}/account?skill=${encodeURIComponent(slug)}`}
    >
      {locale === 'zh-CN' ? '购买此 Skill' : 'Buy this Skill'} · $
      {(product.usd_cents / 100).toFixed(2)}
    </ButtonLink>
  ) : (
    <Button variant="primary" disabled>
      {loading
        ? locale === 'zh-CN'
          ? '正在查询…'
          : 'Checking availability…'
        : catalog.some((s) => s.slug === slug && available(s))
          ? locale === 'zh-CN'
            ? '结账暂不可用'
            : 'Checkout unavailable'
          : locale === 'zh-CN'
            ? '即将开放'
            : 'Coming soon'}
    </Button>
  );
}
