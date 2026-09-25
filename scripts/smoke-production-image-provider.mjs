#!/usr/bin/env node

import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
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
  process.env.SMOKE_IMAGE_BASE_URL || 'https://webtomind.com'
).replace(/\/+$/u, '');
const model = process.env.SMOKE_IMAGE_MODEL || 'gpt-image-2';
const expectedProvider = process.env.SMOKE_IMAGE_EXPECTED_PROVIDER || 'tuzi';
const expectedModel = process.env.SMOKE_IMAGE_EXPECTED_MODEL || '';
const expectedLogicalModel =
  process.env.SMOKE_IMAGE_EXPECTED_LOGICAL_MODEL || '';
const expectedBaseUrl = process.env.SMOKE_IMAGE_EXPECTED_BASE_URL || '';
const imageSize = process.env.SMOKE_IMAGE_SIZE || '1024x1024';
const aspectRatio = process.env.SMOKE_IMAGE_ASPECT_RATIO || '1:1';
const timeoutMs = Number(process.env.SMOKE_IMAGE_TIMEOUT_MS || 360000);
const requestTimeoutMs = Number(
  process.env.SMOKE_IMAGE_REQUEST_TIMEOUT_MS || 30_000
);
const expectedAttemptCount = Number(
  process.env.SMOKE_IMAGE_EXPECTED_ATTEMPT_COUNT || 1
);
const verifyRecipeAudit = process.env.SMOKE_IMAGE_RECIPE_AUDIT === '1';
const smokeCreditGrant = Number(process.env.SMOKE_IMAGE_CREDIT_GRANT || 0);
const smokeRecipeAssetId = 'smoke-recipe-audit-asset';
const smokeRecipeAudit = verifyRecipeAudit
  ? {
      schemaVersion: 1,
      compilerVersion: 'smoke-recipe-audit-v1',
      selectionSource: 'manual',
      selectedAssetIds: [smokeRecipeAssetId]
    }
  : undefined;
const evidencePath =
  process.env.SMOKE_IMAGE_EVIDENCE_PATH ||
  path.join(process.cwd(), 'outputs/smoke/image-provider/latest.json');
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const anonKey =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error(
    'Production image smoke requires Supabase URL, anon key, and service role key.'
  );
}

