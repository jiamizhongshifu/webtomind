import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getAnalyticsSessionId,
  initializeAnalyticsPageView,
  loadGoogleAnalytics,
  normalizeAnalyticsPageLocation,
  normalizeEventParams,
  resetAnalyticsQueueForTest,
  setAnalyticsCollectionEnabled,
  shouldIgnoreTrustedWorkflowReferrer,
  trackImageGenerationEvent,
  trackPageView,
  trackPricingView,
  trackPurchase,
  updateAnalyticsConsent
} from '../analytics';
import { ANALYTICS_TEST_RUN_STORAGE_KEY } from '../analytics-test-context';

/**
 * 模拟 GTM 容器接管 dataLayer：push 被替换为自定义函数（非原生），
 * isGtmDataLayerReady() 据此判定 GTM 就绪。记录所有 push 的对象事件。
 */
function mockGtmDataLayer() {
  const pushed: unknown[] = [];
  const dataLayer: unknown[] = [];
  const rawPush = dataLayer.push.bind(dataLayer);
  dataLayer.push = function push(...items: unknown[]) {
    for (const item of items) {
      // GTM 内部事件（gtm.*）模拟容器自身处理，不进应用事件记录
      if (
        item &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        (item as { event?: string }).event?.startsWith('gtm.')
      ) {
        rawPush(item);
        continue;
      }
      pushed.push(item);
      rawPush(item);
    }
    return dataLayer.length;
  };
  // 模拟 GTM 容器配置初始化完成
  rawPush({ event: 'gtm.dom' });
  rawPush({ event: 'gtm.load' });
  window.dataLayer = dataLayer as unknown as unknown[];
  return { pushed, dataLayer };
}

describe('analytics event normalization', () => {
  it('renames reserved GA attribution params while preserving utm params', () => {
    expect(
      normalizeEventParams({
        source: 'pricing_page',
        medium: 'prompt_cases_panel',
        campaign: 'create_prompt_share_route',
        term: 'ai image prompts',
        content: 'hero_cta',
        utm_source: 'x',
        utm_medium: 'social',
        utm_campaign: 'prompt_case_launch'
      })
    ).toEqual({
      cta_source: 'pricing_page',
      cta_medium: 'prompt_cases_panel',
      cta_campaign: 'create_prompt_share_route',
      cta_term: 'ai image prompts',
      cta_content: 'hero_cta',
      utm_source: 'x',
      utm_medium: 'social',
      utm_campaign: 'prompt_case_launch'
    });
  });

  it('keeps acquisition parameters but removes internal landing-page state', () => {
    expect(
      normalizeAnalyticsPageLocation(
        'https://webtomind.com/zh-CN/prompts?caseId=case-1?caseId=case-1&label=portrait&utm_source=google&utm_campaign=portraits#case'
      )
    ).toBe(
      'https://webtomind.com/zh-CN/prompts?utm_source=google&utm_campaign=portraits'
    );
  });

  it('ignores only trusted auth and payment workflow referrers', () => {
    expect(
      shouldIgnoreTrustedWorkflowReferrer(
        'https://accounts.google.com/o/oauth2/auth'
      )
    ).toBe(true);
    expect(
      shouldIgnoreTrustedWorkflowReferrer(
        'https://checkout.stripe.com/c/pay/example'
      )
    ).toBe(true);
    expect(
      shouldIgnoreTrustedWorkflowReferrer(
        'https://www.google.com/search?q=webtomind'
      )
    ).toBe(false);
    expect(shouldIgnoreTrustedWorkflowReferrer('not-a-url')).toBe(false);
  });
});

