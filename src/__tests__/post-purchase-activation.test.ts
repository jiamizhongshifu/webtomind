import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recordConversionEvent } from '../../api/utils/conversion-events';
import {
  getPostPurchaseActivationIdempotencyKey,
  recordFirstPostPurchaseGenerationSuccess
} from '../../api/image/post-purchase-activation';

vi.mock('../../api/utils/conversion-events', () => ({
  recordConversionEvent: vi.fn(async () => undefined)
}));

function createSupabaseMock(order: Record<string, unknown> | null) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    gte: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: order, error: null }))
  };
  return {
    from: vi.fn(() => query)
  };
}

const activationInput = {
  userId: '00000000-0000-4000-8000-000000000001',
  generationIds: ['generation-1'],
  imageCount: 1,
  requestedImageCount: 1,
  creditsConsumed: 20,
  provider: 'openai',
  model: 'gpt-image-2',
  promptMode: 'standard'
};

describe('post-purchase generation activation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses one stable idempotency key for every generation after an order', () => {
    expect(
      getPostPurchaseActivationIdempotencyKey(
        '00000000-0000-4000-8000-000000000011'
      )
    ).toBe(
      'post_purchase_generation_success:00000000-0000-4000-8000-000000000011'
    );
  });

  it('records the first generated image against the purchased order', async () => {
    const orderId = '00000000-0000-4000-8000-000000000011';
    const supabase = createSupabaseMock({
      id: orderId,
      product_type: 'subscription',
      product_id: 'pro',
      amount: 900,
      currency: 'usd',
      updated_at: new Date().toISOString(),
      metadata: { checkout_attribution: { cta_source: 'pricing_page' } }
    });

    await recordFirstPostPurchaseGenerationSuccess({
      sb: supabase as never,
      ...activationInput
    });

    expect(recordConversionEvent).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        eventName: 'post_purchase_generation_success',
        orderId,
        entityId: 'generation-1',
        idempotencyKey: `post_purchase_generation_success:${orderId}`
      })
    );
  });

  it('does not emit an activation when the user has no recent purchase', async () => {
    const supabase = createSupabaseMock(null);

    await recordFirstPostPurchaseGenerationSuccess({
      sb: supabase as never,
      ...activationInput
    });

    expect(recordConversionEvent).not.toHaveBeenCalled();
  });
});
