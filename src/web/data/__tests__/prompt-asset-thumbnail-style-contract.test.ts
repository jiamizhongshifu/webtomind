import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type PromptAssetBatch = {
  id: string;
  slot: string;
  prompt: string;
};

type ManifestAsset = {
  id: string;
  slot: string;
  sourceBatchId: string;
};

const batchConfig = JSON.parse(
  readFileSync(
    path.resolve(process.cwd(), 'scripts/prompt-assets.batches.json'),
    'utf8'
  )
) as { batches: PromptAssetBatch[] };

const batchesById = new Map(
  batchConfig.batches.map((batch) => [batch.id, batch])
);

const { assets: manifestAssets } = JSON.parse(
  readFileSync(
    path.resolve(
      process.cwd(),
      'src/web/assets/prompt-library/manifest.generated.json'
    ),
    'utf8'
  )
) as { assets: ManifestAsset[] };

const personPollutedAccessoryIds = new Set([
  'accessory-black-beret',
  'accessory-crossbody-phone-pouch',
  'accessory-deep-red-waist-sash',
  'accessory-delicate-waist-chain',
  'accessory-lace-choker',
  'accessory-natural-canvas-tote',
  'accessory-polished-chain-belt',
  'accessory-red-hair-clips',
  'accessory-red-hair-ribbon',
  'accessory-silver-pendant',
  'accessory-slim-leather-belt',
  'accessory-star-hairpin',
  'accessory-structured-satchel',
  'accessory-wide-sculpted-waist-belt'
]);

const personPollutedPropIds = new Set([
  'prop-black-vinyl-record',
  'prop-coffee-cup',
  'prop-compact-camera',
  'prop-compact-silver-flashlight',
  'prop-flower-bouquet',
  'prop-folded-city-map',
  'prop-folded-paper-fan',
  'prop-open-book',
  'prop-retro-cassette-player',
  'prop-ribbon-gift-box',
  'prop-robot-workbench-tools',
  'prop-sketchbook-pencil',
  'prop-small-football-foreground',
  'prop-smartphone',
  'prop-transparent-umbrella',
  'prop-vintage-microphone',
  'prop-white-headphones',
  'prop-white-insulated-thermos'
]);

describe('public prompt asset thumbnail style contracts', () => {
  it('keeps every visual-effect thumbnail on the East Asian portrait baseline', () => {
    const assets = manifestAssets.filter(
      (asset) => asset.slot === 'visualEffect'
    );

    expect(assets).toHaveLength(21);
    expect(
      assets.every((asset) =>
        /^(portrait-visualeffect-eastasian-unification-|portrait-visualeffect-surreal-overlay-)/.test(
          asset.sourceBatchId ?? ''
        )
      )
    ).toBe(true);
  });

  it('keeps character thumbnails on one studio system with persona-specific wardrobe', () => {
    const assets = manifestAssets.filter((asset) => asset.slot === 'character');

    expect(assets).toHaveLength(46);
    for (const asset of assets) {
      expect(asset.sourceBatchId).toMatch(
        /^portrait-character-persona-wardrobe-[a-f]-v2-20260715$/
      );
      const batch = batchesById.get(asset.sourceBatchId ?? '');
      expect(batch?.prompt).toMatch(/persona-specific wardrobe/i);
      expect(batch?.prompt).toMatch(/never the same charcoal crew-neck top/i);
    }
  });

  it('routes formerly person-polluted accessories through object-only batches', () => {
    const assets = manifestAssets.filter((asset) =>
      personPollutedAccessoryIds.has(asset.id)
    );

    expect(assets).toHaveLength(personPollutedAccessoryIds.size);
    for (const asset of assets) {
      const batch = batchesById.get(asset.sourceBatchId ?? '');
      expect(batch?.slot).toBe('accessory');
      expect(batch?.prompt).toMatch(/accessory-only product/i);
      expect(batch?.prompt).toMatch(/no person/i);
    }
  });

  it('routes formerly person-polluted props through hand-free product batches', () => {
    const assets = manifestAssets.filter((asset) =>
      personPollutedPropIds.has(asset.id)
    );

    expect(assets).toHaveLength(personPollutedPropIds.size);
    for (const asset of assets) {
      const batch = batchesById.get(asset.sourceBatchId ?? '');
      expect(batch?.slot).toBe('prop');
      expect(batch?.prompt).toMatch(/prop-only product/i);
      expect(batch?.prompt).toMatch(/never render the hand/i);
    }
  });
});
