#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const ROOT = process.cwd();
const DEFAULT_COVERAGE_PATH = 'tmp/prompt-case-asset-coverage.json';
const DEFAULT_SOURCE = 'prompt-case-asset-coverage';

function parseArgs(argv) {
  const args = {
    coverage: DEFAULT_COVERAGE_PATH,
    limit: 20,
    minCoverageScore: 1,
    maxSelectedAssets: Infinity,
    maxSelectedSlots: Infinity,
    dryRun: false,
    overwrite: false,
    caseIds: new Set(),
    categories: new Set(),
    source: DEFAULT_SOURCE
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--coverage') args.coverage = argv[++i] || args.coverage;
    else if (arg === '--limit') args.limit = Number(argv[++i] || args.limit);
    else if (arg === '--min-coverage-score') {
      args.minCoverageScore = Number(argv[++i] || args.minCoverageScore);
    } else if (arg === '--max-selected-assets') {
      args.maxSelectedAssets = Number(argv[++i] || args.maxSelectedAssets);
    } else if (arg === '--max-selected-slots') {
      args.maxSelectedSlots = Number(argv[++i] || args.maxSelectedSlots);
    } else if (arg === '--case-id') {
      const value = argv[++i];
      if (value) args.caseIds.add(value);
    } else if (arg === '--category') {
      const value = argv[++i];
      if (value) args.categories.add(value);
    } else if (arg === '--source') args.source = argv[++i] || args.source;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--overwrite') args.overwrite = true;
    else if (arg === '--help') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(args.limit) || args.limit < 1) {
    throw new Error('--limit must be a positive number.');
  }
  if (!Number.isFinite(args.minCoverageScore) || args.minCoverageScore < 0) {
    throw new Error('--min-coverage-score must be a non-negative number.');
  }
  if (
    args.maxSelectedAssets !== Infinity &&
    (!Number.isFinite(args.maxSelectedAssets) || args.maxSelectedAssets < 1)
  ) {
    throw new Error('--max-selected-assets must be a positive number.');
  }
  if (
    args.maxSelectedSlots !== Infinity &&
    (!Number.isFinite(args.maxSelectedSlots) || args.maxSelectedSlots < 1)
  ) {
    throw new Error('--max-selected-slots must be a positive number.');
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  pnpm apply:prompt-case-recipes -- --coverage tmp/prompt-case-asset-coverage.json --limit 20
  pnpm apply:prompt-case-recipes -- --coverage tmp/prompt-case-asset-coverage.json --limit 20 --dry-run
  pnpm apply:prompt-case-recipes -- --case-id <uuid> --overwrite

Options:
  --coverage <path>            Coverage report from analyze:prompt-case-assets
  --limit <n>                  Max cases to apply, default 20
  --min-coverage-score <n>     Skip weak matches, default 1
  --max-selected-assets <n>    Skip recipes with too many selected assets
  --max-selected-slots <n>     Skip recipes with too many selected slots
  --case-id <uuid>             Apply only specific case id; repeatable
  --category <name>            Apply only specific category; repeatable
  --overwrite                  Replace existing non-empty visual_recipe
  --dry-run                    Print plan without writing Supabase
  --source <label>             Provenance label stored in visual_recipe

Required env:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
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
  await loadDotEnv(path.join(ROOT, 'server/.env'));
}

async function readCoverage(coveragePath) {
  const raw = await fs.readFile(path.resolve(ROOT, coveragePath), 'utf8');
  const report = JSON.parse(raw);
  if (!report || !Array.isArray(report.cases)) {
    throw new Error(`Invalid coverage report: ${coveragePath}`);
  }
  return report;
}

function hasSelection(selection) {
  return Boolean(
    selection &&
    typeof selection === 'object' &&
    !Array.isArray(selection) &&
    Object.keys(selection).length > 0
  );
}

function selectionAssetCount(selection) {
  if (!hasSelection(selection)) return 0;
  return Object.values(selection).flatMap((value) =>
    Array.isArray(value) ? value : value ? [value] : []
  ).length;
}

function selectionSlotCount(selection) {
  return hasSelection(selection) ? Object.keys(selection).length : 0;
}

function caseNeedsRecipe(caseReport, overwrite) {
  if (overwrite) return true;
  return (
    !caseReport.hasExistingRecipe || Boolean(caseReport.recipeWasAugmented)
  );
}

function selectCases(report, args) {
  return report.cases
    .filter(
      (caseReport) => args.caseIds.size === 0 || args.caseIds.has(caseReport.id)
    )
    .filter(
      (caseReport) =>
        args.categories.size === 0 || args.categories.has(caseReport.category)
    )
    .filter((caseReport) => caseNeedsRecipe(caseReport, args.overwrite))
    .filter((caseReport) => hasSelection(caseReport.suggestedSelection))
    .filter(
      (caseReport) =>
        selectionAssetCount(caseReport.suggestedSelection) <=
        args.maxSelectedAssets
    )
    .filter(
      (caseReport) =>
        selectionSlotCount(caseReport.suggestedSelection) <=
        args.maxSelectedSlots
    )
    .filter((caseReport) => {
      const coverageScore = Number(caseReport.coverageScore || 0);
      return coverageScore >= args.minCoverageScore;
    })
    .sort((a, b) => {
      const popularityA = Number(a.popularity?.score || 0);
      const popularityB = Number(b.popularity?.score || 0);
      if (popularityB !== popularityA) return popularityB - popularityA;
      return Number(b.coverageScore || 0) - Number(a.coverageScore || 0);
    })
    .slice(0, args.limit);
}

function buildVisualRecipe(caseReport, args) {
  return {
    selection: caseReport.suggestedSelection,
    source: args.source,
    coverageScore: caseReport.coverageScore || 0,
    popularity: caseReport.popularity || {},
    matchedAssets: (caseReport.matchedAssets || []).map((match) => ({
      slot: match.slot,
      assetId: match.assetId,
      score: match.score,
      hits: match.hits || []
    })),
    appliedAt: new Date().toISOString()
  };
}

function createSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.'
    );
  }
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

