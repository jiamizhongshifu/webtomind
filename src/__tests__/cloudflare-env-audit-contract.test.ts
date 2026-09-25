import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const auditSource = readFileSync(
  path.join(process.cwd(), 'scripts/audit-cloudflare-env-coverage.mjs'),
  'utf8'
);

describe('Cloudflare environment coverage audit contract', () => {
  it.each([
    'CHAOJITUDOU_REAL_TASK_SMOKE_ENABLED',
    'CHAOJITUDOU_IMAGE_TASK_REQUEST_TIMEOUT_MS',
    'CHAOJITUDOU_IMAGE_TASK_RESUME_EXTRA_SECS',
    'CHAOJITUDOU_IMAGE_TASK_RESUME_LIMIT',
    'IMAGE_TASK_AUTO_RETRY_MISSING_IMAGES',
    'IMAGE_REFERENCE_BUCKET',
    'GENERATED_IMAGE_BUCKET',
    'TUZI_DISABLE_IMAGE_GROUP',
    'TUZI_IMAGE_GROUP',
    'TUZI_GROUP'
  ])('keeps defaulted runtime variable %s out of the required list', (name) => {
    const optionalBlock = auditSource.match(
      /const optionalDefaultedVars = new Set\(\[([\s\S]*?)\]\);/
    )?.[1];

    expect(optionalBlock).toBeDefined();
    expect(optionalBlock).toContain(`'${name}'`);
  });
});
