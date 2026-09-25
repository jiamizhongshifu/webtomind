import { describe, expect, it } from 'vitest';
import {
  buildRandomImagePromptSelectionForProfile,
  getSelectedAssetIds,
  imagePromptAssets
} from '../image-prompt-core';
import { imagePromptAssetCatalog } from '../image-prompt-asset-catalog';
import {
  getPortraitRecipeWardrobeSlots,
  portraitRecipeProfiles
} from '../portrait-recipe-compatibility';

describe('image prompt core boundary', () => {
  it('keeps the synchronous fallback intentionally small and unique', () => {
    expect(imagePromptAssets.length).toBeLessThanOrEqual(20);
    expect(new Set(imagePromptAssets.map((asset) => asset.id)).size).toBe(
      imagePromptAssets.length
    );
    expect(imagePromptAssetCatalog.length).toBeGreaterThan(
      imagePromptAssets.length * 20
    );
    expect(
      imagePromptAssets.some(
        (asset) => asset.id === 'accessory-1920s-artdeco-crystal-barrette'
      )
    ).toBe(false);
  });

  it('keeps every recipe profile immediately randomizable before hydration', () => {
    portraitRecipeProfiles.forEach((profile) => {
      const selection = buildRandomImagePromptSelectionForProfile(
        imagePromptAssets,
        profile,
        () => 0
      );

      [
        'character',
        'expression',
        'pose',
        'background',
        'style',
        'lighting'
      ].forEach((slot) => {
        expect(
          getSelectedAssetIds(selection, slot as keyof typeof selection),
          `${profile} should select ${slot}`
        ).not.toEqual([]);
      });

      const wardrobeSlots = getPortraitRecipeWardrobeSlots(profile);
      expect(
        wardrobeSlots.some(
          (slot) => getSelectedAssetIds(selection, slot).length > 0
        ),
        `${profile} should select a compatible wardrobe`
      ).toBe(true);
    });
  });
});
