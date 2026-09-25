import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(
  join(process.cwd(), 'src/design/ui-primitives.css'),
  'utf8'
);

describe('Overlay visual contract', () => {
  it('uses a shared material hierarchy for dialogs and action sheets', () => {
    expect(styles).toMatch(
      /--product-overlay-material-bg:[\s\S]*?--surface-glass-bg-strong/
    );
    expect(styles).toMatch(
      /\.ui-dialog\s*\{[\s\S]*?background:\s*var\(--product-overlay-material-bg\);[\s\S]*?backdrop-filter:\s*var\(--product-overlay-material-filter\);/
    );
    expect(styles).toMatch(
      /\.ui-action-sheet\s*\{[\s\S]*?background:\s*var\(--product-overlay-material-bg\);[\s\S]*?backdrop-filter:\s*var\(--product-overlay-material-filter\);/
    );
    expect(styles).toMatch(
      /\.ui-dialog__header,[\s\S]*?var\(--surface-glass-line,[\s\S]*?var\(--product-border-soft\)/
    );
  });

  it('keeps overlay typography optically balanced and readable', () => {
    expect(styles).toMatch(
      /\.ui-dialog__title,[\s\S]*?letter-spacing:\s*var\(--type-h3-tracking, -0\.01em\);[\s\S]*?text-wrap:\s*balance;[\s\S]*?font-optical-sizing:\s*auto;/
    );
    expect(styles).toMatch(
      /\.ui-dialog__description,[\s\S]*?line-height:\s*1\.5;[\s\S]*?text-wrap:\s*pretty;/
    );
  });

  it('provides reduced-transparency fallbacks for overlay materials', () => {
    expect(styles).toMatch(
      /@media \(prefers-reduced-transparency: reduce\)[\s\S]*?\.ui-dialog,[\s\S]*?\.ui-action-sheet[\s\S]*?background:\s*var\(--product-panel-solid,[\s\S]*?backdrop-filter:\s*none;/
    );
    expect(styles).toMatch(
      /@media \(prefers-reduced-transparency: reduce\)[\s\S]*?\.ui-dialog-backdrop,[\s\S]*?\.ui-action-sheet-backdrop[\s\S]*?backdrop-filter:\s*none;/
    );
  });
});
