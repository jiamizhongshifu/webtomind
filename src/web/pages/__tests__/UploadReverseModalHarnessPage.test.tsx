import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UploadReverseModalHarnessPage } from '../UploadReverseModalHarnessPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const messages: Record<string, string> = {
        'upload.addRow': 'Add row',
        'upload.batchSubtitle': `${options?.count ?? 0} rows ready`,
        'upload.cancel': 'Cancel',
        'upload.confirmTitle': 'Confirm imported assets',
        'upload.fieldNegative': 'Negative prompt',
        'upload.fieldPrompt': 'Prompt',
        'upload.fieldSubtitle': 'Subtitle',
        'upload.fieldTags': 'Tags',
        'upload.fieldTitle': 'Title',
        'upload.removeRow': 'Remove row',
        'upload.saveBatch': `Save ${options?.count ?? 0}`,
        'upload.saveThis': 'Save',
        'upload.skipThis': 'Skip',
        'upload.sourcePromptEmpty': 'No source prompt',
        'upload.sourcePromptTitle': 'Source prompt'
      };

      return messages[key] || key;
    }
  })
}));

describe('UploadReverseModalHarnessPage', () => {
  it('renders the isolated upload reverse modal preview and updates status', () => {
    render(<UploadReverseModalHarnessPage />);

    expect(screen.getByText('ISOLATED PREVIEW HARNESS')).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: 'Confirm imported assets' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add row' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add row' }));

    expect(screen.getByTestId('harness-status')).toHaveTextContent(
      'added:row-extra-3'
    );
  });
});
