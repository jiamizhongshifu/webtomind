#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

import { buildStablePromptCaseSlug } from './lib/prompt-case-slug.mjs';

const rootDir = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const applyChanges = process.argv.includes('--apply');
const reportPath = path.resolve(
  process.argv
    .find((arg) => arg.startsWith('--report='))
    ?.slice('--report='.length) ||
    path.join(
      rootDir,
      'docs',
      'reports',
      `prompt-case-slug-backfill-${today}.md`
    )
);
const rollbackPath = path.resolve(
  process.argv
    .find((arg) => arg.startsWith('--rollback='))
    ?.slice('--rollback='.length) ||
    path.join(
      rootDir,
      'outputs',
      'seo',
      `prompt-case-slug-rollback-${today}.json`
    )
);

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadEnvFile(filePath) {
  if (!(await fileExists(filePath))) return;
  const text = await fs.readFile(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

await loadEnvFile(path.join(rootDir, '.vercel/.env.production.local'));
await loadEnvFile(path.join(rootDir, '.env.local'));

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const readKey =
  serviceRoleKey ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !readKey) {
  throw new Error(
    'Missing Supabase URL or key. Configure production Supabase credentials before running this script.'
  );
}
if (applyChanges && !serviceRoleKey) {
  throw new Error('Refusing --apply without SUPABASE_SERVICE_ROLE_KEY.');
}

const supabase = createClient(
  supabaseUrl,
  applyChanges ? serviceRoleKey : readKey
);
const selectFields = [
  'id',
  'slug',
  'title',
  'title_zh',
  'title_en',
  'category',
  'tags',
  'model',
  'locale',
  'is_published',
  'deleted_at',
  'updated_at'
].join(',');
const { data: rows, error } = await supabase
  .from('prompt_cases')
  .select(selectFields)
  .eq('is_published', true)
  .is('deleted_at', null)
  .order('created_at', { ascending: true })
  .limit(1000);

if (error) throw error;

const publishedRows = rows || [];
const missingSlugRows = publishedRows.filter(
  (row) => typeof row.slug !== 'string' || !row.slug.trim()
);
const proposals = missingSlugRows.map((row) => ({
  row,
  slug: buildStablePromptCaseSlug(row)
}));
const existingSlugs = new Set(
  publishedRows
    .map((row) => (typeof row.slug === 'string' ? row.slug.trim() : ''))
    .filter(Boolean)
);
const proposedSlugs = new Set();
const collisions = proposals.filter(({ slug }) => {
  if (existingSlugs.has(slug) || proposedSlugs.has(slug)) return true;
  proposedSlugs.add(slug);
  return false;
});

if (collisions.length > 0) {
  throw new Error(
    `Refusing slug backfill because ${collisions.length} proposed slug collision(s) were found.`
  );
}

if (applyChanges && proposals.length > 0) {
  await fs.mkdir(path.dirname(rollbackPath), { recursive: true });
  await fs.writeFile(
    rollbackPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        rows: proposals.map(({ row }) => ({
          id: row.id,
          slug: row.slug ?? null,
          updatedAt: row.updated_at ?? null
        }))
      },
      null,
      2
    )}\n`
  );

  for (const { row, slug } of proposals) {
    let updateQuery = supabase
      .from('prompt_cases')
      .update({ slug })
      .eq('id', row.id)
      .eq('is_published', true)
      .is('deleted_at', null);
    updateQuery =
      row.slug === null || row.slug === undefined
        ? updateQuery.is('slug', null)
        : updateQuery.eq('slug', row.slug);
    const { data: updatedRows, error: updateError } = await updateQuery.select(
      'id,slug'
    );
    if (updateError) throw updateError;
    if (updatedRows?.length !== 1 || updatedRows[0]?.slug !== slug) {
      throw new Error(
        `Concurrent update detected while backfilling prompt case ${row.id}.`
      );
    }
  }
}

const proposalLines = proposals.map(
  ({ row, slug }) =>
    `| \`${row.id}\` | ${row.locale || ''} | ${String(row.title || '').replace(/\|/g, '\\|')} | ${row.model || ''} | ${row.category || ''} | \`${slug}\` |`
);
const report = `# Prompt Case Missing Slug Backfill

Date: ${today}
Mode: ${applyChanges ? 'APPLY' : 'DRY RUN'}

## Summary

- Published rows scanned: ${publishedRows.length}
- Missing slugs: ${proposals.length}
- Proposed slug collisions: ${collisions.length}
- Applied to Supabase: ${applyChanges ? 'yes' : 'no'}
- Service role available: ${serviceRoleKey ? 'yes' : 'no'}
${applyChanges ? `- Rollback snapshot: \`${path.relative(rootDir, rollbackPath)}\`` : ''}

## Proposed Changes

| ID | Locale | Title | Model | Category | Proposed slug |
| --- | --- | --- | --- | --- | --- |
${proposalLines.join('\n') || '| — | — | No missing slugs | — | — | — |'}

## Scope

This script only fills an empty \`slug\` on published, non-deleted prompt cases. It does not change titles, prompts, tags, models, categories, visibility, or translations.
`;

await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, report);

console.log(
  JSON.stringify(
    {
      scanned: publishedRows.length,
      missingSlugs: proposals.length,
      collisions: collisions.length,
      applied: applyChanges,
      hasServiceRole: Boolean(serviceRoleKey),
      reportPath,
      rollbackPath: applyChanges ? rollbackPath : null
    },
    null,
    2
  )
);
