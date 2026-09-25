#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, 'scripts/prompt-assets.batches.json');
const MANIFEST_PATH = path.join(
  ROOT,
  'src/web/assets/prompt-library/manifest.generated.json'
);
const APPLY = process.argv.includes('--apply');

const SLOT_PLANS = {
  top: {
    prefix: 'portrait-top-restored',
    fillers: [
      'top-black-turtleneck',
      'top-pale-denim-jacket',
      'top-cream-oversized-blazer',
      'top-sheer-lace-bolero'
    ],
    baseline:
      "Same clearly adult East Asian woman, identity, neutral expression, low ponytail, frontal waist-up catalog pose, charcoal tailored trousers, warm-gray seamless studio, eye-level camera and neutral softbox in every cell. Change only the standalone upper garment. No dresses, coordinated bottoms, full outfits, props, text, logos or watermark."
  },
  bottom: {
    prefix: 'portrait-bottom-restored',
    fillers: [],
    baseline:
      "Same clearly adult East Asian woman, identity, neutral expression, fitted plain black top, white low-profile sneakers, straight frontal pose, waist-to-shoes crop, warm-gray seamless studio, eye-level camera and neutral softbox in every cell. Change only the standalone lower garment. No matching upper garment, complete outfit, dress, props, text, logos or watermark."
  },
  expression: {
    prefix: 'portrait-expression-restored',
    fillers: ['expression-calm-direct'],
    baseline:
      "Same clearly adult East Asian woman, identity, fixed head and chin, low ponytail, charcoal crew-neck top, frontal head-and-shoulders crop, warm-gray seamless studio, eye-level camera, neutral softbox and unchanged natural makeup in every cell. Change only facial muscles and gaze. No hand gestures, props, symbolic pupils, emoji, sweat droplets, skin-color changes, costume changes, scene effects, text, logos or watermark."
  },
  pose: {
    prefix: 'portrait-pose-restored',
    fillers: [
      'pose-relaxed-standing',
      'pose-side-lookback',
      'pose-seated-relaxed',
      'pose-hand-near-face',
      'pose-energetic-jump',
      'pose-hands-behind-lean'
    ],
    baseline:
      "Same clearly adult East Asian woman, identity, neutral expression, low ponytail, charcoal fitted top, black straight trousers, white sneakers, full-body eye-level frontal camera, warm-gray seamless studio and neutral softbox in every cell. Change only the single body pose or gesture. Use anatomically correct hands and limbs. No wardrobe, scene, lighting, lens, viewpoint or expression changes; no emoji, captions, logos or watermark."
  },
  composition: {
    prefix: 'portrait-composition-restored',
    fillers: ['composition-centered-axis-v2', 'composition-negative-space-v2'],
    baseline:
      "Same clearly adult East Asian woman, identity, neutral expression, low ponytail, charcoal fitted top, waist-up subject scale, eye-level level camera, modern digital rendering and neutral daylight exposure in every cell. Change only spatial composition and simple compositional scaffolding. No shot-size, viewpoint, lens, lighting, pose or wardrobe changes; no text, logos or watermark."
  },
  makeup: {
    prefix: 'portrait-makeup-restored',
    fillers: [
      'makeup-natural-clean',
      'makeup-soft-peach-daily',
      'makeup-cream-luminous',
      'makeup-cool-editorial-matte',
      'makeup-red-lip-glam',
      'makeup-smoky-eyeliner',
      'makeup-sun-kissed-active'
    ],
    baseline:
      "Same clearly adult East Asian woman, identity, calm direct expression, center-parted low ponytail, charcoal crew-neck top, frontal head-and-shoulders crop, eye-level camera, warm-gray seamless studio, fixed neutral softbox, exposure and white balance in every cell. Change only makeup color, placement and finish. Preserve real skin texture. No hairstyle, expression, lighting, props, jewelry, scene effects, text, logos or watermark."
  },
  lighting: {
    prefix: 'portrait-lighting-restored',
    fillers: [],
    baseline:
      "Same clearly adult East Asian woman, identity, calm expression, low ponytail, charcoal crew-neck top, frontal chest-up crop, eye-level camera, neutral studio and modern digital rendering in every cell. Change only the named lighting structure. Keep the face a clean continuous readable zone unless the named structure explicitly divides it; patterned light stays on background and outer clothing. No wardrobe, pose, makeup, viewpoint, lens or scene changes; no text, logos or watermark."
  }
};

