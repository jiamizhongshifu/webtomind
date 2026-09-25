#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

if (existsSync('.env.local')) {
  loadEnv({ path: '.env.local', override: false, quiet: true });
}

const apply = process.argv.includes('--apply');
const rollback = process.argv.includes('--rollback');
if (apply && rollback) {
  throw new Error('Choose either --apply or --rollback, not both.');
}

const limitArgument = process.argv.find((argument) =>
  argument.startsWith('--limit=')
);
const limit = Math.max(
  1,
  Math.min(100_000, Number(limitArgument?.split('=')[1] || 100_000) || 100_000)
);
const pageSize = 500;
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    'Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.'
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function assetIdsForRow(row) {
  if (!Array.isArray(row.asset_ids)) return [];
  return Array.from(
    new Set(
      row.asset_ids
        .filter((id) => typeof id === 'string')
        .map((id) => id.trim())
        .filter(Boolean)
    )
  );
}

function isLegacyBackfill(metadata) {
  const audit = objectValue(metadata.recipeAudit);
  return (
    audit.schemaVersion === 1 &&
    audit.selectionSource === 'legacy_unknown' &&
    audit.compilerVersion === 'legacy-pre-recipe-audit'
  );
}

const rows = [];
for (let offset = 0; rows.length < limit; offset += pageSize) {
  const { data, error } = await supabase
    .from('image_generations')
    .select('id, asset_ids, metadata, created_at')
    .not('asset_ids', 'is', null)
    .order('created_at', { ascending: true })
    .range(offset, offset + pageSize - 1);
  if (error) throw error;
  const page = data || [];
  rows.push(...page.slice(0, Math.max(0, limit - rows.length)));
  if (page.length < pageSize) break;
}

const candidates = rows.filter((row) => {
  const metadata = objectValue(row.metadata);
  if (rollback) return isLegacyBackfill(metadata);
  return assetIdsForRow(row).length > 0 && !metadata.recipeAudit;
});

const summary = {
  mode: rollback ? 'rollback' : apply ? 'apply' : 'dry-run',
  scanned: rows.length,
  candidates: candidates.length,
  oldestCandidateAt: candidates[0]?.created_at || null,
  newestCandidateAt: candidates.at(-1)?.created_at || null,
  sampleIds: candidates.slice(0, 10).map((row) => row.id)
};
console.log(JSON.stringify(summary, null, 2));

if ((!apply && !rollback) || candidates.length === 0) process.exit(0);

const changedAt = new Date().toISOString();
let updated = 0;
for (const row of candidates) {
  const metadata = { ...objectValue(row.metadata) };
  if (rollback) {
    delete metadata.recipeAudit;
    delete metadata.recipeAuditBackfilledAt;
  } else {
    metadata.recipeAudit = {
      schemaVersion: 1,
      compilerVersion: 'legacy-pre-recipe-audit',
      selectionSource: 'legacy_unknown',
      selectedAssetIds: assetIdsForRow(row)
    };
    metadata.recipeAuditBackfilledAt = changedAt;
  }
  const { error } = await supabase
    .from('image_generations')
    .update({ metadata })
    .eq('id', row.id);
  if (error) throw new Error(`Failed to update ${row.id}: ${error.message}`);
  updated += 1;
}

console.log(JSON.stringify({ updated, changedAt }, null, 2));
