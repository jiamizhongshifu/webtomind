import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LanguageSwitchBanner } from '../LanguageSwitchBanner';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

const languageNames = {
  'zh-CN': '简体中文',
  'en-US': 'English'
} as const;

describe('LanguageSwitchBanner', () => {
  it('submits the selected language only after continue is pressed', async () => {
    const onContinue = vi.fn().mockResolvedValue(undefined);
    const onDismiss = vi.fn();

    render(
      <LanguageSwitchBanner
        currentLanguage="en-US"
        languageNames={languageNames}
        onContinue={onContinue}
        onDismiss={onDismiss}
      />
    );

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'zh-CN' }
    });
    expect(onContinue).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'languagePrompt.continue' })
    );

    await waitFor(() => {
      expect(onContinue).toHaveBeenCalledWith('zh-CN');
    });
  });

  it('forwards dismiss without changing language', () => {
    const onContinue = vi.fn().mockResolvedValue(undefined);
    const onDismiss = vi.fn();

    render(
      <LanguageSwitchBanner
        currentLanguage="zh-CN"
        languageNames={languageNames}
        onContinue={onContinue}
        onDismiss={onDismiss}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'languagePrompt.dismiss' })
    );

    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onContinue).not.toHaveBeenCalled();
  });
});