async function applyRecipe(supabase, caseReport, recipe) {
  const { data, error } = await supabase
    .from('prompt_cases')
    .update({ visual_recipe: recipe })
    .eq('id', caseReport.id)
    .select('id, title, title_zh, title_en, visual_recipe')
    .single();
  if (error) {
    throw new Error(`Failed to update ${caseReport.id}: ${error.message}`);
  }
  return data;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadEnvFiles();

  const report = await readCoverage(args.coverage);
  const selectedCases = selectCases(report, args);

  console.log(`[prompt-case-recipes] coverage=${args.coverage}`);
  console.log(
    `[prompt-case-recipes] analyzed=${report.analyzedCaseCount || report.cases.length}`
  );
  console.log(`[prompt-case-recipes] selected=${selectedCases.length}`);
  console.log(`[prompt-case-recipes] dryRun=${args.dryRun}`);
  console.log(`[prompt-case-recipes] overwrite=${args.overwrite}`);
  console.log(
    `[prompt-case-recipes] maxSelectedAssets=${args.maxSelectedAssets}`
  );
  console.log(
    `[prompt-case-recipes] maxSelectedSlots=${args.maxSelectedSlots}`
  );

  if (selectedCases.length === 0) return;

  selectedCases.forEach((caseReport, index) => {
    const selectionKeys = Object.keys(caseReport.suggestedSelection || {});
    const selectedAssetCount = selectionAssetCount(
      caseReport.suggestedSelection
    );
    console.log(
      `${String(index + 1).padStart(2, '0')} ${caseReport.id} ` +
        `"${caseReport.title || '(untitled)'}" ` +
        `pop=${caseReport.popularity?.score || 0} ` +
        `coverage=${caseReport.coverageScore || 0} ` +
        `assets=${selectedAssetCount} ` +
        `slots=${selectionKeys.join(',')}`
    );
  });

  if (args.dryRun) return;

  const supabase = createSupabaseAdmin();
  let updated = 0;
  for (const caseReport of selectedCases) {
    const recipe = buildVisualRecipe(caseReport, args);
    await applyRecipe(supabase, caseReport, recipe);
    updated += 1;
  }

  console.log(`[prompt-case-recipes] updated=${updated}`);
}

main().catch((error) => {
  console.error(
    `[prompt-case-recipes] ${error instanceof Error ? error.message : error}`
  );
  process.exit(1);
});
