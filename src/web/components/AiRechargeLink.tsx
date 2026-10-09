import { ArrowUpRight } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { trackEvent, isAnalyticsCollectionAllowed } from '../lib/analytics';
import { recordClientConversionEvent } from '../lib/client-conversion-events';
import '../styles/ai-recharge-link.css';

type AiRechargeLinkProps = {
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

export function AiRechargeLink({
  placement,
  locale,
  variant = 'inline',
  className = ''
}: AiRechargeLinkProps) {
  const { pathname } = useLocation();
  const isZh = locale === 'zh-CN';
  const destination = new URL('https://aicz.vip/');
  destination.search = new URLSearchParams({
    utm_source: 'webtomind',
    utm_medium: 'referral',
    utm_campaign: 'ai_membership',
    utm_content: placement
  }).toString();

  return (
    <a
      href={destination.toString()}
      target="_blank"
      rel="noopener noreferrer"
      className={`ai-recharge-link ai-recharge-link--${variant} ${className}`.trim()}
      data-recharge-placement={placement}
      title={
        isZh
          ? '前往 AICZ AI 会员代充（新窗口打开）'
          : 'Visit AICZ AI membership top-ups (opens in a new tab)'
      }
      onClick={() => {
        trackEvent('ai_recharge_click', {
          placement,
          link_url: destination.toString(),
          link_domain: 'aicz.vip',
          page_path: pathname,
          locale
        });
        if (isAnalyticsCollectionAllowed()) {
          void recordClientConversionEvent(null, {
            eventName: 'ai_recharge_click',
            entityType: 'outbound_link',
            entityId: 'aicz',
            ctaSource: placement,
            idempotencyKey: crypto.randomUUID(),
            metadata: {
              placement,
              path: pathname,
              locale,
              link_domain: 'aicz.vip'
            }
          });
        }
      }}
    >
      {variant === 'banner' ? (
        <>
          <span className="ai-recharge-link__copy">
            <strong>{isZh ? 'AI 会员代充' : 'AI membership top-ups'}</strong>
            <span>
              {isZh
                ? 'ChatGPT · Claude · Grok，前往 AICZ 选择套餐'
                : 'ChatGPT · Claude · Grok — explore plans at AICZ'}
            </span>
          </span>
          <span className="ai-recharge-link__action">
            {isZh ? '查看套餐' : 'View plans'}
            <ArrowUpRight size={16} aria-hidden="true" />
          </span>
        </>
      ) : (
        <>
          <span>{isZh ? 'AI 代充' : 'AI top-ups'}</span>
          <ArrowUpRight size={14} aria-hidden="true" />
        </>
      )}
    </a>
  );
}
