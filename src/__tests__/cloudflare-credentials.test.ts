import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const {
  applyCloudflareCredential,
  applyCloudflareGatewayRunCredential,
  cloudflareCredentialEnv,
  getCloudflareCredential,
  parseEnvText
} = await import(
  // @ts-expect-error The credential helper is an executable JavaScript module.
  '../../scripts/lib/cloudflare-credentials.mjs'
);

const temporaryDirectories: string[] = [];

function credentialFile(contents: string): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'cf-credentials-test-'));
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, 'credentials.env');
  writeFileSync(filePath, contents, { mode: 0o600 });
  return filePath;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Cloudflare credential roles', () => {
  it('parses exported and quoted env values without exposing them', () => {
    expect(
      parseEnvText(`
        export WEBTOMIND_CLOUDFLARE_ACCOUNT_ID='account-id'
        WEBTOMIND_CLOUDFLARE_WORKERS_API_TOKEN="workers-token"
      `)
    ).toEqual({
      WEBTOMIND_CLOUDFLARE_ACCOUNT_ID: 'account-id',
      WEBTOMIND_CLOUDFLARE_WORKERS_API_TOKEN: 'workers-token'
    });
  });

  it('maps each role to CLOUDFLARE_API_TOKEN only in the target env', () => {
    const filePath = credentialFile(`
      WEBTOMIND_CLOUDFLARE_ACCOUNT_ID='account-id'
      WEBTOMIND_CLOUDFLARE_WORKERS_API_TOKEN='workers-token'
      WEBTOMIND_CLOUDFLARE_OPS_API_TOKEN='ops-token'
      WEBTOMIND_CLOUDFLARE_AI_GATEWAY_API_TOKEN='gateway-token'
    `);
    const parentEnv = { CLOUDFLARE_API_TOKEN: 'unrelated-token' };
    const targetEnv = cloudflareCredentialEnv('ai-gateway', {
      ...parentEnv,
      WEBTOMIND_CLOUDFLARE_CREDENTIALS_FILE: filePath
    });

    expect(targetEnv.CLOUDFLARE_API_TOKEN).toBe('gateway-token');
    expect(targetEnv.CLOUDFLARE_ACCOUNT_ID).toBe('account-id');
    expect(parentEnv.CLOUDFLARE_API_TOKEN).toBe('unrelated-token');
  });

  it('keeps AI Gateway management and runtime roles separate', () => {
    const filePath = credentialFile(`
      WEBTOMIND_CLOUDFLARE_ACCOUNT_ID='account-id'
      WEBTOMIND_CLOUDFLARE_AI_GATEWAY_API_TOKEN='gateway-edit-token'
      WEBTOMIND_CLOUDFLARE_AI_GATEWAY_RUN_TOKEN='gateway-run-token'
    `);

    expect(getCloudflareCredential('ai-gateway', { filePath }).token).toBe(
      'gateway-edit-token'
    );
    expect(getCloudflareCredential('ai-gateway-run', { filePath }).token).toBe(
      'gateway-run-token'
    );
  });

  it('injects the AI Gateway runtime token without replacing an explicit local value', () => {
    const filePath = credentialFile(`
      WEBTOMIND_CLOUDFLARE_AI_GATEWAY_RUN_TOKEN='gateway-run-token'
    `);
    const targetEnv: Record<string, string> = {};

    applyCloudflareGatewayRunCredential({ filePath, env: targetEnv });
    expect(targetEnv.CLOUDFLARE_AI_GATEWAY_RUN_TOKEN).toBe('gateway-run-token');

    targetEnv.CLOUDFLARE_AI_GATEWAY_RUN_TOKEN = 'explicit-local-token';
    applyCloudflareGatewayRunCredential({ filePath, env: targetEnv });
    expect(targetEnv.CLOUDFLARE_AI_GATEWAY_RUN_TOKEN).toBe(
      'explicit-local-token'
    );
  });

  it('fails closed when a required role is missing', () => {
    const filePath = credentialFile(`
      WEBTOMIND_CLOUDFLARE_ACCOUNT_ID='account-id'
      WEBTOMIND_CLOUDFLARE_OPS_API_TOKEN=''
    `);
    const env = { WEBTOMIND_CLOUDFLARE_CREDENTIALS_FILE: filePath };

    expect(getCloudflareCredential('ops', { env }).configured).toBe(false);
    expect(() => applyCloudflareCredential('ops', { env })).toThrow(
      'is not configured'
    );
  });
});
