import { useEffect, useState } from 'react';
import {
  imagePromptAssets,
  type ImagePromptAsset
} from '../data/image-prompt-core';
import { loadImagePromptAssetCatalog } from '../data/image-prompt-asset-catalog-loader';

/** Renders from core assets immediately, then hydrates on explicit intent. */
export function useImagePromptAssetCatalog(
  enabled = true
): ImagePromptAsset[] {
  const [assets, setAssets] = useState<ImagePromptAsset[]>(imagePromptAssets);

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    void loadImagePromptAssetCatalog()
      .then((catalog) => {
        if (active) setAssets(catalog);
      })
      .catch((error) => {
        console.warn(
          '[PromptAssets] complete local catalog unavailable:',
          error
        );
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  return assets;
}
