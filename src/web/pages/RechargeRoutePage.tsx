import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { applySeo } from '../lib/seo';
import { readSeoConversionAttribution } from '../lib/seo-conversion-attribution';
import {
  trackCheckoutStart,
  trackEvent,
  trackPricingView
} from '../lib/analytics';
import {
  createCheckoutSession,
  consumePendingCheckoutIntent,
  redirectToCheckout,
  savePendingCheckoutIntent,
  verifyCheckoutReturn
} from '@/services/payment-api';
import { getCreditPackages } from '@/services/credits-api';
import type { CreditPackage } from '@/types/membership';
import { usdCentsToDisplayedCny } from '@/shared/zpay-pricing';
import {
  collapsePaywallReturnTo,
  unwrapPaywallReturnTo
} from '@/shared/paywall-return-to';
import {
  RechargePresentation,
  type RechargePaymentMethod
} from './RechargePresentation';

type LocalePrefix = '' | '/zh-CN' | '/en-US';

function getLocalePrefix(pathname: string): LocalePrefix {
  if (pathname.startsWith('/en-US')) return '/en-US';
  if (pathname.startsWith('/zh-CN')) return '/zh-CN';
  return '';
}

function getLoginTarget(redirect: string, search: string): string {
  const referralCode = new URLSearchParams(search).get('ref');
  const referralQuery = referralCode
    ? `&ref=${encodeURIComponent(referralCode)}`
    : '';
  return `/login?redirect=${encodeURIComponent(redirect)}${referralQuery}`;
}

interface RechargeRoutePageProps {
  embedded?: boolean;
}

