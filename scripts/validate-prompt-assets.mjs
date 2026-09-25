#!/usr/bin/env node
/* eslint-env node */

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(
  ROOT,
  'src/web/assets/prompt-library/manifest.generated.json'
);
const BATCH_CONFIG_PATH = path.join(ROOT, 'scripts/prompt-assets.batches.json');
const PUBLIC_ASSET_PREFIX = '/assets/';
const MIN_FILE_BYTES = 2048;
const MIN_DIMENSION = 256;
const VALID_SLOTS = new Set([
  'character',
  'expression',
  'hairstyle',
  'pose',
  'top',
  'bottom',
  'outfit',
  'onePiece',
  'shoes',
  'background',
  'productSubject',
  'productSurface',
  'composition',
  'titleArea',
  'style',
  'lighting',
  'visualEffect',
  'layoutDesign',
  'accessory',
  'prop',
  'lens',
  'shot',
  'viewpoint',
  'makeup'
]);

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function localAssetPath(publicPath) {
  if (!publicPath.startsWith(PUBLIC_ASSET_PREFIX)) {
    throw new Error(`Invalid thumbnail path: ${publicPath}`);
  }
  return path.join(ROOT, 'src/web', publicPath);
}

async function getNearWhiteEdgeRatio(filePath) {
  const { data, info } = await sharp(filePath)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ring = Math.min(8, Math.floor(Math.min(info.width, info.height) / 4));
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
  return edgePixels > 0 ? nearWhitePixels / edgePixels : 0;
}

async function validateImage(asset, sourceBatch) {
  const filePath = localAssetPath(asset.thumbnailUrl);
  const stat = await fs.stat(filePath);
  if (stat.size < MIN_FILE_BYTES) {
    throw new Error(
      `${asset.id} image is suspiciously small: ${stat.size} bytes`
    );
  }

  const metadata = await sharp(filePath).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`${asset.id} image dimensions could not be read`);
  }
  if (metadata.width < MIN_DIMENSION || metadata.height < MIN_DIMENSION) {
    throw new Error(
      `${asset.id} image is too small: ${metadata.width}x${metadata.height}`
    );
  }
  if (!['webp', 'png', 'jpeg'].includes(metadata.format || '')) {
    throw new Error(`${asset.id} has unsupported format: ${metadata.format}`);
  }
  if (
    sourceBatch?.status === 'ready' &&
    sourceBatch.outputSize &&
    (metadata.width !== sourceBatch.outputSize ||
      metadata.height !== sourceBatch.outputSize)
  ) {
    throw new Error(
      `${asset.id} is ${metadata.width}x${metadata.height}, expected exact ready-batch output ${sourceBatch.outputSize}x${sourceBatch.outputSize}`
    );
  }
  if (
    sourceBatch?.status === 'ready' &&
    typeof sourceBatch.edgeGuardMaxNearWhiteRatio === 'number'
  ) {
    const ratio = await getNearWhiteEdgeRatio(filePath);
    if (ratio > sourceBatch.edgeGuardMaxNearWhiteRatio) {
      throw new Error(
        `${asset.id} has ${(ratio * 100).toFixed(1)}% near-white edge pixels, above ready-batch limit ${(sourceBatch.edgeGuardMaxNearWhiteRatio * 100).toFixed(1)}%`
      );
    }
  }
}

function validateAssetShape(asset) {
  if (!asset.id || typeof asset.id !== 'string') {
    throw new Error('Asset is missing id');
  }
  if (!VALID_SLOTS.has(asset.slot)) {
    throw new Error(`${asset.id} has invalid slot: ${asset.slot}`);
  }
  if (!asset.title || !asset.subtitle || !asset.prompt) {
    throw new Error(`${asset.id} is missing title, subtitle, or prompt`);
  }
  if (!Array.isArray(asset.tags) || asset.tags.length === 0) {
    throw new Error(`${asset.id} is missing tags`);
  }
  if (!asset.thumbnailUrl) {
    throw new Error(`${asset.id} is missing thumbnailUrl`);
  }
}

const AUTHORITATIVE_ASSET_FIELDS = [
  'slot',
  'title',
  'subtitle',
  'prompt',
  'promptZh',
  'negativePrompt',
  'negativePromptZh',
  'tags'
];

async function validateReadyBatchSource(batch) {
  const gridPath = path.join(
    ROOT,
    'src/web/assets/prompt-library/_generated',
    batch.id,
    'grid.png'
  );
  const metadataPath = path.join(
    ROOT,
    'src/web/assets/prompt-library/_generated',
    batch.id,
    'generation-metadata.json'
  );
  const grid = await sharp(gridPath).metadata();
  if (!grid.width || !grid.height) {
    throw new Error(`${batch.id} source grid dimensions could not be read`);
  }
  const sourceCellSize =
    Math.min(
      Math.floor(grid.width / batch.grid.columns),
      Math.floor(grid.height / batch.grid.rows)
    ) -
    Number(batch.cropInsetPx || 0) * 2;
  if (sourceCellSize < Number(batch.outputSize || 768)) {
    throw new Error(
      `${batch.id} source cell is ${sourceCellSize}px after inset, below output ${batch.outputSize || 768}px; publication would upscale the grid`
    );
  }
  const generationMetadata = await readJson(metadataPath);
  if (
    generationMetadata.batchId !== batch.id ||
    generationMetadata.crop?.sourceCellSize !== sourceCellSize ||
    generationMetadata.crop?.enlargementApplied !== false
  ) {
    throw new Error(
      `${batch.id} generation metadata does not prove native crop quality`
    );
  }
}

