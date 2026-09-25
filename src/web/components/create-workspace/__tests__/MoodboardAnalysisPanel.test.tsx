import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { VisualMoodboard } from '@/shared/create-workspace-v2';
import { MoodboardAnalysisPanel } from '../MoodboardAnalysisPanel';

function board(overrides: Partial<VisualMoodboard> = {}): VisualMoodboard {
  return {
    id: 'board-1',
    name: 'Test board',
    visibility: 'private',
    isOfficial: false,
    isOwner: true,
    itemCount: 4,
    analysisStatus: 'idle',
    tasteProfile: '',
    keywords: [],
    avoids: [],
    guidelines: [],
    representativeAssetIds: [],
    analysisVersion: 0,
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
    ...overrides
  };
}

function renderPanel(
  overrides: Partial<VisualMoodboard> = {},
  callbacks: Partial<{
    onAnalyze: () => void;
    onVisibilityChange: (visibility: string) => void;
    onShare: () => void;
    onRevokeShare: () => void;
  }> = {}
) {
  return render(
    <MoodboardAnalysisPanel
      board={board(overrides)}
      isEnglish={false}
      onAnalyze={callbacks.onAnalyze || vi.fn()}
      onVisibilityChange={callbacks.onVisibilityChange || vi.fn()}
      onShare={callbacks.onShare || vi.fn()}
      onRevokeShare={callbacks.onRevokeShare || vi.fn()}
    />
  );
}

describe('MoodboardAnalysisPanel', () => {
  it('requires four references before analysis', () => {
    renderPanel({ itemCount: 3 });
    expect(
      screen.getByRole('button', { name: '分析情绪板' })
    ).toBeDisabled();
  });

  it('shows stale analysis without silently treating it as reusable', () => {
    const onAnalyze = vi.fn();
    renderPanel(
      {
        analysisStatus: 'stale',
        tasteProfile: 'An older visual profile',
        analysisVersion: 2
      },
      { onAnalyze }
    );

    expect(screen.getByText('需要更新')).toBeInTheDocument();
    expect(screen.getByText(/参考图已经发生变化/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新分析' }));
    expect(onAnalyze).toHaveBeenCalledTimes(1);
  });

  it('exposes failed analysis recovery and revocable sharing', () => {
    const onAnalyze = vi.fn();
    const onRevokeShare = vi.fn();
    renderPanel(
      { analysisStatus: 'failed', shareToken: 'share-token' },
      { onAnalyze, onRevokeShare }
    );

    expect(screen.getByRole('alert')).toHaveTextContent('参考图不会丢失');
    fireEvent.click(screen.getByRole('button', { name: '重新分析' }));
    fireEvent.click(screen.getByRole('button', { name: '撤销分享链接' }));
    expect(onAnalyze).toHaveBeenCalledTimes(1);
    expect(onRevokeShare).toHaveBeenCalledTimes(1);
  });

  it('hides owner controls from preset and shared-board viewers', () => {
    renderPanel({ isOwner: false, isOfficial: true });
    expect(
      screen.queryByLabelText('Moodboard 可见范围')
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
