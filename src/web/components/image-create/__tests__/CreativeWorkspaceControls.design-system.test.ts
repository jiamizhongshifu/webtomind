import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

function source(path: string) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

describe('creative workspace shadcn control migrations', () => {
  it('uses shadcn controls for generation progress actions', () => {
    const panelSource = source(
      'src/web/components/image-create/GenerationProgressPanel.tsx'
    );

    expect(panelSource).toContain(
      "import { Button } from '@/shared/ui/radix/button';"
    );
    expect(panelSource).toContain('<Button');
    expect(panelSource).toContain('className="creator-progress-panel-head"');
    expect(panelSource).toContain('className="creator-progress-task-action"');
    expect(panelSource).toContain(
      'className="creator-progress-task-primary-action"'
    );
  });

  it('uses shadcn controls for the asset picker toolbar', () => {
    const pickerSource = source(
      'src/web/components/image-create/AssetPicker.tsx'
    );

    expect(pickerSource).toContain(
      "import { Button } from '@/shared/ui/radix/button';"
    );
    expect(pickerSource).toContain(
      "import { Input } from '@/shared/ui/radix/input';"
    );
    expect(pickerSource).toContain('<Button');
    expect(pickerSource).toContain('<Input');
    expect(pickerSource).toContain('className="creator-picker-import"');
    expect(pickerSource).toContain('className="creator-picker-close"');
    expect(pickerSource).toContain("'creator-picker-card'");
    expect(pickerSource).not.toContain('<input\n                value={query}');
    expect(pickerSource).not.toContain('<button');
  });

  it('uses shadcn controls for the creator library toolbar', () => {
    const librarySource = source(
      'src/web/components/image-create/CreatorLibrary.tsx'
    );

    expect(librarySource).toContain(
      "import { Button } from '@/shared/ui/radix/button';"
    );
    expect(librarySource).toContain(
      "import { Input } from '@/shared/ui/radix/input';"
    );
    expect(librarySource).toContain('<Button');
    expect(librarySource).toContain('<Input');
    expect(librarySource).toContain(
      'className="creator-library-upload secondary"'
    );
    expect(librarySource).toContain("'creator-asset-card-shell'");
    expect(librarySource).toContain("'creator-asset-card'");
    expect(librarySource).toContain('className="creator-asset-card-edit"');
    expect(librarySource).toContain('className="creator-asset-card-delete"');
    expect(librarySource).not.toContain('role="button"');
    expect(librarySource).not.toContain('<input\n          value={query}');
    expect(librarySource).not.toContain('<button');
  });

  it('uses shadcn controls for the character reference picker toolbar', () => {
    const pickerSource = source(
      'src/web/components/image-create/CharacterReferencePickerModal.tsx'
    );

    expect(pickerSource).toContain(
      "import { Button } from '@/shared/ui/radix/button';"
    );
    expect(pickerSource).toContain(
      "import { Input } from '@/shared/ui/radix/input';"
    );
    expect(pickerSource).toContain('<Button');
    expect(pickerSource).toContain('<Input');
    expect(pickerSource).toContain('<Tabs');
    expect(pickerSource).toContain('<TabsList');
    expect(pickerSource).toContain('<TabsTrigger');
    expect(pickerSource).toContain('value={activeTab}');
  });

  it('uses the shared creation preview shell and shared controls', () => {
    const videoPreviewSource = source(
      'src/web/components/image-create/VideoHistoryPreviewDialog.tsx'
    );
    const previewShellSource = source(
      'src/web/components/image-create/CreationPreviewDialog.tsx'
    );
    const gallerySource = source(
      'src/web/components/image-create/HistoryGalleryModal.tsx'
    );

    expect(videoPreviewSource).toContain(
      "import { Button } from '@/shared/ui';"
    );
    expect(videoPreviewSource).toContain('<CreationPreviewDialog');
    expect(videoPreviewSource).toContain('<Button');
    expect(videoPreviewSource).toContain('className="creator-preview-reedit"');
    expect(videoPreviewSource).toContain(
      'className="creator-preview-download"'
    );
    expect(previewShellSource).toContain(
      'className="creator-preview-close-button"'
    );
    expect(videoPreviewSource).not.toContain('creator-preview-backdrop');
    expect(gallerySource).toContain(
      "import { Button } from '@/shared/ui/radix/button';"
    );
    expect(gallerySource).toContain('<Button');
    expect(gallerySource).toContain(
      'className="creator-history-modal-confirm"'
    );
    expect(gallerySource).toContain(
      'className="creator-history-modal-load-more"'
    );
    expect(gallerySource).toContain("'creator-history-modal-card'");
    expect(gallerySource).not.toContain('<button');
  });

  it('uses shadcn controls for result and recent-generation actions', () => {
    const resultSource = source(
      'src/web/components/image-create/CreatorResult.tsx'
    );
    const recentSource = source(
      'src/web/components/image-create/RecentGenerationsPanel.tsx'
    );

    expect(resultSource).toContain(
      "import { Button, IconButton, SupportErrorNotice } from '@/shared/ui';"
    );
    expect(resultSource).toContain('<Button');
    expect(resultSource).toContain('<SupportErrorNotice');
    expect(resultSource).toContain('className="creator-result-close"');
    expect(resultSource).toContain('className="creator-consistency-repair"');
    expect(resultSource).toContain('className={activeGenerationId === item.id');
    expect(resultSource).not.toContain('<button');
    expect(recentSource).toContain(
      "import { Button } from '@/shared/ui/radix/button';"
    );
    expect(recentSource).toContain('<Button');
  });

  it('uses shadcn controls for upgrade, paywall, upsell, and workflow shell actions', () => {
    const upgradeSource = source(
      'src/web/components/image-create/UpgradePromptModal.tsx'
    );
    const paywallSource = source(
      'src/web/components/image-create/DeepFeaturePaywallModal.tsx'
    );
    const workflowModalSource = source(
      'src/web/components/image-create/ImageCreateCharacterWorkflowModal.tsx'
    );

    for (const componentSource of [upgradeSource, workflowModalSource]) {
      expect(componentSource).toContain(
        "import { Button } from '@/shared/ui/radix/button';"
      );
      expect(componentSource).toContain('<Button');
    }
    expect(paywallSource).toContain("import { Button } from '@/shared/ui';");
    expect(paywallSource).toContain('<Button');
    expect(upgradeSource).toContain('className="primary"');
    expect(paywallSource).toContain('className="deep-feature-paywall-close"');
    expect(workflowModalSource).toContain(
      'className="creator-character-modal-head"'
    );
  });

  it('uses shadcn controls for character workflow recipe actions', () => {
    const workflowSource = source(
      'src/web/components/image-create/ReferenceCharacterWorkflowPanel.tsx'
    );

    expect(workflowSource).toContain(
      "import { Button } from '@/shared/ui/radix/button';"
    );
    expect(workflowSource).toContain('<Button');
    expect(workflowSource).toContain('className="creator-consistency-repair"');
    expect(workflowSource).toContain('className="creator-recipe-save-grid"');
    expect(workflowSource).toContain('className="creator-recipe-actions"');
    expect(workflowSource).toContain('aria-label="按套件生成"');
    expect(workflowSource).toContain('aria-label="删除套件"');
  });

  it('uses shadcn controls for creator canvas toolbar and slot cards', () => {
    const canvasSource = source(
      'src/web/components/image-create/CreatorCanvas.tsx'
    );

    expect(canvasSource).toContain(
      "import { Button } from '@/shared/ui/radix/button';"
    );
    expect(canvasSource).toContain('className="creator-canvas-actions"');
    expect(canvasSource).toContain('<Button');
    expect(canvasSource).toContain('data-icon="inline-start"');
    expect(canvasSource).toContain('className={`creator-slot');
    expect(canvasSource).not.toContain('<button');
  });

  it('keeps the mobile creator dock above navigation and recipe cards touch-safe', () => {
    const desktopCss = source('src/web/styles/image-create.css');
    const mobileCss = source('src/web/styles/image-create-mobile.css');

    expect(mobileCss).toMatch(
      /\.creator-prompt-inline \.creator-prompt-footer\s*\{[\s\S]*?bottom:\s*calc\(var\(--create-mobile-bottom-stack\) \+ 8px\);/
    );
    expect(desktopCss).toMatch(
      /@media \(pointer: coarse\) and \(max-width: 1024px\)\s*\{[\s\S]*?--create-mobile-bottom-stack:\s*var\(--create-mobile-nav-height\);[\s\S]*?--creator-prompt-footer-bottom:\s*calc\([\s\S]*?var\(--create-mobile-bottom-stack\) \+ 8px[\s\S]*?\);/
    );
    expect(desktopCss).toMatch(
      /@media \(max-width: 1180px\)\s*\{[\s\S]*?\.creator-prompt-footer\s*\{[\s\S]*?bottom:\s*var\([\s\S]*?--creator-prompt-footer-bottom,[\s\S]*?max\(10px, env\(safe-area-inset-bottom\)\)[\s\S]*?\);/
    );
    expect(desktopCss).toMatch(
      /\.creator-preview-recipe-row\s*\{[\s\S]*?touch-action:\s*pan-y;/
    );
    expect(desktopCss).toMatch(
      /@media \(max-width: 560px\)\s*\{[\s\S]*?\.creator-slot-board\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/
    );
    expect(desktopCss).toMatch(
      /\.creator-slot-clear,\s*\.creator-slot-randomize,\s*\.creator-slot-material\s*\{\s*width:\s*44px;\s*height:\s*44px;/
    );
    expect(desktopCss).toMatch(
      /\.creator-preview-recipe-cta\s*\{[\s\S]*?min-height:\s*44px\s*!important;[\s\S]*?height:\s*44px\s*!important;/
    );
  });
});
