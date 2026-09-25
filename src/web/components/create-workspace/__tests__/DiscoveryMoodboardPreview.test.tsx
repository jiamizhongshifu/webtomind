import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { VisualMoodboard } from '@/shared/create-workspace-v2';
import { DiscoveryMoodboardPreview } from '../DiscoveryGallery';

const moodboard: VisualMoodboard = {
  id: 'curated-board',
  name: '城市胶片日记',
  description: '城市视觉参考',
  visibility: 'public',
  isOfficial: true,
  isOwner: false,
  coverImageUrl: '/moodboards/curated/urban-film-1.webp',
  itemCount: 4,
  items: Array.from({ length: 4 }, (_, index) => ({
    id: `item-${index + 1}`,
    moodboardId: 'curated-board',
    source: 'preset',
    imageUrl: `/moodboards/curated/urban-film-${index + 1}.webp`,
    title: `城市胶片日记 ${index + 1}`,
    sortOrder: index,
    isRepresentative: true,
    createdAt: '2026-07-18T00:00:00.000Z'
  })),
  analysisStatus: 'ready',
  tasteProfile: '雨后城市与蓝调时刻构成低饱和的叙事底色。',
  keywords: ['35mm 胶片', '雨后城市'],
  avoids: [],
  guidelines: [],
  representativeAssetIds: [],
  analysisVersion: 1,
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z'
};

describe('DiscoveryMoodboardPreview', () => {
  it('keeps the detail focused on images, profile, keywords and two CTAs', () => {
    const onUse = vi.fn();
    render(
      <MemoryRouter>
        <DiscoveryMoodboardPreview
          board={moodboard}
          prefix="/zh-CN"
          isEnglish={false}
          saving={false}
          using={false}
          saved={false}
          onSave={vi.fn()}
          onUse={onUse}
        />
      </MemoryRouter>
    );

    expect(screen.getAllByRole('img')).toHaveLength(4);
    expect(screen.getByText('情绪板')).toBeInTheDocument();
    expect(screen.getByText('风格画像')).toBeInTheDocument();
    expect(screen.getByText('关键词')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: '使用情绪板创作' })
    );
    expect(onUse).toHaveBeenCalledWith(moodboard);
    expect(
      screen.getByRole('button', { name: '保存情绪板' })
    ).toBeInTheDocument();
    expect(screen.queryByText('更多 Moodboards')).not.toBeInTheDocument();
  });

  it('copies the complete keyword list from the details rail', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });
    render(
      <MemoryRouter>
        <DiscoveryMoodboardPreview
          board={moodboard}
          prefix="/zh-CN"
          isEnglish={false}
          saving={false}
          using={false}
          saved={false}
          onSave={vi.fn()}
          onUse={vi.fn()}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: '复制' }));
    expect(writeText).toHaveBeenCalledWith('35mm 胶片, 雨后城市');
  });
});
