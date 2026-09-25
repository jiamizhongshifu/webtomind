import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetPicker, type AssetPickerProps } from '../AssetPicker';
import {
  defaultImagePromptSelection,
  type ImagePromptAsset
} from '../../../data/image-prompt-core';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const messages: Record<string, string> = {
        'library.title': 'Prompt assets',
        'library.tabs.public': 'Public library',
        'library.tabs.mine': 'My assets',
        'library.remote': 'Remote library',
        'library.hybrid': 'Cloud + built-in library',
        'library.local': 'Local library',
        'library.searchPlaceholder': `Search ${options?.slot || ''}`,
        'library.allTags': 'All',
        'picker.title': `${options?.slot || ''} picker`,
        'picker.subtitle': 'Pick an asset',
        'picker.empty': 'No assets',
        'picker.selected': 'Selected',
        'picker.expandSlots': 'Expand all categories',
        'picker.collapseSlots': 'Collapse categories',
        'picker.expandTags': 'Expand all tags',
        'picker.collapseTags': 'Collapse tags',
        'preview.close': 'Close',
        'upload.promptImportAnalyzing': 'Analyzing',
        'upload.promptImportButton': 'Import prompt'
      };
      return messages[key] || key;
    }
  })
}));

const scrollIntoViewMock = vi.fn();
const scrollToMock = vi.fn();

const characterAsset: ImagePromptAsset = {
  id: 'character-soft-elf',
  slot: 'character',
  title: 'Soft Elf Girl',
  subtitle: 'Fantasy character',
  prompt: 'soft elf girl prompt',
  tags: ['daily'],
  thumbnailEmoji: 'A',
  visual: {
    tone: '#ffffff',
    accent: '#111111',
    shape: 'portrait'
  }
};

function renderPicker(overrides: Partial<AssetPickerProps> = {}) {
  const props: AssetPickerProps = {
    librarySource: 'public',
    onLibrarySourceChange: vi.fn(),
    assetSource: 'remote',
    assetLoadError: '',
    isAuthenticated: true,
    onRequireLogin: vi.fn(),
    uploadStage: 'idle',
    onOpenPromptImport: vi.fn(),
    activeSlot: 'character',
    onActiveSlotChange: vi.fn(),
    getSlotLabel: (slot) =>
      slot === 'character' ? 'Character' : slot === 'pose' ? 'Pose' : slot,
    query: '',
    onQueryChange: vi.fn(),
    activeTag: 'daily',
    onActiveTagChange: vi.fn(),
    slotTags: ['daily', 'portrait'],
    filteredAssets: [characterAsset],
    selection: defaultImagePromptSelection,
    onSelectAsset: vi.fn(),
    onClose: vi.fn(),
    ...overrides
  };

  return {
    props,
    ...render(<AssetPicker {...props} />)
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;
  HTMLElement.prototype.scrollTo = scrollToMock;
  window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  }) as typeof window.requestAnimationFrame;
});

describe('AssetPicker', () => {
  it('labels a cloud response completed by built-in assets as hybrid', () => {
    renderPicker({ assetSource: 'hybrid' });

    expect(screen.getByText('Cloud + built-in library')).toBeInTheDocument();
  });

  it('collapses recipe categories into a horizontal row with an expand toggle', () => {
    renderPicker();

    const nav = document.querySelector('.creator-picker-slot-nav');
    expect(nav).toBeInTheDocument();
    expect(nav).not.toHaveClass('expanded');

    const toggle = screen.getByRole('button', {
      name: 'Expand all categories'
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);

    expect(nav).toHaveClass('expanded');
    expect(
      screen.getByRole('button', { name: 'Collapse categories' })
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('collapses asset tags into a horizontal row with an expand toggle', () => {
    renderPicker();

    const nav = document.querySelector('.creator-picker-tag-nav');
    expect(nav).toBeInTheDocument();
    expect(nav).not.toHaveClass('expanded');

    const toggle = screen.getByRole('button', {
      name: 'Expand all tags'
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);

    expect(nav).toHaveClass('expanded');
    expect(
      screen.getByRole('button', { name: 'Collapse tags' })
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('resets tag state and anchors the asset grid when switching category', () => {
    const onActiveSlotChange = vi.fn();
    const onActiveTagChange = vi.fn();
    renderPicker({ onActiveSlotChange, onActiveTagChange });

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Pose' }));

    expect(onActiveSlotChange).toHaveBeenCalledWith('pose');
    expect(onActiveTagChange).toHaveBeenCalledWith(null);
    expect(scrollToMock).toHaveBeenCalledWith({
      top: 0,
      behavior: 'smooth'
    });
    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      block: 'nearest',
      behavior: 'smooth'
    });
  });

  it('anchors the asset grid when switching tags', () => {
    const onActiveTagChange = vi.fn();
    renderPicker({ onActiveTagChange });

    fireEvent.click(screen.getByRole('button', { name: 'portrait' }));

    expect(onActiveTagChange).toHaveBeenCalledWith('portrait');
    expect(scrollToMock).toHaveBeenCalledWith({
      top: 0,
      behavior: 'smooth'
    });
    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      block: 'nearest',
      behavior: 'smooth'
    });
  });
});
