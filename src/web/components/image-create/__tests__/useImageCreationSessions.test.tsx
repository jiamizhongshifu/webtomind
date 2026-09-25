import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  invalidateImageCreationSessionCache,
  upsertCachedImageCreationSession,
  updateCachedImageCreationSessionCover,
  useImageCreationSessions
} from '../useImageCreationSessions';

const mocks = vi.hoisted(() => ({
  listImageSessions: vi.fn(),
  getCachedVisualImageUrlsByIds: vi.fn(),
  getVisualImageHistoryByIds: vi.fn(),
  getVisualVideoHistoryByIds: vi.fn()
}));

vi.mock('@/services/create-workspace-v2-api', () => ({
  listImageSessions: mocks.listImageSessions
}));

vi.mock('@/services/agent-api', () => ({
  getCachedVisualImageUrlsByIds: mocks.getCachedVisualImageUrlsByIds,
  getVisualImageHistoryByIds: mocks.getVisualImageHistoryByIds,
  getVisualVideoHistoryByIds: mocks.getVisualVideoHistoryByIds
}));

const sessions = [
  {
    id: 'session-1',
    title: 'One',
    status: 'active' as const,
    coverGenerationId: 'generation-1',
    createdAt: '2026-07-17T08:00:00.000Z',
    updatedAt: '2026-07-17T08:00:00.000Z'
  },
  {
    id: 'session-2',
    title: 'Two',
    status: 'active' as const,
    coverGenerationId: 'generation-2',
    createdAt: '2026-07-17T07:00:00.000Z',
    updatedAt: '2026-07-17T07:00:00.000Z'
  },
  {
    id: 'session-3',
    title: 'Three',
    status: 'active' as const,
    createdAt: '2026-07-17T06:00:00.000Z',
    updatedAt: '2026-07-17T06:00:00.000Z'
  }
];

