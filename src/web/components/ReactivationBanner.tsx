/**
 * 存量免费用户激活 banner（首页 overview）。
 *
 * 仅对已登录且无会员的用户展示，引导先完成一次生成（激活）而非直接推销，
 * 对应「旧关系 upsell」：先让老用户回到核心流程，再谈升级。
 * 会话内可关闭，关闭后当次会话不再出现。
 */

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { ButtonLink } from '@/shared/ui';
import { useAuth } from '../contexts/AuthContext';
import { useMembershipStatus } from './image-create/useMembershipStatus';
import { getAnalyticsSessionId, trackEvent } from '../lib/analytics';
import '../styles/reactivation-banner.css';

const DISMISSED_KEY = 'webtomind:reactivation-banner-dismissed:v1';

export function ReactivationBanner() {
  const { isAuthenticated } = useAuth();
  const membership = useMembershipStatus();
  const location = useLocation();
  const { t } = useTranslation('home');
  const [visible, setVisible] = useState(false);
  const viewTrackedRef = useRef(false);

  const localePrefix =
    location.pathname.startsWith('/en-US')
      ? '/en-US'
      : location.pathname.startsWith('/zh-CN')
        ? '/zh-CN'
        : '';
  useEffect(() => {
    if (
      !isAuthenticated ||
      membership.loading ||
      membership.unavailable ||
      !membership.isFree
    ) {
      setVisible(false);
      return;
    }
    try {
      if (window.sessionStorage.getItem(DISMISSED_KEY)) {
        setVisible(false);
        return;
      }
    } catch {
      // Dismissal is best-effort.
    }
    setVisible(true);
  }, [
    isAuthenticated,
    membership.loading,
    membership.isFree,
    membership.unavailable
  ]);

  useEffect(() => {
    if (!visible || viewTrackedRef.current) return;
    viewTrackedRef.current = true;
    trackEvent('reengagement_banner_view', {
      cta_source: 'reengagement_banner',
      session_id: getAnalyticsSessionId(),
      path: location.pathname
    });
  }, [location.pathname, visible]);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Ignore storage failures.
    }
    trackEvent('reengagement_banner_dismiss', {
      cta_source: 'reengagement_banner'
    });
  };

  const createHref = `${localePrefix || '/zh-CN'}/create`;
  const pricingHref = `${localePrefix || '/zh-CN'}/pricing?source=reengagement_banner`;

  return (
    <aside
      className="reactivation-banner"
      role="region"
      aria-label={t('reactivation.title')}
    >
      <div className="reactivation-banner__body">
        <strong className="reactivation-banner__title">
          {t('reactivation.title')}
        </strong>
        <p className="reactivation-banner__description">
          {t('reactivation.description')}
        </p>
      </div>
      <div className="reactivation-banner__actions">
        <ButtonLink
          to={createHref}
          onClick={() =>
            trackEvent('reengagement_banner_click', {
              cta_source: 'reengagement_banner',
              destination: 'create'
            })
          }
        >
          {t('reactivation.ctaCreate')}
        </ButtonLink>
        <ButtonLink
          to={pricingHref}
          variant="secondary"
          onClick={() =>
            trackEvent('reengagement_banner_click', {
              cta_source: 'reengagement_banner',
              destination: 'pricing'
            })
          }
        >
          {t('reactivation.ctaPricing')}
        </ButtonLink>
      </div>
      <button
        type="button"
        className="reactivation-banner__dismiss"
        onClick={dismiss}
        aria-label={t('reactivation.dismiss')}
      >
        <X size={16} strokeWidth={2} />
      </button>
    </aside>
  );
}
