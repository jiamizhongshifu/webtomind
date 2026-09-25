import { describe, expect, it } from 'vitest';
import {
  inferVisualRecipeSelectionFromPromptText,
  getLocalPublicImagePromptAssets,
  loadLocalPublicImagePromptAssets,
  mergeHydratedPromptAssetSlot,
  mergeRemoteAndCoreSlotAssets,
  mergeRemoteAndLocalAssets,
  resolvePublicLibrarySource,
  mergeVisualRecipeSelections,
  normalizeVisualRecipeSelection,
  resolveBrowsablePromptAssets,
  resolveVisualRecipeAssets,
  toImagePromptAsset
} from '../assetLibraryResolver';
import {
  getSelectedAssetIds,
  type ImagePromptAsset
} from '../../../data/image-prompt-core';
import { imagePromptAssetCatalog } from '../../../data/image-prompt-asset-catalog';

function asset(id: string, slot: ImagePromptAsset['slot']): ImagePromptAsset {
  return {
    id,
    slot,
    title: id,
    subtitle: '',
    prompt: `${id} prompt`,
    tags: [],
    visual: { tone: '#fff', accent: '#000', shape: 'style' }
  };
}

describe('assetLibraryResolver visual recipes', () => {
  it('keeps the complete local catalog behind the async browsing boundary', async () => {
    const coreAssets = getLocalPublicImagePromptAssets();
    const completeAssets = await loadLocalPublicImagePromptAssets();

    expect(completeAssets.length).toBeGreaterThan(coreAssets.length);
    expect(
      completeAssets.some(
        (asset) => asset.id === 'accessory-1920s-artdeco-crystal-barrette'
      )
    ).toBe(true);
    expect(
      coreAssets.some(
        (asset) => asset.id === 'accessory-1920s-artdeco-crystal-barrette'
      )
    ).toBe(false);
  });

  it('keeps published assets browsable even when they are excluded from random recipes', () => {
    const classroom = asset('background-old-classroom-sunset', 'background');
    const publicAssets = [
      classroom,
      asset('background-warm-studio', 'background')
    ];

    expect(resolveBrowsablePromptAssets('public', publicAssets, [])).toEqual(
      publicAssets
    );
    expect(
      resolveBrowsablePromptAssets('mine', publicAssets, [
        asset('background-my-upload', 'background')
      ]).map((item) => item.id)
    ).toEqual(['background-my-upload']);
  });

  it('does not revive remote assets removed from the local publication contract', () => {
    const merged = mergeRemoteAndLocalAssets(
      [
        asset('expression-retired-remote-only', 'expression'),
        asset('expression-calm-direct', 'expression')
      ],
      imagePromptAssetCatalog
    );

    expect(
      merged.some((item) => item.id === 'expression-retired-remote-only')
    ).toBe(false);
    expect(
      merged.filter((item) => item.id === 'expression-calm-direct')
    ).toHaveLength(1);
  });

  it('hydrates one published slot without replacing other core categories', () => {
    const remoteCharacter = asset('character-remote-only', 'character');
    const characterAssets = mergeRemoteAndCoreSlotAssets(
      [remoteCharacter],
      'character'
    );
    const hydrated = mergeHydratedPromptAssetSlot(
      getLocalPublicImagePromptAssets(),
      'character',
      characterAssets
    );

    expect(hydrated).toContain(remoteCharacter);
    expect(hydrated.some((item) => item.slot === 'expression')).toBe(true);
    expect(
      hydrated.filter((item) => item.slot === 'character').length
    ).toBeGreaterThan(1);
  });

  it('reports a hybrid source when built-in assets complete an incomplete cloud response', () => {
    const remote = [asset('expression-calm-direct', 'expression')];
    const merged = mergeRemoteAndLocalAssets(remote, imagePromptAssetCatalog);

    expect(merged.length).toBeGreaterThan(remote.length);
    expect(resolvePublicLibrarySource(remote, merged)).toBe('hybrid');
    expect(resolvePublicLibrarySource(merged, merged)).toBe('remote');
  });

  it('keeps versioned local artwork for curated expression and pose assets', () => {
    const resolved = toImagePromptAsset({
      id: 'pose-relaxed-standing',
      slot: 'pose',
      title: 'Remote pose',
      subtitle: 'Remote subtitle',
      prompt: 'remote prompt',
      tags: [],
      thumbnailUrl: 'https://cdn.example.com/stale-pose.webp'
    });

    expect(resolved.thumbnailUrl).toContain(
      '/prompt-library/pose/pose-relaxed-standing.webp'
    );
    expect(resolved.thumbnailUrl).not.toContain('stale-pose.webp');
  });

  it('versions remote artwork with its source batch when the URL is not content-versioned', () => {
    const resolved = toImagePromptAsset({
      id: 'visualEffect-rgb-split',
      slot: 'visualEffect',
      title: 'RGB split',
      subtitle: '',
      prompt: 'subtle RGB split',
      tags: [],
      thumbnailUrl: 'https://cdn.example.com/visual-effect.webp',
      sourceBatchId: 'portrait-visualeffect-unification-v2'
    });

    expect(resolved.thumbnailUrl).toBe(
      'https://cdn.example.com/visual-effect.webp?v=portrait-visualeffect-unification-v2'
    );
  });

  it('preserves the stronger content hash version returned by the sync pipeline', () => {
    const resolved = toImagePromptAsset({
      id: 'visualEffect-rgb-split',
      slot: 'visualEffect',
      title: 'RGB split',
      subtitle: '',
      prompt: 'subtle RGB split',
      tags: [],
      thumbnailUrl: 'https://cdn.example.com/visual-effect.webp?v=2cfd0a3d5a6d',
      sourceBatchId: 'portrait-visualeffect-unification-v2'
    });

    expect(resolved.thumbnailUrl).toBe(
      'https://cdn.example.com/visual-effect.webp?v=2cfd0a3d5a6d'
    );
  });

  it('normalizes direct selection maps into image prompt selection', () => {
    const selection = normalizeVisualRecipeSelection({
      selection: {
        character: 'character-korean-glam-girl',
        lighting: ['lighting-sunny', 'lighting-soft-rim']
      }
    });

    expect(selection).not.toBeNull();
    expect(getSelectedAssetIds(selection!, 'character')).toEqual([
      'character-korean-glam-girl'
    ]);
    expect(getSelectedAssetIds(selection!, 'lighting')).toEqual([
      'lighting-sunny',
      'lighting-soft-rim'
    ]);
  });

  it('normalizes match arrays and resolves them against public assets', () => {
    const selection = normalizeVisualRecipeSelection({
      version: 1,
      matches: [
        { slot: 'character', assetId: 'character-korean-glam-girl' },
        { slot: 'pose', asset: { id: 'pose-casual-sitting' } },
        { slot: 'background', prompt_asset_id: 'background-summer-beach' }
      ]
    });

    expect(selection).not.toBeNull();
    const resolved = resolveVisualRecipeAssets(selection!, [
      asset('character-korean-glam-girl', 'character'),
      asset('pose-casual-sitting', 'pose'),
      asset('background-summer-beach', 'background')
    ]);

    expect(resolved.map((item) => `${item.slot}:${item.asset.id}`)).toEqual([
      'character:character-korean-glam-girl',
      'pose:pose-casual-sitting',
      'background:background-summer-beach'
    ]);
  });

  it('infers key visual recipe slots from portrait prompt text', () => {
    const selection = inferVisualRecipeSelectionFromPromptText(
      '两个不同气质的韩国瓜子脸美女，青春款比基尼，瓷白肌，低角度仰拍。'
    );

    expect(selection).not.toBeNull();
    expect(getSelectedAssetIds(selection!, 'character')).toEqual([
      'character-public-expansion-01'
    ]);
    expect(getSelectedAssetIds(selection!, 'top')).toEqual([
      'top-youthful-bikini-top'
    ]);
    expect(getSelectedAssetIds(selection!, 'bottom')).toEqual([
      'bottom-youthful-bikini-briefs'
    ]);
  });

  it('keeps configured visual recipe slots and fills only missing inferred slots', () => {
    const configured = normalizeVisualRecipeSelection({
      selection: {
        top: 'top-custom',
        background: 'background-summer-beach'
      }
    });
    const inferred = inferVisualRecipeSelectionFromPromptText(
      'Two Korean young women wearing youthful bikini styling.'
    );
    const merged = mergeVisualRecipeSelections(configured, inferred);

    expect(merged).not.toBeNull();
    expect(getSelectedAssetIds(merged!, 'character')).toEqual([
      'character-public-expansion-01'
    ]);
    expect(getSelectedAssetIds(merged!, 'top')).toEqual(['top-custom']);
    expect(getSelectedAssetIds(merged!, 'bottom')).toEqual([
      'bottom-youthful-bikini-briefs'
    ]);
    expect(getSelectedAssetIds(merged!, 'background')).toEqual([
      'background-summer-beach'
    ]);
  });
});
