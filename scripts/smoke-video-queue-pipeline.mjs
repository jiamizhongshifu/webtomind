import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import process from 'node:process';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { getRuntimeProductionEnvPath } from './lib/runtime-production-env.mjs';

const runtimeEnvFile =
  process.env.SMOKE_ENV_FILE || getRuntimeProductionEnvPath();

for (const path of ['.env.local', 'server/.env']) {
  if (existsSync(path)) {
    loadEnv({ path, override: false, quiet: true });
  }
}

if (runtimeEnvFile && existsSync(runtimeEnvFile)) {
  loadEnv({ path: runtimeEnvFile, override: true, quiet: true });
}

const mode = (process.env.VIDEO_SMOKE_MODE || 'readonly').trim().toLowerCase();
const baseUrl = (
  process.env.VIDEO_SMOKE_BASE_URL ||
  process.env.CF_SMOKE_BASE_URL ||
  'https://webtomind.com'
).replace(/\/+$/, '');
const timeoutMs = Number(
  process.env.VIDEO_SMOKE_TIMEOUT_MS ||
    process.env.CF_SMOKE_TIMEOUT_MS ||
    120000
);
const pollTimeoutMs = Number(
  process.env.VIDEO_SMOKE_POLL_TIMEOUT_MS || 25 * 60 * 1000
);
const recentDays = Number(process.env.VIDEO_SMOKE_RECENT_DAYS || 7);

if (!['readonly', 'live'].includes(mode)) {
  throw new Error(
    `Unsupported VIDEO_SMOKE_MODE=${mode}. Use readonly or live.`
  );
}

function usableEnvValue(value) {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.includes('your-project.supabase.co')) return '';
  if (
    trimmed.includes('your_') ||
    trimmed.includes('your-') ||
    trimmed.includes('<')
  ) {
    return '';
  }
  return trimmed;
}

const supabaseUrl =
  usableEnvValue(process.env.SUPABASE_URL) ||
  usableEnvValue(process.env.VITE_SUPABASE_URL);
const supabaseAnonKey =
  usableEnvValue(process.env.SUPABASE_ANON_KEY) ||
  usableEnvValue(process.env.VITE_SUPABASE_ANON_KEY);
const supabaseServiceRoleKey = usableEnvValue(
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY.'
  );
}

const anon = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const admin = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;
let productionGenerationEnabled = null;

function logStep(name, extra = {}) {
  console.log(JSON.stringify({ step: name, ...extra }));
}

function assert(condition, message, details = undefined) {
  if (!condition) {
    const suffix = details ? ` ${JSON.stringify(details).slice(0, 1000)}` : '';
    throw new Error(`${message}${suffix}`);
  }
}

function redactError(error) {
  if (!error) return 'Unknown error';
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer <redacted>')
    .replace(
      /(access_token|refresh_token|api[_-]?key|service[_-]?role)["'=:\s]+[A-Za-z0-9._-]+/gi,
      '$1=<redacted>'
    )
    .slice(0, 1000);
}

async function withTimeout(promise, label) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(`${label} timed out after ${timeoutMs}ms`),
    timeoutMs
  );
  try {
    return await promise(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function apiFetch(path, options = {}) {
  return withTimeout(
    async (signal) => {
      const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        signal,
        headers: {
          Accept: 'application/json',
          Origin: baseUrl,
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(options.token
            ? { Authorization: `Bearer ${options.token}` }
            : {}),
          ...(options.headers || {})
        }
      });
      const text = await response.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { raw: text.slice(0, 500) };
      }

      return {
        response,
        json,
        server: response.headers.get('server') || '',
        cfRay: response.headers.get('cf-ray') || '',
        requestId: response.headers.get('x-webtomind-request-id') || '',
        runtime: response.headers.get('x-webtomind-runtime') || '',
        route: response.headers.get('x-webtomind-route') || ''
      };
    },
    `${options.method || 'GET'} ${path}`
  );
}

