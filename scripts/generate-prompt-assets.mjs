#!/usr/bin/env node
/* eslint-env node */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const ROOT = process.cwd();
const DEFAULT_CONFIG = 'scripts/prompt-assets.batches.json';
const DEFAULT_OPENAI_MODEL = 'gpt-image-2';
const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-image-preview';
const DEFAULT_TUZI_MODEL = 'gpt-image-2';

function parseArgs(argv) {
  const args = {
    config: DEFAULT_CONFIG,
    batch: '',
    provider: process.env.PROMPT_ASSET_PROVIDER || 'auto',
    model: process.env.PROMPT_ASSET_IMAGE_MODEL || '',
    dryRun: false,
    cropOnly: '',
    sourceProvider: 'external'
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--config') args.config = argv[++i] || args.config;
    else if (arg === '--batch') args.batch = argv[++i] || '';
    else if (arg === '--provider') args.provider = argv[++i] || args.provider;
    else if (arg === '--model') args.model = argv[++i] || '';
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--crop-only') args.cropOnly = argv[++i] || '';
    else if (arg === '--source-provider')
      args.sourceProvider = argv[++i] || args.sourceProvider;
    else if (arg === '--help') {
      printHelp();
      process.exit(0);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  pnpm prompt-assets -- --batch top-soft-outerwear-pilot
  node scripts/generate-prompt-assets.mjs --batch top-soft-outerwear-pilot --provider gemini
  node scripts/generate-prompt-assets.mjs --batch top-soft-outerwear-pilot --provider tuzi
  node scripts/generate-prompt-assets.mjs --batch top-soft-outerwear-pilot --crop-only path/to/grid.png

Options:
  --batch <id>       Required batch id from scripts/prompt-assets.batches.json
  --provider <name>  auto | openai | gemini | tuzi | dry-run
  --model <name>     Override model name
  --dry-run          Build prompt and manifest plan without API calls
  --crop-only <png>  Skip generation and crop an existing contact sheet
  --source-provider  Provenance label for --crop-only, e.g. builtin-imagegen
`);
}

async function loadDotEnv(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .forEach((line) => {
        const eq = line.indexOf('=');
        if (eq === -1) return;
        const key = line.slice(0, eq).trim();
        const rawValue = line.slice(eq + 1).trim();
        if (!key || process.env[key]) return;
        process.env[key] = rawValue.replace(/^["']|["']$/g, '');
      });
  } catch {
    // Optional env files are allowed to be absent.
  }
}

async function loadEnvFiles() {
  await loadDotEnv(path.join(ROOT, '.env.local'));
  await loadDotEnv(path.join(ROOT, '.env'));
  await loadDotEnv(path.join(ROOT, '.vercel/.env.production.local'));
  await loadDotEnv(path.join(ROOT, '.vercel/.env.preview.local'));
  await loadDotEnv(path.join(ROOT, 'server/.env'));
  await loadDotEnv(path.join(ROOT, 'api/.env'));
}

function resolveProvider(provider) {
  if (provider === 'auto') {
    if (process.env.OPENAI_API_KEY) return 'openai';
    if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)
      return 'gemini';
    if (getTuziConnection().apiKey) return 'tuzi';
    return 'dry-run';
  }
  return provider;
}

function parseChannelConnection(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return { apiKey: '', apiBaseUrl: '' };
  if (!trimmed.startsWith('{')) return { apiKey: trimmed, apiBaseUrl: '' };

  try {
    const parsed = JSON.parse(trimmed);
    return {
      apiKey: typeof parsed.key === 'string' ? parsed.key.trim() : '',
      apiBaseUrl: typeof parsed.url === 'string' ? parsed.url.trim() : ''
    };
  } catch {
    return { apiKey: trimmed, apiBaseUrl: '' };
  }
}

function normalizeBaseUrl(value) {
  return String(value || 'https://api.tu-zi.com').replace(/\/+$/g, '');
}

function getTuziConnection() {
  const connection = parseChannelConnection(
    process.env.PROMPT_ASSET_TUZI_API_KEY || process.env.TUZI_API_KEY
  );
  return {
    apiKey: connection.apiKey,
    apiBaseUrl: normalizeBaseUrl(
      process.env.PROMPT_ASSET_TUZI_API_BASE_URL ||
        connection.apiBaseUrl ||
        process.env.TUZI_API_BASE_URL ||
        'https://api.tu-zi.com'
    )
  };
}

async function readConfig(configPath) {
  const raw = await fs.readFile(path.resolve(ROOT, configPath), 'utf8');
  return JSON.parse(raw);
}

function assertBatch(batch, existingManifest) {
  if (!batch) throw new Error('Batch not found.');
  const validStatuses = new Set(['pending', 'ready']);
  const status = batch.status;
  const isLegacyPublishedBatch =
    !status &&
    existingManifest.assets.some((asset) => asset.sourceBatchId === batch.id);
  if (status && !validStatuses.has(status)) {
    throw new Error(
      `Batch ${batch.id} has invalid status ${status}; expected pending or ready.`
    );
  }
  if (!status && !isLegacyPublishedBatch) {
    throw new Error(
      `Batch ${batch.id} has no explicit status. New batches must be pending or ready; only already-published legacy batches may omit status.`
    );
  }
  const expected = batch.grid.columns * batch.grid.rows;
  if (batch.assets.length !== expected) {
    throw new Error(
      `Batch ${batch.id} has ${batch.assets.length} assets but grid expects ${expected}.`
    );
  }
  if (
    batch.manifestMetadataPolicy &&
    !['reject-conflict', 'preserve', 'replace'].includes(
      batch.manifestMetadataPolicy
    )
  ) {
    throw new Error(
      `Batch ${batch.id} has invalid manifestMetadataPolicy ${batch.manifestMetadataPolicy}.`
    );
  }
  return status || 'ready';
}

function buildPrompt(batch) {
  const labels = batch.assets
    .map((asset, index) => `${index + 1}. ${asset.title}: ${asset.subtitle}`)
    .join('\n');

  return `${batch.prompt}

Cell order, left-to-right and top-to-bottom:
${labels}

Critical contact-sheet constraints:
- keep every cell visually separated
- each item must stay inside its own grid cell
- no text, no captions, no numbers, no watermark
- no extra items beyond the requested cells`;
}

async function generateWithOpenAI({ apiKey, model, prompt, size }) {
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      prompt,
      size,
      n: 1
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `OpenAI image generation failed: ${response.status} ${JSON.stringify(data)}`
    );
  }

  const item = data.data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, 'base64');
  if (item?.url) {
    const imageResponse = await fetch(item.url);
    if (!imageResponse.ok) {
      throw new Error(
        `Failed to download OpenAI image: ${imageResponse.status}`
      );
    }
    return Buffer.from(await imageResponse.arrayBuffer());
  }
  throw new Error('OpenAI response did not include an image.');
}

async function generateWithTuzi({ apiKey, apiBaseUrl, model, prompt, size }) {
  if (!apiKey) throw new Error('Tuzi API key is not configured.');
  const response = await fetch(
    `${normalizeBaseUrl(apiBaseUrl)}/v1/images/generations`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        prompt,
        size,
        n: 1
      })
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Tuzi image generation failed: ${response.status} ${JSON.stringify(data)}`
    );
  }

  const item = data.data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, 'base64');
  if (item?.url) {
    const imageResponse = await fetch(item.url);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download Tuzi image: ${imageResponse.status}`);
    }
    return Buffer.from(await imageResponse.arrayBuffer());
  }
  throw new Error('Tuzi response did not include an image.');
}

async function generateWithGemini({ apiKey, model, prompt, size }) {
  const imageSize = size.replace('x', 'x');
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: { imageSize }
        }
      })
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Gemini image generation failed: ${response.status} ${JSON.stringify(data)}`
    );
  }

  const imagePart = data.candidates?.[0]?.content?.parts?.find(
    (part) => part.inlineData?.data
  );
  if (!imagePart?.inlineData?.data) {
    throw new Error('Gemini response did not include an image.');
  }
  return Buffer.from(imagePart.inlineData.data, 'base64');
}

