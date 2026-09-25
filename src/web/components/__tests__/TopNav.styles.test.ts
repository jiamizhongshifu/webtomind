import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('TopNav stylesheet boundary', () => {
  it('does not pull the full homepage stylesheet into shared routes', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/web/components/TopNav.tsx'),
      'utf8'
    );
    const homeSource = readFileSync(
      join(process.cwd(), 'src/web/pages/HomePage.tsx'),
      'utf8'
    );

    expect(source).toContain("import '../styles/top-nav.css'");
    expect(source).not.toContain("import '../styles/home.css'");
    expect(homeSource).toContain("import '../styles/home.css'");
  });
});
