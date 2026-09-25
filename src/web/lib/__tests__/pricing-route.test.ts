import { describe, expect, it } from 'vitest';
import {
  getPricingLocalePrefix,
  getWorkspacePricingHref
} from '../pricing-route';

describe('workspace pricing route', () => {
  it('maps the legacy Chinese pricing page to the creator workspace URL', () => {
    expect(
      getWorkspacePricingHref(getPricingLocalePrefix('/zh-CN/pricing'))
    ).toBe(
      '/zh-CN/create/pricing?source=creator_sidebar&returnTo=%2Fzh-CN%2Fcreate'
    );
  });

  it('maps root and English pricing routes to their localized workspaces', () => {
    expect(getWorkspacePricingHref(getPricingLocalePrefix('/pricing'))).toBe(
      '/create/pricing?source=creator_sidebar&returnTo=%2Fcreate'
    );
    expect(
      getWorkspacePricingHref(getPricingLocalePrefix('/en-US/pricing'))
    ).toBe(
      '/en-US/create/pricing?source=creator_sidebar&returnTo=%2Fen-US%2Fcreate'
    );
  });

  it('preserves payment-return parameters from in-flight legacy checkouts', () => {
    const href = getWorkspacePricingHref(
      '/zh-CN',
      '?payment=success&orderId=order_123&source=checkout&returnTo=%2Fzh-CN%2Fcreate%2Fimage'
    );
    expect(href).toContain('/zh-CN/create/pricing?');
    expect(href).toContain('payment=success');
    expect(href).toContain('orderId=order_123');
    expect(href).toContain('source=checkout');
    expect(href).toContain('returnTo=%2Fzh-CN%2Fcreate%2Fimage');
  });

  it('keeps the creator destination when hopping from recharge to pricing', () => {
    const href = getWorkspacePricingHref(
      '/zh-CN',
      '?returnTo=%2Fzh-CN%2Fcreate%2Fimage'
    );
    expect(href.startsWith('/zh-CN/create/pricing?')).toBe(true);
    expect(href).toContain('source=creator_sidebar');
    expect(href).toContain('returnTo=%2Fzh-CN%2Fcreate%2Fimage');
  });
});
