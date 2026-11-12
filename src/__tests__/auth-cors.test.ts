import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCorsHeadersForRequest } from '../../api/utils/auth';

afterEach(() => vi.unstubAllEnvs());

describe('development CORS origins', () => {
  const allowedOrigin = (origin: string) =>
    getCorsHeadersForRequest(new Request('https://webtomind.test/api/config', {
      headers: { Origin: origin }
    }))['Access-Control-Allow-Origin'];

  it.each(['http://localhost:5173', 'http://127.0.0.1:4173', 'http://[::1]:5173'])(
    'allows loopback origin %s', (origin) => {
      vi.stubEnv('NODE_ENV', 'development');
      expect(allowedOrigin(origin)).toBe(origin);
    }
  );

  it.each(['https://localhost.evil.test', 'https://evil-127.0.0.1.test', 'https://evil.test/localhost', 'ftp://localhost'])(
    'does not reflect non-loopback origin %s', (origin) => {
      vi.stubEnv('NODE_ENV', 'development');
      expect(allowedOrigin(origin)).not.toBe(origin);
    }
  );

  it('does not implicitly allow localhost in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(allowedOrigin('http://localhost:5173')).not.toBe('http://localhost:5173');
  });
});
