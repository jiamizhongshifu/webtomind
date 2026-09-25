import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Copy,
  KeyRound,
  Plus,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Trash2,
  WalletCards
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { CreateWorkspaceShell } from '../components/create-workspace/CreateWorkspaceShell';
import { Button, ButtonLink } from '@/shared/ui';
import {
  createCheckoutSession,
  redirectToCheckout,
  verifyCheckoutReturn
} from '@/services/payment-api';
import {
  createApiKey,
  getApiCreditPackages,
  getApiKeys,
  getApiUsage,
  getApiWallet,
  revokeApiKey,
  type ApiCreditPackage,
  type ApiCreditPricing,
  type ApiKey,
  type ApiUsageLog,
  type ApiWallet,
  type ApiWalletTransaction
} from '@/services/api-marketplace';
import {
  getCustomApiCreditQuote,
  parseWholeUsdAmountToCents
} from '@/shared/api-credit-pricing';
import { ApiKeyCreatedDialog } from './api-marketplace/ApiKeyCreatedDialog';
import './api-marketplace.css';

function formatCents(value: number) {
  return `$${(Math.max(0, value) / 100).toFixed(2)}`;
}

function formatCnyCents(value: number) {
  return `¥${(Math.max(0, value) / 100).toFixed(2)}`;
}

function formatWholeUsdCents(value: number) {
  const cents = Math.max(0, value);
  return cents % 100 === 0
    ? `$${(cents / 100).toLocaleString('en-US')}`
    : formatCents(cents);
}

function formatRechargeCnyCents(value: number) {
  const cents = Math.max(0, value);
  return cents % 100 === 0 ? `¥${cents / 100}` : formatCnyCents(cents);
}

function formatDate(value: string | null) {
  if (!value) return '尚未使用';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
}

function usageStatusLabel(status: ApiUsageLog['status']) {
  if (status === 'succeeded') return '成功';
  if (status === 'failed') return '失败';
  return '处理中';
}

function formatTokens(value: number) {
  return (value || 0).toLocaleString('zh-CN');
}

type ApiPaymentProvider = 'stripe' | 'alipay';

function paymentProviderLabel(provider: ApiPaymentProvider) {
  return provider === 'alipay' ? '支付宝' : 'Stripe';
}

function transactionPresentation(transaction: ApiWalletTransaction) {
  switch (transaction.type) {
    case 'deposit':
      return {
        label: '账户充值',
        description: 'API 额度已到账',
        icon: ArrowDownLeft,
        tone: 'positive'
      } as const;
    case 'usage_charge':
      return {
        label: '模型调用扣费',
        description:
          transaction.source === 'api_usage_reservation'
            ? '调用额度预留，结算后按实际用量调整'
            : '按实际模型用量结算',
        icon: ArrowUpRight,
        tone: 'negative'
      } as const;
    case 'usage_refund':
      return {
        label: '调用额度退回',
        description: '未使用的预留额度已退回账户',
        icon: ArrowDownLeft,
        tone: 'positive'
      } as const;
    case 'key_refund':
      return {
        label: '旧版 Key 余额退回',
        description: '历史 Key 余额已回到账户',
        icon: ArrowDownLeft,
        tone: 'positive'
      } as const;
    case 'key_fund':
      return {
        label: '旧版 Key 余额划拨',
        description: '历史账户余额划拨记录',
        icon: ArrowUpRight,
        tone: 'negative'
      } as const;
    default:
      return {
        label: '账户调整',
        description: 'API 额度账户调整',
        icon: ReceiptText,
        tone: transaction.amount_cents >= 0 ? 'positive' : 'negative'
      } as const;
  }
}

function formatSignedCents(value: number) {
  const amount = Math.abs(value || 0);
  return `${value >= 0 ? '+' : '−'}$${(amount / 100).toFixed(2)}`;
}

