import { Link } from 'react-router-dom';
import { Button } from '@/shared/ui';
import { skillMoney, useSkillCommerce } from './useSkillCommerce';

export function SkillPurchaseCard({
  slug,
  locale,
  isZh
}: {
  slug: string;
  locale: string;
  isZh: boolean;
}) {
  const commerce = useSkillCommerce(isZh);
  const product = commerce.products.find(
    (p) => p.kind === 'single' && p.slug === slug
  );
  const cny = commerce.providerFor(product) === 'alipay';
  const owned = product?.owned || commerce.access?.premiumAccess;
  return (
    <div className="skill-upgrade">
      <h3>
        {owned
          ? isZh
            ? '已包含此 Skill'
            : 'This Skill is included'
          : isZh
            ? '购买这个工作流'
            : 'Get this workflow'}
      </h3>
      {product ? (
        <>
          <p className="skill-plan-price">
            {skillMoney(cny ? product.priceCny : product.priceUsd, cny)}
            <span>{isZh ? '一次付款' : 'one-time'}</span>
          </p>
          <Button
            variant="primary"
            disabled={Boolean(
              owned ||
              commerce.busy ||
              commerce.loading ||
              !product.checkoutEnabled
            )}
            onClick={() => void commerce.buy(product)}
          >
            {owned
              ? isZh
                ? '已拥有'
                : 'Already included'
              : isZh
                ? '单独购买'
                : 'Buy this Skill'}
          </Button>
        </>
      ) : (
        <p>
          {isZh ? '单品购买尚未开放。' : 'Individual purchase is not open yet.'}
        </p>
      )}
      <p>
        {isZh
          ? '已购版本可持续本地使用；服务运营期间包含该商品更新。不含模型费用。'
          : 'Keep using acquired versions locally. Updates for this Skill are included while the service operates. Model fees are separate.'}
      </p>
      <Link to={`/${locale}/skills/pricing`}>
        {isZh
          ? '需要多个工作流？查看全库会员'
          : 'Need more workflows? Compare all-library access'}
      </Link>
      {commerce.notice ? <p role="status">{commerce.notice}</p> : null}
      {commerce.unavailable ? (
        <Button variant="secondary" onClick={commerce.reload}>
          {isZh ? '重新加载购买信息' : 'Reload purchase options'}
        </Button>
      ) : null}
    </div>
  );
}
