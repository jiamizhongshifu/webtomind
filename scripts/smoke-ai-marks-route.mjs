#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import process from 'node:process';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { getRuntimeProductionEnvPath } from './lib/runtime-production-env.mjs';

const runtimeEnvFile =
  process.env.AI_MARKS_SMOKE_ENV_FILE || getRuntimeProductionEnvPath();
for (const path of ['.env.local', 'server/.env']) {
  if (existsSync(path)) loadEnv({ path, override: false, quiet: true });
}
if (runtimeEnvFile && existsSync(runtimeEnvFile)) {
  loadEnv({ path: runtimeEnvFile, override: true, quiet: true });
}

const baseUrl = (
  process.env.AI_MARKS_SMOKE_BASE_URL || 'https://webtomind.com'
).replace(/\/+$/, '');
const timeoutMs = Number(process.env.AI_MARKS_SMOKE_TIMEOUT_MS || 120_000);
const parsedStatusAttempts = Number(
  process.env.AI_MARKS_SMOKE_STATUS_ATTEMPTS || 6
);
const statusAttempts = Math.max(
  1,
  Math.min(8, Number.isFinite(parsedStatusAttempts) ? parsedStatusAttempts : 6)
);
const parsedStatusRetryDelayMs = Number(
  process.env.AI_MARKS_SMOKE_STATUS_RETRY_DELAY_MS || 5_000
);
const statusRetryDelayMs = Math.max(
  0,
  Math.min(
    30_000,
    Number.isFinite(parsedStatusRetryDelayMs) ? parsedStatusRetryDelayMs : 5_000
  )
);
const explicitToken = process.env.AI_MARKS_SMOKE_AUTH_TOKEN?.trim() || '';

function usable(value) {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('your-project.supabase.co')) return '';
  if (trimmed.includes('your_') || trimmed.includes('your-') || trimmed.includes('<')) {
    return '';
  }
  return trimmed;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function redact(value) {
  return String(value || '')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer <redacted>')
    .replace(/key=[A-Za-z0-9._-]+/g, 'key=<redacted>')
    .slice(0, 800);
}

async function withTimeout(task, label) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(`${label} timed out after ${timeoutMs}ms`),
    timeoutMs
  );
  try {
    return await task(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function apiFetch(path, token, options = {}) {
  return withTimeout(async (signal) => {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      signal,
      headers: {
        Accept: 'application/json',
        Origin: baseUrl,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`HTTP ${response.status}: non-JSON response`);
    }
    return { response, json };
  }, `${options.method || 'GET'} ${path}`);
}

async function fetchStatusWithRetry() {
  let lastResult = null;
  let lastError = null;
  for (let attempt = 1; attempt <= statusAttempts; attempt += 1) {
    try {
      lastResult = await apiFetch('/api/tools/ai-marks', '', { method: 'GET' });
      if (lastResult.response.ok && lastResult.json?.ok === true) return lastResult;
    } catch (error) {
      lastError = error;
    }
    if (attempt < statusAttempts && statusRetryDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, statusRetryDelayMs));
    }
  }
  if (lastResult) return lastResult;
  throw lastError || new Error('status check failed without a response');
}

async function createSmokeSession() {
  if (explicitToken) return { token: explicitToken, userId: null, cleanup: null };

  const supabaseUrl =
    usable(process.env.SUPABASE_URL) || usable(process.env.VITE_SUPABASE_URL);
  const anonKey =
    usable(process.env.SUPABASE_ANON_KEY) ||
    usable(process.env.VITE_SUPABASE_ANON_KEY);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  assert(supabaseUrl && anonKey, 'Missing Supabase URL or anon key for authenticated smoke.');

  const anon = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const admin = serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      })
    : null;
  const email = `ai-marks-smoke-${Date.now()}-${randomUUID().slice(0, 8)}@example.com`;
  const password = `Smoke-${randomUUID().replace(/-/g, '').slice(0, 32)}`;

  let userId = null;
  if (admin) {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { source: 'ai-marks-smoke' }
    });
    if (created.error) throw new Error(`Smoke user creation failed: ${created.error.message}`);
    userId = created.data.user.id;
  }

  const signedIn = admin
    ? await anon.auth.signInWithPassword({ email, password })
    : await anon.auth.signUp({ email, password });
  if (signedIn.error || !signedIn.data.session?.access_token) {
    if (admin && userId) await admin.auth.admin.deleteUser(userId);
    throw new Error(
      `Smoke user authentication failed: ${signedIn.error?.message || 'missing token; email confirmation may be enabled'}`
    );
  }

  return {
    token: signedIn.data.session.access_token,
    userId,
    cleanup: async () => {
      if (!admin || !userId) return;
      const deleted = await admin.auth.admin.deleteUser(userId);
      if (deleted.error) {
        console.warn(`WARN smoke user cleanup failed: ${redact(deleted.error.message)}`);
      }
    }
  };
}

