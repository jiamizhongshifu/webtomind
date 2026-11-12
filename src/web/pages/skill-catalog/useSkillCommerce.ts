import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getApiBaseUrl } from '@/utils/env';
import { getAccessToken } from '@/services/workspace-api';
import {
  createCheckoutSession,
  getCheckoutOrderStatus,
  redirectToCheckout
} from '@/services/payment-api';
import { useAuth } from '../../contexts/AuthContext';

export interface SkillProduct {
  id: string;
  kind: 'subscription' | 'single';
  slug: string | null;
  name: string;
  priceUsd: number;
  priceCny: number;
  yearlyUsd: number | null;
  yearlyCny: number | null;
  checkoutEnabled: boolean;
  checkoutProviders: Array<'stripe' | 'alipay'>;
  owned: boolean;
}
interface CommerceData {
  products: SkillProduct[];
  access: {
    premiumAccess: boolean;
    subscriptions: Array<{
      id: string;
      status: string;
      endsAt: string;
      prepaid: boolean;
      cancelAtPeriodEnd: boolean;
    }>;
  } | null;
}

export function useSkillCommerce(isZh: boolean) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [data, setData] = useState<CommerceData>({
    products: [],
    access: null
  });
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setData({ products: [], access: null });
    setUnavailable(false);
    void (async () => {
      try {
        const token = isAuthenticated ? await getAccessToken() : null;
        if (isAuthenticated && !token) throw new Error('Auth not ready');
        const response = await fetch(
          `${getApiBaseUrl()}/api/membership/skill-products`,
          {
            signal: controller.signal,
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          }
        );
        if (!response.ok) throw new Error('Products unavailable');
        const body = (await response.json()) as CommerceData;
        if (!body || !Array.isArray(body.products) ||
            !(body.access === null || Array.isArray(body.access?.subscriptions))) {
          throw new Error('Invalid products response');
        }
        if (!controller.signal.aborted) setData(body);
      } catch {
        if (!controller.signal.aborted) setUnavailable(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [isAuthenticated, user?.id, revision]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const orderId = params.get('orderId');
    if (params.get('payment') !== 'success' || !orderId || !isAuthenticated)
      return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    setNotice(isZh ? '正在核对付款与权益…' : 'Checking payment and access…');
    const check = async () => {
      try {
        const order = await getCheckoutOrderStatus(orderId);
        if (stopped) return;
        if (order.status === 'succeeded') {
          setNotice(
            isZh ? '付款与交付已确认。' : 'Payment and delivery confirmed.'
          );
          reload();
          return;
        }
        if (order.status === 'failed' || order.status === 'expired') {
          setNotice(
            isZh
              ? '订单未完成，请核对订单后再试。'
              : 'Order not completed. Check the order before retrying.'
          );
          return;
        }
      } catch {
        /* A redirect is not proof of payment. Keep the state unconfirmed. */
      }
      if (stopped) return;
      if (++attempts < 10) timer = setTimeout(() => void check(), 3000);
      else
        setNotice(
          isZh
            ? '付款尚未确认，请稍后刷新核对，避免重复支付。'
            : 'Payment is not yet confirmed. Refresh later; avoid paying twice.'
        );
    };
    void check();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [location.search, isAuthenticated, isZh, reload]);

  const providerFor = (product?: SkillProduct) => {
    const available = product?.checkoutProviders || [];
    return isZh && available.includes('alipay')
      ? ('alipay' as const)
      : available.includes('stripe')
        ? ('stripe' as const)
        : available[0] || null;
  };
  const buy = async (
    product: SkillProduct,
    cycle: 'monthly' | 'yearly' = 'yearly'
  ) => {
    if (busy || loading || !product.checkoutEnabled || product.owned) return;
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`);
      return;
    }
    const paymentProvider = providerFor(product);
    if (!paymentProvider) return;
    setBusy(true);
    setNotice('');
    try {
      const returnUrl = `${window.location.origin}${location.pathname}`;
      redirectToCheckout(
        await createCheckoutSession({
          type:
            product.kind === 'single' ? 'skill_purchase' : 'skill_subscription',
          id: product.id,
          paymentProvider,
          billingCycle: product.kind === 'subscription' ? cycle : undefined,
          successUrl: returnUrl,
          cancelUrl: returnUrl,
          ctaSource: 'skill_commerce'
        })
      );
    } catch (error) {
      const conflict =
        error instanceof Error &&
        [
          'SKILL_ALREADY_OWNED',
          'SKILL_ACCESS_ALREADY_INCLUDED',
          'ACTIVE_SKILL_SUBSCRIPTION_EXISTS',
          'SKILL_CHECKOUT_CONFLICT'
        ].includes(error.name);
      setNotice(
        conflict
          ? isZh
            ? '已有权益或未完成的订单，请先核对当前方案和订单。'
            : 'Existing access or an unfinished order needs review before another purchase.'
          : isZh
            ? '结账暂不可用，请稍后重试。'
            : 'Checkout is unavailable. Please try again later.'
      );
      setBusy(false);
      reload();
    }
  };
  return {
    ...data,
    isAuthenticated,
    loading,
    unavailable,
    busy,
    notice,
    providerFor,
    buy,
    reload
  };
}

export function skillMoney(cents: number, cny: boolean) {
  return `${cny ? '¥' : '$'}${Number.isInteger(cents / 100) ? cents / 100 : (cents / 100).toFixed(2)}`;
}
