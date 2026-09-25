import { createRef } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UpgradePromptModal } from '../UpgradePromptModal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key
  })
}));

vi.mock('@/i18n/hooks/useLanguage', () => ({
  useLanguage: () => ({ language: 'zh-CN' })
}));

describe('ImageCreate marketing overlays', () => {
  it('uses shadcn buttons for upgrade actions', () => {
    const upgradeSource = readFileSync(
      join(
        process.cwd(),
        'src/web/components/image-create/UpgradePromptModal.tsx'
      ),
      'utf8'
    );

    expect(upgradeSource).toContain(
      "import { Button } from '@/shared/ui/radix/button';"
    );
    expect(upgradeSource).toContain('<Button');
    expect(upgradeSource).toContain('className="primary"');
  });

  it('keeps the upgrade prompt modal aria, close behavior, and pricing action', () => {
    const modalRef = createRef<HTMLElement>();
    const onClose = vi.fn();
    const onUpgrade = vi.fn();

    const { container } = render(
      <UpgradePromptModal
        ref={modalRef}
        open
        message="Custom upgrade copy"
        estimatedCost={12}
        creditsBalance={4}
        onClose={onClose}
        onUpgrade={onUpgrade}
      />
    );

    const dialog = screen.getByRole('dialog', { name: 'upgrade.title' });
    expect(dialog).toHaveClass('creator-upgrade-modal');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('tabindex', '-1');
    expect(screen.getByText('Custom upgrade copy')).toBeInTheDocument();
    expect(
      screen.getByText('upgrade.required:{"credits":12}')
    ).toBeInTheDocument();
    expect(
      screen.getByText('upgrade.current:{"credits":4}')
    ).toBeInTheDocument();

    fireEvent.mouseDown(dialog);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(
      container.querySelector('.creator-upgrade-backdrop') as HTMLElement
    );
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'upgrade.close' }));
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: 'upgrade.later' }));
    expect(onClose).toHaveBeenCalledTimes(3);

    fireEvent.click(screen.getByRole('tab', { name: 'Max' }));
    fireEvent.click(screen.getByRole('radio', { name: /月付/ }));
    fireEvent.click(screen.getByRole('button', { name: 'upgrade.cta' }));
    expect(onUpgrade).toHaveBeenCalledWith({
      plan: 'max',
      billing: 'monthly'
    });
  });

  it('does not render the upgrade modal while closed', () => {
    render(
      <UpgradePromptModal
        ref={createRef<HTMLElement>()}
        open={false}
        message=""
        estimatedCost={12}
        creditsBalance={4}
        onClose={vi.fn()}
        onUpgrade={vi.fn()}
      />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
