import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, ButtonLink } from '@/shared/ui';
import { SubscriptionManagement } from '@/workspace/components/SubscriptionManagement';
import { skillMoney, useSkillCommerce } from './useSkillCommerce';

export function SkillPricingSection({
  locale,
  isZh
}: {
  locale: string;
  isZh: boolean;
}) {
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('yearly');
  const commerce = useSkillCommerce(isZh);
  const pro = commerce.products.find((p) => p.kind === 'subscription');
  const provider = commerce.providerFor(pro);
  const cny = provider ? provider === 'alipay' : isZh;
  const monthly = (cny ? pro?.priceCny : pro?.priceUsd) ?? (cny ? 4900 : 999);
  const yearly =
    (cny ? pro?.yearlyCny : pro?.yearlyUsd) ?? (cny ? 39900 : 7900);
  const saving = Math.round((1 - yearly / (monthly * 12)) * 100);
  const owned = pro?.owned || commerce.access?.premiumAccess;
  const hasSubscription = Boolean(
    commerce.access?.subscriptions.some(
      (s) =>
        ['active', 'trialing', 'past_due', 'unpaid', 'paused'].includes(
          s.status
        ) || Date.parse(s.endsAt) > Date.now()
    )
  );
  const ready = Boolean(pro?.checkoutEnabled && provider);
  return (
    <section className="skill-pricing" aria-labelledby="skill-pricing-title">
      <div className="skill-section-head">
        <h2 id="skill-pricing-title">
          {isZh
            ? '买一个工作流，或订阅自营全库'
            : 'One workflow, or the whole studio library'}
        </h2>
        <div
          className="skill-pill-group"
          role="group"
          aria-label={isZh ? '计费周期' : 'Billing cycle'}
        >
          {(['monthly', 'yearly'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className="skill-pill"
              aria-pressed={cycle === value}
              onClick={() => setCycle(value)}
            >
              {value === 'monthly'
                ? isZh
                  ? '月付'
                  : 'Monthly'
                : isZh
                  ? '年付'
                  : 'Yearly'}
            </button>
          ))}
        </div>
      </div>
      <p className="skill-muted">
        {isZh
          ? 'Skill 在你的本地 Agent 运行。内容会员不含创作台积分；Agent、模型及第三方服务费用另计。'
          : 'Skills run in your local agent. Content access does not include workspace credits. Agent, model and third-party fees are separate.'}
      </p>
      {commerce.notice ? <p role="status">{commerce.notice}</p> : null}
      {commerce.unavailable ? (
        <p role="alert">
          {isZh
            ? '暂时无法核对购买信息。'
            : 'Purchase options could not be verified.'}{' '}
          <Button variant="secondary" size="sm" onClick={commerce.reload}>
            {isZh ? '重试' : 'Retry'}
          </Button>
        </p>
      ) : null}
      <div className="skill-pricing-grid">
        <article className="skill-plan">
          <h3>{isZh ? '免费' : 'Free'}</h3>
          <p className="skill-plan-price">{skillMoney(0, cny)}</p>
          <ul>
            {(isZh
              ? ['完整免费工作流与导出', '安装说明和示例输入', '无需信用卡']
              : [
                  'Complete free workflows and exports',
                  'Install guides and example inputs',
                  'No credit card needed'
                ]
            ).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <ButtonLink variant="secondary" to={`/${locale}/skills?tier=free`}>
            {isZh ? '浏览免费 Skill' : 'Browse free Skills'}
          </ButtonLink>
        </article>
        <article className="skill-plan skill-plan--highlight">
          <div className="skill-plan-title">
            <h3>Skill Pro</h3>
            <Badge variant="accent">{isZh ? '推荐' : 'Recommended'}</Badge>
          </div>
          <p className="skill-plan-price">
            {skillMoney(cycle === 'yearly' ? yearly : monthly, cny)}
            <span>
              {cycle === 'yearly'
                ? isZh
                  ? '/年'
                  : '/year'
                : isZh
                  ? '/月'
                  : '/month'}
            </span>
          </p>
          {!ready ? (
            <p className="skill-muted">
              {isZh
                ? '计划价格 · 尚未开放购买'
                : 'Planned price · not open for purchase'}
            </p>
          ) : null}
          {cycle === 'yearly' ? (
            <p>
              {isZh
                ? `全年一次结算，较月付 12 次节省 ${saving}%。`
                : `Billed for the full year. Save ${saving}% vs 12 monthly payments.`}
            </p>
          ) : null}
          <ul>
            {(isZh
              ? [
                  '有效期内全部自营 Pro Skill',
                  '包含后续新增与版本更新',
                  '已获得版本到期后可继续本地使用',
                  '不含生成积分与定制服务'
                ]
              : [
                  'Every studio Pro Skill during your paid period',
                  'New studio Skills and updates included',
                  'Keep using acquired versions after expiry',
                  'No generation credits or custom services'
                ]
            ).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="skill-muted">
            {provider === 'alipay'
              ? isZh
                ? '支付宝按期预付，到期后手动续费。'
                : 'Alipay is prepaid. Renew manually after expiry.'
              : isZh
                ? '银行卡订阅自动续费，可随时取消下期续费；本期权益保留。'
                : 'Card subscriptions renew automatically. Cancel future renewals anytime; keep access through the paid period.'}
          </p>
          <Button
            variant="primary"
            disabled={
              !ready ||
              commerce.loading ||
              commerce.busy ||
              Boolean(owned) ||
              hasSubscription
            }
            isLoading={commerce.busy}
            onClick={() => pro && void commerce.buy(pro, cycle)}
          >
            {owned
              ? isZh
                ? '已包含全库权益'
                : 'Library access included'
              : hasSubscription
                ? isZh
                  ? '管理现有订阅'
                  : 'Manage existing subscription'
                : ready
                  ? isZh
                    ? '订阅 Skill Pro'
                    : 'Get Skill Pro'
                  : isZh
                    ? '即将开放'
                    : 'Coming soon'}
          </Button>
        </article>
        <article className="skill-plan">
          <h3>{isZh ? '单品购买' : 'Individual Skills'}</h3>
          <p className="skill-plan-price">
            {skillMoney(cny ? 2900 : 499, cny)}
            <span>{isZh ? '计划起价' : 'planned starting price'}</span>
          </p>
          <ul>
            {(isZh
              ? [
                  '一次购买指定工作流，无需续费',
                  '服务运营期间提供该商品更新',
                  '允许商业成品交付，不可转售原包',
                  '具体价格与开放状态见商品页'
                ]
              : [
                  'One workflow, one payment, no renewal',
                  'Updates while the service operates',
                  'Commercial outputs; no package resale',
                  'See each product for price and availability'
                ]
            ).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <ButtonLink variant="secondary" to={`/${locale}/skills?tier=premium`}>
            {isZh ? '查看付费工作流' : 'Explore Pro workflows'}
          </ButtonLink>
        </article>
      </div>
      <p className="skill-muted">
        {isZh
          ? '现有 Pro / Max 的有效会员期包含自营 Pro Skill，原有积分与已购权益保留。'
          : 'Existing Pro / Max members include studio Pro Skills during their paid period. Existing credits and purchased benefits are preserved.'}
      </p>
      <details className="skill-plan">
        <summary>
          {isZh
            ? '授权、到期与终身方案'
            : 'License, expiry and lifetime access'}
        </summary>
        <p>
          {isZh
            ? '已合法获得的版本可继续本地使用；订阅到期后停止新的付费下载和更新。允许向客户交付成品，禁止共享或转售原始付费 Skill 与账号。第三方素材及模型适用其各自许可。'
            : 'Keep using legitimately acquired versions locally. New paid downloads and updates stop when a subscription expires. You may deliver commercial outputs to clients, but may not share or resell paid Skill packages or accounts. Third-party assets and models retain their own terms.'}
        </p>
        <p>
          {isZh
            ? '创始终身方案尚未开放。候选价格 $169 / ¥899，仅涵盖服务运营期间的自营 Pro 库，不包含算力、第三方商店或定制服务。'
            : 'Founding Lifetime is not open. Proposed price: $169 / ¥899 for the studio Pro library while the service operates. Compute, third-party marketplace items and custom services are excluded.'}
        </p>
        <Link to={`/${locale}/terms`}>
          {isZh ? '查看服务与授权条款' : 'Read service and license terms'}
        </Link>
      </details>
      {commerce.isAuthenticated ? (
        <SubscriptionManagement scope="skills" />
      ) : null}
    </section>
  );
}
