import type { SupabaseClient } from '@supabase/supabase-js';
import { recordConversionEvent } from '../utils/conversion-events.js';

export interface PostPurchaseGenerationSuccessInput {
  sb: SupabaseClient;
  userId: string;
  generationIds: string[];
  imageCount: number;
  requestedImageCount: number;
  creditsConsumed: number;
  creditType?: string;
  creditBreakdown?: Record<string, number>;
  taskId?: string;
  provider: string;
  model: string;
  promptMode: string;
}

export function getPostPurchaseActivationIdempotencyKey(orderId: string) {
  return `post_purchase_generation_success:${orderId}`;
}

export async function recordFirstPostPurchaseGenerationSuccess(
  params: PostPurchaseGenerationSuccessInput
): Promise<void> {
  try {
    const cutoff = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();
    const { data: order, error } = await params.sb
      .from('payment_orders')
      .select(
        'id, product_type, product_id, amount, currency, updated_at, metadata'
      )
      .eq('user_id', params.userId)
      .eq('status', 'succeeded')
      .gte('updated_at', cutoff)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !order) {
      if (error) {
        console.warn('[ImageGenerate] post-purchase order lookup failed:', {
          userId: params.userId,
          message: error.message
        });
      }
      return;
    }

    const orderUpdatedAt =
      typeof order.updated_at === 'string' ? order.updated_at : null;
    const hoursSincePurchase = orderUpdatedAt
      ? (Date.now() - new Date(orderUpdatedAt).getTime()) / (60 * 60 * 1000)
      : null;
    const orderMetadata =
      order.metadata && typeof order.metadata === 'object'
        ? (order.metadata as Record<string, unknown>)
        : {};
    const checkoutAttribution =
      orderMetadata.checkout_attribution &&
      typeof orderMetadata.checkout_attribution === 'object'
        ? (orderMetadata.checkout_attribution as Record<string, unknown>)
        : {};
    const ctaSource =
      typeof checkoutAttribution.cta_source === 'string'
        ? checkoutAttribution.cta_source
        : null;
    const primaryGenerationId = params.generationIds[0] || params.taskId;

    await recordConversionEvent(params.sb, {
      eventName: 'post_purchase_generation_success',
      eventSource: 'image_generate_api',
      userId: params.userId,
      entityType: 'image_generation',
      entityId: primaryGenerationId,
      orderId: order.id,
      productType: order.product_type,
      productId: order.product_id,
      ctaSource,
      idempotencyKey: getPostPurchaseActivationIdempotencyKey(order.id),
      metadata: {
        generation_ids: params.generationIds,
        task_id: params.taskId,
        image_count: params.imageCount,
        requested_image_count: params.requestedImageCount,
        credits_consumed: params.creditsConsumed,
        credit_type: params.creditType,
        credit_breakdown: params.creditBreakdown,
        provider: params.provider,
        model: params.model,
        prompt_mode: params.promptMode,
        hours_since_purchase: hoursSincePurchase,
        checkout_attribution: checkoutAttribution,
        order_amount: order.amount,
        order_currency: order.currency
      }
    });
  } catch (error) {
    console.warn(
      '[ImageGenerate] post-purchase activation event failed:',
      error
    );
  }
}
