export const IMAGE_PROMPT_RECIPE_AUDIT_SCHEMA_VERSION = 1 as const;

export const imagePromptRecipeSelectionSources = [
  'manual',
  'random_recipe',
  'random_slot',
  'legacy_unknown'
] as const;

export type ImagePromptRecipeSelectionSource =
  (typeof imagePromptRecipeSelectionSources)[number];

export interface ImagePromptRecipeAudit {
  schemaVersion: typeof IMAGE_PROMPT_RECIPE_AUDIT_SCHEMA_VERSION;
  compilerVersion: string;
  selectionSource: ImagePromptRecipeSelectionSource;
  selectedAssetIds: string[];
  inputAssetIds?: string[];
  profile?: string;
  seed?: number;
  randomizedSlot?: string;
  constraintAdjustments?: string[];
}

export function buildManualImagePromptRecipeAudit(
  selectedAssetIds: string[],
  compilerVersion: string
): ImagePromptRecipeAudit {
  return {
    schemaVersion: IMAGE_PROMPT_RECIPE_AUDIT_SCHEMA_VERSION,
    compilerVersion,
    selectionSource: 'manual',
    selectedAssetIds: [...selectedAssetIds]
  };
}

export function hasMatchingImagePromptRecipeSelection(
  audit: ImagePromptRecipeAudit,
  selectedAssetIds: string[]
): boolean {
  if (audit.selectedAssetIds.length !== selectedAssetIds.length) return false;
  const expected = new Set(audit.selectedAssetIds);
  return selectedAssetIds.every((id) => expected.has(id));
}
