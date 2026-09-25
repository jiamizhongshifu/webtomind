import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  VisualImageHistoryItem,
  VisualVideoGenerationItem
} from '@/services/agent-api';
import {
  GenerationRecordsRail,
  type GenerationRecordsRailProps,
  type GenerationRecordTask
} from '../GenerationRecordsRail';

vi.mock('border-beam', () => ({
  BorderBeam: ({
    active,
    children,
    colorVariant,
    size,
    strength
  }: {
    active?: boolean;
    children: ReactNode;
    colorVariant?: string;
    size?: string;
    strength?: number;
  }) => (
    <div
      data-active={String(active)}
      data-color-variant={colorVariant}
      data-size={size}
      data-strength={strength}
      data-testid="progress-border-beam"
    >
      {children}
    </div>
  )
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    t: (key: string) => {
      const messages: Record<string, string> = {
        'history.viewMore': 'View more',
        'history.empty': 'No history',
        'history.title': 'Recent generations',
        'historyRail.eyebrow': 'AI TASKS',
        'historyRail.title': 'Generation records',
        'historyRail.imageTask': 'Image generation',
        'historyRail.preview': 'Preview',
        'historyRail.download': 'Download',
        'historyRail.dismissStatus': 'Dismiss status',
        'historyRail.moreActions': 'More',
        'historyRail.previewImage': 'View generated image',
        'historyRail.regenerateSame': 'Same again',
        'historyRail.continueEdit': 'Continue edit',
        'historyRail.saveToProject': 'Save',
        'historyRail.openCollection': 'Collection',
        'historyRail.regenerateSubmitted': 'Same setup submitted',
        'historyRail.tabs.all': 'All',
        'historyRail.tabs.images': 'Images',
        'historyRail.tabs.videos': 'Videos',
        'historyRail.status.running': 'Generating',
        'historyRail.status.queued': 'Queued',
        'historyRail.status.failed': 'Failed',
        'historyRail.status.succeeded': 'Done',
        'historyRail.status.cancelled': 'Stopped',
        'historyRail.status.dismissed': 'Dismissed',
        'preview.copyPrompt': 'Copy prompt',
        'preview.reedit': 'Re-edit',
        'preview.openFullscreen': 'Open image fullscreen',
        'preview.downloadOriginal': 'Download original',
        'preview.delete': 'Delete',
        'progress.cancelQueued': 'Cancel queued task',
        'progress.cancelRunning': 'Stop running task',
        'progress.deleteFailed': 'Delete failed task',
        'progress.editTask': 'Edit task prompt',
        'progress.empty': 'No running tasks',
        'progress.thinking': 'Thinking...',
        'progress.imageProgress': '1 / 2 images returned',
        'progress.retryFailed': 'Retry failed task',
        'progress.retryMissing': 'Generate remaining images',
        'progress.acknowledgeDone': 'Confirm',
        'progress.dismissTask': 'Dismiss'
      };
      return messages[key] || key;
    }
  })
}));

vi.mock('@/shared/useVisualImageCache', () => ({
  useVisualImageCache: ({ sourceUrl }: { sourceUrl?: string | null }) =>
    sourceUrl || ''
}));

const onCancelQueuedTask = vi.fn();
const onRetryFailedTask = vi.fn();

const tasks: GenerationRecordTask[] = [
  {
    key: 'queued',
    label: 'Queued task',
    status: 'queued',
    onCancel: onCancelQueuedTask
  },
  { key: 'running', label: 'Running task', status: 'running' },
  {
    key: 'failed',
    label: 'Failed task',
    status: 'failed',
    onRetry: onRetryFailedTask
  },
  { key: 'succeeded', label: 'Succeeded task', status: 'succeeded' }
];

const historyItem: VisualImageHistoryItem = {
  id: 'history-1',
  prompt: 'A quiet desk beside a window',
  negativePrompt: '',
  imageUrl: 'https://cdn.example.com/history-1.png',
  previewUrl: 'https://cdn.example.com/history-1-preview.png',
  thumbnailUrl: 'https://cdn.example.com/history-1-thumb.png',
  createdAt: '2026-06-18T08:00:00.000Z',
  provider: 'tuzi',
  model: 'gpt-image-2',
  modelLabel: 'GPT Image',
  imageSize: '1024x1024',
  aspectRatio: '1:1',
  quality: 'high',
  outputFormat: 'png',
  requestedImageCount: 1,
  assetIds: []
};

