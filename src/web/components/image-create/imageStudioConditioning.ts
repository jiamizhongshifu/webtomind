import {
  composerImagePromptSlots,
  mergeImagePromptSelectionIntoPrompt,
  type ImagePromptAsset,
  type ImagePromptSelection,
  type ImagePromptSlot,
  type PromptLocale
} from '../../data/image-prompt-core';

export function shouldDetachRecipeForPromptEdit(
  conditioningMode: 'none' | 'moodboard' | 'recipe'
): boolean {
  return conditioningMode === 'recipe';
}

function escapePromptLineLabel(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildRecipeConditionedPrompt(input: {
  prompt: string;
  selection: ImagePromptSelection;
  assets: ImagePromptAsset[];
  locale: PromptLocale;
  getSlotLabel: (slot: ImagePromptSlot) => string;
}): string {
  const recipeLinePatterns = composerImagePromptSlots.map(
    (slot) =>
      new RegExp(
        `^\\s*(?:[-*]\\s*)?${escapePromptLineLabel(
          input.getSlotLabel(slot.id)
        )}\\s*[:：]`,
        'i'
      )
  );
  const basePrompt = input.prompt
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => !recipeLinePatterns.some((pattern) => pattern.test(line)))
    .join('\n')
    .trim();

  return mergeImagePromptSelectionIntoPrompt(
    basePrompt,
    input.selection,
    input.assets,
    input.locale
  );
}
