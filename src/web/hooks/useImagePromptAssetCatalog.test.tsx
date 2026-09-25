import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { imagePromptAssets, type ImagePromptAsset } from '../data/image-prompt-core';
import { useImagePromptAssetCatalog } from './useImagePromptAssetCatalog';

const loadImagePromptAssetCatalog = vi.hoisted(() => vi.fn());

vi.mock('../data/image-prompt-asset-catalog-loader', () => ({
  loadImagePromptAssetCatalog
}));

const catalogOnlyAsset: ImagePromptAsset = {
  id: 'character-intent-only',
  slot: 'character',
  title: 'Intent only',
  subtitle: 'Deferred catalog fixture',
  prompt: 'deferred catalog fixture',
  tags: ['test'],
  visual: { tone: '#eee', accent: '#222', shape: 'portrait' }
};

describe('useImagePromptAssetCatalog', () => {
  beforeEach(() => {
    loadImagePromptAssetCatalog.mockReset();
    loadImagePromptAssetCatalog.mockResolvedValue([
      ...imagePromptAssets,
      catalogOnlyAsset
    ]);
  });

  it('keeps the synchronous core until explicit intent enables hydration', async () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useImagePromptAssetCatalog(enabled),
      { initialProps: { enabled: false } }
    );

    expect(result.current).toBe(imagePromptAssets);
    expect(loadImagePromptAssetCatalog).not.toHaveBeenCalled();

    rerender({ enabled: true });

    await waitFor(() => {
      expect(result.current).toContain(catalogOnlyAsset);
    });
    expect(loadImagePromptAssetCatalog).toHaveBeenCalledOnce();
  });
});
