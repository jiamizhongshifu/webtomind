import { describe, expect, it } from 'vitest';
import { imagePromptAssetCatalog as imagePromptAssets } from '../../../data/image-prompt-asset-catalog';
import { buildAssetSearchText } from '../useAssetLibrary';

describe('asset library search aliases', () => {
  it('indexes English aliases without exposing them as visible tags', () => {
    const asset = imagePromptAssets.find(
      (item) => item.id === 'expression-cool-detachment'
    );

    expect(asset).toBeDefined();
    expect(buildAssetSearchText(asset!)).toContain('cool detachment');
    expect(asset?.tags).not.toContain('cool detachment');
    expect(asset?.searchAliases).toContain('cool detachment');
  });
});
