import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const modalSource = readFileSync(
  join(repoRoot, 'src/web/components/image-create/HistoryPreviewModal.tsx'),
  'utf8'
);
const previewShellSource = readFileSync(
  join(repoRoot, 'src/web/components/image-create/CreationPreviewDialog.tsx'),
  'utf8'
);
const lightboxSource = readFileSync(
  join(repoRoot, 'src/web/components/image-create/ImageLightbox.tsx'),
  'utf8'
);
const imageCreateCss = readFileSync(
  join(repoRoot, 'src/web/styles/image-create.css'),
  'utf8'
);

describe('HistoryPreviewModal design-system contracts', () => {
  it('uses shared Button for chrome actions and the same native image stage as case preview', () => {
    expect(modalSource).toContain("from '@/shared/ui';");
    expect(modalSource).toContain('<Button');
    expect(modalSource).toContain('className="creator-preview-reedit"');
    expect(modalSource).toMatch(
      /<Button[\s\S]*?variant="outline"[\s\S]*?className="creator-preview-reedit"/s
    );
    expect(modalSource).toContain('<CreationPreviewDialog');
    expect(previewShellSource).toContain(
      'className="creator-preview-close-button"'
    );
    expect(modalSource).toContain('data-icon="inline-start"');
    expect(modalSource).toContain(
      "'creator-preview-image-zoom create-gallery-preview-image-button'"
    );
    expect(modalSource).toMatch(
      /<button[\s\S]*?className=\{cn\([\s\S]*?creator-preview-image-zoom create-gallery-preview-image-button[\s\S]*?<\/button>/s
    );
  });

  it('uses shadcn Button for lightbox chrome while keeping the image stage domain-owned', () => {
    expect(lightboxSource).toContain(
      "import { Button } from '@/shared/ui/radix/button'"
    );
    expect(lightboxSource).toContain('<Button');
    expect(lightboxSource).toContain(
      'className="creator-prompt-case-lightbox-nav prev"'
    );
    expect(lightboxSource).toContain(
      'className="creator-prompt-case-lightbox-stage"'
    );
    expect(lightboxSource).toContain('data-icon="inline-start"');
  });

  it('keeps generation detail preview actions semantically colored on hover', () => {
    expect(modalSource).toContain('className="creator-preview-reedit"');
    expect(imageCreateCss).toMatch(
      /\.creator-preview-head\s+\.creator-preview-head-action-row\s+\.creator-preview-reedit:hover,[\s\S]*?\.creator-preview-head\s+\.creator-preview-head-action-row\s+\.creator-preview-reedit:focus-visible\s*\{[\s\S]*?color:\s*#f3f3f3;[\s\S]*?background:\s*var\(--product-action-bg,\s*#141414\);/s
    );
    expect(imageCreateCss).toMatch(
      /\.creator-preview-head\s+\.creator-preview-head-action-row\s+\.creator-preview-local-edit:hover,[\s\S]*?\.creator-preview-head\s+\.creator-preview-head-action-row\s+\.creator-preview-local-edit:focus-visible\s*\{[\s\S]*?color:\s*#173b2f;[\s\S]*?background:\s*#c9eecf;/s
    );
    expect(imageCreateCss).toMatch(
      /\.creator-preview-head\s+\.creator-preview-head-action-row\s+\.creator-preview-delete:hover,[\s\S]*?\.creator-preview-head\s+\.creator-preview-head-action-row\s+\.creator-preview-delete:focus-visible\s*\{[\s\S]*?color:\s*var\(--state-error-text,\s*#b42318\);[\s\S]*?background:\s*#ffe4df;/s
    );
  });

  it('keeps generation and gallery preview dialogs readable in dark mode', () => {
    const darkPreviewBlock =
      imageCreateCss.match(
        /\/\* Dark preview dialogs[\s\S]*?(?=\n@media\s+\(max-width:\s*520px\))/s
      )?.[0] || '';
    expect(imageCreateCss).toMatch(
      /\.dark[\s\S]*?:is\(\.create-gallery-preview-modal,\s*\.creator-history-preview-modal\)\s*\{[\s\S]*?background:[\s\S]*?#12100e;[\s\S]*?color:\s*var\(--create-night-text,\s*#ededed\);/s
    );
    expect(darkPreviewBlock).toMatch(
      /\.creator-preview-head-action-row\s+button,[\s\S]*?background-color:\s*rgba\(255,\s*247,\s*235,\s*0\.075\);[\s\S]*?color:\s*var\(--create-night-text,\s*#ededed\);/s
    );
    expect(darkPreviewBlock).toMatch(
      /\.creator-preview-head-action-row\s+button\s+:is\(svg,\s*span\)\s*\{[\s\S]*?color:\s*inherit\s*!important;[\s\S]*?stroke:\s*currentColor;/s
    );
    expect(imageCreateCss).toMatch(
      /\.dark[\s\S]*?:is\(\.create-gallery-preview-modal,\s*\.creator-history-preview-modal\)[\s\S]*?\.creator-preview-image\s*\{[\s\S]*?background:[\s\S]*?#080807;/s
    );
    expect(imageCreateCss).toMatch(
      /\.dark[\s\S]*?:is\(\.create-gallery-preview-modal,\s*\.creator-history-preview-modal\)[\s\S]*?\.creator-preview-side\s*\{[\s\S]*?border-left:\s*1px\s+solid\s+rgba\(255,\s*247,\s*235,\s*0\.1\);[\s\S]*?background:[\s\S]*?#17120f;/s
    );
    expect(imageCreateCss).toMatch(
      /\.dark[\s\S]*?:is\(\.create-gallery-preview-modal,\s*\.creator-history-preview-modal\)[\s\S]*?\.creator-preview-prompt\s*\{[\s\S]*?background:\s*rgba\(255,\s*247,\s*235,\s*0\.055\);[\s\S]*?color:\s*var\(--create-night-text,\s*#ededed\);/s
    );
    expect(imageCreateCss).toMatch(
      /\.dark[\s\S]*?:is\(\.create-gallery-preview-modal,\s*\.creator-history-preview-modal\)[\s\S]*?\.creator-preview-head-action-row[\s\S]*?\.creator-preview-reedit\s*\{[\s\S]*?background-color:\s*#fff7eb;[\s\S]*?color:\s*#17110d;/s
    );
    expect(imageCreateCss).toMatch(
      /\.dark[\s\S]*?:is\(\.create-gallery-preview-modal,\s*\.creator-history-preview-modal\)[\s\S]*?\.creator-preview-head[\s\S]*?:is\(\.creator-preview-header-favorite,\s*\.creator-preview-close-button\)\s*\{[\s\S]*?background-color:\s*rgba\(255,\s*247,\s*235,\s*0\.075\);[\s\S]*?color:\s*var\(--create-night-text,\s*#ededed\);/s
    );
    expect(imageCreateCss).toMatch(
      /\.dark[\s\S]*?:is\(\.create-gallery-preview-modal,\s*\.creator-history-preview-modal\)[\s\S]*?\.creator-preview-head[\s\S]*?:is\([\s\S]*?\.creator-preview-favorite-button,[\s\S]*?\.creator-preview-share-button,[\s\S]*?\.creator-preview-close-button[\s\S]*?\)\s*\{[\s\S]*?color:\s*#fffaf2\s*!important;/s
    );
    expect(imageCreateCss).toMatch(
      /\.dark[\s\S]*?:is\(\.create-gallery-preview-modal,\s*\.creator-history-preview-modal\)[\s\S]*?\.creator-preview-nav\s*\{[\s\S]*?border-color:\s*rgba\(255,\s*247,\s*235,\s*0\.22\);[\s\S]*?color:\s*#fffaf2\s*!important;/s
    );
    expect(darkPreviewBlock).toMatch(
      /\.creator-preview-local-edit\s*\{[\s\S]*?background-color:\s*rgba\(133,\s*232,\s*169,\s*0\.14\);[\s\S]*?color:\s*#dbf8e4;/s
    );
    expect(darkPreviewBlock).toMatch(
      /\.creator-preview-delete\s*\{[\s\S]*?background-color:\s*rgba\(255,\s*139,\s*116,\s*0\.13\);[\s\S]*?color:\s*#ffc3b8;/s
    );
    expect(darkPreviewBlock).toMatch(
      /:is\(\.creator-preview-create-cta,\s*\.creator-preview-recipe-cta\)\s*\{[\s\S]*?background-color:\s*var\(--product-accent-action-bg\);[\s\S]*?color:\s*#fffaf2\s*!important;/s
    );
    expect(imageCreateCss).toMatch(
      /@media\s+\(max-width:\s*520px\)[\s\S]*?\.dark[\s\S]*?:is\(\.create-gallery-preview-modal,\s*\.creator-history-preview-modal\)[\s\S]*?\.creator-preview-meta[\s\S]*?\{[\s\S]*?background:\s*rgba\(255,\s*247,\s*235,\s*0\.055\);[\s\S]*?color:\s*var\(--create-night-text,\s*#ededed\);/s
    );
  });

  it('uses one shared dialog shell for image and video previews', () => {
    const videoPreviewSource = readFileSync(
      join(
        process.cwd(),
        'src/web/components/image-create/VideoHistoryPreviewDialog.tsx'
      ),
      'utf8'
    );
    expect(previewShellSource).toContain(
      'className="creator-preview-close-button"'
    );
    expect(previewShellSource).toContain('useOverlayBehavior<HTMLElement>');
    expect(modalSource).toContain(
      "import { CreationPreviewDialog } from './CreationPreviewDialog'"
    );
    expect(videoPreviewSource).toContain(
      "import { CreationPreviewDialog } from './CreationPreviewDialog'"
    );
    expect(videoPreviewSource).not.toContain('creator-preview-backdrop');
    expect(videoPreviewSource).not.toContain('role="dialog"');
    expect(modalSource).not.toContain('creator-preview-backdrop');
    expect(modalSource).not.toContain('role="dialog"');
  });

  it('uses one shared favorite action for image and video previews', () => {
    const videoPreviewSource = readFileSync(
      join(
        process.cwd(),
        'src/web/components/image-create/VideoHistoryPreviewDialog.tsx'
      ),
      'utf8'
    );
    expect(modalSource).toContain(
      "import { CreationFavoriteButton } from './CreationFavoriteButton'"
    );
    expect(videoPreviewSource).toContain(
      "import { CreationFavoriteButton } from './CreationFavoriteButton'"
    );
    expect(modalSource).toContain('<CreationFavoriteButton');
    expect(videoPreviewSource).toContain('<CreationFavoriteButton');
    expect(modalSource).toContain('favoriteAction={');
    expect(videoPreviewSource).toContain('favoriteAction={');
    expect(previewShellSource).toMatch(
      /creator-preview-head-actions[\s\S]*?\{actions\}[\s\S]*?\{favoriteAction\}[\s\S]*?creator-preview-close-button/
    );
    expect(videoPreviewSource).not.toContain(
      'className="creator-preview-add-project"'
    );
  });

  it('keeps image and video card favorites on the shared top-left anchor', () => {
    expect(imageCreateCss).toMatch(
      /\.image-session-result-hover-actions\s*\{[\s\S]*?right:\s*10px;[\s\S]*?left:\s*10px;[\s\S]*?justify-content:\s*space-between;/s
    );
    expect(imageCreateCss).not.toMatch(
      /\.image-session-result-card\.is-video\s+\.image-session-result-hover-actions\s*\{[^}]*justify-content:\s*flex-end;/s
    );
  });

  it('keeps mobile preview actions separate from favorite and close controls', () => {
    expect(imageCreateCss).toMatch(
      /\.creator-history-preview-modal[\s\S]*?\.creator-preview-head:has\(\.creator-preview-header-favorite\)\s*\{[\s\S]*?grid-template-areas:[\s\S]*?'title favorite close'[\s\S]*?'actions actions actions';[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+max-content\s+46px;/s
    );
  });

  it('keeps the history image preview rectangular and fully contained', () => {
    expect(imageCreateCss).toMatch(
      /\.create-gallery-preview-image-button\s*\{[\s\S]*?width:\s*100%;[\s\S]*?height:\s*100%;[\s\S]*?cursor:\s*zoom-in;/s
    );
    expect(imageCreateCss).toMatch(
      /\.creator-history-preview-modal\s+\.creator-preview-image-thumb,[\s\S]*?\.creator-preview-image-main\s*\{[\s\S]*?max-width:\s*100%;[\s\S]*?max-height:\s*100%;[\s\S]*?width:\s*auto;[\s\S]*?height:\s*auto;[\s\S]*?object-fit:\s*contain;/s
    );
  });

  it('keeps previous and next controls spatially stable on hover', () => {
    expect(imageCreateCss).toMatch(
      /\.creator-preview\s+\.creator-preview-nav:not\(:disabled\):is\(:hover,\s*:focus-visible,\s*:active\)\s*\{[^}]*transform:\s*translateY\(-50%\);/s
    );
    expect(imageCreateCss).toMatch(
      /\.creator-preview-nav\s*\{[\s\S]*?transform:\s*translateY\(-50%\);[\s\S]*?transition:\s*background\s+0\.15s\s+ease;/s
    );
    expect(imageCreateCss).toMatch(
      /\.creator-preview\s+\.creator-preview-nav:not\(:disabled\):is\(:hover,\s*:focus-visible,\s*:active\)\s*\{[\s\S]*?background:\s*var\(--media-overlay-control-hover-bg\);[\s\S]*?transform:\s*translateY\(-50%\);/s
    );
    expect(imageCreateCss).not.toMatch(
      /\.creator-preview[^{}]*\.creator-preview-nav:not\(:disabled\):is\(:hover,\s*:focus-visible,\s*:active\)\s*\{[^}]*scale\(/s
    );
  });
});
