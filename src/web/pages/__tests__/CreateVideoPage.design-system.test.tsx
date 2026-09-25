import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(
  join(process.cwd(), 'src/web/pages/CreateVideoPage.tsx'),
  'utf8'
);
const composerSource = readFileSync(
  join(
    process.cwd(),
    'src/web/components/video-create/VideoStudioComposer.tsx'
  ),
  'utf8'
);
const imageComposerSource = readFileSync(
  join(
    process.cwd(),
    'src/web/components/image-create/ImageStudioComposer.tsx'
  ),
  'utf8'
);
const imageCreateStyles = readFileSync(
  join(process.cwd(), 'src/web/styles/image-create.css'),
  'utf8'
);
const imageCreateMobileStyles = readFileSync(
  join(process.cwd(), 'src/web/styles/image-create-mobile.css'),
  'utf8'
);
const videoStudioStyles = readFileSync(
  join(process.cwd(), 'src/web/styles/video-studio.css'),
  'utf8'
);
const createStudioThemeStyles = readFileSync(
  join(process.cwd(), 'src/web/styles/create-studio-theme.css'),
  'utf8'
);
const promptReferenceStyles = readFileSync(
  join(
    process.cwd(),
    'src/web/components/create-workspace/prompt-reference-thumbnail.css'
  ),
  'utf8'
);
const sharedGenerateButtonSource = readFileSync(
  join(
    process.cwd(),
    'src/web/components/create-workspace/CreationGenerateButton.tsx'
  ),
  'utf8'
);

describe('CreateVideoPage studio composer contracts', () => {
  it('keeps page orchestration separate from the reusable composer', () => {
    expect(pageSource).toContain(
      "from '../components/video-create/VideoStudioComposer'"
    );
    expect(pageSource).toContain('<VideoStudioComposer');
    expect(pageSource).not.toContain('<select');
    expect(pageSource).not.toContain('<option');
    expect(pageSource).not.toContain('create-video-composer');
  });

  it('shares an icon-only image and video creation action', () => {
    expect(composerSource).toContain('<CreationGenerateButton');
    expect(imageComposerSource).toContain('<CreationGenerateButton');
    expect(composerSource).not.toContain('estimatedCostLabel=');
    expect(imageComposerSource).not.toContain('estimatedCostLabel=');
    expect(sharedGenerateButtonSource).not.toContain('estimatedCostLabel');
    expect(sharedGenerateButtonSource).not.toContain(
      'creation-generate-button-copy'
    );
    expect(sharedGenerateButtonSource).not.toContain('Play');
  });

  it('uses accessible tool buttons and portal popovers without native selects', () => {
    expect(composerSource).toContain(
      "import { createPortal } from 'react-dom'"
    );
    expect(composerSource).toContain('data-video-studio-tool={tool}');
    expect(composerSource).toContain('onMouseEnter={(event) =>');
    expect(composerSource).toContain('onFocus={(event) =>');
    expect(composerSource).toContain('role="dialog"');
    expect(composerSource).toContain('aria-expanded={openTool === tool}');
    expect(composerSource).not.toContain('role="tablist"');
    expect(composerSource).not.toContain("textMode: '文本生成'");
    expect(composerSource).toContain('<FrameCard');
    expect(composerSource).not.toContain('<select');
    expect(composerSource).not.toContain('<option');
    expect(composerSource).toContain("from '@/shared/ui/radix/slider'");
    expect(composerSource).toContain('<Slider');
    expect(composerSource).not.toContain('video-studio-duration-grid');
  });

  it('keeps referenced frames visible in the prompt with direct actions', () => {
    expect(composerSource).toContain(
      'className="video-studio-prompt-references"'
    );
    expect(composerSource).toContain('<PromptReferenceThumbnail');
    expect(composerSource).toContain('onMentionFrame');
    expect(composerSource).toContain('onMentionReference');
    expect(composerSource).toContain(
      'removeLabel={copy.removeImage(copy.firstFrame)}'
    );
    expect(promptReferenceStyles).toMatch(
      /\.creation-prompt-reference:is\(:hover, :focus-within\)[\s\S]*?opacity:\s*1;/
    );
    expect(promptReferenceStyles).toMatch(
      /@media \(max-width: 720px\)[\s\S]*?\.creation-prompt-reference-actions\s*\{[^}]*opacity:\s*1;/
    );
    expect(promptReferenceStyles).toMatch(
      /@media \(max-width: 720px\)[\s\S]*?\.creation-prompt-reference-actions button\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/
    );
  });

  it('reuses the image session conversation instead of a parallel video transcript', () => {
    expect(pageSource).toContain(
      "from '../components/image-create/ImageSessionConversation'"
    );
    expect(pageSource).toContain('<ImageSessionConversation');
    expect(pageSource).toContain('mediaType="video"');
    expect(pageSource).toContain("createImageSession(firstPrompt, 'video')");
    expect(pageSource).toContain('setVisualVideoFavorite');
    expect(pageSource).not.toContain('favoriteLoadingIds={favoriteLoadingIds}');
    expect(pageSource).toContain(
      'onFavorite={() => void toggleVideoFavorite(previewVideo)}'
    );
  });

  it('keeps the image and video composers on the same fixed dock', () => {
    expect(imageComposerSource).toContain(
      'className="create-studio-composer-dock image-studio-composer"'
    );
    expect(composerSource).toContain(
      'className="create-studio-composer-dock video-studio-composer"'
    );
    expect(imageCreateStyles).toMatch(
      /\.create-studio-composer-dock\s*\{[^}]*position:\s*fixed;[^}]*bottom:\s*22px;/
    );
    expect(videoStudioStyles).not.toMatch(
      /\.video-studio-composer\s*\{[^}]*position:\s*relative;/
    );
  });

  it('provides a complete light-theme boundary for the video studio', () => {
    expect(createStudioThemeStyles).toContain(
      'html:not(.dark) :is(.image-studio-v2, .video-studio-v2)'
    );
    expect(createStudioThemeStyles).toMatch(
      /html:not\(\.dark\) \.video-studio-composer\s*\{[\s\S]*?background:\s*var\(--studio-surface\);/
    );
    expect(createStudioThemeStyles).toMatch(
      /html:not\(\.dark\) \.video-studio-tool-popover\s*\{[\s\S]*?background:\s*var\(--studio-surface-solid\);/
    );
    expect(createStudioThemeStyles).toMatch(
      /html:not\(\.dark\)[\s\S]*?\.video-studio-result-card,[\s\S]*?\.video-studio-result-skeleton/
    );
  });

  it('keeps session favorite controls touchable without hover on mobile', () => {
    expect(imageCreateMobileStyles).toMatch(
      /@media \(max-width: 800px\)[\s\S]*?\.image-session-result-hover-actions\s*\{[^}]*opacity:\s*1;[^}]*transform:\s*none;/
    );
    expect(imageCreateMobileStyles).toMatch(
      /\.image-session-result-hover-actions button,[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*44px;/
    );
  });
});
