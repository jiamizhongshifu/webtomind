import { beforeEach, describe, expect, it, vi } from 'vitest';
import subscribeHandler from '../../api/marketing/subscribe';

const testState = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  upsert: vi.fn()
}));

vi.mock('../../api/marketing/email-worker-utils.js', () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        limit: () => query,
        maybeSingle: testState.maybeSingle,
        upsert: testState.upsert
      };
      return query;
    }
  })
}));

function postSubscribe(body: Record<string, unknown>) {
  return subscribeHandler(
    new Request('https://webtomind.test/api/marketing/subscribe', {
      method: 'POST',
      body: JSON.stringify(body)
    })
  );
}

describe('/api/marketing/subscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.maybeSingle.mockResolvedValue({ data: null, error: null });
    testState.upsert.mockResolvedValue({ error: null });
  });

  it('returns structured invalid email errors with no-store cache', async () => {
    const response = await postSubscribe({ email: 'bad-email' });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toMatchObject({
      ok: false,
      code: 'invalid_email'
    });
    expect(testState.upsert).not.toHaveBeenCalled();
  });

  it('subscribes a new email', async () => {
    const response = await postSubscribe({
      email: 'Creator@Example.com ',
      locale: 'zh-CN',
      source: 'home_hot_cases'
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toEqual({ ok: true, status: 'subscribed' });
    expect(testState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'creator@example.com',
        locale: 'zh-CN',
        case_digest_enabled: true,
        unsubscribed_at: null,
        source: 'home_hot_cases'
      }),
      { onConflict: 'email' }
    );
  });

  it('returns already_subscribed for active existing leads', async () => {
    testState.maybeSingle.mockResolvedValueOnce({
      data: {
        email: 'creator@example.com',
        case_digest_enabled: true,
        unsubscribed_at: null
      },
      error: null
    });

    const response = await postSubscribe({ email: 'creator@example.com' });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, status: 'already_subscribed' });
    expect(testState.upsert).not.toHaveBeenCalled();
  });
});
