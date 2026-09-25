#!/usr/bin/env node

import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import sharp from 'sharp';
import { getRuntimeProductionEnvPath } from './lib/runtime-production-env.mjs';

for (const envFile of ['.env.local', getRuntimeProductionEnvPath()]) {
  if (existsSync(envFile))
    loadEnv({ path: envFile, override: false, quiet: true });
}

const baseUrl = String(
  process.env.SMOKE_DENOISE_BASE_URL || 'https://webtomind.com'
).replace(/\/+$/u, '');
const timeoutMs = Number(process.env.SMOKE_DENOISE_TIMEOUT_MS || 480_000);
const requestTimeoutMs = Number(
  process.env.SMOKE_DENOISE_REQUEST_TIMEOUT_MS || 30_000
);
const evidencePath =
  process.env.SMOKE_DENOISE_EVIDENCE_PATH ||
  path.join(process.cwd(), 'outputs/smoke/gpt-image-2-denoise/latest.json');
const referencePath = process.env.SMOKE_DENOISE_REFERENCE_PATH || '';
const resultPath = process.env.SMOKE_DENOISE_RESULT_PATH || '';
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const anonKey =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const expectedCreditCost = 115;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error(
    'Denoise smoke requires Supabase URL, anon key, and service role key.'
  );
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const anon = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function authenticatedJson(pathname, token, init = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...init,
    signal: init.signal || AbortSignal.timeout(requestTimeoutMs),
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      Origin: baseUrl,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {})
    }
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  if (!response.ok) {
    throw new Error(
      `${pathname} returned ${response.status}: ${JSON.stringify(body).slice(0, 800)}`
    );
  }
  return body;
}

async function waitForTask(taskId, token) {
  const startedAt = Date.now();
  let task;
  while (Date.now() - startedAt < timeoutMs) {
    task = await authenticatedJson(
      `/api/image/task?id=${encodeURIComponent(taskId)}`,
      token
    );
    if (['succeeded', 'failed', 'cancelled'].includes(task?.status))
      return task;
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(1000, Number(task?.pollAfterMs || 5000)))
    );
  }
  throw new Error(`Task ${taskId} did not finish within ${timeoutMs}ms.`);
}

async function enqueue(referenceId, token, dimensions = {}) {
  const queued = await authenticatedJson(
    '/api/tools/gpt-image-2-denoise',
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        referenceId,
        strength: 'standard',
        outputFormat: 'png',
        sourceWidth: dimensions.width || 256,
        sourceHeight: dimensions.height || 256
      })
    }
  );
  assert(queued?.taskId, 'Denoise route did not return taskId.');
  assert(
    queued?.cost === expectedCreditCost,
    `Denoise route returned cost=${queued?.cost}.`
  );
  return queued.taskId;
}

async function wallet(userId) {
  const result = await admin
    .from('user_credits')
    .select(
      'media_credits,promo_media_credits,daily_image_gen_used,total_consumed'
    )
    .eq('user_id', userId)
    .single();
  if (result.error) throw result.error;
  return result.data;
}