function buildGeneratePayload() {
  return {
    prompt:
      process.env.VIDEO_SMOKE_PROMPT ||
      `Smoke test video queue pipeline ${new Date().toISOString()} ${randomUUID().slice(0, 8)}`,
    model: process.env.VIDEO_SMOKE_MODEL || 'seedance-2-0',
    aspectRatio: process.env.VIDEO_SMOKE_ASPECT_RATIO || '1:1',
    duration: Number(process.env.VIDEO_SMOKE_DURATION || 5),
    resolution: process.env.VIDEO_SMOKE_RESOLUTION || undefined,
    outputFormat: process.env.VIDEO_SMOKE_OUTPUT_FORMAT || 'mp4',
    async: true
  };
}

async function checkModelsEndpoint() {
  const result = await apiFetch('/api/video/models');
  logStep('models-endpoint', {
    status: result.response.status,
    modelCount: Array.isArray(result.json?.models)
      ? result.json.models.length
      : 0,
    server: result.server || null,
    cfRay: result.cfRay ? '<present>' : null,
    requestId: result.requestId ? '<present>' : null,
    runtime: result.runtime || null,
    route: result.route || null
  });
  assert(
    result.response.ok,
    `/api/video/models failed with ${result.response.status}`,
    result.json
  );
  assert(
    Array.isArray(result.json?.models) && result.json.models.length > 0,
    '/api/video/models returned no models.'
  );
  productionGenerationEnabled = result.json?.enabled === true;
}

async function checkGenerateUnauthorized() {
  const result = await apiFetch('/api/video/generate', {
    method: 'POST',
    body: JSON.stringify(buildGeneratePayload())
  });
  logStep('generate-unauthenticated', {
    status: result.response.status,
    error: result.json?.error || null,
    message: result.json?.message || null,
    server: result.server || null,
    cfRay: result.cfRay ? '<present>' : null,
    requestId: result.requestId ? '<present>' : null,
    runtime: result.runtime || null,
    route: result.route || null
  });
  if (productionGenerationEnabled) {
    assert(
      result.response.status === 401,
      '/api/video/generate did not reject a valid unauthenticated request with 401. Check auth ordering before live smoke.',
      { status: result.response.status, body: result.json }
    );
    return;
  }
  assert(
    result.response.status === 501 &&
      result.json?.error === 'VIDEO_GENERATION_NOT_ENABLED',
    '/api/video/generate did not preserve the production maintenance gate.',
    { status: result.response.status, body: result.json }
  );
}

async function requireAdminClient() {
  assert(
    Boolean(admin),
    'SUPABASE_SERVICE_ROLE_KEY is required for DB queue/schema smoke checks.'
  );
  return admin;
}

async function selectOrThrow(label, query) {
  const { data, error, count } = await query;
  if (error) {
    throw new Error(`${label} failed: ${error.message}`);
  }
  return { data, count };
}

async function checkSchemaShape(sb) {
  const localMigrations = [
    'supabase/migrations/20260614133000_video_generation_tasks.sql',
    'supabase/migrations/20260615170000_media_objects_and_video_queue_metadata.sql',
    'supabase/migrations/20260615183000_video_task_claim_rpc.sql'
  ].map((path) => ({ path, exists: existsSync(path) }));

  await selectOrThrow(
    'video_generation_tasks schema check',
    sb
      .from('video_generation_tasks')
      .select(
        'id,status,provider,provider_task_id,generation_id,request_payload,result_payload,refund_failed,locked_until,queue_message_count,created_at,updated_at',
        {
          count: 'exact'
        }
      )
      .limit(1)
  );
  await selectOrThrow(
    'video_generations schema check',
    sb
      .from('video_generations')
      .select(
        'id,task_id,provider,provider_model,storage_bucket,storage_path,metadata,created_at',
        {
          count: 'exact'
        }
      )
      .limit(1)
  );
  await selectOrThrow(
    'media_objects schema check',
    sb
      .from('media_objects')
      .select(
        'id,owner_type,owner_id,kind,provider,bucket,object_key,status,metadata,created_at',
        {
          count: 'exact'
        }
      )
      .limit(1)
  );
  await selectOrThrow(
    'credit_transactions video refund schema check',
    sb
      .from('credit_transactions')
      .select('id,user_id,type,credit_type,amount,source,metadata,created_at', {
        count: 'exact'
      })
      .eq('type', 'refund')
      .limit(1)
  );

  logStep('db-schema', {
    localMigrations,
    remoteTables: [
      'video_generation_tasks',
      'video_generations',
      'media_objects',
      'credit_transactions'
    ],
    queueColumns: ['locked_until', 'queue_message_count'],
    result: 'pass'
  });
}

