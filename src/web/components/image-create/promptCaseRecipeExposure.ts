import type { PromptCase } from '@/services/agent-api';
import {
  getSelectedAssetIds,
  imagePromptSlots,
  type ImagePromptSelection
} from '../../data/image-prompt-core';
import { normalizeVisualRecipeSelection } from './assetLibraryResolver';

export interface PromptCaseRecipeMatch {
  caseItem: PromptCase;
  matchedAssetIds: string[];
  matchedCount: number;
}

export function getVisualRecipeSelectedAssetIds(
  selection: ImagePromptSelection | null | undefined
): string[] {
  if (!selection) return [];
  return Array.from(
    new Set(
      imagePromptSlots.flatMap((slot) =>
        getSelectedAssetIds(selection, slot.id)
      )
    )
  );
}

export function getPromptCaseVisualRecipeAssetIds(
  caseItem: PromptCase
): string[] {
  const selection = normalizeVisualRecipeSelection(
    (caseItem as PromptCase & { visualRecipe?: unknown }).visualRecipe
  );
  return getVisualRecipeSelectedAssetIds(selection);
}

function getPromptCasePopularityScore(caseItem: PromptCase): number {
  return (
    (caseItem.featured ? 100000 : 0) +
    Math.max(0, Number(caseItem.generateCount || 0)) * 80 +
    Math.max(0, Number(caseItem.copyCount || 0)) * 35 +
    Math.max(0, Number(caseItem.viewCount || 0))
  );
}

export function findPromptCasesSharingRecipeAssets(
  cases: PromptCase[],
  targetAssetIds: string[],
  options: {
    currentCaseId?: string;
    limit?: number;
    getCaseAssetIds?: (caseItem: PromptCase) => string[];
  } = {}
): PromptCaseRecipeMatch[] {
  const targetIdSet = new Set(targetAssetIds.filter(Boolean));
  if (targetIdSet.size === 0) return [];

  const getCaseAssetIds =
    options.getCaseAssetIds || getPromptCaseVisualRecipeAssetIds;
  const originalIndex = new Map(
    cases.map((caseItem, index) => [caseItem.id, index])
  );

  return cases
    .filter(
      (caseItem) =>
        caseItem.id !== options.currentCaseId &&
        !caseItem.sourceCaseId &&
        Boolean(caseItem.slug || caseItem.id)
    )
    .map((caseItem) => {
      const caseAssetIds = new Set(getCaseAssetIds(caseItem));
      const matchedAssetIds = [...targetIdSet].filter((assetId) =>
        caseAssetIds.has(assetId)
      );
      return {
        caseItem,
        matchedAssetIds,
        matchedCount: matchedAssetIds.length
      };
    })
    .filter((match) => match.matchedCount > 0)
    .sort((a, b) => {
      const matchedDiff = b.matchedCount - a.matchedCount;
      if (matchedDiff !== 0) return matchedDiff;
      const popularityDiff =
        getPromptCasePopularityScore(b.caseItem) -
        getPromptCasePopularityScore(a.caseItem);
      if (popularityDiff !== 0) return popularityDiff;
      return (
        (originalIndex.get(a.caseItem.id) ?? 0) -
        (originalIndex.get(b.caseItem.id) ?? 0)
      );
    })
    .slice(0, options.limit || 6);
}
