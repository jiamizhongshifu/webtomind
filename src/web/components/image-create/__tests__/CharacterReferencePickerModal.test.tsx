import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LIKED_OFFICIAL_CHARACTER_STORAGE_KEY } from '@/web/data/official-character-presets';
import { CharacterReferencePickerModal } from '../CharacterReferencePickerModal';

const {
  createImageCharacterMock,
  listImageCharactersMock,
  uploadImageReferenceMock
} = vi.hoisted(() => ({
  createImageCharacterMock: vi.fn(),
  listImageCharactersMock: vi.fn(),
  uploadImageReferenceMock: vi.fn()
}));

vi.mock('@/services/agent-api', () => ({
  createImageCharacter: createImageCharacterMock,
  listImageCharacters: listImageCharactersMock,
  uploadImageReference: uploadImageReferenceMock
}));

vi.mock('../referenceFileUtils', () => ({
  imageUrlToReferencePayload: vi.fn(async () => ({
    imageBase64: 'data:image/webp;base64,official',
    mimeType: 'image/webp'
  }))
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const messages: Record<string, string> = {
        'references.character.title': 'Choose character',
        'references.character.subtitle': 'Use presets or saved characters',
        'references.character.discover': 'Discover',
        'references.character.mine': 'Mine',
        'references.character.liked': 'Liked',
        'references.character.search': 'Search',
        'references.character.loading': 'Loading',
        'references.character.empty': 'No characters',
        'references.character.officialEmpty': 'No official characters',
        'references.character.likedEmpty': 'No liked characters',
        'references.character.officialImported': `Selected ${options?.name}`,
        'references.character.officialImportFailed': 'Import failed',
        'references.character.maxCharacters': `Max ${options?.count}`,
        'references.maxImages': `Max ${options?.count}`,
        'preview.close': 'Close'
      };
      return messages[key] || key;
    }
  })
}));

describe('CharacterReferencePickerModal', () => {
  beforeEach(() => {
    localStorage.clear();
    createImageCharacterMock.mockReset();
    listImageCharactersMock.mockResolvedValue([]);
    uploadImageReferenceMock.mockResolvedValue({
      id: 'reference-official-soft-elf',
      role: 'character',
      label: 'Soft Elf Girl',
      thumbnailUrl: '/soft-elf.webp'
    });
  });

  it('uses shared overlay behavior for Escape and scroll lock', async () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <CharacterReferencePickerModal
        isAuthenticated
        selectedCharacterIds={[]}
        onSelectedCharacterIdsChange={vi.fn()}
        onSelectedCharactersChange={vi.fn()}
        onSelectedReferenceIdsChange={vi.fn()}
        onRequireLogin={vi.fn()}
        setError={vi.fn()}
        setStatusText={vi.fn()}
        onClose={onClose}
      />
    );

    expect(
      document.querySelector('.creator-character-picker-modal')
    ).toHaveAttribute('tabindex', '-1');
    await waitFor(() => {
      expect(listImageCharactersMock).toHaveBeenCalledTimes(1);
      expect(document.body).toHaveAttribute('data-scroll-locked');
    });

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();
    expect(document.body).not.toHaveAttribute('data-scroll-locked');
  });

  it('uses official presets as temporary references without creating a user character card', async () => {
    const onSelectedCharacterIdsChange = vi.fn();
    const onSelectedCharactersChange = vi.fn();
    const onSelectedReferenceIdsChange = vi.fn();

    render(
      <CharacterReferencePickerModal
        isAuthenticated
        selectedCharacterIds={[]}
        onSelectedCharacterIdsChange={onSelectedCharacterIdsChange}
        onSelectedCharactersChange={onSelectedCharactersChange}
        onSelectedReferenceIdsChange={onSelectedReferenceIdsChange}
        onRequireLogin={vi.fn()}
        setError={vi.fn()}
        setStatusText={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(await screen.findByText('Soft Elf Girl'));

    await waitFor(() => {
      expect(uploadImageReferenceMock).toHaveBeenCalledTimes(1);
      expect(onSelectedCharacterIdsChange).toHaveBeenCalledWith([
        'official:soft-elf-girl'
      ]);
    });

    expect(createImageCharacterMock).not.toHaveBeenCalled();
    expect(onSelectedReferenceIdsChange).toHaveBeenCalledWith([
      'reference-official-soft-elf'
    ]);
    expect(onSelectedCharactersChange).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'official:soft-elf-girl',
        referenceImageIds: ['reference-official-soft-elf']
      })
    ]);
  });

  it('keeps Discover, Mine, and Liked scoped to their character sources', async () => {
    localStorage.setItem(
      LIKED_OFFICIAL_CHARACTER_STORAGE_KEY,
      JSON.stringify(['retro-cafe-server'])
    );
    listImageCharactersMock.mockResolvedValue([
      {
        id: 'user-character-1',
        name: 'Saved Hero',
        description: 'User saved character',
        referenceImageIds: ['reference-user-1'],
        references: [
          {
            id: 'reference-user-1',
            role: 'character',
            label: 'Saved Hero',
            thumbnailUrl: '/saved-hero.webp'
          }
        ]
      }
    ]);

    render(
      <CharacterReferencePickerModal
        isAuthenticated
        selectedCharacterIds={[]}
        onSelectedCharacterIdsChange={vi.fn()}
        onSelectedCharactersChange={vi.fn()}
        onSelectedReferenceIdsChange={vi.fn()}
        onRequireLogin={vi.fn()}
        setError={vi.fn()}
        setStatusText={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(await screen.findByText('Soft Elf Girl')).toBeInTheDocument();
    expect(screen.queryByText('Saved Hero')).not.toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: /Mine/i }));
    expect(await screen.findByText('Saved Hero')).toBeInTheDocument();
    expect(screen.queryByText('Soft Elf Girl')).not.toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: /Liked/i }));
    expect(await screen.findByText('Retro Cafe Server')).toBeInTheDocument();
    expect(screen.queryByText('Soft Elf Girl')).not.toBeInTheDocument();
    expect(screen.queryByText('Saved Hero')).not.toBeInTheDocument();
  });
});
