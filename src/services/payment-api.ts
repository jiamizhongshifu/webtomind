/**
 * 支付系统 API 服务层
 */

import { getApiBaseUrl, isExtensionEnv } from '@/utils/env';
import { getAccessToken } from './workspace-api';
import type { AcquisitionSnapshot } from '../web/lib/seo-conversion-attribution';

// API 基础地址
// 生产环境：优先使用当前域名避免 CORS 问题
const API_BASE = getApiBaseUrl();

interface CheckoutRequest {
  type: 'subscription' | 'credit_package' | 'api_credit_package';
  id: string;
  paymentProvider?: 'stripe' | 'alipay';
  customAmountUsdCents?: number;
  billingCycle?: 'monthly' | 'yearly';
  promoCode?: string;
  upgradeFromPackageId?: string;
  successUrl?: string;
  cancelUrl?: string;
  ctaSource?: string;
  returnTo?: string;
  pageLocation?: string;
  pageReferrer?: string;
  utm?: Record<string, string>;
  acquisition?: AcquisitionSnapshot;
}

interface CheckoutResponse {
  id: string;
  sessionId?: string;
  url: string;
  method?: 'GET' | 'POST';
  fields?: Record<string, string>;
  paymentProvider?: 'stripe' | 'alipay';
  mock?: boolean;
}

interface BillingPortalResponse {
  url: string;
}

export type CheckoutOrderState =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'expired';

export interface CheckoutOrderStatus {
  id: string;
  status: CheckoutOrderState;
  amount: number;
  currency: string;
  productType: 'subscription' | 'credit_package' | 'api_credit_package';
  productId: string;
  createdAt?: string;
  updatedAt?: string;
}

interface CheckoutOrderStatusResponse {
  order: CheckoutOrderStatus;
}

const PENDING_CHECKOUT_INTENT_KEY = 'webtomind:pending-checkout-intent:v1';
const PENDING_CHECKOUT_INTENT_TTL_MS = 15 * 60 * 1000;

export interface PendingCheckoutIntent {
  type: 'subscription' | 'credit_package' | 'api_credit_package';
  id: string;
  paymentProvider?: 'stripe' | 'alipay';
  billingCycle?: 'monthly' | 'yearly';
  returnPath: string;
  createdAt: number;
}

export function savePendingCheckoutIntent(
  intent: Omit<PendingCheckoutIntent, 'createdAt'>
): void {
  try {
    window.sessionStorage.setItem(
      PENDING_CHECKOUT_INTENT_KEY,
      JSON.stringify({ ...intent, createdAt: Date.now() })
    );
  } catch {
    // Login still works when storage is unavailable; only automatic resume degrades.
  }
}

export function consumePendingCheckoutIntent(
  returnPath: string
): PendingCheckoutIntent | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_CHECKOUT_INTENT_KEY);
    if (!raw) return null;
    const intent = JSON.parse(raw) as Partial<PendingCheckoutIntent>;
    window.sessionStorage.removeItem(PENDING_CHECKOUT_INTENT_KEY);
    if (
      (intent.type !== 'subscription' &&
        intent.type !== 'credit_package' &&
        intent.type !== 'api_credit_package') ||
      typeof intent.id !== 'string' ||
      (intent.paymentProvider !== undefined &&
        intent.paymentProvider !== 'stripe' &&
        intent.paymentProvider !== 'alipay') ||
      intent.returnPath !== returnPath ||
      typeof intent.createdAt !== 'number' ||
      Date.now() - intent.createdAt > PENDING_CHECKOUT_INTENT_TTL_MS
    ) {
      return null;
    }
    return intent as PendingCheckoutIntent;
  } catch {
    return null;
  }
}

