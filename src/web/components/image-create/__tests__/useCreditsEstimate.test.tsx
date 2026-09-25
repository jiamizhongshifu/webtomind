import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { defaultImagePromptSettings } from '../../../data/image-prompt-core';
import { modelOptions } from '../../../data/image-creator-options';
import { useCreditsEstimate } from '../useCreditsEstimate';

vi.mock('@/services/credits-api', () => ({
  getCreditsBalance: vi.fn().mockResolvedValue({ credits: { total: 1000 } }),
  getImageGenerationCost: vi.fn(() => new Promise(() => {}))
}));

describe('useCreditsEstimate', () => {
  it('clamps estimated image count to the selected model max', () => {
    const gptImage25 = modelOptions.find(
      (model) => model.value === 'gpt-image-2.5'
    );
    expect(gptImage25).toBeDefined();
    if (!gptImage25) return;

    const originalMax = gptImage25.maxImageCount;
    try {
      gptImage25.maxImageCount = 2;

      const { result } = renderHook(() =>
        useCreditsEstimate({
          isAuthenticated: false,
          settings: {
            ...defaultImagePromptSettings,
            model: 'gpt-image-2.5',
            imageCount: 4
          }
        })
      );

      expect(result.current.imageCount).toBe(2);
      expect(result.current.estimatedCost).toBe(result.current.unitCost * 2);
    } finally {
      gptImage25.maxImageCount = originalMax;
    }
  });

  it('uses an explicit prompt size when the control remains automatic', () => {
    const { result } = renderHook(() =>
      useCreditsEstimate({
        isAuthenticated: false,
        settings: {
          ...defaultImagePromptSettings,
          model: 'gpt-image-2.5',
          imageSize: 'auto'
        },
        prompt: '创建一张 3840x2160 的商业海报'
      })
    );

    expect(result.current.unitCost).toBe(300);
  });

  it('includes the effective reference count without a separate character mode fee', () => {
    const { result } = renderHook(() =>
      useCreditsEstimate({
        isAuthenticated: false,
        settings: {
          ...defaultImagePromptSettings,
          model: 'gpt-image-2.5'
        },
        referenceImageCount: 3,
        referenceMode: 'character_consistency'
      })
    );

    // 基础 60 + 3×参考图 20，角色一致性不再单独 +60。
    expect(result.current.unitCost).toBe(120);
  });
});