let session = null;
try {
  const status = await fetchStatusWithRetry();
  assert(status.response.ok && status.json?.ok === true, `status check failed: ${JSON.stringify(status.json)}`);
  assert(status.json.health && status.json.capabilities, 'status payload is incomplete');
  assert(
    status.json.capabilities.visible_removal?.manual_boxes === true,
    'visible watermark repair capability is not enabled'
  );

  session = await createSmokeSession();
  const file = Buffer.from('WebToMind AI marks smoke test', 'utf8').toString('base64');
  const requestBody = { file, name: 'ai-marks-smoke.txt' };

  const inspect = await apiFetch('/api/tools/ai-marks', session.token, {
    method: 'POST',
    body: JSON.stringify({ action: 'inspect', ...requestBody })
  });
  assert(inspect.response.ok && inspect.json?.ok === true, `inspect failed: ${JSON.stringify(inspect.json)}`);

  const clean = await apiFetch('/api/tools/ai-marks', session.token, {
    method: 'POST',
    body: JSON.stringify({
      action: 'clean',
      ...requestBody,
      options: { strip_all_metadata: true }
    })
  });
  assert(clean.response.ok && clean.json?.ok === true, `clean failed: ${JSON.stringify(clean.json)}`);
  assert(typeof clean.json.cleaned === 'string' && clean.json.cleaned.length > 0, 'clean response has no output');
  const decoded = Buffer.from(clean.json.cleaned, 'base64').toString('utf8');
  assert(decoded.length > 0, 'clean output could not be decoded');

  const visibleFile =
    'iVBORw0KGgoAAAANSUhEUgAAACAAAAAYCAIAAAAUMWhjAAAAP0lEQVRIx2PcwgAE7LRDLAxcDDQFoxaMWjBqwagFoxYMuAU2JR24pI70bKexD7gYRi0YFhYcOVGBuz1Br3wAAACpCH4xCy+RAAAAAElFTkSuQmCC';
  const visibleClean = await apiFetch('/api/tools/ai-marks', session.token, {
    method: 'POST',
    body: JSON.stringify({
      action: 'clean',
      file: visibleFile,
      name: 'ai-marks-visible-smoke.png',
      options: {
        remove_visible: true,
        visible_boxes: [{ x: 0.625, y: 0.666666, width: 0.25, height: 0.208333 }],
        visible_padding_px: 0,
        visible_expand_px: 0
      }
    })
  });
  assert(
    visibleClean.response.ok && visibleClean.json?.ok === true,
    `visible cleanup failed: ${JSON.stringify(visibleClean.json)}`
  );
  assert(
    visibleClean.json.report?.visible_removal?.applied === true,
    'visible cleanup report does not confirm an applied repair'
  );

  console.log(
    `PASS AI marks authenticated smoke: status=${status.response.status} inspect=${inspect.response.status} clean=${clean.response.status} visible=${visibleClean.response.status}`
  );
} catch (error) {
  console.error(
    `FAIL AI marks authenticated smoke: ${redact(
      error?.name === 'AbortError' ? 'request timed out' : error?.message || error
    )}`
  );
  process.exitCode = 1;
} finally {
  await session?.cleanup?.();
}
