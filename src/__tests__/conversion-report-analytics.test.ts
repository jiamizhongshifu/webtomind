import { describe, expect, it } from 'vitest';

import {
  buildConversionHealthSummary,
  buildDurableSourceFunnel,
  buildPurchaseOrderReconciliation,
  buildSeoConversionFunnel,
  mergePaymentOrderRows,
  type ConversionEventRow,
  type PaymentOrderRow
} from '../../api/analytics/conversion-report';

describe('conversion report analytics', () => {
  it('joins SEO prompt use to real task and first-success events', () => {
    const funnel = buildSeoConversionFunnel([
      {
        event_name: 'prompt_preview_view',
        entity_id: 'case-1',
        session_id: 'session-1',
        cta_source: 'prompt_preview_view',
        metadata: {
          canonical_path: '/ai-image-prompts',
          caseId: 'case-1',
          caseSlug: 'product-shot',
          source: 'prompt_preview_view'
        }
      },
      {
        event_name: 'prompt_preview_use',
        entity_id: 'case-1',
        session_id: 'session-1',
        cta_source: 'prompt_preview_use',
        metadata: {
          canonical_path: '/ai-image-prompts',
          caseId: 'case-1',
          caseSlug: 'product-shot',
          source: 'prompt_preview_use'
        }
      },
      {
        event_name: 'generation_task_succeeded',
        entity_id: 'task-1',
        session_id: 'session-1',
        cta_source: 'prompt_preview_use',
        metadata: {
          seo_attribution: {
            canonical_path: '/ai-image-prompts',
            case_id: 'case-1',
            case_slug: 'product-shot',
            source: 'prompt_preview_use'
          }
        }
      },
      {
        event_name: 'first_generation_succeeded',
        entity_id: 'task-1',
        session_id: 'session-1',
        cta_source: 'prompt_preview_use',
        metadata: {
          seo_attribution: {
            canonical_path: '/ai-image-prompts',
            case_id: 'case-1',
            case_slug: 'product-shot',
            source: 'prompt_preview_use'
          }
        }
      }
    ]);

    expect(funnel).toEqual([
      expect.objectContaining({
        canonicalPath: '/ai-image-prompts',
        caseId: 'case-1',
        source: 'prompt_preview',
        landingViews: 1,
        promptUses: 1,
        generationSucceeded: 1,
        firstGenerationSucceeded: 1,
        sessions: 1,
        viewToUseRate: 1,
        useToSuccessRate: 1,
        useToFirstSuccessRate: 1
      })
    ]);
  });

  it('joins prompt recipe use to the create-route task attribution', () => {
    const funnel = buildSeoConversionFunnel([
      {
        event_name: 'prompt_detail_use',
        entity_id: 'case-2',
        session_id: 'session-2',
        cta_source: 'prompt_detail_recipe_use',
        metadata: {
          canonical_path: '/en-US/prompts/product-shot',
          caseId: 'case-2',
          source: 'prompt_detail_recipe_use'
        }
      },
      {
        event_name: 'generation_task_succeeded',
        entity_id: 'task-2',
        session_id: 'session-2',
        cta_source: 'prompt_case_recipe',
        metadata: {
          seo_attribution: {
            canonical_path: '/en-US/prompts/product-shot',
            case_id: 'case-2',
            source: 'prompt_case_recipe'
          }
        }
      }
    ]);

    expect(funnel).toEqual([
      expect.objectContaining({
        canonicalPath: '/en-US/prompts/product-shot',
        caseId: 'case-2',
        source: 'prompt_case_recipe',
        promptUses: 1,
        generationSucceeded: 1,
        useToSuccessRate: 1
      })
    ]);
  });

  it('reports the originating blog CTA on terminal generation events', () => {
    const funnel = buildSeoConversionFunnel([
      {
        event_name: 'generation_task_succeeded',
        entity_id: 'task-blog-1',
        session_id: 'session-blog-1',
        cta_source: 'prompt_detail_use',
        metadata: {
          seo_attribution: {
            canonical_path: '/zh-CN/blog/product-image-ai-guide',
            case_id: 'case-product-1',
            case_slug: 'product-shot',
            source: 'prompt_detail_use',
            cluster: 'seo_blog',
            content_id: 'product-image-ai-guide',
            cta: 'seo_blog_product-image-ai-guide_use_template'
          }
        }
      }
    ]);

    expect(funnel).toEqual([
      expect.objectContaining({
        canonicalPath: '/zh-CN/blog/product-image-ai-guide',
        contentId: 'product-image-ai-guide',
        cluster: 'seo_blog',
        cta: 'seo_blog_product-image-ai-guide_use_template',
        generationSucceeded: 1
      })
    ]);
  });

  it('uses exact event counts while marking sampled failure categories', () => {
    const events: ConversionEventRow[] = [
      {
        event_name: 'generation_task_failed',
        cta_source: 'creator_sidebar',
        metadata: { failure_category: 'provider_timeout' }
      },
      {
        event_name: 'first_generation_succeeded',
        cta_source: 'creator_sidebar',
        user_id: 'user-1'
      },
      {
        event_name: 'post_purchase_generation_success',
        order_id: 'order-1'
      },
      {
        event_name: 'post_purchase_generation_success',
        order_id: 'order-1'
      }
    ];
    const orders: PaymentOrderRow[] = [
      { status: 'expired' },
      { status: 'succeeded' }
    ];

    const summary = buildConversionHealthSummary(events, orders, {
      generation_task_succeeded: 8,
      generation_task_failed: 4,
      first_generation_succeeded: 1,
      checkout_session_create_failed: 3,
      checkout_session_expired: 2,
      purchase_webhook_succeeded: 1,
      post_purchase_generation_success: 2
    });

    expect(summary.generation).toMatchObject({
      succeeded: 8,
      failed: 4,
      successRate: 0.6667,
      firstSucceeded: 1,
      firstSucceededUsers: 1,
      failureCategoriesAreSampled: true
    });
    expect(summary.checkout.sessionCreateFailedEvents).toBe(3);
    expect(summary.checkout.expiredEvents).toBe(2);
    expect(summary.checkout.expiredOrders).toBe(1);
    expect(summary.checkout.failedOrders).toBe(0);
    expect(summary.activationIntegrity).toMatchObject({
      activatedOrders: 2,
      activatedOrdersInSample: 1,
      activationEventsExceedPurchases: true
    });
    expect(summary.warnings[0]).toContain('invariant is violated');
  });

  it('builds source stages from durable events only', () => {
    expect(
      buildDurableSourceFunnel([
        { event_name: 'pricing_view', cta_source: 'seo_prompt' },
        { event_name: 'checkout_start', cta_source: 'seo_prompt' },
        {
          event_name: 'checkout_session_create_failed',
          cta_source: 'seo_prompt'
        },
        { event_name: 'checkout_session_expired', cta_source: 'seo_prompt' },
        {
          event_name: 'generation_task_succeeded',
          cta_source: 'seo_prompt'
        },
        { event_name: 'page_view', cta_source: 'seo_prompt' }
      ])
    ).toEqual([
      {
        ctaSource: 'seo_prompt',
        pricingViews: 1,
        checkoutStarts: 1,
        checkoutSessionCreateFailures: 1,
        purchases: 0,
        checkoutExpired: 1,
        generationSucceeded: 1,
        generationFailed: 0,
        firstGenerationSucceeded: 0
      }
    ]);
  });

  it('reconciles purchases to orders created before the report window', () => {
    const createdWithinWindow: PaymentOrderRow[] = [
      { id: 'order-new', status: 'pending' }
    ];
    const purchaseLinkedOrders: PaymentOrderRow[] = [
      { id: 'order-old', status: 'succeeded' },
      { id: 'order-new', status: 'succeeded' }
    ];
    const purchaseEvents: ConversionEventRow[] = [
      {
        event_name: 'purchase_webhook_succeeded',
        order_id: 'order-old'
      },
      {
        event_name: 'purchase_webhook_succeeded',
        order_id: 'order-new'
      }
    ];

    const merged = mergePaymentOrderRows(
      createdWithinWindow,
      purchaseLinkedOrders
    );
    const reconciliation = buildPurchaseOrderReconciliation(
      purchaseEvents,
      purchaseLinkedOrders,
      2
    );

    expect(merged.map((order) => order.id)).toEqual(['order-new', 'order-old']);
    expect(merged[0]?.status).toBe('succeeded');
    expect(reconciliation).toMatchObject({
      purchaseEvents: 2,
      uniqueOrderIds: 2,
      matchedOrders: 2,
      succeededOrders: 2,
      missingOrderIds: [],
      nonSucceededOrderIds: [],
      warnings: []
    });
  });
});
