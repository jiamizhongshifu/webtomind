import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import process from 'node:process';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { getRuntimeProductionEnvPath } from './lib/runtime-production-env.mjs';

const runtimeEnvFile = process.env.SMOKE_ENV_FILE || getRuntimeProductionEnvPath();

for (const path of ['.env.local', 'server/.env']) {
  if (existsSync(path)) {
    loadEnv({ path, override: false, quiet: true });
  }
}

if (runtimeEnvFile && existsSync(runtimeEnvFile)) {
  loadEnv({ path: runtimeEnvFile, override: true, quiet: true });
}

const baseUrl = (process.env.CF_SMOKE_BASE_URL || 'https://webtomind.com').replace(/\/+$/, '');

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
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const timeoutMs = Number(process.env.CF_SMOKE_TIMEOUT_MS || 120000);
const expectedDeepSeekModel = 'deepseek-v4-flash';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY.');
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

function logStep(name, extra = {}) {
  console.log(JSON.stringify({ step: name, ...extra }));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function redactError(error) {
  if (!error) return 'Unknown error';
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer <redacted>')
    .replace(/key=[A-Za-z0-9._-]+/g, 'key=<redacted>')
    .slice(0, 1000);
}

async function withTimeout(promise, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(`${label} timed out after ${timeoutMs}ms`), timeoutMs);
  try {
    return await promise(controller.signal);
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
        Authorization: `Bearer ${token}`,
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
      cfRay: response.headers.get('cf-ray') || ''
    };
  }, `${options.method || 'GET'} ${path}`);
}

function assertCloudflareResult(result, label) {
  assert(
    result.server.toLowerCase().includes('cloudflare') || Boolean(result.cfRay),
    `${label} did not appear to be served by Cloudflare (server=${result.server || 'none'})`
  );
}

function assertObservabilityHeaders(result, label) {
  const requestId = result.response.headers.get('x-webtomind-request-id');
  const runtime = result.response.headers.get('x-webtomind-runtime');
  const originRuntime = result.response.headers.get('x-webtomind-origin-runtime');
  const route = result.response.headers.get('x-webtomind-route');
  const serverTiming = result.response.headers.get('server-timing');

  assert(Boolean(requestId), `${label} missing x-webtomind-request-id`);
  assert(runtime === 'cloudflare-worker', `${label} unexpected x-webtomind-runtime: ${runtime || 'none'}`);
  assert(
    originRuntime === 'cloudflare-worker',
    `${label} unexpected x-webtomind-origin-runtime: ${originRuntime || 'none'}`
  );
  assert(Boolean(route), `${label} missing x-webtomind-route`);
  assert(
    /(?:^|,\s*)app;dur=\d+/.test(serverTiming || ''),
    `${label} missing app Server-Timing`
  );
}

async function expectOk(label, path, token, options, validate) {
  const result = await apiFetch(path, token, options);
  logStep(label, {
    status: result.response.status,
    server: result.server || null,
    cfRay: result.cfRay ? '<present>' : null,
    requestId: result.response.headers.get('x-webtomind-request-id') ? '<present>' : null,
    runtime: result.response.headers.get('x-webtomind-runtime') || null,
    originRuntime: result.response.headers.get('x-webtomind-origin-runtime') || null,
    route: result.response.headers.get('x-webtomind-route') || null,
    serverTiming: result.response.headers.get('server-timing') ? '<present>' : null
  });
  assertCloudflareResult(result, label);
  assertObservabilityHeaders(result, label);
  assert(result.response.ok, `${label} failed with ${result.response.status}: ${JSON.stringify(result.json).slice(0, 800)}`);
  if (validate) validate(result.json);
  return result.json;
}

async function createSmokeUser() {
  const email = `cloudflare-ai-smoke-${Date.now()}-${randomUUID().slice(0, 8)}@example.com`;
  const password = `Smoke-${randomUUID().replace(/-/g, '').slice(0, 32)}`;

  if (admin) {
    let data;
    let error;
    try {
      const result = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { source: 'cloudflare-ai-smoke' }
      });
      data = result.data;
      error = result.error;
    } catch (createError) {
      throw new Error(`Failed to create smoke user: ${redactError(createError)}`);
    }
    if (error) throw new Error(`Failed to create smoke user: ${error.message}`);
    let sessionData;
    let signInError;
    try {
      const result = await anon.auth.signInWithPassword({
        email,
        password
      });
      sessionData = result.data;
      signInError = result.error;
    } catch (authError) {
      throw new Error(`Failed to sign in smoke user: ${redactError(authError)}`);
    }
    if (signInError) throw new Error(`Failed to sign in smoke user: ${signInError.message}`);
    assert(sessionData.session?.access_token, 'Smoke user sign-in did not return an access token.');
    return {
      userId: data.user.id,
      email,
      token: sessionData.session.access_token,
      canDeleteAuthUser: true
    };
  }

  const { data, error } = await anon.auth.signUp({ email, password });
  if (error) throw new Error(`Failed to sign up smoke user: ${error.message}`);
  assert(
    data.session?.access_token,
    'Smoke sign-up did not return a session. Email confirmation may be enabled; provide SUPABASE_SERVICE_ROLE_KEY via SMOKE_ENV_FILE.'
  );
  return {
    userId: data.user?.id || null,
    email,
    token: data.session.access_token,
    canDeleteAuthUser: false
  };
}

