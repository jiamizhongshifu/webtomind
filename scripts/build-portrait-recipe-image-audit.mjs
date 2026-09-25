#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';

const root = process.cwd();
const outputDir = path.resolve(
  root,
  process.env.PORTRAIT_RECIPE_AUDIT_OUTPUT ||
    'outputs/portrait-recipe-image-audit-2026-07-13'
);

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const vite = await createServer({
  root,
  configFile: false,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true }
});

try {
  const promptModule = await vite.ssrLoadModule(
    '/src/web/data/image-prompt-assets.ts'
  );
  const compatibilityModule = await vite.ssrLoadModule(
    '/src/web/data/portrait-recipe-compatibility.ts'
  );
  const {
    buildRandomImagePromptSelectionForProfile,
    compileImagePrompt,
    defaultImagePromptSettings,
    getImagePromptRecipeCompilerVersion,
    getSelectedAssetIds,
    imagePromptAssets,
    imagePromptSlots
  } = promptModule;
  const { portraitRecipeProfiles } = compatibilityModule;
  const compilerVersion = getImagePromptRecipeCompilerVersion(imagePromptAssets);
  const recipes = [];

  portraitRecipeProfiles.forEach((profile, profileIndex) => {
    for (let variant = 0; variant < 2; variant += 1) {
      const seed =
        (0x28580675 +
          profileIndex * 0x9e3779b9 +
          variant * 0x5f3759df) >>>
        0;
      const selection = buildRandomImagePromptSelectionForProfile(
        imagePromptAssets,
        profile,
        seededRandom(seed)
      );
      const compilation = compileImagePrompt(
        selection,
        defaultImagePromptSettings,
        imagePromptAssets,
        'zh-CN'
      );
      const assetIds = imagePromptSlots.flatMap((slot) =>
        getSelectedAssetIds(selection, slot.id)
      );
      recipes.push({
        id: `${profile}-${variant + 1}`,
        profile,
        variant: variant + 1,
        seed,
        compilerVersion,
        assetIds,
        selection,
        prompt: compilation.prompt
      });
    }
  });

  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'recipes.json');
  await fs.writeFile(
    outputPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        compilerVersion,
        routeCount: portraitRecipeProfiles.length,
        recipeCount: recipes.length,
        recipes
      },
      null,
      2
    )}\n`,
    { mode: 0o600 }
  );
  console.log(
    JSON.stringify(
      {
        outputPath: path.relative(root, outputPath),
        compilerVersion,
        recipes: recipes.map(({ id, profile, seed, assetIds, prompt }) => ({
          id,
          profile,
          seed,
          assetCount: assetIds.length,
          promptLength: prompt.length
        }))
      },
      null,
      2
    )
  );
} finally {
  await vite.close();
}