export function redirectToCheckout(checkout: CheckoutResponse): void {
  if (checkout.method !== 'POST') {
    window.location.assign(checkout.url);
    return;
  }
  const target = new URL(checkout.url);
  if (
    target.origin !== 'https://zpayz.cn' ||
    target.pathname !== '/submit.php' ||
    target.username ||
    target.password ||
    !checkout.fields
  ) {
    throw new Error('Invalid payment redirect');
  }

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = target.toString();
  form.style.display = 'none';
  Object.entries(checkout.fields).forEach(([name, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
  form.remove();
}

async function getSafeCheckoutError(response: Response): Promise<Error> {
  let errorCode = 'CHECKOUT_ERROR';
  let errorMessage = 'Checkout is temporarily unavailable. Please try again.';
  try {
    const body = (await response.json()) as {
      error?: unknown;
      errorCode?: unknown;
    };
    if (typeof body.errorCode === 'string') errorCode = body.errorCode;
    if (
      (errorCode === 'ACTIVE_SUBSCRIPTION_EXISTS' ||
        errorCode === 'ACTIVE_PREPAID_SUBSCRIPTION_EXISTS') &&
      typeof body.error === 'string'
    ) {
      errorMessage = body.error;
    }
    if (errorCode === 'STRIPE_NOT_CONFIGURED') {
      errorMessage = '当前 Stripe 暂不可用，请切换其他支付方式。';
    }
    if (errorCode === 'ALIPAY_NOT_CONFIGURED') {
      errorMessage = '当前支付宝暂不可用，请切换其他支付方式。';
    }
    if (
      typeof errorCode === 'string' &&
      errorCode.startsWith('PROMO_CODE') &&
      typeof body.error === 'string'
    ) {
      errorMessage = body.error;
    }
  } catch {
    // The public message intentionally does not expose provider or database errors.
  }
  const error = new Error(errorMessage);
  error.name = errorCode;
  return error;
}

/**
 * 发起结账
 */
export async function createCheckoutSession(
  params: CheckoutRequest
): Promise<CheckoutResponse> {
  // 插件环境逻辑
  if (isExtensionEnv()) {
    // 插件环境通常通过背景脚本通知
    // 但支付必须在网页完成，可以直接在插件中也调用 Web API 后跳转
    const token = await chrome.storage.local.get('sb-access-token');
    const response = await fetch(`${API_BASE}/api/membership/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token['sb-access-token']}`
      },
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      throw await getSafeCheckoutError(response);
    }

    return response.json();
  }

  // Web 环境逻辑
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE}/api/membership/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(params)
  });

  if (!response.ok) {
    throw await getSafeCheckoutError(response);
  }

  return response.json();
}

export async function getCheckoutOrderStatus(
  orderId: string
): Promise<CheckoutOrderStatus> {
  const token = await getAccessToken();
  if (!token) throw new Error('Authentication required');
  const params = new URLSearchParams({ orderId });
  const response = await fetch(
    `${API_BASE}/api/membership/order-status?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    }
  );
  if (!response.ok) {
    throw new Error(
      response.status === 404 ? 'Order not found' : 'Order status unavailable'
    );
  }
  const result = (await response.json()) as CheckoutOrderStatusResponse;
  return result.order;
}

export async function waitForCheckoutOrderStatus(
  orderId: string,
  options: {
    attempts?: number;
    intervalMs?: number;
    wait?: (delayMs: number) => Promise<void>;
  } = {}
): Promise<CheckoutOrderStatus> {
  const attempts = Math.max(1, options.attempts ?? 6);
  const intervalMs = Math.max(0, options.intervalMs ?? 800);
  const wait =
    options.wait ||
    ((delayMs: number) =>
      new Promise<void>((resolve) => window.setTimeout(resolve, delayMs)));
  let latest = await getCheckoutOrderStatus(orderId);
  for (let attempt = 1; attempt < attempts; attempt += 1) {
    if (
      latest.status === 'succeeded' ||
      latest.status === 'failed' ||
      latest.status === 'expired'
    ) {
      return latest;
    }
    await wait(intervalMs * attempt);
    latest = await getCheckoutOrderStatus(orderId);
  }
  return latest;
}

export async function verifyCheckoutReturn(params: {
  orderId?: string | null;
  checkoutType?: string | null;
  productId?: string | null;
}): Promise<CheckoutOrderStatus> {
  if (!params.orderId) throw new Error('Missing order id');
  const order = await waitForCheckoutOrderStatus(params.orderId);
  if (
    (params.checkoutType && order.productType !== params.checkoutType) ||
    (params.productId && order.productId !== params.productId)
  ) {
    throw new Error('Order details do not match');
  }
  return order;
}

export async function createBillingPortalSession(
  params: {
    returnUrl?: string;
  } = {}
): Promise<BillingPortalResponse> {
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE}/api/membership/portal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(params)
  });

  if (!response.ok) {
    let errorMessage = 'Billing portal failed';
    try {
      const json = await response.json();
      errorMessage = json.error || errorMessage;
    } catch {
      errorMessage = `Server error (${response.status})`;
    }
    throw new Error(errorMessage);
  }

  return response.json();
}
