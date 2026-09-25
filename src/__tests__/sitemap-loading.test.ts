import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ range: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        order: () => query,
        range: mocks.range
      };
      return query;
    }
  })
}));
import { renderSitemapResponse } from '../../api/sitemap-render';
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  mocks.range.mockReset();
});
function configured() {
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_ANON_KEY', 'test-key');
}
describe('sitemap availability', () => {
  it('returns a noncacheable retryable error instead of a partial static sitemap', async () => {
    configured();
    mocks.range.mockResolvedValue({
      data: null,
      error: { message: 'database unavailable' },
      count: null
    });
    const response = await renderSitemapResponse(
      new Request('https://webtomind.com/sitemap.xml')
    );
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('retry-after')).toBe('300');
    expect(await response.text()).not.toContain('<urlset');
  });
  it('does not turn a timed out query into a successful empty sitemap', async () => {
    configured();
    vi.useFakeTimers();
    mocks.range.mockImplementation(() => new Promise(() => {}));
    const pending = renderSitemapResponse(
      new Request('https://webtomind.com/sitemap.xml')
    );
    await vi.advanceTimersByTimeAsync(20000);
    expect((await pending).status).toBe(503);
  });
});
