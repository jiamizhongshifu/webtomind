import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getApiBaseUrl,
  isE2EAuthBypassEnabled,
  isLoopbackHostname
} from '../env';

describe('environment host detection', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(['localhost', '127.0.0.1', '::1'])(
    'recognizes %s as a local preview host',
    (hostname) => {
      expect(isLoopbackHostname(hostname)).toBe(true);
    }
  );

  it.each(['webtomind.ai', 'app.webtomind.ai', '127.0.0.2'])(
    'does not treat %s as loopback',
    (hostname) => {
      expect(isLoopbackHostname(hostname)).toBe(false);
    }
  );

  it('uses the browser origin for same-origin local Worker APIs', () => {
    expect(getApiBaseUrl()).toBe(window.location.origin);
  });

  it('allows the E2E auth bypass only on loopback origins', () => {
    vi.stubEnv('VITE_E2E_BYPASS_AUTH', '1');

    expect(isE2EAuthBypassEnabled('127.0.0.1')).toBe(true);
    expect(isE2EAuthBypassEnabled('localhost')).toBe(true);
    expect(isE2EAuthBypassEnabled('webtomind.com')).toBe(false);
  });

  it('does not bypass authentication without the explicit E2E flag', () => {
    vi.stubEnv('VITE_E2E_BYPASS_AUTH', '0');
    expect(isE2EAuthBypassEnabled('127.0.0.1')).toBe(false);
  });
});
