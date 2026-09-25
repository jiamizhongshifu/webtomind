#!/usr/bin/env node

// Reclassify prompt cases and drafts that are video media but were imported
// before the 'video' category existed. They were written as poster/portrait/
// fashion/ecommerce/... and now belong to category='video'.
//
// Preview by default; pass --apply to write the category change.
// Only the category column is touched; IDs, prompts, images and videos are
// preserved. Reversible by restoring the previous category.

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function createSupabaseAdmin() {
  loadEnvFile(path.join(rootDir, '.vercel/.env.production.local'));
  loadEnvFile(path.join(rootDir, '.env.local'));
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.'
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

function summarizeByCategory(rows) {
  const counts = {};
  for (const row of rows) {
    const category = row.category || 'unknown';
    counts[category] = (counts[category] || 0) + 1;
  }
  return counts;
}

function isVideoDraft(row) {
  const settings = row.generation_settings;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return false;
  }
  if (settings.mediaType === 'video') return true;
  if (Array.isArray(settings.videoUrls) && settings.videoUrls.length > 0) {
    return true;
  }
  return typeof settings.videoUrl === 'string' && settings.videoUrl.trim();
}

async function main() {
  const apply = process.argv.includes('--apply');
  const supabase = createSupabaseAdmin();

  const { data: videoCases, error: casesError } = await supabase
    .from('prompt_cases')
    .select('id, title, category, media_type, deleted_at')
    .eq('media_type', 'video')
    .is('deleted_at', null)
    .neq('category', 'video');

  if (casesError) {
    throw new Error(`prompt_cases query failed: ${casesError.message}`);
  }

  const { data: drafts, error: draftsError } = await supabase
    .from('prompt_case_drafts')
    .select('id, title, category, status, generation_settings')
    .neq('category', 'video');

  if (draftsError) {
    throw new Error(`prompt_case_drafts query failed: ${draftsError.message}`);
  }

  const videoDrafts = (drafts || []).filter(isVideoDraft);
  const cases = videoCases || [];
  const caseIds = cases.map((row) => row.id);
  const draftIds = videoDrafts.map((row) => row.id);

  console.log(
    `${apply ? 'APPLY' : 'PREVIEW'}: ${cases.length} published video cases + ${
      videoDrafts.length
    } video drafts would be reclassified to category='video'.`
  );
  console.log('Published cases by current category:', summarizeByCategory(cases));
  console.log('Drafts by current category:', summarizeByCategory(videoDrafts));

  if (!apply) {
    console.log('No changes written. Re-run with --apply to update.');
    return;
  }

  let caseUpdated = 0;
  let caseFailed = 0;
  if (caseIds.length > 0) {
    const { error, count } = await supabase
      .from('prompt_cases')
      .update({ category: 'video' })
      .in('id', caseIds)
      .eq('media_type', 'video')
      .is('deleted_at', null)
      .neq('category', 'video')
      .select('id', { count: 'exact' });
    if (error) {
      console.error('prompt_cases update failed:', error.message);
      caseFailed = caseIds.length;
    } else {
      caseUpdated = count ?? 0;
    }
  }

  let draftUpdated = 0;
  let draftFailed = 0;
  if (draftIds.length > 0) {
    const { error, count } = await supabase
      .from('prompt_case_drafts')
      .update({ category: 'video' })
      .in('id', draftIds)
      .neq('category', 'video')
      .select('id', { count: 'exact' });
    if (error) {
      console.error('prompt_case_drafts update failed:', error.message);
      draftFailed = draftIds.length;
    } else {
      draftUpdated = count ?? 0;
    }
  }

  console.log(
    `Updated ${caseUpdated} published cases (${caseFailed} failed) and ${draftUpdated} drafts (${draftFailed} failed).`
  );

  const { data: remainingCases, error: remainingError } = await supabase
    .from('prompt_cases')
    .select('id')
    .eq('media_type', 'video')
    .is('deleted_at', null)
    .neq('category', 'video');
  if (remainingError) {
    throw new Error(`remaining check failed: ${remainingError.message}`);
  }
  const { data: remainingDrafts, error: remainingDraftsError } = await supabase
    .from('prompt_case_drafts')
    .select('id, generation_settings')
    .neq('category', 'video');
  if (remainingDraftsError) {
    throw new Error(`remaining draft check failed: ${remainingDraftsError.message}`);
  }
  console.log(
    `Remaining video cases without video category: ${(remainingCases || []).length}; remaining video drafts: ${
      (remainingDrafts || []).filter(isVideoDraft).length
    }.`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