async function checkClaimRpc(sb) {
  const taskId = '00000000-0000-0000-0000-000000000000';
  const { data, error } = await sb.rpc('claim_video_generation_task', {
    p_task_id: taskId,
    p_expected_phase: 'create',
    p_expected_status: 'queued',
    p_lease_seconds: 10
  });
  if (error) {
    throw new Error(
      `claim_video_generation_task RPC check failed: ${error.message}`
    );
  }

  const reason =
    data && typeof data === 'object' && !Array.isArray(data)
      ? data.reason
      : undefined;
  logStep('db-claim-rpc', {
    taskId,
    claimed: data?.claimed ?? null,
    reason: reason || null
  });
  assert(
    data?.claimed === false && reason === 'not_found',
    'claim_video_generation_task RPC returned an unexpected readonly probe result.',
    data
  );
}

async function countRows(sb, table, fromIso) {
  const { count, error } = await sb
    .from(table)
    .select('id', { count: 'exact', head: true })
    .gte('created_at', fromIso);
  if (error) throw new Error(`${table} count failed: ${error.message}`);
  return count || 0;
}

async function checkRecentQueueState(sb) {
  const fromIso = new Date(
    Date.now() - recentDays * 24 * 60 * 60 * 1000
  ).toISOString();
  const taskCount = await countRows(sb, 'video_generation_tasks', fromIso);
  const generationCount = await countRows(sb, 'video_generations', fromIso);

  const { data: recentTasks } = await selectOrThrow(
    'recent video tasks check',
    sb
      .from('video_generation_tasks')
      .select(
        'id,status,provider,provider_task_id,generation_id,refund_failed,created_at,updated_at,completed_at,queue_message_count'
      )
      .gte('created_at', fromIso)
      .order('created_at', { ascending: false })
      .limit(10)
  );

  const statusCounts = {};
  for (const task of recentTasks || []) {
    statusCounts[task.status] = (statusCounts[task.status] || 0) + 1;
  }

  logStep('db-recent-video-queue', {
    recentDays,
    taskCount,
    generationCount,
    sampledStatusCounts: statusCounts,
    recentTasks: (recentTasks || []).map((task) => ({
      id: task.id,
      status: task.status,
      provider: task.provider,
      providerTaskId: task.provider_task_id ? '<present>' : null,
      generationId: task.generation_id || null,
      refundFailed: task.refund_failed,
      queueMessageCount: task.queue_message_count,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
      completedAt: task.completed_at
    }))
  });
}

function getVideoRefundKey(transaction) {
  const metadata =
    transaction?.metadata && typeof transaction.metadata === 'object'
      ? transaction.metadata
      : {};
  const idempotencyKey =
    metadata.idempotency_key || metadata.idempotencyKey || '';
  const billingDomain = metadata.billingDomain || '';
  if (
    billingDomain === 'video_task' ||
    String(idempotencyKey).startsWith('video_task:')
  ) {
    return String(idempotencyKey || transaction.source || '');
  }
  return '';
}

