#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const ROOT = process.cwd();

function parseArgs(argv) {
  const args = {
    batch: '',
    provider: '',
    model: '',
    cropOnly: '',
    dryRun: false,
    skipSync: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--batch') args.batch = argv[++i] || '';
    else if (arg === '--provider') args.provider = argv[++i] || '';
    else if (arg === '--model') args.model = argv[++i] || '';
    else if (arg === '--crop-only') args.cropOnly = argv[++i] || '';
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--skip-sync') args.skipSync = true;
    else if (arg === '--help') {
      printHelp();
      process.exit(0);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  pnpm prompt-asset-batch -- --batch top-case-gap-20260630
  pnpm prompt-asset-batch -- --batch top-case-gap-20260630 --crop-only src/web/assets/prompt-library/_generated/top-case-gap-20260630/grid.png

Options:
  --batch <id>       Required production batch id from Supabase
  --provider <name>  Forwarded to scripts/generate-prompt-assets.mjs
  --model <name>     Forwarded image model override
  --crop-only <png>  Crop an externally generated contact sheet
  --dry-run          Build prompt/config only; no generation, validation, or sync
  --skip-sync        Generate/crop/validate but do not sync Supabase assets
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
    // Optional env files are allowed.
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

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function toBatchConfig(batch) {
  return {
    outputRoot: 'src/web/assets/prompt-library',
    batches: [
      {
        id: batch.id,
        slot: batch.slot,
        grid: batch.grid,
        size: batch.size,
        outputSize: batch.output_size,
        prompt: batch.prompt,
        assets: batch.assets
      }
    ]
  };
}

function runCommand(command, args) {
  console.log(`[prompt-asset-batch] run ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`);
  }
}

async function updateBatch(sb, id, patch) {
  const { data, error } = await sb
    .from('prompt_asset_production_batches')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.batch) throw new Error('--batch is required.');
  await loadEnvFiles();
  const sb = getSupabaseAdmin();

  const { data: batch, error } = await sb
    .from('prompt_asset_production_batches')
    .select('*')
    .eq('id', args.batch)
    .single();
  if (error) throw error;
  let resultState =
    batch.result && typeof batch.result === 'object' && !Array.isArray(batch.result)
      ? { ...batch.result }
      : {};

  const tmpDir = path.join(ROOT, 'tmp', 'prompt-asset-production-batches');
  await fs.mkdir(tmpDir, { recursive: true });
  const configPath = path.join(tmpDir, `${batch.id}.json`);
  await fs.writeFile(
    configPath,
    `${JSON.stringify(toBatchConfig(batch), null, 2)}\n`
  );

  const runCommandText = [
    'pnpm prompt-asset-batch --',
    `--batch ${batch.id}`,
    args.provider ? `--provider ${args.provider}` : '',
    args.model ? `--model ${args.model}` : '',
    args.cropOnly ? `--crop-only ${args.cropOnly}` : '',
    args.dryRun ? '--dry-run' : '',
    args.skipSync ? '--skip-sync' : ''
  ]
    .filter(Boolean)
    .join(' ');

  resultState = {
    ...resultState,
    configPath: path.relative(ROOT, configPath),
    startedAt: new Date().toISOString(),
    dryRun: args.dryRun
  };

  await updateBatch(sb, batch.id, {
    status: args.dryRun ? 'approved' : 'running',
    run_command: runCommandText,
    result: resultState
  });

  const generationArgs = [
    'scripts/generate-prompt-assets.mjs',
    '--config',
    path.relative(ROOT, configPath),
    '--batch',
    batch.id
  ];
  if (args.provider) generationArgs.push('--provider', args.provider);
  if (args.model) generationArgs.push('--model', args.model);
  if (args.cropOnly) generationArgs.push('--crop-only', args.cropOnly);
  if (args.dryRun) generationArgs.push('--dry-run');

  runCommand('node', generationArgs);

  if (args.dryRun) {
    resultState = {
      ...resultState,
      dryRunCompletedAt: new Date().toISOString()
    };
    await updateBatch(sb, batch.id, {
      status: 'approved',
      result: resultState
    });
    return;
  }

  resultState = {
    ...resultState,
    croppedAt: new Date().toISOString()
  };
  await updateBatch(sb, batch.id, {
    status: 'cropped',
    result: resultState
  });

  runCommand('pnpm', ['validate:prompt-assets']);

  if (!args.skipSync) {
    runCommand('pnpm', ['sync:prompt-assets']);
    resultState = {
      ...resultState,
      syncedAt: new Date().toISOString()
    };
    await updateBatch(sb, batch.id, {
      status: 'synced',
      result: resultState
    });
  }
}

main().catch(async (error) => {
  console.error(
    `[prompt-asset-batch] ${error instanceof Error ? error.message : error}`
  );
  const batchId = parseArgs(process.argv.slice(2)).batch;
  if (batchId) {
    try {
      await loadEnvFiles();
      const sb = getSupabaseAdmin();
      const existing = await sb
        .from('prompt_asset_production_batches')
        .select('result')
        .eq('id', batchId)
        .maybeSingle();
      const existingResult =
        existing.data?.result &&
        typeof existing.data.result === 'object' &&
        !Array.isArray(existing.data.result)
          ? existing.data.result
          : {};
      await updateBatch(sb, batchId, {
        status: 'failed',
        result: {
          ...existingResult,
          failedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error)
        }
      });
    } catch {
      // Preserve the original failure.
    }
  }
  process.exit(1);
});