const videoHistoryItem: VisualVideoGenerationItem = {
  generationId: 'video-history-1',
  prompt: 'A calm product reveal with slow camera movement',
  videoUrl: 'https://cdn.example.com/video-1.mp4',
  posterUrl: 'https://cdn.example.com/video-1.jpg',
  createdAt: '2026-06-18T08:03:00.000Z',
  provider: 'tuzi',
  model: 'doubao-seedance-2-0-260128',
  modelLabel: 'Seedance 2.0',
  aspectRatio: '16:9',
  duration: 5
};

function renderRail(overrides: Partial<GenerationRecordsRailProps> = {}) {
  const props = {
    tasks,
    historyItems: [historyItem],
    historyTotal: 1,
    activeGenerationId: null,
    dateLocale: 'en-US',
    onPreview: vi.fn(),
    onViewMoreHistory: vi.fn(),
    ...overrides
  };

  const view = render(<GenerationRecordsRail {...props} />);
  return { ...props, ...view };
}

describe('GenerationRecordsRail', () => {
  beforeEach(() => {
    onCancelQueuedTask.mockClear();
    onRetryFailedTask.mockClear();
  });

  it('keeps the shared media filters available', () => {
    renderRail();

    expect(
      screen.getByRole('radiogroup', { name: 'Generation records' })
    ).toBeInTheDocument();
    const filters = screen.getAllByRole('radio');
    expect(filters.map((filter) => filter.textContent?.trim())).toEqual([
      'All',
      'Images',
      'Videos'
    ]);
    expect(
      screen.queryByRole('radio', { name: /Running/ })
    ).not.toBeInTheDocument();
  });

  it('shows queued, running, failed, and succeeded task statuses', () => {
    renderRail();

    expect(screen.getByText('Queued task')).toBeInTheDocument();
    expect(screen.getByText('Queued')).toBeInTheDocument();
    expect(screen.getByText('Running task')).toBeInTheDocument();
    expect(screen.getByText('Generating')).toBeInTheDocument();
    expect(screen.getByText('Failed task')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Succeeded task')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('uses the pulse-inner colorful beam for active progress tasks', () => {
    renderRail();

    const beams = screen.getAllByTestId('progress-border-beam');

    expect(beams).toHaveLength(4);
    expect(beams[0]).toHaveAttribute('data-size', 'pulse-inner');
    expect(beams[0]).toHaveAttribute('data-color-variant', 'colorful');
    expect(beams[0]).toHaveAttribute('data-strength', '0.7');
    expect(beams[0]).toHaveAttribute('data-active', 'true');
    expect(beams[1]).toHaveAttribute('data-size', 'pulse-inner');
    expect(beams[1]).toHaveAttribute('data-strength', '0.7');
    expect(beams[1]).toHaveAttribute('data-active', 'true');
    expect(beams[2]).toHaveAttribute('data-strength', '0');
    expect(beams[2]).toHaveAttribute('data-active', 'false');
    expect(beams[3]).toHaveAttribute('data-strength', '0');
    expect(beams[3]).toHaveAttribute('data-active', 'false');
  });

  it('treats queued and running tasks as in-progress cards', () => {
    renderRail();

    const queuedTask = screen
      .getByText('Queued task')
      .closest('.creator-progress-task');
    const runningTask = screen
      .getByText('Running task')
      .closest('.creator-progress-task');
    const failedTask = screen
      .getByText('Failed task')
      .closest('.creator-progress-task');

    expect(queuedTask).toHaveClass('status-queued', 'status-processing');
    expect(runningTask).toHaveClass('status-running', 'status-processing');
    expect(failedTask).toHaveClass('status-failed');
    expect(failedTask).not.toHaveClass('status-processing');
  });

  it('renders active progress tasks as a thinking stage list', () => {
    renderRail({
      tasks: [
        {
          key: 'running',
          label: 'Generate layout templates',
          status: 'running',
          detail: 'Model is preparing the image composition',
          progress: { current: 2, total: 4 },
          progressText: '2 / 4',
          imageProgress: { current: 1, total: 2 },
          notices: [
            {
              tone: 'info',
              text: 'Keeping the batch on one channel'
            }
          ]
        }
      ]
    });

    expect(screen.getByText('Thinking...')).toBeInTheDocument();
    expect(screen.getByText('Generate layout templates')).toBeInTheDocument();
    expect(
      screen.getByText('Model is preparing the image composition')
    ).toBeInTheDocument();
    expect(screen.getByText('1 / 2 images returned')).toBeInTheDocument();
    expect(screen.getByText('2 / 4')).toBeInTheDocument();
    expect(
      screen.getByText('Keeping the batch on one channel')
    ).toBeInTheDocument();
    expect(
      document.querySelector('.creator-progress-stage-list')
    ).toBeInTheDocument();
    expect(
      document.querySelector('.creator-progress-task-meta')
    ).not.toBeInTheDocument();
  });

  it('lets users acknowledge completed progress cards', () => {
    const onAcknowledge = vi.fn();

    renderRail({
      tasks: [
        {
          key: 'succeeded',
          label: 'Succeeded task',
          status: 'succeeded',
          onAcknowledge
        }
      ]
    });

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(onAcknowledge).toHaveBeenCalledOnce();
  });

  it('lets users dismiss stopped progress cards', () => {
    const onDismiss = vi.fn();

    renderRail({
      tasks: [
        {
          key: 'cancelled',
          label: 'Stopped task',
          status: 'cancelled',
          onDismiss
        }
      ]
    });

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('lets users acknowledge partial progress cards without hiding retry', () => {
    const onAcknowledge = vi.fn();
    const onRetry = vi.fn();

    renderRail({
      tasks: [
        {
          key: 'partial',
          label: 'Some images returned',
          status: 'succeeded',
          imageProgress: { current: 1, total: 2 },
          retryLabel: 'Generate remaining images',
          onAcknowledge,
          onRetry
        }
      ]
    });

    const retryButton = screen.getByRole('button', {
      name: 'Generate remaining images'
    });
    expect(retryButton).toHaveTextContent('Generate remaining images');
    expect(retryButton).toHaveClass('creator-progress-task-primary-action');
    fireEvent.click(retryButton);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(onRetry).toHaveBeenCalledOnce();
    expect(onAcknowledge).toHaveBeenCalledOnce();
  });

  it('keeps the progress queue pinned on all and hidden on media filters', () => {
    const { container } = renderRail();
    const expectQueuePinnedAboveFeed = (visible = true) => {
      const queueTop = container.querySelector('.creator-generation-queue-top');
      const feed = container.querySelector('.creator-generation-feed');

      if (!visible) {
        expect(queueTop).toBeNull();
        return;
      }

      expect(queueTop).not.toBeNull();
      expect(queueTop?.nextElementSibling).toBe(feed);
      expect(feed?.querySelector('.creator-progress-panel')).toBeNull();
      expect(
        queueTop?.querySelector('.creator-progress-panel-head')
      ).not.toBeInTheDocument();
    };

    expectQueuePinnedAboveFeed();

    expect(screen.getByText('Queued task')).toBeInTheDocument();
    expect(screen.getByText('Failed task')).toBeInTheDocument();
    expect(
      screen.getByText('A quiet desk beside a window')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Images' }));
    expectQueuePinnedAboveFeed(false);
    expect(screen.queryByText('Queued task')).not.toBeInTheDocument();
    expect(screen.queryByText('Running task')).not.toBeInTheDocument();
    expect(screen.queryByText('Failed task')).not.toBeInTheDocument();
    expect(
      screen.getByText('A quiet desk beside a window')
    ).toBeInTheDocument();
  });

  it('filters shared history by image and video records', () => {
    renderRail({
      tasks: [],
      historyItems: [videoHistoryItem, historyItem],
      historyTotal: 2
    });

    expect(
      screen.getByText('A calm product reveal with slow camera movement')
    ).toBeInTheDocument();
    expect(
      screen.getByText('A quiet desk beside a window')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Videos' }));
    expect(
      screen.getByText('A calm product reveal with slow camera movement')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('A quiet desk beside a window')
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Images' }));
    expect(
      screen.queryByText('A calm product reveal with slow camera movement')
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('A quiet desk beside a window')
    ).toBeInTheDocument();
  });

  it('keeps existing queue actions wired inside the pinned rail queue', () => {
    renderRail();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel queued task' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry failed task' }));

    expect(onCancelQueuedTask).toHaveBeenCalledOnce();
    expect(onRetryFailedTask).toHaveBeenCalledOnce();
  });

  it('keeps failed retry/delete and queued/running cancel actions available in the pinned queue', () => {
    const onRetry = vi.fn();
    const onDelete = vi.fn();
    const onCancelQueued = vi.fn();
    const onCancelRunning = vi.fn();

    renderRail({
      tasks: [
        {
          key: 'failed',
          label: 'Failed task',
          status: 'failed',
          onRetry,
          onDelete
        },
        {
          key: 'queued',
          label: 'Queued task',
          status: 'queued',
          onCancel: onCancelQueued
        },
        {
          key: 'running',
          label: 'Running task',
          status: 'running',
          onCancel: onCancelRunning
        }
      ]
    });

    fireEvent.click(screen.getByRole('button', { name: 'Retry failed task' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete failed task' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel queued task' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop running task' }));

    expect(onRetry).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onCancelQueued).toHaveBeenCalledOnce();
    expect(onCancelRunning).toHaveBeenCalledOnce();
  });

  it('uses the pinned task queue instead of a standalone generation status', () => {
    const renderResult = renderRail({
      tasks: [
        {
          key: 'queued',
          label: 'Queued task',
          status: 'queued'
        }
      ]
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('Queued task')).toBeInTheDocument();

    renderResult.rerender(
      <GenerationRecordsRail
        tasks={[
          {
            key: 'succeeded',
            label: 'Succeeded task',
            status: 'succeeded',
            onAcknowledge: vi.fn()
          }
        ]}
        historyItems={[historyItem]}
        historyTotal={1}
        activeGenerationId={null}
        dateLocale="en-US"
        onPreview={vi.fn()}
        onViewMoreHistory={vi.fn()}
      />
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('can render a dismissed terminal task without counting it as running', () => {
    renderRail({
      tasks: [
        {
          key: 'dismissed',
          label: 'Dismissed task',
          status: 'dismissed'
        }
      ]
    });

    expect(screen.getByText('Dismissed task')).toBeInTheDocument();
    expect(screen.getByText('Dismissed')).toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: 'Running' })
    ).not.toBeInTheDocument();
  });

  it('keeps history thumbnails focused on opening preview only', () => {
    const props = renderRail();
    const media = screen.getByRole('button', { name: 'View generated image' });
    const historyCard = props.container.querySelector(
      '.creator-generation-card'
    );

    fireEvent.click(media);
    expect(props.onPreview).toHaveBeenCalledWith(historyItem);

    expect(historyCard).not.toBeNull();
    expect(historyCard?.querySelectorAll('button')).toHaveLength(1);
    expect(
      historyCard?.querySelector('.creator-generation-media-trigger')
    ).toBe(media);
    expect(
      historyCard?.querySelector('.creator-generation-actions')
    ).toBeNull();
    expect(
      historyCard?.querySelector('.creator-generation-card-actions')
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Download original' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'More' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Preview' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Re-edit' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });

  it('surfaces one download action for a generated image', () => {
    const onDownload = vi.fn();
    const props = renderRail({ onDownload });
    const downloadButton = screen.getByRole('button', {
      name: 'Download original'
    });

    expect(downloadButton).toBeInTheDocument();
    expect(
      downloadButton.closest('.creator-generation-card-actions')
    ).not.toBeNull();
    expect(downloadButton.closest('.creator-generation-media')).toBeNull();

    fireEvent.click(downloadButton);

    expect(onDownload).toHaveBeenCalledWith(historyItem);
    expect(props.onPreview).not.toHaveBeenCalled();
  });

  it('keeps successful-result actions focused on same-series, save, and download', () => {
    const onRegenerate = vi.fn();
    const onFavorite = vi.fn();
    const onDownload = vi.fn();
    const onViewMoreHistory = vi.fn();

    renderRail({
      onRegenerate,
      onFavorite,
      onDownload,
      onViewMoreHistory
    });

    fireEvent.click(screen.getByRole('button', { name: 'Same again' }));
    fireEvent.click(screen.getByRole('button', { name: '加入收藏' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download original' }));
    fireEvent.click(screen.getByRole('button', { name: 'View more' }));

    expect(
      screen.queryByRole('button', { name: 'Continue edit' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Collection' })
    ).not.toBeInTheDocument();

    expect(onRegenerate).toHaveBeenCalledWith(historyItem);
    expect(onFavorite).toHaveBeenCalledWith(historyItem);
    expect(onDownload).toHaveBeenCalledWith(historyItem);
    expect(onViewMoreHistory).toHaveBeenCalledOnce();

    const actionLabels = Array.from(
      document.querySelectorAll('.creator-generation-card-actions button')
    ).map((button) => button.textContent?.trim());
    expect(actionLabels).toEqual(['Same again', '收藏', 'Download original']);
  });
});