async function cropGrid({ gridPath, outputRoot, batch }) {
  const image = sharp(gridPath);
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`Could not read image dimensions: ${gridPath}`);
  }

  const gridRemainderX = metadata.width % batch.grid.columns;
  const gridRemainderY = metadata.height % batch.grid.rows;
  const gridOffsetX = Math.floor(gridRemainderX / 2);
  const gridOffsetY = Math.floor(gridRemainderY / 2);
  const cellWidth = Math.floor(metadata.width / batch.grid.columns);
  const cellHeight = Math.floor(metadata.height / batch.grid.rows);
  const cropInsetPx = Number(batch.cropInsetPx || 0);
  if (!Number.isInteger(cropInsetPx) || cropInsetPx < 0) {
    throw new Error(`Batch ${batch.id} has invalid cropInsetPx.`);
  }
  const cropSize = Math.min(cellWidth, cellHeight) - cropInsetPx * 2;
  const outputSize = Number(batch.outputSize || 768);
  if (!Number.isInteger(outputSize) || outputSize < 1) {
    throw new Error(`Batch ${batch.id} has invalid outputSize.`);
  }
  if (cropSize < outputSize) {
    throw new Error(
      `Grid ${metadata.width}x${metadata.height} provides only ${cropSize}px source detail per cropped cell, below requested ${outputSize}px. Regenerate a larger native grid instead of upscaling.`
    );
  }

  const manifestAssets = [];

  for (let row = 0; row < batch.grid.rows; row += 1) {
    for (let col = 0; col < batch.grid.columns; col += 1) {
      const index = row * batch.grid.columns + col;
      const asset = batch.assets[index];
      const left =
        gridOffsetX + col * cellWidth + Math.floor((cellWidth - cropSize) / 2);
      const top =
        gridOffsetY +
        row * cellHeight +
        Math.floor((cellHeight - cropSize) / 2);
      const fileName = `${asset.id}.webp`;
      const assetSlot = asset.slot || batch.slot;
      const slotDir = path.join(outputRoot, assetSlot);
      const outPath = path.join(slotDir, fileName);
      await fs.mkdir(slotDir, { recursive: true });

      const cellImage = sharp(gridPath).extract({
        left,
        top,
        width: cropSize,
        height: cropSize
      });
      const finalImage =
        cropSize === outputSize
          ? cellImage
          : cellImage.resize(outputSize, outputSize, {
              fit: 'cover',
              withoutEnlargement: true
            });
      await finalImage.webp({ quality: 88 }).toFile(outPath);

      if (typeof batch.edgeGuardMaxNearWhiteRatio === 'number') {
        const { data, info } = await sharp(outPath)
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const ring = Math.min(
          8,
          Math.floor(Math.min(info.width, info.height) / 4)
        );
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
        const ratio = edgePixels > 0 ? nearWhitePixels / edgePixels : 0;
        if (ratio > batch.edgeGuardMaxNearWhiteRatio) {
          throw new Error(
            `${asset.id} has ${(ratio * 100).toFixed(1)}% near-white edge pixels, above batch limit ${(batch.edgeGuardMaxNearWhiteRatio * 100).toFixed(1)}%. Increase cropInsetPx or regenerate without cell frames.`
          );
        }
      }

      manifestAssets.push({
        ...asset,
        slot: assetSlot,
        thumbnailUrl: `/assets/prompt-library/${assetSlot}/${fileName}`,
        sourceBatchId: batch.id
      });
    }
  }

  return manifestAssets;
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

