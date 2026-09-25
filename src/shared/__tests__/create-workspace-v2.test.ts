import { describe, expect, it } from 'vitest';
import {
  MOODBOARD_MAX_REPRESENTATIVE_ITEMS,
  toMoodboardConditioning,
  type VisualMoodboard
} from '../create-workspace-v2';

function moodboard(overrides: Partial<VisualMoodboard> = {}): VisualMoodboard {
  return {
    id: 'board-1',
    name: 'Editorial references',
    visibility: 'private',
    isOfficial: false,
    isOwner: true,
    itemCount: 5,
    analysisStatus: 'ready',
    tasteProfile: 'Muted film-inspired editorial direction',
    keywords: ['muted', 'film'],
    avoids: ['oversaturation'],
    guidelines: ['keep natural light'],
    representativeAssetIds: ['1', '2', '3', '4', '5'],
    analysisVersion: 2,
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
    ...overrides
  };
}

describe('Moodboard conditioning contract', () => {
  it('only emits reusable ready analysis and caps representative references', () => {
    const conditioning = toMoodboardConditioning(
      moodboard({ shareToken: 'shared-token-1' })
    );
    expect(conditioning).toMatchObject({
      moodboardId: 'board-1',
      shareToken: 'shared-token-1',
      analysisVersion: 2,
      keywords: ['muted', 'film']
    });
    expect(conditioning?.representativeAssetIds).toHaveLength(
      MOODBOARD_MAX_REPRESENTATIVE_ITEMS
    );
  });

  it.each(['idle', 'analyzing', 'stale', 'failed'] as const)(
    'does not reuse %s analysis',
    (analysisStatus) => {
      expect(
        toMoodboardConditioning(moodboard({ analysisStatus }))
      ).toBeUndefined();
    }
  );
});
