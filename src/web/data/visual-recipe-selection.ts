import {
  imagePromptSlots,
  isMultiSelectImagePromptSlot,
  normalizeImagePromptSelection,
  type ImagePromptSelection,
  type ImagePromptSelectionValue,
  type ImagePromptSlot
} from './image-prompt-core';

const imagePromptSlotSet = new Set<ImagePromptSlot>(
  imagePromptSlots.map((slot) => slot.id)
);

export function readImagePromptSlot(value: unknown): ImagePromptSlot | null {
  if (typeof value !== 'string') return null;
  return imagePromptSlotSet.has(value as ImagePromptSlot)
    ? (value as ImagePromptSlot)
    : null;
}

function readStringArray(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function readMatchAssetIds(value: unknown): string[] {
  const primitiveIds = readStringArray(value);
  if (primitiveIds.length > 0) return primitiveIds;

  if (Array.isArray(value)) {
    return value.flatMap(readMatchAssetIds);
  }

  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const nestedIds = readStringArray(
    record.assetId ||
      record.asset_id ||
      record.promptAssetId ||
      record.prompt_asset_id ||
      record.matchedAssetId ||
      record.matched_asset_id ||
      record.id
  );
  if (nestedIds.length > 0) return nestedIds;

  return [
    record.asset,
    record.promptAsset,
    record.prompt_asset,
    record.match,
    record.bestMatch,
    record.best_match
  ].flatMap(readMatchAssetIds);
}

export function addSelectionIds(
  draft: Partial<Record<ImagePromptSlot, string[]>>,
  slot: ImagePromptSlot,
  ids: string[]
) {
  if (ids.length === 0) return;
  draft[slot] = [...(draft[slot] || []), ...ids];
}

export function selectionFromDraft(
  draft: Partial<Record<ImagePromptSlot, string[]>>
): ImagePromptSelection | null {
  if (Object.keys(draft).length === 0) return null;

  const rawSelection = imagePromptSlots.reduce(
    (selection, slot) => {
      const ids = Array.from(new Set(draft[slot.id] || []));
      selection[slot.id] = isMultiSelectImagePromptSlot(slot.id)
        ? ids
        : ids[0] || null;
      return selection;
    },
    {} as Partial<Record<ImagePromptSlot, ImagePromptSelectionValue>>
  );
  return normalizeImagePromptSelection(rawSelection);
}

function readSelectionLikeObject(
  value: unknown,
  draft: Partial<Record<ImagePromptSlot, string[]>>
) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const record = value as Record<string, unknown>;
  imagePromptSlots.forEach((slot) => {
    addSelectionIds(draft, slot.id, readMatchAssetIds(record[slot.id]));
  });
}

function readMatches(
  value: unknown,
  draft: Partial<Record<ImagePromptSlot, string[]>>
) {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach((match) => {
      if (!match || typeof match !== 'object') return;
      const record = match as Record<string, unknown>;
      const slot = readImagePromptSlot(record.slot);
      if (!slot) return;
      addSelectionIds(draft, slot, readMatchAssetIds(record));
    });
    return;
  }
  readSelectionLikeObject(value, draft);
}

export function normalizeVisualRecipeSelection(
  visualRecipe: unknown
): ImagePromptSelection | null {
  if (
    !visualRecipe ||
    typeof visualRecipe !== 'object' ||
    Array.isArray(visualRecipe)
  ) {
    return null;
  }
  const record = visualRecipe as Record<string, unknown>;
  const draft: Partial<Record<ImagePromptSlot, string[]>> = {};

  readSelectionLikeObject(record.selection, draft);
  readMatches(record.matches, draft);

  if (Object.keys(draft).length === 0) {
    readSelectionLikeObject(record, draft);
  }

  return selectionFromDraft(draft);
}
