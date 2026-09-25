import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

function source(path: string) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

describe('high-yield shadcn migration batches', () => {
  it('migrates key generation controls to shadcn primitives', () => {
    const compilerSource = source(
      'src/web/components/image-create/PromptCompilerPanel.tsx'
    );
    const characterPageSource = source(
      'src/web/pages/CreateCharactersPage.tsx'
    );

    expect(compilerSource).toContain(
      "import { Checkbox } from '@/shared/ui/radix/checkbox';"
    );
    expect(compilerSource).toContain('<Checkbox');
    expect(compilerSource).toContain('<SelectRoot');
    expect(compilerSource).toContain(
      'className="creator-select-trigger creator-count-select-trigger"'
    );
    expect(compilerSource).toContain('className="creator-prompt-library-icon');

    expect(characterPageSource).toContain("from '../../shared/ui';");
    expect(characterPageSource).toContain('Button,');
    expect(characterPageSource).not.toContain('@/shared/ui/radix/button');
    expect(characterPageSource).toContain(
      "import { Textarea } from '@/shared/ui/radix/textarea';"
    );
    expect(characterPageSource).toContain(
      "from '@/shared/ui/radix/toggle-group'"
    );
    expect(characterPageSource).toContain('<ToggleGroup');
    expect(characterPageSource).toContain(
      'className="create-character-methods"'
    );
    expect(characterPageSource).toContain(
      'className="create-character-submit"'
    );
  });

  it('migrates preview, navigation, and account controls to shadcn primitives', () => {
    const gallerySource = source('src/web/pages/CreateGalleryPage.tsx');
    const galleryActionsSource = source(
      'src/web/components/image-create/GalleryActionControls.tsx'
    );
    const previewDialogSource = source(
      'src/web/pages/prompt-library/PromptCasePreviewDialog.tsx'
    );
    const sideNavSource = source(
      'src/web/components/image-create/CreateSideNav.tsx'
    );
    const miniNavSource = source(
      'src/web/components/image-create/CreatorMiniNav.tsx'
    );
    const accountSource = source('src/web/pages/CreateAccountPage.tsx');

    expect(gallerySource).toContain("} from '@/shared/ui';");
    expect(gallerySource).not.toContain('@/shared/ui/radix/');
    expect(galleryActionsSource).toContain(
      'className="create-gallery-more-button"'
    );
    expect(gallerySource).toContain('className="creator-preview-download"');
    expect(gallerySource).toContain('className="creator-preview-close-button"');

    expect(previewDialogSource).toContain(
      "import { Button } from '@/shared/ui/radix/button';"
    );
    expect(previewDialogSource).toContain("from '@/shared/ui/radix/tabs'");
    expect(previewDialogSource).toContain('<Tabs');
    expect(previewDialogSource).toContain(
      'className="creator-preview-prompt-language-tabs"'
    );

    for (const navSource of [sideNavSource, miniNavSource]) {
      expect(navSource).toContain("from '@/shared/ui';");
      expect(navSource).toContain('Button,');
      expect(navSource).not.toContain('SelectRoot,');
      expect(navSource).not.toContain('create-side-nav-control-select');
      expect(navSource).toContain('settingsHref={settingsHref}');
    }

    expect(accountSource).toContain('generationSoundEnabled');
    expect(accountSource).toContain('aria-pressed={generationSoundEnabled}');

    expect(accountSource).toContain(
      "import { Button, ButtonLink, Card, Dialog } from '@/shared/ui';"
    );
    expect(accountSource).toContain("from '@/shared/ui/radix/select'");
    expect(accountSource).toContain("from '@/shared/ui/radix/tabs'");
    expect(accountSource).toContain('<SelectTrigger');
    expect(accountSource).toContain('className="create-account-history-tabs"');
    expect(accountSource).toContain('<TabsList>');
  });

  it('migrates management and reference-panel actions to shadcn primitives', () => {
    const promptCasesSource = source(
      'src/web/components/image-create/PromptCasesPanel.tsx'
    );
    const assetCoverageSource = source(
      'src/web/components/image-create/PromptCaseAssetCoveragePanel.tsx'
    );
    const referenceSource = source(
      'src/web/components/image-create/ReferenceImagePanel.tsx'
    );
    const characterSource = source(
      'src/web/components/image-create/CharacterConsistencyPanel.tsx'
    );

    expect(promptCasesSource).toContain(
      "import { Input } from '@/shared/ui/radix/input';"
    );
    expect(promptCasesSource).toContain(
      '<TabsList className="creator-prompt-case-categories">'
    );
    expect(promptCasesSource).toContain(
      'className="creator-prompt-cases-icon-button"'
    );
    expect(promptCasesSource).toContain(
      'className="creator-prompt-case-admin-modal-actions"'
    );
    expect(promptCasesSource).toContain('<ShadcnButton');

    expect(assetCoverageSource).toContain(
      "import { Checkbox } from '@/shared/ui/radix/checkbox';"
    );
    expect(assetCoverageSource).toContain(
      "import { Input } from '@/shared/ui/radix/input';"
    );
    expect(assetCoverageSource).toContain('<Checkbox');
    expect(assetCoverageSource).toContain('<Input');
    expect(assetCoverageSource).toContain(
      'className="prompt-case-asset-coverage-actions"'
    );

    for (const panelSource of [referenceSource, characterSource]) {
      expect(panelSource).toContain('<Button');
    }
    expect(referenceSource).toContain(
      "import { Button, IconButton } from '@/shared/ui';"
    );
    expect(referenceSource).toContain('<IconButton');
    expect(referenceSource).toContain('label="删除参考图"');
    expect(characterSource).toContain(
      "import { Button } from '@/shared/ui/radix/button';"
    );
    for (const panelSource of [referenceSource, characterSource]) {
      expect(panelSource).toContain('<Button');
      expect(panelSource).toContain('size="icon"');
    }
  });

  it('keeps the public tool directory free of the retired filter/detail flow', () => {
    const appsSource = source('src/web/pages/CreateAppsPage.tsx');
    expect(appsSource).toContain('image-tools-directory-card');
    expect(appsSource).toContain('to={`${prefix}${tool.href}`}');
    expect(appsSource).not.toContain('ToggleGroup');
    expect(appsSource).not.toContain('create-filter-row');
    expect(appsSource).not.toContain('<button');
  });
});
