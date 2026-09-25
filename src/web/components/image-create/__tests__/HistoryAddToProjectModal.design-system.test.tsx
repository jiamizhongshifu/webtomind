import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const modalSource = readFileSync(
  join(
    repoRoot,
    'src/web/components/image-create/HistoryAddToProjectModal.tsx'
  ),
  'utf8'
);

describe('HistoryAddToProjectModal design-system contracts', () => {
  it('uses shared Radix adapters for project picking', () => {
    expect(modalSource).toContain(
      "import { Button } from '@/shared/ui/radix/button'"
    );
    expect(modalSource).toMatch(/from\s+'@\/shared\/ui\/radix\/dialog'/);
    expect(modalSource).not.toContain('@/components/ui/');
    expect(modalSource).toContain('<Dialog');
    expect(modalSource).toContain('<DialogContent');
    expect(modalSource).toContain('<DialogTitle asChild>');
    expect(modalSource).toContain('onEscapeKeyDown={(event) => {');
    expect(modalSource).toContain('onInteractOutside={(event) => {');
    expect(modalSource).toMatch(
      /<Button[\s\S]*className="creator-project-picker-item"[\s\S]*<\/Button>/
    );
    expect(modalSource).not.toContain('creator-project-picker-backdrop');
    expect(modalSource).not.toContain('useOverlayBehavior');
  });
});
