import type { VisualImageHistoryItem } from '@/services/agent-api';
import type { ImagePromptAsset } from '../../data/image-prompt-core';
import type { ResolvedVisualRecipeAsset } from './assetLibraryResolver';

function normalizePromptFragment(value: string | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function promptContainsAsset(prompt: string, asset: ImagePromptAsset): boolean {
  const normalizedPrompt = normalizePromptFragment(prompt);
  return [asset.prompt, asset.promptZh].some((value) => {
    const fragment = normalizePromptFragment(value);
    return fragment.length >= 24 && normalizedPrompt.includes(fragment);
  });
}

export function resolveHistoryVisualRecipeAssets(
  item: Pick<VisualImageHistoryItem, 'assetIds' | 'prompt'>,
  assets: ImagePromptAsset[]
): ResolvedVisualRecipeAsset[] {
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const recordedAssets = (item.assetIds || []).flatMap((assetId) => {
    const asset = assetsById.get(assetId);
    return asset ? [{ slot: asset.slot, asset }] : [];
  });
  if (recordedAssets.length > 0) return recordedAssets;

  return assets
    .filter((asset) => promptContainsAsset(item.prompt, asset))
    .map((asset) => ({ slot: asset.slot, asset }));
}
