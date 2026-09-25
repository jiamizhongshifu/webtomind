import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(
  resolve(process.cwd(), 'src/web/pages/CreateAccountPage.tsx'),
  'utf8'
);
const accountStyles = readFileSync(
  resolve(process.cwd(), 'src/web/styles/image-create-account.css'),
  'utf8'
);
const workspaceStyles = readFileSync(
  resolve(process.cwd(), 'src/web/styles/image-create.css'),
  'utf8'
);

describe('CreateAccountPage design-system usage', () => {
  it('uses the shared Dialog primitive for the credit history modal', () => {
    expect(pageSource).toContain(
      "import { Button, ButtonLink, Card, Dialog } from '@/shared/ui'"
    );
    expect(pageSource).toContain('<Dialog');
    expect(pageSource).toContain('open={historyModalOpen}');
    expect(pageSource).toContain('className="create-account-history-modal"');
    expect(pageSource).not.toContain('useOverlayBehavior');
    expect(pageSource).not.toContain('create-account-history-backdrop');
    expect(pageSource).not.toContain('create-account-history-close');
    expect(pageSource).not.toMatch(
      /event\.key === 'Escape'[\s\S]{0,120}setHistoryModalOpen\(false\)/
    );
    expect(pageSource).not.toContain('document.body.style.overflow');
  });

  it('keeps account responsive overrides with the account stylesheet', () => {
    expect(accountStyles).toMatch(
      /\.create-account-main\s*\{[\s\S]*?margin-left:\s*calc\([\s\S]*?max\(\s*32px,[\s\S]*?1160px[\s\S]*?\)/
    );
    expect(accountStyles).toMatch(
      /@media \(max-width: 920px\)[\s\S]*?\.create-account-main\s*\{[\s\S]*?display:\s*block;[\s\S]*?margin-left:\s*auto;/
    );
    expect(accountStyles).toMatch(
      /@media \(max-width: 560px\)[\s\S]*?\.create-account-main\s*\{[\s\S]*?width:\s*min\(100% - 24px, 680px\);/
    );
    expect(workspaceStyles).not.toContain('.create-account-main');
    expect(workspaceStyles).not.toContain('.create-account-hero');
  });

  it('protects preference labels and gives select triggers the shrinkable width', () => {
    expect(pageSource).toContain(
      'create-account-list-row create-account-list-row--choice'
    );
    expect(pageSource).toContain('className="create-account-choice-label"');
    expect(pageSource).toContain(
      'className="create-account-preference-select"'
    );
    expect(accountStyles).toMatch(
      /\.create-account-list-row--choice\s*>\s*\.create-account-choice-label\s*\{[\s\S]*?flex:\s*0 0 auto;[\s\S]*?white-space:\s*nowrap;/
    );
    expect(accountStyles).toMatch(
      /\.create-account-list-row--choice\s*>\s*\.create-account-preference-select\s*\{[\s\S]*?width:\s*clamp\(124px, 56%, 220px\);[\s\S]*?flex:\s*0 1 clamp\(124px, 56%, 220px\);/
    );
    expect(accountStyles).toMatch(
      /\.create-account-list-row\s*>\s*\.ui-button\s*\{[\s\S]*?min-width:\s*max-content;[\s\S]*?flex:\s*0 0 auto;/
    );
  });

  it('provides semantic dark surfaces and readable secondary text', () => {
    expect(accountStyles).toMatch(
      /\.dark \.create-account-route\s*\{[\s\S]*?var\(--product-canvas, #0b0b0b\)/
    );
    expect(accountStyles).toMatch(
      /\.dark \.create-account-hero,[\s\S]*?\.dark \.create-account-section\s*\{[\s\S]*?var\(--product-surface, #1a1a1a\)/
    );
    expect(accountStyles).toMatch(
      /\.dark \.create-account-identity-line span,[\s\S]*?var\(--product-text-secondary, #b0b0b0\)/
    );
    expect(accountStyles).toContain(
      '.dark .create-account-invite-card button {'
    );
  });
});
