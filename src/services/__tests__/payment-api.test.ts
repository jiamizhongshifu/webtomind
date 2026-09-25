import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../workspace-api', () => ({
  getAccessToken: vi.fn().mockResolvedValue('test-token')
}));

describe('payment order verification', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('polls pending orders until the webhook marks them succeeded', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ order: { id: 'order-1', status: 'pending' } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ order: { id: 'order-1', status: 'processing' } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ order: { id: 'order-1', status: 'succeeded' } })
      });
    vi.stubGlobal('fetch', fetchMock);
    const wait = vi.fn().mockResolvedValue(undefined);
    const { waitForCheckoutOrderStatus } = await import('../payment-api');

    const order = await waitForCheckoutOrderStatus('order-1', {
      attempts: 4,
      intervalMs: 1,
      wait
    });

    expect(order.status).toBe('succeeded');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it('does not poll terminal failed orders', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ order: { id: 'order-2', status: 'failed' } })
    });
    vi.stubGlobal('fetch', fetchMock);
    const wait = vi.fn().mockResolvedValue(undefined);
    const { waitForCheckoutOrderStatus } = await import('../payment-api');

    const order = await waitForCheckoutOrderStatus('order-2', { wait });

    expect(order.status).toBe('failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it('does not poll terminal expired orders', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ order: { id: 'order-3', status: 'expired' } })
    });
    vi.stubGlobal('fetch', fetchMock);
    const wait = vi.fn().mockResolvedValue(undefined);
    const { waitForCheckoutOrderStatus } = await import('../payment-api');

    const order = await waitForCheckoutOrderStatus('order-3', { wait });

    expect(order.status).toBe('expired');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });
});

describe('checkout error handling', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('preserves the existing-subscription signal for billing portal recovery', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          error: 'Manage the existing subscription before changing plans',
          errorCode: 'ACTIVE_SUBSCRIPTION_EXISTS'
        })
      })
    );
    const { createCheckoutSession } = await import('../payment-api');

    await expect(
      createCheckoutSession({
        type: 'subscription',
        id: 'pro',
        billingCycle: 'yearly'
      })
    ).rejects.toMatchObject({
      name: 'ACTIVE_SUBSCRIPTION_EXISTS',
      message: 'Manage the existing subscription before changing plans'
    });
  });
});

describe('pending checkout intent', () => {
  afterEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('restores the exact product only on the original return path', async () => {
    const { consumePendingCheckoutIntent, savePendingCheckoutIntent } =
      await import('../payment-api');
    savePendingCheckoutIntent({
      type: 'subscription',
      id: 'pro',
      billingCycle: 'yearly',
      paymentProvider: 'alipay',
      returnPath: '/zh-CN/pricing?source=creator'
    });

    expect(
      consumePendingCheckoutIntent('/zh-CN/pricing?source=creator')
    ).toMatchObject({
      type: 'subscription',
      id: 'pro',
      billingCycle: 'yearly',
      paymentProvider: 'alipay'
    });
  });

  it('rejects mismatched and expired login returns', async () => {
    const now = 1_800_000_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);
    const { consumePendingCheckoutIntent, savePendingCheckoutIntent } =
      await import('../payment-api');
    savePendingCheckoutIntent({
      type: 'credit_package',
      id: 'pack_1k',
      returnPath: '/zh-CN/recharge'
    });
    expect(consumePendingCheckoutIntent('/zh-CN/pricing')).toBeNull();

    savePendingCheckoutIntent({
      type: 'credit_package',
      id: 'pack_1k',
      returnPath: '/zh-CN/recharge'
    });
    nowSpy.mockReturnValue(now + 16 * 60 * 1000);
    expect(consumePendingCheckoutIntent('/zh-CN/recharge')).toBeNull();
  });
});

describe('checkout redirect', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('submits ZPAY fields through an HTTPS POST form', async () => {
    const submit = vi
      .spyOn(HTMLFormElement.prototype, 'submit')
      .mockImplementation(() => undefined);
    const { redirectToCheckout } = await import('../payment-api');

    redirectToCheckout({
      id: 'order-1',
      url: 'https://zpayz.cn/submit.php',
      method: 'POST',
      paymentProvider: 'alipay',
      fields: {
        pid: 'merchant-test',
        money: '144.00',
        sign: 'signed'
      }
    });

    expect(submit).toHaveBeenCalledTimes(1);
    const form = submit.mock.instances[0] as HTMLFormElement;
    expect(form.method).toBe('post');
    expect(form.action).toBe('https://zpayz.cn/submit.php');
    expect(
      Array.from(form.querySelectorAll('input')).map((input) => [
        input.name,
        input.value
      ])
    ).toEqual([
      ['pid', 'merchant-test'],
      ['money', '144.00'],
      ['sign', 'signed']
    ]);
  });

  it('rejects POST redirects to an unexpected host', async () => {
    const { redirectToCheckout } = await import('../payment-api');
    expect(() =>
      redirectToCheckout({
        id: 'order-1',
        url: 'https://evil.example/submit.php',
        method: 'POST',
        fields: { pid: 'merchant-test' }
      })
    ).toThrow('Invalid payment redirect');
  });
});
