import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const controlsSource = readFileSync(
  join(repoRoot, 'src/web/components/image-create/CreatorControls.tsx'),
  'utf8'
);
const imageCreateStyles = readFileSync(
  join(repoRoot, 'src/web/styles/image-create.css'),
  'utf8'
);

describe('CreatorControls design-system contracts', () => {
  it('uses shared adapters for core generation settings', () => {
    expect(controlsSource).toContain("from '@/shared/ui';");
    expect(controlsSource).toContain(
      "import { Badge } from '@/shared/ui/radix/badge'"
    );
    expect(controlsSource).toContain('Button,');
    expect(controlsSource).toContain("import { Field, FieldLabel } from '@/shared/ui/radix/field'");
    expect(controlsSource).toContain('SelectRoot,');
    expect(controlsSource).toContain('<Field className="creator-control-group creator-control-model">');
    expect(controlsSource).toContain('<SelectTrigger');
    expect(controlsSource).toContain('<SelectGroup');
    expect(controlsSource).toContain('<SelectLabel');
    expect(controlsSource).toContain('<SelectItem');
    expect(controlsSource).toContain('<Badge');
    expect(controlsSource).toContain('className="creator-model-badge"');
    expect(controlsSource).not.toContain('<select');
    expect(controlsSource).not.toContain('<option');
    expect(controlsSource).not.toContain('<optgroup');
    expect(controlsSource).not.toContain('@/components/ui/');
    expect(controlsSource).not.toContain('<label htmlFor=');
    expect(imageCreateStyles).toContain(
      '.creator-control-group .creator-select-trigger'
    );
  });
});