function chunkNine(items) {
  return Array.from({ length: items.length / 9 }, (_, index) =>
    items.slice(index * 9, index * 9 + 9)
  );
}

function batchSuffix(index) {
  return String.fromCharCode('a'.charCodeAt(0) + index);
}

async function loadRuntimeAssets() {
  const server = await createServer({
    configFile: 'vite.config.web.ts',
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent'
  });
  try {
    const module = await server.ssrLoadModule(
      '/src/web/data/image-prompt-assets.ts'
    );
    return module.imagePromptAssets;
  } finally {
    await server.close();
  }
}

function toBatchAsset(asset) {
  return {
    id: asset.id,
    title: asset.title,
    subtitle: asset.subtitle,
    prompt: asset.prompt,
    ...(asset.promptZh ? { promptZh: asset.promptZh } : {}),
    tags: asset.tags
  };
}

async function main() {
  const [runtimeAssets, manifest, configRaw] = await Promise.all([
    loadRuntimeAssets(),
    fs.readFile(MANIFEST_PATH, 'utf8').then(JSON.parse),
    fs.readFile(CONFIG_PATH, 'utf8')
  ]);
  const config = JSON.parse(configRaw);
  const runtimeById = new Map(runtimeAssets.map((asset) => [asset.id, asset]));
  const manifestIds = new Set(manifest.assets.map((asset) => asset.id));
  const existingBatchIds = new Set(config.batches.map((batch) => batch.id));
  const additions = [];

  for (const [slot, plan] of Object.entries(SLOT_PLANS)) {
    const missing = runtimeAssets.filter(
      (asset) => asset.slot === slot && !manifestIds.has(asset.id)
    );
    if (missing.length === 0) continue;
    const fillers = plan.fillers.map((id) => {
      const asset = runtimeById.get(id);
      if (!asset || asset.slot !== slot) {
        throw new Error(`Invalid ${slot} filler: ${id}`);
      }
      return asset;
    });
    const planned = [...missing, ...fillers];
    if (planned.length % 9 !== 0) {
      throw new Error(
        `${slot} plan has ${planned.length} assets; expected a multiple of nine`
      );
    }

    chunkNine(planned).forEach((assets, index) => {
      const id = `${plan.prefix}-${batchSuffix(index)}-v1-20260714`;
      if (existingBatchIds.has(id)) return;
      additions.push({
        id,
        slot,
        grid: { columns: 3, rows: 3 },
        size: '2048x2048',
        outputSize: 768,
        prompt: [
          `Strict 3x3 single-variable ${slot} photographic contact sheet.`,
          plan.baseline,
          `Exact row-major cells: ${assets
            .map((asset, cell) => `${cell + 1}) ${asset.prompt}`)
            .join(' ')}`
        ].join(' '),
        assets: assets.map(toBatchAsset),
        notes: [
          'Built-in imagegen 3x3 migration of restored runtime assets into the public manifest. Stable IDs are preserved.'
        ]
      });
    });
  }

  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        additions: additions.map((batch) => ({
          id: batch.id,
          slot: batch.slot,
          assets: batch.assets.length
        }))
      },
      null,
      2
    )
  );
  if (!APPLY || additions.length === 0) return;

  const closingMarker = /\n  \]\n}\s*$/;
  if (!closingMarker.test(configRaw)) {
    throw new Error('Unexpected prompt batch config ending');
  }
  const serialized = additions
    .map((batch) =>
      JSON.stringify(batch, null, 2)
        .split('\n')
        .map((line) => `    ${line}`)
        .join('\n')
    )
    .join(',\n');
  const nextConfig = configRaw.replace(
    closingMarker,
    `,\n${serialized}\n  ]\n}\n`
  );
  await fs.writeFile(CONFIG_PATH, nextConfig);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
