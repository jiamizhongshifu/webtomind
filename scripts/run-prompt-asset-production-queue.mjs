#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const ROOT = process.cwd();
const WORKER_ID = `prompt-asset-worker-${process.pid}`;

function parseArgs(argv) {
  const args = {
    limit: 1,
    provider: '',
    model: '',
    dryRun: false,
    skipSync: false,
    failStaleMinutes: 0,
    requeueStaleMinutes: 0
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--limit') args.limit = Math.max(1, Number(argv[++i]) || 1);
    else if (arg === '--provider') args.provider = argv[++i] || '';
    else if (arg === '--model') args.model = argv[++i] || '';
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--skip-sync') args.skipSync = true;
    else if (arg === '--fail-stale-minutes') {
      args.failStaleMinutes = Math.max(0, Number(argv[++i]) || 0);
      args.requeueStaleMinutes = 0;
    } else if (arg === '--requeue-stale-minutes') {
      args.requeueStaleMinutes = Math.max(0, Number(argv[++i]) || 0);
      args.failStaleMinutes = 0;
    }
    else if (arg === '--help') {
      printHelp();
      process.exit(0);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  pnpm prompt-asset-worker -- --limit 1
  pnpm prompt-asset-worker -- --limit 2 --provider gemini
  pnpm prompt-asset-worker -- --limit 1 --dry-run

Options:
  --limit <n>       Maximum queued batches to claim in this run
  --provider <name> Forwarded to scripts/generate-prompt-assets.mjs
  --model <name>    Forwarded image model override
  --dry-run         Claim and build batch config only; no generation or sync
  --skip-sync       Generate/crop/validate but do not sync Supabase assets
  --fail-stale-minutes <n>
                   Mark running batches older than n minutes as failed before claiming
  --requeue-stale-minutes <n>
                   Move running batches older than n minutes back to queued before claiming
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

function getResultObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

async function listQueuedBatches(sb, limit) {
  const { data, error } = await sb
    .from('prompt_asset_production_batches')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(Math.max(limit * 3, limit));
  if (error) throw error;
  return data || [];
}

async function recoverStaleRunningBatches(sb, args) {
  const mode = args.failStaleMinutes > 0 ? 'failed' : args.requeueStaleMinutes > 0 ? 'queued' : '';
  const minutes = args.failStaleMinutes || args.requeueStaleMinutes;
  if (!mode || minutes <= 0) return [];

  const staleBefore = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  const { data: stale, error } = await sb
    .from('prompt_asset_production_batches')
    .select('id,result,updated_at')
    .eq('status', 'running')
    .lt('updated_at', staleBefore)
    .order('updated_at', { ascending: true })
    .limit(Math.max(args.limit * 3, args.limit));
  if (error) throw error;
  if (!stale?.length) return [];

  const recovered = [];
  for (const batch of stale) {
    const nextResult = {
      ...getResultObject(batch.result),
      workerId: WORKER_ID,
      staleRecoveredAt: new Date().toISOString(),
      staleRecoveredFromUpdatedAt: batch.updated_at,
      staleRecoveryMode: mode
    };
    if (mode === 'failed') {
      nextResult.workerError = `Batch was still running after ${minutes} minutes.`;
    }

    const { data, error: updateError } = await sb
      .from('prompt_asset_production_batches')
      .update({
        status: mode,
        updated_by_email: 'prompt-asset-worker',
        result: nextResult
      })
      .eq('id', batch.id)
      .eq('status', 'running')
      .select('id');
    if (updateError) throw updateError;
    if (data?.[0]?.id) recovered.push(data[0].id);
  }
  return recovered;
}

async function claimBatch(sb, batch) {
  const result = {
    ...getResultObject(batch.result),
    workerId: WORKER_ID,
    workerClaimedAt: new Date().toISOString(),
    claimedFromStatus: 'queued'
  };
  const { data, error } = await sb
    .from('prompt_asset_production_batches')
    .update({
      status: 'running',
      updated_by_email: 'prompt-asset-worker',
      result
    })
    .eq('id', batch.id)
    .eq('status', 'queued')
    .select('*');
  if (error) throw error;
  return data?.[0] || null;
}

function runBatch(batchId, args) {
  const childArgs = [
    'scripts/run-prompt-asset-production-batch.mjs',
    '--batch',
    batchId
  ];
  if (args.provider) childArgs.push('--provider', args.provider);
  if (args.model) childArgs.push('--model', args.model);
  if (args.dryRun) childArgs.push('--dry-run');
  if (args.skipSync) childArgs.push('--skip-sync');

  console.log(`[prompt-asset-worker] run node ${childArgs.join(' ')}`);
  const result = spawnSync('node', childArgs, {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`batch ${batchId} exited with status ${result.status}`);
  }
}

async function markWorkerFailure(sb, batchId, error) {
  const { data } = await sb
    .from('prompt_asset_production_batches')
    .select('result')
    .eq('id', batchId)
    .maybeSingle();
  await sb
    .from('prompt_asset_production_batches')
    .update({
      status: 'failed',
      updated_by_email: 'prompt-asset-worker',
      result: {
        ...getResultObject(data?.result),
        workerId: WORKER_ID,
        workerFailedAt: new Date().toISOString(),
        workerError: error instanceof Error ? error.message : String(error)
      }
    })
    .eq('id', batchId);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadEnvFiles();
  const sb = getSupabaseAdmin();

  const processed = [];
  const failed = [];
  const staleRecovered = await recoverStaleRunningBatches(sb, args);
  if (staleRecovered.length) {
    console.log(
      `[prompt-asset-worker] recovered stale running batches: ${staleRecovered.join(', ')}`
    );
  }

  while (processed.length + failed.length < args.limit) {
    const queued = await listQueuedBatches(sb, args.limit);
    if (!queued.length) break;

    let claimed = null;
    for (const batch of queued) {
      claimed = await claimBatch(sb, batch);
      if (claimed) break;
    }
    if (!claimed) break;

    console.log(`[prompt-asset-worker] claimed ${claimed.id}`);
    try {
      runBatch(claimed.id, args);
      processed.push(claimed.id);
    } catch (error) {
      console.error(
        `[prompt-asset-worker] ${error instanceof Error ? error.message : error}`
      );
      await markWorkerFailure(sb, claimed.id, error);
      failed.push(claimed.id);
    }
  }

  console.log(
    JSON.stringify(
      {
        workerId: WORKER_ID,
        processed,
        failed,
        staleRecovered,
        remainingLimit: Math.max(0, args.limit - processed.length - failed.length)
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    `[prompt-asset-worker] ${error instanceof Error ? error.message : error}`
  );
  process.exit(1);
});
