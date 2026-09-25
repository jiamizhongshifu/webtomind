import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(
  join(process.cwd(), 'src/design/ui-primitives.css'),
  'utf8'
);

describe('Form controls visual contract', () => {
  it('shows distinct hover, disabled, and read-only states', () => {
    expect(styles).toMatch(
      /\.ui-input:hover:not\(:disabled\):not\(:focus\):not\(\.ui-input--invalid\),[\s\S]*?border-color:\s*var\([\s\S]*?--product-border-strong,[\s\S]*?color-mix\(in srgb, var\(--product-text\) 26%, transparent\)/
    );
    expect(styles).toMatch(
      /\.ui-input:disabled,[\s\S]*?cursor:\s*not-allowed;[\s\S]*?opacity:\s*0\.64;/
    );
    expect(styles).toMatch(
      /\.ui-input\[readonly\],[\s\S]*?cursor:\s*default;[\s\S]*?var\(--product-surface\) 97%,[\s\S]*?var\(--product-text\)/
    );
  });

  it('keeps compact controls touch-safe on coarse pointers', () => {
    expect(styles).toMatch(
      /@media \(pointer: coarse\)[\s\S]*?\.ui-toolcraft-segmented-field--compact \.ui-toolcraft-segmented__item,[\s\S]*?\.ui-input--sm,[\s\S]*?\.ui-select--sm[\s\S]*?min-height:\s*44px;/
    );
  });

  it('removes transform feedback when reduced motion is requested', () => {
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.ui-toolcraft-segmented__item:not\(:disabled\):active[\s\S]*?transform:\s*none;/
    );
  });
});
