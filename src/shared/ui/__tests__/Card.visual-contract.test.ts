import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Card visual contract', () => {
  it('gives interactive cards visible pointer, keyboard, and reduced-motion states', () => {
    const styles = readFileSync(
      join(process.cwd(), 'src/design/ui-primitives.css'),
      'utf8'
    );

    expect(styles).toMatch(
      /\.ui-card--interactive\s*\{[\s\S]*?touch-action:\s*manipulation;[\s\S]*?transition:/
    );
    expect(styles).toMatch(
      /\.ui-card--interactive:hover\s*\{[\s\S]*?transform:\s*translateY\(-1px\);/
    );
    expect(styles).toMatch(
      /\.ui-card--interactive:active\s*\{[\s\S]*?transform:\s*scale\(0\.99\);/
    );
    expect(styles).toMatch(
      /\.ui-card--interactive:focus-visible\s*\{[\s\S]*?outline:\s*3px solid var\(--product-focus-ring-color\);/
    );
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.ui-card--interactive:active,[\s\S]*?transform:\s*none;/
    );
  });
});