function getMetadataConflicts(existing, generated) {
  return AUTHORITATIVE_ASSET_FIELDS.filter(
    (field) =>
      JSON.stringify(existing[field] ?? null) !==
      JSON.stringify(generated[field] ?? null)
  );
}

function assertManifestMetadataCompatibility(batch, existingManifest) {
  const byId = new Map(
    existingManifest.assets.map((asset) => [asset.id, asset])
  );
  const policy = batch.manifestMetadataPolicy || 'reject-conflict';
  for (const asset of batch.assets) {
    const existing = byId.get(asset.id);
    if (!existing) continue;
    const generated = { ...asset, slot: asset.slot || batch.slot };
    const conflicts = getMetadataConflicts(existing, generated);
    if (conflicts.length > 0 && policy === 'reject-conflict') {
      throw new Error(
        `Batch ${batch.id} would replace thumbnail ${asset.id} while preserving conflicting metadata fields: ${conflicts.join(', ')}. Use a new stable id or explicitly choose manifestMetadataPolicy preserve/replace.`
      );
    }
  }
}

async function mergeManifest(outputRoot, generatedAssets, batch) {
  const manifestPath = path.join(outputRoot, 'manifest.generated.json');
  let manifest = { assets: [] };

  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch {
    // First run.
  }

  const byId = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  generatedAssets.forEach((asset) => {
    const existing = byId.get(asset.id);
    if (!existing) {
      byId.set(asset.id, asset);
      return;
    }

    const conflicts = getMetadataConflicts(existing, asset);
    const policy = batch.manifestMetadataPolicy || 'reject-conflict';
    if (conflicts.length > 0 && policy === 'reject-conflict') {
      throw new Error(
        `Batch ${batch.id} would replace thumbnail ${asset.id} while preserving conflicting metadata fields: ${conflicts.join(', ')}. Use a new stable id or explicitly choose manifestMetadataPolicy preserve/replace.`
      );
    }
    if (conflicts.length > 0 && policy === 'replace') {
      byId.set(asset.id, asset);
      return;
    }
    byId.set(asset.id, {
      ...existing,
      thumbnailUrl: asset.thumbnailUrl,
      sourceBatchId: asset.sourceBatchId
    });
  });
  manifest.assets = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));

  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifestPath;
}

