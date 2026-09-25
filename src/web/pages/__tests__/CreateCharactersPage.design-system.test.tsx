import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(
  join(process.cwd(), 'src/web/pages/CreateCharactersPage.tsx'),
  'utf8'
);
const characterCss = readFileSync(
  join(process.cwd(), 'src/web/styles/create-characters.css'),
  'utf8'
);
const cardSource = readFileSync(
  join(
    process.cwd(),
    'src/web/components/create-characters/CharacterLibraryCards.tsx'
  ),
  'utf8'
);

describe('CreateCharactersPage design-system overlay contracts', () => {
  it('keeps character reference and preset detail modals on shared overlay behavior', () => {
    expect(pageSource).toMatch(
      /import\s*\{[\s\S]*\bButton\b[\s\S]*\buseOverlayBehavior\b[\s\S]*\}\s*from\s*['"]\.\.\/\.\.\/shared\/ui['"]/
    );
    expect(pageSource).toContain(
      'const galleryModalRef = useOverlayBehavior<HTMLElement>'
    );
    expect(pageSource).toContain(
      'const officialPresetModalRef = useOverlayBehavior<HTMLElement>'
    );
    expect(pageSource).toContain('ref={galleryModalRef}');
    expect(pageSource).toContain('ref={officialPresetModalRef}');
    expect(pageSource).toContain('tabIndex={-1}');
  });
});

describe('CreateCharactersPage card module boundary', () => {
  it('keeps official and user card rendering in a dedicated shared component', () => {
    expect(pageSource).toContain(
      "from '../components/create-characters/CharacterLibraryCards'"
    );
    expect(cardSource).toContain('export function OfficialCharacterCard');
    expect(cardSource).toContain('export function UserCharacterCard');
    expect(cardSource).toContain('<Card');
  });
});

describe('CreateCharactersPage shared adapter library controls', () => {
  it('uses shared Radix adapters for character library tabs, search, filters, and empty states', () => {
    expect(pageSource).toMatch(
      /import\s*\{[\s\S]*\bEmpty\b[\s\S]*\bEmptyDescription\b[\s\S]*\bEmptyHeader\b[\s\S]*\bEmptyMedia\b[\s\S]*\}\s*from\s*['"]@\/shared\/ui\/radix\/empty['"]/
    );
    expect(pageSource).toContain(
      "import { Input } from '@/shared/ui/radix/input';"
    );
    expect(pageSource).toMatch(
      /import\s*\{[\s\S]*\bSelect\b[\s\S]*\bSelectContent\b[\s\S]*\bSelectGroup\b[\s\S]*\bSelectItem\b[\s\S]*\bSelectTrigger\b[\s\S]*\bSelectValue\b[\s\S]*\}\s*from\s*['"]@\/shared\/ui\/radix\/select['"]/
    );
    expect(pageSource).toContain(
      "import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/radix/tabs';"
    );

    expect(pageSource).toContain('<Tabs');
    expect(pageSource).toContain('className="create-character-tabs-shell"');
    expect(pageSource).toContain(
      '<TabsList className="create-character-tabs">'
    );
    expect(pageSource).toMatch(/<TabsTrigger[\s\S]*value="discover"/);
    expect(pageSource).toContain('<Input');
    expect(pageSource).toContain('<SelectTrigger');
    expect(pageSource).toContain(
      '<SelectItem value="all">全部风格</SelectItem>'
    );
    expect(pageSource).toContain(
      '<Empty className="create-empty-state compact">'
    );
  });

  it('does not keep native library tablist or native filter selects', () => {
    const libraryControls = pageSource.slice(
      pageSource.indexOf('<div className="create-character-library-controls">'),
      pageSource.indexOf('{showOfficialFilters &&')
    );
    const officialFilters = pageSource.slice(
      pageSource.indexOf('{showOfficialFilters &&'),
      pageSource.indexOf('{libraryTab ===')
    );

    expect(libraryControls).not.toContain('role="tablist"');
    expect(officialFilters).not.toContain('<select');
    expect(officialFilters).not.toContain('<option');
  });

  it('keeps character tabs height-safe without a nested scrollbar', () => {
    expect(characterCss).toMatch(
      /\.create-characters-route \.create-character-tabs\s*\{[\s\S]*height: auto;[\s\S]*min-height: 52px;[\s\S]*overflow: clip;/
    );
    expect(characterCss).toMatch(
      /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/
    );
  });
});

describe('CreateCharactersPage semantic dark-theme states', () => {
  it('uses semantic state and contrast tokens instead of page-local colors', () => {
    expect(characterCss).toContain('border-color: var(--state-success-line);');
    expect(characterCss).toContain('background: var(--state-success-bg);');
    expect(characterCss).toContain('color: var(--state-info-text);');
    expect(characterCss).toContain('color: var(--state-error-text);');
    expect(characterCss).toContain(
      'border-color: var(--product-contrast-border);'
    );
    expect(characterCss).not.toMatch(/#8cc8ff|#ff9a7a|rgba\(97,\s*207,\s*156/);
  });
});
