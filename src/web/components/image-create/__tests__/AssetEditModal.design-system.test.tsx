import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const modalSource = readFileSync(
  join(repoRoot, 'src/web/components/image-create/AssetEditModal.tsx'),
  'utf8'
);
const imageCreateCss = readFileSync(
  join(repoRoot, 'src/web/styles/image-create.css'),
  'utf8'
);

describe('AssetEditModal design-system contracts', () => {
  it('uses the shared dialog shell instead of a private preview backdrop', () => {
    expect(modalSource).toContain("} from '@/shared/ui';");
    expect(modalSource).toContain('DialogRoot,');
    expect(modalSource).toContain('SelectRoot,');
    expect(modalSource).toContain("from '@/shared/ui/radix/field'");
    expect(modalSource).toContain('<Dialog');
    expect(modalSource).toContain('if (!open && !saving) onClose();');
    expect(modalSource).toContain('onEscapeKeyDown');
    expect(modalSource).toContain('onInteractOutside');
    expect(modalSource).toContain('className="creator-edit-modal"');
    expect(modalSource).toContain('<DialogHeader');
    expect(modalSource).toContain('<DialogFooter');
    expect(modalSource).not.toContain('addEventListener');
    expect(modalSource).not.toMatch(/event\.key === 'Escape'/);
    expect(modalSource).not.toContain('creator-preview-backdrop');
    expect(modalSource).not.toContain(
      'className="creator-preview creator-edit-modal"'
    );
    expect(modalSource).not.toContain('@/components/ui/');
  });

  it('uses Field semantics for editable prompt metadata', () => {
    expect(modalSource).toContain('<Field');
    expect(modalSource).toContain('<FieldLabel');
    expect(modalSource).toContain('<FieldError');
    expect(modalSource).toContain('htmlFor="asset-edit-prompt"');
    expect(modalSource).toContain('aria-invalid={Boolean(error)}');
    expect(modalSource).not.toContain('<label className="creator-upload-field">');
    expect(imageCreateCss).toContain('.creator-upload-field-label');
  });

  it('lets shared dialog chrome own behavior while the feature owns edit geometry', () => {
    expect(imageCreateCss).toMatch(
      /\.creator-edit-dialog-body\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?padding:\s*0;/s
    );
    expect(imageCreateCss).toMatch(
      /\.creator-edit-dialog-footer\s*\{[\s\S]*?display:\s*block;[\s\S]*?padding:\s*0;[\s\S]*?border-top:\s*0;/s
    );
    expect(imageCreateCss).toMatch(
      /\.creator-edit-body\s*\{[\s\S]*?height:\s*100%;/s
    );
    expect(imageCreateCss).not.toContain('.creator-edit-modal .ui-dialog__body');
    expect(imageCreateCss).not.toContain(
      '.creator-edit-modal .ui-dialog__footer'
    );
  });
});