async function readExistingManifest(outputRoot) {
  try {
    const raw = await fs.readFile(
      path.join(outputRoot, 'manifest.generated.json'),
      'utf8'
    );
    const parsed = JSON.parse(raw);
    return { assets: Array.isArray(parsed.assets) ? parsed.assets : [] };
  } catch {
    return { assets: [] };
  }
}

async function writeGenerationMetadata({
  generatedDir,
  gridPath,
  batch,
  sourceProvider
}) {
  const metadata = await sharp(gridPath).metadata();
  const bytes = await fs.readFile(gridPath);
  const cellWidth = Math.floor(metadata.width / batch.grid.columns);
  const cellHeight = Math.floor(metadata.height / batch.grid.rows);
  const cropInsetPx = Number(batch.cropInsetPx || 0);
  const sourceCellSize = Math.min(cellWidth, cellHeight) - cropInsetPx * 2;
  const promptFiles = (await fs.readdir(generatedDir))
    .filter((name) => name.endsWith('.imagegen.txt'))
    .sort();
  const record = {
    batchId: batch.id,
    sourceProvider,
    promptFiles,
    sourceGrid: {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex')
    },
    crop: {
      columns: batch.grid.columns,
      rows: batch.grid.rows,
      cropInsetPx,
      sourceCellSize,
      outputSize: batch.outputSize || 768,
      enlargementApplied: sourceCellSize < (batch.outputSize || 768)
    }
  };
  const metadataPath = path.join(generatedDir, 'generation-metadata.json');
  await fs.writeFile(metadataPath, `${JSON.stringify(record, null, 2)}\n`);
  return metadataPath;
}