async function checkDuplicateRefunds(sb) {
  const fromIso = new Date(
    Date.now() - recentDays * 24 * 60 * 60 * 1000
  ).toISOString();
  const { data } = await selectOrThrow(
    'recent video refunds check',
    sb
      .from('credit_transactions')
      .select('id,user_id,type,credit_type,amount,source,metadata,created_at')
      .eq('type', 'refund')
      .gte('created_at', fromIso)
      .order('created_at', { ascending: false })
      .limit(1000)
  );

  const videoRefunds = (data || []).filter((transaction) =>
    getVideoRefundKey(transaction)
  );
  const groups = new Map();
  for (const transaction of videoRefunds) {
    const key = `${transaction.user_id}:${transaction.type}:${getVideoRefundKey(transaction)}`;
    const group = groups.get(key) || {
      userId: transaction.user_id,
      type: transaction.type,
      idempotencyKey: getVideoRefundKey(transaction),
      count: 0,
      amountTotal: 0,
      transactionIds: []
    };
    group.count += 1;
    group.amountTotal += Number(transaction.amount || 0);
    group.transactionIds.push(transaction.id);
    groups.set(key, group);
  }

  const duplicates = [...groups.values()].filter((group) => group.count > 1);
  logStep('db-video-refund-idempotency', {
    recentDays,
    refundRowsSampled: data?.length || 0,
    videoRefundRows: videoRefunds.length,
    duplicateGroups: duplicates
  });
  assert(
    duplicates.length === 0,
    'Duplicate video refund idempotency keys found.',
    duplicates
  );
}

async function runReadonlySmoke() {
  await checkModelsEndpoint();
  await checkGenerateUnauthorized();
  const sb = await requireAdminClient();
  await checkSchemaShape(sb);
  await checkClaimRpc(sb);
  await checkRecentQueueState(sb);
  await checkDuplicateRefunds(sb);
  logStep('summary', {
    mode,
    baseUrl,
    result: 'pass',
    liveGenerationCalled: false
  });
}

async function getLiveAuthToken() {
  const explicitToken = usableEnvValue(process.env.VIDEO_SMOKE_AUTH_TOKEN);
  if (explicitToken) return explicitToken;

  const email = usableEnvValue(process.env.VIDEO_SMOKE_USER_EMAIL);
  const password = usableEnvValue(process.env.VIDEO_SMOKE_USER_PASSWORD);
  if (!email || !password) {
    assert(
      admin,
      'Live smoke requires a prepared account or SUPABASE_SERVICE_ROLE_KEY for an isolated smoke user.'
    );
    const smokeEmail = `video-smoke-${Date.now()}-${randomUUID().slice(0, 8)}@example.com`;
    const smokePassword = `Video-${randomUUID().replaceAll('-', '').slice(0, 32)}`;
    const created = await admin.auth.admin.createUser({
      email: smokeEmail,
      password: smokePassword,
      email_confirm: true,
      user_metadata: { source: 'video-queue-live-smoke' }
    });
    if (created.error || !created.data.user) {
      throw new Error(
        `Live smoke user create failed: ${created.error?.message || 'missing user'}`
      );
    }
    temporaryLiveUserId = created.data.user.id;
    const grantedCredits = Number(
      process.env.VIDEO_SMOKE_GRANTED_CREDITS || 5000
    );
    const wallet = await admin
      .from('user_credits')
      .select('bonus_credits,total_earned')
      .eq('user_id', temporaryLiveUserId)
      .maybeSingle();
    if (wallet.error) {
      throw new Error(
        `Live smoke wallet lookup failed: ${wallet.error.message}`
      );
    }
    const walletWrite = wallet.data
      ? await admin
          .from('user_credits')
          .update({
            bonus_credits:
              Number(wallet.data.bonus_credits || 0) + grantedCredits,
            total_earned: Number(wallet.data.total_earned || 0) + grantedCredits
          })
          .eq('user_id', temporaryLiveUserId)
      : await admin.from('user_credits').insert({
          user_id: temporaryLiveUserId,
          bonus_credits: grantedCredits,
          total_earned: grantedCredits
        });
    if (walletWrite.error) {
      throw new Error(
        `Live smoke credit grant failed: ${walletWrite.error.message}`
      );
    }
    const signedIn = await anon.auth.signInWithPassword({
      email: smokeEmail,
      password: smokePassword
    });
    if (signedIn.error || !signedIn.data.session?.access_token) {
      throw new Error(
        `Live smoke user sign-in failed: ${signedIn.error?.message || 'missing access token'}`
      );
    }
    logStep('live-auth', {
      source: 'isolated-smoke-user',
      grantedCredits
    });
    return signedIn.data.session.access_token;
  }

  const { data, error } = await anon.auth.signInWithPassword({
    email,
    password
  });
  if (error || !data.session?.access_token) {
    throw new Error(
      `Live smoke sign-in failed: ${error?.message || 'missing access token'}`
    );
  }
  return data.session.access_token;
}

