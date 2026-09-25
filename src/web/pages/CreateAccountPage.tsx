import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Code2,
  Gift,
  Globe2,
  LogOut,
  Mail,
  Moon,
  UserRound,
  Volume2,
  Wallet
} from 'lucide-react';
import '../styles/image-create.css';
import '../styles/image-create-account.css';
import '../styles/image-create-mobile.css';
import { CreateSideNav } from '../components/image-create/CreateSideNav';
import { useAuth } from '../contexts/AuthContext';
import { Button, ButtonLink, Card, Dialog } from '@/shared/ui';
import { useWorkspaceUser } from '@/workspace/hooks/useWorkspaceUser';
import { useLanguage } from '@/i18n/hooks/useLanguage';
import { getStoredTheme, changeTheme, type Theme } from '@/utils/theme';
import { getTransactions, getCreditSourceLabel } from '@/services/credits-api';
import type { CreditSource, CreditTransaction } from '@/types/membership';
import { UserAvatar } from '@/shared/components/UserAvatar';
import {
  isGenerationSoundEnabled,
  setGenerationSoundEnabled
} from '../components/image-create/generationSoundPreference';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/shared/ui/radix/select';
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/radix/tabs';

type HistoryFilter = 'all' | 'generation' | 'refund' | 'task' | 'system';

const HISTORY_FILTERS: HistoryFilter[] = [
  'all',
  'generation',
  'refund',
  'task',
  'system'
];
const HISTORY_PAGE_SIZE = 30;

function getLocalePrefix(pathname: string): '' | '/zh-CN' | '/en-US' {
  if (pathname.startsWith('/en-US')) return '/en-US';
  if (pathname.startsWith('/zh-CN')) return '/zh-CN';
  return '';
}

function formatNumber(value?: number | null): string {
  return new Intl.NumberFormat('zh-CN').format(Number(value || 0));
}

function formatTime(value: string, isEnglish: boolean): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(isEnglish ? 'en-US' : 'zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function getTransactionTitle(
  tx: CreditTransaction,
  isEnglish: boolean
): string {
  const source = String(tx.source || '');
  if (source === 'daily_login_reward') {
    return isEnglish ? 'Daily reward' : '每日签到';
  }
  if (source === 'image_generation_refund') {
    return isEnglish ? 'Image refund' : '图片生成退款';
  }
  const localized = getCreditSourceLabel(
    source as CreditSource,
    isEnglish ? 'en-US' : 'zh-CN'
  );
  if (localized !== source) return localized;
  return tx.description || (isEnglish ? 'Credit activity' : '积分变动');
}

function getTransactionMeta(tx: CreditTransaction, isEnglish: boolean): string {
  const metadata = tx.metadata || {};
  const parts: string[] = [];
  const imageCount =
    typeof metadata.imageCount === 'number'
      ? metadata.imageCount
      : typeof metadata.requestedImageCount === 'number'
        ? metadata.requestedImageCount
        : null;
  if (imageCount)
    parts.push(isEnglish ? `${imageCount} images` : `${imageCount} 张图`);
  const imageSize =
    typeof metadata.imageSize === 'string'
      ? metadata.imageSize
      : typeof metadata.billingImageSize === 'string'
        ? metadata.billingImageSize
        : null;
  if (imageSize) parts.push(imageSize);
  const quality =
    typeof metadata.quality === 'string'
      ? metadata.quality
      : typeof metadata.billingQuality === 'string'
        ? metadata.billingQuality
        : null;
  if (quality) parts.push(quality);
  return parts.join(' · ');
}

function getTransactionFilter(
  tx: CreditTransaction
): Exclude<HistoryFilter, 'all'> {
  const source = String(tx.source || '');
  const type = String(tx.type || '');

  if (type === 'refund' || source.includes('refund')) return 'refund';
  if (source.includes('task') || source === 'referral_bonus') return 'task';
  if (
    type === 'consume' ||
    source === 'image_generation' ||
    source === 'video_generation' ||
    source === 'image_upscale' ||
    source === 'image_variation'
  ) {
    return 'generation';
  }
  return 'system';
}