async function writeDraftManifest(generatedDir, generatedAssets) {
  const manifestPath = path.join(generatedDir, 'manifest.draft.json');
  const draftAssets = generatedAssets.map((asset) => ({
    ...asset,
    thumbnailUrl: `staged/${asset.slot}/${asset.id}.webp`
  }));
  await fs.writeFile(
    manifestPath,
    `${JSON.stringify({ assets: draftAssets }, null, 2)}\n`
  );
  return manifestPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadEnvFiles();

  const config = await readConfig(args.config);
  const batch = config.batches.find((item) => item.id === args.batch);
  const outputRoot = path.resolve(ROOT, config.outputRoot);
  const existingManifest = await readExistingManifest(outputRoot);
  const publicationStatus = assertBatch(batch, existingManifest);
  if (publicationStatus === 'ready') {
    assertManifestMetadataCompatibility(batch, existingManifest);
  }
  const generatedDir = path.join(outputRoot, '_generated', batch.id);
  await fs.mkdir(generatedDir, { recursive: true });

  const provider = args.dryRun ? 'dry-run' : resolveProvider(args.provider);
  const model =
    args.model ||
    (provider === 'openai'
      ? DEFAULT_OPENAI_MODEL
      : provider === 'tuzi'
        ? DEFAULT_TUZI_MODEL
        : DEFAULT_GEMINI_MODEL);
  const prompt = buildPrompt(batch);
  const gridPath = args.cropOnly
    ? path.resolve(ROOT, args.cropOnly)
    : path.join(generatedDir, 'grid.png');
  const promptPath = path.join(generatedDir, 'prompt.txt');

  await fs.writeFile(promptPath, `${prompt}\n`);

  console.log(`[prompt-assets] batch=${batch.id}`);
  const sourceProvider = args.cropOnly ? args.sourceProvider : provider;
  console.log(`[prompt-assets] provider=${sourceProvider}`);
  console.log(`[prompt-assets] model=${model}`);
  console.log(`[prompt-assets] prompt=${path.relative(ROOT, promptPath)}`);

  if (!args.cropOnly && provider !== 'dry-run') {
    let imageBuffer;
    if (provider === 'openai') {
      imageBuffer = await generateWithOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        model,
        prompt,
        size: batch.size
      });
    } else if (provider === 'tuzi') {
      imageBuffer = await generateWithTuzi({
        ...getTuziConnection(),
        model,
        prompt,
        size: batch.size
      });
    } else {
      imageBuffer = await generateWithGemini({
        apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
        model,
        prompt,
        size: batch.size
      });
    }

    await sharp(imageBuffer).png().toFile(gridPath);
    console.log(`[prompt-assets] grid=${path.relative(ROOT, gridPath)}`);
  }

  if (provider === 'dry-run' && !args.cropOnly) {
    console.log(
      '[prompt-assets] dry run complete; no image generated or cropped.'
    );
    return;
  }

  const generationMetadataPath = await writeGenerationMetadata({
    generatedDir,
    gridPath,
    batch,
    sourceProvider
  });
  console.log(
    `[prompt-assets] generation-metadata=${path.relative(ROOT, generationMetadataPath)}`
  );

  const pending = publicationStatus === 'pending';
  const cropOutputRoot = pending
    ? path.join(generatedDir, 'staged')
    : outputRoot;
  const generatedAssets = await cropGrid({
    gridPath,
    outputRoot: cropOutputRoot,
    batch
  });
  if (pending) {
    const draftManifestPath = await writeDraftManifest(
      generatedDir,
      generatedAssets
    );
    console.log(`[prompt-assets] staged=${generatedAssets.length}`);
    console.log(
      `[prompt-assets] draft-manifest=${path.relative(ROOT, draftManifestPath)}`
    );
    console.log(
      '[prompt-assets] pending batch kept outside public assets; visually approve the grid, change status to ready, then rerun with --crop-only.'
    );
    return;
  }
  const manifestPath = await mergeManifest(outputRoot, generatedAssets, batch);
  await Promise.all([
    fs.rm(path.join(generatedDir, 'staged'), { recursive: true, force: true }),
    fs.rm(path.join(generatedDir, 'manifest.draft.json'), { force: true })
  ]);
  console.log(`[prompt-assets] cropped=${generatedAssets.length}`);
  console.log(`[prompt-assets] manifest=${path.relative(ROOT, manifestPath)}`);
}

main().catch((error) => {
  console.error(
    `[prompt-assets] ${error instanceof Error ? error.message : error}`
  );
  process.exit(1);
});
