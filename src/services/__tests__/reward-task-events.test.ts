import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/workspace-api', () => ({
  getAccessToken: vi.fn(() => 'test-token')
}));

vi.mock('@/utils/env', () => ({
  getApiBaseUrl: vi.fn(() => 'https://webtomind.test')
}));

async function loadModule() {
  return import('../reward-task-events');
}

describe('completeRewardTaskOnce', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('posts the task once and emits both credit refresh events after success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ success: true })
    });
    vi.stubGlobal('fetch', fetchMock);
    const creditsChanged = vi.fn();
    const legacyCreditsChanged = vi.fn();
    window.addEventListener('credits-changed', creditsChanged);
    window.addEventListener('CREDITS_CHANGED', legacyCreditsChanged);

    const { completeRewardTaskOnce, REWARD_TASK_IDENTIFIERS } =
      await loadModule();

    await expect(
      completeRewardTaskOnce(REWARD_TASK_IDENTIFIERS.reuseGalleryGeneration)
    ).resolves.toBe(true);
    await expect(
      completeRewardTaskOnce(REWARD_TASK_IDENTIFIERS.reuseGalleryGeneration)
    ).resolves.toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://webtomind.test/api/membership/tasks',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token'
        }),
        body: JSON.stringify({ identifier: 'reuse_gallery_generation' })
      })
    );
    expect(creditsChanged).toHaveBeenCalledTimes(1);
    expect(legacyCreditsChanged).toHaveBeenCalledTimes(1);

    window.removeEventListener('credits-changed', creditsChanged);
    window.removeEventListener('CREDITS_CHANGED', legacyCreditsChanged);
  });

  it('caches already-completed tasks without emitting credit events', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ error: 'Task already completed' })
    });
    vi.stubGlobal('fetch', fetchMock);
    const creditsChanged = vi.fn();
    window.addEventListener('credits-changed', creditsChanged);

    const { completeRewardTaskOnce, REWARD_TASK_IDENTIFIERS } =
      await loadModule();

    await expect(
      completeRewardTaskOnce(REWARD_TASK_IDENTIFIERS.createOrOpenBoard)
    ).resolves.toBe(false);
    await expect(
      completeRewardTaskOnce(REWARD_TASK_IDENTIFIERS.createOrOpenBoard)
    ).resolves.toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(creditsChanged).not.toHaveBeenCalled();

    window.removeEventListener('credits-changed', creditsChanged);
  });

  it('keeps reward task failures from blocking the source workflow', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);
    const creditsChanged = vi.fn();
    window.addEventListener('credits-changed', creditsChanged);

    const { completeRewardTaskOnce, REWARD_TASK_IDENTIFIERS } =
      await loadModule();

    await expect(
      completeRewardTaskOnce(
        REWARD_TASK_IDENTIFIERS.generateFirstCommercialImage
      )
    ).resolves.toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(creditsChanged).not.toHaveBeenCalled();

    window.removeEventListener('credits-changed', creditsChanged);
  });
});
