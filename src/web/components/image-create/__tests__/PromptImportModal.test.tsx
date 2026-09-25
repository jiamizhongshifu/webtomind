import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PromptImportModal } from '../PromptImportModal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const messages: Record<string, string> = {
        'preview.close': 'Close',
        'upload.cancel': 'Cancel',
        'upload.promptImportAnalyzing': 'Analyzing',
        'upload.promptImportHint': 'Paste a prompt and let the studio analyze it.',
        'upload.promptImportPlaceholder': 'Paste prompt',
        'upload.promptImportSubmit': 'Analyze prompt',
        'upload.promptImportTitle': 'Import prompt'
      };

      return messages[key] || key;
    }
  })
}));

function renderPromptImportModal(
  overrides: Partial<ComponentProps<typeof PromptImportModal>> = {}
) {
  const props: ComponentProps<typeof PromptImportModal> = {
    value: 'cinematic portrait',
    analyzing: false,
    error: '',
    onChange: vi.fn(),
    onCancel: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides
  };

  return {
    props,
    ...render(<PromptImportModal {...props} />)
  };
}

describe('PromptImportModal', () => {
  it('renders the prompt import flow with shadcn dialog semantics', () => {
    const { props } = renderPromptImportModal({ error: 'Prompt is required' });

    expect(
      screen.getByRole('dialog', { name: 'Import prompt' })
    ).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText('Paste prompt');
    expect(textarea).toHaveValue('cinematic portrait');
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Prompt is required');

    fireEvent.change(textarea, { target: { value: 'new prompt' } });
    expect(props.onChange).toHaveBeenCalledWith('new prompt');

    fireEvent.click(screen.getByRole('button', { name: 'Analyze prompt' }));
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it('does not cancel through the dialog close control while analyzing', () => {
    const { props } = renderPromptImportModal({ analyzing: true });

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(props.onCancel).not.toHaveBeenCalled();
    expect(
      screen.getByRole('dialog', { name: 'Import prompt' })
    ).toBeInTheDocument();
  });
});
