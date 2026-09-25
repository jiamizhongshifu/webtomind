import { expect, it } from 'vitest';
import {
  buildRandomImagePromptSelectionForProfile,
  composerImagePromptSlots,
  getPrimarySelectedAssetId,
  getSelectedAssetIds,
  isPortraitRandomEligible,
  resolveAssetCompatibility
} from '../image-prompt-core';
import { imagePromptAssetCatalog as imagePromptAssets } from '../image-prompt-asset-catalog';
import {
  filterAssetsForPortraitRecipeRandomContext,
  getPortraitRecipeWardrobeSlots,
  portraitRecipeProfiles
} from '../portrait-recipe-compatibility';

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

it('keeps every random-eligible public portrait asset reachable', () => {
  const selected = new Set<string>();

  portraitRecipeProfiles.forEach((profile, profileIndex) => {
    const random = seededRandom(0x28580675 + profileIndex * 0x9e3779b9);
    // 300 seeded samples cover the full eligible catalog while keeping this
    // reachability smoke at ~11s instead of ~38s (1000 samples). The assertion
    // below fails if any random-eligible asset becomes unreachable, which is
    // the signal to raise the sample count again.
    for (let sample = 0; sample < 300; sample += 1) {
      const selection = buildRandomImagePromptSelectionForProfile(
        imagePromptAssets,
        profile,
        random
      );
      composerImagePromptSlots.forEach((slot) => {
        getSelectedAssetIds(selection, slot.id).forEach((id) =>
          selected.add(id)
        );
      });

      const shotId = getPrimarySelectedAssetId(selection, 'shot');
      const shot = imagePromptAssets.find((asset) => asset.id === shotId);
      const propIds = getSelectedAssetIds(selection, 'prop');
      if (propIds.length > 0) {
        expect(shot, `${profile} must frame its selected prop`).toBeDefined();
        expect(resolveAssetCompatibility(shot!).showsHands).toBe(true);
      }
      if (
        shotId === 'shot-extreme-detail-eyes' ||
        shotId === 'shot-face-closeup'
      ) {
        expect(getSelectedAssetIds(selection, 'pose')).toEqual([]);
      }
    }
  });

  const eligibleAssets = imagePromptAssets
    .filter(isPortraitRandomEligible)
    .filter((asset) =>
      composerImagePromptSlots.some((slot) => slot.id === asset.slot)
    );
  const wardrobeSlots = new Set(['top', 'bottom', 'outfit', 'onePiece']);
  const unreachable = eligibleAssets
    .filter((asset) => !selected.has(asset.id))
    .filter((asset) => {
      const sameSlotCandidates = eligibleAssets.filter(
        (candidate) => candidate.slot === asset.slot
      );
      return !portraitRecipeProfiles.some((profile) => {
        if (
          wardrobeSlots.has(asset.slot) &&
          !getPortraitRecipeWardrobeSlots(profile).includes(
            asset.slot as 'top' | 'bottom' | 'outfit' | 'onePiece'
          )
        ) {
          return false;
        }
        return filterAssetsForPortraitRecipeRandomContext(
          sameSlotCandidates,
          profile,
          []
        ).some((candidate) => candidate.id === asset.id);
      });
    })
    .map((asset) => asset.id);

  expect(unreachable).toEqual([]);
}, 150_000);
