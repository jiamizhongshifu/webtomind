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
  useEffect(() => {
    let active = true;
    setProduct(null);
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
      .catch(() => {});
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
      {locale === 'zh-CN' ? '即将开放' : 'Coming soon'}
    </Button>
  );
}
