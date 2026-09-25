import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const CLOUDFLARE_CREDENTIAL_ROLES = Object.freeze({
  workers: 'WEBTOMIND_CLOUDFLARE_WORKERS_API_TOKEN',
  ops: 'WEBTOMIND_CLOUDFLARE_OPS_API_TOKEN',
  'ai-gateway': 'WEBTOMIND_CLOUDFLARE_AI_GATEWAY_API_TOKEN',
  'ai-gateway-run': 'WEBTOMIND_CLOUDFLARE_AI_GATEWAY_RUN_TOKEN',
  'browser-run': 'WEBTOMIND_CLOUDFLARE_BROWSER_RUN_API_TOKEN'
});

export function getCloudflareCredentialsPath(env = process.env) {
  return (
    env.WEBTOMIND_CLOUDFLARE_CREDENTIALS_FILE ||
    path.join(os.homedir(), '.config/webtomind/cloudflare-credentials.env')
  );
}

export function parseEnvText(text) {
  const values = {};
  for (const line of String(text).split(/\r?\n/u)) {
    const match = line.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/u
    );
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

export function readCloudflareCredentials(options = {}) {
  const env = options.env || process.env;
  const filePath = options.filePath || getCloudflareCredentialsPath(env);
  const fileValues = existsSync(filePath)
    ? parseEnvText(readFileSync(filePath, 'utf8'))
    : {};
  return {
    filePath,
    exists: existsSync(filePath),
    values: { ...fileValues, ...(options.includeProcessEnv ? env : {}) }
  };
}

export function getCloudflareCredential(role, options = {}) {
  const tokenEnvName = CLOUDFLARE_CREDENTIAL_ROLES[role];
  if (!tokenEnvName) {
    throw new Error(
      `Unknown Cloudflare credential role: ${role}. Expected one of: ${Object.keys(CLOUDFLARE_CREDENTIAL_ROLES).join(', ')}.`
    );
  }
  const credentials = readCloudflareCredentials(options);
  let token = String(credentials.values[tokenEnvName] || '').trim();
  let accountId = String(
    credentials.values.WEBTOMIND_CLOUDFLARE_ACCOUNT_ID ||
      credentials.values.CLOUDFLARE_ACCOUNT_ID ||
      credentials.values.CF_ACCOUNT_ID ||
      ''
  ).trim();
  // CI (GitHub Actions) has no local credential file. Fall back to process
  // environment so tokens can be supplied through repository secrets. The
  // local file still wins when present.
  if (!token || !accountId) {
    const envValues = readCloudflareCredentials({
      ...options,
      includeProcessEnv: true
    }).values;
    if (!token) token = String(envValues[tokenEnvName] || '').trim();
    if (!accountId) {
      accountId = String(
        envValues.WEBTOMIND_CLOUDFLARE_ACCOUNT_ID ||
          envValues.CLOUDFLARE_ACCOUNT_ID ||
          envValues.CF_ACCOUNT_ID ||
          ''
      ).trim();
    }
  }
  return {
    ...credentials,
    role,
    tokenEnvName,
    token,
    accountId,
    configured: Boolean(token)
  };
}

export function applyCloudflareCredential(role, options = {}) {
  const targetEnv = options.env || process.env;
  const credential = getCloudflareCredential(role, options);
  if (!credential.configured && options.required !== false) {
    throw new Error(
      `Cloudflare credential role "${role}" is not configured in ${credential.filePath}.`
    );
  }
  if (credential.token) targetEnv.CLOUDFLARE_API_TOKEN = credential.token;
  if (credential.accountId) {
    targetEnv.CLOUDFLARE_ACCOUNT_ID = credential.accountId;
    targetEnv.CF_ACCOUNT_ID = credential.accountId;
  }
  return credential;
}

export function applyCloudflareGatewayRunCredential(options = {}) {
  const targetEnv = options.env || process.env;
  const credential = getCloudflareCredential('ai-gateway-run', options);
  if (
    credential.token &&
    !String(targetEnv.CLOUDFLARE_AI_GATEWAY_RUN_TOKEN || '').trim()
  ) {
    targetEnv.CLOUDFLARE_AI_GATEWAY_RUN_TOKEN = credential.token;
  }
  return credential;
}

export function cloudflareCredentialEnv(role, baseEnv = process.env) {
  const env = { ...baseEnv };
  applyCloudflareCredential(role, { env });
  return env;
}
