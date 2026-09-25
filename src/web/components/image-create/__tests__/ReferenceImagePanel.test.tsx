import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReferenceImagePanel } from '../ReferenceImagePanel';

const {
  deleteImageReferenceMock,
  listImageReferencesMock,
  uploadImageReferenceMock
} = vi.hoisted(() => ({
  deleteImageReferenceMock: vi.fn(),
  listImageReferencesMock: vi.fn(),
  uploadImageReferenceMock: vi.fn()
}));

vi.mock('@/services/agent-api', () => ({
  deleteImageReference: deleteImageReferenceMock,
  listImageReferences: listImageReferencesMock,
  uploadImageReference: uploadImageReferenceMock
}));

function ReferenceImagePanelHarness() {
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<string[]>(
    []
  );

  return (
    <ReferenceImagePanel
      isAuthenticated
      onRequireLogin={vi.fn()}
      selectedReferenceIds={selectedReferenceIds}
      onSelectedReferenceIdsChange={setSelectedReferenceIds}
      setError={vi.fn()}
      setStatusText={vi.fn()}
    />
  );
}

describe('ReferenceImagePanel', () => {
  beforeEach(() => {
    deleteImageReferenceMock.mockReset();
    listImageReferencesMock.mockResolvedValue([
      {
        id: 'reference-hero',
        role: 'character',
        label: 'Saved Hero',
        thumbnailUrl: '/saved-hero.webp'
      }
    ]);
    uploadImageReferenceMock.mockReset();
  });

  it('renders reference thumbnails as shadcn buttons and toggles selection', async () => {
    const { container } = render(<ReferenceImagePanelHarness />);

    const thumbnail = await screen.findByRole('button', {
      name: 'Saved Hero'
    });
    expect(thumbnail).toHaveClass('reference-thumb');
    expect(thumbnail.tagName).toBe('BUTTON');
    expect(thumbnail).toHaveAttribute('aria-pressed', 'false');
    expect(container.querySelector('.reference-card')).not.toHaveClass(
      'selected'
    );

    fireEvent.click(thumbnail);

    await waitFor(() => {
      expect(thumbnail).toHaveAttribute('aria-pressed', 'true');
      expect(container.querySelector('.reference-card')).toHaveClass(
        'selected'
      );
    });
  });
});
