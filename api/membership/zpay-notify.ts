import { createClient } from '@supabase/supabase-js';
import { fulfillOrder, PaymentOrderInProgressError } from './webhook';
import {
  buildZpayOutTradeNo,
  getZpayConfig,
  parseCnyMoneyToCents,
  parseUniqueZpayParameters,
  verifyZpayParameters
} from '../utils/zpay';

export const config = {
  runtime: 'edge'
};

const ORDER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ZpayOrder {
  id: string;
  user_id: string;
  amount: number | null;
  currency: string | null;
  status: string | null;
  provider: string | null;
  provider_order_id: string | null;
  product_type: string | null;
  product_id: string | null;
}

export interface ZpayNotificationResult {
  ok: boolean;
  orderId?: string;
  checkoutType?: string;
  productId?: string;
  /** Verified payment whose order another delivery is still fulfilling. */
  pending?: boolean;
  error?: string;
}

export async function processZpayNotification(
  request: Request
): Promise<ZpayNotificationResult> {
  const zpay = getZpayConfig();
  if (!zpay) return { ok: false, error: 'ZPAY is not configured' };

  const params = parseUniqueZpayParameters(
    new URL(request.url).searchParams
  );
  if (!params) return { ok: false, error: 'Duplicate callback parameter' };
  if (params.sign_type !== 'MD5') {
    return { ok: false, error: 'Unsupported signature type' };
  }
  if (!verifyZpayParameters(params, zpay.key)) {
    return { ok: false, error: 'Invalid callback signature' };
  }
  if (params.pid !== zpay.pid) {
    return { ok: false, error: 'Merchant id mismatch' };
  }
  if (params.trade_status !== 'TRADE_SUCCESS' || params.type !== 'alipay') {
    return { ok: false, error: 'Payment is not successful' };
  }

  const orderId = params.param;
  if (!orderId || !ORDER_ID_PATTERN.test(orderId)) {
    return { ok: false, error: 'Invalid payment order id' };
  }
  if (params.out_trade_no !== buildZpayOutTradeNo(orderId)) {
    return { ok: false, error: 'Merchant order number mismatch' };
  }
  if (!params.trade_no || params.trade_no.length > 128) {
    return { ok: false, error: 'Invalid provider payment id' };
  }

  const paidCnyCents = parseCnyMoneyToCents(params.money || '');
  if (paidCnyCents === null || paidCnyCents <= 0) {
    return { ok: false, error: 'Invalid paid amount' };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return { ok: false, error: 'Database is not configured' };
  }
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false }
  });
  const { data, error } = await supabase
    .from('payment_orders')
    .select(
      'id,user_id,amount,currency,status,provider,provider_order_id,product_type,product_id'
    )
    .eq('id', orderId)
    .eq('provider', 'zpay')
    .maybeSingle();

  if (error || !data) {
    console.warn('[ZPAY] Payment order lookup failed:', {
      orderId,
      message: error?.message
    });
    return { ok: false, error: 'Payment order not found' };
  }

  const order = data as ZpayOrder;
  if (order.provider_order_id !== params.out_trade_no) {
    return { ok: false, error: 'Stored merchant order number mismatch' };
  }
  if (
    order.amount !== paidCnyCents ||
    order.currency?.toLowerCase() !== 'cny'
  ) {
    console.warn('[ZPAY] Paid amount does not match order:', {
      orderId,
      expectedAmount: order.amount,
      paidAmount: paidCnyCents,
      currency: order.currency
    });
    return { ok: false, error: 'Payment amount mismatch' };
  }
  if (!order.product_type || !order.product_id) {
    return { ok: false, error: 'Payment order product is invalid' };
  }

  try {
    await fulfillOrder(
      supabase,
      orderId,
      {
        id: params.trade_no,
        amount_total: paidCnyCents,
        currency: 'cny',
        client_reference_id: order.user_id,
        customer: params.buyer || null,
        subscription: null,
        metadata: {
          order_id: orderId,
          product_type: order.product_type,
          product_id: order.product_id
        },
        payment_status: 'paid',
        status: 'complete',
        provider: 'zpay'
      },
      `zpay:${params.trade_no}`
    );
  } catch (fulfillmentError) {
    if (fulfillmentError instanceof PaymentOrderInProgressError) {
      // Not acknowledged, so ZPAY retries until the order reaches a final state.
      return {
        ok: false,
        pending: true,
        orderId,
        checkoutType: order.product_type,
        productId: order.product_id,
        error: 'Order fulfillment in progress'
      };
    }
    console.error('[ZPAY] Order fulfillment failed:', {
      orderId,
      message:
        fulfillmentError instanceof Error
          ? fulfillmentError.message
          : 'Unknown error'
    });
    return { ok: false, error: 'Order fulfillment failed' };
  }

  return {
    ok: true,
    orderId,
    checkoutType: order.product_type,
    productId: order.product_id
  };
}

export default async function handler(request: Request) {
  if (request.method !== 'GET') {
    return new Response('fail', {
      status: 405,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
  const result = await processZpayNotification(request);
  return new Response(result.ok ? 'success' : 'fail', {
    status: result.ok ? 200 : 400,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}