export function ApiConsolePage() {
  const location = useLocation();
  const localePrefix = location.pathname.startsWith('/en-US')
    ? '/en-US'
    : location.pathname.startsWith('/zh-CN')
      ? '/zh-CN'
      : '';
  const defaultPaymentProvider: ApiPaymentProvider =
    localePrefix === '/zh-CN' ? 'alipay' : 'stripe';
  const [wallet, setWallet] = useState<ApiWallet | null>(null);
  const [transactions, setTransactions] = useState<ApiWalletTransaction[]>([]);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [packages, setPackages] = useState<ApiCreditPackage[]>([]);
  const [pricing, setPricing] = useState<ApiCreditPricing | null>(null);
  const [checkoutProviders, setCheckoutProviders] = useState<
    ApiPaymentProvider[]
  >([]);
  const [paymentProvider, setPaymentProvider] = useState<ApiPaymentProvider>(
    defaultPaymentProvider
  );
  const [usageLogs, setUsageLogs] = useState<ApiUsageLog[]>([]);
  const [usageTotalSpentCents, setUsageTotalSpentCents] = useState(0);
  const [usageFilterKeyId, setUsageFilterKeyId] = useState('');
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState('');
  const [newKeyName, setNewKeyName] = useState('');
  const [newSecret, setNewSecret] = useState('');
  const [customAmountUsd, setCustomAmountUsd] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const baseUrl =
    typeof window === 'undefined'
      ? 'https://webtomind.com/v1'
      : `${window.location.origin}/v1`;
  const availablePaymentProviders = useMemo(
    () =>
      checkoutProviders.filter(
        (provider) => provider === 'stripe' || provider === 'alipay'
      ),
    [checkoutProviders]
  );
  const effectivePaymentProvider = availablePaymentProviders.includes(
    paymentProvider
  )
    ? paymentProvider
    : availablePaymentProviders[0] || paymentProvider;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [walletResult, keyResult, packageResult] = await Promise.all([
        getApiWallet(),
        getApiKeys(),
        getApiCreditPackages()
      ]);
      setWallet(walletResult.wallet);
      setTransactions(walletResult.transactions || []);
      setKeys(keyResult.keys || []);
      setPackages(packageResult.packages || []);
      setCheckoutProviders(packageResult.checkoutProviders || []);
      setPricing(packageResult.pricing || null);
    } catch {
      setNotice('令牌管理暂时无法加载，请刷新重试。');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsage = useCallback(async (keyId: string) => {
    setUsageLoading(true);
    setUsageError('');
    try {
      const result = await getApiUsage(
        keyId ? { keyId, limit: 50 } : { limit: 50 }
      );
      setUsageLogs(result.usage || []);
      setUsageTotalSpentCents(result.totalSpentCents || 0);
    } catch {
      setUsageError('API 使用记录暂时无法加载，请刷新重试。');
      setUsageLogs([]);
      setUsageTotalSpentCents(0);
    } finally {
      setUsageLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadUsage('');
  }, [load, loadUsage]);

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const payment = query.get('payment');
    if (payment === 'cancel') {
      setNotice('充值已取消，你可以选择其他支付方式再次尝试。');
      return;
    }
    if (payment !== 'success' || !query.get('orderId')) return;

    let cancelled = false;
    setNotice('正在确认充值到账…');
    void verifyCheckoutReturn({
      orderId: query.get('orderId'),
      checkoutType: query.get('checkoutType'),
      productId: query.get('productId')
    })
      .then((order) => {
        if (cancelled) return;
        if (order.status === 'succeeded') {
          setNotice('充值成功，API 额度已到账。');
          void load();
          return;
        }
        setNotice('支付已提交，到账确认可能需要一点时间，请稍后刷新。');
      })
      .catch(() => {
        if (!cancelled)
          setNotice('充值状态暂时无法确认，请刷新后查看余额流水。');
      });

    return () => {
      cancelled = true;
    };
  }, [load, location.search]);

  const createKey = async () => {
    if (!newKeyName.trim() || busy) return;
    setBusy(true);
    setNotice('');
    try {
      const result = await createApiKey(newKeyName.trim());
      setKeys((current) => [result.key, ...current]);
      setNewKeyName('');
      setNewSecret(result.secret);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'API Key 创建失败。');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (key: ApiKey) => {
    if (busy || !window.confirm(`确定吊销「${key.name}」吗？吊销后不可恢复。`))
      return;
    setBusy(true);
    try {
      await revokeApiKey(key.id);
      await load();
      setNotice(`「${key.name}」已吊销。账户 API 额度与 Key 独立管理。`);
    } catch {
      setNotice('API Key 吊销失败，请稍后重试。');
    } finally {
      setBusy(false);
    }
  };

  const purchase = async (pkg: ApiCreditPackage) => {
    if (busy) return;
    setBusy(true);
    setNotice('');
    try {
      const origin =
        typeof window === 'undefined'
          ? 'https://webtomind.com'
          : window.location.origin;
      const returnUrl = new URL(`${localePrefix}/api-console`, origin);
      returnUrl.searchParams.set('payment', 'success');
      returnUrl.searchParams.set('checkoutType', 'api_credit_package');
      returnUrl.searchParams.set('productId', pkg.id);
      const checkout = await createCheckoutSession({
        type: 'api_credit_package',
        id: pkg.id,
        paymentProvider: effectivePaymentProvider,
        successUrl: returnUrl.toString(),
        cancelUrl: `${origin}${localePrefix}/api-console?payment=cancel`,
        ctaSource: 'api_console'
      });
      redirectToCheckout(checkout);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '充值暂时不可用。');
      setBusy(false);
    }
  };

  const customAmountUsdCents = parseWholeUsdAmountToCents(customAmountUsd);
  const customQuote = useMemo(() => {
    if (!pricing?.usdToCnyRate || customAmountUsdCents === null) return null;
    try {
      return getCustomApiCreditQuote({
        paymentProvider: effectivePaymentProvider,
        amountUsdCents: customAmountUsdCents,
        usdToCnyRate: pricing.usdToCnyRate
      });
    } catch {
      return null;
    }
  }, [customAmountUsdCents, effectivePaymentProvider, pricing]);

  const customMinUsdCents = pricing?.customMinUsdCents || 100;
  const customMaxUsdCents = pricing?.customMaxUsdCents || 100_000;
  const customAmountError = useMemo(() => {
    if (!customAmountUsd) return '';
    if (customAmountUsdCents === null) return '请输入整数美元金额。';
    if (customAmountUsdCents < customMinUsdCents) {
      return `最低充值 ${formatWholeUsdCents(customMinUsdCents)}。`;
    }
    if (customAmountUsdCents > customMaxUsdCents) {
      return `单笔最高充值 ${formatWholeUsdCents(customMaxUsdCents)}。`;
    }
    if (!pricing?.usdToCnyRate) return '充值汇率暂不可用，请稍后重试。';
    return '';
  }, [
    customAmountUsd,
    customAmountUsdCents,
    customMaxUsdCents,
    customMinUsdCents,
    pricing
  ]);

  const purchaseCustom = async () => {
    if (busy || !customQuote || customAmountError) return;
    setBusy(true);
    setNotice('');
    try {
      const origin =
        typeof window === 'undefined'
          ? 'https://webtomind.com'
          : window.location.origin;
      const returnUrl = new URL(`${localePrefix}/api-console`, origin);
      returnUrl.searchParams.set('payment', 'success');
      returnUrl.searchParams.set('checkoutType', 'api_credit_package');
      returnUrl.searchParams.set('productId', 'custom');
      const checkout = await createCheckoutSession({
        type: 'api_credit_package',
        id: 'custom',
        customAmountUsdCents: customQuote.apiCreditCents,
        paymentProvider: effectivePaymentProvider,
        successUrl: returnUrl.toString(),
        cancelUrl: `${origin}${localePrefix}/api-console?payment=cancel`,
        ctaSource: 'api_console_custom_recharge'
      });
      redirectToCheckout(checkout);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '充值暂时不可用。');
      setBusy(false);
    }
  };

  const copy = async (value: string, message: string) => {
    await navigator.clipboard?.writeText(value);
    setNotice(message);
  };

  const activeKeys = useMemo(
    () => keys.filter((key) => key.status === 'active'),
    [keys]
  );
  const keyNameById = useMemo(() => {
    const map = new Map<string, string>();
    keys.forEach((key) => map.set(key.id, key.name));
    return map;
  }, [keys]);

  return (
    <CreateWorkspaceShell className="api-marketplace-page-shell">
      <main className="api-console-page">
        <header className="api-console-header">
          <div>
            <p className="api-marketplace-kicker">Developer access</p>
            <h1>令牌管理</h1>
            <p>在这里充值、创建自己的 Key，并把模型接入你的应用。</p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void load();
              void loadUsage(usageFilterKeyId);
            }}
            disabled={loading}
          >
            <RefreshCw size={16} /> 刷新
          </Button>
        </header>

        {notice && (
          <div className="api-console-notice" role="status">
            {notice}
          </div>
        )}
        <section className="api-console-overview">
          <div className="api-balance-card">
            <WalletCards size={20} />
            <span>API 可用额度</span>
            <strong>
              {loading ? '—' : formatCents(wallet?.balance_cents || 0)}
            </strong>
            <small>独立于创作积分的 WebToMind API 额度</small>
          </div>
          <div className="api-console-callout">
            <ShieldCheck size={20} />
            <div>
              <strong>WebToMind API 服务</strong>
              <p>
                由 WebToMind 统一提供模型接入、Key
                管理与额度控制，适合直接接入你的产品和自动化流程。
              </p>
            </div>
          </div>
        </section>

        <section className="api-console-section">
          <div className="api-console-section-heading">
            <div>
              <p className="api-marketplace-kicker">01 / Keys</p>
              <h2>API Keys</h2>
              <p>
                每个 Key 都可以单独吊销；完整密钥只在创建完成时展示一次。
                所有 Key 共享账户 API 额度，创建 Key 不会改变账户余额。
              </p>
            </div>
            <div className="api-console-key-form">
              <label className="sr-only" htmlFor="api-key-name">
                API Key 名称
              </label>
              <input
                id="api-key-name"
                value={newKeyName}
                onChange={(event) => setNewKeyName(event.target.value)}
                placeholder="例如：我的生产服务"
                maxLength={64}
              />
              <Button
                type="button"
                variant="primary"
                onClick={() => void createKey()}
                disabled={busy || !newKeyName.trim()}
              >
                <Plus size={16} /> 创建 Key
              </Button>
            </div>
          </div>
          <div className="api-key-list">
            {activeKeys.length === 0 ? (
              <p className="api-console-muted">
                还没有 API Key，先创建一个用于你的应用。
              </p>
            ) : (
              activeKeys.map((key) => (
                <div className="api-key-row" key={key.id}>
                  <span className="api-key-symbol" aria-hidden="true">
                    <KeyRound size={17} />
                  </span>
                  <div>
                    <strong>{key.name}</strong>
                    <code>{key.key_prefix}</code>
                    <small>
                      共享账户 API 额度 · 上次使用：{formatDate(key.last_used_at)}
                    </small>
                  </div>
                  <div className="api-key-row-actions">
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`吊销 ${key.name}`}
                      onClick={() => void revoke(key)}
                      disabled={busy}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="api-console-section">
          <div className="api-console-section-heading">
            <div>
              <p className="api-marketplace-kicker">02 / Balance</p>
              <h2>充值 API 额度</h2>
              <p>
                选择支付方式完成充值。新订单按服务端结算汇率折算为 API
                额度，到账后由账户下的所有 Key 共享使用。
              </p>
            </div>
          </div>
          <div className="api-payment-toolbar" aria-label="选择支付方式">
            <span>支付方式</span>
            <div
              className="api-payment-methods"
              role="tablist"
              aria-label="API 充值支付方式"
            >
              {(['stripe', 'alipay'] as ApiPaymentProvider[]).map(
                (provider) => {
                  const available =
                    availablePaymentProviders.includes(provider);
                  return (
                    <button
                      key={provider}
                      type="button"
                      role="tab"
                      aria-selected={effectivePaymentProvider === provider}
                      aria-disabled={!available}
                      className={
                        effectivePaymentProvider === provider ? 'is-active' : ''
                      }
                      disabled={!available || busy}
                      onClick={() => setPaymentProvider(provider)}
                    >
                      {paymentProviderLabel(provider)}
                    </button>
                  );
                }
              )}
            </div>
            {!availablePaymentProviders.length && (
              <small className="api-payment-unavailable">
                充值通道正在配置中，请稍后再试。
              </small>
            )}
          </div>
          <div className="api-package-grid">
            {packages.map((pkg) => (
              <article className="api-package-card" key={pkg.id}>
                <span>{formatWholeUsdCents(pkg.credit_cents)} 充值</span>
                <strong>
                  {formatWholeUsdCents(pkg.credit_cents)} API 额度
                </strong>
                <small>
                  {effectivePaymentProvider === 'alipay'
                    ? `支付宝收款 ${formatRechargeCnyCents(pkg.price_cents)}`
                    : 'Stripe 收款美元'}
                  · 按实际调用扣除，所有 Key 共享
                </small>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => void purchase(pkg)}
                  disabled={busy || !availablePaymentProviders.length}
                >
                  {availablePaymentProviders.length
                    ? `${paymentProviderLabel(effectivePaymentProvider)} · ${effectivePaymentProvider === 'alipay' ? formatRechargeCnyCents(pkg.price_cents) : formatWholeUsdCents(pkg.credit_cents)}`
                    : '暂不可充值'}
                </Button>
              </article>
            ))}
          </div>
          <div className="api-custom-recharge">
            <div className="api-custom-recharge-copy">
              <p className="api-marketplace-kicker">Custom amount</p>
              <h3>自定义充值金额</h3>
              <p>
                输入整数美元金额，额度和订单会按美元锁定；使用支付宝时，
                系统会按当前结算汇率折算人民币收款金额。
              </p>
            </div>
            <div className="api-custom-recharge-form">
              <label htmlFor="custom-api-recharge-amount">充值美元金额</label>
              <div className="api-custom-recharge-input">
                <span aria-hidden="true">$</span>
                <input
                  id="custom-api-recharge-amount"
                  type="text"
                  inputMode="numeric"
                  placeholder="例如 20"
                  value={customAmountUsd}
                  onChange={(event) => setCustomAmountUsd(event.target.value)}
                  aria-describedby="custom-api-recharge-help custom-api-recharge-error"
                  disabled={busy || !pricing?.customAvailable}
                />
              </div>
              <small id="custom-api-recharge-help">
                {pricing?.usdToCnyRate
                  ? `按美元整数充值；最低 ${formatWholeUsdCents(customMinUsdCents)}，最高 ${formatWholeUsdCents(customMaxUsdCents)}。支付宝按当前汇率换算人民币。`
                  : '正在读取当前结算汇率…'}
              </small>
              {customQuote ? (
                <strong className="api-custom-recharge-quote">
                  预计到账 {formatWholeUsdCents(customQuote.apiCreditCents)} API
                  额度
                  {effectivePaymentProvider === 'stripe'
                    ? ` · Stripe ${formatWholeUsdCents(customQuote.payment.amount)}`
                    : ` · 支付宝 ${formatRechargeCnyCents(customQuote.payment.amount)}`}
                </strong>
              ) : null}
              {customAmountError ? (
                <span
                  id="custom-api-recharge-error"
                  className="api-custom-recharge-error"
                  role="alert"
                >
                  {customAmountError}
                </span>
              ) : null}
              <Button
                type="button"
                variant="primary"
                onClick={() => void purchaseCustom()}
                disabled={
                  busy ||
                  !customQuote ||
                  Boolean(customAmountError) ||
                  !availablePaymentProviders.length
                }
              >
                {availablePaymentProviders.length
                  ? `自定义充值 · ${paymentProviderLabel(effectivePaymentProvider)}`
                  : '暂不可充值'}
              </Button>
            </div>
          </div>
        </section>

        <section className="api-console-section api-console-connection">
          <div>
            <p className="api-marketplace-kicker">03 / Connect</p>
            <h2>接入方式</h2>
            <p>
              兼容 OpenAI SDK、LangChain 和常见客户端。把下面的 Base URL
              与你刚创建的 Key 放进环境变量即可。
            </p>
          </div>
          <div className="api-code-block">
            <div>
              <span>Base URL</span>
              <button
                type="button"
                aria-label="复制 Base URL"
                onClick={() => void copy(baseUrl, 'Base URL 已复制。')}
              >
                <Copy size={14} aria-hidden="true" />
              </button>
            </div>
            <code>{baseUrl}</code>
            <div>
              <span>Python</span>
              <button
                type="button"
                aria-label="复制 Python 示例"
                onClick={() =>
                  void copy(
                    `from openai import OpenAI\nclient = OpenAI(api_key="YOUR_WEBTOMIND_KEY", base_url="${baseUrl}")`,
                    'Python 示例已复制。'
                  )
                }
              >
                <Copy size={14} aria-hidden="true" />
              </button>
            </div>
            <pre>{`from openai import OpenAI\n\nclient = OpenAI(\n  api_key="YOUR_WEBTOMIND_KEY",\n  base_url="${baseUrl}"\n)`}</pre>
          </div>
        </section>

        <section className="api-console-section api-console-history">
          <div className="api-console-section-heading">
            <div>
              <p className="api-marketplace-kicker">04 / Ledger</p>
              <h2>余额流水</h2>
              <p>最近的充值、模型调用扣费和额度退回记录。</p>
            </div>
            <ButtonLink to={`${localePrefix}/models`} variant="outline">
              浏览模型
            </ButtonLink>
          </div>
          {transactions.length === 0 ? (
            <p className="api-console-muted">暂无 API 流水。</p>
          ) : (
            <div className="api-transaction-list">
              {transactions.map((transaction) => {
                const presentation = transactionPresentation(transaction);
                const Icon = presentation.icon;
                return (
                  <div
                    className={`api-transaction-row is-${presentation.tone}`}
                    key={transaction.id}
                  >
                    <span className="api-transaction-icon" aria-hidden="true">
                      <Icon size={16} />
                    </span>
                    <div className="api-transaction-copy">
                      <strong>{presentation.label}</strong>
                      <small>{presentation.description}</small>
                    </div>
                    <div className="api-transaction-meta">
                      <strong>{formatSignedCents(transaction.amount_cents)}</strong>
                      <time dateTime={transaction.created_at}>
                        {formatDate(transaction.created_at)}
                      </time>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="api-console-section api-console-usage">
          <div className="api-console-section-heading">
            <div>
              <p className="api-marketplace-kicker">05 / Usage</p>
              <h2>API 使用记录</h2>
              <p>
                最近 50 条模型调用记录，包含每次调用的模型、Token
                用量与平台扣费。
              </p>
            </div>
          </div>
          <div className="api-usage-toolbar">
            <label className="api-usage-filter">
              <span>筛选 Key</span>
              <select
                value={usageFilterKeyId}
                onChange={(event) => {
                  const value = event.target.value;
                  setUsageFilterKeyId(value);
                  void loadUsage(value);
                }}
                disabled={usageLoading}
              >
                <option value="">全部 Key</option>
                {keys.map((key) => (
                  <option key={key.id} value={key.id}>
                    {key.name}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadUsage(usageFilterKeyId)}
              disabled={usageLoading}
            >
              <RefreshCw size={16} /> 刷新
            </Button>
          </div>
          {!usageError && (
            <p className="api-usage-summary">
              当前范围已消费{' '}
              <strong>{formatCents(usageTotalSpentCents)}</strong>
            </p>
          )}
          {usageError ? (
            <p className="api-usage-error" role="alert">
              {usageError}
            </p>
          ) : usageLoading ? (
            <p className="api-console-muted">正在加载使用记录…</p>
          ) : usageLogs.length === 0 ? (
            <p className="api-console-muted">
              还没有 API 使用记录，调用模型后将在这里显示。
            </p>
          ) : (
            <div className="api-usage-list">
              {usageLogs.map((log) => (
                <div className="api-usage-row" key={log.id}>
                  <div className="api-usage-cell api-usage-model">
                    <code>{log.model}</code>
                    <span>
                      {keyNameById.get(log.key_id || '') || '已删除的 Key'}
                    </span>
                  </div>
                  <div className="api-usage-cell api-usage-status">
                    <span className={`api-usage-status-badge is-${log.status}`}>
                      {usageStatusLabel(log.status)}
                    </span>
                  </div>
                  <div className="api-usage-cell api-usage-tokens">
                    <span>输入 {formatTokens(log.input_tokens)}</span>
                    <span>输出 {formatTokens(log.output_tokens)}</span>
                  </div>
                  <div className="api-usage-cell api-usage-charge">
                    <strong>{formatCents(log.actual_customer_cents)}</strong>
                    <small>{formatDate(log.created_at)}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
      <ApiKeyCreatedDialog
        open={Boolean(newSecret)}
        secret={newSecret}
        onClose={() => setNewSecret('')}
      />
    </CreateWorkspaceShell>
  );
}

export default ApiConsolePage;
