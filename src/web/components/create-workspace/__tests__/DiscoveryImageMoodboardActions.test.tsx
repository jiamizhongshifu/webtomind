import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VisualMoodboard } from '@/shared/create-workspace-v2';
import { DiscoveryImageMoodboardActions } from '../DiscoveryImageMoodboardActions';

function board(id: string, name: string): VisualMoodboard {
  return {
    id,
    name,
    visibility: 'private',
    isOfficial: false,
    isOwner: true,
    itemCount: 2,
    items: [],
    analysisStatus: 'idle',
    tasteProfile: '',
    keywords: [],
    avoids: [],
    guidelines: [],
    representativeAssetIds: [],
    analysisVersion: 0,
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-07-18T00:00:00.000Z'
  };
}

describe('DiscoveryImageMoodboardActions', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        media: '',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    );
  });

  it('uses the selected board, switches the default, and quick-saves', () => {
    const onSelectBoard = vi.fn();
    const onSave = vi.fn();
    render(
      <MemoryRouter>
        <DiscoveryImageMoodboardActions
          boards={[board('board-1', '城市胶片'), board('board-2', '北窗静物')]}
          selectedBoardId="board-1"
          prefix="/zh-CN"
          isEnglish={false}
          saved={false}
          saving={false}
          onSelectBoard={onSelectBoard}
          onSave={onSave}
        />
      </MemoryRouter>
    );

    fireEvent.click(
      screen.getByRole('button', { name: '选择情绪板：城市胶片' })
    );
    fireEvent.click(screen.getByRole('button', { name: /北窗静物/ }));
    expect(onSelectBoard).toHaveBeenCalledWith('board-2');

    fireEvent.click(screen.getByRole('button', { name: '保存到城市胶片' }));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('renders a non-destructive saved state for the selected board', () => {
    render(
      <MemoryRouter>
        <DiscoveryImageMoodboardActions
          boards={[board('board-1', '城市胶片')]}
          selectedBoardId="board-1"
          prefix="/zh-CN"
          isEnglish={false}
          saved
          saving={false}
          onSelectBoard={vi.fn()}
          onSave={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('button', { name: '已保存到城市胶片' })
    ).toHaveAttribute('data-saved', 'true');
  });
});