const COPY = {
  zh: {
    account: '账户',
    plan: '套餐',
    currentPlan: '当前套餐',
    freePlan: '免费版',
    proPlan: '专业版',
    maxPlan: '旗舰版',
    credits: '可用积分',
    dailyCredits: '每日积分',
    planCredits: '套餐积分',
    extraCredits: '额外积分',
    upgrade: '升级套餐',
    topUp: '购买额外积分',
    member: '创始成员',
    inviteTitle: '邀请好友奖励',
    inviteDesc:
      '邀请创作者一起使用 WebToMind，好友完成首次有效创作后双方获得奖励。',
    inviteReward: '+5 积分 / 人',
    inviteLimit: '最多 3 人',
    inviteCta: '复制邀请链接',
    apiTitle: '模型广场与 API',
    apiDesc: '充值 API 余额，创建自己的 Key，把 WebToMind 模型接入你的产品。',
    apiCta: '打开令牌管理',
    preferences: '偏好设置',
    language: '语言',
    theme: '主题',
    themeLight: '浅色',
    themeSystem: '跟随系统',
    themeDark: '深色',
    generationSound: '生成完成音效',
    generationSoundDesc: '图片生成完成或失败时播放短音效。',
    generationSoundOn: '已开启',
    generationSoundOff: '已关闭',
    history: '积分历史',
    historyDesc: '最近的获取、消耗和退款记录。',
    viewAllHistory: '查看所有历史记录',
    historyModalTitle: '交易记录',
    historyModalDesc: '最近 30 天活动',
    historyFilterAll: '全部',
    historyFilterGeneration: '生成',
    historyFilterRefund: '退款',
    historyFilterTask: '任务',
    historyFilterSystem: '系统',
    historyLoadMore: '加载更多',
    historyAllLoaded: '已显示全部记录',
    historyError: '积分流水加载失败，请稍后重试。',
    historyClose: '关闭交易记录',
    loading: '正在加载积分流水...',
    empty: '暂无积分流水。',
    feedback: '反馈',
    feedbackDesc: '遇到生成、扣费或账户问题时联系我们。',
    signOut: '退出登录',
    tos: '用户协议',
    privacy: '隐私政策'
  },
  en: {
    account: 'Account',
    plan: 'Plan',
    currentPlan: 'Current plan',
    freePlan: 'Free',
    proPlan: 'Pro',
    maxPlan: 'Max',
    credits: 'Available credits',
    dailyCredits: 'Daily credits',
    planCredits: 'Plan credits',
    extraCredits: 'Extra credits',
    upgrade: 'Upgrade plan',
    topUp: 'Buy credits',
    member: 'Founding member',
    inviteTitle: 'Invite rewards',
    inviteDesc:
      'Invite creators to WebToMind. Rewards unlock after their first valid creation.',
    inviteReward: '+5 credits / person',
    inviteLimit: 'Up to 3 people',
    inviteCta: 'Copy invite link',
    apiTitle: 'Model plaza & API',
    apiDesc: 'Top up API balance, create your own Key, and connect WebToMind models to your product.',
    apiCta: 'Open token management',
    preferences: 'Preferences',
    language: 'Language',
    theme: 'Theme',
    themeLight: 'Light',
    themeSystem: 'System',
    themeDark: 'Dark',
    generationSound: 'Generation sounds',
    generationSoundDesc:
      'Play a short sound when image generation finishes or fails.',
    generationSoundOn: 'On',
    generationSoundOff: 'Off',
    history: 'Credit history',
    historyDesc: 'Recent earns, spends, and refunds.',
    viewAllHistory: 'View all history',
    historyModalTitle: 'Credit history',
    historyModalDesc: 'Recent 30-day activity',
    historyFilterAll: 'All',
    historyFilterGeneration: 'Generation',
    historyFilterRefund: 'Refunds',
    historyFilterTask: 'Tasks',
    historyFilterSystem: 'System',
    historyLoadMore: 'Load more',
    historyAllLoaded: 'All records shown',
    historyError: 'Failed to load credit history. Please try again later.',
    historyClose: 'Close credit history',
    loading: 'Loading credit history...',
    empty: 'No credit activity yet.',
    feedback: 'Feedback',
    feedbackDesc: 'Contact us for generation, billing, or account issues.',
    signOut: 'Sign out',
    tos: 'Terms',
    privacy: 'Privacy'
  }
} as const;

