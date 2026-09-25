import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { getPortraitExpressionConflicts } from '../portrait-expression-compatibility';
import {
  applyPortraitExpressionTemperamentSearchAliases,
  portraitExpressionTemperamentCoverage
} from '../portrait-expression-temperaments';
import { imagePromptAssetCatalog as imagePromptAssets } from '../image-prompt-asset-catalog';

const BATCH_ID = 'portrait-expression-temperament-atlas-a-v2-20260716';
const HISTORICAL_IDS = [
  'expression-zany',
  'expression-smirk',
  'expression-roll-eyes',
  'expression-melting-face',
  'expression-quiet-looking-away',
  'expression-wuxia-calm-resolve',
  'expression-held-back-tears',
  'expression-pleading'
];

function readJson(relativePath: string) {
  return JSON.parse(
    readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')
  ) as Record<string, unknown>;
}

async function getNearWhiteEdgeRatio(filePath: string): Promise<number> {
  const { data, info } = await sharp(filePath)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ring = 8;
  let edgePixels = 0;
  let nearWhitePixels = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (
        x >= ring &&
        x < info.width - ring &&
        y >= ring &&
        y < info.height - ring
      ) {
        continue;
      }
      const offset = (y * info.width + x) * info.channels;
      edgePixels += 1;
      if (
        data[offset] >= 245 &&
        data[offset + 1] >= 245 &&
        data[offset + 2] >= 245
      ) {
        nearWhitePixels += 1;
      }
    }
  }
  return nearWhitePixels / edgePixels;
}

describe('portrait expression temperament coverage', () => {
  it('maps nine dedicated stable ids without changing historical meanings', () => {
    expect(portraitExpressionTemperamentCoverage).toHaveLength(9);
    const temperamentAssetIds = portraitExpressionTemperamentCoverage.map(
      (item) => item.assetId
    );
    expect(new Set(temperamentAssetIds).size).toBe(9);
    HISTORICAL_IDS.forEach((id) =>
      expect(temperamentAssetIds).not.toContain(id)
    );

    portraitExpressionTemperamentCoverage.forEach((item) => {
      expect(item.status).toBe('runtime-covered');
      const asset = imagePromptAssets.find(
        (candidate) => candidate.id === item.assetId
      );
      expect(asset, item.label).toBeDefined();
      expect(asset?.slot).toBe('expression');
      expect(asset?.tags).toContain(item.label);
      expect(asset?.searchAliases).toContain(item.label);
      expect(asset?.tags.some((tag) => /[a-z]/i.test(tag))).toBe(false);
      expect(getPortraitExpressionConflicts([asset!])).toEqual([]);
    });
  });

  it('keeps search aliases out of visible facet tags and prompt text', () => {
    const source = {
      id: 'expression-grotesque-humor',
      slot: 'expression',
      prompt: 'authoritative prompt',
      promptZh: '权威提示词',
      tags: ['怪诞幽默']
    };
    const result = applyPortraitExpressionTemperamentSearchAliases(source);

    expect(result.tags).toEqual(['怪诞幽默']);
    expect(result.searchAliases).toContain('grotesque humor');
    expect(result.prompt).toBe('authoritative prompt');
    expect(result.promptZh).toBe('权威提示词');
  });

  it('publishes native crops whose manifest metadata exactly matches the grid ledger', async () => {
    const config = readJson('scripts/prompt-assets.batches.json') as {
      batches: Array<{
        id: string;
        slot: string;
        status?: string;
        outputSize: number;
        cropInsetPx: number;
        edgeGuardMaxNearWhiteRatio: number;
        prompt: string;
        grid: { columns: number; rows: number };
        assets: Array<Record<string, unknown> & { id: string }>;
      }>;
    };
    const manifest = readJson(
      'src/web/assets/prompt-library/manifest.generated.json'
    ) as { assets: Array<Record<string, unknown> & { id: string }> };
    const batch = config.batches.find((item) => item.id === BATCH_ID);

    expect(batch).toMatchObject({
      slot: 'expression',
      status: 'ready',
      outputSize: 400,
      cropInsetPx: 8,
      grid: { columns: 3, rows: 3 }
    });
    expect(batch?.assets).toHaveLength(9);
    expect(batch?.prompt).toContain('fixed level chin');
    expect(batch?.prompt).not.toMatch(
      /chin gently tucked|slight head offset|subtly lowered head/
    );

    for (const batchAsset of batch?.assets || []) {
      const manifestAsset = manifest.assets.find(
        (asset) => asset.id === batchAsset.id
      );
      expect(manifestAsset?.sourceBatchId).toBe(BATCH_ID);
      for (const field of [
        'slot',
        'title',
        'subtitle',
        'prompt',
        'promptZh',
        'tags'
      ]) {
        const expected =
          field === 'slot' ? batchAsset.slot || batch?.slot : batchAsset[field];
        expect(manifestAsset?.[field], `${batchAsset.id}.${field}`).toEqual(
          expected
        );
      }

      const imagePath = path.resolve(
        process.cwd(),
        'src/web/assets/prompt-library/expression',
        `${batchAsset.id}.webp`
      );
      expect(existsSync(imagePath)).toBe(true);
      const metadata = await sharp(imagePath).metadata();
      expect([metadata.width, metadata.height]).toEqual([400, 400]);
      expect(await getNearWhiteEdgeRatio(imagePath)).toBeLessThanOrEqual(
        batch?.edgeGuardMaxNearWhiteRatio || 0
      );
    }
  });

  it('restores historical expression thumbnails to their original batches', () => {
    const manifest = readJson(
      'src/web/assets/prompt-library/manifest.generated.json'
    ) as { assets: Array<{ id: string; sourceBatchId: string }> };
    HISTORICAL_IDS.forEach((id) => {
      const asset = manifest.assets.find((item) => item.id === id);
      expect(asset?.sourceBatchId).not.toBe(BATCH_ID);
    });
  });
});
