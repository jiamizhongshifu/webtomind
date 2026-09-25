import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(
  join(process.cwd(), 'src/web/styles/create-workspace-v2.css'),
  'utf8'
);

// Static stylesheet guardrails only; these do not prove computed browser styles.
describe('Create workspace motion source contract', () => {
  it('keeps decorative image motion short and limited to precise pointers', () => {
    expect(styles).toContain('var(--motion-feedback, 220ms)');
    expect(styles).toMatch(
      /@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?\.moodboard-library-card:hover[\s\S]*?\.moodboard-library-cover-stack/
    );
    expect(styles).toMatch(
      /@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?\.create-discovery-page \.create-v2-hero-media-link:hover img/
    );
    expect(styles).toMatch(
      /@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?\.discovery-image-tile:hover img/
    );
  });

  it('uses stable focus rings instead of zooming media for keyboard users', () => {
    expect(styles).toMatch(
      /\.moodboard-library-card-primary:focus-visible\s*\{[\s\S]*?outline:\s*3px solid var\(--product-focus-ring-color, #2f7a4c\);/
    );
    expect(styles).toMatch(
      /\.create-v2-hero-media-link:focus-visible\s*\{[\s\S]*?outline:\s*3px solid var\(--product-focus-ring-color, #2f7a4c\);/
    );
    expect(styles).toMatch(
      /\.discovery-tile-primary:focus-visible\s*\{[\s\S]*?outline:\s*3px solid var\(--product-focus-ring-color, #2f7a4c\);/
    );
    expect(styles).not.toMatch(
      /\.create-v2-hero-media-link:focus-visible img\s*\{[\s\S]*?transform:\s*scale/
    );
    expect(styles).not.toMatch(
      /\.discovery-image-tile:focus-within img\s*\{[\s\S]*?transform:\s*scale/
    );
  });

  it('turns off gallery and hero motion for reduced-motion users', () => {
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.create-discovery-page \.create-v2-hero-media img,[\s\S]*?\.discovery-masonry-image img,[\s\S]*?\.discovery-image-tile img,[\s\S]*?transition:\s*none;/
    );
  });
});
