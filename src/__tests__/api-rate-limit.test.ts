import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(100_000); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('API fixed-window rate limit', () => {
  it('starts a fresh in-memory window exactly at the expiry boundary', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    const { checkRateLimit } = await import('../../api/utils/rate-limit');
    for (let i = 0; i < 60; i++) expect((await checkRateLimit('memory')).allowed).toBe(true);
    vi.setSystemTime(130_000);
    expect((await checkRateLimit('memory')).allowed).toBe(false);
    vi.setSystemTime(160_000);
    expect(await checkRateLimit('memory')).toEqual({ allowed: true, remaining: 59 });
  });

  it('does not extend Redis expiry when blocked clients retry', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test');
    // Model Redis command semantics, including PEXPIRE's optional NX flag.
    let count = 0;
    let expiresAt: number | null = null;
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      if (expiresAt !== null && Date.now() >= expiresAt) { count = 0; expiresAt = null; }
      const commands = JSON.parse(String(init.body)) as Array<Array<string | number>>;
      return Response.json(commands.map(([command, , duration, option]) => {
        if (command === 'INCR') return { result: ++count };
        if (command === 'PEXPIRE') {
          if (option === 'NX' && expiresAt !== null) return { result: 0 };
          expiresAt = Date.now() + Number(duration);
          return { result: 1 };
        }
        throw new Error(`Unexpected Redis command ${command}`);
      }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const { checkRateLimit } = await import('../../api/utils/rate-limit');
    for (let i = 0; i < 60; i++) expect((await checkRateLimit('redis')).allowed).toBe(true);
    vi.setSystemTime(159_000);
    expect((await checkRateLimit('redis')).allowed).toBe(false);
    vi.setSystemTime(160_000);
    expect(await checkRateLimit('redis')).toEqual({ allowed: true, remaining: 59 });
    expect(fetchMock.mock.calls[0][0]).toBe('https://redis.test/multi-exec');
  });

  it('falls back to the memory limit on partial Redis command errors', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test');
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([{ result: 999 }, { error: 'ERR denied' }])));
    const { checkRateLimit } = await import('../../api/utils/rate-limit');
    expect(await checkRateLimit('fallback')).toEqual({ allowed: true, remaining: 59 });
  });
});
