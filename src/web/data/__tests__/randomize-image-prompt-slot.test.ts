import { describe, expect, it } from 'vitest';
import {
  defaultImagePromptSelection,
  randomizeImagePromptSelectionSlot,
  setImagePromptAssetSelection,
  type ImagePromptAsset
} from '../image-prompt-core';

const assets: ImagePromptAsset[] = [
  {
    id: 'background-first',
    slot: 'background',
    title: 'First scene',
    subtitle: 'First',
    prompt: 'first scene',
    tags: ['portrait'],
    visual: { tone: '#fff', accent: '#111', shape: 'landscape' }
  },
  {
    id: 'background-second',
    slot: 'background',
    title: 'Second scene',
    subtitle: 'Second',
    prompt: 'second scene',
    tags: ['portrait'],
    visual: { tone: '#fff', accent: '#222', shape: 'landscape' }
  }
];

function asset(
  id: string,
  slot: ImagePromptAsset['slot'],
  prompt = id
): ImagePromptAsset {
  return {
    id,
    slot,
    title: id,
    subtitle: id,
    prompt,
    tags: ['portrait'],
    visual: { tone: '#fff', accent: '#111', shape: 'style' }
  };
}

describe('randomizeImagePromptSelectionSlot', () => {
  it('changes only the requested slot and avoids the current asset', () => {
    const initial = setImagePromptAssetSelection(
      defaultImagePromptSelection,
      assets[0]
    );
    const randomized = randomizeImagePromptSelectionSlot(
      initial,
      'background',
      assets,
      () => 0
    );

    expect(randomized.background).toBe('background-second');
    expect(randomized.character).toBe(initial.character);
  });

  it('keeps the selection unchanged when the slot has no eligible assets', () => {
    const randomized = randomizeImagePromptSelectionSlot(
      defaultImagePromptSelection,
      'lighting',
      assets,
      () => 0
    );

    expect(randomized).toEqual(defaultImagePromptSelection);
  });

  it('replaces a multi-select category with exactly one random asset', () => {
    const lightingAssets = [
      asset('lighting-first', 'lighting'),
      asset('lighting-second', 'lighting'),
      asset('lighting-third', 'lighting')
    ];
    const initial = {
      ...defaultImagePromptSelection,
      lighting: ['lighting-first', 'lighting-second']
    };

    const randomized = randomizeImagePromptSelectionSlot(
      initial,
      'lighting',
      lightingAssets,
      () => 0
    );

    expect(randomized.lighting).toEqual(['lighting-third']);
  });

  it('clears footwear when a randomized shot does not show it', () => {
    const compatibilityAssets = [
      asset('shoes-test', 'shoes'),
      asset('shot-full-body', 'shot', 'full-body portrait'),
      asset('shot-face-closeup', 'shot', 'face close-up portrait')
    ];
    const initial = {
      ...defaultImagePromptSelection,
      shoes: 'shoes-test',
      shot: 'shot-full-body'
    };

    const randomized = randomizeImagePromptSelectionSlot(
      initial,
      'shot',
      compatibilityAssets,
      () => 0
    );

    expect(randomized.shot).toBe('shot-face-closeup');
    expect(randomized.shoes).toBeNull();
  });

  it('clears props when a randomized pose occupies the hands', () => {
    const compatibilityAssets = [
      asset('prop-phone', 'prop'),
      asset('pose-standing', 'pose', 'standing portrait'),
      asset('pose-facepalm', 'pose', 'facepalm portrait')
    ];
    const initial = {
      ...defaultImagePromptSelection,
      prop: ['prop-phone'],
      pose: 'pose-standing'
    };

    const randomized = randomizeImagePromptSelectionSlot(
      initial,
      'pose',
      compatibilityAssets,
      () => 0
    );

    expect(randomized.pose).toBe('pose-facepalm');
    expect(randomized.prop).toEqual([]);
  });

  it('clears handheld props when a randomized close-up cannot show hands', () => {
    const compatibilityAssets = [
      asset('prop-phone', 'prop'),
      asset('shot-waist-up', 'shot', 'waist-up portrait'),
      asset('shot-face-closeup', 'shot', 'face close-up portrait')
    ];
    const initial = {
      ...defaultImagePromptSelection,
      prop: ['prop-phone'],
      shot: 'shot-waist-up'
    };

    const randomized = randomizeImagePromptSelectionSlot(
      initial,
      'shot',
      compatibilityAssets,
      () => 0
    );

    expect(randomized.shot).toBe('shot-face-closeup');
    expect(randomized.prop).toEqual([]);
  });

  it('keeps the current shot when the selected pose has no compatible candidate', () => {
    const compatibilityAssets = [
      asset('pose-running', 'pose', 'running full-body portrait'),
      asset('shot-face-closeup', 'shot', 'face close-up portrait')
    ];
    const initial = {
      ...defaultImagePromptSelection,
      pose: 'pose-running',
      shot: 'shot-existing'
    };

    const randomized = randomizeImagePromptSelectionSlot(
      initial,
      'shot',
      compatibilityAssets,
      () => 0
    );

    expect(randomized.shot).toBe('shot-existing');
  });
});