function writeEvidence(value) {
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  const temporary = `${evidencePath}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600
  });
  chmodSync(temporary, 0o600);
  renameSync(temporary, evidencePath);
  chmodSync(evidencePath, 0o600);
}

const email = `denoise-smoke-${Date.now()}-${randomUUID().slice(0, 8)}@example.com`;
const password = `Smoke-${randomUUID().replaceAll('-', '').slice(0, 32)}`;
const startedAt = new Date().toISOString();
let userId = '';
let uploadedReference;
let fakeReferenceId = '';
let evidence;
const cleanup = {
  referenceObjectDeleted: false,
  userDeleted: false
};

try {
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { source: 'gpt-image-2-denoise-smoke' }
  });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  const seeded = await admin
    .from('user_credits')
    .update({ media_credits: 500, promo_media_credits: 0 })
    .eq('user_id', userId)
    .select('user_id')
    .single();
  if (seeded.error) throw seeded.error;

  const signedIn = await anon.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  const token = signedIn.data.session?.access_token;
  assert(token, 'Smoke sign-in did not return an access token.');

  const referencePng = referencePath
    ? await sharp(readFileSync(referencePath)).png().toBuffer()
    : await sharp({
        create: {
          width: 256,
          height: 256,
          channels: 3,
          background: { r: 242, g: 238, b: 226 }
        }
      })
        .composite([
          {
            input: Buffer.from(
              '<svg width="256" height="256"><rect x="34" y="34" width="188" height="188" rx="22" fill="#315f53"/><text x="128" y="142" text-anchor="middle" font-family="Arial" font-size="42" fill="white">TEST</text></svg>'
            )
          }
        ])
        .png()
        .toBuffer();
  const referenceMetadata = await sharp(referencePng).metadata();
  const referenceDimensions = {
    width: referenceMetadata.width || 256,
    height: referenceMetadata.height || 256
  };
  const upload = await authenticatedJson(
    '/api/image/references/upload',
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        imageBase64: `data:image/png;base64,${referencePng.toString('base64')}`,
        mimeType: 'image/png',
        role: 'style',
        label: 'Denoise smoke reference',
        description: 'sourceApp:gpt-image-2-denoiser',
        sourceApp: 'gpt-image-2-denoiser'
      })
    }
  );
  uploadedReference = upload?.reference;
  assert(uploadedReference?.id, 'Reference upload did not return an id.');

  const before = await wallet(userId);
  const successTaskId = await enqueue(
    uploadedReference.id,
    token,
    referenceDimensions
  );
  const successTask = await waitForTask(successTaskId, token);
  assert(
    successTask.status === 'succeeded',
    `Success task ended as ${successTask.status}: ${successTask.error || ''}`
  );
  const resultImageUrl =
    successTask.imageUrl ||
    successTask.result?.imageUrl ||
    successTask.result_payload?.imageUrl;
  assert(
    resultImageUrl,
    'Successful denoise task did not return an image URL.'
  );
  if (resultPath) {
    const resultResponse = await fetch(resultImageUrl, {
      signal: AbortSignal.timeout(requestTimeoutMs)
    });
    assert(
      resultResponse.ok,
      `Result download returned ${resultResponse.status}.`
    );
    mkdirSync(path.dirname(resultPath), { recursive: true });
    writeFileSync(resultPath, Buffer.from(await resultResponse.arrayBuffer()), {
      mode: 0o600
    });
  }
  const afterSuccess = await wallet(userId);
  assert(
    Number(afterSuccess.media_credits) +
      Number(afterSuccess.promo_media_credits) ===
      Number(before.media_credits) +
        Number(before.promo_media_credits) -
        expectedCreditCost,
    `Successful denoise did not consume exactly ${expectedCreditCost} credits.`
  );
  assert(
    afterSuccess.daily_image_gen_used === before.daily_image_gen_used,
    'Successful denoise changed the generic daily image quota.'
  );

  const fakeReference = await admin
    .from('image_reference_assets')
    .insert({
      user_id: userId,
      storage_bucket: uploadedReference.storageBucket,
      storage_path: `image-references/${userId}/missing-${randomUUID()}.png`,
      mime_type: 'image/png',
      file_size_bytes: 1,
      role: 'style',
      label: 'Missing denoise smoke reference',
      metadata: { source: 'gpt-image-2-denoise-smoke-failure' }
    })
    .select('id')
    .single();
  if (fakeReference.error) throw fakeReference.error;
  fakeReferenceId = fakeReference.data.id;

  const failureTaskId = await enqueue(
    fakeReferenceId,
    token,
    referenceDimensions
  );
  const failureTask = await waitForTask(failureTaskId, token);
  assert(
    failureTask.status === 'failed',
    `Failure task unexpectedly ended as ${failureTask.status}.`
  );
  const failureTaskRecordResult = await admin
    .from('image_generation_tasks')
    .select('request_payload,result_payload,refund_failed')
    .eq('id', failureTaskId)
    .single();
  if (failureTaskRecordResult.error) throw failureTaskRecordResult.error;
  const failureTaskRecord = failureTaskRecordResult.data;
  const afterFailure = await wallet(userId);
  assert(
    Number(afterFailure.media_credits) +
      Number(afterFailure.promo_media_credits) ===
      Number(afterSuccess.media_credits) +
        Number(afterSuccess.promo_media_credits),
    `Failed denoise did not return the deducted media credit: ${JSON.stringify({
      afterSuccess,
      afterFailure,
      task: failureTask,
      billing: failureTaskRecord?.result_payload?.diagnostics?.billing,
      prepaidCredit: failureTaskRecord?.request_payload?.prepaidCredit
    })}`
  );
  assert(
    afterFailure.daily_image_gen_used === before.daily_image_gen_used,
    'Failed denoise changed the generic daily image quota.'
  );

  const transactionsResult = await admin
    .from('credit_transactions')
    .select('type,credit_type,amount,source,metadata,created_at')
    .eq('user_id', userId)
    .gte('created_at', startedAt)
    .order('created_at', { ascending: true });
  if (transactionsResult.error) throw transactionsResult.error;
  const transactions = transactionsResult.data || [];
  const usage = transactions.filter(
    (item) => item.source === 'gpt_image_2_denoise'
  );
  const refund = transactions.find(
    (item) => item.source === `denoise_task:${failureTaskId}:refund`
  );
  assert(
    usage.length === 2 &&
      usage.every((item) => item.amount === -expectedCreditCost),
    `Expected two dedicated -${expectedCreditCost} usage rows, got ${JSON.stringify(usage)}`
  );
  assert(
    refund?.amount === expectedCreditCost,
    `Expected a +${expectedCreditCost} dedicated failure refund, got ${JSON.stringify(refund)}`
  );

  const attemptsResult = await admin
    .from('image_generation_attempts')
    .select(
      'task_id,provider,channel,status,model,duration_ms,error_code,metadata'
    )
    .in('task_id', [successTaskId, failureTaskId])
    .order('created_at', { ascending: true });
  if (attemptsResult.error) throw attemptsResult.error;
  const successAttempts = (attemptsResult.data || []).filter(
    (item) => item.task_id === successTaskId && item.status === 'succeeded'
  );
  assert(
    successAttempts.length === 1,
    `Expected one successful Nano Banana restoration, got ${JSON.stringify(successAttempts)}`
  );
  assert(
    successAttempts.every(
      (item) =>
        item.provider === 'tuzi' &&
        item.model === 'gemini-3.1-flash-image-preview'
    ),
    `Expected the restoration to use Nano Banana 2, got ${JSON.stringify(successAttempts)}`
  );
  assert(
    successAttempts[0]?.metadata?.phase === 'denoise_dual_reference_restore' &&
      successAttempts[0]?.metadata?.guideMode ===
        'deterministic_cloudflare_images_v1',
    `Unexpected denoise restoration metadata: ${JSON.stringify(successAttempts)}`
  );
  assert(
    successAttempts.every(
      (item) => item.metadata?.transport === 'tuzi_images_generations_json'
    ),
    `Expected Tuzi default dual-reference JSON transport for the restoration, got ${JSON.stringify(successAttempts)}`
  );
  const successAttempt = successAttempts[0];

  evidence = {
    ok: true,
    verifiedAt: new Date().toISOString(),
    baseUrl,
    success: {
      taskId: successTaskId,
      provider: successAttempt.provider,
      channel: successAttempt.channel,
      model: successAttempt.model,
      durationMs: successAttempts.reduce(
        (total, item) => total + Number(item.duration_ms || 0),
        0
      ),
      stages: successAttempts.map((item) => ({
        phase: item.metadata?.phase,
        model: item.model,
        provider: item.provider,
        channel: item.channel,
        durationMs: item.duration_ms,
        referenceOrder: item.metadata?.referenceOrder
      })),
      charged: expectedCreditCost,
      referencePath: referencePath || null,
      resultPath: resultPath || null
    },
    failureRefund: {
      taskId: failureTaskId,
      terminalStatus: failureTask.status,
      refunded: refund.amount,
      refundSource: refund.source
    },
    quotaIsolation: {
      before: before.daily_image_gen_used,
      afterSuccess: afterSuccess.daily_image_gen_used,
      afterFailure: afterFailure.daily_image_gen_used
    },
    wallet: { before, afterSuccess, afterFailure },
    transactions: transactions.map((item) => ({
      type: item.type,
      creditType: item.credit_type,
      amount: item.amount,
      source: item.source,
      billingTier: item.metadata?.billingTier,
      appOperation: item.metadata?.appOperation
    }))
  };
} finally {
  if (uploadedReference?.storageBucket && uploadedReference?.storagePath) {
    const removed = await admin.storage
      .from(uploadedReference.storageBucket)
      .remove([uploadedReference.storagePath]);
    cleanup.referenceObjectDeleted = !removed.error;
  }
  if (userId) {
    const deleted = await admin.auth.admin.deleteUser(userId);
    cleanup.userDeleted = !deleted.error;
    if (deleted.error)
      console.error(
        `WARN failed to delete smoke user: ${deleted.error.message}`
      );
  }
}

if (evidence) {
  evidence.cleanup = cleanup;
  writeEvidence(evidence);
  console.log(JSON.stringify({ ...evidence, evidencePath }, null, 2));
}
