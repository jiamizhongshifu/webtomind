import { forwardRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/radix/button';
import { BeamCta } from '@/web/components/BeamCta';
import {
  CREATOR_UPGRADE_PLAN_CATALOG,
  type UpgradePlanName,
  type UpgradeSelection
} from '@/shared/pricing-catalog';
import { useLanguage } from '@/i18n/hooks/useLanguage';
import upgradeVisual from '../../assets/home/neon-collage-hero-product.webp';

const UPGRADE_PLAN_NAMES = Object.keys(
  CREATOR_UPGRADE_PLAN_CATALOG
) as UpgradePlanName[];

export interface UpgradePromptModalProps {
  open: boolean;
  message: string;
  estimatedCost: number;
  creditsBalance?: number | null;
  onClose: () => void;
  onUpgrade: (selection: UpgradeSelection) => void;
}

export const UpgradePromptModal = forwardRef<
  HTMLElement,
  UpgradePromptModalProps
>(function UpgradePromptModal(
  { open, message, estimatedCost, creditsBalance, onClose, onUpgrade },
  modalRef
) {
  const { t } = useTranslation('imageCreate');
  const { language } = useLanguage();
  const [plan, setPlan] = useState<UpgradePlanName>('pro');
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('yearly');
  const selectedPlan = CREATOR_UPGRADE_PLAN_CATALOG[plan];
  const benefitLocale = language === 'en-US' ? 'en-US' : 'zh-CN';

  if (!open) return null;

  return (
    <div
      className="creator-upgrade-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        ref={modalRef}
        className="creator-upgrade-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('upgrade.title') as string}
        onMouseDown={(event) => event.stopPropagation()}
        tabIndex={-1}
      >
        <div className="creator-upgrade-visual">
          <img src={upgradeVisual} alt="" />
          <div>
            <strong>WebToMind Create</strong>
            <span>把灵感、视觉语境与生成结果留在同一条创作链路中。</span>
          </div>
        </div>
        <div className="creator-upgrade-content">
          <div className="creator-upgrade-head">
            <div>
              <span className="creator-upgrade-eyebrow">升级创作能力</span>
              <h2>{t('upgrade.title')}</h2>
              <p>{message || t('upgrade.description')}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="creator-upgrade-close"
              aria-label={t('upgrade.close') as string}
              onClick={onClose}
            >
              <X />
            </Button>
          </div>
          <div
            className="creator-upgrade-plan-tabs"
            role="tablist"
            aria-label="选择套餐"
          >
            {UPGRADE_PLAN_NAMES.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={plan === item}
                className={plan === item ? 'is-active' : ''}
                onClick={() => setPlan(item)}
              >
                {CREATOR_UPGRADE_PLAN_CATALOG[item].label}
              </button>
            ))}
          </div>
          <ul className="creator-upgrade-benefits">
            {selectedPlan.benefits[benefitLocale].map((benefit) => (
              <li key={benefit}>
                <Check /> {benefit}
              </li>
            ))}
          </ul>
          <div className="creator-upgrade-meta">
            <span>{t('upgrade.required', { credits: estimatedCost })}</span>
            <span>
              {t('upgrade.current', { credits: creditsBalance ?? 0 })}
            </span>
          </div>
          <div
            className="creator-upgrade-billing"
            role="radiogroup"
            aria-label="订阅方式"
          >
            <button
              type="button"
              role="radio"
              aria-checked={billing === 'monthly'}
              className={billing === 'monthly' ? 'is-active' : ''}
              onClick={() => setBilling('monthly')}
            >
              <span>月付</span>
              <strong>灵活按月订阅</strong>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={billing === 'yearly'}
              className={billing === 'yearly' ? 'is-active' : ''}
              onClick={() => setBilling('yearly')}
            >
              <span>年付 · 更优惠</span>
              <strong>以结账页实时价格为准</strong>
            </button>
          </div>
          <div className="creator-upgrade-actions">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('upgrade.later')}
            </Button>
            <BeamCta tone="warm">
              <Button
                type="button"
                className="primary"
                onClick={() => onUpgrade({ plan, billing })}
              >
                {t('upgrade.cta')}
              </Button>
            </BeamCta>
          </div>
        </div>
      </section>
    </div>
  );
});
