import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const panelSource = readFileSync(
  join(repoRoot, 'src/web/components/image-create/PromptCompilerPanel.tsx'),
  'utf8'
);
const imageCreateStyles = readFileSync(
  join(repoRoot, 'src/web/styles/image-create.css'),
  'utf8'
);
const imageCreateMobileStyles = readFileSync(
  join(repoRoot, 'src/web/styles/image-create-mobile.css'),
  'utf8'
);

describe('PromptCompilerPanel design-system contracts', () => {
  it('uses the shared Button for the primary generate CTA', () => {
    expect(panelSource).toMatch(
      /import \{[\s\S]*\bButton\b[\s\S]*\bSelectRoot\b[\s\S]*\bTextarea\b[\s\S]*\} from '@\/shared\/ui';/
    );
    expect(panelSource).toMatch(
      /<Button[\s\S]*className=\{`creator-generate-btn creator-prompt-generate/
    );
    expect(panelSource).toMatch(
      /<Button[\s\S]*aria-label=\{[\s\S]*controls\.generate[\s\S]*<\/Button>/
    );
  });

  it('keeps the dark mode generate CTA on inverse text instead of the light active button style', () => {
    expect(imageCreateStyles).toMatch(
      /\.dark\s+\.image-create-page\s+\.creator-prompt-generate:not\(:disabled\)\s*\{[\s\S]*?color:\s*#fffaf2\s*!important;[\s\S]*?\}/
    );
    expect(imageCreateStyles).toMatch(
      /\.creator-prompt-generate:not\(:disabled\)[\s\S]*?:is\(\s*\.creator-generate-copy,\s*\.creator-generate-label,\s*\.creator-generate-cost,\s*svg\s*\)\s*\{[\s\S]*?color:\s*inherit\s*!important;[\s\S]*?\}/
    );
    expect(imageCreateStyles).not.toMatch(
      /\.dark\s+\.image-create-page\s+:is\([\s\S]*?\.creator-prompt-generate,[\s\S]*?\)\s*\{[\s\S]*?background:\s*#fff7eb;[\s\S]*?color:\s*#17110d;[\s\S]*?\}/
    );
  });

  it('uses shared Button for prompt footer actions', () => {
    expect(panelSource).toMatch(
      /<Button[\s\S]*className="creator-prompt-save-button"[\s\S]*<\/Button>/
    );
    expect(panelSource).toMatch(
      /<Button[\s\S]*className="creator-prompt-library-button"[\s\S]*<\/Button>/
    );
    expect(panelSource).toMatch(
      /<Button[\s\S]*className="creator-reverse-import-button creator-prompt-reverse-button"[\s\S]*<\/Button>/
    );
    expect(panelSource).toMatch(
      /<Button[\s\S]*className="creator-low-balance-button"[\s\S]*<\/Button>/
    );
    for (const styles of [imageCreateStyles, imageCreateMobileStyles]) {
      expect(styles).not.toMatch(
        /\.creator-prompt-actions[^{]*button\s*>\s*span/
      );
      expect(styles).not.toMatch(
        /\.creator-prompt-(?:save|library)-button\s*>\s*span/
      );
    }
  });

  it('uses shared Button for prompt utility actions', () => {
    expect(panelSource).toMatch(
      /<Button[\s\S]*className="creator-prompt-mini-button"[\s\S]*<\/Button>/
    );
    expect(panelSource).toMatch(
      /<Button[\s\S]*onClick=\{handleOpenCharacterWorkflow\}[\s\S]*<\/Button>/
    );
    expect(panelSource).toMatch(
      /<Button[\s\S]*onClick=\{handleOpenHistoryReferencePicker\}[\s\S]*<\/Button>/
    );
    expect(panelSource).toMatch(
      /<DialogContent[\s\S]*className="creator-reference-dialog"[\s\S]*onInteractOutside=\{\(event\)[\s\S]*creator-nested-reference-modal[\s\S]*creator-history-modal[\s\S]*event\.preventDefault\(\)/
    );
    expect(panelSource).toMatch(
      /<Button[\s\S]*onClick=\{onOpenReferenceUpload\}[\s\S]*<\/Button>/
    );
    expect(panelSource).toMatch(
      /<Button[\s\S]*className="creator-prompt-reset-inline"[\s\S]*<\/Button>/
    );
    expect(panelSource).toMatch(
      /<Button[\s\S]*className="creator-prompt-copy"[\s\S]*<\/Button>/
    );
    expect(panelSource).toMatch(
      /<Button[\s\S]*className="creator-prompt-expand"[\s\S]*<\/Button>/
    );
    expect(panelSource).toMatch(
      /<Button[\s\S]*className="creator-prompt-minimize"[\s\S]*<\/Button>/
    );
    expect(panelSource).toMatch(
      /<Button[\s\S]*className="creator-prompt-random-button"[\s\S]*<\/Button>/
    );
  });

  it('uses shared form controls for the prompt editor and core settings', () => {
    expect(panelSource).toContain("} from '@/shared/ui';");
    for (const primitive of [
      'SelectRoot',
      'SelectContent',
      'SelectGroup',
      'SelectItem',
      'SelectTrigger',
      'SelectValue',
      'Textarea'
    ]) {
      expect(panelSource).toContain(primitive);
    }
    expect(panelSource).toContain('<Textarea');
    expect(panelSource).toContain('<SelectRoot');
    expect(panelSource).toContain('<SelectTrigger');
    expect(panelSource).toContain('<SelectGroup');
    expect(panelSource).toContain('<SelectItem');
    expect(panelSource).not.toContain('<textarea');
    expect(panelSource).not.toContain('<select');
    expect(panelSource).not.toContain('@/components/ui/');
    expect(imageCreateStyles).toContain(
      '.creator-prompt-setting .creator-select-trigger'
    );
    expect(
      panelSource.match(
        /<SelectContent className="creator-prompt-select-content">/g
      )
    ).toHaveLength(4);
    expect(imageCreateStyles).toMatch(
      /body:has\(\.image-create-page\):has\([\s\S]*?\.creator-prompt-select-content\[data-state='open'\][\s\S]*?overflow:\s*clip visible !important;/
    );
    expect(imageCreateStyles).not.toContain(
      '.creator-prompt-setting .creator-select select'
    );
  });
});
