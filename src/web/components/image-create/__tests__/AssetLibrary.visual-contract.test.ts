import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  join(process.cwd(), 'src/web/styles/image-create.css'),
  'utf8'
);
const dataSource = readFileSync(
  join(process.cwd(), 'src/web/data/image-prompt-assets.ts'),
  'utf8'
);
const pickerSource = readFileSync(
  join(process.cwd(), 'src/web/components/image-create/AssetPicker.tsx'),
  'utf8'
);

describe('public asset library visual contracts', () => {
  it('keeps shared thumbnails square in both library surfaces', () => {
    expect(css).toMatch(
      /\.creator-asset-thumb\s*\{[\s\S]*?width:\s*100%;[\s\S]*?aspect-ratio:\s*1;/
    );
    expect(css).toMatch(
      /\.creator-asset-card\s*\{[\s\S]*?grid-template-rows:\s*auto auto auto;/
    );
    expect(css).toMatch(
      /\.creator-picker-card\s*\{[\s\S]*?grid-template-rows:\s*auto auto auto auto;/
    );
    expect(css).toMatch(
      /\.creator-picker-grid\s*\{[\s\S]*?grid-auto-rows:\s*max-content;/
    );
    expect(css).toMatch(
      /\.creator-picker-grid \.creator-picker-card\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);[\s\S]*?height:\s*auto;[\s\S]*?min-height:\s*0;[\s\S]*?align-items:\s*stretch;[\s\S]*?justify-items:\s*stretch;/
    );
    expect(css).toMatch(
      /@media \(max-width: 560px\)[\s\S]*?\.creator-picker-card\s*\{[\s\S]*?grid-template-rows:\s*auto auto;/
    );
    expect(css).toMatch(
      /@media \(max-width: 1024px\)[\s\S]*?\.creator-picker-card\s*\{[\s\S]*?grid-template-rows:\s*auto auto auto auto;/
    );
  });

  it('uses curated artwork instead of emoji for public assets', () => {
    expect(dataSource).toContain('thumbnailEmoji: undefined');
    expect(dataSource).toContain(
      'asset.thumbnailUrl || promptLibraryAssetUrl(asset.slot, asset.id)'
    );
  });

  it('keeps night-mode controls legible above mobile navigation', () => {
    expect(css).toContain(
      '.dark :is(.creator-library, .creator-picker) {'
    );
    expect(css).toMatch(
      /\.creator-picker-backdrop\s*\{[\s\S]*?z-index:\s*var\(--z-product-modal\);/
    );
    expect(pickerSource).toContain('creator-picker z-[151]');
    expect(css).toMatch(
      /\.dark \.creator-picker \.creator-library-source button\.active,[\s\S]*?background:\s*#f5efe7;[\s\S]*?color:\s*#17110d;/
    );
    expect(css).toMatch(
      /\.dark \.image-create-page \.create-mobile-nav a:not\(\.active\)\s*\{[\s\S]*?color:\s*var\(--create-night-text-2, #a0a0a0\);/
    );
  });

  it('contains selected-slot thumbnails within their dedicated grid row', () => {
    expect(css).toMatch(
      /\.creator-slot > \.creator-asset-thumb\s*\{[\s\S]*?width:\s*118px;[\s\S]*?height:\s*118px;/
    );
    expect(css).toMatch(
      /@media \(max-width: 560px\)[\s\S]*?\.creator-slot:has\(> \.creator-asset-thumb\)\s*\{[\s\S]*?grid-template-rows:\s*auto auto auto auto;/
    );
    expect(css).toMatch(
      /@media \(max-width: 560px\)[\s\S]*?\.creator-slot > \.creator-asset-thumb\s*\{[\s\S]*?width:\s*84px;[\s\S]*?height:\s*84px;/
    );
  });
});
