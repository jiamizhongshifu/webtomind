import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  BadgeDollarSign,
  Check,
  Crown,
  Gem,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap
} from 'lucide-react';
import type { CreditPackage } from '@/types/membership';
import { Badge, Button, EmptyState, FeedbackMessage } from '@/shared/ui';
import {
  ZPAY_USD_TO_CNY_DISPLAY_RATE,
  usdCentsToDisplayedCny
} from '@/shared/zpay-pricing';
import {
  IMAGE_GENERATION_4K_CREDIT_COST,
  IMAGE_GENERATION_BASE_CREDIT_COST,
  IMAGE_GENERATION_LARGE_2K_CREDIT_COST
} from '@/shared/image-generation-pricing';
import { VIDEO_PLAN_MARKETING_COSTS } from '@/shared/pricing-catalog';
import { getWorkspacePricingHref } from '../lib/pricing-route';
import './RechargePage.css';

export type RechargePaymentMethod = 'stripe' | 'alipay';
type LocalePrefix = '' | '/zh-CN' | '/en-US';

const MINI_5S_480P_VIDEO_COST = VIDEO_PLAN_MARKETING_COSTS.mini5s480p;
const SEEDANCE_25_5S_720P_COST = VIDEO_PLAN_MARKETING_COSTS.seedance25_5s720p;

interface PaymentNotice {
  tone: 'neutral' | 'success' | 'warning' | 'error';
  message: string;
}

interface RechargePresentationProps {
  embedded: boolean;
  localePrefix: LocalePrefix;
  isEnglish: boolean;
  returnTo?: string;
  packages: CreditPackage[];
  loading: boolean;
  packagesError: boolean;
  purchasingId: string | null;
  paymentMethod: RechargePaymentMethod;
  paymentNotice: PaymentNotice | null;
  paymentRetryAvailable: boolean;
  onPaymentMethodChange: (method: RechargePaymentMethod) => void;
  onPurchase: (pkg: CreditPackage) => void;
  onRetryPackages: () => void;
  onRetryPayment: () => void;
}

function formatAmount(cents: number, method: RechargePaymentMethod): string {
  const amount =
    method === 'alipay' ? usdCentsToDisplayedCny(cents) : cents / 100;
  return amount.toLocaleString(method === 'alipay' ? 'zh-CN' : 'en-US', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  });
}

function formatUnitPrice(
  pkg: CreditPackage,
  method: RechargePaymentMethod
): string {
  const usd = pkg.price / 100 / Math.max(1, pkg.credits);
  const amount = method === 'alipay' ? usd * ZPAY_USD_TO_CNY_DISPLAY_RATE : usd;
  return amount.toLocaleString(method === 'alipay' ? 'zh-CN' : 'en-US', {
    maximumFractionDigits: 4
  });
}

function getPackageDisplayName(
  pkg: CreditPackage,
  index: number,
  isEnglish: boolean
): string {
  if (isEnglish) return pkg.name;
  return ['轻量补充', '稳定创作', '高频交付', '团队储备'][index] || pkg.name;
}

function PaymentMethodSwitch({
  method,
  isEnglish,
  onChange
}: {
  method: RechargePaymentMethod;
  isEnglish: boolean;
  onChange: (method: RechargePaymentMethod) => void;
}) {
  return (
    <div
      className="recharge-payment-switch"
      role="group"
      aria-label={isEnglish ? 'Payment method' : '支付方式'}
    >
      <span className="recharge-payment-switch-label">
        {isEnglish ? 'Payment' : '支付方式'}
      </span>
      <button
        type="button"
        aria-pressed={method === 'stripe'}
        className={method === 'stripe' ? 'is-active' : ''}
        onClick={() => onChange('stripe')}
      >
        {isEnglish ? 'Card' : '银行卡'}
      </button>
      <button
        type="button"
        aria-pressed={method === 'alipay'}
        className={method === 'alipay' ? 'is-active' : ''}
        onClick={() => onChange('alipay')}
      >
        <span className="recharge-alipay-mark" aria-hidden="true">
          支
        </span>
        {isEnglish ? 'Alipay' : '支付宝'}
      </button>
    </div>
  );
}

