import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

function readSource(path: string) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

describe('feature overlay behavior contracts', () => {
  it('keeps the daily login reward modal on the shared button and dialog adapters', () => {
    const source = readSource(
      'src/web/components/image-create/DailyLoginRewardModal.tsx'
    );

    expect(source).toContain("import { Button } from '@/shared/ui'");
    expect(source).toMatch(/from\s+'@\/shared\/ui\/radix\/dialog'/);
    expect(source).toContain('<Dialog');
    expect(source).toContain('<DialogContent');
    expect(source).toContain('overlayClassName="daily-login-reward-overlay"');
    expect(source).toContain('showCloseButton={false}');
    expect(source).toContain('<DialogClose asChild>');
    expect(source).toContain('<DialogTitle asChild>');
    expect(source).toContain('useModalScrollLock(isVisible)');
    expect(source).toContain('className="daily-login-reward-modal gap-0 p-0"');
    expect(source).not.toContain('daily-login-reward-backdrop');
  });

  it('keeps the deep feature paywall custom visual shell on shared overlay behavior', () => {
    const source = readSource(
      'src/web/components/image-create/DeepFeaturePaywallModal.tsx'
    );

    expect(source).toContain("import { Button } from '@/shared/ui'");
    expect(source).toContain('<Button');
    expect(source).toContain(
      "import { useOverlayBehavior } from '@/shared/ui'"
    );
    expect(source).toContain('useOverlayBehavior<HTMLElement>');
    expect(source).toContain('<AnimatePresence');
    expect(source).toContain('exit={{ opacity: 0 }}');
    expect(source).toContain('className="deep-feature-paywall-modal"');
    expect(source).toContain('tabIndex={-1}');
  });

  it('does not mount a paywall automatically on gallery entry', () => {
    const source = readSource('src/web/pages/CreateGalleryPage.tsx');
    expect(source.indexOf('<h1>资产库</h1>')).toBeGreaterThan(-1);
    expect(source).not.toContain('DeepFeaturePaywallModal');
    expect(source).not.toContain('setDeepPaywallOpen(true)');
  });

  it('keeps the create onboarding modal on shared primitives while owning step navigation', () => {
    const source = readSource(
      'src/web/components/image-create/CreateOnboardingModal.tsx'
    );
    const imageCreateCss = readSource('src/web/styles/image-create.css');

    expect(source).toContain(
      "import { Button, imageFetchPriority } from '@/shared/ui'"
    );
    expect(source).toMatch(/from\s+'@\/shared\/ui\/radix\/dialog'/);
    expect(source).toContain('<Dialog');
    expect(source).toContain('<DialogContent');
    expect(source).toContain('overlayClassName="create-onboarding-backdrop"');
    expect(source).toContain('showCloseButton={false}');
    expect(source).toContain('<DialogClose asChild>');
    expect(source).toContain('<DialogTitle asChild>');
    expect(source).toContain('useModalScrollLock(open)');
    expect(source).toContain('className="create-onboarding-modal gap-0 p-0"');
    expect(source).toContain("event.key === 'ArrowRight'");
    expect(source).toContain("event.key === 'ArrowLeft'");
    expect(source).not.toMatch(/event\.key === 'Escape'/);
    expect(imageCreateCss).toMatch(
      /\.dark\s+\.create-onboarding-brand,[\s\S]*?\.dark\s+\.create-onboarding-copy\s+h1,[\s\S]*?\.dark\s+\.create-onboarding-copy\s+h2\s*\{[\s\S]*?color:\s*var\(--product-text-primary\);/
    );
    expect(imageCreateCss).toMatch(
      /\.dark\s+\.create-onboarding-copy\s+p,[\s\S]*?\.dark\s+\.create-onboarding-copy\s+li,[\s\S]*?\.dark\s+\.create-onboarding-skip\s*\{[\s\S]*?color:\s*var\(--product-text-secondary\);/
    );
  });

  it('keeps the asset picker custom shell on shared overlay behavior', () => {
    const source = readSource(
      'src/web/components/image-create/AssetPicker.tsx'
    );

    expect(source).toMatch(/from\s+'@\/shared\/ui\/radix\/dialog'/);
    expect(source).toContain('<Dialog');
    expect(source).toContain('<DialogContent');
    expect(source).toContain(
      'className="creator-picker z-[151] !max-w-none gap-0 p-0"'
    );
    expect(source).toContain('overlayClassName="creator-picker-backdrop"');
    expect(source).toContain('showCloseButton={false}');
    expect(source).toContain('onClose');
  });

  it('keeps prompt import closing semantics while using shared form primitives', () => {
    const source = readSource(
      'src/web/components/image-create/PromptImportModal.tsx'
    );

    expect(source).toContain("import { Button, Textarea } from '@/shared/ui'");
    expect(source).toMatch(/from\s+'@\/shared\/ui\/radix\/dialog'/);
    expect(source).toContain('<Dialog');
    expect(source).toContain('onOpenChange={(open) => {');
    expect(source).toContain('if (!open && !analyzing) onCancel();');
    expect(source).toContain('onEscapeKeyDown={(event) => {');
    expect(source).toContain('onInteractOutside={(event) => {');
  });
});
