import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicImagePromptAsset } from '@/services/marketing-api';

const getPublicImagePromptAssets = vi.hoisted(() => vi.fn());

vi.mock('@/services/marketing-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/marketing-api')>();
  return { ...actual, getPublicImagePromptAssets };
});

vi.mock('../../../data/image-prompt-asset-catalog-loader', () => ({
  loadImagePromptAssetCatalog: vi.fn().mockResolvedValue([])
}));

import {
  clearPublicImagePromptAssetSlotLibraryCache,
  loadPublicImagePromptAssetSlotLibrary
} from '../assetLibraryResolver';

const remoteCharacter: PublicImagePromptAsset = {
  id: 'character-cache-test',
  slot: 'character',
  title: 'Cache test',
  subtitle: '',
  prompt: 'cache test portrait',
  tags: [],
  thumbnailUrl: ''
};

describe('public prompt slot session cache', () => {
  beforeEach(() => {
    clearPublicImagePromptAssetSlotLibraryCache();
    getPublicImagePromptAssets.mockReset();
    getPublicImagePromptAssets.mockResolvedValue([remoteCharacter]);
  });

  it('coalesces hover and click while a slot request is in flight', async () => {
    const first = loadPublicImagePromptAssetSlotLibrary('character');
    const second = loadPublicImagePromptAssetSlotLibrary('character');
    const [firstLibrary, secondLibrary] = await Promise.all([first, second]);

    expect(getPublicImagePromptAssets).toHaveBeenCalledOnce();
    expect(firstLibrary).toEqual(secondLibrary);
  });

  it('reuses a successful slot response when returning to that category', async () => {
    await loadPublicImagePromptAssetSlotLibrary('character');
    await loadPublicImagePromptAssetSlotLibrary('character');

    expect(getPublicImagePromptAssets).toHaveBeenCalledOnce();
  });

  it('does not pin a failed remote response in the session cache', async () => {
    getPublicImagePromptAssets
      .mockRejectedValueOnce(new Error('temporary network failure'))
      .mockResolvedValueOnce([remoteCharacter]);

    const failedLibrary = await loadPublicImagePromptAssetSlotLibrary(
      'character'
    );
    const recoveredLibrary = await loadPublicImagePromptAssetSlotLibrary(
      'character'
    );

    expect(failedLibrary.error).toBe('temporary network failure');
    expect(recoveredLibrary.error).toBe('');
    expect(getPublicImagePromptAssets).toHaveBeenCalledTimes(2);
  });
});
