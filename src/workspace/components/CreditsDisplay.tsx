import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { createLogger } from '@/utils/logger';
import { Coins } from 'lucide-react';

const log = createLogger('CreditsDisplay');
import { getCreditsBalance, formatCredits } from '@/services/credits-api';
import type { CreditsBalanceResponse } from '@/types/membership';
import { collapsePaywallReturnTo } from '@/shared/paywall-return-to';

export interface CreditsDisplayProps {
  className?: string;
  onShowPricing?: () => void;
  labelSuffix?: string;
  trailingLabel?: string;
  compact?: boolean;
  /**
   * 可选的受控余额。传入后不再单独请求余额接口，适合父级已经通过
   * `/api/auth/me` 获取会员与积分信息的账户菜单。
   */
  totalCredits?: number | null;
}

function buildRechargeFallbackUrl() {
  const pathname = window.location.pathname || '/';
  const localePrefix = pathname.startsWith('/en-US')
    ? '/en-US'
    : pathname.startsWith('/zh-CN')
      ? '/zh-CN'
      : '';
  const isRechargePath = /^\/(?:zh-CN\/|en-US\/)?recharge\/?$/.test(pathname);

  if (isRechargePath) {
    return `${localePrefix}/recharge`;
  }

  const returnTo = collapsePaywallReturnTo(
    pathname,
    window.location.search,
    window.location.hash,
    `${localePrefix}/create`
  );
  return `${localePrefix}/recharge?source=credits_display&returnTo=${encodeURIComponent(returnTo)}`;
}

export const CreditsDisplay: React.FC<CreditsDisplayProps> = ({
  className = '',
  onShowPricing,
  labelSuffix,
  trailingLabel,
  compact = false,
  totalCredits
}) => {
  const { t } = useTranslation('workspace');
  const [balance, setBalance] = useState<CreditsBalanceResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [floatingChange, setFloatingChange] = useState<number | null>(null);

  const fetchBalance = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setIsLoading(true);
      const data = await getCreditsBalance();

      // 计算变化并显示动画（使用函数式更新避免闭包问题）
      setBalance((prevBalance) => {
        if (prevBalance) {
          const diff = data.credits.total - prevBalance.credits.total;
          if (diff !== 0) {
            setFloatingChange(diff);
            setTimeout(() => setFloatingChange(null), 2000);
          }
        }
        return data;
      });
    } catch (error) {
      log.error('[CreditsDisplay] Failed to fetch balance:', error);
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  }, []); // 移除 balance 依赖，避免无限循环

  useEffect(() => {
    if (totalCredits !== undefined) return;

    fetchBalance();

    // 监听积分变化消息 (仅在扩展环境)
    const handleMessage = (message: unknown) => {
      const eventMessage =
        message && typeof message === 'object'
          ? (message as { type?: string })
          : undefined;
      if (
        eventMessage?.type === 'CREDITS_CHANGED' ||
        eventMessage?.type === 'AUTH_STATE_CHANGED'
      ) {
        fetchBalance(true);
      }
    };

    // Web 环境：监听自定义事件刷新积分
    const handleCreditsChanged = () => {
      log.info(
        '[CreditsDisplay] Received credits-changed event, refreshing...'
      );
      fetchBalance(true);
    };
    window.addEventListener('credits-changed', handleCreditsChanged);

    // 检查是否在扩展环境
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(handleMessage);
      return () => {
        chrome.runtime.onMessage.removeListener(handleMessage);
        window.removeEventListener('credits-changed', handleCreditsChanged);
      };
    }

    return () => {
      window.removeEventListener('credits-changed', handleCreditsChanged);
    };
  }, [fetchBalance, totalCredits]);

  const handleClick = () => {
    if (onShowPricing) {
      onShowPricing();
    } else {
      window.location.assign(buildRechargeFallbackUrl());
    }
  };

  const controlled = totalCredits !== undefined;
  const resolvedTotal = controlled ? totalCredits : balance?.credits.total;
  const showLoading = controlled
    ? totalCredits === null
    : isLoading && !balance;

  if (showLoading) {
    if (compact) {
      return (
        <div
          className={`credits-display-compact-skeleton ${className}`}
          role="status"
          aria-label={t('membership.loadingCredits', '正在加载积分')}
        />
      );
    }

    return (
      <div
        className={`flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full animate-pulse ${className}`}
      >
        <div className="w-5 h-5 bg-slate-200 dark:bg-slate-700 rounded-full" />
        <div className="w-10 h-4 bg-slate-200 dark:bg-slate-700 rounded" />
      </div>
    );
  }

  if (resolvedTotal === null || resolvedTotal === undefined) return null;

  const formattedCredits = formatCredits(resolvedTotal);
  const compactLabel = [formattedCredits, labelSuffix, trailingLabel]
    .filter(Boolean)
    .join(' · ');

  if (compact) {
    return (
      <div className={`relative credits-display--compact ${className}`}>
        <button
          type="button"
          onClick={handleClick}
          className="credits-display-compact-button group"
          aria-label={compactLabel}
          title={`${compactLabel} · ${t('membership.buyCredits')}`}
        >
          <Coins aria-hidden="true" />
          {floatingChange !== null && (
            <span
              className={`credits-display-compact-change ${
                floatingChange > 0 ? 'is-positive' : 'is-negative'
              }`}
            >
              {floatingChange > 0 ? `+${floatingChange}` : floatingChange}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {/* 积分按钮 - 点击直接跳转到充值页 */}
      <button
        onClick={handleClick}
        className="flex items-center gap-2.5 px-3.5 py-2 bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md rounded-full transition-all group active:scale-95"
        title={t('membership.buyCredits')}
      >
        <div className="flex items-center justify-center w-6 h-6 bg-amber-50 dark:bg-amber-900/30 rounded-full shadow-inner ring-1 ring-amber-100 dark:ring-amber-800">
          <Coins className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 group-hover:scale-110 transition-transform" />
        </div>
        <span className="text-sm font-bold text-slate-800 dark:text-slate-200 tracking-tight">
          {formattedCredits}
          {labelSuffix && (
            <span className="credits-display-suffix"> {labelSuffix}</span>
          )}
        </span>
        {trailingLabel && (
          <span className="credits-display-trailing">{trailingLabel}</span>
        )}
        {floatingChange !== null && (
          <span
            className={`absolute -top-7 left-1/2 -translate-x-1/2 font-extrabold text-sm animate-out fade-out slide-out-to-top-6 duration-1000 fill-mode-forwards drop-shadow-sm ${
              floatingChange > 0 ? 'text-green-500' : 'text-red-500'
            }`}
          >
            {floatingChange > 0 ? `+${floatingChange}` : floatingChange}
          </span>
        )}
      </button>
    </div>
  );
};
