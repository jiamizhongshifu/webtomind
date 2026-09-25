import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

const imageCreateStyles = readSource('src/web/styles/image-create.css');
const promptDetailStyles = readSource('src/web/styles/prompt-detail.css');

describe('prompt library shadcn/ui migration coverage', () => {
  it('keeps the Apple-style presentation layer route-scoped and accessible', () => {
    const pageSource = readSource('src/web/pages/PromptSeoLandingPage.tsx');
    const harnessSource = readSource(
      'src/web/pages/prompt-library/PromptLibraryHarnessPage.tsx'
    );
    const appleStyles = readSource(
      'src/web/pages/prompt-library/prompt-library-apple.css'
    );

    expect(pageSource).toContain(
      "import './prompt-library/prompt-library-apple.css';"
    );
    expect(harnessSource).toContain("import './prompt-library-apple.css';");
    expect(appleStyles).toContain('.prompt-browser-page');
    expect(appleStyles).toContain('@media (hover: none), (pointer: coarse)');
    expect(appleStyles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(appleStyles).toContain(
      '@media (prefers-reduced-transparency: reduce)'
    );
    expect(appleStyles).toContain('@media (prefers-contrast: more)');
  });

  it('keeps creation-workspace CSS behind the on-demand preview boundary', () => {
    const pageSource = readSource('src/web/pages/PromptSeoLandingPage.tsx');
    const previewSource = readSource(
      'src/web/pages/prompt-library/PromptCasePreviewDialog.tsx'
    );
    const navSource = readSource(
      'src/web/pages/prompt-library/PromptLibraryShellNav.tsx'
    );

    expect(pageSource).not.toContain("import '../styles/image-create.css';");
    expect(pageSource).not.toContain(
      "import '../styles/image-create-mobile.css';"
    );
    expect(pageSource).toContain(
      "lazy(() =>\n  import('./prompt-library/PromptCasePreviewDialog')"
    );
    expect(previewSource).toContain("import '../../styles/image-create.css';");
    expect(previewSource).toContain(
      "import '../../styles/image-create-mobile.css';"
    );
    expect(navSource).not.toContain('useAuth');
    expect(navSource).not.toContain('useImageCreationSessions');
  });

  it('keeps prompt detail route styles out of the shared creation bundle', () => {
    const source = readSource('src/web/pages/PromptDetailPage.tsx');

    expect(source).toContain("import '../styles/prompt-detail.css';");
    expect(source).toContain(
      "import { CreateWorkspaceFrame } from '../components/image-create/CreateWorkspaceFrame';"
    );
    expect(source).toContain('<CreateWorkspaceFrame');
    expect(source).not.toContain('CreatorMiniNav');
    expect(promptDetailStyles).toContain('.prompt-detail-shell');
    expect(promptDetailStyles).toContain('.prompt-detail-page');
    expect(promptDetailStyles).toContain(
      '@container prompt-detail (max-width: 900px)'
    );
    expect(imageCreateStyles).not.toContain('.prompt-detail-shell');
  });

  it('keeps prompt detail primary actions on shadcn Button', () => {
    const source = readSource('src/web/pages/PromptDetailPage.tsx');

    expect(source).toContain(
      "import { Button } from '@/shared/ui/radix/button';"
    );
    expect(source).toContain(
      '<Button type="button" onClick={handleUsePrompt}>'
    );
    expect(source).toContain('prompt-detail-favorite');
    expect(source).not.toContain(
      '<button type="button" onClick={handleUsePrompt}>'
    );
    expect(source).not.toContain('<button type="button" onClick={handleCopy}>');
    expect(source).not.toContain(
      '<button type="button" onClick={handleUnlockPrompt}>'
    );
    expect(source).not.toContain(
      '<button type="button" onClick={() => handleUseVisualRecipe()}>'
    );
  });

  it('keeps the prompt detail breadcrumb flat (no middle topic link)', () => {
    const source = readSource('src/web/pages/PromptDetailPage.tsx');

    // The breadcrumb "up" level always returns to the prompt library; the old
    // middle category/topic link (e.g. /prompts/category/character-consistency)
    // was removed because those category pages still render the legacy frame.
    expect(source).not.toContain('breadcrumbTopicLink');
    const breadcrumb = source.match(
      /className="prompt-detail-breadcrumb"[\s\S]*?<\/nav>/
    );
    expect(breadcrumb).toBeTruthy();
    expect(breadcrumb?.[0]).toContain('<Link to={promptLibraryHref}>');
    expect(breadcrumb?.[0]).not.toContain('breadcrumbTopicLink.href');
    // Keep the current case title as the terminal crumb.
    expect(breadcrumb?.[0]).toContain('<span>{title}</span>');
  });

  it('keeps prompt library navigation controls on shadcn Button', () => {
    const source = readSource(
      'src/web/pages/prompt-library/PromptLibraryNavigation.tsx'
    );

    expect(source).toContain(
      "import { Button } from '@/shared/ui/radix/button';"
    );
    expect(source).toContain(
      'className="prompt-browser-scroll-button prompt-browser-scroll-button-left"'
    );
    expect(source).toContain('<Button');
    expect(source).not.toContain(
      '<button\n        type="button"\n        className="prompt-browser-scroll-button'
    );
  });

  it('keeps prompt library card favorite control on shadcn Button', () => {
    const source = readSource(
      'src/web/pages/prompt-library/PromptLibraryCard.tsx'
    );

    expect(source).toContain(
      "import { Button } from '@/shared/ui/radix/button';"
    );
    expect(source).toContain('prompt-browser-case-favorite');
    expect(source).toContain('<Button');
    expect(source).not.toContain(
      '<button\n        type="button"\n        className={\n          isFavorited'
    );
  });

  it('loads masonry styles wherever the reusable masonry is rendered', () => {
    const source = readSource(
      'src/web/pages/prompt-library/PromptLibraryMasonry.tsx'
    );

    expect(source).toContain("import '../../styles/marketing-pages.css';");
  });

  it('documents intentionally retained media selector buttons in preview dialog', () => {
    const source = readSource(
      'src/web/pages/prompt-library/PromptCasePreviewDialog.tsx'
    );

    expect(source).toContain(
      "import { Button } from '@/shared/ui/radix/button';"
    );
    expect(source).toContain('creator-preview-image-zoom');
    expect(source).toContain('creator-preview-image-switcher');
    expect(source).toContain(
      "import { VisualRecipeSummary } from '@/web/components/image-create/VisualRecipeSummary';"
    );
    expect(source).toContain('<VisualRecipeSummary');
  });

  it('keeps prompt library preview CTAs on shadcn Button links', () => {
    const source = readSource(
      'src/web/pages/prompt-library/PromptCasePreviewDialog.tsx'
    );

    expect(source).toContain(
      "import { Button } from '@/shared/ui/radix/button';"
    );
    expect(source).toContain(
      'className="creator-preview-reedit creator-preview-create-cta"'
    );
    expect(source).toContain('createLabel=');
    expect(source).toContain('createHref={createPath}');
    expect(source).toContain('data-icon="inline-start"');
  });

  it('keeps prompt library preview CTAs and related cards readable in dark mode', () => {
    expect(imageCreateStyles).toMatch(
      /\.dark[\s\S]*?:is\(\.create-gallery-preview-modal,\s*\.creator-history-preview-modal\)[\s\S]*?:is\(\.creator-preview-create-cta,\s*\.creator-preview-recipe-cta\)\s*\{[\s\S]*?background-color:\s*var\(--product-accent-action-bg\);[\s\S]*?color:\s*#fffaf2\s*!important;/s
    );
    expect(imageCreateStyles).toMatch(
      /\.dark[\s\S]*?:is\(\.create-gallery-preview-modal,\s*\.creator-history-preview-modal\)[\s\S]*?:is\(\.creator-preview-create-cta,\s*\.creator-preview-recipe-cta\)[\s\S]*?:is\(\.ui-button__label,\s*\.ui-button__icon,\s*span,\s*svg\)[\s\S]*?color:\s*inherit\s*!important;/s
    );
    expect(imageCreateStyles).toMatch(
      /\.dark[\s\S]*?:is\(\.create-gallery-preview-modal,\s*\.creator-history-preview-modal\)[\s\S]*?\.creator-preview-head[\s\S]*?:is\([\s\S]*?\.creator-preview-favorite-button,[\s\S]*?\.creator-preview-share-button,[\s\S]*?\.creator-preview-close-button[\s\S]*?\)\s*\{[\s\S]*?color:\s*#fffaf2\s*!important;/s
    );
    expect(imageCreateStyles).toMatch(
      /\.dark[\s\S]*?:is\(\.create-gallery-preview-modal,\s*\.creator-history-preview-modal\)[\s\S]*?\.creator-preview-nav\s*\{[\s\S]*?background:\s*rgba\(7,\s*6,\s*5,\s*0\.68\);[\s\S]*?color:\s*#fffaf2\s*!important;/s
    );
    expect(imageCreateStyles).toMatch(
      /\.dark[\s\S]*?:is\(\.create-gallery-preview-modal,\s*\.creator-history-preview-modal\)[\s\S]*?\.creator-preview-nav[\s\S]*?:is\(svg,\s*span\)\s*\{[\s\S]*?color:\s*inherit\s*!important;[\s\S]*?stroke:\s*currentColor;/s
    );
    expect(imageCreateStyles).toMatch(
      /\.dark[\s\S]*?:is\(\.create-gallery-preview-modal,\s*\.creator-history-preview-modal\)[\s\S]*?\.creator-preview-prompt-language-tabs\s*\{[\s\S]*?background:\s*rgba\(255,\s*247,\s*235,\s*0\.055\);/s
    );
    expect(imageCreateStyles).toMatch(
      /\.dark[\s\S]*?:is\(\.create-gallery-preview-modal,\s*\.creator-history-preview-modal\)[\s\S]*?\.creator-prompt-case-related-card,[\s\S]*?\.creator-prompt-case-related-empty\s*\{[\s\S]*?background:\s*rgba\(255,\s*247,\s*235,\s*0\.055\);[\s\S]*?color:\s*var\(--create-night-text,\s*#ededed\);/s
    );
  });

  it('keeps prompt library empty and SEO CTAs on shadcn Button links', () => {
    const masonrySource = readSource(
      'src/web/pages/prompt-library/PromptLibraryMasonry.tsx'
    );
    const seoContentSource = readSource(
      'src/web/pages/prompt-library/PromptLibrarySeoContent.tsx'
    );

    for (const source of [masonrySource, seoContentSource]) {
      expect(source).toContain(
        "import { Button } from '@/shared/ui/radix/button';"
      );
      expect(source).toContain('asChild');
      expect(source).not.toContain('ButtonLink');
    }

    expect(masonrySource).toContain(
      'className="prompt-browser-case-state-action"'
    );
    expect(seoContentSource).toContain(
      'className="prompt-seo-style-grid-link"'
    );
    expect(seoContentSource).toContain('className="marketing-category-pill"');
    expect(seoContentSource).toContain('data-icon="inline-end"');
  });
});
