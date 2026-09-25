import promptLibraryManifest from '../assets/prompt-library/manifest.generated.json';
import { createImagePromptAssetCatalog } from './image-prompt-assets';

/** Full local prompt library. Import this module dynamically on browsing paths. */
export const imagePromptAssetCatalog = createImagePromptAssetCatalog(
  promptLibraryManifest
);
