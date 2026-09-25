#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true });

const VERIFICATION_VERSION = '2026-08-video-media-v1';
const PUBLIC_STORAGE_PATH = '/storage/v1/object/public/';

function parseArgs(argv) {
  const args = {
    apply: false,
    locale: 'zh-CN',
    limit: 100,
    concurrency: 4,
    help: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--') continue;
    if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--locale') {
      args.locale = String(next || '');
      index += 1;
    } else if (arg === '--limit') {
      args.limit = Number(next);
      index += 1;
    } else if (arg === '--concurrency') {
      args.concurrency = Number(next);
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (args.locale !== 'all' && !/^[a-z]{2}-[A-Z]{2}$/.test(args.locale)) {
    throw new Error('--locale must be all or a locale such as zh-CN');
  }
  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 1000) {
    throw new Error('--limit must be an integer between 1 and 1000');
  }
  if (
    !Number.isInteger(args.concurrency) ||
    args.concurrency < 1 ||
    args.concurrency > 8
  ) {
    throw new Error('--concurrency must be an integer between 1 and 8');
  }
  return args;
}

function usage() {
  return `Usage:
  node scripts/backfill-prompt-case-video-seo-evidence.mjs [options]

Options:
  --apply             Persist verified duration and media evidence.
  --locale <locale>   Defaults to zh-CN; use all for every locale.
  --limit <n>         Defaults to 100, maximum 1000.
  --concurrency <n>   Defaults to 4, maximum 8.

The command only verifies stable Supabase public media. It never changes
seo_status, seo_reviewed_at, source_verified, or generation_verified.`;
}

function isStableOwnedPublicMediaUrl(value, supabaseHost) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:') return false;
    if (url.hostname !== supabaseHost) return false;
    if (!url.pathname.includes(PUBLIC_STORAGE_PATH)) return false;
    if (/\/object\/sign\//i.test(url.pathname)) return false;
    const unstable = new Set([
      'token',
      'signature',
      'expires',
      'x-amz-signature',
      'x-amz-expires',
      'x-goog-signature',
      'x-goog-expires'
    ]);
    return !Array.from(url.searchParams.keys()).some((key) =>
      unstable.has(key.toLowerCase())
    );
  } catch {
    return false;
  }
}

