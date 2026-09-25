#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true });

const REVIEW_VERSION = '2026-08-seo-quality-v1';
const PLACEHOLDER_INTENT =
  /待人工补全|补全|x\/twitter 视频案例导入|placeholder/i;

function parseArgs(argv) {
  const args = { apply: false, locale: 'zh-CN', help: false };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--apply') args.apply = true;
    else if (arg === '--locale') {
      args.locale = String(argv[++index] || 'zh-CN');
    } else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return `Usage:
  node scripts/promote-verified-video-cases.mjs [options]

Options:
  --apply             Persist seo_status=indexable, source_verified and the
                      video-motion label for verified video cases.
  --locale <locale>   Defaults to zh-CN; use all for every locale.

The script only promotes cases that already have media_verified evidence,
measured duration, upload date, slug, model, localized title/prompt and a
non-placeholder commercial intent. It never touches members-only or
unverified cases.`;
}

function hasPlaceholderIntent(value) {
  return typeof value === 'string' && PLACEHOLDER_INTENT.test(value);
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isCandidate(row) {
  const evidence =
    row.seo_evidence && typeof row.seo_evidence === 'object'
      ? row.seo_evidence
      : {};
  const imageOk =
    hasText(row.image_url) ||
    (Array.isArray(row.image_urls) && row.image_urls.some(hasText));
  return (
    row.is_published === true &&
    !row.deleted_at &&
    row.members_only !== true &&
    row.media_type === 'video' &&
    evidence.media_verified === true &&
    Number(row.video_duration_seconds) > 0 &&
    hasText(row.video_upload_date) &&
    hasText(row.slug) &&
    hasText(row.model) &&
    (row.locale === 'en-US'
      ? hasText(row.title_en) && hasText(row.prompt_en)
      : hasText(row.title_zh) && hasText(row.prompt_zh)) &&
    !hasPlaceholderIntent(row.commercial_intent)
  );
}

function withVideoLabel(tags) {
  const current = Array.isArray(tags) ? tags.map(String) : [];
  return current.includes('video') ? current : [...current, 'video'];
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    return;
  }
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  let query = supabase
    .from('prompt_cases')
    .select(
      'id,slug,locale,media_type,video_duration_seconds,video_upload_date,commercial_intent,title_zh,title_en,prompt_zh,prompt_en,model,image_url,image_urls,tags,seo_status,seo_reviewed_at,seo_evidence,members_only,is_published,deleted_at'
    )
    .eq('is_published', true)
    .is('deleted_at', null)
    .in('media_type', ['video'])
    .limit(5000);
  if (args.locale !== 'all') query = query.eq('locale', args.locale);
  const { data, error } = await query;
  if (error) throw error;

  const candidates = (data || []).filter(isCandidate);
  const skipped = (data || []).length - candidates.length;
  const now = new Date().toISOString();
  const results = [];

  for (const row of candidates) {
    const evidence = {
      ...(row.seo_evidence && typeof row.seo_evidence === 'object'
        ? row.seo_evidence
        : {}),
      source_verified: true,
      review_version: REVIEW_VERSION
    };
    const patch = {
      seo_status: 'indexable',
      seo_reviewed_at: now,
      seo_evidence: evidence,
      tags: withVideoLabel(row.tags)
    };
    if (args.apply) {
      const { error: updateError } = await supabase
        .from('prompt_cases')
        .update(patch)
        .eq('id', row.id)
        .eq('seo_status', 'review');
      if (updateError) {
        results.push({
          id: row.id,
          slug: row.slug,
          promoted: false,
          error: updateError.message
        });
        continue;
      }
    }
    results.push({
      id: row.id,
      slug: row.slug,
      locale: row.locale,
      category: row.commercial_intent?.slice(0, 40) || ''
    });
  }

  console.log(
    JSON.stringify(
      {
        mode: args.apply ? 'apply' : 'dry-run',
        locale: args.locale,
        selected: (data || []).length,
        candidates: candidates.length,
        skippedUnverifiedOrIncomplete: skipped,
        promoted: results.filter((r) => r.promoted !== false).length,
        results
      },
      null,
      2
    )
  );
  if (!args.apply) {
    console.log('\nDry-run only. Re-run with --apply to persist.');
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
