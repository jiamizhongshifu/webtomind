import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Badge, Button, FieldMessage } from '@/shared/ui';
import { createCheckoutSession, redirectToCheckout } from '@/services/payment-api';
import { getApiBaseUrl } from '@/utils/env';
import { useAuth } from '../../contexts/AuthContext';

type Provider = 'stripe' | 'alipay';

interface PlanPayload {
  id: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  checkoutEnabled?: boolean;
  checkoutProviders?: Provider[];
  checkoutPrices?: { alipay?: { priceMonthly?: number | null; priceYearly?: number | null } };
}

interface OneTimePayload {
  id: string;
  name: string;
  price: number | null;
  checkoutEnabled?: boolean;
  checkoutProviders?: Provider[];
  checkoutPrices?: { alipay?: { price?: number | null } };
}

// List prices from the Skill subscription plan, shown before the plans are
// switched on so visitors still see what Pro will cost.
const LIST_PRICES = {
  USD: { monthly: 999, yearly: 7900, lifetime: 16900 },
  CNY: { monthly: 4900, yearly: 39900, lifetime: 89900 }
};

function money(cents: number, currency: 'USD' | 'CNY'): string {
  const value = cents / 100;
  const text = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return currency === 'CNY' ? `¥${text}` : `$${text}`;
}

