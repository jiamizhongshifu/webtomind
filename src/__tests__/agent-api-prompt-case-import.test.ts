import { afterEach, describe, expect, it, vi } from 'vitest';

import { extractAdminPromptCaseDraftFromTweet } from '../services/agent-api';

describe('agent api prompt case import retries', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('retries one transient edge 503 and returns the extracted draft', async () => {
    vi.useFakeTimers();
    const draft = {
      title: 'Article prompt',
      category: 'fashion',
      tags: [],
      prompt: 'Complete prompt',
      imageUrls: ['https://example.com/cover.webp'],
      memberOnly: false,
      generationSettings: {}
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ draft }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const pending = extractAdminPromptCaseDraftFromTweet(
      'https://x.com/example/status/2084611444595978602'
    );
    await vi.advanceTimersByTimeAsync(600);

    await expect(pending).resolves.toMatchObject(draft);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces the edge request id after the bounded retry is exhausted', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Service unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', 'cf-ray': 'ray-test-2' }
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const pending = extractAdminPromptCaseDraftFromTweet(
      'https://x.com/example/status/2084611444595978602'
    );
    const assertion = expect(pending).rejects.toThrow('请求 ID：ray-test-2');
    await vi.advanceTimersByTimeAsync(600);

    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
