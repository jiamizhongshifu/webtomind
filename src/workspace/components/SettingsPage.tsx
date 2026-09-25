import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { createLogger } from '@/utils/logger';
import { ChevronLeft } from 'lucide-react';
import { useLanguage } from '@/i18n/hooks/useLanguage';
import type { SupportedLanguage } from '@/i18n/config';

const log = createLogger('SettingsPage');
import { useAuth } from '@/web/contexts/AuthContext';
import { UserAvatar } from '@/shared/components/UserAvatar';
import { Badge } from '@/shared/ui/radix/badge';
import { Button } from '@/shared/ui/radix/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/shared/ui/radix/alert-dialog';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/shared/ui/radix/select';
import { Separator } from '@/shared/ui/radix/separator';
import { Skeleton } from '@/shared/ui/radix/skeleton';
import { cn } from '@/lib/utils';
import {
  getCreditSourceLabel,
  getDailyUsage,
  getTransactions,
  type DailyUsageData
} from '@/services/credits-api';
import type { CreditSource, CreditTransaction } from '@/types/membership';
import { FREE_DAILY_CREDITS } from '@/shared/credit-policy';
import { getStoredTheme, changeTheme, type Theme } from '@/utils/theme';

interface SettingsPageProps {
  onBack: () => void;
  onShowPricing: () => void;
  profile?: {
    member_number?: number;
    member_number_formatted?: string;
    days_joined?: number;
  } | null;
  credits?: {
    daily: number;
    dailyMax: number;
    subscription?: number;
    subscriptionMax?: number;
    bonus: number;
    total: number;
  } | null;
  subscription?: {
    planName: string;
    status: string;
  } | null;
}

type SettingsTranslate = (
  key: string,
  options?: Record<string, unknown>
) => string;

interface SettingsUser {
  email?: string;
  user_metadata?: {
    full_name?: string;
    picture?: string;
    avatar_url?: string;
  };
}

interface SettingsCredits {
  daily?: number;
  dailyMax?: number;
}

interface SettingsSubscription {
  planName?: string;
}

function formatCreditsValue(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value);
}

