import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const referencePanelSource = readFileSync(
  resolve(__dirname, '../ReferenceImagePanel.tsx'),
  'utf8'
);
const characterPanelSource = readFileSync(
  resolve(__dirname, '../CharacterConsistencyPanel.tsx'),
  'utf8'
);
const imageCreateStyles = readFileSync(
  resolve(__dirname, '../../../styles/image-create.css'),
  'utf8'
);

describe('reference and character panels shadcn migration', () => {
  it('uses shadcn controls for reference upload role controls', () => {
    expect(referencePanelSource).toContain(
      "import { Button, IconButton } from '@/shared/ui';"
    );
    expect(referencePanelSource).toContain("from '@/shared/ui/radix/select'");
    expect(referencePanelSource).toContain('<Button');
    expect(referencePanelSource).toContain('<Select');
    expect(referencePanelSource).toContain('<SelectTrigger');
    expect(referencePanelSource).toContain('<SelectItem');
    expect(referencePanelSource).toContain('className="reference-thumb"');
    expect(referencePanelSource).not.toContain('<button');
    expect(referencePanelSource).not.toContain('<select');
    expect(referencePanelSource).not.toContain('<option');
  });

  it('uses shadcn form controls for character creation', () => {
    expect(characterPanelSource).toContain(
      "import { Button } from '@/shared/ui/radix/button';"
    );
    expect(characterPanelSource).toContain(
      "import { Input } from '@/shared/ui/radix/input';"
    );
    expect(characterPanelSource).toContain(
      "import { Textarea } from '@/shared/ui/radix/textarea';"
    );
    expect(characterPanelSource).toContain('<Input');
    expect(characterPanelSource).toContain('<Textarea');
    expect(characterPanelSource).toContain('<Button');
    expect(characterPanelSource).toContain('className="character-card-main"');
    expect(characterPanelSource).not.toContain('<button');
  });

  it('keeps local sizing hooks for migrated shadcn select triggers', () => {
    expect(imageCreateStyles).toContain(
      '.reference-role-inline .reference-role-trigger'
    );
    expect(imageCreateStyles).toContain('.reference-thumb');
    expect(imageCreateStyles).toContain('.character-card-main');
    expect(imageCreateStyles).toContain('white-space: normal');
  });
});
