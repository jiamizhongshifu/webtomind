import { describe, expect, it } from 'vitest';
import {
  collapsePaywallReturnTo,
  isPaywallPath,
  unwrapPaywallReturnTo
} from '../paywall-return-to';

describe('paywall returnTo contract', () => {
  it('recognizes pricing and recharge paths with any locale', () => {
    expect(isPaywallPath('/zh-CN/pricing')).toBe(true);
    expect(isPaywallPath('/en-US/create/pricing')).toBe(true);
    expect(isPaywallPath('/pricing')).toBe(true);
    expect(isPaywallPath('/zh-CN/recharge')).toBe(true);
    expect(isPaywallPath('/recharge/')).toBe(true);
    expect(isPaywallPath('/create/image')).toBe(false);
    expect(isPaywallPath('/zh-CN/create/image')).toBe(false);
    expect(isPaywallPath('/zh-CN/boards')).toBe(false);
  });

  it('collapses the recharge self-nesting URL to the original destination', () => {
    const result = collapsePaywallReturnTo(
      '/zh-CN/recharge',
      '?source=creator_account_menu&returnTo=%2Fzh-CN%2Frecharge%3Fsource%3Dcreator_account_menu%26returnTo%3D%252Fzh-CN%252Fcreate%252Fimage'
    );

    expect(result).toBe('/zh-CN/create/image');
  });

  it('collapses the pricing -> recharge -> create chain to one hop', () => {
    const result = collapsePaywallReturnTo(
      '/zh-CN/create/pricing',
      '?source=creator_sidebar&returnTo=%2Fzh-CN%2Frecharge%3Fsource%3Dcreator_account_menu%26returnTo%3D%252Fzh-CN%252Fcreate%252Fimage'
    );

    expect(result).toBe('/zh-CN/create/image');
  });

  it('keeps a single-hop returnTo as-is', () => {
    const result = collapsePaywallReturnTo(
      '/zh-CN/recharge',
      '?source=creator_account_menu&returnTo=%2Fzh-CN%2Fcreate%2Fimage'
    );

    expect(result).toBe('/zh-CN/create/image');
  });

  it('preserves the current page on non-paywall routes', () => {
    const result = collapsePaywallReturnTo(
      '/en-US/create/image',
      '?model=nano-banana-pro',
      '#prompt'
    );

    expect(result).toBe('/en-US/create/image?model=nano-banana-pro#prompt');
  });

  it('falls back to the locale create page when a paywall URL has no usable returnTo', () => {
    expect(collapsePaywallReturnTo('/zh-CN/pricing', '?source=x')).toBe(
      '/zh-CN/create'
    );
    expect(
      collapsePaywallReturnTo('/zh-CN/pricing', '?source=x', '', '/zh-CN/create/image')
    ).toBe('/zh-CN/create/image');
    expect(
      collapsePaywallReturnTo('/pricing', '?source=x', '', '/create/image')
    ).toBe('/create/image');
  });

  it('rejects cross-origin and protocol-relative values', () => {
    expect(unwrapPaywallReturnTo('https://evil.example/steal')).toBeNull();
    expect(unwrapPaywallReturnTo('//evil.example/steal')).toBeNull();
  });

  it('bails on endless self-referencing chains', () => {
    const selfLink = `/pricing?returnTo=${encodeURIComponent(
      '/pricing?returnTo=%2Fpricing'
    )}`;
    expect(unwrapPaywallReturnTo(selfLink)).toBeNull();
  });
});
