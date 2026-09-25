#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import process from 'node:process';

const maxAttempts = Math.max(
  1,
  Number(process.env.CF_VALIDATE_MAX_ATTEMPTS || 3)
);
const retryDelayMs = Math.max(
  0,
  Number(process.env.CF_VALIDATE_RETRY_DELAY_MS || 10_000)
);

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  console.log(
    `Cloudflare production validation attempt ${attempt}/${maxAttempts}.`
  );
  const result = spawnSync(
    process.execPath,
    ['scripts/validate-cloudflare-production.mjs'],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit'
    }
  );
  if (result.error) throw result.error;
  if (result.status === 0) {
    process.exitCode = 0;
    break;
  }
  if (attempt === maxAttempts) {
    process.exitCode = result.status ?? 1;
    break;
  }
  console.warn(
    `Validation failed while deployment may still be propagating; retrying in ${retryDelayMs}ms.`
  );
  await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
}
