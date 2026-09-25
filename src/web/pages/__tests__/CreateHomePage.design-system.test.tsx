import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(
  join(process.cwd(), 'src/web/pages/CreateHomePage.tsx'),
  'utf8'
);
const createStyles = readFileSync(
  join(process.cwd(), 'src/web/styles/image-create.css'),
  'utf8'
);

describe('CreateHomePage shared composer contracts', () => {
  it('keeps the campaign dialog material theme-aware', () => {
    expect(createStyles).toMatch(
      /\.create-home-promo-dialog\s*\{[\s\S]*?--promo-dialog-surface:\s*var\(--surface-glass-bg-strong,\s*#fffefb\);[\s\S]*?background:\s*var\(--promo-dialog-surface\);/
    );
    expect(createStyles).toMatch(
      /\.dark\s+\.create-home-promo-dialog\s*\{[\s\S]*?--promo-dialog-surface:\s*rgba\(25,\s*20,\s*18,\s*0\.96\);/
    );
    expect(createStyles).toContain(
      '@media (prefers-reduced-transparency: reduce)'
    );
    expect(createStyles).not.toMatch(
      /\.create-home-promo-dialog\s*\{[^}]*background:\s*#191412;/
    );
    expect(createStyles).toMatch(
      /@media \(hover:\s*none\),\s*\(pointer:\s*coarse\)[\s\S]*?\.create-home-promo-modal-actions\s+:is\(a,\s*button\)\s*\{[\s\S]*?min-height:\s*44px;/
    );
  });

  it('uses shared primitives for the core create composer and preview actions', () => {
    expect(pageSource).toMatch(
      /import\s*\{[\s\S]*\bButton\b[\s\S]*\bButtonLink\b[\s\S]*\bSelectRoot\b[\s\S]*\bSelectContent\b[\s\S]*\bSelectItem\b[\s\S]*\bTextarea\b[\s\S]*\}\s*from\s*['"]@\/shared\/ui['"]/
    );

    expect(pageSource).toContain('<Textarea');
    expect(pageSource).toContain('<SelectRoot');
    expect(pageSource).toContain('<SelectTrigger');
    expect(pageSource).toContain('<SelectItem');
    expect(pageSource).toContain(
      'className="create-home-preset-select-trigger'
    );
    expect(pageSource).toContain(
      'className="create-home-primary-cta"'
    );
    expect(pageSource).toContain('<ButtonLink');
    expect(pageSource).toContain('data-icon="inline-start"');
  });

  it('does not keep native composer selects or textarea', () => {
    const composerSource = pageSource.slice(
      pageSource.indexOf('<section className="create-home-hero"'),
      pageSource.indexOf('<section', pageSource.indexOf('create-home-banner'))
    );
    expect(composerSource).not.toContain('<select');
    expect(composerSource).not.toContain('<option');
    expect(composerSource).not.toContain('<optgroup');
    expect(composerSource).not.toContain('<textarea');
    expect(pageSource).not.toContain('@/components/ui/');
  });

  it('keeps full prompt text out of the create URL', () => {
    const buildParamsSource = pageSource.slice(
      pageSource.indexOf('const buildCreateParams'),
      pageSource.indexOf('const openReferenceUploadEntry')
    );
    expect(buildParamsSource).not.toContain("params.set('prompt'");
    expect(buildParamsSource).toContain('promptCasePrompt: trimmed');
  });

  it('keeps the primary create CTA readable in dark mode', () => {
    expect(pageSource).toMatch(
      /<Button[\s\S]*className="create-home-primary-cta"[\s\S]*onClick=\{startCreate\}/
    );
    expect(createStyles).toMatch(
      /\.dark[\s\S]*\.create-home-primary-cta:not\(:disabled\)[\s\S]*color:\s*#fffaf2\s*!important;/
    );
    expect(createStyles).toMatch(
      /\.dark[\s\S]*\.create-home-promptbox-foot[\s\S]*\.beam-cta-card[\s\S]*>\s*:is\(button,\s*a\)[\s\S]*color:\s*#fffaf2\s*!important;/
    );
    expect(createStyles).toMatch(
      /\.create-home-primary-cta:not\(:disabled\)[\s\S]*:is\(\.ui-button__label,\s*\.ui-button__icon,\s*span,\s*svg\)[\s\S]*color:\s*inherit\s*!important;/
    );
    expect(createStyles).toMatch(
      /\.create-home-promptbox-foot[\s\S]*\.beam-cta-card[\s\S]*>\s*:is\(button,\s*a\)[\s\S]*:is\(\.ui-button__label,\s*\.ui-button__icon,\s*span,\s*svg\)[\s\S]*color:\s*inherit\s*!important;/
    );
  });
});
