/**
 * 全局右下角「积分不足 / 免费版升级」提示。
 *
 * 展示条件（全部满足才展示）：
 * - 已登录，且会员状态已加载；
 * - 免费用户，或积分余额不足以完成下一次基础生成
 *   （credits.total < 基础图片生成成本，成本以后端 /api/credits/image-cost 为真相源）；
 * - 会员状态可用（接口失败时不做升级引导）；
 * - 今天尚未主动关闭过（localStorage 按本地日期记录，关闭后当天不再出现）；
 * - 当前不在套餐页 / 充值页 / 登录 / 回跳等不适合展示的页面。
 *
 * 点击卡片或 CTA 会前往工作台套餐页（/create/pricing），并带上 returnTo
 * 回到当前页面，方便付费完成后原路返回。
 */

import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import {
  getCreditsBalance,
  getImageGenerationCost
} from '@/services/credits-api';
import { IMAGE_GENERATION_BASE_CREDIT_COST } from '@/shared/image-generation-pricing';
import { collapsePaywallReturnTo } from '@/shared/paywall-return-to';
import { stripLocaleRoutePrefix } from '@/shared/seo-route-paths';
import { useAuth } from '../contexts/AuthContext';
import { useMembershipStatus } from './image-create/useMembershipStatus';
import {
  getWorkspacePricingHref,
  type PricingLocalePrefix
} from '../lib/pricing-route';
import { getAnalyticsSessionId, trackEvent } from '../lib/analytics';
import '../styles/credits-upgrade-prompt.css';

const DISMISSED_STORAGE_KEY = 'webtomind:credits-upgrade-prompt-dismissed:v1';

function getTodayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function wasDismissedToday(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(DISMISSED_STORAGE_KEY) === getTodayKey();
  } catch {
    // 存储不可用时按未关闭处理，提示照常展示。
    return false;
  }
}

function dismissForToday(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DISMISSED_STORAGE_KEY, getTodayKey());
  } catch {
    // 关闭记录失败只影响当日去重，不阻断页面。
  }
}

function isExcludedRoute(pathname: string): boolean {
  const routePath = stripLocaleRoutePrefix(pathname);
  return (
    routePath === '/tools/image-editor' ||
    routePath === '/tools/image-upscaler' ||
    routePath === '/pricing' ||
    routePath === '/create/pricing' ||
    routePath === '/recharge' ||
    routePath.startsWith('/recharge/') ||
    routePath === '/login' ||
    routePath === '/auth/callback' ||
    routePath === '/terms' ||
    routePath === '/privacy'
  );
}

export function CreditsUpgradePrompt() {
  const { isAuthenticated, isLoading } = useAuth();
  const membership = useMembershipStatus();
  const location = useLocation();
  const { t } = useTranslation('home');
  const [creditsTotal, setCreditsTotal] = useState<number | null>(null);
  const [creditsLoaded, setCreditsLoaded] = useState(false);
  const [minActionCost, setMinActionCost] = useState<number>(
    IMAGE_GENERATION_BASE_CREDIT_COST
  );
  const [visible, setVisible] = useState(false);
  const viewTrackedRef = useRef(false);

  // 拉取积分余额与基础生成成本，并在生成/签到等消费后通过 credits-changed 刷新。
  useEffect(() => {
    if (!isAuthenticated) {
      setCreditsTotal(null);
      setCreditsLoaded(false);
      return;
    }

    let cancelled = false;
    getImageGenerationCost()
      .then((cost) => {
        if (!cancelled && typeof cost === 'number' && cost > 0) {
          setMinActionCost(cost);
        }
      })
      .catch(() => {
        // 成本拉取失败保留本地基础档回退值，不阻塞展示。
      });
    const refresh = async () => {
      try {
        const balance = await getCreditsBalance();
        if (cancelled) return;
        setCreditsTotal(balance?.credits?.total ?? 0);
        setCreditsLoaded(true);
      } catch {
        // 余额拉取失败不阻断免费用户的提示；付费用户需凭余额确认用尽，不展示。
        if (!cancelled) setCreditsLoaded(false);
      }
    };
    void refresh();
    const handler = () => void refresh();
    window.addEventListener('credits-changed', handler);
    return () => {
      cancelled = true;
      window.removeEventListener('credits-changed', handler);
    };
  }, [isAuthenticated]);

  const creditsExhausted =
    creditsLoaded && creditsTotal !== null && creditsTotal < minActionCost;
  const qualifies = membership.isFree || creditsExhausted;

  const shouldShow =
    !isLoading &&
    isAuthenticated &&
    !membership.loading &&
    !membership.unavailable &&
    qualifies &&
    !wasDismissedToday() &&
    !isExcludedRoute(location.pathname);

  useEffect(() => {
    setVisible(shouldShow);
  }, [shouldShow]);

  useEffect(() => {
    if (!visible || viewTrackedRef.current) return;
    viewTrackedRef.current = true;
    trackEvent('credits_upgrade_prompt_view', {
      cta_source: 'credits_upgrade_prompt',
      session_id: getAnalyticsSessionId(),
      path: location.pathname
    });
  }, [location.pathname, visible]);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    dismissForToday();
    trackEvent('credits_upgrade_prompt_dismiss', {
      cta_source: 'credits_upgrade_prompt'
    });
  };

  const localePrefix: PricingLocalePrefix = location.pathname.startsWith(
    '/en-US'
  )
    ? '/en-US'
    : location.pathname.startsWith('/zh-CN')
      ? '/zh-CN'
      : '';
  const returnTo = collapsePaywallReturnTo(
    location.pathname,
    location.search,
    location.hash,
    `${localePrefix}/create`
  );
  const pricingHref = getWorkspacePricingHref(
    localePrefix,
    `source=credits_upgrade_prompt&returnTo=${encodeURIComponent(returnTo)}`
  );

  const title = creditsExhausted
    ? (t('creditsUpgrade.exhaustedTitle') as string)
    : (t('creditsUpgrade.freeTitle') as string);
  const description = creditsExhausted
    ? (t('creditsUpgrade.exhaustedDescription') as string)
    : (t('creditsUpgrade.freeDescription') as string);

  return (
    <aside
      className="credits-upgrade-prompt"
      role="region"
      aria-label={title}
    >
      <Link
        to={pricingHref}
        className="credits-upgrade-prompt__link"
        onClick={() =>
          trackEvent('credits_upgrade_prompt_click', {
            cta_source: 'credits_upgrade_prompt',
            destination: 'pricing'
          })
        }
      >
        <span className="credits-upgrade-prompt__glow" aria-hidden="true" />
        <span className="credits-upgrade-prompt__text">
          <strong>{title}</strong>
          <span>{description}</span>
        </span>
        <span className="credits-upgrade-prompt__cta">
          {t('creditsUpgrade.cta')}
        </span>
      </Link>
      <button
        type="button"
        className="credits-upgrade-prompt__close"
        onClick={dismiss}
        aria-label={t('creditsUpgrade.dismiss') as string}
      >
        <X size={16} strokeWidth={2} aria-hidden="true" />
      </button>
    </aside>
  );
}