describe('useImageCreationSessions', () => {
  beforeEach(() => {
    invalidateImageCreationSessionCache();
    mocks.listImageSessions.mockReset();
    mocks.getCachedVisualImageUrlsByIds.mockReset();
    mocks.getCachedVisualImageUrlsByIds.mockReturnValue({});
    mocks.getVisualImageHistoryByIds.mockReset();
    mocks.getVisualVideoHistoryByIds.mockReset();
    mocks.getVisualVideoHistoryByIds.mockResolvedValue({
      items: [],
      missingIds: []
    });
  });

  it('loads only the visible sessions and hydrates all covers in one request', async () => {
    mocks.listImageSessions.mockResolvedValue(sessions);
    mocks.getVisualImageHistoryByIds.mockResolvedValue({
      items: [
        {
          id: 'generation-1',
          imageUrl: 'https://example.com/one.jpg',
          thumbnailUrl: 'https://example.com/one-thumb.jpg'
        },
        {
          id: 'generation-2',
          imageUrl: 'https://example.com/two.jpg'
        }
      ],
      missingIds: []
    });

    const { result } = renderHook(() =>
      useImageCreationSessions(true, 2, 'user-1')
    );

    await waitFor(() => {
      expect(result.current[0]?.coverImageUrl).toBe(
        'https://example.com/one-thumb.jpg'
      );
    });
    expect(result.current).toHaveLength(2);
    expect(result.current[1]?.coverImageUrl).toBe(
      'https://example.com/two.jpg'
    );
    expect(mocks.listImageSessions).toHaveBeenCalledWith(2);
    expect(mocks.getVisualImageHistoryByIds).toHaveBeenCalledTimes(1);
    expect(mocks.getVisualImageHistoryByIds).toHaveBeenCalledWith([
      'generation-1',
      'generation-2'
    ]);
  });

  it('keeps session labels available when cover hydration fails', async () => {
    mocks.listImageSessions.mockResolvedValue(sessions.slice(0, 1));
    mocks.getVisualImageHistoryByIds.mockRejectedValue(
      new Error('history unavailable')
    );

    const { result } = renderHook(() =>
      useImageCreationSessions(true, 1, 'user-1')
    );

    await waitFor(() => {
      expect(result.current[0]?.title).toBe('One');
    });
    expect(result.current[0]?.coverImageUrl).toBeUndefined();
  });

  it('reuses the session list and hydrated covers when the navigation remounts', async () => {
    mocks.listImageSessions.mockResolvedValue(sessions.slice(0, 1));
    mocks.getVisualImageHistoryByIds.mockResolvedValue({
      items: [
        {
          id: 'generation-1',
          imageUrl: 'https://example.com/one.jpg',
          thumbnailUrl: 'https://example.com/one-thumb.jpg'
        }
      ],
      missingIds: []
    });

    const first = renderHook(() => useImageCreationSessions(true, 1, 'user-1'));
    await waitFor(() => {
      expect(first.result.current[0]?.coverImageUrl).toBe(
        'https://example.com/one-thumb.jpg'
      );
    });
    first.unmount();

    const second = renderHook(() =>
      useImageCreationSessions(true, 1, 'user-1')
    );
    expect(second.result.current[0]?.coverImageUrl).toBe(
      'https://example.com/one-thumb.jpg'
    );
    await waitFor(() => {
      expect(mocks.listImageSessions).toHaveBeenCalledTimes(1);
      expect(mocks.getVisualImageHistoryByIds).toHaveBeenCalledTimes(1);
    });
  });

  it('deduplicates concurrent loads from overlapping navigation mounts', async () => {
    let resolveSessions: ((value: typeof sessions) => void) | undefined;
    mocks.listImageSessions.mockReturnValue(
      new Promise<typeof sessions>((resolve) => {
        resolveSessions = resolve;
      })
    );
    mocks.getVisualImageHistoryByIds.mockResolvedValue({
      items: [],
      missingIds: ['generation-1', 'generation-2']
    });

    const first = renderHook(() => useImageCreationSessions(true, 1, 'user-1'));
    const second = renderHook(() =>
      useImageCreationSessions(true, 1, 'user-1')
    );

    expect(mocks.listImageSessions).toHaveBeenCalledTimes(1);
    resolveSessions?.(sessions);
    await waitFor(() => {
      expect(first.result.current[0]?.title).toBe('One');
      expect(second.result.current[0]?.title).toBe('One');
    });
  });

  it('isolates cached sessions by authenticated user', async () => {
    mocks.listImageSessions
      .mockResolvedValueOnce(sessions.slice(0, 1))
      .mockResolvedValueOnce([{ ...sessions[1], title: 'Another account' }]);
    mocks.getVisualImageHistoryByIds.mockResolvedValue({
      items: [],
      missingIds: ['generation-1', 'generation-2']
    });

    const first = renderHook(() => useImageCreationSessions(true, 1, 'user-1'));
    await waitFor(() => expect(first.result.current[0]?.title).toBe('One'));
    first.unmount();

    const second = renderHook(() =>
      useImageCreationSessions(true, 1, 'user-2')
    );
    await waitFor(() =>
      expect(second.result.current[0]?.title).toBe('Another account')
    );
    expect(mocks.listImageSessions).toHaveBeenCalledTimes(2);
  });

  it('uses valid cached signed URLs without requesting history again', async () => {
    mocks.listImageSessions.mockResolvedValue(sessions.slice(0, 1));
    mocks.getCachedVisualImageUrlsByIds.mockReturnValue({
      'generation-1': {
        imageUrl: 'https://example.com/one.jpg',
        thumbnailUrl: 'https://example.com/one-thumb.jpg'
      }
    });

    const { result } = renderHook(() =>
      useImageCreationSessions(true, 1, 'user-1')
    );
    await waitFor(() => {
      expect(result.current[0]?.coverImageUrl).toBe(
        'https://example.com/one-thumb.jpg'
      );
    });
    expect(mocks.getVisualImageHistoryByIds).not.toHaveBeenCalled();
  });

  it('forces a refresh after a session mutation event', async () => {
    mocks.listImageSessions
      .mockResolvedValueOnce(sessions.slice(0, 1))
      .mockResolvedValueOnce([{ ...sessions[0], title: 'Updated title' }]);
    mocks.getVisualImageHistoryByIds.mockResolvedValue({
      items: [
        {
          id: 'generation-1',
          imageUrl: 'https://example.com/one.jpg'
        }
      ],
      missingIds: []
    });

    const { result } = renderHook(() =>
      useImageCreationSessions(true, 1, 'user-1')
    );
    await waitFor(() => expect(result.current[0]?.title).toBe('One'));

    window.dispatchEvent(new Event('image-session-changed'));
    await waitFor(() => expect(result.current[0]?.title).toBe('Updated title'));
    expect(mocks.listImageSessions).toHaveBeenCalledTimes(2);
  });

  it('publishes a generated cover from cache before the server refresh completes', async () => {
    let resolveRefresh: ((value: typeof sessions) => void) | undefined;
    mocks.listImageSessions
      .mockResolvedValueOnce([{ ...sessions[0], coverGenerationId: undefined }])
      .mockReturnValueOnce(
        new Promise<typeof sessions>((resolve) => {
          resolveRefresh = resolve;
        })
      );

    const { result } = renderHook(() =>
      useImageCreationSessions(true, 1, 'user-1')
    );
    await waitFor(() => expect(result.current[0]?.title).toBe('One'));

    updateCachedImageCreationSessionCover('user-1', 'session-1', {
      coverGenerationId: 'generation-new',
      coverImageUrl: 'https://example.com/new-thumb.jpg'
    });
    window.dispatchEvent(new Event('image-session-changed'));

    await waitFor(() => {
      expect(result.current[0]?.coverImageUrl).toBe(
        'https://example.com/new-thumb.jpg'
      );
    });
    expect(mocks.listImageSessions).toHaveBeenCalledTimes(2);

    resolveRefresh?.([{ ...sessions[0], coverGenerationId: undefined }]);
    await waitFor(() => {
      expect(result.current[0]?.coverImageUrl).toBe(
        'https://example.com/new-thumb.jpg'
      );
    });
  });

  it('does not let an older in-flight response roll back a generated cover', async () => {
    let resolveInitialLoad: ((value: typeof sessions) => void) | undefined;
    mocks.listImageSessions.mockReturnValue(
      new Promise<typeof sessions>((resolve) => {
        resolveInitialLoad = resolve;
      })
    );

    const { result } = renderHook(() =>
      useImageCreationSessions(true, 1, 'user-1')
    );

    updateCachedImageCreationSessionCover('user-1', 'session-1', {
      coverGenerationId: 'generation-new',
      coverImageUrl: 'https://example.com/new-thumb.jpg'
    });
    // The cache is still empty until the session itself exists, so publish it
    // exactly as the new-session path does before the stale request resolves.
    const localSession = {
      ...sessions[0],
      coverGenerationId: 'generation-new',
      coverImageUrl: 'https://example.com/new-thumb.jpg',
      updatedAt: new Date().toISOString()
    };
    upsertCachedImageCreationSession('user-1', localSession);
    window.dispatchEvent(
      new CustomEvent('image-session-changed', { detail: { refresh: false } })
    );

    await waitFor(() => {
      expect(result.current[0]?.coverImageUrl).toBe(
        'https://example.com/new-thumb.jpg'
      );
    });

    resolveInitialLoad?.([{ ...sessions[0], coverGenerationId: undefined }]);
    await waitFor(() => {
      expect(result.current[0]?.coverImageUrl).toBe(
        'https://example.com/new-thumb.jpg'
      );
    });
  });

  it('keeps newly created video sessions out of the image session cache', async () => {
    mocks.listImageSessions.mockImplementation(
      async (_limit: number, mediaType?: 'image' | 'video') =>
        mediaType === 'video' ? [] : sessions.slice(0, 1)
    );
    mocks.getVisualImageHistoryByIds.mockResolvedValue({
      items: [{ id: 'generation-1', imageUrl: 'https://example.com/one.jpg' }],
      missingIds: []
    });
    const imageSessions = renderHook(() =>
      useImageCreationSessions(true, 6, 'user-1', 'image')
    );
    const videoSessions = renderHook(() =>
      useImageCreationSessions(true, 6, 'user-1', 'video')
    );
    await waitFor(() => expect(imageSessions.result.current).toHaveLength(1));

    upsertCachedImageCreationSession('user-1', {
      ...sessions[0],
      id: 'video-session-1',
      title: 'Video session',
      mediaType: 'video'
    });
    window.dispatchEvent(
      new CustomEvent('creation-session-changed', {
        detail: { refresh: false }
      })
    );

    await waitFor(() =>
      expect(videoSessions.result.current[0]?.id).toBe('video-session-1')
    );
    expect(imageSessions.result.current.map((item) => item.id)).toEqual([
      'session-1'
    ]);
  });
});
