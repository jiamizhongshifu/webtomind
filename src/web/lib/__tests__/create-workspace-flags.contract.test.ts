import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  path.join(process.cwd(), 'src/web/lib/create-workspace-flags.ts'),
  'utf8'
);
const buildConfig = readFileSync(
  path.join(process.cwd(), 'vite.config.web.ts'),
  'utf8'
);

describe('create workspace feature flag build contract', () => {
  it('uses statically replaceable Vite environment access', () => {
    expect(source).toContain('import.meta.env.VITE_CREATE_WORKSPACE_FLAGS');
    expect(source).toContain('import.meta.env.DEV');
    expect(source).not.toContain('import.meta.env?.');
  });

  it('injects the workspace flag allowlist into production bundles', () => {
    expect(buildConfig).toContain(
      "getEnv('VITE_CREATE_WORKSPACE_FLAGS').trim()"
    );
    expect(buildConfig).toContain(
      "'import.meta.env.VITE_CREATE_WORKSPACE_FLAGS'"
    );
  });
});
