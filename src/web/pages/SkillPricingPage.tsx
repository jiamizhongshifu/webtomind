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
      title: isZh
        ? 'Skill Pro 价格 | WebToMind'
        : 'Skill Pro pricing | WebToMind',
      description: isZh
        ? '免费体验完整工作流；单独购买指定 Skill，或按月、按年订阅自营 Pro 库。模型费用另计。'
        : 'Try complete free workflows, buy an individual Skill, or subscribe monthly or yearly to the studio Pro library. Model fees are separate.',
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
          ? '先用免费 Skill 完成一次交付，再选择单品或自营全库会员。'
          : 'Start with a free workflow. Choose an individual Skill or studio library access.'
      }
    >
      <SkillPricingSection locale={locale} isZh={isZh} />
    </MarketingPageShell>
  );
}

export default SkillPricingPage;
