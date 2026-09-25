#!/usr/bin/env node

import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseEnv, loadRuntimeEnv } from './lib/runtime-env.mjs';

function readArg(name, fallback) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

const envFile = readArg('--env-file', process.env.IMAGE_ATTEMPTS_ENV_FILE || '');
loadRuntimeEnv({
  extraFiles: envFile ? [envFile] : ['.vercel/.env.production.local']
});

const limit = Math.max(1, Math.min(100, Number(readArg('--limit', 10))));
const hours = Math.max(1, Math.min(168, Number(readArg('--hours', 6))));
const json = process.argv.includes('--json');
const filters = {
  task_id: readArg('--task-id', ''),
  user_id: readArg('--user-id', ''),
  provider: readArg('--provider', ''),
  model: readArg('--model', ''),
  channel: readArg('--channel', ''),
  status: readArg('--status', '')
};
const { url, serviceRoleKey } = getSupabaseEnv({
  requireServiceRoleKey: true
});
const supabase = createClient(url, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

let query = supabase
  .from('image_generation_attempts')
  .select(
    'started_at,finished_at,duration_ms,task_id,request_mode,provider,model,channel,attempt_index,status,error_category,error_code,error_message,provider_request_id,metadata'
  )
  .gte('started_at', new Date(Date.now() - hours * 60 * 60 * 1000).toISOString())
  .order('started_at', { ascending: false })
  .limit(limit);

for (const [field, value] of Object.entries(filters)) {
  if (value) query = query.eq(field, value);
}

const { data, error } = await query;

if (error) {
  throw new Error(error.message);
}

const rows = (data || []).map((attempt) => ({
  started_at: attempt.started_at,
  task_id: attempt.task_id,
  mode: attempt.request_mode,
  provider: attempt.provider,
  model: attempt.model,
  channel: attempt.channel || 'default',
  attempt: attempt.attempt_index,
  status: attempt.status,
  duration_s: Number.isFinite(attempt.duration_ms)
    ? Math.round(attempt.duration_ms / 1000)
    : null,
  error_category: attempt.error_category || '',
  error_code: attempt.error_code || '',
  error_message: attempt.error_message
    ? String(attempt.error_message).slice(0, 160)
    : '',
  provider_request_id: attempt.provider_request_id ? '<present>' : '',
  sourceGenerationId: attempt.metadata?.sourceGenerationId || '',
  editMode: attempt.metadata?.editMode || '',
  editInstruction: attempt.metadata?.editInstruction
    ? String(attempt.metadata.editInstruction).slice(0, 120)
    : ''
}));

if (json) {
  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        hours,
        limit,
        filters,
        rows
      },
      null,
      2
    )
  );
} else {
  console.log(`Image generation attempts: last ${hours}h, limit ${limit}`);
  console.table(rows);
}