function CreditPackCard({
  pkg,
  index,
  packageCount,
  isEnglish,
  isBestValue,
  paymentMethod,
  purchasingId,
  onPurchase
}: {
  pkg: CreditPackage;
  index: number;
  packageCount: number;
  isEnglish: boolean;
  isBestValue: boolean;
  paymentMethod: RechargePaymentMethod;
  purchasingId: string | null;
  onPurchase: (pkg: CreditPackage) => void;
}) {
  const isPopular = index === Math.min(1, packageCount - 1);
  const Icon = index === 0 ? Zap : index === 1 ? Gem : Crown;
  const currency = paymentMethod === 'alipay' ? '¥' : '$';

  return (
    <article
      className={`recharge-pack-card ${isPopular ? 'recharge-pack-card--popular' : ''}`}
      data-popular={isPopular ? 'true' : undefined}
    >
      <div className="recharge-pack-topline">
        <span className="recharge-pack-icon" aria-hidden="true">
          <Icon />
        </span>
        {isPopular ? (
          <Badge className="recharge-popular-badge" variant="accent" size="sm">
            {isEnglish ? 'Most popular' : '最常用'}
          </Badge>
        ) : isBestValue ? (
          <Badge className="recharge-value-badge" variant="accent" size="sm">
            {isEnglish ? 'Best value' : '最佳性价比'}
          </Badge>
        ) : null}
      </div>

      <div className="recharge-pack-main">
        <h3>{getPackageDisplayName(pkg, index, isEnglish)}</h3>
        <div className="recharge-credit-value">
          {pkg.credits.toLocaleString()}
          <span>{isEnglish ? 'credits' : '积分'}</span>
        </div>
        <p className="recharge-unit-price">
          {currency}
          {formatUnitPrice(pkg, paymentMethod)} /{' '}
          {isEnglish ? 'credit' : '积分'}
        </p>
        <p className="recharge-pack-capacity">
          ≈ {Math.floor(pkg.credits / IMAGE_GENERATION_BASE_CREDIT_COST)}{' '}
          {isEnglish ? 'base images' : '张基础商业图'} · ≈{' '}
          {Math.floor(pkg.credits / MINI_5S_480P_VIDEO_COST)}{' '}
          {isEnglish ? 'Mini 5s 480p videos' : '条 Mini 5 秒 480P 视频'}
        </p>
        <div className="recharge-pack-price">
          <span>{currency}</span>
          {formatAmount(pkg.price, paymentMethod)}
        </div>
        {pkg.bonusCredits > 0 ? (
          <Badge className="recharge-bonus-pill" variant="neutral" size="md">
            +{pkg.bonusCredits.toLocaleString()}{' '}
            {isEnglish ? 'bonus credits' : '赠送积分'}
          </Badge>
        ) : null}
      </div>

      <ul className="recharge-pack-features">
        <li>
          <Check aria-hidden="true" />
          {isEnglish ? 'Never expires' : '长期有效，不随套餐周期清零'}
        </li>
        <li>
          <Check aria-hidden="true" />
          {isEnglish
            ? 'Works across image and video creation'
            : '图像、视频与 Prompt 工作流通用'}
        </li>
        <li>
          <Check aria-hidden="true" />
          {isEnglish
            ? 'Subscription benefits stay separate'
            : '不替代订阅套餐，也不解锁会员权益'}
        </li>
      </ul>

      <Button
        disabled={Boolean(purchasingId)}
        isLoading={purchasingId === pkg.id}
        onClick={() => onPurchase(pkg)}
        className="recharge-pack-button"
        variant="primary"
        size="md"
      >
        {purchasingId === pkg.id
          ? isEnglish
            ? 'Opening checkout…'
            : '正在打开支付…'
          : paymentMethod === 'alipay'
            ? isEnglish
              ? 'Pay with Alipay'
              : '支付宝购买'
            : isEnglish
              ? 'Pay by card'
              : '银行卡购买'}
      </Button>
    </article>
  );
}

