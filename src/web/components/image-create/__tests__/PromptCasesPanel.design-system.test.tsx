import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const panelSource = readFileSync(
  join(repoRoot, 'src/web/components/image-create/PromptCasesPanel.tsx'),
  'utf8'
);
const imageCreateCss = readFileSync(
  join(repoRoot, 'src/web/styles/image-create.css'),
  'utf8'
);
const promptCaseAdminRouteCss = readFileSync(
  join(repoRoot, 'src/web/styles/prompt-case-admin.css'),
  'utf8'
);
const promptCaseAdminCss = `${imageCreateCss}\n${promptCaseAdminRouteCss}`;

describe('PromptCasesPanel design-system contracts', () => {
  it('keeps page-only admin styles out of the shared creation bundle', () => {
    const pageSource = readFileSync(
      join(repoRoot, 'src/web/pages/PromptCaseAdminPage.tsx'),
      'utf8'
    );
    const harnessSource = readFileSync(
      join(repoRoot, 'src/web/pages/PromptCasesAdminHarnessPage.tsx'),
      'utf8'
    );

    expect(pageSource).toContain("import '../styles/prompt-case-admin.css';");
    expect(harnessSource).toContain(
      "import '../styles/prompt-case-admin.css';"
    );
    expect(promptCaseAdminRouteCss).toContain('.prompt-case-admin-page');
    expect(imageCreateCss).not.toContain('.prompt-case-admin-page');
  });

  it('uses shadcn primitives for the prompt-case admin navigation and states', () => {
    expect(panelSource).toContain(
      "import { Button as ShadcnButton } from '@/shared/ui/radix/button'"
    );
    expect(panelSource).toContain("} from '@/shared/ui/radix/tabs'");
    expect(panelSource).toContain("} from '@/shared/ui/radix/select'");
    expect(panelSource).toContain("} from '@/shared/ui/radix/empty'");
    expect(panelSource).toContain(
      "import { Skeleton } from '@/shared/ui/radix/skeleton'"
    );
    expect(panelSource).toContain(
      '<TabsList className="creator-prompt-case-admin-tabs">'
    );
    expect(panelSource).toContain(
      'className="creator-prompt-case-admin-filter-tabs"'
    );
    expect(panelSource).toContain(
      'className="creator-prompt-case-sort-select"'
    );
    expect(panelSource).toContain('<PromptCaseAdminListSkeleton />');
    expect(panelSource).toContain('<Empty className="creator-library-empty">');
    expect(panelSource).not.toContain(
      '<div className="creator-prompt-case-admin-tabs" role="tablist">'
    );
    expect(panelSource).not.toContain(
      '<select\n            className="creator-prompt-case-sort-select"'
    );
  });

  it('uses shadcn buttons for prompt-case admin row and card actions', () => {
    expect(panelSource).toContain(
      '<ShadcnButton\n                        type="button"\n                        size="icon"\n                        variant="outline"\n                        className={caseItem.featured ?'
    );
    expect(panelSource).toContain(
      '<ShadcnButton\n                          type="button"\n                          size="icon"\n                          variant="outline"\n                          title={publishDraftTitle}'
    );
    expect(panelSource).toContain(
      '<ShadcnButton\n                          type="button"\n                          size="icon"\n                          variant="outline"\n                          className={'
    );
    expect(panelSource).toContain(
      '<ShadcnButton\n          type="button"\n          size="sm"\n          variant="outline"\n          className="creator-prompt-case-load-more"'
    );
  });

  it('keeps the prompt-case admin editor on the shared dialog shell', () => {
    expect(panelSource).toContain("} from '@/shared/ui'");
    expect(panelSource).toMatch(/\bDialog\b/);
    expect(panelSource).toMatch(/\buseOverlayBehavior\b/);
    expect(panelSource).toContain('<Dialog');
    expect(panelSource).toContain(
      'className="creator-prompt-case-admin-modal"'
    );
    expect(panelSource).not.toContain(
      'creator-prompt-case-admin-modal-backdrop'
    );
    expect(panelSource).not.toContain(
      'className="creator-preview creator-prompt-case-admin-modal"'
    );
  });

  it('lets the shared dialog own modal chrome while the feature owns form scrolling', () => {
    expect(promptCaseAdminCss).toMatch(
      /\.creator-prompt-case-admin-modal\s+\.ui-dialog__body\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?padding:\s*0;/s
    );
    expect(promptCaseAdminCss).toMatch(
      /\.creator-prompt-case-admin-modal\s+\.ui-dialog__footer\s*\{[\s\S]*?display:\s*block;[\s\S]*?padding:\s*0;[\s\S]*?border-top:\s*0;/s
    );
    expect(promptCaseAdminCss).toMatch(
      /\.creator-prompt-case-admin-modal-body\s*\{[\s\S]*?overflow-y:\s*auto;/s
    );
  });

  it('keeps the portal-mounted admin modal readable in dark mode', () => {
    expect(promptCaseAdminCss).toMatch(
      /\.dark\s+\.creator-prompt-case-admin-modal,[\s\S]*?\.dark\s+\.image-create-page\s+\.creator-prompt-case-admin-modal\s*\{[\s\S]*?--product-overlay-bg:\s*var\(--create-night-surface\);[\s\S]*?background:\s*var\(--create-night-surface\);[\s\S]*?color:\s*var\(--create-night-text\);/s
    );
    expect(promptCaseAdminCss).toMatch(
      /\.dark\s+\.creator-prompt-case-admin-modal\s+:is\(input,\s*select,\s*textarea\),[\s\S]*?background:\s*rgba\(11,\s*9,\s*8,\s*0\.82\);[\s\S]*?color:\s*var\(--create-night-text\);/s
    );
    expect(promptCaseAdminCss).toMatch(
      /\.dark\s+\.creator-prompt-case-admin-modal\s+:is\([\s\S]*?\.creator-prompt-case-form\s+label,[\s\S]*?\.ui-dialog__title[\s\S]*?\),[\s\S]*?color:\s*var\(--create-night-text\);/s
    );
  });

  it('separates editor and confirmation modal layouts without horizontal overflow', () => {
    expect(panelSource).toContain(
      'className="creator-prompt-case-admin-modal creator-prompt-case-draft-import-modal"'
    );
    expect(panelSource).toContain(
      'className="creator-prompt-case-admin-modal creator-prompt-case-status-modal"'
    );
    expect(promptCaseAdminCss).toMatch(
      /\.creator-prompt-case-draft-import-modal\s*\{[\s\S]*?width:\s*min\(1120px,\s*calc\(100vw\s*-\s*40px\)\);/s
    );
    expect(promptCaseAdminCss).toMatch(
      /\.creator-prompt-case-admin-modal-body\s*\{[\s\S]*?overflow-x:\s*hidden;[\s\S]*?overflow-y:\s*auto;/s
    );
    expect(promptCaseAdminCss).toMatch(
      /\.creator-prompt-case-status-modal\s+\.creator-prompt-case-form-compact\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);/s
    );
    expect(promptCaseAdminCss).toMatch(
      /\.creator-prompt-case-status-modal\s+\.creator-prompt-case-admin-row-metrics\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1;[\s\S]*?grid-row:\s*auto;/s
    );
    expect(promptCaseAdminCss).toMatch(
      /\.creator-prompt-case-draft-import-modal[\s\S]*?\.creator-prompt-case-admin-modal-actions[\s\S]*?button:last-child\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1;/s
    );
  });

  it('uses explicit themed contrast for the draft empty state and primary import action', () => {
    expect(promptCaseAdminCss).toMatch(
      /\.dark\s+\.prompt-case-admin-workspace\s+\.creator-library-empty\s*\{[\s\S]*?background:\s*linear-gradient\([\s\S]*?color:\s*var\(--create-night-text\);/s
    );
    expect(promptCaseAdminCss).toMatch(
      /\.dark[\s\S]*?\.prompt-case-admin-workspace[\s\S]*?button\.creator-library-upload:hover:not\(:disabled\)\s*\{[\s\S]*?background:\s*#ffffff;[\s\S]*?color:\s*#17110d;/s
    );
    expect(promptCaseAdminCss).not.toMatch(
      /\.creator-prompt-case-admin-modal\.creator-prompt-case-draft-import-modal,[\s\S]{0,1200}--product-overlay-bg:\s*var\(--create-night-surface\)/s
    );
  });

  it('keeps the media preview domain-owned while sharing overlay behavior', () => {
    expect(panelSource).toContain("} from '@/shared/ui'");
    expect(panelSource).toMatch(/\buseOverlayBehavior\b/);
    expect(panelSource).toContain(
      'const promptCasePreviewRef = useOverlayBehavior<HTMLElement>({'
    );
    expect(panelSource).toContain('open: Boolean(selectedCase)');
    expect(panelSource).toContain('closeDisabled: lightboxOpen');
    expect(panelSource).toContain('ref={promptCasePreviewRef}');
    expect(panelSource).toContain('className="creator-preview-image-zoom');
    expect(panelSource).toContain('className="creator-preview-nav prev"');
    expect(panelSource).toContain('className="creator-preview-share-button"');
    expect(panelSource).toContain('className="creator-preview-close-button"');
    expect(panelSource).not.toMatch(
      /event\.key === 'Escape'[\s\S]{0,120}closePreview\(\)/
    );
  });
});
