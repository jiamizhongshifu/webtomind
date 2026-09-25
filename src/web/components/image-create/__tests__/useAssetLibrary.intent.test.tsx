import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { imagePromptAssets } from '../../../data/image-prompt-core';
import { useAssetLibrary } from '../useAssetLibrary';

const loadPublicImagePromptAssetLibrary = vi.hoisted(() => vi.fn());
const loadPublicImagePromptAssetSlotLibrary = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

vi.mock('../assetLibraryResolver', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../assetLibraryResolver')>();
  return {
    ...actual,
    loadPublicImagePromptAssetLibrary,
    loadPublicImagePromptAssetSlotLibrary
  };
});

describe('useAssetLibrary intent hydration', () => {
  beforeEach(() => {
    loadPublicImagePromptAssetLibrary.mockReset();
    loadPublicImagePromptAssetLibrary.mockResolvedValue({
      assets: imagePromptAssets,
      source: 'local',
      error: ''
    });
    loadPublicImagePromptAssetSlotLibrary.mockReset();
    loadPublicImagePromptAssetSlotLibrary.mockImplementation((slot: string) =>
      Promise.resolve({
        assets: imagePromptAssets.filter((asset) => asset.slot === slot),
        source: 'remote',
        error: ''
      })
    );
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: undefined
    });
  });

  it('hydrates only the active slot after recipe intent', async () => {
    const setSelection = vi.fn();
    const setError = vi.fn();
    const { rerender } = renderHook(
      ({ loadScope, activeSlot }) =>
        useAssetLibrary({
          loadScope,
          isAuthenticated: false,
          activeSlot,
          setSelection,
          setError
        }),
      {
        initialProps: {
          loadScope: 'none' as 'none' | 'active-slot' | 'full',
          activeSlot: 'character' as const
        }
      }
    );

    expect(loadPublicImagePromptAssetLibrary).not.toHaveBeenCalled();
    expect(loadPublicImagePromptAssetSlotLibrary).not.toHaveBeenCalled();

    rerender({ loadScope: 'active-slot', activeSlot: 'character' });

    await waitFor(() => {
      expect(loadPublicImagePromptAssetSlotLibrary).toHaveBeenCalledWith(
        'character'
      );
    });
    expect(loadPublicImagePromptAssetLibrary).not.toHaveBeenCalled();
    expect(setSelection).not.toHaveBeenCalled();
  });

  it('loads and normalizes the complete library only for full browsing intent', async () => {
    const setSelection = vi.fn();
    const setError = vi.fn();
    renderHook(() =>
      useAssetLibrary({
        loadScope: 'full',
        isAuthenticated: false,
        activeSlot: 'character',
        setSelection,
        setError
      })
    );

    await waitFor(() => {
      expect(loadPublicImagePromptAssetLibrary).toHaveBeenCalledOnce();
      expect(setSelection).toHaveBeenCalledOnce();
    });
    expect(loadPublicImagePromptAssetSlotLibrary).not.toHaveBeenCalled();
  });

  it('prefetches exact hover intent on an unconstrained connection', () => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { effectiveType: '4g', saveData: false }
    });
    const { result } = renderHook(() =>
      useAssetLibrary({
        loadScope: 'none',
        isAuthenticated: false,
        activeSlot: 'character',
        setSelection: vi.fn(),
        setError: vi.fn()
      })
    );

    act(() => {
      expect(result.current.prefetchPublicSlot('expression')).toBe(true);
    });
    expect(loadPublicImagePromptAssetSlotLibrary).toHaveBeenCalledWith(
      'expression'
    );
  });

  it.each([
    { effectiveType: '3g', saveData: false },
    { effectiveType: '4g', saveData: true }
  ])('skips speculative loading on constrained connections', (connection) => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: connection
    });
    const { result } = renderHook(() =>
      useAssetLibrary({
        loadScope: 'none',
        isAuthenticated: false,
        activeSlot: 'character',
        setSelection: vi.fn(),
        setError: vi.fn()
      })
    );

    act(() => {
      expect(result.current.prefetchPublicSlot('expression')).toBe(false);
    });
    expect(loadPublicImagePromptAssetSlotLibrary).not.toHaveBeenCalled();
  });
});