describe('analytics pending queue (GTM dataLayer)', () => {
  afterEach(() => {
    resetAnalyticsQueueForTest();
    vi.useRealTimers();
    delete window.gtag;
    window.dataLayer = undefined;
    window.sessionStorage.clear();
    window.localStorage.removeItem(ANALYTICS_TEST_RUN_STORAGE_KEY);
    document.querySelector('script[data-webtomind-gtag]')?.remove();
  });

  it('queues first-render pricing events until GTM dataLayer is ready', () => {
    vi.useFakeTimers();
    // GTM 未就绪：dataLayer.push 是原生数组方法
    window.dataLayer = [];

    trackPricingView(
      'creator_sidebar',
      {},
      'first-render:/create/pricing'
    );

    expect(window.dataLayer).toHaveLength(0);

    // GTM 接管后 flush 待发事件
    const { pushed } = mockGtmDataLayer();
    setAnalyticsCollectionEnabled(true);

    expect(pushed).toContainEqual(
      expect.objectContaining({
        event: 'pricing_view',
        cta_source: 'creator_sidebar'
      })
    );
  });

  it('initializes the dataLayer for GTM without injecting gtag.js', () => {
    setAnalyticsCollectionEnabled(true);
    loadGoogleAnalytics();

    expect(window.dataLayer).toBeDefined();
    expect(
      document.querySelector('script[data-webtomind-gtag]')
    ).toBeNull();
  });

  it('sends the landing page view as a dataLayer object event', () => {
    const { pushed } = mockGtmDataLayer();
    setAnalyticsCollectionEnabled(true);

    initializeAnalyticsPageView({
      path: '/zh-CN/create/pricing',
      location:
        'https://webtomind.com/zh-CN/create/pricing?source=creator_sidebar',
      title: 'Pricing'
    });

    expect(pushed).toContainEqual(
      expect.objectContaining({
        event: 'page_view',
        page_path: '/zh-CN/create/pricing'
      })
    );
  });

  it('queues page views until the GTM dataLayer is ready, then flushes them', () => {
    vi.useFakeTimers();
    window.dataLayer = [];
    setAnalyticsCollectionEnabled(true);

    trackPageView({
      path: '/ai-image-prompts',
      location: 'https://webtomind.com/ai-image-prompts',
      title: 'AI Image Prompts Library | WebToMind'
    });

    expect(window.dataLayer).toHaveLength(0);

    const { pushed } = mockGtmDataLayer();
    vi.advanceTimersByTime(250);

    expect(pushed).toContainEqual(
      expect.objectContaining({
        event: 'page_view',
        page_path: '/ai-image-prompts',
        page_location: 'https://webtomind.com/ai-image-prompts',
        page_title: 'AI Image Prompts Library | WebToMind'
      })
    );
  });

  it('drops page views while analytics consent is disabled', () => {
    vi.useFakeTimers();
    const { pushed } = mockGtmDataLayer();

    trackPageView({
      path: '/create/image',
      location: 'https://webtomind.com/create/image',
      title: 'Create'
    });

    vi.advanceTimersByTime(1000);

    expect(pushed).toHaveLength(0);
  });

  it('keeps one stable analytics id for the current browser session', () => {
    const first = getAnalyticsSessionId();
    const second = getAnalyticsSessionId();

    expect(first).toBeTruthy();
    expect(second).toBe(first);
  });

  it('deduplicates a pricing view by its explicit session key', () => {
    const { pushed } = mockGtmDataLayer();
    setAnalyticsCollectionEnabled(true);

    trackPricingView(
      'creator_sidebar',
      {},
      'session:/create/pricing:creator_sidebar'
    );
    trackPricingView(
      'creator_sidebar',
      {},
      'session:/create/pricing:creator_sidebar'
    );

    expect(
      pushed.filter((entry) => (entry as { event?: string }).event === 'pricing_view')
    ).toHaveLength(1);
  });

  it('deduplicates generation terminal events by event and task id', () => {
    const { pushed } = mockGtmDataLayer();
    setAnalyticsCollectionEnabled(true);

    trackImageGenerationEvent('generation_cancelled', {
      task_id: 'task-123',
      model: 'gpt-image-2'
    });
    trackImageGenerationEvent('generation_cancelled', {
      task_id: 'task-123',
      model: 'gpt-image-2'
    });
    trackImageGenerationEvent('generation_cancelled', {
      task_id: 'task-456',
      model: 'gpt-image-2'
    });

    expect(
      pushed.filter(
        (entry) =>
          (entry as { event?: string }).event === 'generation_cancelled'
      )
    ).toHaveLength(2);
  });

  it('does not deduplicate non-terminal generation events', () => {
    const { pushed } = mockGtmDataLayer();
    setAnalyticsCollectionEnabled(true);

    trackImageGenerationEvent('generation_queued', {
      task_id: 'task-123'
    });
    trackImageGenerationEvent('generation_queued', {
      task_id: 'task-123'
    });

    expect(
      pushed.filter(
        (entry) =>
          (entry as { event?: string }).event === 'generation_queued'
      )
    ).toHaveLength(2);
  });

  it('reports one GA purchase for a transaction id', () => {
    const { pushed } = mockGtmDataLayer();
    setAnalyticsCollectionEnabled(true);

    const purchase = {
      transactionId: 'checkout-123',
      value: 12,
      currency: 'USD',
      checkoutType: 'subscription' as const,
      productId: 'pro'
    };
    trackPurchase(purchase);
    trackPurchase(purchase);

    const purchases = pushed.filter(
      (entry) => (entry as { event?: string }).event === 'purchase'
    );
    expect(purchases).toHaveLength(1);
    expect(purchases[0]).toEqual(
      expect.objectContaining({ transaction_id: 'checkout-123' })
    );
  });

  it('marks automation traffic so it can be excluded from formal funnels', () => {
    const { pushed } = mockGtmDataLayer();
    window.localStorage.setItem(
      ANALYTICS_TEST_RUN_STORAGE_KEY,
      'ui-audit-20260723'
    );
    setAnalyticsCollectionEnabled(true);

    trackPageView({
      path: '/zh-CN/prompts',
      location: 'https://webtomind.com/zh-CN/prompts',
      title: 'Prompts'
    });

    expect(pushed).toContainEqual(
      expect.objectContaining({
        event: 'page_view',
        traffic_type: 'internal_test',
        test_run_id: 'ui-audit-20260723'
      })
    );
  });
});

describe('analytics consent sync', () => {
  it('updates gtag consent to granted when a gtag function exists', () => {
    const gtag = vi.fn();
    window.gtag = gtag as unknown as Window['gtag'];

    updateAnalyticsConsent('granted');

    expect(gtag).toHaveBeenCalledWith('consent', 'update', {
      ad_storage: 'granted',
      analytics_storage: 'granted'
    });
  });

  it('updates gtag consent to denied when disabled', () => {
    const gtag = vi.fn();
    window.gtag = gtag as unknown as Window['gtag'];

    updateAnalyticsConsent('denied');

    expect(gtag).toHaveBeenCalledWith('consent', 'update', {
      ad_storage: 'denied',
      analytics_storage: 'denied'
    });
  });

  it('queues the consent command on the dataLayer when gtag is absent', () => {
    window.gtag = undefined;
    window.dataLayer = [];

    updateAnalyticsConsent('granted');

    const entries = (window.dataLayer || []).map((entry) =>
      Array.from(entry as unknown as unknown[])
    );
    expect(entries).toContainEqual([
      'consent',
      'update',
      { ad_storage: 'granted', analytics_storage: 'granted' }
    ]);
  });
});
