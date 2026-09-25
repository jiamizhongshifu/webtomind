import { describe, expect, it } from 'vitest';
import type { ImagePromptAsset } from '@/web/data/image-prompt-core';
import { resolveHistoryVisualRecipeAssets } from '../historyVisualRecipe';

const assets = [
  {
    id: 'character-office-model',
    slot: 'character',
    title: 'Office model',
    subtitle: 'Editorial identity',
    prompt:
      'adult elegant office model persona, neat black hair, tailored blazer, clean professional beauty',
    tags: [],
    visual: { tone: '#111', accent: '#222', shape: 'portrait' }
  },
  {
    id: 'lighting-neon',
    slot: 'lighting',
    title: 'Neon light',
    subtitle: 'Night portrait',
    prompt: 'blue and magenta neon portrait lighting with restrained skin tone',
    tags: [],
    visual: { tone: '#111', accent: '#222', shape: 'portrait' }
  }
] satisfies ImagePromptAsset[];

describe('resolveHistoryVisualRecipeAssets', () => {
  it('uses recorded asset ids as the authoritative recipe', () => {
    expect(
      resolveHistoryVisualRecipeAssets(
        { assetIds: ['lighting-neon'], prompt: assets[0].prompt },
        assets
      ).map(({ asset }) => asset.id)
    ).toEqual(['lighting-neon']);
  });

  it('recovers legacy recipes from exact prompt fragments', () => {
    expect(
      resolveHistoryVisualRecipeAssets(
        {
          assetIds: [],
          prompt: `Portrait setup; ${assets[0].prompt}; final quality pass.`
        },
        assets
      ).map(({ asset }) => asset.id)
    ).toEqual(['character-office-model']);
  });

  it('does not infer a recipe from vague keyword overlap', () => {
    expect(
      resolveHistoryVisualRecipeAssets(
        { assetIds: [], prompt: 'office portrait with blue light' },
        assets
      )
    ).toEqual([]);
  });
});
