import { afterEach, describe, expect, it, vi } from 'vitest';

describe('agent-api prompt case draft bulk publish', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('deduplicates drafts, continues after a failure, and reports progress', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/draft-failed/publish')) {
        return new Response(JSON.stringify({ error: 'Draft is incomplete' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const draftId = url.match(/prompt-case-drafts\/([^/]+)\/publish/)?.[1];
      return new Response(
        JSON.stringify({
          deletedDraftId: draftId
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const { setAuthToken } = await import('../agent-api');
    const { publishAllAdminPromptCaseDrafts } =
      await import('../prompt-case-draft-publish');
    setAuthToken('admin-token');
    const progress: Array<[number, number]> = [];
    const result = await publishAllAdminPromptCaseDrafts(
      [
        { id: 'draft-1', title: 'First' },
        { id: 'draft-failed', title: 'Broken' },
        { id: 'draft-1', title: 'Duplicate' },
        { id: 'draft-2', title: 'Second' }
      ],
      {
        concurrency: 2,
        onProgress: (completed, total) => progress.push([completed, total])
      }
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.published.map((item) => item.draftId)).toEqual([
      'draft-1',
      'draft-2'
    ]);
    expect(result.failures).toEqual([
      {
        draftId: 'draft-failed',
        title: 'Broken',
        error: 'Draft is incomplete'
      }
    ]);
    expect(progress).toHaveLength(3);
    expect(progress.at(-1)).toEqual([3, 3]);
  });
});