export function CreateAccountPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, signOut } = useAuth();
  const { profile, credits, subscription, isFetchingUser } =
    useWorkspaceUser(isAuthenticated);
  const {
    language,
    changeLanguage,
    isLoading: isLanguageChanging
  } = useLanguage();
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());
  const [generationSoundEnabled, setGenerationSoundPreference] = useState(() =>
    isGenerationSoundEnabled()
  );
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [modalTransactions, setModalTransactions] = useState<
    CreditTransaction[]
  >([]);
  const [modalTransactionsLoading, setModalTransactionsLoading] =
    useState(false);
  const [modalTransactionsError, setModalTransactionsError] = useState(false);
  const [modalHistoryPage, setModalHistoryPage] = useState(1);
  const [modalHistoryHasMore, setModalHistoryHasMore] = useState(false);
  const localePrefix = getLocalePrefix(location.pathname);
  const isEnglish = localePrefix === '/en-US' || language?.startsWith('en');
  const copy = isEnglish ? COPY.en : COPY.zh;
  const userName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    'WebToMind User';
  const planName = subscription?.planName || 'free';
  const planLabel =
    planName === 'pro'
      ? copy.proPlan
      : planName === 'max'
        ? copy.maxPlan
        : copy.freePlan;
  const pricingHref = `${localePrefix}/pricing?source=account`;
  const inviteUrl = useMemo(() => {
    const memberCode =
      profile?.member_number_formatted || profile?.member_number;
    return memberCode
      ? `https://www.webtomind.com?ref=${memberCode}`
      : 'https://www.webtomind.com';
  }, [profile?.member_number, profile?.member_number_formatted]);
  const historyFilterLabels = useMemo(
    () => ({
      all: copy.historyFilterAll,
      generation: copy.historyFilterGeneration,
      refund: copy.historyFilterRefund,
      task: copy.historyFilterTask,
      system: copy.historyFilterSystem
    }),
    [copy]
  );
  const filteredModalTransactions = useMemo(() => {
    if (historyFilter === 'all') return modalTransactions;
    return modalTransactions.filter(
      (tx) => getTransactionFilter(tx) === historyFilter
    );
  }, [historyFilter, modalTransactions]);

  useEffect(() => {
    let cancelled = false;
    async function loadTransactions() {
      try {
        setTransactionsLoading(true);
        const response = await getTransactions(1, 5);
        if (!cancelled) setTransactions(response.transactions || []);
      } catch {
        if (!cancelled) setTransactions([]);
      } finally {
        if (!cancelled) setTransactionsLoading(false);
      }
    }
    if (isAuthenticated) void loadTransactions();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const handleThemeChange = (nextTheme: Theme) => {
    setTheme(nextTheme);
    changeTheme(nextTheme);
  };

  const handleInviteCopy = async () => {
    await navigator.clipboard?.writeText(inviteUrl);
  };

  const loadModalTransactions = async (
    page = 1,
    mode: 'replace' | 'append' = 'replace'
  ) => {
    try {
      setModalTransactionsLoading(true);
      setModalTransactionsError(false);
      const response = await getTransactions(page, HISTORY_PAGE_SIZE);
      setModalTransactions((current) =>
        mode === 'append'
          ? [...current, ...(response.transactions || [])]
          : response.transactions || []
      );
      setModalHistoryPage(page);
      setModalHistoryHasMore(Boolean(response.hasMore));
    } catch {
      setModalTransactionsError(true);
      if (mode === 'replace') setModalTransactions([]);
    } finally {
      setModalTransactionsLoading(false);
    }
  };

  const openHistoryModal = () => {
    setHistoryModalOpen(true);
    setHistoryFilter('all');
    if (modalTransactions.length === 0)
      void loadModalTransactions(1, 'replace');
  };

  const handleSignOut = async () => {
    await signOut();
    navigate(`${localePrefix}/create`, { replace: true });
  };

  return (
    <div className="image-create-page image-create-page-with-side-nav create-account-route">
      <CreateSideNav />
      <main className="create-account-main">
        <section className="create-account-hero" aria-label={copy.account}>
          <div className="create-account-profile">
            <UserAvatar
              user={user}
              name={userName}
              email={user?.email}
              className="create-account-avatar"
              loading="eager"
              fetchPriority="high"
              preload
              fallbackIcon={<UserRound size={30} />}
            />
            <div>
              <h1>{userName}</h1>
              <div className="create-account-identity-line">
                {user?.email && <span>{user.email}</span>}
                {profile?.member_number_formatted && (
                  <em>
                    {copy.member} {profile.member_number_formatted}
                  </em>
                )}
              </div>
            </div>
          </div>
          <Card className="create-account-plan-card">
            <div>
              <span>{copy.currentPlan}</span>
              <strong>{planLabel}</strong>
            </div>
            <ButtonLink
              to={pricingHref}
              variant="secondary"
              size="md"
              className="create-account-plan-action"
              trailingIcon={<ArrowRight size={16} />}
            >
              {copy.upgrade}
            </ButtonLink>
          </Card>
          <div className="create-account-credit-grid">
            <div className="create-account-credit-total">
              <Wallet size={20} />
              <span>{copy.credits}</span>
              <strong>
                {isFetchingUser ? '-' : formatNumber(credits?.total)}
              </strong>
            </div>
            <div>
              <span>{copy.dailyCredits}</span>
              <strong>
                {formatNumber(credits?.daily)} /{' '}
                {formatNumber(credits?.dailyMax)}
              </strong>
            </div>
            <div>
              <span>{copy.planCredits}</span>
              <strong>
                {formatNumber(credits?.subscription)} /{' '}
                {formatNumber(credits?.subscriptionMax)}
              </strong>
            </div>
            <div>
              <span>{copy.extraCredits}</span>
              <strong>
                {formatNumber((credits?.bonus || 0) + (credits?.referral || 0))}
              </strong>
            </div>
          </div>
          <ButtonLink
            to={`${localePrefix}/pricing?source=account_topup`}
            variant="primary"
            size="lg"
            className="create-account-primary-action"
            trailingIcon={<ArrowRight size={18} />}
          >
            {copy.topUp}
          </ButtonLink>
        </section>

        <Card as="section" className="create-account-invite-card">
          <div>
            <span className="create-account-section-icon">
              <Gift size={18} />
            </span>
            <h2>{copy.inviteTitle}</h2>
            <p>{copy.inviteDesc}</p>
          </div>
          <div className="create-account-invite-stats">
            <strong>{copy.inviteReward}</strong>
            <span>{copy.inviteLimit}</span>
          </div>
          <Button type="button" onClick={() => void handleInviteCopy()}>
            {copy.inviteCta}
          </Button>
        </Card>

        <Card as="section" className="create-account-invite-card">
          <div>
            <span className="create-account-section-icon">
              <Code2 size={18} />
            </span>
            <h2>{copy.apiTitle}</h2>
            <p>{copy.apiDesc}</p>
          </div>
          <ButtonLink to={`${localePrefix}/api-console`} variant="outline">
            {copy.apiCta}
            <ArrowRight size={16} />
          </ButtonLink>
        </Card>

        <section className="create-account-section">
          <h2>{copy.preferences}</h2>
          <div className="create-account-list">
            <label className="create-account-list-row create-account-list-row--choice">
              <span className="create-account-row-icon">
                <Globe2 size={18} />
              </span>
              <div className="create-account-choice-label">
                <strong>{copy.language}</strong>
              </div>
              <Select
                value={language?.startsWith('en') ? 'en-US' : 'zh-CN'}
                disabled={isLanguageChanging}
                onValueChange={(value) => {
                  const targetLang = value as 'zh-CN' | 'en-US';
                  const pathname = location.pathname;
                  const prefixed = pathname.match(/^\/(zh-CN|en-US)(?=\/|$)/);
                  const nextPath = prefixed
                    ? pathname.replace(
                        /^\/(zh-CN|en-US)(?=\/|$)/,
                        `/${targetLang}`
                      )
                    : `/${targetLang}${pathname}`;
                  navigate(`${nextPath}${location.search}${location.hash}`);
                  void changeLanguage(targetLang);
                }}
              >
                <SelectTrigger
                  className="create-account-preference-select"
                  aria-label={copy.language}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="zh-CN">简体中文</SelectItem>
                    <SelectItem value="en-US">English</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>
            <label className="create-account-list-row create-account-list-row--choice">
              <span className="create-account-row-icon">
                <Moon size={18} />
              </span>
              <div className="create-account-choice-label">
                <strong>{copy.theme}</strong>
              </div>
              <Select
                value={theme}
                onValueChange={(value) => handleThemeChange(value as Theme)}
              >
                <SelectTrigger
                  className="create-account-preference-select"
                  aria-label={copy.theme}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="light">{copy.themeLight}</SelectItem>
                    <SelectItem value="system">{copy.themeSystem}</SelectItem>
                    <SelectItem value="dark">{copy.themeDark}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>
            <div className="create-account-list-row">
              <span className="create-account-row-icon">
                <Volume2 size={18} />
              </span>
              <div>
                <strong>{copy.generationSound}</strong>
                <p>{copy.generationSoundDesc}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                aria-pressed={generationSoundEnabled}
                onClick={() => {
                  const next = !generationSoundEnabled;
                  setGenerationSoundPreference(next);
                  setGenerationSoundEnabled(next);
                }}
              >
                {generationSoundEnabled
                  ? copy.generationSoundOn
                  : copy.generationSoundOff}
              </Button>
            </div>
          </div>
        </section>

        <section className="create-account-section">
          <div className="create-account-section-heading">
            <div>
              <h2>{copy.history}</h2>
              <p>{copy.historyDesc}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="create-account-history-link"
              onClick={openHistoryModal}
            >
              {copy.viewAllHistory}
            </Button>
          </div>
          <div className="create-account-history-list">
            {transactionsLoading ? (
              <p className="create-account-muted">{copy.loading}</p>
            ) : transactions.length === 0 ? (
              <p className="create-account-muted">{copy.empty}</p>
            ) : (
              transactions.map((tx) => (
                <div key={tx.id} className="create-account-history-row">
                  <div>
                    <strong>{getTransactionTitle(tx, isEnglish)}</strong>
                    <span>
                      {formatTime(tx.createdAt, isEnglish)}
                      {getTransactionMeta(tx, isEnglish) &&
                        ` · ${getTransactionMeta(tx, isEnglish)}`}
                    </span>
                  </div>
                  <em className={tx.amount >= 0 ? 'is-positive' : ''}>
                    {tx.amount > 0 ? '+' : ''}
                    {formatNumber(tx.amount)}
                  </em>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="create-account-section create-account-support">
          <a href="mailto:support@webtomind.com">
            <Mail size={18} />
            <span>
              <strong>{copy.feedback}</strong>
              <p>{copy.feedbackDesc}</p>
            </span>
            <ArrowRight size={16} />
          </a>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleSignOut()}
          >
            <LogOut data-icon="inline-start" />
            {copy.signOut}
          </Button>
        </section>

        <footer className="create-account-legal">
          <Link to={`${localePrefix}/terms`}>{copy.tos}</Link>
          <span>·</span>
          <Link to={`${localePrefix}/privacy`}>{copy.privacy}</Link>
        </footer>
      </main>
      <Dialog
        open={historyModalOpen}
        title={copy.historyModalTitle}
        description={copy.historyModalDesc}
        closeLabel={copy.historyClose}
        className="create-account-history-modal"
        onClose={() => setHistoryModalOpen(false)}
        footer={
          <div className="create-account-history-modal-foot">
            {modalHistoryHasMore ? (
              <Button
                type="button"
                variant="outline"
                disabled={modalTransactionsLoading}
                onClick={() =>
                  void loadModalTransactions(modalHistoryPage + 1, 'append')
                }
              >
                {modalTransactionsLoading ? copy.loading : copy.historyLoadMore}
              </Button>
            ) : (
              <span>{copy.historyAllLoaded}</span>
            )}
          </div>
        }
      >
        <Tabs
          value={historyFilter}
          onValueChange={(value) => setHistoryFilter(value as HistoryFilter)}
          className="create-account-history-tabs"
          aria-label={copy.historyModalTitle}
        >
          <TabsList>
            {HISTORY_FILTERS.map((filter) => (
              <TabsTrigger
                key={filter}
                value={filter}
                className={historyFilter === filter ? 'active' : undefined}
              >
                {historyFilterLabels[filter]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="create-account-history-modal-list">
          {modalTransactionsLoading && modalTransactions.length === 0 ? (
            <p className="create-account-muted">{copy.loading}</p>
          ) : modalTransactionsError ? (
            <p className="create-account-muted">{copy.historyError}</p>
          ) : filteredModalTransactions.length === 0 ? (
            <p className="create-account-muted">{copy.empty}</p>
          ) : (
            filteredModalTransactions.map((tx, index) => (
              <div
                key={`${tx.id}-${index}`}
                className={`create-account-history-row create-account-history-modal-row is-${getTransactionFilter(tx)}`}
              >
                <span
                  className="create-account-history-kind"
                  aria-hidden="true"
                />
                <div>
                  <strong>{getTransactionTitle(tx, isEnglish)}</strong>
                  <span>
                    {formatTime(tx.createdAt, isEnglish)}
                    {getTransactionMeta(tx, isEnglish) &&
                      ` · ${getTransactionMeta(tx, isEnglish)}`}
                  </span>
                </div>
                <em className={tx.amount >= 0 ? 'is-positive' : ''}>
                  {tx.amount > 0 ? '+' : ''}
                  {formatNumber(tx.amount)}
                </em>
              </div>
            ))
          )}
        </div>
      </Dialog>
    </div>
  );
}

export default CreateAccountPage;
