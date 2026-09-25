import { describe, expect, it } from 'vitest';
import { isProductionAnalyticsHost } from '../analytics-host';

describe('isProductionAnalyticsHost', () => {
  it.each(['webtomind.com', 'www.webtomind.com', 'WEBTOMIND.COM'])(
    'allows the production host %s',
    (hostname) => {
      expect(isProductionAnalyticsHost(hostname)).toBe(true);
    }
  );

  it.each([
    'localhost',
    '127.0.0.1',
    'codex-dev.webtomind.com',
    'webtomind.com.localhost',
    'evilwebtomind.com'
  ])('rejects the non-production host %s', (hostname) => {
    expect(isProductionAnalyticsHost(hostname)).toBe(false);
  });
});
