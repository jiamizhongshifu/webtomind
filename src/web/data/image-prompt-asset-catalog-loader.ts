import type { ImagePromptAsset } from './image-prompt-core';

let catalogPromise: Promise<ImagePromptAsset[]> | null = null;

/** Loads the complete local catalog once, while keeping core assets synchronous. */
export function loadImagePromptAssetCatalog(): Promise<ImagePromptAsset[]> {
  catalogPromise ??= import('./image-prompt-asset-catalog').then(
    ({ imagePromptAssetCatalog }) => imagePromptAssetCatalog
  );
  return catalogPromise;
}