let temporaryLiveUserId = '';

async function cleanupTemporaryLiveUser() {
  if (!temporaryLiveUserId || !admin) return;
  const deleted = await admin.auth.admin.deleteUser(temporaryLiveUserId);
  logStep('live-auth-cleanup', {
    deleted: !deleted.error,
    error: deleted.error?.message || null
  });
}

async function findRefundForTask(sb, taskId) {
  if (!sb || !taskId) return null;
  const { data, error } = await sb
    .from('credit_transactions')
    .select('id,type,credit_type,amount,source,metadata,created_at')
    .eq('type', 'refund')
    .eq('metadata->>idempotency_key', `video_task:${taskId}:refund`)
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) {
    logStep('live-refund-lookup-warning', { taskId, error: error.message });
    return null;
  }
  return data || [];
}

async function getTaskDbRecord(sb, taskId) {
  if (!sb || !taskId) return null;
  const { data, error } = await sb
    .from('video_generation_tasks')
    .select(
      'id,status,provider,provider_task_id,generation_id,refund_failed,result_payload,error_message,created_at,updated_at,completed_at'
    )
    .eq('id', taskId)
    .single();
  if (error) {
    logStep('live-task-db-lookup-warning', { taskId, error: error.message });
    return null;
  }
  return data || null;
}

async function getGenerationDbRecord(sb, generationId) {
  if (!sb || !generationId) return null;
  const { data, error } = await sb
    .from('video_generations')
    .select('id,task_id,storage_bucket,storage_path,metadata,created_at')
    .eq('id', generationId)
    .single();
  if (error) {
    logStep('live-generation-db-lookup-warning', {
      generationId,
      error: error.message
    });
    return null;
  }
  return data || null;
}

function getStorageProvider(taskJson, taskRecord, generationRecord) {
  return (
    taskJson?.generation?.metadata?.storageProvider ||
    generationRecord?.metadata?.storageProvider ||
    taskRecord?.result_payload?.generation?.metadata?.storageProvider ||
    (generationRecord?.storage_bucket ? 'supabase-or-legacy' : null)
  );
}

