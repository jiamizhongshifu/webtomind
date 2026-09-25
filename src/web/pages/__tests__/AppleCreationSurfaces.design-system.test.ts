import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8');

describe('Apple creation surface contracts', () => {
  it('keeps the prompt preview scoped to its own component class', () => {
    const component = source(
      'src/web/pages/prompt-library/PromptCasePreviewDialog.tsx'
    );
    const css = source('src/web/pages/prompt-library/prompt-library-apple.css');

    expect(component).toContain('prompt-case-preview-modal');
    expect(component).toContain('prompt-case-preview-title');
    expect(css).toContain('.prompt-browser-page .prompt-case-preview-modal');
    expect(css).toContain('@media (prefers-reduced-transparency: reduce)');
    expect(css).toMatch(
      /@media \(max-width: 820px\)[\s\S]*?\.prompt-case-preview-modal[\s\S]*?height: 100dvh;/
    );
  });

  it('keeps character glass, accessibility, and detail layout route-scoped', () => {
    const css = source('src/web/styles/create-characters.css');

    expect(css).toContain('--create-character-canvas: #f5f5f7;');
    expect(css).toContain(
      '.create-characters-route .create-character-detail-modal'
    );
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('@media (prefers-reduced-transparency: reduce)');
    expect(css).toContain('@media (prefers-contrast: more)');
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.create-character-detail-modal[\s\S]*?height: 100dvh;/
    );
  });

  it('loads the asset Apple layer and keeps its preview full-height on mobile', () => {
    const page = source('src/web/pages/CreateGalleryPage.tsx');
    const css = source('src/web/styles/create-gallery-apple.css');

    expect(page).toContain("import '../styles/create-gallery-apple.css';");
    expect(css).toContain(
      '.create-gallery-route .create-gallery-preview-modal'
    );
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('@media (prefers-reduced-transparency: reduce)');
    expect(css).toContain('@media (prefers-contrast: more)');
    expect(css).toMatch(
      /\.create-gallery-hover-panel[\s\S]*?:is\(\.create-gallery-actions button, \.create-gallery-more-button\)[\s\S]*?background: rgba\(255, 255, 255, 0\.92\);[\s\S]*?color: #1d1d1f;/
    );
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.create-gallery-preview-modal[\s\S]*?height: 100dvh;/
    );
  });

  it('keeps the app directory image-led and tool workspaces accessible', () => {
    const page = source('src/web/pages/CreateAppsPage.tsx');
    const css = source('src/web/styles/image-tools.css');

    expect(page).toContain('className="image-tools-directory-card-media"');
    expect(page).toContain('src={tool.coverImage}');
    expect(page).toContain('tool.inputFormats.slice(0, 3)');
    expect(css).toContain('--tool-paper: #f5f5f7;');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('@media (prefers-reduced-transparency: reduce)');
    expect(css).toContain('@media (prefers-contrast: more)');
    expect(css).toMatch(
      /@media \(max-width: 600px\)[\s\S]*?\.image-tool-text-button,[\s\S]*?min-height: 44px;/
    );
  });
});
