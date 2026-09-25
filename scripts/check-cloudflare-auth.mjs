#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import https from 'node:https';
import process from 'node:process';
import { applyCloudflareCredential } from './lib/cloudflare-credentials.mjs';

const root = process.cwd();
const wranglerConfig = 'workers/webtomind.wrangler.toml';
applyCloudflareCredential('ops');

function runWrangler(args, env = process.env) {
  try {
    const output = execFileSync('npx', ['wrangler', ...args], {
      cwd: root,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return { ok: true, output };
  } catch (error) {
    const stderr =
      error && typeof error === 'object' && 'stderr' in error
        ? String(error.stderr || '')
        : '';
    const message =
      stderr || (error instanceof Error ? error.message : 'Wrangler failed.');
    return { ok: false, output: message };
  }
}

function classifyWranglerError(output) {
  if (/Authentication error|not logged in/i.test(output)) return 'auth';
  if (/hyperdrive/i.test(output)) return 'hyperdrive';
  return 'unknown';
}

function tokenVerify() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    return Promise.resolve({
      present: false,
      ok: false,
      detail: 'CLOUDFLARE_API_TOKEN is not set.'
    });
  }

  return new Promise((resolve) => {
    const req = https.request(
      'https://api.cloudflare.com/client/v4/user/tokens/verify',
      {
        headers: { Authorization: `Bearer ${token}` }
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            resolve({
              present: true,
              ok: Boolean(data.success && data.result?.status === 'active'),
              detail: data.success
                ? `token status: ${data.result?.status || 'unknown'}`
                : `token verify failed: ${JSON.stringify(data.errors || [])}`
            });
          } catch {
            resolve({
              present: true,
              ok: false,
              detail: `token verify returned HTTP ${res.statusCode}`
            });
          }
        });
      }
    );
    req.on('error', (error) => {
      resolve({
        present: true,
        ok: false,
        detail: error instanceof Error ? error.message : String(error)
      });
    });
    req.end();
  });
}

function withoutCloudflareApiToken() {
  const env = { ...process.env };
  delete env.CLOUDFLARE_API_TOKEN;
  return env;
}

function mark(ok) {
  return ok ? 'PASS' : 'FAIL';
}

function summarizeWranglerIdentity(output) {
  const auth = output.includes('OAuth Token')
    ? 'OAuth Token'
    : output.includes('User API Token')
      ? 'User API Token'
      : 'unknown auth';
  const email = output.match(/associated with the email ([^\.\n]+(?:\.[^\.\n]+)*)\./)?.[1];
  const account = output.match(/│\s*([^│]+Account)\s*│\s*([a-f0-9]{32})\s*│/)?.[2];
  return [auth, email ? `email=${email}` : null, account ? `account=${account}` : null]
    .filter(Boolean)
    .join(', ');
}

const token = await tokenVerify();
const currentWhoami = runWrangler(['whoami']);
const currentHyperdrive = runWrangler([
  'hyperdrive',
  'list',
  '--config',
  wranglerConfig
]);
const oauthEnv = withoutCloudflareApiToken();
const oauthWhoami = runWrangler(['whoami'], oauthEnv);
const oauthHyperdrive = runWrangler(
  ['hyperdrive', 'list', '--config', wranglerConfig],
  oauthEnv
);

const checks = [
  {
    name: 'Cloudflare API token is active',
    ok: token.ok,
    detail: token.detail
  },
  {
    name: 'Wrangler current env identity',
    ok: currentWhoami.ok,
    detail: currentWhoami.ok
      ? summarizeWranglerIdentity(currentWhoami.output)
      : classifyWranglerError(currentWhoami.output)
  },
  {
    name: 'Wrangler current env can access Hyperdrive',
    ok: currentHyperdrive.ok,
    detail: currentHyperdrive.ok
      ? 'Hyperdrive list succeeded.'
      : classifyWranglerError(currentHyperdrive.output)
  },
  {
    name: 'Wrangler OAuth identity',
    ok: oauthWhoami.ok,
    detail: oauthWhoami.ok
      ? summarizeWranglerIdentity(oauthWhoami.output)
      : classifyWranglerError(oauthWhoami.output)
  },
  {
    name: 'Wrangler OAuth can access Hyperdrive',
    ok: oauthHyperdrive.ok,
    detail: oauthHyperdrive.ok
      ? 'Hyperdrive list succeeded.'
      : classifyWranglerError(oauthHyperdrive.output)
  }
];

for (const check of checks) {
  console.log(`${mark(check.ok)} ${check.name} - ${check.detail}`);
}

if (token.present && token.ok && !currentHyperdrive.ok && oauthHyperdrive.ok) {
  console.log('');
  console.log(
    'Diagnosis: CLOUDFLARE_API_TOKEN is valid for some Cloudflare APIs, but it lacks Account: Hyperdrive Read/Edit. Hyperdrive scripts will fall back to Wrangler OAuth on this machine.'
  );
}

if (!oauthHyperdrive.ok) {
  console.log('');
  console.log(
    'Next: run `env -u CLOUDFLARE_API_TOKEN npx wrangler login`, or create a Cloudflare API token with Account: Hyperdrive Read/Edit.'
  );
  process.exitCode = 1;
}
