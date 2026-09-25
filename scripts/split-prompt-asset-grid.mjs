#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const DEFAULT_GRID_COLUMNS = 4;
const DEFAULT_GRID_ROWS = 4;
const DEFAULT_OUTPUT_SIZE = 768;
const PROMPT_LIBRARY_ROOT = path.join(ROOT, 'src/web/assets/prompt-library');
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
  'composition',
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

function parseArgs(argv) {
  const args = {
    input: '',
    slot: '',
    batchId: '',
    idPrefix: '',
    outDir: '',
    titlePrefix: '',
    manifestOut: '',
    outputSize: DEFAULT_OUTPUT_SIZE,
    columns: DEFAULT_GRID_COLUMNS,
    rows: DEFAULT_GRID_ROWS
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--input') args.input = argv[++i] || '';
    else if (arg === '--slot') args.slot = argv[++i] || '';
    else if (arg === '--batch-id') args.batchId = argv[++i] || '';
    else if (arg === '--id-prefix') args.idPrefix = argv[++i] || '';
    else if (arg === '--out-dir') args.outDir = argv[++i] || '';
    else if (arg === '--title-prefix') args.titlePrefix = argv[++i] || '';
    else if (arg === '--manifest-out') args.manifestOut = argv[++i] || '';
    else if (arg === '--output-size') {
      args.outputSize = Number(argv[++i] || DEFAULT_OUTPUT_SIZE);
    } else if (arg === '--columns') {
      args.columns = Number(argv[++i] || DEFAULT_GRID_COLUMNS);
    } else if (arg === '--rows') {
      args.rows = Number(argv[++i] || DEFAULT_GRID_ROWS);
    } else if (arg === '--help') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  pnpm prompt-assets:split-grid -- --input path/to/grid.png --slot style --batch-id style-refresh-20260630 --id-prefix style-refresh --out-dir src/web/assets/prompt-library/style --title-prefix "风格素材"

Options:
  --input <path>         Required. Contact sheet image from imagegen
  --slot <slot>          Required. Prompt asset slot, e.g. character/style/lighting
  --batch-id <id>        Required. Source batch id written into manifest draft
  --id-prefix <prefix>   Required. Output ids become <prefix>-01 ... <prefix>-16
  --out-dir <dir>        Required. Directory for 16 cropped webp files
  --title-prefix <text>  Optional. Draft title prefix; defaults to id prefix
  --manifest-out <path>  Optional. Defaults to <out-dir>/<batch-id>.manifest.draft.json
  --output-size <px>     Optional. Square webp size, default ${DEFAULT_OUTPUT_SIZE}
  --columns <count>      Optional. Grid columns, default ${DEFAULT_GRID_COLUMNS}
  --rows <count>         Optional. Grid rows, default ${DEFAULT_GRID_ROWS}
`);
}

function assertArgs(args) {
  const required = ['input', 'slot', 'batchId', 'idPrefix', 'outDir'];
  const missing = required.filter((key) => !args[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required option(s): ${missing.join(', ')}`);
  }
  if (!VALID_SLOTS.has(args.slot)) {
    throw new Error(`Invalid slot: ${args.slot}`);
  }
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(args.idPrefix)) {
    throw new Error(
      '--id-prefix must be a lowercase slug using letters, numbers, and hyphens'
    );
  }
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(args.batchId)) {
    throw new Error(
      '--batch-id must be a lowercase slug using letters, numbers, and hyphens'
    );
  }
  if (!Number.isInteger(args.outputSize) || args.outputSize < 256) {
    throw new Error('--output-size must be an integer >= 256');
  }
  if (!Number.isInteger(args.columns) || args.columns < 1) {
    throw new Error('--columns must be a positive integer');
  }
  if (!Number.isInteger(args.rows) || args.rows < 1) {
    throw new Error('--rows must be a positive integer');
  }
}

function assetId(idPrefix, index) {
  return `${idPrefix}-${String(index + 1).padStart(2, '0')}`;
}

function relativeToRoot(filePath) {
  return path.relative(ROOT, filePath).replaceAll(path.sep, '/');
}

function thumbnailUrlFor(outPath) {
  const relativeToLibrary = path.relative(PROMPT_LIBRARY_ROOT, outPath);
  if (
    !relativeToLibrary.startsWith('..') &&
    !path.isAbsolute(relativeToLibrary)
  ) {
    return `/assets/prompt-library/${relativeToLibrary.replaceAll(path.sep, '/')}`;
  }

  return `TODO_PUBLIC_THUMBNAIL_URL/${path.basename(outPath)}`;
}