async function safeDeleteCard(token, cardId) {
  if (!cardId) return;
  try {
    const result = await apiFetch(`/api/workspace/cards/${cardId}`, token, { method: 'DELETE' });
    logStep('cleanup-card', { id: cardId, status: result.response.status });
  } catch (error) {
    logStep('cleanup-card-warning', { id: cardId, error: redactError(error) });
  }
}

async function safeDeleteProject(token, projectId) {
  if (!projectId) return;
  try {
    const result = await apiFetch(`/api/workspace/projects/${projectId}`, token, { method: 'DELETE' });
    logStep('cleanup-project', { id: projectId, status: result.response.status });
  } catch (error) {
    logStep('cleanup-project-warning', { id: projectId, error: redactError(error) });
  }
}

async function safeDeleteAuthUser(userId, canDeleteAuthUser) {
  if (!userId) return;
  if (!admin || !canDeleteAuthUser) {
    logStep('cleanup-auth-user-skipped', {
      reason: 'SUPABASE_SERVICE_ROLE_KEY unavailable',
      userId
    });
    return;
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    logStep('cleanup-auth-user-warning', { userId, error: error.message });
    return;
  }
  logStep('cleanup-auth-user', { userId, status: 'deleted' });
}

async function main() {
  const createdCards = [];
  let generatedCardId = null;
  let projectId = null;
  let smokeUser = null;

  try {
    smokeUser = await createSmokeUser();
    logStep('auth', {
      userId: smokeUser.userId,
      serviceRoleCleanup: smokeUser.canDeleteAuthUser
    });

    const projectPayload = await expectOk(
      'create-project',
      '/api/workspace/projects',
      smokeUser.token,
      {
        method: 'POST',
        body: JSON.stringify({
          name: `Cloudflare AI Smoke ${new Date().toISOString()}`,
          description: 'Temporary project for Cloudflare AI route smoke test.',
          icon: 'CF',
          color: '#2563eb'
        })
      },
      (json) => assert(json?.success && json?.project?.id, 'create-project response missing project id')
    );
    projectId = projectPayload.project.id;

    for (const [index, text] of [
      'The product turns scattered research notes into structured creative drafts.',
      'A creator needs reliable routing, fast first paint, and clean task recovery.'
    ].entries()) {
      const cardPayload = await expectOk(
        `create-card-${index + 1}`,
        '/api/workspace/cards',
        smokeUser.token,
        {
          method: 'POST',
          body: JSON.stringify({
            projectId,
            type: 'note',
            content: { text },
            metaData: { source: 'cloudflare-ai-smoke' },
            position: index + 1
          })
        },
        (json) => assert(json?.success && json?.card?.id, `create-card-${index + 1} response missing card id`)
      );
      createdCards.push(cardPayload.card.id);
    }

    await expectOk(
      'prompt-optimize',
      '/api/image/prompt-optimize',
      smokeUser.token,
      {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'A clean product hero image of a ceramic mug on a white desk.',
          negativePrompt: 'blur, watermark',
          locale: 'en-US',
          promptMode: 'custom'
        })
      },
      (json) =>
        assert(
          json?.success && typeof json.optimizedPrompt === 'string' && json.optimizedPrompt.length > 20,
          'prompt-optimize response missing optimizedPrompt'
        )
    );

    await expectOk(
      'studio-ai',
      '/api/workspace/studio-ai',
      smokeUser.token,
      {
        method: 'POST',
        body: JSON.stringify({
          action: 'humanizer',
          selectionText: 'This product helps creators turn notes into structured drafts.'
        })
      },
      (json) =>
        assert(json?.success && typeof json.text === 'string' && json.text.length > 10, 'studio-ai response missing text')
    );

    await expectOk(
      'studio-readiness',
      '/api/workspace/studio-readiness',
      smokeUser.token,
      {
        method: 'POST',
        body: JSON.stringify({
          title: 'Smoke readiness',
          content: {
            type: 'doc',
            content: [
              { type: 'heading', content: [{ type: 'text', text: 'Smoke' }] },
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'This is a short smoke document with a clear point and enough structure to evaluate.'
                  }
                ]
              }
            ]
          }
        })
      },
      (json) =>
        assert(
          json?.success && typeof json.score === 'number' && Array.isArray(json.checks),
          'studio-readiness response missing score/checks'
        )
    );

    const weavePayload = await expectOk(
      'cards-weave',
      '/api/workspace/cards/weave',
      smokeUser.token,
      {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          cardIds: createdCards,
          saveCard: true
        })
      },
      (json) =>
        assert(
          json?.success &&
            typeof json.wovenText === 'string' &&
            json.wovenText.length > 10 &&
            json?.model?.resolvedModel === expectedDeepSeekModel,
          `cards-weave response missing wovenText or resolved ${expectedDeepSeekModel}: ${JSON.stringify(json?.model)}`
        )
    );
    generatedCardId = weavePayload.card?.id || null;

    logStep('summary', {
      baseUrl,
      routeCount: 4,
      result: 'pass'
    });
  } finally {
    if (smokeUser?.token) {
      await safeDeleteCard(smokeUser.token, generatedCardId);
      for (const cardId of createdCards.reverse()) {
        await safeDeleteCard(smokeUser.token, cardId);
      }
      await safeDeleteProject(smokeUser.token, projectId);
    }
    await safeDeleteAuthUser(smokeUser?.userId, smokeUser?.canDeleteAuthUser);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ step: 'failed', error: redactError(error) }));
  process.exit(1);
});
