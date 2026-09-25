import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPublicImagePromptAssets } from '../marketing-api';

describe('marketing api prompt assets', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests only the active recipe slot when one is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ assets: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await getPublicImagePromptAssets(200, 'character');

    expect(fetchMock).toHaveBeenCalledOnce();
    const requestedUrl = new URL(
      String(fetchMock.mock.calls[0]?.[0]),
      'https://webtomind.test'
    );
    expect(requestedUrl.pathname).toBe('/api/content/prompt-assets');
    expect(requestedUrl.searchParams.get('limit')).toBe('200');
    expect(requestedUrl.searchParams.get('slot')).toBe('character');
  });

});
