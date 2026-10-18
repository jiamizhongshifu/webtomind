import { useEffect } from 'react';
import { applySeo } from '../lib/seo';
import { MarketingPageShell, useMarketingLocale } from './MarketingPageShell';
import { SkillPricingSection } from './skill-catalog/SkillPricingSection';
import '../styles/skill-catalog.css';

export function SkillPricingPage() {
  const { locale, isZh } = useMarketingLocale();

  useEffect(() => {
    const origin = window.location.origin;
    return applySeo({
      title: isZh ? 'Skill Pro 价格 | WebToMind' : 'Skill Pro pricing | WebToMind',
      description: isZh
        ? '免费 Skill 随便装；Skill Pro 月付、年付或一次买断，解锁全部 Pro Skill。'
        : 'Free Skills for everyone. Skill Pro monthly, yearly or lifetime unlocks every Pro Skill.',
      canonical: `${origin}/${locale}/skills/pricing`,
      alternates: [
        { hreflang: 'zh-CN', href: `${origin}/zh-CN/skills/pricing` },
        { hreflang: 'en-US', href: `${origin}/en-US/skills/pricing` },
        { hreflang: 'x-default', href: `${origin}/en-US/skills/pricing` }
      ]
    });
  }, [isZh, locale]);

  return (
    <MarketingPageShell
      rootClassName="skill-catalog-root"
      title={isZh ? 'Skill 价格' : 'Skill pricing'}
      subtitle={
        isZh
          ? '免费 Skill 永久免费；Pro Skill 订阅或买断后全部可用。'
          : 'Free Skills stay free. Subscribe or buy once to unlock every Pro Skill.'
      }
    >
      <SkillPricingSection locale={locale} isZh={isZh} />
    </MarketingPageShell>
  );
}

export default SkillPricingPage;
