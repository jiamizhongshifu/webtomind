import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'vite.config.web.ts'), 'utf8');

describe('web bundle split contract', () => {
  it('does not force every optional dependency into one initial vendor chunk', () => {
    expect(source).not.toContain("return 'vendor-misc'");
    expect(source).toContain("return 'vendor-react'");
    expect(source).toContain("return 'vendor-katex'");
    expect(source).toMatch(
      /if \(packageName === 'yaml'\)[\s\S]*return undefined;/
    );
  });
});