function formatSignedCredits(value: number): string {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${formatCreditsValue(value)}`;
}

function getTransactionTimeLabel(value: string, language: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language === 'en-US' ? 'en-US' : 'zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function getTransactionTypeLabel(
  tx: CreditTransaction,
  language: string
): string {
  const isEn = language === 'en-US';
  if (tx.type === 'refund') return isEn ? 'Refund' : '退款';
  if (tx.type === 'earn') return isEn ? 'Credit added' : '积分获取';
  if (tx.type === 'expire') return isEn ? 'Expired' : '积分过期';
  if (tx.type === 'admin_adjustment') {
    return isEn ? 'System adjustment' : '系统校准';
  }
  return isEn ? 'Credit spent' : '积分消耗';
}

function getTransactionSourceLabel(
  tx: CreditTransaction,
  language: string
): string {
  const source = String(tx.source || '');
  if (source === 'daily_login_reward') {
    return language === 'en-US' ? 'Daily login reward' : '每日登录奖励';
  }
  if (source === 'image_generation_refund') {
    return language === 'en-US' ? 'Image generation refund' : '图片生成退款';
  }
  const localized = getCreditSourceLabel(source as CreditSource, language);
  if (localized !== source) return localized;
  if (tx.description) return tx.description;
  return source;
}

function getTransactionMetaLabel(
  tx: CreditTransaction,
  language: string
): string {
  const metadata = tx.metadata || {};
  const isEn = language === 'en-US';
  const parts: string[] = [];

  if (metadata.source === 'batch_image_execute') {
    const batchIndex = Number(metadata.batch_index);
    parts.push(
      Number.isFinite(batchIndex)
        ? isEn
          ? `Batch item ${batchIndex + 1}`
          : `批量任务第 ${batchIndex + 1} 张`
        : isEn
          ? 'Batch image task'
          : '批量生图任务'
    );
  }

  if (metadata.billingDomain === 'image_task') {
    parts.push(isEn ? 'Queued image task' : '队列生图任务');
  }

  const imageCount =
    typeof metadata.imageCount === 'number'
      ? metadata.imageCount
      : typeof metadata.requestedImageCount === 'number'
        ? metadata.requestedImageCount
        : null;
  if (imageCount) {
    parts.push(isEn ? `${imageCount} images` : `${imageCount} 张图`);
  }

  const model =
    typeof metadata.model === 'string'
      ? metadata.model
      : typeof metadata.provider === 'string'
        ? metadata.provider
        : null;
  if (model) parts.push(model);

  const size =
    typeof metadata.imageSize === 'string'
      ? metadata.imageSize
      : typeof metadata.billingImageSize === 'string'
        ? metadata.billingImageSize
        : null;
  if (size) parts.push(size);

  const quality =
    typeof metadata.quality === 'string'
      ? metadata.quality
      : typeof metadata.billingQuality === 'string'
        ? metadata.billingQuality
        : null;
  if (quality) parts.push(quality);

  const taskId =
    typeof metadata.taskId === 'string'
      ? metadata.taskId
      : typeof tx.sourceId === 'string'
        ? tx.sourceId
        : null;
  if (taskId) {
    parts.push(`#${taskId.slice(0, 8)}`);
  }

  return parts.join(' · ');
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  onBack,
  onShowPricing,
  profile,
  credits,
  subscription
}) => {
  const { t } = useTranslation(['workspace']);
  const {
    language,
    changeLanguage,
    isLoading: isLanguageChanging
  } = useLanguage();
  const { user, signOut } = useAuth();
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());
  const [selectedModel, setSelectedModel] = useState('fast');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const currentLanguage = language === 'zh-CN' ? '简体中文' : 'English';

  // 处理主题切换
  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    changeTheme(newTheme);
  };

  const handleLanguageChange = async (lang: SupportedLanguage) => {
    await changeLanguage(lang);
  };

  const handleLogout = async () => {
    await signOut();
    onBack();
  };

  return (
    <div className="settings-page-root min-h-screen bg-slate-50/50 text-slate-950 dark:bg-[#0b0d12] dark:text-slate-100">
      <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.logoutConfirm.title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'settings.logoutConfirm.description',
                '退出后需要重新登录才能继续使用工作台。'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t('settings.logoutConfirm.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleLogout()}
            >
              {t('settings.logoutConfirm.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Header */}
      <div className="border-b border-slate-100 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-950 sm:px-6">
        <Button
          onClick={onBack}
          className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-slate-100"
          type="button"
          variant="ghost"
        >
          <ChevronLeft data-icon="inline-start" />
          {t('settings.back')}
        </Button>
      </div>

      <div className="mx-auto w-full max-w-5xl px-4 py-6 pb-28 sm:px-6 sm:py-10 lg:px-8">
        <main className="space-y-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-500">
              Account
            </p>
            <h1 className="text-3xl font-bold text-slate-950 dark:text-slate-50 sm:text-4xl">
              {t('settings.title')}
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-300">
              管理账户、套餐、积分使用和创作偏好，所有设置都集中在这一页。
            </p>
          </div>

          <OverviewTab
            t={t}
            user={user}
            profile={profile}
            credits={credits}
            subscription={subscription}
            onShowPricing={onShowPricing}
          />
          <GeneralTab
            t={t}
            user={user}
            theme={theme}
            onThemeChange={handleThemeChange}
            currentLanguage={currentLanguage}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            handleLanguageChange={handleLanguageChange}
            onLogoutClick={() => setShowLogoutConfirm(true)}
            language={language}
            isLanguageChanging={isLanguageChanging}
          />
          <ConnectionsTab t={t} />
        </main>
      </div>
    </div>
  );
};

// Overview Tab Component
const OverviewTab: React.FC<{
  t: unknown;
  user: unknown;
  profile: unknown;
  credits: unknown;
  subscription: unknown;
  onShowPricing: () => void;
}> = ({
  t: tRaw,
  user: userRaw,
  profile: _profile,
  credits: creditsRaw,
  subscription: subscriptionRaw,
  onShowPricing
}) => {
  const t = tRaw as SettingsTranslate;
  const user = userRaw as SettingsUser | null;
  const credits = creditsRaw as SettingsCredits | null;
  const subscription = subscriptionRaw as SettingsSubscription | null;
  // 当前套餐 ID
  const currentPlanId = subscription?.planName || 'free';
  const plans = [
    {
      id: 'free',
      name: t('membership.plan_free'),
      price: null,
      description: t('membership.freePlanDesc'),
      credits: formatCreditsValue(FREE_DAILY_CREDITS),
      creditsLabel: t('membership.limit_dailyCredits')
    },
    {
      id: 'pro',
      name: t('membership.plan_pro'),
      price: '$20',
      period: '/mo',
      description: '日常高效创作',
      credits: '10,000',
      creditsLabel: t('membership.limit_monthlyCredits_pro')
    },
    {
      id: 'max',
      name: t('membership.plan_max'),
      price: '$100',
      period: '/mo',
      description: '尽享 WebToMind 所有能力',
      credits: '60,000',
      creditsLabel: t('membership.limit_monthlyCredits_max')
    }
  ];

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700/80 dark:bg-slate-900 sm:p-6 dark:shadow-black/30">
      {/* User Profile */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <UserAvatar
            user={user}
            name={user?.user_metadata?.full_name}
            email={user?.email}
            className="w-14 h-14 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-500 flex items-center justify-center text-white font-bold text-xl overflow-hidden"
            imageClassName="w-full h-full object-cover"
            loading="eager"
            fetchPriority="high"
            preload
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {user?.user_metadata?.full_name ||
                  user?.email?.split('@')[0] ||
                  'User'}
              </span>
              <Badge
                variant={
                  subscription?.planName && subscription.planName !== 'free'
                    ? 'default'
                    : 'secondary'
                }
                className={cn(
                  'rounded-full',
                  subscription?.planName &&
                    subscription.planName !== 'free' &&
                    'bg-gradient-to-r from-blue-500 to-indigo-500 text-white'
                )}
              >
                {subscription?.planName
                  ? subscription.planName === 'free'
                    ? 'Free'
                    : subscription.planName.toUpperCase()
                  : 'Free'}
              </Badge>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-300">
              {user?.email}
            </p>
          </div>
        </div>
        <Button
          onClick={onShowPricing}
          className="w-full rounded-full sm:w-auto"
          type="button"
        >
          {t('settings.overview.upgrade')}
        </Button>
      </div>

      {/* Plans */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
          {t('settings.overview.plan')}
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`p-4 rounded-xl border ${
                plan.id === currentPlanId
                  ? 'border-blue-200 dark:border-blue-500/60 bg-blue-50/30 dark:bg-blue-950/35'
                  : 'border-slate-200 dark:border-slate-700 dark:bg-slate-950/35'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {plan.name}
                </span>
                {plan.id === currentPlanId && (
                  <Badge className="rounded-full" variant="secondary">
                    {t('settings.overview.currentPlan')}
                  </Badge>
                )}
              </div>
              {plan.price && (
                <div className="text-slate-500 dark:text-slate-300 text-sm mb-1">
                  <span className="text-slate-900 dark:text-slate-100 font-semibold">
                    {plan.price}
                  </span>
                  {plan.period}
                </div>
              )}
              <p className="text-sm text-slate-500 dark:text-slate-300 mb-3">
                {plan.description}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                {plan.creditsLabel}
              </p>
              {plan.id === currentPlanId ? (
                // 只有免费用户显示每日积分，付费用户不显示
                currentPlanId === 'free' ? (
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                      {credits?.daily || 0}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      /
                    </span>
                    <span className="text-lg text-slate-500 dark:text-slate-300">
                      {credits?.dailyMax ?? FREE_DAILY_CREDITS}
                    </span>
                    <span className="text-sm text-slate-500 dark:text-slate-400 ml-1">
                      {t('settings.overview.credits')}
                    </span>
                  </div>
                ) : null
              ) : (
                <Button onClick={onShowPricing} type="button">
                  {t('settings.overview.upgrade')}
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Usage Chart */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
          {t('settings.overview.usage')}
        </h2>
        <div className="mb-6 flex gap-2">
          <Button
            className="rounded-full"
            size="sm"
            type="button"
            variant="secondary"
          >
            {t('settings.overview.dailyUsage')}
          </Button>
          <Button
            className="rounded-full text-muted-foreground"
            size="sm"
            type="button"
            variant="ghost"
          >
            {t('settings.overview.bonusCredits')}
          </Button>
        </div>
        <UsageChart credits={credits} />
        <CreditTransactionsList />
      </section>
    </div>
  );
};

// Usage Chart Component
const UsageChart: React.FC<{ credits?: unknown }> = ({ credits: _credits }) => {
  const { i18n } = useTranslation();
  const [usageData, setUsageData] = useState<DailyUsageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(0); // 0 = 最近14天, 1 = 15-28天, 2 = 29-42天
  const DAYS_PER_PAGE = 14;

  useEffect(() => {
    let cancelled = false;
    const fetchUsageData = async () => {
      try {
        setLoading(true);
        // 获取最近42天的数据（3页）
        const response = await getDailyUsage(42);
        if (!cancelled) {
          setUsageData(response.usage);
        }
      } catch (error) {
        if (!cancelled) {
          log.error('[UsageChart] Failed to fetch usage data:', error);
          // 如果获取失败，使用空数据
          setUsageData([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchUsageData();
    return () => {
      cancelled = true;
    };
  }, []);

  // 根据当前页码获取显示的数据
  const getPageData = () => {
    if (usageData.length === 0) {
      // 生成空数据占位
      const data = [];
      const today = new Date();
      for (let i = DAYS_PER_PAGE - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i - currentPage * DAYS_PER_PAGE);
        data.push({
          date: date.toISOString().split('T')[0],
          usage: 0
        });
      }
      return data;
    }

    // 从后往前取数据（最新的在最后）
    const startIndex =
      usageData.length - DAYS_PER_PAGE - currentPage * DAYS_PER_PAGE;
    const endIndex = startIndex + DAYS_PER_PAGE;
    return usageData.slice(Math.max(0, startIndex), endIndex);
  };

  const chartData = getPageData();
  const maxValue = Math.max(...chartData.map((d) => d.usage), 100);
  const totalPages = Math.ceil(usageData.length / DAYS_PER_PAGE) || 1;

  // 格式化日期标签
  const formatDateLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    const isZh = i18n.language === 'zh-CN';
    if (isZh) {
      return `${date.getMonth() + 1}月${date.getDate()}`;
    }
    return `${date.toLocaleString('en-US', { month: 'short' })} ${date.getDate()}`;
  };

  if (loading) {
    return (
      <div className="w-full rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700/80 dark:bg-slate-900 sm:p-6">
        <div className="flex items-end justify-between h-48 gap-2">
          {Array(14)
            .fill(0)
            .map((_, index) => (
              <div
                key={index}
                className="flex-1 flex flex-col items-center gap-2"
              >
                <div className="w-full flex justify-center">
                  <Skeleton
                    className="w-6 rounded-t"
                    style={{ height: `${Math.random() * 100 + 40}px` }}
                  />
                </div>
              </div>
            ))}
        </div>
        <div className="flex justify-between mt-2 text-xs text-slate-500 dark:text-slate-400">
          {Array(7)
            .fill(0)
            .map((_, index) => (
              <Skeleton key={index} className="h-3 w-10" />
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700/80 dark:bg-slate-900 sm:p-6">
      <div className="grid h-48 grid-cols-[repeat(14,minmax(0,1fr))] items-end gap-1.5 sm:gap-2">
        {chartData.map((item, index) => (
          <div
            key={index}
            className="group relative flex min-w-0 flex-col items-center gap-2"
          >
            <div className="w-full flex justify-center">
              <div
                className="w-full max-w-6 cursor-pointer rounded-t bg-slate-900 transition-all hover:bg-slate-700 dark:bg-slate-100 dark:hover:bg-slate-300"
                style={{
                  height: `${Math.max((item.usage / maxValue) * 160, 4)}px`
                }}
              />
            </div>
            {/* Tooltip */}
            <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
              <div className="bg-slate-800 dark:bg-slate-600 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                {formatDateLabel(item.date)}: {item.usage} 积分
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 mt-2 text-xs text-slate-500 dark:text-slate-400">
        {chartData
          .filter((_, i) => i % 2 === 0)
          .map((item, index) => (
            <span key={index} className="truncate text-center">
              {formatDateLabel(item.date)}
            </span>
          ))}
      </div>
      <div className="flex justify-center items-center gap-4 mt-4 text-sm text-slate-500 dark:text-slate-300">
        <Button
          onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages - 1))}
          disabled={currentPage >= totalPages - 1}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ChevronLeft data-icon="inline-start" />
        </Button>
        <span>
          {currentPage + 1} / {totalPages}
        </span>
        <Button
          onClick={() => setCurrentPage((p) => Math.max(p - 1, 0))}
          disabled={currentPage <= 0}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ChevronLeft data-icon="inline-start" className="rotate-180" />
        </Button>
      </div>
    </div>
  );
};

const CreditTransactionsList: React.FC = () => {
  const { i18n } = useTranslation();
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const language = i18n.language === 'en-US' ? 'en-US' : 'zh-CN';
  const isEn = language === 'en-US';

  useEffect(() => {
    let cancelled = false;
    const fetchTransactions = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getTransactions(1, 30);
        if (!cancelled) {
          setTransactions(response.transactions);
          setTotal(response.total);
          setHasMore(response.hasMore);
        }
      } catch (fetchError) {
        if (!cancelled) {
          log.error(
            '[CreditTransactionsList] Failed to fetch transactions:',
            fetchError
          );
          setError(
            isEn ? 'Unable to load credit history.' : '暂时无法加载积分流水。'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchTransactions();
    return () => {
      cancelled = true;
    };
  }, [isEn]);

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-white dark:border-slate-700/80 dark:bg-slate-900">
      <div className="flex flex-col gap-2 border-b border-slate-100 p-4 dark:border-slate-700/80 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {isEn ? 'Credit history' : '积分流水'}
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
            {isEn
              ? `Showing the latest ${transactions.length} records${total ? ` of ${total}` : ''}.`
              : `展示最近 ${transactions.length} 条记录${total ? `，共 ${total} 条` : ''}。`}
            {hasMore &&
              (isEn ? ' More records are available.' : ' 还有更多历史记录。')}
          </p>
        </div>
        <Badge className="w-fit rounded-full" variant="secondary">
          {isEn ? 'Earn / Spend / Refund' : '获取 / 消耗 / 退款'}
        </Badge>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3 p-4">
          {Array(5)
            .fill(0)
            .map((_, index) => (
              <Skeleton key={index} className="h-12 rounded-lg" />
            ))}
        </div>
      ) : error ? (
        <div className="p-4 text-sm text-red-500">{error}</div>
      ) : transactions.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-300">
          {isEn ? 'No credit records yet.' : '暂无积分流水。'}
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden md:block">
            <table className="w-full table-fixed text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-950/80 dark:text-slate-300">
                <tr>
                  <th className="w-[18%] px-4 py-3">
                    {isEn ? 'Time' : '时间'}
                  </th>
                  <th className="w-[22%] px-4 py-3">
                    {isEn ? 'Type' : '类型'}
                  </th>
                  <th className="px-4 py-3">{isEn ? 'Details' : '明细'}</th>
                  <th className="w-[14%] px-4 py-3 text-right">
                    {isEn ? 'Amount' : '变动'}
                  </th>
                  <th className="w-[14%] px-4 py-3 text-right">
                    {isEn ? 'Balance' : '余额'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {transactions.map((tx) => {
                  const amountClass =
                    tx.amount > 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : tx.type === 'refund'
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-slate-900 dark:text-slate-100';
                  const metaLabel = getTransactionMetaLabel(tx, language);
                  return (
                    <tr key={tx.id}>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-300">
                        {getTransactionTimeLabel(tx.createdAt, language)}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                        {getTransactionTypeLabel(tx, language)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="truncate font-medium text-slate-900 dark:text-slate-100">
                          {getTransactionSourceLabel(tx, language)}
                        </div>
                        {metaLabel && (
                          <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                            {metaLabel}
                          </div>
                        )}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-semibold ${amountClass}`}
                      >
                        {formatSignedCredits(tx.amount)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-300">
                        {formatCreditsValue(tx.balanceAfter)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-700/80 md:hidden">
            {transactions.map((tx) => {
              const metaLabel = getTransactionMetaLabel(tx, language);
              return (
                <div key={tx.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {getTransactionSourceLabel(tx, language)}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {getTransactionTimeLabel(tx.createdAt, language)} ·{' '}
                        {getTransactionTypeLabel(tx, language)}
                      </div>
                    </div>
                    <div
                      className={`shrink-0 text-right text-sm font-bold ${
                        tx.amount > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : tx.type === 'refund'
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {formatSignedCredits(tx.amount)}
                    </div>
                  </div>
                  {metaLabel && (
                    <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-950/70 dark:text-slate-300 dark:ring-1 dark:ring-slate-800">
                      {metaLabel}
                    </div>
                  )}
                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    {isEn ? 'Balance' : '余额'}{' '}
                    {formatCreditsValue(tx.balanceAfter)}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

// General Tab Component
const GeneralTab: React.FC<{
  t: unknown;
  user: unknown;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  currentLanguage: string;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  handleLanguageChange: (lang: SupportedLanguage) => Promise<void>;
  onLogoutClick: () => void;
  language: SupportedLanguage;
  isLanguageChanging: boolean;
}> = ({
  t: tRaw,
  user: userRaw,
  theme,
  onThemeChange: setTheme,
  currentLanguage,
  selectedModel,
  setSelectedModel,
  handleLanguageChange,
  onLogoutClick,
  language,
  isLanguageChanging
}) => {
  const t = tRaw as SettingsTranslate;
  const user = userRaw as SettingsUser | null;
  const themes: { id: Theme; label: string }[] = [
    { id: 'light', label: t('settings.general.themeLight') },
    { id: 'system', label: t('settings.general.themeSystem') },
    { id: 'dark', label: t('settings.general.themeDark') }
  ];

  const models = [
    { id: 'fast', label: t('settings.general.modelFast') },
    { id: 'balanced', label: t('settings.general.modelBalanced') },
    { id: 'powerful', label: t('settings.general.modelPowerful') }
  ];

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {t('settings.tabs.general')}
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
          统一管理语言、主题、默认模型和账号操作。
        </p>
      </div>
      {/* Language */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
          {t('settings.general.language')}
        </h2>
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {t('settings.general.displayLanguage')}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('settings.general.displayLanguageDesc')}
              </p>
            </div>
            <Select
              value={language}
              onValueChange={(value) =>
                void handleLanguageChange(value as SupportedLanguage)
              }
              disabled={isLanguageChanging}
            >
              <SelectTrigger
                className="min-h-11 w-full min-w-[140px] sm:w-[160px]"
                disabled={isLanguageChanging}
              >
                <SelectValue>{currentLanguage}</SelectValue>
              </SelectTrigger>
              <SelectContent align="end">
                <SelectGroup>
                  <SelectItem value="zh-CN">简体中文</SelectItem>
                  <SelectItem value="en-US">English</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {t('settings.general.aiLanguage')}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('settings.general.aiLanguageDesc')}
              </p>
            </div>
            <Select
              value={language}
              onValueChange={(value) =>
                void handleLanguageChange(value as SupportedLanguage)
              }
              disabled={isLanguageChanging}
            >
              <SelectTrigger
                className="min-h-11 w-full min-w-[140px] sm:w-[160px]"
                disabled={isLanguageChanging}
              >
                <SelectValue>{currentLanguage}</SelectValue>
              </SelectTrigger>
              <SelectContent align="end">
                <SelectGroup>
                  <SelectItem value="zh-CN">简体中文</SelectItem>
                  <SelectItem value="en-US">English</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <Separator />

      {/* Appearance */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
          {t('settings.general.appearance')}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {themes.map((themeOption) => (
            <Button
              key={themeOption.id}
              onClick={() => setTheme(themeOption.id)}
              className={cn(
                'h-auto min-h-11 flex-col gap-2 rounded-xl border-2 p-2',
                theme === themeOption.id
                  ? 'border-blue-500'
                  : 'border-transparent'
              )}
              type="button"
              variant="ghost"
            >
              <div
                className={`w-24 h-16 rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden ${
                  themeOption.id === 'dark'
                    ? 'bg-slate-800'
                    : themeOption.id === 'system'
                      ? 'bg-gradient-to-r from-white to-slate-800'
                      : 'bg-white'
                }`}
              >
                {/* 模拟界面预览 */}
                <div className="w-full h-full p-2 flex flex-col gap-1">
                  <div
                    className={`w-full h-1.5 rounded ${themeOption.id === 'dark' ? 'bg-slate-600' : themeOption.id === 'system' ? 'bg-gradient-to-r from-slate-200 to-slate-600' : 'bg-slate-200'}`}
                  />
                  <div
                    className={`w-3/4 h-1.5 rounded ${themeOption.id === 'dark' ? 'bg-slate-600' : themeOption.id === 'system' ? 'bg-gradient-to-r from-slate-200 to-slate-600' : 'bg-slate-200'}`}
                  />
                  <div
                    className={`w-1/2 h-1.5 rounded ${themeOption.id === 'dark' ? 'bg-slate-600' : themeOption.id === 'system' ? 'bg-gradient-to-r from-slate-200 to-slate-600' : 'bg-slate-200'}`}
                  />
                </div>
              </div>
              <span className="text-sm text-slate-600 dark:text-slate-300">
                {themeOption.label}
              </span>
            </Button>
          ))}
        </div>
      </section>

      <Separator />

      {/* Lab */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
          {t('settings.general.lab')}
        </h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {t('settings.general.defaultModel')}
          </p>
          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger className="min-h-11 w-full min-w-[120px] sm:w-[160px]">
              <SelectValue>
                {models.find((m) => m.id === selectedModel)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="end">
              <SelectGroup>
                {models.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </section>

      <Separator />

      {/* Account */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
          {t('settings.general.account')}
        </h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {t('settings.general.currentAccount')}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('settings.general.email')}: {user?.email}
            </p>
          </div>
          <Button onClick={onLogoutClick} type="button" variant="outline">
            {t('settings.general.logout')}
          </Button>
        </div>
      </section>

      <Separator />

      {/* Support */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
          {t('settings.general.support')}
        </h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {t('settings.general.deleteAccount')}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('settings.general.deleteAccountDesc')}
            </p>
          </div>
          <Button type="button" variant="destructive">
            {t('settings.general.delete')}
          </Button>
        </div>
      </section>
    </div>
  );
};

// Connections Tab Component
const ConnectionsTab: React.FC<{ t: unknown }> = ({ t: tRaw }) => {
  const t = tRaw as SettingsTranslate;
  return (
    <div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
          {t('settings.connections.title')}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-300">
          {t('settings.connections.description')}
        </p>
      </div>
      <div className="flex items-center justify-center h-48 bg-slate-50 dark:bg-slate-800 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
        <p className="text-slate-500 dark:text-slate-300">
          {t('settings.connections.comingSoon')}
        </p>
      </div>
    </div>
  );
};

export default SettingsPage;
