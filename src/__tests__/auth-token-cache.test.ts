import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { getUser } }) }));

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(100_000);
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_ANON_KEY', 'test');
  getUser.mockReset().mockResolvedValue({ data: { user: { id: 'user' } }, error: null });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it('evicts the least recently used token when the cache is full', async () => {
  const { verifyTokenAndGetUserId } = await import('../../api/utils/auth');
  for (let i = 0; i < 1000; i++) await verifyTokenAndGetUserId(`test-token-${i}`);
  await verifyTokenAndGetUserId('test-token-0');
  expect(getUser).toHaveBeenCalledTimes(1000);
  await verifyTokenAndGetUserId('test-token-new');
  await verifyTokenAndGetUserId('test-token-0');
  expect(getUser).toHaveBeenCalledTimes(1001);
  await verifyTokenAndGetUserId('test-token-1');
  expect(getUser).toHaveBeenCalledTimes(1002);
});

it('never extends JWT expiry when a cache entry is reused', async () => {
  const { verifyTokenAndGetUserId } = await import('../../api/utils/auth');
  const token = `header.${btoa(JSON.stringify({ exp: 101 }))}.signature`;
  expect(await verifyTokenAndGetUserId(token)).toBe('user');
  vi.setSystemTime(100_500);
  expect(await verifyTokenAndGetUserId(token)).toBe('user');
  expect(getUser).toHaveBeenCalledTimes(1);
  getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'Expired token' } });
  vi.setSystemTime(101_000);
  expect(await verifyTokenAndGetUserId(token)).toBeNull();
  expect(getUser).toHaveBeenCalledTimes(2);
});