async function inspectPublicMedia(url, expectedPrefix) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      signal: controller.signal
    });
    const contentType = response.headers.get('content-type') || '';
    await response.body?.cancel();
    return {
      ok:
        (response.status === 200 || response.status === 206) &&
        contentType.toLowerCase().startsWith(expectedPrefix),
      status: response.status,
      contentType: contentType.slice(0, 100)
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      contentType: '',
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function probeVideo(url) {
  return new Promise((resolve) => {
    const child = spawn(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration,format_name',
        '-of',
        'json',
        url
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    const timeout = setTimeout(() => child.kill('SIGKILL'), 45_000);
    child.on('error', (error) => {
      clearTimeout(timeout);
      resolve({ ok: false, error: error.message });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      if (code !== 0) {
        resolve({
          ok: false,
          error: signal ? `ffprobe ${signal}` : stderr.trim().slice(0, 300)
        });
        return;
      }
      try {
        const payload = JSON.parse(stdout);
        const duration = Number(payload.format?.duration);
        if (!Number.isFinite(duration) || duration <= 0) {
          resolve({
            ok: false,
            error: 'ffprobe returned no positive duration'
          });
          return;
        }
        resolve({
          ok: true,
          durationSeconds: Math.max(1, Math.round(duration)),
          measuredDurationSeconds: Number(duration.toFixed(3)),
          formatName: String(payload.format?.format_name || '').slice(0, 100)
        });
      } catch (error) {
        resolve({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });
  });
}

async function retryCheck(check, attempts = 2) {
  let result;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    result = await check();
    if (result.ok || attempt === attempts) return result;
    await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
  }
  return result;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const output = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return output;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    return;
  }
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const readKey = serviceRoleKey || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !readKey) {
    throw new Error('Missing Supabase URL or read credential');
  }
  if (args.apply && !serviceRoleKey) {
    throw new Error('Refusing --apply without SUPABASE_SERVICE_ROLE_KEY');
  }
  const supabaseHost = new URL(supabaseUrl).hostname;
  const supabase = createClient(
    supabaseUrl,
    args.apply ? serviceRoleKey : readKey,
    {
      auth: { persistSession: false }
    }
  );
  let query = supabase
    .from('prompt_cases')
    .select(
      'id,slug,locale,video_url,image_url,video_duration_seconds,seo_status,seo_evidence'
    )
    .eq('media_type', 'video')
    .eq('seo_status', 'review')
    .eq('is_published', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(args.limit);
  if (args.locale !== 'all') query = query.eq('locale', args.locale);
  const { data, error } = await query;
  if (error) throw error;

  const candidates = (data || []).filter(
    (row) =>
      isStableOwnedPublicMediaUrl(row.video_url, supabaseHost) &&
      isStableOwnedPublicMediaUrl(row.image_url, supabaseHost)
  );
  const skipped = (data || []).length - candidates.length;
  const verifiedAt = new Date().toISOString();
  const results = await mapWithConcurrency(
    candidates,
    args.concurrency,
    async (row) => {
      const [videoHttp, posterHttp, probe] = await Promise.all([
        retryCheck(() => inspectPublicMedia(row.video_url, 'video/')),
        retryCheck(() => inspectPublicMedia(row.image_url, 'image/')),
        retryCheck(() => probeVideo(row.video_url))
      ]);
      if (!videoHttp.ok || !posterHttp.ok || !probe.ok) {
        return {
          id: row.id,
          slug: row.slug,
          verified: false,
          videoStatus: videoHttp.status,
          posterStatus: posterHttp.status,
          error:
            probe.error ||
            videoHttp.error ||
            posterHttp.error ||
            'media check failed'
        };
      }
      const patch = {
        video_duration_seconds: probe.durationSeconds,
        seo_evidence: {
          ...(row.seo_evidence && typeof row.seo_evidence === 'object'
            ? row.seo_evidence
            : {}),
          media_verified: true,
          media_verified_at: verifiedAt,
          media_verification: {
            version: VERIFICATION_VERSION,
            video_status: videoHttp.status,
            poster_status: posterHttp.status,
            duration_seconds: probe.measuredDurationSeconds,
            format: probe.formatName,
            storage: 'supabase-public'
          }
        }
      };
      if (args.apply) {
        const { error: updateError } = await supabase
          .from('prompt_cases')
          .update(patch)
          .eq('id', row.id)
          .eq('seo_status', 'review');
        if (updateError) {
          return {
            id: row.id,
            slug: row.slug,
            verified: false,
            error: updateError.message
          };
        }
      }
      return {
        id: row.id,
        slug: row.slug,
        verified: true,
        durationSeconds: probe.durationSeconds,
        changed:
          Number(row.video_duration_seconds) !== probe.durationSeconds ||
          row.seo_evidence?.media_verified !== true
      };
    }
  );

  const failures = results.filter((result) => !result.verified);
  const verified = results.filter((result) => result.verified);
  console.log(
    JSON.stringify(
      {
        mode: args.apply ? 'apply' : 'dry-run',
        locale: args.locale,
        selected: (data || []).length,
        eligibleOwnedPublicMedia: candidates.length,
        skippedUnstableOrExternalMedia: skipped,
        verified: verified.length,
        changed: verified.filter((result) => result.changed).length,
        failed: failures.length,
        durations: verified.map((result) => result.durationSeconds),
        failures
      },
      null,
      2
    )
  );
  if (failures.length) process.exitCode = 1;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export { isStableOwnedPublicMediaUrl, parseArgs };