export function RechargePresentation({
  embedded,
  localePrefix,
  isEnglish,
  returnTo,
  packages,
  loading,
  packagesError,
  purchasingId,
  paymentMethod,
  paymentNotice,
  paymentRetryAvailable,
  onPaymentMethodChange,
  onPurchase,
  onRetryPackages,
  onRetryPayment
}: RechargePresentationProps) {
  const pricingReturnTo = returnTo || `${localePrefix}/create`;
  return (
    <main
      className="recharge-page-root recharge-product-os"
      data-embedded={embedded ? 'true' : 'false'}
    >
      {!embedded ? (
        <header className="recharge-page-header">
          <div>
            <Link to={`${localePrefix}/create`} className="recharge-brand">
              <img src="/icons/logo-icon.svg" alt="" />
              WebToMind
            </Link>
            <nav aria-label={isEnglish ? 'Recharge navigation' : '充值页导航'}>
              <Link
                to={getWorkspacePricingHref(
                  localePrefix,
                  `?returnTo=${encodeURIComponent(pricingReturnTo)}`
                )}
                className="recharge-secondary-action"
              >
                {isEnglish ? 'Plans' : '订阅方案'}
              </Link>
              <Link
                to={`${localePrefix}/create`}
                className="recharge-primary-nav-action"
              >
                <ArrowLeft aria-hidden="true" />
                {isEnglish ? 'Back to studio' : '返回创作台'}
              </Link>
            </nav>
          </div>
        </header>
      ) : null}

      {paymentNotice ? (
        <FeedbackMessage
          className={`recharge-payment-notice ${paymentNotice.tone}`}
          tone={paymentNotice.tone}
          surface="web"
          role="status"
          aria-live="polite"
        >
          <span>{paymentNotice.message}</span>
          {paymentRetryAvailable ? (
            <Button variant="outline" size="sm" onClick={onRetryPayment}>
              <RefreshCw aria-hidden="true" />
              {isEnglish ? 'Check again' : '再次确认'}
            </Button>
          ) : null}
        </FeedbackMessage>
      ) : null}

      <div className="recharge-content">
        <section className="recharge-hero" aria-labelledby="recharge-title">
          <div className="recharge-hero-copy">
            <div className="recharge-eyebrow">
              <BadgeDollarSign aria-hidden="true" />
              {isEnglish ? 'EXTRA CREDITS' : 'WEBTOMIND EXTRA CREDITS'}
            </div>
            <h1 id="recharge-title">
              {isEnglish
                ? 'More room for the ideas that cannot wait.'
                : '给停不下来的灵感，多一点空间。'}
            </h1>
            <p>
              {isEnglish
                ? 'One-time credits absorb campaign bursts, client revisions, and experiments without changing your plan.'
                : '一次性积分用于临时高峰、客户改稿和批量实验，无需更换当前套餐。套餐积分优先消耗，额外积分随后承接。'}
            </p>
          </div>

          <aside className="recharge-assurance-card">
            <span className="recharge-assurance-icon" aria-hidden="true">
              <ShieldCheck />
            </span>
            <div>
              <span className="recharge-assurance-kicker">
                {isEnglish ? 'YOURS UNTIL USED' : '用完为止'}
              </span>
              <h2>
                {isEnglish
                  ? 'Purchased credits do not expire.'
                  : '额外积分不过期。'}
              </h2>
              <p>
                {isEnglish
                  ? 'Your plan keeps its own renewal rhythm. Extra credits stay in your balance.'
                  : '订阅额度按周期刷新；单独购买的积分会一直保留在余额中。'}
              </p>
            </div>
          </aside>
        </section>

        <section className="recharge-pack-section" aria-labelledby="pack-title">
          <div className="recharge-pack-heading">
            <div>
              <span>{isEnglish ? 'ONE-TIME TOP-UP' : '一次性补充'}</span>
              <h2 id="pack-title">
                {isEnglish ? 'Choose a credit pack' : '选择积分包'}
              </h2>
              <p>
                {isEnglish
                  ? 'No recurring charge. Pick a payment method before checkout.'
                  : '不自动续费。先选择支付方式，再进入安全收银台。'}
              </p>
            </div>
            <div className="recharge-pack-controls">
              <PaymentMethodSwitch
                method={paymentMethod}
                isEnglish={isEnglish}
                onChange={onPaymentMethodChange}
              />
              <Link
                to={getWorkspacePricingHref(
                  localePrefix,
                  `?returnTo=${encodeURIComponent(pricingReturnTo)}`
                )}
                className="recharge-compare-link"
              >
                {isEnglish ? 'Compare plans' : '对比订阅套餐'}
              </Link>
            </div>
          </div>

          {paymentMethod === 'alipay' ? (
            <p className="recharge-currency-note">
              <span className="recharge-alipay-mark" aria-hidden="true">
                支
              </span>
              {isEnglish
                ? 'Alipay settles in CNY at the current checkout rate (USD × 7.20).'
                : '支付宝以人民币结算，当前收银台换算：美元金额 × 7.20。'}
            </p>
          ) : null}

          {loading ? (
            <div
              className="recharge-pack-grid"
              aria-label={isEnglish ? 'Loading credit packs' : '正在加载充值包'}
              aria-busy="true"
            >
              {[0, 1, 2].map((index) => (
                <div
                  key={index}
                  className="recharge-pack-card recharge-pack-skeleton"
                  aria-hidden="true"
                >
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              ))}
            </div>
          ) : packagesError ? (
            <EmptyState
              className="recharge-pack-load-error"
              tone="warning"
              icon={<RefreshCw />}
              title={
                isEnglish
                  ? 'Credit packs are temporarily unavailable'
                  : '充值包暂时无法加载'
              }
              description={
                isEnglish
                  ? 'We could not verify the latest prices. Retry before checkout.'
                  : '当前无法确认最新价格。请重试后再继续购买。'
              }
              action={
                <Button variant="outline" onClick={onRetryPackages}>
                  <RefreshCw aria-hidden="true" />
                  {isEnglish ? 'Retry' : '重新加载'}
                </Button>
              }
            />
          ) : (
            <div className="recharge-pack-grid">
              {packages.map((pkg, index) => {
                const cheapestPack = packages.reduce((best, current) =>
                  current.price / Math.max(1, current.credits) <
                  best.price / Math.max(1, best.credits)
                    ? current
                    : best
                );
                return (
                  <CreditPackCard
                    key={pkg.id}
                    pkg={pkg}
                    index={index}
                    packageCount={packages.length}
                    isEnglish={isEnglish}
                    isBestValue={pkg.id === cheapestPack.id}
                    paymentMethod={paymentMethod}
                    purchasingId={purchasingId}
                    onPurchase={onPurchase}
                  />
                );
              })}
            </div>
          )}
        </section>

        <section
          className="recharge-usage-section"
          aria-labelledby="recharge-usage-title"
        >
          <div className="recharge-usage-heading">
            <h2 id="recharge-usage-title">
              {isEnglish ? 'How credits are spent' : '积分怎么花'}
            </h2>
            <p>
              {isEnglish
                ? 'Every generation charges the exact parameters you pick. Failed tasks are refunded automatically.'
                : '按真实生成参数透明扣费，失败任务自动退回。'}
            </p>
          </div>
          <ul className="recharge-usage-grid">
            {[
              [
                isEnglish ? 'Base image' : '基础商业图',
                String(IMAGE_GENERATION_BASE_CREDIT_COST)
              ],
              [
                isEnglish ? '2K product image' : '2K 商业主图',
                String(IMAGE_GENERATION_LARGE_2K_CREDIT_COST)
              ],
              [
                isEnglish ? '4K large image' : '4K 大图 / 精修',
                String(IMAGE_GENERATION_4K_CREDIT_COST)
              ],
              [
                isEnglish ? 'Mini video · 5s 480p' : 'Mini 视频 · 5 秒 480P',
                String(MINI_5S_480P_VIDEO_COST)
              ],
              [
                isEnglish
                  ? 'Seedance 2.5 video · 5s 720p'
                  : 'Seedance 2.5 视频 · 5 秒 720P',
                String(SEEDANCE_25_5S_720P_COST)
              ]
            ].map(([label, credits]) => (
              <li key={label}>
                <span>{label}</span>
                <strong>
                  {credits}
                  <em>{isEnglish ? 'credits' : '积分'}</em>
                </strong>
              </li>
            ))}
          </ul>
        </section>

        <section className="recharge-proof-grid" aria-label="Recharge benefits">
          {[
            [
              isEnglish ? 'Plan first' : '优先用套餐积分',
              isEnglish
                ? 'Routine creation uses your monthly allowance first.'
                : '日常创作优先使用套餐内额度。'
            ],
            [
              isEnglish ? 'Top-up second' : '额外积分做缓冲',
              isEnglish
                ? 'Extra credits cover the moments your plan cannot.'
                : '套餐额度不足时，额外积分自然接续。'
            ],
            [
              isEnglish ? 'Clear payment' : '支付路径清晰',
              isEnglish
                ? 'Card and Alipay are selected before checkout.'
                : '银行卡与支付宝在结账前明确选择。'
            ]
          ].map(([title, description]) => (
            <div key={title}>
              <Sparkles aria-hidden="true" />
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
