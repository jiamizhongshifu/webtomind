import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GenerationProgressPanel } from '../GenerationProgressPanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'progress.title': 'AI tasks',
        'progress.collapse': 'Collapse',
        'progress.expand': 'Expand',
        'progress.empty': 'No tasks',
        'progress.feedback.title': 'What hurt this failed run most?',
        'progress.feedback.thanks': 'Feedback received',
        'progress.retryFailed': 'Retry failed task',
        'progress.deleteFailed': 'Delete failed task',
        'progress.cancelQueued': 'Cancel queued task',
        'progress.cancelRunning': 'Stop running task',
        'progress.editTask': 'Edit task prompt',
        'progress.viewTaskPrompt': 'View task prompt',
        'progress.retryMissing': 'Generate remaining images',
        'progress.acknowledgeDone': 'Confirm',
        'progress.dismissTask': 'Dismiss',
        'progress.imageProgress': '1 / 2 images returned',
        'progress.imageTarget': 'Target 2 images'
      })[key] || key
  })
}));

describe('GenerationProgressPanel', () => {
  it('submits failure feedback from failed tasks', () => {
    const onFeedback = vi.fn();

    render(
      <GenerationProgressPanel
        embedded
        tasks={[
          {
            key: 'image-failed',
            label: 'Image task failed',
            status: 'failed',
            detail: 'provider timeout',
            feedbackOptions: [{ id: 'quality_low', label: 'Unstable quality' }],
            onFeedback
          }
        ]}
      />
    );

    expect(
      screen.getByText('What hurt this failed run most?')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Unstable quality' }));

    expect(onFeedback).toHaveBeenCalledWith('quality_low');
  });

  it('shows received state after feedback was submitted', () => {
    render(
      <GenerationProgressPanel
        embedded
        tasks={[
          {
            key: 'image-failed',
            label: 'Image task failed',
            status: 'failed',
            feedbackOptions: [{ id: 'quality_low', label: 'Unstable quality' }],
            feedbackSubmitted: 'quality_low',
            onFeedback: vi.fn()
          }
        ]}
      />
    );

    expect(screen.getByText('Feedback received')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Unstable quality' })
    ).not.toBeInTheDocument();
  });

  it('uses the running cancel label for processing tasks', () => {
    const onCancel = vi.fn();

    render(
      <GenerationProgressPanel
        embedded
        tasks={[
          {
            key: 'image-running',
            label: 'Generating image',
            status: 'processing',
            onCancel
          }
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Stop running task' }));

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('lets users dismiss stopped tasks', () => {
    const onDismiss = vi.fn();

    render(
      <GenerationProgressPanel
        embedded
        tasks={[
          {
            key: 'image-cancelled',
            label: 'Stopped image task',
            status: 'cancelled',
            onDismiss
          }
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('shows image count and consistency notices for multi-image tasks', () => {
    render(
      <GenerationProgressPanel
        embedded
        tasks={[
          {
            key: 'image-partial',
            label: 'Image returned',
            status: 'succeeded',
            imageProgress: { current: 1, total: 2 },
            notices: [
              {
                tone: 'warning',
                text: 'To keep this batch consistent, no cross-channel refill was used'
              },
              {
                tone: 'success',
                text: '1/2 completed. Missing images refunded 100 credits'
              }
            ]
          }
        ]}
      />
    );

    expect(screen.getByText('1 / 2 images returned')).toBeInTheDocument();
    expect(
      screen.getByText(
        'To keep this batch consistent, no cross-channel refill was used'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText('1/2 completed. Missing images refunded 100 credits')
    ).toBeInTheDocument();
  });

  it('uses retry and acknowledge actions for partial image tasks', () => {
    const onRetry = vi.fn();
    const onAcknowledge = vi.fn();

    render(
      <GenerationProgressPanel
        embedded
        tasks={[
          {
            key: 'image-partial',
            label: 'Some images returned',
            status: 'succeeded',
            imageProgress: { current: 1, total: 2 },
            retryLabel: 'Generate remaining images',
            onRetry,
            onAcknowledge
          }
        ]}
      />
    );

    const retryButton = screen.getByRole('button', {
      name: 'Generate remaining images'
    });
    expect(retryButton).toHaveTextContent('Generate remaining images');
    expect(retryButton).toHaveClass('creator-progress-task-primary-action');
    fireEvent.click(retryButton);

    expect(onRetry).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(onAcknowledge).toHaveBeenCalledOnce();
  });

  it('lets users acknowledge completed task prompts', () => {
    const onAcknowledge = vi.fn();

    render(
      <GenerationProgressPanel
        embedded
        tasks={[
          {
            key: 'image-success',
            label: 'Image returned',
            status: 'succeeded',
            onAcknowledge
          }
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(onAcknowledge).toHaveBeenCalledOnce();
  });

  it('can render only task cards without the progress panel heading', () => {
    const { container } = render(
      <GenerationProgressPanel
        embedded
        showHeader={false}
        tasks={[
          {
            key: 'image-running',
            label: 'Generating image',
            status: 'processing'
          }
        ]}
      />
    );

    expect(
      container.querySelector('.creator-progress-panel-head')
    ).not.toBeInTheDocument();
    expect(container.querySelector('.creator-progress-task')).toHaveTextContent(
      'Generating image'
    );
  });
});
