import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AssetEditModal } from '../AssetEditModal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const messages: Record<string, string> = {
        'mine.editSave': 'Save asset',
        'mine.editTagsPlaceholder': 'Comma separated tags',
        'mine.editTitle': 'Edit asset',
        'preview.close': 'Close',
        'upload.cancel': 'Cancel',
        'upload.fieldNegative': 'Negative prompt',
        'upload.fieldPrompt': 'Prompt',
        'upload.fieldSlot': 'Slot',
        'upload.fieldSubtitle': 'Subtitle',
        'upload.fieldTags': 'Tags',
        'upload.fieldTitle': 'Title',
        'upload.promptRequired': 'Prompt is required',
        'upload.saveFailed': 'Save failed',
        'upload.untitled': 'Untitled'
      };

      return messages[key] || key;
    }
  })
}));

const baseAsset: ComponentProps<typeof AssetEditModal>['initialAsset'] = {
  id: 'asset-1',
  slot: 'character',
  title: 'Original title',
  subtitle: 'Original subtitle',
  prompt: 'Original prompt',
  negativePrompt: 'Original negative',
  tags: ['portrait', 'clean'],
  thumbnailUrl: '',
  visual: {
    tone: '#ffffff',
    accent: '#111111',
    shape: 'portrait'
  }
};

function renderAssetEditModal(
  overrides: Partial<ComponentProps<typeof AssetEditModal>> = {}
) {
  const props: ComponentProps<typeof AssetEditModal> = {
    initialAsset: baseAsset,
    slots: [{ id: 'character' }, { id: 'background' }],
    getSlotLabel: (slot) =>
      slot === 'character' ? 'Character' : 'Background',
    onClose: vi.fn(),
    onSave: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };

  return {
    props,
    ...render(<AssetEditModal {...props} />)
  };
}

describe('AssetEditModal', () => {
  it('renders the edit form and saves normalized input', async () => {
    const { props } = renderAssetEditModal();

    expect(
      screen.getByRole('dialog', { name: 'Edit asset' })
    ).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Title'), {
      target: { value: 'New title' }
    });
    fireEvent.change(screen.getByPlaceholderText('Subtitle'), {
      target: { value: 'New subtitle' }
    });
    fireEvent.change(screen.getByDisplayValue('Original prompt'), {
      target: { value: 'New prompt' }
    });
    fireEvent.change(screen.getByDisplayValue('Original negative'), {
      target: { value: 'New negative' }
    });
    fireEvent.change(screen.getByDisplayValue('portrait, clean'), {
      target: { value: 'portrait, clean; editorial' }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save asset' }));

    await waitFor(() => {
      expect(props.onSave).toHaveBeenCalledWith({
        id: 'asset-1',
        slot: 'character',
        title: 'New title',
        subtitle: 'New subtitle',
        prompt: 'New prompt',
        promptZh: null,
        negativePrompt: 'New negative',
        negativePromptZh: null,
        tags: ['portrait', 'clean', 'editorial'],
        thumbnailUrl: ''
      });
    });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('requires a prompt before saving', async () => {
    const { props } = renderAssetEditModal();

    fireEvent.change(screen.getByDisplayValue('Original prompt'), {
      target: { value: '   ' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save asset' }));

    expect(await screen.findByText('Prompt is required')).toBeInTheDocument();
    expect(props.onSave).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('does not close through the dialog close control while saving', () => {
    const { props } = renderAssetEditModal({
      onSave: vi.fn(
        () =>
          new Promise<void>(() => {
            // Keep saving true after the save click.
          })
      )
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save asset' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(props.onClose).not.toHaveBeenCalled();
    expect(
      screen.getByRole('dialog', { name: 'Edit asset' })
    ).toBeInTheDocument();
  });
});
