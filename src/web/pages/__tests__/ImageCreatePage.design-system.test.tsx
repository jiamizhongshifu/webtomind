import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(
  join(process.cwd(), 'src/web/pages/ImageCreatePage.tsx'),
  'utf8'
);
const imageGenerationHookSource = readFileSync(
  join(process.cwd(), 'src/web/components/image-create/useImageGeneration.ts'),
  'utf8'
);
const characterWorkflowModalSource = readFileSync(
  join(
    process.cwd(),
    'src/web/components/image-create/ImageCreateCharacterWorkflowModal.tsx'
  ),
  'utf8'
);
const upgradePromptModalSource = readFileSync(
  join(process.cwd(), 'src/web/components/image-create/UpgradePromptModal.tsx'),
  'utf8'
);
const imageCreateStyles = readFileSync(
  join(process.cwd(), 'src/web/styles/image-create.css'),
  'utf8'
);
const createStudioThemeStyles = readFileSync(
  join(process.cwd(), 'src/web/styles/create-studio-theme.css'),
  'utf8'
);
const imageComposerSource = readFileSync(
  join(
    process.cwd(),
    'src/web/components/image-create/ImageStudioComposer.tsx'
  ),
  'utf8'
);

describe('ImageCreatePage design-system overlay contracts', () => {
  it('defaults new image-create sessions to Auto ratio and Auto size', () => {
    expect(pageSource).toContain("aspectRatio: 'auto'");
    expect(pageSource).toContain("imageSize: 'auto'");
    expect(pageSource).toContain('defaultStudioImageSettings');
  });

  it('keeps the 4+ batch count member gate wired into the studio composer', () => {
    expect(pageSource).toContain(
      'onRequestMembership={(source) =>'
    );
    expect(imageComposerSource).toContain(
      "onRequestMembership?.('image_batch_count')"
    );
    expect(imageComposerSource).toContain('image-studio-count-member-mark');
    expect(imageCreateStyles).toContain('.image-studio-count-member-mark');
  });

  it('loads the shared studio theme on direct image-route entry', () => {
    expect(pageSource).toContain("import '../styles/create-studio-theme.css'");
  });

  it('keeps image composer, popover and session states readable in light theme', () => {
    expect(createStudioThemeStyles).toMatch(
      /html:not\(\.dark\)\s*\{[\s\S]*?--studio-surface-solid:\s*#ffffff;/
    );
    expect(createStudioThemeStyles).toMatch(
      /html:not\(\.dark\) \.image-studio-composer\s*\{[\s\S]*?background:\s*var\(--studio-surface\);/
    );
    expect(createStudioThemeStyles).toMatch(
      /html:not\(\.dark\) \.image-studio-tool-popover\s*\{[\s\S]*?background:\s*var\(--studio-surface-solid\);/
    );
    expect(createStudioThemeStyles).toContain(
      'html:not(.dark) .image-session-result-menu'
    );
    expect(createStudioThemeStyles).toContain(
      '@media (prefers-reduced-transparency: reduce)'
    );
  });

  it('keeps selected references visible in the prompt through the shared thumbnail component', () => {
    expect(imageComposerSource).toContain(
      "import { PromptReferenceThumbnail } from '../create-workspace/PromptReferenceThumbnail'"
    );
    expect(imageComposerSource).toContain(
      'className="image-studio-prompt-references"'
    );
    expect(imageComposerSource).toContain(
      'onMention={() => onMentionReference(mention)}'
    );
    expect(imageComposerSource).toContain(
      'onRemove={() => onRemoveReference(mention)}'
    );
    expect(pageSource).toContain('referenceMentions={promptReferenceMentions}');
  });

  it('routes clipboard images from the prompt to the existing reference upload flow', () => {
    expect(imageComposerSource).toContain('getClipboardImageFiles');
    expect(imageComposerSource).toContain('event.preventDefault()');
    expect(imageComposerSource).toContain(
      'void onPasteReferenceImages(imageFiles)'
    );
    expect(pageSource).toContain('const handleReferenceFiles = useCallback(');
    expect(pageSource).toContain(
      'const reference = await uploadImageReference'
    );
    expect(pageSource).toContain(
      'onPasteReferenceImages={handleReferenceFiles}'
    );
  });

  it('keeps the desktop generation rail sticky boundary inside the workbench', () => {
    expect(imageCreateStyles).toMatch(
      /@media \(min-width: 1025px\)[\s\S]*?\.image-create-page-without-mininav\s*\{[\s\S]*?padding-bottom:\s*0;[\s\S]*?\.image-create-page-without-mininav \.creator-image-studio-shell\s*\{[\s\S]*?padding-bottom:\s*0;[\s\S]*?\.image-create-page-without-mininav \.creator-workbench-tricolumn::after\s*\{[\s\S]*?height:\s*calc\([\s\S]*?var\(--grid-leading, 24px\)[\s\S]*?var\(--grid-gap-md, 16px\)[\s\S]*?grid-column:\s*1 \/ -1;/
    );
  });

  it('keeps page-owned workflow modals on the shared overlay behavior', () => {
    expect(pageSource).toContain(
      "import { useOverlayBehavior } from '@/shared/ui'"
    );
    expect(pageSource).toContain(
      'const characterWorkflowModalRef = useOverlayBehavior<HTMLElement>'
    );
    expect(pageSource).toContain(
      'const upgradePromptModalRef = useOverlayBehavior<HTMLElement>'
    );
    expect(pageSource).toContain('modalRef={characterWorkflowModalRef}');
    expect(pageSource).toContain('ref={upgradePromptModalRef}');
    expect(pageSource).toContain('<ImageCreateCharacterWorkflowModal');
    expect(pageSource).toContain('<UpgradePromptModal');
    expect(pageSource).not.toContain('<HistoryAddToProjectModal');
    expect(pageSource).not.toContain('open={Boolean(addToProjectItem)}');
    expect(characterWorkflowModalSource).toContain('tabIndex={-1}');
    expect(upgradePromptModalSource).toContain('tabIndex={-1}');
  });

  it('passes unified generation tasks and focused history actions through the page shell', () => {
    expect(pageSource).toContain('const shouldShowGenerationRecordsRail =');
    expect(pageSource).toContain('progressTasks.length > 0');
    expect(pageSource).toContain('tasks={progressTasks}');
    expect(pageSource).toContain(
      'onRegenerate={(item) => void regenerateFromHistory(item)}'
    );
    expect(pageSource).toContain(
      'onFavorite={(item) => void toggleHistoryFavorite(item)}'
    );
    expect(pageSource).toContain('onDownload={downloadHistoryOriginalImage}');
    expect(pageSource).toContain('onReedit={reeditFromHistory}');
  });

  it('keeps the rail as the only task status source while preserving prompt panel compatibility', () => {
    expect(pageSource).toContain('const legacyProgressTasks = useMemo');
    expect(pageSource).toContain(
      "if (task.status === 'dismissed') return items;"
    );
    expect(pageSource).toContain(
      "status: task.status === 'running' ? 'processing' : task.status"
    );
    expect(pageSource).toContain('progressTasks={legacyProgressTasks}');
    expect(pageSource).not.toContain('generationStatusText={');
    expect(pageSource).not.toContain('onDismissGenerationStatus=');
  });

  it('routes legacy page feedback into the visible toast live region', () => {
    expect(pageSource).toContain('const setStatusText = useCallback');
    expect(pageSource).toContain('showToast(message);');
    expect(pageSource).toContain(
      "role={toastTone === 'error' ? 'alert' : 'status'}"
    );
    expect(pageSource).not.toContain("const [, setStatusText] = useState('')");
    expect(imageGenerationHookSource).not.toContain(
      "setStatusText(t('status.submitting'))"
    );
  });

  it('does not show a second credit upsell after successful generation', () => {
    expect(pageSource).not.toContain('PostGenerationUpsellBanner');
    expect(pageSource).not.toContain('postGenerationUpsell');
    expect(pageSource).toContain(
      'onGenerationSuccess: handleGenerationSuccess'
    );
  });

  it('keeps prompt case import without rendering a duplicate source banner', () => {
    expect(pageSource).toContain(
      'handleRecreatePromptCase(routeImportResult.payload'
    );
    expect(pageSource).toContain('prompt: promptCasePrompt');
    expect(pageSource).not.toContain('creator-remix-source-banner');
    expect(pageSource).not.toContain('正在 Remix 案例');
    expect(pageSource).not.toContain('Remixing from case');
    expect(imageCreateStyles).not.toContain('creator-remix-source-banner');
  });

  it('stages imported visual recipes in the composer instead of reopening the legacy picker', () => {
    const importHandlerStart = pageSource.indexOf(
      'function handleRecreatePromptCase('
    );
    const importHandlerEnd = pageSource.indexOf(
      'const handleEditGenerationTask',
      importHandlerStart
    );
    const importHandler = pageSource.slice(
      importHandlerStart,
      importHandlerEnd
    );

    expect(importHandlerStart).toBeGreaterThanOrEqual(0);
    expect(importHandlerEnd).toBeGreaterThan(importHandlerStart);
    expect(importHandler).toContain(
      'setRecipeDraftSelection(routeImport.visualRecipeSelection)'
    );
    expect(importHandler).toContain(
      'setRecipeOpenSignal((value) => value + 1)'
    );
    expect(importHandler).not.toContain(
      'setSelection(routeImport.visualRecipeSelection)'
    );
    expect(importHandler).not.toContain('setIsPickerOpen(true)');
  });

  it('never starts an image generation while loading video history', () => {
    const historyLoaderStart = pageSource.indexOf(
      'const loadVideoGenerationHistory = useCallback'
    );
    const historyLoaderEnd = pageSource.indexOf(
      'const imageTaskCenter = useImageTaskCenter',
      historyLoaderStart
    );
    const historyLoader = pageSource.slice(
      historyLoaderStart,
      historyLoaderEnd
    );

    expect(historyLoaderStart).toBeGreaterThanOrEqual(0);
    expect(historyLoaderEnd).toBeGreaterThan(historyLoaderStart);
    expect(historyLoader).toContain('getVisualVideoHistoryResult');
    expect(historyLoader).not.toContain('executeGenerateRequest');
  });
});
