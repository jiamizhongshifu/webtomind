import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetAnalyticsQueueForTest,
  setAnalyticsCollectionEnabled,
  trackPricingView
} from '../../lib/analytics';
import {
  AnalyticsConsentGate,
  isPublicAnalyticsRoute
} from '../AnalyticsConsentGate';


function mockGtmDataLayer() {
  const pushed: unknown[] = [];
  const dataLayer: unknown[] = [];
  const rawPush = dataLayer.push.bind(dataLayer);
  dataLayer.push = function push(...items: unknown[]) {
    for (const item of items) {
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
  rawPush({ event: 'gtm.dom' });
  rawPush({ event: 'gtm.load' });
  window.dataLayer = dataLayer as unknown as unknown[];
  return { pushed, dataLayer };
}

const analyticsHostState = vi.hoisted(() => ({
  isProduction: true
}));

vi.mock('../../lib/analytics-host', () => ({
  isProductionAnalyticsHost: () => analyticsHostState.isProduction
}));

describe('AnalyticsConsentGate', () => {
  beforeEach(() => {
    analyticsHostState.isProduction = true;
    window.localStorage.clear();
    document
      .querySelectorAll('script[data-webtomind-gtag]')
      .forEach((node) => node.remove());
    window.gtag = undefined;
    window.dataLayer = undefined;
    window.clarity = undefined;
    resetAnalyticsQueueForTest();
  });

  it('enables anonymous analytics for core creation flows', async () => {
    expect(isPublicAnalyticsRoute('/create/image')).toBe(true);
    expect(isPublicAnalyticsRoute('/zh-CN/create/gallery')).toBe(true);

    render(
      <MemoryRouter initialEntries={['/create/image']}>
        <AnalyticsConsentGate />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('complementary', { name: '匿名统计' })
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(window.dataLayer).toBeDefined();
    });
  });

  it('loads analytics by default on public pages until the user declines', async () => {
    render(
      <MemoryRouter initialEntries={['/zh-CN/prompts']}>
        <AnalyticsConsentGate />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('complementary', { name: '匿名统计' })
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(window.dataLayer).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: '停用' }));

    expect(window.localStorage.getItem('webtomind:analytics-consent:v1')).toBe(
      'denied'
    );
  });

  it('keeps the English consent choice concise and explicit', () => {
    render(
      <MemoryRouter initialEntries={['/en-US/prompts']}>
        <AnalyticsConsentGate />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('complementary', { name: 'Anonymous analytics' })
    ).toHaveTextContent(
      'Helps us improve. You can turn it off anytime without affecting access.'
    );
    expect(
      screen.getByRole('link', { name: 'Privacy details' })
    ).toHaveAttribute('href', '/en-US/privacy');
    expect(
      screen.getByRole('button', { name: 'Turn off' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument();
  });

  it('does not load analytics when the stored preference is denied', () => {
    window.localStorage.setItem('webtomind:analytics-consent:v1', 'denied');

    render(
      <MemoryRouter initialEntries={['/zh-CN/prompts']}>
        <AnalyticsConsentGate />
      </MemoryRouter>
    );

    expect(
      screen.queryByRole('complementary', { name: '匿名统计' })
    ).not.toBeInTheDocument();
    expect(document.querySelector('script[data-webtomind-gtag]')).toBeNull();
  });

  it('does not load analytics outside the production hostname', () => {
    analyticsHostState.isProduction = false;

    render(
      <MemoryRouter initialEntries={['/zh-CN/prompts']}>
        <AnalyticsConsentGate />
      </MemoryRouter>
    );

    expect(
      screen.queryByRole('complementary', { name: '匿名统计' })
    ).not.toBeInTheDocument();
    expect(document.querySelector('script[data-webtomind-gtag]')).toBeNull();
  });

  it('mirrors the site preference to Clarity consent mode', async () => {
    const clarity = vi.fn();
    window.clarity = clarity;

    render(
      <MemoryRouter initialEntries={['/zh-CN/prompts']}>
        <AnalyticsConsentGate />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(clarity).toHaveBeenCalledWith('consentv2', {
        ad_Storage: 'denied',
        analytics_Storage: 'denied'
      });
    });

    fireEvent.click(screen.getByRole('button', { name: '知道了' }));

    expect(clarity).toHaveBeenLastCalledWith('consentv2', {
      ad_Storage: 'granted',
      analytics_Storage: 'granted'
    });
  });

  it('uses a canonical page path without query or hash fragmentation', async () => {
    const { pushed } = mockGtmDataLayer();

    render(
      <MemoryRouter
        initialEntries={[
          '/zh-CN/create/pricing?source=creator_sidebar#credit-usage'
        ]}
      >
        <AnalyticsConsentGate />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(pushed).toContainEqual(
        expect.objectContaining({
          event: 'page_view',
          page_path: '/zh-CN/create/pricing'
        })
      );
    });
  });

  it('sends the landing page before a first-render event', async () => {
    // GTM 未就绪：pricing_view 入队
    window.dataLayer = [];
    setAnalyticsCollectionEnabled(true);
    trackPricingView(
      'creator_sidebar',
      {},
      'first-render:/zh-CN/create/pricing:gate-order'
    );

    const { pushed } = mockGtmDataLayer();

    render(
      <MemoryRouter initialEntries={['/zh-CN/create/pricing']}>
        <AnalyticsConsentGate />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        pushed
          .map((entry) => (entry as { event?: string }).event)
          .filter(Boolean)
      ).toEqual(['page_view', 'pricing_view']);
    });
  });

  it('does not duplicate the current page view when consent is confirmed', async () => {
    const { pushed } = mockGtmDataLayer();

    render(
      <MemoryRouter initialEntries={['/zh-CN/create/pricing']}>
        <AnalyticsConsentGate />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        pushed.filter(
          (entry) => (entry as { event?: string }).event === 'page_view'
        )
      ).toHaveLength(1);
    });

    fireEvent.click(screen.getByRole('button', { name: '知道了' }));

    expect(window.localStorage.getItem('webtomind:analytics-consent:v1')).toBe(
      'granted'
    );

    await waitFor(() => {
      expect(
        pushed.filter(
          (entry) => (entry as { event?: string }).event === 'page_view'
        )
      ).toHaveLength(1);
    });
  });
});
