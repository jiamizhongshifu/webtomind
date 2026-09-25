#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const PAGE_SIZE = 500;

const LEGACY_FRAGMENT_SETS = [
  ['画质低', '多余手指', '手部变形', '解剖错误', '水印文字'],
  [
    'low quality',
    'extra fingers',
    'distorted hands',
    'bad anatomy',
    'text watermark'
  ],
  ['透明浴巾', '浴巾接触不良', '浴巾漂浮', '男性表情不可辨识'],
  ['透明浴巾', '浴巾接触不良', '浴巾漂浮', '完全正面站姿']
];

function loadLocalEnv() {
  const envPath = resolve(process.cwd(), '.env.local');
  let content = '';
  try {
    content = readFileSync(envPath, 'utf8');
  } catch {
    return;
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
}

function normalizeNegativePrompt(value) {
  return String(value || '')
    .trim()
    .replace(/[，、]/g, ',')
    .replace(/\s*,\s*/g, ',')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function isLegacyAutoNegativePrompt(value) {
  const normalized = normalizeNegativePrompt(value);
  if (!normalized) return false;
  return LEGACY_FRAGMENT_SETS.some((fragments) =>
    fragments.every((fragment) =>
      normalized.includes(normalizeNegativePrompt(fragment))
    )
  );
}

loadLocalEnv();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    'Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.'
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

let offset = 0;
let scanned = 0;
const matched = [];
let taskOffset = 0;
let taskScanned = 0;
const taskMatched = [];

for (;;) {
  const { data, error } = await supabase
    .from('image_generations')
    .select('id, negative_prompt, metadata, created_at')
    .not('negative_prompt', 'is', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (error) {
    console.error('Failed to scan image_generations:', error.message);
    process.exit(1);
  }

  const rows = data || [];
  scanned += rows.length;
  for (const row of rows) {
    if (isLegacyAutoNegativePrompt(row.negative_prompt)) {
      matched.push(row);
    }
  }

  if (rows.length < PAGE_SIZE) break;
  offset += PAGE_SIZE;
}

for (;;) {
  const { data, error } = await supabase
    .from('image_generation_tasks')
    .select('id, request_payload, created_at')
    .not('request_payload', 'is', null)
    .order('created_at', { ascending: false })
    .range(taskOffset, taskOffset + PAGE_SIZE - 1);

  if (error) {
    console.error('Failed to scan image_generation_tasks:', error.message);
    process.exit(1);
  }

  const rows = data || [];
  taskScanned += rows.length;
  for (const row of rows) {
    const payload =
      row.request_payload &&
      typeof row.request_payload === 'object' &&
      !Array.isArray(row.request_payload)
        ? row.request_payload
        : {};
    if (isLegacyAutoNegativePrompt(payload.negativePrompt)) {
      taskMatched.push(row);
    }
  }

  if (rows.length < PAGE_SIZE) break;
  taskOffset += PAGE_SIZE;
}

console.log(
  JSON.stringify(
    {
      dryRun: !APPLY,
      scanned,
      matched: matched.length,
      sampleIds: matched.slice(0, 10).map((row) => row.id),
      taskScanned,
      taskMatched: taskMatched.length,
      taskSampleIds: taskMatched.slice(0, 10).map((row) => row.id)
    },
    null,
    2
  )
);

if (!APPLY || (matched.length === 0 && taskMatched.length === 0)) {
  process.exit(0);
}

let updated = 0;
let taskUpdated = 0;
const fixedAt = new Date().toISOString();
for (const row of matched) {
  const metadata =
    row.metadata &&
    typeof row.metadata === 'object' &&
    !Array.isArray(row.metadata)
      ? row.metadata
      : {};
  const { error } = await supabase
    .from('image_generations')
    .update({
      negative_prompt: null,
      metadata: {
        ...metadata,
        negativePromptSource: 'system',
        legacyAutoNegativePromptClearedAt: fixedAt
      }
    })
    .eq('id', row.id);

  if (error) {
    console.error(`Failed to update ${row.id}:`, error.message);
    process.exit(1);
  }
  updated += 1;
}

for (const row of taskMatched) {
  const requestPayload =
    row.request_payload &&
    typeof row.request_payload === 'object' &&
    !Array.isArray(row.request_payload)
      ? row.request_payload
      : {};
  const { error } = await supabase
    .from('image_generation_tasks')
    .update({
      request_payload: {
        ...requestPayload,
        negativePrompt: null,
        negativePromptSource: 'system',
        legacyAutoNegativePromptClearedAt: fixedAt
      }
    })
    .eq('id', row.id);

  if (error) {
    console.error(`Failed to update task ${row.id}:`, error.message);
    process.exit(1);
  }
  taskUpdated += 1;
}

console.log(JSON.stringify({ updated, taskUpdated, fixedAt }, null, 2));