export function RechargeRoutePage({
  embedded = false
}: RechargeRoutePageProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const localePrefix = getLocalePrefix(location.pathname);
  const isEnglish = localePrefix === '/en-US';
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [packagesError, setPackagesError] = useState(false);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<RechargePaymentMethod>(
    isEnglish ? 'stripe' : 'alipay'
  );
  const [paymentNotice, setPaymentNotice] = useState<{
    tone: 'neutral' | 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);
  const [paymentRetryAvailable, setPaymentRetryAvailable] = useState(false);
  const resumedCheckoutRef = useRef(false);
  const source =
    new URLSearchParams(location.search).get('source') || 'recharge_page';
  const paywallReturnTo = collapsePaywallReturnTo(
    location.pathname,
    location.search,
    location.hash,
    `${localePrefix}/create`
  );

  const activePackages = useMemo(() => {
    return packages
      .filter((pkg) => pkg.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.price - b.price);
  }, [packages]);

  const loadPackages = useCallback(async () => {
    setLoading(true);
    setPackagesError(false);
    try {
      const result = await getCreditPackages();
      setPackages(result || []);
      setPackagesError(!result || result.length === 0);
    } catch {
      setPackages([]);
      setPackagesError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    return applySeo({
      title: isEnglish
        ? 'Buy Extra Credits | WebToMind'
        : '购买额外积分 | WebToMind',
      description: isEnglish
        ? 'Buy one-time WebToMind credits for image generation, image editing, prompt extraction, and creative workflows.'
        : '购买 WebToMind 一次性积分，用于图像生成、图片编辑、Prompt 提取和创作工作流。',
      robots: 'noindex,nofollow',
      canonical:
        localePrefix === '/en-US'
          ? 'https://webtomind.com/en-US/recharge'
          : localePrefix === '/zh-CN'
            ? 'https://webtomind.com/zh-CN/recharge'
            : 'https://webtomind.com/recharge',
      alternates: [
        { hreflang: 'zh-CN', href: 'https://webtomind.com/zh-CN/recharge' },
        { hreflang: 'en-US', href: 'https://webtomind.com/en-US/recharge' },
        { hreflang: 'x-default', href: 'https://webtomind.com/recharge' }
      ],
      htmlLang: isEnglish ? 'en' : 'zh-CN',
      ogImage: 'https://webtomind.com/icons/logo-icon.svg',
      twitterSite: '@webtomind'
    });
  }, [isEnglish, localePrefix]);

  useEffect(() => {
    trackPricingView(source);
    void loadPackages();
  }, [loadPackages, source]);

  const verifyPaymentReturn = useCallback(async () => {
    const params = new URLSearchParams(location.search);
    const payment = params.get('payment');
    if (payment !== 'success' && payment !== 'cancel') return;

    if (payment === 'success') {
      setPaymentRetryAvailable(false);
      setPaymentNotice({
        tone: 'neutral',
        message: isEnglish
          ? 'Confirming your payment and credit balance…'
          : '正在确认支付结果和积分到账状态…'
      });
      try {
        const order = await verifyCheckoutReturn({
          orderId: params.get('orderId'),
          checkoutType: params.get('checkoutType'),
          productId: params.get('productId')
        });
        if (order.status === 'failed') {
          setPaymentNotice({
            tone: 'error',
            message: isEnglish
              ? 'Payment could not be completed. No credits were added.'
              : '支付未能完成，积分未增加。'
          });
          return;
        }
        if (order.status !== 'succeeded') {
          setPaymentRetryAvailable(true);
          setPaymentNotice({
            tone: 'warning',
            message: isEnglish
              ? 'Payment is still processing. Keep this page open and retry shortly.'
              : '支付仍在处理中，请保留当前页面并稍后重试。'
          });
          return;
        }
        window.dispatchEvent(new CustomEvent('credits-changed'));
        setPaymentNotice({
          tone: 'success',
          message: isEnglish
            ? 'Payment confirmed. Your credits are ready.'
            : '支付已确认，积分已到账。'
        });
        const returnTo = unwrapPaywallReturnTo(params.get('returnTo'));
        if (returnTo) {
          navigate(returnTo, { replace: true });
          return;
        }
      } catch {
        setPaymentRetryAvailable(Boolean(params.get('orderId')));
        setPaymentNotice({
          tone: 'error',
          message: isEnglish
            ? 'We could not verify this payment. No success was recorded.'
            : '暂时无法验证这笔支付，系统不会将其记录为成功。'
        });
        return;
      }
    } else {
      setPaymentNotice({
        tone: 'warning',
        message: isEnglish ? 'Payment was canceled.' : '支付已取消。'
      });
    }

    navigate(`${localePrefix}/recharge`, { replace: true });
  }, [isEnglish, localePrefix, location.search, navigate]);

  useEffect(() => {
    void verifyPaymentReturn();
  }, [verifyPaymentReturn]);

  const handlePurchase = useCallback(
    async (
      pkg: CreditPackage,
      requestedPaymentMethod: RechargePaymentMethod = paymentMethod
    ) => {
      const value =
        requestedPaymentMethod === 'alipay'
          ? usdCentsToDisplayedCny(pkg.price)
          : pkg.price / 100;
      const currency = requestedPaymentMethod === 'alipay' ? 'CNY' : 'USD';
      trackEvent('pricing_cta_click', {
        cta_source: source,
        pricing_mode: 'recharge',
        cta_kind: 'credit_package_checkout',
        checkout_type: 'credit_package',
        product_id: pkg.id,
        product_name: pkg.name,
        value,
        currency,
        payment_provider: requestedPaymentMethod,
        credits: pkg.credits,
        authenticated: isAuthenticated
      });

      if (!isAuthenticated) {
        const returnPath = collapsePaywallReturnTo(
          location.pathname,
          location.search,
          '',
          `${localePrefix}/create`
        );
        savePendingCheckoutIntent({
          type: 'credit_package',
          id: pkg.id,
          paymentProvider: requestedPaymentMethod,
          returnPath
        });
        navigate(getLoginTarget(returnPath, location.search));
        return;
      }

      try {
        const origin =
          typeof window !== 'undefined'
            ? window.location.origin
            : 'https://webtomind.com';
        const returnTo =
          unwrapPaywallReturnTo(
            new URLSearchParams(location.search).get('returnTo'),
            typeof window !== 'undefined'
              ? window.location.origin
              : undefined
          ) || `${localePrefix || ''}/create`;
        const successUrl = new URL(`${localePrefix}/recharge`, origin);
        const cancelUrl = new URL(`${localePrefix}/recharge`, origin);
        successUrl.searchParams.set('payment', 'success');
        successUrl.searchParams.set('checkoutType', 'credit_package');
        successUrl.searchParams.set('productId', pkg.id);
        successUrl.searchParams.set('returnTo', returnTo);
        cancelUrl.searchParams.set('payment', 'cancel');
        cancelUrl.searchParams.set('checkoutType', 'credit_package');
        cancelUrl.searchParams.set('productId', pkg.id);

        setPurchasingId(pkg.id);
        trackCheckoutStart({
          planId: pkg.id,
          billingCycle: 'monthly',
          checkoutType: 'credit_package',
          paymentProvider: requestedPaymentMethod,
          value,
          currency,
          ctaSource: source,
          productName: pkg.name
        });
        const session = await createCheckoutSession({
          type: 'credit_package',
          id: pkg.id,
          paymentProvider: requestedPaymentMethod,
          ctaSource: source,
          returnTo,
          successUrl: successUrl.toString(),
          cancelUrl: cancelUrl.toString(),
          pageLocation:
            typeof window !== 'undefined' ? window.location.href : undefined,
          pageReferrer:
            typeof document !== 'undefined'
              ? document.referrer || undefined
              : undefined,
          acquisition: readSeoConversionAttribution()?.acquisition
        });
        if (session.url) {
          redirectToCheckout(session);
        } else {
          throw new Error('Checkout URL not found');
        }
      } catch (error) {
        trackEvent('checkout_session_create_failed', {
          cta_source: source,
          billing_context: 'recharge',
          checkout_type: 'credit_package',
          product_id: pkg.id,
          payment_provider: requestedPaymentMethod,
          error_code: error instanceof Error ? error.name : 'CHECKOUT_ERROR'
        });
        setPaymentNotice({
          tone: 'error',
          message: isEnglish
            ? 'Checkout is temporarily unavailable. Please try again.'
            : '结账服务暂时不可用，请稍后重试。'
        });
      } finally {
        setPurchasingId(null);
      }
    },
    [
      isAuthenticated,
      isEnglish,
      localePrefix,
      location.pathname,
      location.search,
      navigate,
      paymentMethod,
      source
    ]
  );

  useEffect(() => {
    if (
      resumedCheckoutRef.current ||
      !isAuthenticated ||
      loading ||
      packagesError ||
      new URLSearchParams(location.search).has('payment')
    )
      return;
    resumedCheckoutRef.current = true;
    const intent = consumePendingCheckoutIntent(
      `${location.pathname}${location.search}`
    );
    if (!intent || intent.type !== 'credit_package') return;
    const selectedPackage = activePackages.find((pkg) => pkg.id === intent.id);
    if (selectedPackage) {
      const resumedMethod = intent.paymentProvider || paymentMethod;
      setPaymentMethod(resumedMethod);
      void handlePurchase(selectedPackage, resumedMethod);
    }
  }, [
    activePackages,
    handlePurchase,
    isAuthenticated,
    loading,
    location.pathname,
    location.search,
    paymentMethod,
    packagesError
  ]);

  return (
    <RechargePresentation
      embedded={embedded}
      localePrefix={localePrefix}
      isEnglish={isEnglish}
      returnTo={paywallReturnTo}
      packages={activePackages}
      loading={loading}
      packagesError={packagesError}
      purchasingId={purchasingId}
      paymentMethod={paymentMethod}
      paymentNotice={paymentNotice}
      paymentRetryAvailable={paymentRetryAvailable}
      onPaymentMethodChange={setPaymentMethod}
      onPurchase={(pkg) => void handlePurchase(pkg)}
      onRetryPackages={() => void loadPackages()}
      onRetryPayment={() => void verifyPaymentReturn()}
    />
  );
}

export default RechargeRoutePage;
