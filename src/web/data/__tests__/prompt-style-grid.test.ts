import { describe, expect, it } from 'vitest';
import {
  buildPromptStyleGridParam,
  buildPromptStyleGridPrompt,
  buildPromptStyleGridSharePath,
  normalizePromptStyleGridAssetIds,
  parsePromptStyleGridParam,
  parsePromptStyleGridSearchParams,
  promptStyleGridSlots,
  promptStyleGridTemplates
} from '../prompt-style-grid';
import { getAssetById } from '../image-prompt-core';
import { imagePromptAssetCatalog } from '../image-prompt-asset-catalog';

describe('prompt style grid data', () => {
  it('normalizes invalid asset ids back to the template defaults', () => {
    const normalized = normalizePromptStyleGridAssetIds('portrait', [
      'not-real',
      'lighting-large-softbox'
    ]);

    expect(normalized).toHaveLength(promptStyleGridSlots.length);
    expect(normalized[0]).toBe('style-high-end-fashion-photo');
    expect(normalized[1]).toBe('lighting-large-softbox');
  });

  it('round-trips share query state with validated ids', () => {
    const sharePath = buildPromptStyleGridSharePath('character', [
      'style-game-character-concept',
      'lighting-colored-gel',
      'background-neon-alley',
      'shot-low-angle-hero',
      'character-cyber-courier',
      'layoutDesign-character-profile',
      'lens-anamorphic-cinematic',
      'pose-energetic-jump'
    ]);
    const parsed = parsePromptStyleGridSearchParams(
      `template=character&${sharePath.split('?')[1]}`,
      imagePromptAssetCatalog
    );

    expect(sharePath).toContain('/ai-image-style-grid/character?');
    expect(parsed.template.slug).toBe('character');
    expect(parsed.assetIds[0]).toBe('style-game-character-concept');
    expect(parsed.assetIds[7]).toBe('pose-energetic-jump');
  });

  it('parses create styleGrid params without embedding full prompts in the URL', () => {
    const styleGridParam = buildPromptStyleGridParam('taste', [
      'style-clean-product-editorial',
      'lighting-large-softbox'
    ]);
    const parsed = parsePromptStyleGridParam(
      styleGridParam,
      imagePromptAssetCatalog
    );

    expect(styleGridParam).toBe(
      'taste:style-clean-product-editorial,lighting-large-softbox'
    );
    expect(parsed?.template.slug).toBe('taste');
    expect(parsed?.assetIds).toHaveLength(promptStyleGridSlots.length);
  });

  it('builds a prompt starter from selected assets', () => {
    const prompt = buildPromptStyleGridPrompt(
      'product',
      normalizePromptStyleGridAssetIds('product', [], imagePromptAssetCatalog),
      'en-US',
      imagePromptAssetCatalog
    );

    expect(prompt).toContain('WebToMind Theme Card');
    expect(prompt).toContain('Style:');
    expect(prompt).toContain('Lighting:');
    expect(prompt).toContain('Product Photography Theme Card');
  });

  it('keeps every popular template backed by valid assets and SEO terms', () => {
    expect(promptStyleGridTemplates.length).toBeGreaterThanOrEqual(12);

    for (const template of promptStyleGridTemplates) {
      const normalized = normalizePromptStyleGridAssetIds(
        template.slug,
        template.defaultAssetIds,
        imagePromptAssetCatalog
      );

      expect(normalized).toHaveLength(promptStyleGridSlots.length);
      expect(template.recommendedModel).toMatch(/\S/);
      expect(template.recommendedImageSize).toMatch(/\d+x\d+/);
      expect(template.seoKeywords.length).toBeGreaterThanOrEqual(3);
      expect(template.category).toMatch(/\S/);
      expect(template.thumbnailUrl).toMatch(/theme-cards\/.+\.webp/);
      normalized.forEach((assetId) => {
        expect(getAssetById(assetId, imagePromptAssetCatalog)?.id).toBe(
          assetId
        );
      });
    }
  });
});
