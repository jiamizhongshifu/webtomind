import { afterEach, describe, expect, it, vi } from 'vitest';
import catalog from '../../api/api-marketplace/catalog';
import keys from '../../api/api-marketplace/keys';
import keyFund from '../../api/api-marketplace/key-fund';
import wallet from '../../api/api-marketplace/wallet';
import packages from '../../api/api-marketplace/packages';
import usage from '../../api/api-marketplace/usage';
import gateway from '../../api/api-marketplace/gateway';
import checkout from '../../api/membership/checkout';
import worker from '../../workers/webtomind';

afterEach(() => vi.restoreAllMocks());

const managementHandlers = [
  ['catalog', catalog],
  ['keys', keys],
  ['keys/fund', keyFund],
  ['wallet', wallet],
  ['packages', packages],
  ['usage', usage]
] as const;

describe('retired API business request boundaries', () => {
  it.each(managementHandlers)(
    'closes the standalone %s handler before any network access',
    async (path, handler) => {
      const fetch = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('Unexpected network access'));
      for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
        const response = await handler(
          new Request(`https://webtomind.com/api/api-marketplace/${path}`, {
            method
          })
        );
        expect(response.status).toBe(410);
        expect(await response.json()).toMatchObject({
          errorCode: 'API_MARKETPLACE_RETIRED'
        });
        expect(response.headers.get('cache-control')).toBe('no-store');
      }
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it.each(['/v1/models', '/v1/chat/completions', '/v1/images/generations'])(
    'closes the standalone gateway for %s',
    async (path) => {
      const fetch = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('Unexpected upstream call'));
      const response = await gateway(
        new Request(`https://webtomind.com${path}`, { method: 'POST' })
      );
      expect(response.status).toBe(410);
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it.each([
    '/v1',
    '/v1/models',
    '/v1/chat/completions',
    '/v1/videos',
    '/api/api-marketplace',
    '/api/api-marketplace/keys',
    '/api/api-marketplace/keys/fund',
    '/api/api-marketplace/packages',
    '/api/api-marketplace/unknown'
  ])('returns 410 from the deployed Worker boundary for %s', async (path) => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected fallback/upstream call'));
    const assets = vi.fn(() => {
      throw new Error('Retired API must not fall back to the app shell');
    });
    const response = await worker.fetch(
      new Request(`https://webtomind.com${path}`, {
        method: 'POST',
        headers: { authorization: 'Bearer stale-api-key' }
      }),
      { CANONICAL_HOST: 'webtomind.com', ASSETS: { fetch: assets } } as never,
      { waitUntil: () => undefined } as never
    );
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({
      errorCode: 'API_MARKETPLACE_RETIRED'
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(assets).not.toHaveBeenCalled();
  });

  it.each(['stripe', 'alipay'])(
    'rejects API package and custom recharge through %s before database or payment access',
    async (paymentProvider) => {
      const fetch = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('Unexpected payment request'));
      for (const id of ['api_cny_10', 'custom']) {
        const response = await checkout(
          new Request('https://webtomind.com/api/membership/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'api_credit_package',
              id,
              paymentProvider,
              customAmountUsdCents: 1000
            })
          })
        );
        expect(response.status).toBe(410);
        expect(await response.json()).toMatchObject({
          errorCode: 'API_MARKETPLACE_RETIRED'
        });
      }
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it('keeps CORS preflight available without opening business operations', async () => {
    const response = await gateway(
      new Request('https://webtomind.com/v1/models', {
        method: 'OPTIONS',
        headers: { Origin: 'https://webtomind.com' }
      })
    );
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'https://webtomind.com'
    );
  });
});
