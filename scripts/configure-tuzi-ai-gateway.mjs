#!/usr/bin/env node

import process from 'node:process';
import { spawnSync } from 'node:child_process';
import {
  applyCloudflareCredential,
  getCloudflareCredential
} from './lib/cloudflare-credentials.mjs';

const gatewayId = 'webtomind-images';
const providerDefinitions = [
  {
    name: 'Tuzi Image',
    slug: 'tuzi-image',
    baseUrl: 'https://apius.tu-zi.com',
    description: 'Tuzi image generation upstream for WebToMind'
  }
];
const credential = applyCloudflareCredential('ai-gateway');
const runCredential = getCloudflareCredential('ai-gateway-run');
const apiRoot = `https://api.cloudflare.com/client/v4/accounts/${credential.accountId}`;
const headers = {
  Authorization: `Bearer ${credential.token}`,
  'Content-Type': 'application/json'
};

async function cloudflareApi(pathname, init = {}) {
  const response = await fetch(`${apiRoot}/${pathname}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
    signal: AbortSignal.timeout(20_000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    const detail =
      body.errors?.map((error) => error.message).filter(Boolean).join('; ') ||
      `HTTP ${response.status}`;
    const error = new Error(`Cloudflare API request failed: ${detail}`);
    error.status = response.status;
    throw error;
  }
  return body.result;
}

function desiredGateway(authentication) {
  return {
    collect_logs: false,
    cache_ttl: 0,
    cache_invalidate_on_update: true,
    rate_limiting_interval: 60,
    rate_limiting_limit: 300,
    rate_limiting_technique: 'sliding',
    authentication
  };
}

function gatewayMatches(gateway, desired) {
  return Object.entries(desired).every(([key, value]) => gateway[key] === value);
}

async function ensureGateway(authenticationRequested) {
  try {
    const gateway = await cloudflareApi(`ai-gateway/gateways/${gatewayId}`);
    const desired = desiredGateway(
      authenticationRequested ?? Boolean(gateway.authentication)
    );
    if (gatewayMatches(gateway, desired)) {
      return { action: 'reused', gateway };
    }
    const updated = await cloudflareApi(`ai-gateway/gateways/${gatewayId}`, {
      method: 'PUT',
      body: JSON.stringify(desired)
    });
    return { action: 'updated', gateway: updated };
  } catch (error) {
    if (error?.status !== 404) throw error;
  }
  const gateway = await cloudflareApi('ai-gateway/gateways', {
    method: 'POST',
    body: JSON.stringify({
      id: gatewayId,
      ...desiredGateway(Boolean(authenticationRequested))
    })
  });
  return { action: 'created', gateway };
}

function syncGatewayRunSecret() {
  if (!runCredential.configured) {
    return { action: 'deferred', configured: false };
  }
  const result = spawnSync(
    process.execPath,
    [
      'scripts/cloudflare-credentials.mjs',
      'exec',
      'workers',
      '--',
      'npx',
      'wrangler',
      'secret',
      'put',
      'CLOUDFLARE_AI_GATEWAY_RUN_TOKEN',
      '--config',
      'workers/webtomind.wrangler.toml'
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      input: `${runCredential.token}\n`,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Failed to sync AI Gateway Run token to Worker: ${String(result.stderr || result.stdout || '').trim()}`
    );
  }
  return { action: 'synced', configured: true };
}

async function ensureProvider(definition) {
  const providers = await cloudflareApi('ai-gateway/custom-providers');
  const existing = providers.find(
    (provider) => provider.slug === definition.slug
  );
  const desired = {
    name: definition.name,
    slug: definition.slug,
    base_url: definition.baseUrl,
    description: definition.description,
    enable: true
  };
  if (!existing) {
    const provider = await cloudflareApi('ai-gateway/custom-providers', {
      method: 'POST',
      body: JSON.stringify(desired)
    });
    return { action: 'created', provider };
  }
  if (
    existing.base_url === definition.baseUrl &&
    existing.enable === true
  ) {
    return { action: 'reused', provider: existing };
  }
  const provider = await cloudflareApi(
    `ai-gateway/custom-providers/${existing.id}`,
    {
      method: 'PATCH',
    body: JSON.stringify({ base_url: definition.baseUrl, enable: true })
    }
  );
  return { action: 'updated', provider };
}

const runSecretResult = syncGatewayRunSecret();
const gatewayResult = await ensureGateway(
  runSecretResult.configured ? true : undefined
);
const providerResults = await Promise.all(
  providerDefinitions.map((definition) => ensureProvider(definition))
);

console.log(
  JSON.stringify(
    {
      ok: true,
      gateway: {
        id: gatewayResult.gateway.id,
        action: gatewayResult.action,
        collectLogs: gatewayResult.gateway.collect_logs,
        authentication: gatewayResult.gateway.authentication,
        rateLimit: {
          intervalSeconds: gatewayResult.gateway.rate_limiting_interval,
          requests: gatewayResult.gateway.rate_limiting_limit,
          technique: gatewayResult.gateway.rate_limiting_technique
        }
      },
      runtimeAuthentication: runSecretResult,
      providers: providerResults.map((result) => ({
        id: result.provider.id,
        slug: result.provider.slug,
        baseUrl: result.provider.base_url,
        enabled: result.provider.enable,
        action: result.action,
        gatewayBaseUrl: `https://gateway.ai.cloudflare.com/v1/${credential.accountId}/${gatewayId}/custom-${result.provider.slug}`
      }))
    },
    null,
    2
  )
);