async function runLiveSmoke() {
  assert(
    process.env.VIDEO_SMOKE_LIVE === 'true',
    'Refusing live video smoke without VIDEO_SMOKE_LIVE=true. This mode calls /api/video/generate and may spend real provider credits.'
  );

  const token = await getLiveAuthToken();
  const payload = buildGeneratePayload();
  const generateResult = await apiFetch('/api/video/generate', {
    method: 'POST',
    token,
    body: JSON.stringify(payload)
  });
  logStep('live-generate', {
    status: generateResult.response.status,
    taskId: generateResult.json?.taskId || null,
    queued: generateResult.json?.queued || false,
    contractModel: generateResult.json?.contract?.model || null,
    contractApiModel: generateResult.json?.contract?.apiModel || null,
    credits: generateResult.json?.credits || null,
    error: generateResult.json?.error || null,
    message: generateResult.json?.message || null
  });
  assert(
    generateResult.response.status === 202 && generateResult.json?.taskId,
    'Live /api/video/generate did not enqueue a task.',
    { status: generateResult.response.status, body: generateResult.json }
  );

  const taskId = generateResult.json.taskId;
  const startedAt = Date.now();
  let delayMs = Math.max(1000, Number(generateResult.json.pollAfterMs || 5000));
  let taskJson = null;

  while (Date.now() - startedAt < pollTimeoutMs) {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(delayMs, 15000))
    );
    const taskResult = await apiFetch(
      `/api/video/task?id=${encodeURIComponent(taskId)}`,
      {
        token
      }
    );
    taskJson = taskResult.json;
    logStep('live-task-poll', {
      statusCode: taskResult.response.status,
      taskId,
      status: taskJson?.status || null,
      providerTaskId: taskJson?.providerTaskId ? '<present>' : null,
      generationId: taskJson?.generation?.generationId || null,
      refundFailed: taskJson?.refundFailed ?? null,
      pollAfterMs: taskJson?.pollAfterMs || null
    });
    assert(
      taskResult.response.ok || taskResult.response.status === 202,
      'Live /api/video/task poll failed.',
      {
        status: taskResult.response.status,
        body: taskJson
      }
    );
    if (['succeeded', 'failed', 'cancelled'].includes(taskJson?.status)) {
      break;
    }
    delayMs = Math.max(1000, Number(taskJson?.pollAfterMs || 8000));
  }

  assert(taskJson?.status === 'succeeded', 'Live video task did not succeed.', {
    taskId,
    lastStatus: taskJson?.status || null,
    error: taskJson?.error || taskJson?.message || null
  });

  const videoUrl = taskJson?.videoUrl || taskJson?.generation?.videoUrl || null;
  assert(videoUrl, 'Succeeded live video task did not return a video URL.', {
    taskId
  });
  const videoResponse = await fetch(videoUrl, {
    headers: { Range: 'bytes=0-1023' },
    signal: AbortSignal.timeout(timeoutMs)
  });
  assert(
    videoResponse.ok,
    `Generated live video returned HTTP ${videoResponse.status}.`
  );
  const videoProbe = new Uint8Array(await videoResponse.arrayBuffer());
  assert(videoProbe.byteLength > 0, 'Generated live video returned no bytes.');

  const taskRecord = await getTaskDbRecord(admin, taskId);
  const generationId =
    taskJson?.generation?.generationId || taskRecord?.generation_id || null;
  const generationRecord = await getGenerationDbRecord(admin, generationId);
  const refunds = await findRefundForTask(admin, taskId);

  logStep('summary', {
    mode,
    baseUrl,
    result: 'pass',
    liveGenerationCalled: true,
    taskId,
    status: taskJson.status,
    providerTaskId: taskJson.providerTaskId
      ? '<present>'
      : taskRecord?.provider_task_id
        ? '<present>'
        : null,
    generationId,
    storageProvider: getStorageProvider(taskJson, taskRecord, generationRecord),
    video: {
      status: videoResponse.status,
      contentType: videoResponse.headers.get('content-type') || null,
      probedBytes: videoProbe.byteLength
    },
    refund: {
      refundFailed: taskJson?.refundFailed ?? taskRecord?.refund_failed ?? null,
      refundRows: Array.isArray(refunds) ? refunds.length : null,
      refundTransactionIds: Array.isArray(refunds)
        ? refunds.map((row) => row.id)
        : []
    }
  });
}

async function main() {
  logStep('start', {
    mode,
    baseUrl,
    envFile:
      runtimeEnvFile && existsSync(runtimeEnvFile) ? runtimeEnvFile : null,
    recentDays
  });
  if (mode === 'readonly') {
    await runReadonlySmoke();
    return;
  }
  await runLiveSmoke();
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify({ step: 'failed', error: redactError(error) })
    );
    process.exitCode = 1;
  })
  .finally(cleanupTemporaryLiveUser);
