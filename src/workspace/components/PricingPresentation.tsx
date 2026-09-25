import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export type PricingBillingMode = 'monthly' | 'yearly';
export type PricingPaymentMethod = 'stripe' | 'alipay';

interface PricingBillingSwitchProps {
  mode: PricingBillingMode;
  monthlyLabel: string;
  yearlyLabel: string;
  savingsLabel: string;
  ariaLabel: string;
  onChange: (mode: PricingBillingMode) => void;
}

export function PricingBillingSwitch({
  mode,
  monthlyLabel,
  yearlyLabel,
  savingsLabel,
  ariaLabel,
  onChange
}: PricingBillingSwitchProps) {
  return (
    <div className="pricing-billing-switch" role="group" aria-label={ariaLabel}>
      <button
        type="button"
        aria-pressed={mode === 'monthly'}
        onClick={() => onChange('monthly')}
        className={`pricing-billing-choice ${mode === 'monthly' ? 'is-active' : ''}`}
      >
        <span className="pricing-billing-choice-label">{monthlyLabel}</span>
      </button>
      <button
        type="button"
        aria-pressed={mode === 'yearly'}
        onClick={() => onChange('yearly')}
        className={`pricing-billing-choice ${mode === 'yearly' ? 'is-active' : ''}`}
      >
        <span className="pricing-billing-choice-label">{yearlyLabel}</span>
      </button>
      <span className="pricing-billing-save">{savingsLabel}</span>
    </div>
  );
}

interface PricingPaymentMethodSwitchProps {
  method: PricingPaymentMethod;
  availableMethods: PricingPaymentMethod[];
  cardLabel: string;
  alipayLabel: string;
  ariaLabel: string;
  onChange: (method: PricingPaymentMethod) => void;
}

export function PricingPaymentMethodSwitch({
  method,
  availableMethods,
  cardLabel,
  alipayLabel,
  ariaLabel,
  onChange
}: PricingPaymentMethodSwitchProps) {
  if (availableMethods.length < 2) return null;
  return (
    <div
      className="pricing-payment-method-switch"
      role="group"
      aria-label={ariaLabel}
    >
      <span className="pricing-payment-method-label">{ariaLabel}</span>
      {availableMethods.includes('stripe') ? (
        <button
          type="button"
          data-method="stripe"
          aria-pressed={method === 'stripe'}
          className={method === 'stripe' ? 'is-active' : ''}
          onClick={() => onChange('stripe')}
        >
          {cardLabel}
        </button>
      ) : null}
      {availableMethods.includes('alipay') ? (
        <button
          type="button"
          data-method="alipay"
          aria-pressed={method === 'alipay'}
          className={method === 'alipay' ? 'is-active' : ''}
          onClick={() => onChange('alipay')}
        >
          <span className="pricing-alipay-mark" aria-hidden="true">
            支
          </span>
          {alipayLabel}
        </button>
      ) : null}
    </div>
  );
}

interface PricingSectionHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function PricingSectionHeading({
  eyebrow,
  title,
  description,
  action
}: PricingSectionHeadingProps) {
  return (
    <header className="pricing-section-heading">
      <div>
        {eyebrow ? <span>{eyebrow}</span> : null}
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? (
        <div className="pricing-section-heading-action">{action}</div>
      ) : null}
    </header>
  );
}

interface PricingPlanCreditSummaryProps {
  credits: string;
  unit: string;
  badge: string;
  description: string;
  tone: 'free' | 'pro' | 'max';
}

/**
 * Keeps plan cards focused on a flexible creation allowance and the workflow it
 * unlocks. Concrete per-operation costs belong in the credit usage section.
 */
export function PricingPlanCreditSummary({
  credits,
  unit,
  badge,
  description,
  tone
}: PricingPlanCreditSummaryProps) {
  return (
    <div
      className="pricing-krea-credit-box mt-6 rounded-2xl bg-white/[0.055] p-4 ring-1 ring-white/5"
      data-tone={tone}
    >
      <div className="pricing-credit-summary-row flex items-center justify-between gap-3 text-sm font-black text-white">
        <span className="pricing-credit-summary-value">
          {credits} {unit}
        </span>
        <span className="pricing-plan-credit-badge rounded-full px-2.5 py-1 text-[10px] font-black">
          {badge}
        </span>
      </div>
      <p className="pricing-credit-summary-description mt-2 text-xs leading-5 text-slate-400">
        {description}
      </p>
    </div>
  );
}

interface PricingFaqListProps {
  items: Array<{ question: string; answer: string }>;
}

export function PricingFaqList({ items }: PricingFaqListProps) {
  return (
    <div className="pricing-faq-list">
      {items.map((item) => (
        <details key={item.question} className="pricing-faq-item">
          <summary>
            <span className="pricing-faq-question">{item.question}</span>
            <ChevronDown aria-hidden="true" />
          </summary>
          <p className="pricing-faq-answer">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