async function validateBatches(manifestAssets, batchConfig) {
  const manifestIds = new Set(manifestAssets.map((asset) => asset.id));
  const manifestById = new Map(
    manifestAssets.map((asset) => [asset.id, asset])
  );
  const activeBatchIds = new Set();
  const definedBatchIds = new Set();
  const pendingBatchIds = new Set();

  for (const batch of batchConfig.batches || []) {
    if (!batch.id || !VALID_SLOTS.has(batch.slot)) {
      throw new Error(`Invalid batch definition: ${batch.id || 'unknown'}`);
    }
    if (definedBatchIds.has(batch.id)) {
      throw new Error(`Duplicate batch id: ${batch.id}`);
    }
    if (batch.status && !['pending', 'ready'].includes(batch.status)) {
      throw new Error(`Invalid batch status for ${batch.id}: ${batch.status}`);
    }
    if (
      batch.manifestMetadataPolicy &&
      !['reject-conflict', 'preserve', 'replace'].includes(
        batch.manifestMetadataPolicy
      )
    ) {
      throw new Error(
        `Invalid manifestMetadataPolicy for ${batch.id}: ${batch.manifestMetadataPolicy}`
      );
    }
    const expectedCount = batch.grid.columns * batch.grid.rows;
    if (batch.assets.length !== expectedCount) {
      throw new Error(
        `${batch.id} has ${batch.assets.length} assets but grid expects ${expectedCount}`
      );
    }
    const batchAssetIds = new Set();
    for (const asset of batch.assets) {
      if (!asset.id || typeof asset.id !== 'string') {
        throw new Error(`${batch.id} contains an asset without an id`);
      }
      if (batchAssetIds.has(asset.id)) {
        throw new Error(`${batch.id} contains duplicate asset id ${asset.id}`);
      }
      batchAssetIds.add(asset.id);
    }
    definedBatchIds.add(batch.id);

    if (batch.status === 'pending') {
      pendingBatchIds.add(batch.id);
      continue;
    }

    activeBatchIds.add(batch.id);

    for (const asset of batch.assets) {
      if (!manifestIds.has(asset.id)) {
        throw new Error(`${asset.id} from ${batch.id} is missing in manifest`);
      }
      if (
        batch.status === 'ready' &&
        batch.manifestMetadataPolicy !== 'preserve'
      ) {
        const manifestAsset = manifestById.get(asset.id);
        const batchAsset = { ...asset, slot: asset.slot || batch.slot };
        const conflicts = AUTHORITATIVE_ASSET_FIELDS.filter(
          (field) =>
            JSON.stringify(manifestAsset?.[field] ?? null) !==
            JSON.stringify(batchAsset[field] ?? null)
        );
        if (conflicts.length > 0) {
          throw new Error(
            `${asset.id} thumbnail batch metadata disagrees with the public manifest: ${conflicts.join(', ')}`
          );
        }
      }
    }
    if (batch.status === 'ready') await validateReadyBatchSource(batch);
  }

  for (const asset of manifestAssets) {
    if (!activeBatchIds.has(asset.sourceBatchId)) {
      throw new Error(
        `${asset.id} references unknown batch ${asset.sourceBatchId}`
      );
    }
  }

  return { pendingBatchCount: pendingBatchIds.size };
}

async function main() {
  const manifest = await readJson(MANIFEST_PATH);
  const batchConfig = await readJson(BATCH_CONFIG_PATH);
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  if (assets.length === 0) {
    throw new Error('Prompt asset manifest is empty');
  }

  const ids = new Set();
  for (const asset of assets) {
    validateAssetShape(asset);
    if (ids.has(asset.id)) throw new Error(`Duplicate asset id: ${asset.id}`);
    ids.add(asset.id);
    const sourceBatch = (batchConfig.batches || []).find(
      (batch) => batch.id === asset.sourceBatchId
    );
    await validateImage(asset, sourceBatch);
  }

  const batchValidation = await validateBatches(assets, batchConfig);

  const bySlot = assets.reduce((counts, asset) => {
    counts[asset.slot] = (counts[asset.slot] || 0) + 1;
    return counts;
  }, {});

  console.log(
    `Validated ${assets.length} prompt assets across ${Object.keys(bySlot).length} slots; ${batchValidation.pendingBatchCount} pending production batch(es) kept outside the public manifest.`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
