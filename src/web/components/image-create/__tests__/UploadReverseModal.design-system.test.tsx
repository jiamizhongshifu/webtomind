import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const modalSource = readFileSync(
  join(repoRoot, 'src/web/components/image-create/UploadReverseModal.tsx'),
  'utf8'
);
const imageCreateCss = readFileSync(
  join(repoRoot, 'src/web/styles/image-create.css'),
  'utf8'
);

describe('UploadReverseModal design-system contracts', () => {
  it('uses shared dialog and form adapters instead of a private preview backdrop', () => {
    expect(modalSource).toContain("} from '@/shared/ui';");
    expect(modalSource).toContain('DialogRoot,');
    expect(modalSource).toContain('SelectRoot,');
    expect(modalSource).toContain('Textarea');
    expect(modalSource).toContain("from '@/shared/ui/radix/field'");
    expect(modalSource).toContain('<Dialog');
    expect(modalSource).toContain('if (!open && !saving) onCancel();');
    expect(modalSource).toContain('onEscapeKeyDown={(event) => {');
    expect(modalSource).toContain('onInteractOutside={(event) => {');
    expect(modalSource).toContain('className="creator-upload-modal"');
    expect(modalSource).not.toContain('creator-preview-backdrop');
    expect(modalSource).not.toContain(
      'className="creator-preview creator-upload-modal"'
    );
    expect(modalSource).not.toContain('@/components/ui/');
  });

  it('uses Field semantics for imported row metadata', () => {
    expect(modalSource).toContain('<Field');
    expect(modalSource).toContain('<FieldLabel');
    expect(modalSource).toContain('<FieldError');
    expect(modalSource).toContain('htmlFor={`${row.key}-prompt`}');
    expect(modalSource).toContain('id={`${row.key}-tags`}');
    expect(modalSource).not.toContain('<label className="creator-upload-field">');
    expect(imageCreateCss).toContain('.creator-upload-field-label');
  });

  it('uses shared Button and grouped Select items for upload row actions', () => {
    expect(modalSource).toContain('SelectGroup');
    expect(modalSource).toMatch(
      /<SelectContent>[\s\S]*<SelectGroup>[\s\S]*<SelectItem[\s\S]*<\/SelectGroup>[\s\S]*<\/SelectContent>/
    );
    expect(modalSource).toMatch(
      /<Button[\s\S]*className=\{`creator-upload-row-save-toggle[\s\S]*<\/Button>/
    );
    expect(modalSource).toMatch(
      /<Button[\s\S]*className="creator-upload-row-remove"[\s\S]*<\/Button>/
    );
    expect(modalSource).toMatch(
      /<Button[\s\S]*className="creator-upload-add-row"[\s\S]*<\/Button>/
    );
    expect(modalSource).not.toContain('<button\n');
  });

  it('keeps upload layout in the feature layer while dialog owns chrome', () => {
    expect(imageCreateCss).toMatch(
      /\.creator-upload-modal\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto;[\s\S]*?height:\s*min\(860px,\s*calc\(100dvh - 48px\)\);[\s\S]*?overflow:\s*hidden;/s
    );
    expect(imageCreateCss).toMatch(
      /\.creator-upload-dialog-body\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?padding:\s*0;/s
    );
    expect(imageCreateCss).toMatch(
      /\.creator-upload-dialog-footer\s*\{[\s\S]*?display:\s*block;[\s\S]*?padding:\s*0;[\s\S]*?border-top:\s*0;/s
    );
    expect(imageCreateCss).toMatch(
      /\.creator-upload-body\s*\{[\s\S]*?height:\s*100%;/s
    );
    expect(imageCreateCss).toMatch(
      /\.creator-preview-side\.creator-upload-form\s*\{[\s\S]*?overflow-y:\s*auto;[\s\S]*?padding-bottom:\s*22px;[\s\S]*?scrollbar-gutter:\s*stable;/s
    );
    expect(imageCreateCss).toMatch(
      /@media\s*\(max-width:\s*880px\)\s*\{[\s\S]*?\.creator-upload-modal \.creator-upload-body\s*\{[\s\S]*?height:\s*100%;[\s\S]*?\.creator-upload-modal \.creator-upload-form\s*\{[\s\S]*?min-height:\s*0;/s
    );
  });
});
