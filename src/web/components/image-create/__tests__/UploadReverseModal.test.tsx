import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { UploadReverseModal } from '../UploadReverseModal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const messages: Record<string, string> = {
        'preview.close': 'Close',
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

const baseRow: ComponentProps<typeof UploadReverseModal>['rows'][number] = {
  key: 'row-1',
  selected: true,
  slot: 'character',
  title: 'Original title',
  subtitle: 'Original subtitle',
  prompt: 'Original prompt',
  negativePrompt: 'Original negative',
  tagsText: 'portrait, clean'
};

function renderUploadReverseModal(
  overrides: Partial<ComponentProps<typeof UploadReverseModal>> = {}
) {
  const props: ComponentProps<typeof UploadReverseModal> = {
    thumbnailUrl: '',
    sourcePrompt: 'source prompt',
    rows: [baseRow],
    saving: false,
    error: '',
    slots: [{ id: 'character' }, { id: 'background' }],
    getSlotLabel: (slot) =>
      slot === 'character' ? 'Character' : 'Background',
    onUpdateRow: vi.fn(),
    onRemoveRow: vi.fn(),
    onAddRow: vi.fn(),
    onCancel: vi.fn(),
    onSave: vi.fn(),
    ...overrides
  };

  return {
    props,
    ...render(<UploadReverseModal {...props} />)
  };
}

describe('UploadReverseModal', () => {
  it('renders the imported rows and forwards row edits', () => {
    const { props } = renderUploadReverseModal();

    expect(
      screen.getByRole('dialog', { name: 'Confirm imported assets' })
    ).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Title'), {
      target: { value: 'New title' }
    });
    expect(props.onUpdateRow).toHaveBeenCalledWith('row-1', {
      title: 'New title'
    });

    fireEvent.change(screen.getByDisplayValue('Original prompt'), {
      target: { value: 'New prompt' }
    });
    expect(props.onUpdateRow).toHaveBeenCalledWith('row-1', {
      prompt: 'New prompt'
    });

    fireEvent.click(screen.getByRole('button', { name: /Save$/ }));
    expect(props.onUpdateRow).toHaveBeenCalledWith('row-1', {
      selected: false
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add row' }));
    expect(props.onAddRow).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Save 1' }));
    expect(props.onSave).toHaveBeenCalledTimes(1);
  });

  it('does not cancel through the dialog close control while saving', () => {
    const { props } = renderUploadReverseModal({ saving: true });

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(props.onCancel).not.toHaveBeenCalled();
    expect(
      screen.getByRole('dialog', { name: 'Confirm imported assets' })
    ).toBeInTheDocument();
  });
});
