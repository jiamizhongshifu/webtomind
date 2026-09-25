import { afterEach, describe, expect, it, vi } from 'vitest';

describe('GPT Image 2 denoise API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('shows the server message instead of exposing a machine error code', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      json: async () => ({
        error: 'INSUFFICIENT_CREDITS',
        message: '可用积分不足，云端降噪固定消耗 115 积分。',
        details: { required: 115, current: 0 }
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    const { enqueueGptImage2Denoise, setAuthToken } =
      await import('../agent-api');
    setAuthToken('test-token');

    await expect(
      enqueueGptImage2Denoise({
        referenceId: 'reference-id',
        strength: 'strong',
        outputFormat: 'png',
        sourceWidth: 1728,
        sourceHeight: 2304
      })
    ).rejects.toThrow('可用积分不足，云端降噪固定消耗 115 积分。');

    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    ).toMatchObject({
      sourceWidth: 1728,
      sourceHeight: 2304
    });
  });
});
