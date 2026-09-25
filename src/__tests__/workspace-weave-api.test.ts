import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken, weaveCards } from '@/services/workspace-api';

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('workspace weaveCards API client', () => {
  beforeEach(() => {
    setAccessToken(null);
    vi.restoreAllMocks();
  });

  it('does not pre-consume weaving quota by default', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const href = String(url);
      if (href.endsWith('/api/workspace/cards/weave')) {
        return jsonResponse({
          success: true,
          wovenText: '过渡段',
          card: null,
          model: {
            requestedModel: 'model-a',
            resolvedModel: 'model-a',
            fallbackUsed: false
          },
          insertPosition: 1
        });
      }
      return jsonResponse({ error: 'unexpected request' }, { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await weaveCards({
      projectId: 'project-1',
      cardIds: ['card-1', 'card-2'],
      saveCard: true
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/api/workspace/cards/weave'
    );
  });

  it('only pre-consumes weaving quota when explicitly requested', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const href = String(url);
      if (href.endsWith('/api/credits/weaving-quota')) {
        return jsonResponse({
          success: true,
          isMember: false,
          used: 1,
          max: 5
        });
      }
      if (href.endsWith('/api/workspace/cards/weave')) {
        return jsonResponse({
          success: true,
          wovenText: '过渡段',
          card: null,
          model: {
            requestedModel: 'model-a',
            resolvedModel: 'model-a',
            fallbackUsed: false
          },
          insertPosition: 1
        });
      }
      return jsonResponse({ error: 'unexpected request' }, { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await weaveCards({
      projectId: 'project-1',
      cardIds: ['card-1', 'card-2'],
      saveCard: true,
      consumeQuota: true
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/api/credits/weaving-quota'
    );
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      '/api/workspace/cards/weave'
    );
  });
});
