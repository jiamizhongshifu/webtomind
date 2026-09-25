import { createClient } from '@supabase/supabase-js';
import { getCorsHeadersForRequest } from '../utils/auth';

export const config = {
  runtime: 'edge'
};

const ORDER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeOrderStatus(status: string): string {
  if (status === 'expired') return 'expired';
  if (status === 'refunded') return 'failed';
  return status;
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);
  const jsonResponse = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...corsHeaders
      }
    });

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const orderId = new URL(request.url).searchParams.get('orderId')?.trim();
  if (!orderId || !ORDER_ID_PATTERN.test(orderId)) {
    return jsonResponse({ error: 'Invalid order id' }, 400);
  }

  const authHeader = request.headers.get('Authorization');
  const match = authHeader?.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse({ error: 'Database not configured' }, 500);
  }

  const token = match[1];
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false }
  });
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return jsonResponse({ error: 'Invalid token' }, 401);
  }

  const { data: order, error } = await supabase
    .from('payment_orders')
    .select(
      'id,status,amount,currency,product_type,product_id,created_at,updated_at'
    )
    .eq('id', orderId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('[OrderStatus] Lookup failed:', error);
    return jsonResponse({ error: 'Order status unavailable' }, 500);
  }
  if (!order) {
    return jsonResponse({ error: 'Order not found' }, 404);
  }

  return jsonResponse({
    order: {
      id: order.id,
      status: normalizeOrderStatus(order.status),
      amount: order.amount,
      currency: order.currency,
      productType: order.product_type,
      productId: order.product_id,
      createdAt: order.created_at,
      updatedAt: order.updated_at
    }
  });
}