function cropBox(metadata, row, col, columns, rows) {
  const cellWidth = Math.floor(metadata.width / columns);
  const cellHeight = Math.floor(metadata.height / rows);
  const cropSize = Math.min(cellWidth, cellHeight);

  return {
    left: col * cellWidth + Math.floor((cellWidth - cropSize) / 2),
    top: row * cellHeight + Math.floor((cellHeight - cropSize) / 2),
    width: cropSize,
    height: cropSize
  };
}

function draftAsset({ args, index, outPath }) {
  const id = assetId(args.idPrefix, index);
  const number = String(index + 1).padStart(2, '0');
  const titlePrefix = args.titlePrefix || args.idPrefix;

  return {
    id,
    slot: args.slot,
    title: `${titlePrefix} ${number}`,
    subtitle: `TODO_SUBTITLE_REQUIRED: describe ${id}`,
    prompt: `TODO_PROMPT_REQUIRED: replace with the reusable ${args.slot} prompt for ${id}.`,
    tags: ['TODO_TAG_REQUIRED', args.slot, args.batchId],
    thumbnailUrl: thumbnailUrlFor(outPath),
    sourceFile: relativeToRoot(outPath),
    sourceBatchId: args.batchId
  };
}

async function splitGrid(args) {
  const inputPath = path.resolve(ROOT, args.input);
  const outDir = path.resolve(ROOT, args.outDir);
  const manifestOut = path.resolve(
    ROOT,
    args.manifestOut ||
      path.join(args.outDir, `${args.batchId}.manifest.draft.json`)
  );
  const metadata = await sharp(inputPath).metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error(`Could not read image dimensions: ${args.input}`);
  }
  if (metadata.width < args.columns || metadata.height < args.rows) {
    throw new Error(
      `Input image is too small to split as ${args.columns}x${args.rows}: ${metadata.width}x${metadata.height}`
    );
  }

  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(path.dirname(manifestOut), { recursive: true });

  const assets = [];
  for (let row = 0; row < args.rows; row += 1) {
    for (let col = 0; col < args.columns; col += 1) {
      const index = row * args.columns + col;
      const id = assetId(args.idPrefix, index);
      const outPath = path.join(outDir, `${id}.webp`);

      await sharp(inputPath)
        .extract(cropBox(metadata, row, col, args.columns, args.rows))
        .resize(args.outputSize, args.outputSize, { fit: 'cover' })
        .webp({ quality: 88 })
        .toFile(outPath);

      assets.push(draftAsset({ args, index, outPath }));
    }
  }

  const manifest = {
    schema: 'webtomind.promptAssetGridDraft.v1',
    batchId: args.batchId,
    slot: args.slot,
    grid: {
      columns: args.columns,
      rows: args.rows
    },
    sourceGrid: relativeToRoot(inputPath),
    draftNotes: [
      'Replace TODO_PROMPT_REQUIRED, TODO_SUBTITLE_REQUIRED, and TODO_TAG_REQUIRED before merging into the production prompt asset manifest.',
      'If thumbnailUrl starts with TODO_PUBLIC_THUMBNAIL_URL, move files under src/web/assets/prompt-library/<slot> or edit URLs before sync.'
    ],
    assets
  };

  await fs.writeFile(manifestOut, `${JSON.stringify(manifest, null, 2)}\n`);

  return { assets, manifestOut, outDir };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertArgs(args);

  const { assets, manifestOut, outDir } = await splitGrid(args);
  console.log(
    `[prompt-assets-grid] input=${relativeToRoot(path.resolve(ROOT, args.input))}`
  );
  console.log(`[prompt-assets-grid] outDir=${relativeToRoot(outDir)}`);
  console.log(`[prompt-assets-grid] cropped=${assets.length}`);
  console.log(`[prompt-assets-grid] manifest=${relativeToRoot(manifestOut)}`);
  console.log('[prompt-assets-grid] status=draft TODO_PROMPT_REQUIRED');

  const expectedAssetCount = args.columns * args.rows;
  if (assets.length !== expectedAssetCount) {
    throw new Error(
      `Expected ${expectedAssetCount} assets but wrote ${assets.length}`
    );
  }
}

main().catch((error) => {
  console.error(
    `[prompt-assets-grid] ${error instanceof Error ? error.message : error}`
  );
  process.exit(1);
});
