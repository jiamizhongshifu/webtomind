import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { useLocation } from 'react-router-dom';
import { claimDailyLoginReward } from '@/services/credits-api';
import type { DailyLoginRewardResult } from '@/types/membership';
import { useAuth } from '../../contexts/AuthContext';
import '../../styles/image-create.css';
import '../../styles/image-create-mobile.css';
import '../../styles/create-studio-theme.css';
import { CreateSideNav } from './CreateSideNav';
import { GlobalCommandPalette } from './GlobalCommandPalette';
import { isCreateWorkspaceFeatureEnabled } from '../../lib/create-workspace-flags';
import { CREATE_WORKSPACE_FEATURE_FLAGS } from '@/shared/create-workspace-v2';
import {
  DailyLoginRewardModal,
  DailyLoginRewardNotice
} from './DailyLoginRewardModal';

interface CreateWorkspaceFrameProps {
  className?: string;
  children: ReactNode;
}

export function CreateWorkspaceFrame({
  className = '',
  children
}: CreateWorkspaceFrameProps) {
  const location = useLocation();
  const { isAuthenticated, isLoading } = useAuth();
  const requestInFlightRef = useRef(false);
  const [rewardAttemptToken, setRewardAttemptToken] = useState(0);
  const [dailyReward, setDailyReward] = useState<DailyLoginRewardResult | null>(
    null
  );

  const localePrefix = useMemo<'' | '/zh-CN' | '/en-US'>(() => {
    if (location.pathname.startsWith('/en-US')) return '/en-US';
    if (location.pathname.startsWith('/zh-CN')) return '/zh-CN';
    return '';
  }, [location.pathname]);

  useEffect(() => {
    document.body.classList.add('image-create-route-active');
    return () => {
      document.body.classList.remove('image-create-route-active');
    };
  }, []);

  const todayKey = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return `webtomind:daily-login-reward:${today}`;
  }, []);

  const prefersInlineDailyReward = useMemo(() => {
    const pathname = location.pathname.replace(/^\/(zh-CN|en-US)/, '');
    return isCreateWorkspaceFeatureEnabled(
      CREATE_WORKSPACE_FEATURE_FLAGS.activationJourneyV1
    )
      ? pathname === '/create' ||
          pathname === '/image' ||
          pathname === '/video' ||
          pathname === '/ai-image-generator' ||
          pathname === '/image/create' ||
          pathname === '/prompts' ||
          pathname.startsWith('/create/prompts/share/')
      : false;
  }, [location.pathname]);

  const markDailyRewardSeen = useCallback(() => {
    try {
      window.localStorage.setItem(todayKey, '1');
    } catch {
      // localStorage may be unavailable in private or embedded contexts.
    }
  }, [todayKey]);

  useEffect(() => {
    if (isLoading || !isAuthenticated || requestInFlightRef.current) return;
    try {
      if (window.localStorage.getItem(todayKey) === '1') return;
    } catch {
      // Continue without persistence; API idempotency still prevents double credit.
    }

    let cancelled = false;
    const timer = window.setTimeout(
      () => {
        if (cancelled) return;

        const blockingModalOpen = Boolean(
          document.querySelector(
            '.create-onboarding-backdrop, .deep-feature-paywall-backdrop'
          )
        );

        if (blockingModalOpen) {
          setRewardAttemptToken((value) => value + 1);
          return;
        }

        requestInFlightRef.current = true;
        claimDailyLoginReward()
          .then((result) => {
            window.dispatchEvent(new CustomEvent('credits-changed'));
            if (result.reward > 0 && !result.alreadyClaimed) {
              setDailyReward(result);
              return;
            }
            markDailyRewardSeen();
          })
          .catch(() => {
            // Reward is a non-blocking surface; failures should not interrupt creation.
          })
          .finally(() => {
            requestInFlightRef.current = false;
          });
      },
      prefersInlineDailyReward ? 900 : 250
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    isAuthenticated,
    isLoading,
    markDailyRewardSeen,
    rewardAttemptToken,
    prefersInlineDailyReward,
    todayKey
  ]);

  const closeDailyReward = useCallback(() => {
    markDailyRewardSeen();
    setDailyReward(null);
  }, [markDailyRewardSeen]);

  return (
    <div
      className={[
        'image-create-page',
        'image-create-page-with-side-nav',
        'image-create-page-without-mininav',
        className
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <CreateSideNav />
      <main className="create-workspace-page">{children}</main>
      <GlobalCommandPalette localePrefix={localePrefix} />
      {prefersInlineDailyReward ? (
        <DailyLoginRewardNotice
          open={Boolean(dailyReward && dailyReward.reward > 0)}
          reward={dailyReward?.reward || 0}
          localePrefix={localePrefix}
          onClose={closeDailyReward}
        />
      ) : (
        <DailyLoginRewardModal
          open={Boolean(dailyReward && dailyReward.reward > 0)}
          reward={dailyReward?.reward || 0}
          localePrefix={localePrefix}
          onClose={closeDailyReward}
        />
      )}
    </div>
  );
}