if (!Number.isFinite(smokeCreditGrant) || smokeCreditGrant < 0) {
  throw new Error('SMOKE_IMAGE_CREDIT_GRANT must be a non-negative number.');
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

function creditSnapshot(body) {
  const total = Number(body?.credits?.total);
  const dailyImageGenUsed = Number(body?.quota?.dailyImageGen?.used);
  assert(
    Number.isFinite(total),
    'Credits response did not include credits.total.'
  );
  assert(
    Number.isFinite(dailyImageGenUsed),
    'Credits response did not include quota.dailyImageGen.used.'
  );
  return { total, dailyImageGenUsed };
}

function writeEvidence(value) {
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  const temporaryPath = `${evidencePath}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600
  });
  chmodSync(temporaryPath, 0o600);
  renameSync(temporaryPath, evidencePath);
  chmodSync(evidencePath, 0o600);
}

function firstImageUrl(body) {
  const image = Array.isArray(body?.images) ? body.images[0] : null;
  if (typeof image === 'string') return image;
  if (image && typeof image.url === 'string') return image.url;
  if (typeof body?.imageUrl === 'string') return body.imageUrl;
  if (typeof body?.url === 'string') return body.url;
  return '';
}

const email = `tuzi-provider-smoke-${Date.now()}-${randomUUID().slice(0, 8)}@example.com`;
const password = `Smoke-${randomUUID().replaceAll('-', '').slice(0, 32)}`;
let userId = '';
let evidence = null;
const cleanup = { attempted: false, deleted: false };

try {
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { source: 'tuzi-provider-smoke' }
  });
  if (created.error) throw created.error;
  userId = created.data.user.id;

  const signedIn = await anon.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  const token = signedIn.data.session?.access_token;
  assert(token, 'Smoke user sign-in did not return an access token.');

  const balanceBeforeGrant = creditSnapshot(
    await authenticatedJson('/api/credits/balance', token)
  );
  if (smokeCreditGrant > 0) {
    const wallet = await admin
      .from('user_credits')
      .select('bonus_credits,total_earned')
      .eq('user_id', userId)
      .single();
    if (wallet.error) throw wallet.error;
    const walletWrite = await admin
      .from('user_credits')
      .update({
        bonus_credits:
          Number(wallet.data?.bonus_credits || 0) + smokeCreditGrant,
        total_earned: Number(wallet.data?.total_earned || 0) + smokeCreditGrant
      })
      .eq('user_id', userId);
    if (walletWrite.error) throw walletWrite.error;
  }
  const balanceBefore = creditSnapshot(
    await authenticatedJson('/api/credits/balance', token)
  );
  const queued = await authenticatedJson('/api/image/generate', token, {
    method: 'POST',
    body: JSON.stringify({
      prompt: `Provider smoke test ${randomUUID()}: a simple blue circle centered on white`,
      model,
      aspectRatio,
      imageSize,
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 1,
      assetIds: verifyRecipeAudit ? [smokeRecipeAssetId] : [],
      ...(smokeRecipeAudit ? { recipeAudit: smokeRecipeAudit } : {}),
      async: true
    })
  });
  const taskId = queued?.taskId || queued?.task?.id;
  evidence = {
    ok: false,
    verifiedAt: new Date().toISOString(),
    baseUrl,
    taskId: taskId || null,
    model,
    imageSize,
    aspectRatio,
    stage: 'queued'
  };
  assert(
    taskId,
    `Image generation did not return a task id: ${JSON.stringify(queued)}`
  );

  const startedAt = Date.now();
  let task;
  while (Date.now() - startedAt < timeoutMs) {
    task = await authenticatedJson(
      `/api/image/task?id=${encodeURIComponent(taskId)}`,
      token
    );
    if (['succeeded', 'failed', 'cancelled'].includes(task?.status)) break;
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(1000, Number(task?.pollAfterMs || 5000)))
    );
  }
  evidence.stage = 'task_terminal';
  evidence.taskStatus = task?.status || 'timeout';
  evidence.taskError = task?.error || null;
  writeEvidence(evidence);
  assert(
    task?.status === 'succeeded',
    `Image task ${taskId} ended with ${task?.status || 'timeout'}: ${task?.error || 'no error'}`
  );

  let persistedLogicalModels;
  if (expectedLogicalModel) {
    const queuedTaskResult = await admin
      .from('image_generation_tasks')
      .select('id,request_payload')
      .eq('id', taskId)
      .single();
    if (queuedTaskResult.error) throw queuedTaskResult.error;
    const queuedTaskModel = queuedTaskResult.data?.request_payload?.model;

    const generationResult = await admin
      .from('image_generations')
      .select('id,provider,provider_model,metadata')
      .eq('user_id', userId)
      .contains('metadata', { groupId: taskId })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (generationResult.error) throw generationResult.error;
    const generationModel = generationResult.data?.provider_model;
    persistedLogicalModels = {
      expected: expectedLogicalModel,
      queuedTaskId: queuedTaskResult.data?.id || null,
      queuedTask: queuedTaskModel,
      generationId: generationResult.data?.id || null,
      generationProvider: generationResult.data?.provider || null,
      generation: generationModel || null,
      generationRequestedModel:
        generationResult.data?.metadata?.requestedModel || null,
      generationGroupId: generationResult.data?.metadata?.groupId || null
    };
  }

  const attemptsResult = await admin
    .from('image_generation_attempts')
    .select(
      'provider,channel,status,model,duration_ms,error_category,error_code,error_message,metadata'
    )
    .eq('task_id', taskId)
    .order('attempt_index', { ascending: true });
  if (attemptsResult.error) throw attemptsResult.error;
  const attempts = attemptsResult.data || [];
  const succeededAttempt = attempts.find(
    (attempt) => attempt.status === 'succeeded'
  );
  const attemptedBaseUrl = String(
    succeededAttempt?.metadata?.attemptedApiBaseUrl || ''
  );
  const balanceAfter = creditSnapshot(
    await authenticatedJson('/api/credits/balance', token)
  );
  evidence.stage = 'observed';
  evidence.logicalModels = persistedLogicalModels;
  evidence.attempts = attempts.map((attempt) => ({
    provider: attempt.provider,
    channel: attempt.channel,
    status: attempt.status,
    model: attempt.model,
    durationMs: attempt.duration_ms,
    errorCategory: attempt.error_category,
    errorCode: attempt.error_code,
    errorMessage: attempt.error_message,
    attemptedBaseUrl: String(attempt.metadata?.attemptedApiBaseUrl || ''),
    lockedModel: String(attempt.metadata?.lockedModel || ''),
    billingCharged: attempt.metadata?.billingCharged === true,
    chargedCredits: Number(attempt.metadata?.chargedCredits || 0)
  }));
  evidence.billing = {
    smokeCreditGrant,
    beforeGrant: balanceBeforeGrant,
    chargedCredits: Number(succeededAttempt?.metadata?.chargedCredits || 0),
    before: balanceBefore,
    after: balanceAfter
  };
  writeEvidence(evidence);

  if (expectedLogicalModel) {
    assert(
      persistedLogicalModels?.queuedTask === expectedLogicalModel,
      `Expected queued task model ${expectedLogicalModel}, received ${persistedLogicalModels?.queuedTask || '<missing>'}.`
    );
    assert(
      persistedLogicalModels?.generationId,
      'Logical model smoke did not create a generation row.'
    );
    assert(
      persistedLogicalModels?.generation === expectedLogicalModel,
      `Expected persisted generation model ${expectedLogicalModel}, received ${persistedLogicalModels?.generation || '<missing>'}.`
    );
  }
  assert(
    attempts.length === expectedAttemptCount,
    `Expected exactly ${expectedAttemptCount} provider attempt(s), received ${attempts.length}.`
  );
  assert(succeededAttempt, `Task ${taskId} has no succeeded provider attempt.`);
  assert(
    succeededAttempt.provider === expectedProvider,
    `Expected provider ${expectedProvider}, received ${succeededAttempt.provider}.`
  );
  if (expectedModel) {
    assert(
      succeededAttempt.model === expectedModel,
      `Expected model ${expectedModel}, received ${succeededAttempt.model}.`
    );
  }
  if (expectedBaseUrl) {
    assert(
      attemptedBaseUrl === expectedBaseUrl,
      `Expected base URL ${expectedBaseUrl}, received ${attemptedBaseUrl || '<missing>'}.`
    );
  }
  assert(
    succeededAttempt.metadata?.billingCharged === true,
    'Succeeded provider attempt was not marked as billed.'
  );
  assert(
    Number(succeededAttempt.metadata?.chargedCredits) > 0,
    'Succeeded provider attempt did not record a positive credit charge.'
  );

  assert(
    balanceAfter.total <= balanceBefore.total,
    'Credit balance increased unexpectedly during image generation smoke.'
  );
  assert(
    balanceAfter.dailyImageGenUsed >= balanceBefore.dailyImageGenUsed,
    'Daily image generation usage decreased unexpectedly during smoke.'
  );

  const imageUrl = firstImageUrl(task);
  assert(imageUrl, 'Succeeded image task did not return an image URL.');
  const imageResponse = await fetch(imageUrl, {
    signal: AbortSignal.timeout(requestTimeoutMs)
  });
  assert(
    imageResponse.ok,
    `Generated image returned HTTP ${imageResponse.status}.`
  );
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
  const metadata = await sharp(imageBuffer).metadata();
  assert(
    metadata.width && metadata.height,
    'Generated image metadata is incomplete.'
  );

  let persistedRecipeAudit;
  if (verifyRecipeAudit) {
    const generationResult = await admin
      .from('image_generations')
      .select('metadata,asset_ids')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (generationResult.error) throw generationResult.error;
    assert(
      generationResult.data,
      'Recipe audit smoke did not create a generation row.'
    );
    persistedRecipeAudit = generationResult.data.metadata?.recipeAudit;
    assert(
      JSON.stringify(generationResult.data.asset_ids) ===
        JSON.stringify([smokeRecipeAssetId]),
      'Generation row did not preserve the smoke recipe asset id.'
    );
    assert(
      JSON.stringify(persistedRecipeAudit) === JSON.stringify(smokeRecipeAudit),
      `Generation row recipe audit mismatch: ${JSON.stringify(persistedRecipeAudit)}`
    );
  }

  evidence = {
    ok: true,
    verifiedAt: new Date().toISOString(),
    baseUrl,
    taskId,
    model,
    logicalModels: persistedLogicalModels,
    imageSize,
    aspectRatio,
    provider: succeededAttempt.provider,
    channel: succeededAttempt.channel,
    attemptedBaseUrl,
    providerDurationMs: succeededAttempt.duration_ms,
    attempts: attempts.map((attempt) => ({
      provider: attempt.provider,
      channel: attempt.channel,
      status: attempt.status,
      model: attempt.model,
      durationMs: attempt.duration_ms,
      errorCategory: attempt.error_category,
      errorCode: attempt.error_code,
      errorMessage: attempt.error_message,
      attemptedBaseUrl: String(attempt.metadata?.attemptedApiBaseUrl || ''),
      lockedModel: String(attempt.metadata?.lockedModel || '')
    })),
    billing: {
      smokeCreditGrant,
      beforeGrant: balanceBeforeGrant,
      chargedCredits: Number(succeededAttempt.metadata?.chargedCredits),
      before: balanceBefore,
      after: balanceAfter
    },
    image: {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      bytes: imageBuffer.length
    },
    recipeAudit: verifyRecipeAudit
      ? { verified: true, value: persistedRecipeAudit }
      : { verified: false }
  };
} catch (error) {
  evidence ||= {
    ok: false,
    verifiedAt: new Date().toISOString(),
    baseUrl,
    taskId: null,
    model,
    imageSize,
    aspectRatio
  };
  evidence.ok = false;
  evidence.failedAt = new Date().toISOString();
  evidence.error = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  if (userId) {
    cleanup.attempted = true;
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error) {
      console.error(
        `WARN failed to delete smoke user ${userId}: ${deleted.error.message}`
      );
    } else {
      cleanup.deleted = true;
    }
  }
  if (evidence) {
    evidence.cleanup = cleanup;
    writeEvidence(evidence);
  }
}

if (evidence) {
  console.log(JSON.stringify({ ...evidence, evidencePath }, null, 2));
}
