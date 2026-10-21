import { ArrowUpRight } from 'lucide-react';
import { isAnalyticsCollectionAllowed, trackEvent } from '../lib/analytics';
import '../styles/siskill-link.css';

type SiSkillLinkProps = {
  placement:
    | 'top_nav'
    | 'home'
    | 'create_home'
    | 'prompt_library'
    | 'prompt_detail'
    | 'footer';
  locale: 'zh-CN' | 'en-US';
  variant?: 'inline' | 'banner';
  className?: string;
};

export function SiSkillLink({
  placement,
  locale,
  variant = 'inline',
  className = ''
}: SiSkillLinkProps) {
  const isZh = locale === 'zh-CN';
  const destination = new URL(`https://siskill.dev/${locale}/overview`);
  destination.search = new URLSearchParams({
    utm_source: 'webtomind',
    utm_medium: 'referral',
    utm_campaign: 'siskill-launch',
    utm_content: placement
  }).toString();

  return (
    <a
      href={destination.toString()}
      target="_blank"
      rel="noopener noreferrer"
      className={`siskill-link siskill-link--${variant} ${className}`.trim()}
      data-siskill-placement={placement}
      title={
        isZh
          ? '探索 SiSkill（新窗口打开）'
          : 'Explore SiSkill (opens in a new tab)'
      }
      onClick={() => {
        if (isAnalyticsCollectionAllowed()) {
          trackEvent('siskill_referral_click', {
            placement,
            locale,
            link_domain: 'siskill.dev',
            campaign_name: 'siskill-launch'
          });
        }
      }}
    >
      {variant === 'banner' ? (
        <>
          <span className="siskill-link__copy">
            <strong>
              {isZh
                ? '给 Agent 一套创作工作流'
                : 'Creative workflows for your agent'}
            </strong>
            <span>
              {isZh
                ? '在 SiSkill 探索写作、演示和视频 Skills。'
                : 'Explore writing, decks and video Skills on SiSkill.'}
            </span>
          </span>
          <span className="siskill-link__action">
            SiSkill <ArrowUpRight size={16} aria-hidden="true" />
          </span>
        </>
      ) : (
        <>
          <span>SiSkill</span>
          <ArrowUpRight size={14} aria-hidden="true" />
        </>
      )}
    </a>
  );
}