export function SkillPricingSection({ locale, isZh }: { locale: string; isZh: boolean }) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const { isAuthenticated } = useAuth();
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('yearly');
  const [plans, setPlans] = useState<{ pro: PlanPayload | null; lifetime: OneTimePayload | null }>({
    pro: null,
    lifetime: null
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(() =>
    new URLSearchParams(search).get('payment') === 'success'
      ? {
          tone: 'success',
          text: isZh
            ? '付款成功。权益到账通常只需几秒，之后即可用 CLI 安装 Pro Skill。'
            : 'Payment received. Access usually arrives within seconds; then install Pro Skills with the CLI.'
        }
      : null
  );

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${getApiBaseUrl()}/api/membership/plans`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { plans?: PlanPayload[]; oneTimeProducts?: OneTimePayload[] } | null) => {
        if (!data) return;
        setPlans({
          pro: data.plans?.find((plan) => plan.name === 'skill_pro') || null,
          lifetime: data.oneTimeProducts?.find((plan) => plan.name === 'skill_lifetime') || null
        });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const provider = (available?: Provider[]): Provider | null => {
    if (!available?.length) return null;
    if (isZh && available.includes('alipay')) return 'alipay';
    return available.includes('stripe') ? 'stripe' : available[0];
  };
  const proProvider = provider(plans.pro?.checkoutProviders);
  const lifetimeProvider = provider(plans.lifetime?.checkoutProviders);
  const currency: 'USD' | 'CNY' = (proProvider || lifetimeProvider || (isZh ? 'alipay' : 'stripe')) === 'alipay' ? 'CNY' : 'USD';

  const proPrice =
    currency === 'CNY'
      ? (cycle === 'monthly'
          ? plans.pro?.checkoutPrices?.alipay?.priceMonthly
          : plans.pro?.checkoutPrices?.alipay?.priceYearly) ?? LIST_PRICES.CNY[cycle]
      : (cycle === 'monthly' ? plans.pro?.priceMonthly : plans.pro?.priceYearly) ?? LIST_PRICES.USD[cycle];
  const lifetimePrice =
    currency === 'CNY'
      ? plans.lifetime?.checkoutPrices?.alipay?.price ?? LIST_PRICES.CNY.lifetime
      : plans.lifetime?.price ?? LIST_PRICES.USD.lifetime;

  const checkout = async (kind: 'pro' | 'lifetime') => {
    const plan = kind === 'pro' ? plans.pro : plans.lifetime;
    const paymentProvider = kind === 'pro' ? proProvider : lifetimeProvider;
    if (!plan || !paymentProvider) return;
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(`${pathname}${search}`)}`);
      return;
    }
    const returnUrl = `${window.location.origin}/${locale}/skills/pricing`;
    setBusy(kind);
    setNotice(null);
    try {
      const session = await createCheckoutSession({
        type: kind === 'pro' ? 'subscription' : 'skill_lifetime',
        id: plan.id,
        billingCycle: kind === 'pro' ? cycle : undefined,
        paymentProvider,
        successUrl: returnUrl,
        cancelUrl: returnUrl,
        ctaSource: 'skill_pricing'
      });
      redirectToCheckout(session);
    } catch (error) {
      const code = error instanceof Error ? error.name : '';
      setNotice({
        tone: 'error',
        text:
          ['ACTIVE_SUBSCRIPTION_EXISTS', 'ACTIVE_PREPAID_SUBSCRIPTION_EXISTS', 'SKILL_LIFETIME_ALREADY_OWNED'].includes(code)
            ? isZh
              ? '你已经拥有这个方案的权益。'
              : 'You already have this plan.'
            : isZh
              ? '结账服务暂时不可用，请稍后重试。'
              : 'Checkout is unavailable right now. Please try again.'
      });
      setBusy(null);
    }
  };

  const proReady = Boolean(plans.pro?.checkoutEnabled && proProvider);
  const lifetimeReady = Boolean(plans.lifetime?.checkoutEnabled && lifetimeProvider);
  const comingSoon = isZh ? '即将开放' : 'Coming soon';
  const proFeatures = isZh
    ? ['全部 Pro Skill，含每月新增', '网页端运行积分，与 Pro 会员相同', 'CLI 一键安装与更新', '随时取消']
    : ['Every Pro Skill, plus new ones each month', 'Web run credits, same as Pro membership', 'One-command CLI install and updates', 'Cancel anytime'];
  const lifetimeFeatures = isZh
    ? ['全部 Pro Skill 永久安装与更新', '后续新增 Pro Skill 同样包含', '不含每月网页端运行积分', '一次付款，无续费']
    : ['Install and update every Pro Skill forever', 'Future Pro Skills included', 'No monthly web run credits', 'Pay once, no renewals'];

  return (
    <section className="skill-pricing" aria-labelledby="skill-pricing-title">
      <div className="skill-section-head">
        <h2 id="skill-pricing-title">{isZh ? '一个方案，解锁全部 Pro Skill' : 'One plan unlocks every Pro Skill'}</h2>
        <div className="skill-pill-group" role="group" aria-label={isZh ? '计费周期' : 'Billing cycle'}>
          {(['monthly', 'yearly'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className="skill-pill"
              aria-pressed={cycle === value}
              onClick={() => setCycle(value)}
            >
              {value === 'monthly' ? (isZh ? '月付' : 'Monthly') : isZh ? '年付' : 'Yearly'}
            </button>
          ))}
        </div>
      </div>
      {notice ? <FieldMessage tone={notice.tone}>{notice.text}</FieldMessage> : null}
      <div className="skill-pricing-grid">
        <article className="skill-plan">
          <h3>{isZh ? '免费' : 'Free'}</h3>
          <p className="skill-plan-price">{money(0, currency)}</p>
          <ul>
            {(isZh
              ? ['全部免费 Skill', 'CLI 安装，无需信用卡', '少量网页端试用积分']
              : ['Every free Skill', 'CLI install, no card needed', 'A few web trial credits']
            ).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <Button variant="secondary" onClick={() => navigate(`/${locale}/skills?tier=free`)}>
            {isZh ? '浏览免费 Skill' : 'Browse free Skills'}
          </Button>
        </article>
        <article className="skill-plan skill-plan--highlight">
          <div className="skill-plan-title">
            <h3>Skill Pro</h3>
            <Badge variant="accent">{isZh ? '推荐' : 'Popular'}</Badge>
          </div>
          <p className="skill-plan-price">
            {money(proPrice, currency)}
            <span>{cycle === 'monthly' ? (isZh ? '/月' : '/month') : isZh ? '/年' : '/year'}</span>
          </p>
          <ul>
            {proFeatures.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <Button
            variant="primary"
            disabled={!proReady || busy !== null}
            isLoading={busy === 'pro'}
            onClick={() => checkout('pro')}
          >
            {proReady ? (isZh ? '订阅 Skill Pro' : 'Subscribe to Skill Pro') : comingSoon}
          </Button>
        </article>
        <article className="skill-plan">
          <h3>{isZh ? '买断' : 'Lifetime'}</h3>
          <p className="skill-plan-price">
            {money(lifetimePrice, currency)}
            <span>{isZh ? '一次性' : 'one-time'}</span>
          </p>
          <ul>
            {lifetimeFeatures.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <Button
            variant="secondary"
            disabled={!lifetimeReady || busy !== null}
            isLoading={busy === 'lifetime'}
            onClick={() => checkout('lifetime')}
          >
            {lifetimeReady ? (isZh ? '一次买断' : 'Get lifetime access') : comingSoon}
          </Button>
        </article>
      </div>
      <p className="skill-muted">
        {isZh
          ? '现有 Pro / Max 会员已包含全部 Pro Skill。'
          : 'Existing Pro and Max members already include every Pro Skill.'}
      </p>
    </section>
  );
}
