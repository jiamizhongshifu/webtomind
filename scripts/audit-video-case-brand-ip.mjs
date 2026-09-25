#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true });

const AUDIT_VERSION = '2026-08-09-brand-ip-audit-v1';

// Explicit third-party brand / IP names must not be auto-indexed until a human
// verifies rights. Style words (机甲/仙侠/国风/武侠/游戏) are kept.
const BRAND_IP_PATTERN =
  /(?:lamborghini|ferrari|porsche|nike|adidas|gucci|disney|marvel|mcdonald|star\s?wars|honkai|star\s?rail|gundam|shaw[\s-]?brothers|邵氏|兰博基尼|法拉利|迪士尼|米老鼠|漫威)/i;

// Manual data-quality demotions beyond brand/IP scan.
const MANUAL_DEMOTE_SLUGS = new Set([
  'seedance-2-0-realistic-20-dollar-bill'
]);

function parseArgs(argv) {
  const args = { apply: false, help: false };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--apply') args.apply = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return `Usage:
  node scripts/audit-video-case-brand-ip.mjs [options]

Options:
  --apply   Persist the audit: demote flagged cases back to review and write
            seo_evidence.source_audit on kept cases.`;
}

function flagReason(row) {
  const text = [
    row.slug,
    row.title_zh,
    row.title_en,
    ...(Array.isArray(row.tags) ? row.tags : []),
    row.commercial_intent || ''
  ]
    .filter(Boolean)
    .join(' ');
  if (BRAND_IP_PATTERN.test(text)) return 'third-party-brand-ip';
  if (MANUAL_DEMOTE_SLUGS.has(row.slug)) return 'data-quality-slug-title-mismatch';
  return null;
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
  const { data, error } = await supabase
    .from('prompt_cases')
    .select(
      'id,slug,locale,title_zh,title_en,tags,commercial_intent,seo_status,seo_evidence'
    )
    .eq('is_published', true)
    .is('deleted_at', null)
    .in('media_type', ['video'])
    .eq('seo_status', 'indexable')
    .limit(500);
  if (error) throw error;

  const auditedAt = new Date().toISOString();
  const demoted = [];
  const kept = [];
  for (const row of data || []) {
    const reason = flagReason(row);
    const evidence = {
      ...(row.seo_evidence && typeof row.seo_evidence === 'object'
        ? row.seo_evidence
        : {})
    };
    if (reason) {
      demoted.push({ slug: row.slug, reason });
      if (args.apply) {
        await supabase
          .from('prompt_cases')
          .update({
            seo_status: 'review',
            seo_reviewed_at: null,
            seo_evidence: {
              ...evidence,
              source_audit: {
                version: AUDIT_VERSION,
                audited_at: auditedAt,
                result: 'demoted',
                reason
              }
            }
          })
          .eq('id', row.id)
          .eq('seo_status', 'indexable');
      }
    } else {
      kept.push(row.slug);
      if (args.apply) {
        await supabase
          .from('prompt_cases')
          .update({
            seo_evidence: {
              ...evidence,
              source_audit: {
                version: AUDIT_VERSION,
                audited_at: auditedAt,
                result: 'no-brand-ip-indicator',
                reason: null
              }
            }
          })
          .eq('id', row.id)
          .eq('seo_status', 'indexable');
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: args.apply ? 'apply' : 'dry-run',
        audited: (data || []).length,
        demoted,
        keptCount: kept.length,
        kept
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
