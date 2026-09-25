import type { VisualImageTaskListItem } from '@/services/agent-api';

type Translate = (key: string, options?: Record<string, unknown>) => unknown;

export interface TaskProgressViewModel {
  label: string;
  status:
    | 'queued'
    | 'running'
    | 'succeeded'
    | 'failed'
    | 'cancelled'
    | 'dismissed';
  detail: string;
}

export function getImageTaskTimestampMs(
  value?: string | null
): number | undefined {
  if (!value) return undefined;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function getImageTaskProgressViewModel({
  task,
  translate,
  fallbackDetail,
  dismissed = false,
  now = Date.now()
}: {
  task: VisualImageTaskListItem;
  translate: Translate;
  fallbackDetail?: string;
  dismissed?: boolean;
  now?: number;
}): TaskProgressViewModel {
  const tr = (key: string, options?: Record<string, unknown>) =>
    String(translate(key, options));

  if (dismissed) {
    return {
      label: tr('progress.taskDismissed'),
      status: 'dismissed',
      detail: fallbackDetail || tr('progress.detailDismissed')
    };
  }

  const getPartialDetail = () => {
    const requested =
      typeof task.requestedImageCount === 'number'
        ? task.requestedImageCount
        : task.request.imageCount;
    const actual =
      typeof task.actualImageCount === 'number'
        ? task.actualImageCount
        : task.imageCount;
    const missing =
      typeof task.missingImageCount === 'number'
        ? task.missingImageCount
        : typeof requested === 'number' &&
            typeof actual === 'number' &&
            actual > 0 &&
            actual < requested
          ? requested - actual
          : undefined;

    return tr('progress.detailPartialSucceeded', {
      done: actual,
      total: requested,
      missing
    });
  };

  if (task.status === 'queued') {
    return {
      label: tr('progress.taskQueued'),
      status: 'queued',
      detail: task.queuePosition
        ? tr('progress.queuePosition', { n: task.queuePosition })
        : tr('progress.detailSubmitted')
    };
  }

  if (task.status === 'failed') {
    const failureCategory =
      task.errorCategory || task.currentStage?.errorCategory;
    if (
      failureCategory === 'provider_unavailable' ||
      failureCategory === 'provider_rate_limit' ||
      failureCategory === 'provider_timeout'
    ) {
      return {
        label: tr('progress.taskFailed'),
        status: 'failed',
        detail: tr('errors.providerUnavailable')
      };
    }
    return {
      label: tr('progress.taskFailed'),
      status: 'failed',
      detail: fallbackDetail || task.error || tr('errors.generateFailed')
    };
  }

  if (task.status === 'cancelled') {
    return {
      label: tr('progress.taskCancelled'),
      status: 'cancelled',
      detail:
        task.cancelledTaskStatus === 'queued'
          ? tr('progress.cancelledQueued')
          : tr('progress.cancelledRunning')
    };
  }

  if (task.status === 'succeeded') {
    const requested =
      typeof task.requestedImageCount === 'number'
        ? task.requestedImageCount
        : task.request.imageCount;
    const actual =
      typeof task.actualImageCount === 'number'
        ? task.actualImageCount
        : task.imageCount;
    const isPartial =
      typeof requested === 'number' &&
      typeof actual === 'number' &&
      actual > 0 &&
      actual < requested;
    return {
      label: isPartial
        ? tr('progress.taskPartialSucceeded')
        : tr('progress.taskSucceeded'),
      status: 'succeeded',
      detail:
        fallbackDetail ||
        (isPartial ? getPartialDetail() : tr('progress.detailDone'))
    };
  }

  const startedAt =
    getImageTaskTimestampMs(task.startedAt) ||
    getImageTaskTimestampMs(task.createdAt) ||
    now;
  const elapsedSeconds = Math.floor(Math.max(0, now - startedAt) / 1000);
  let detail = tr('progress.detailSubmitted');
  if (elapsedSeconds >= 180) {
    detail = tr('progress.detailFinalizing', {
      seconds: elapsedSeconds
    });
  } else if (elapsedSeconds >= 60) {
    detail = tr('progress.detailGenerating', {
      seconds: elapsedSeconds
    });
  } else if (elapsedSeconds >= 8) {
    detail = tr('progress.detailWaitingModel', {
      seconds: elapsedSeconds
    });
  }

  return {
    label: tr('progress.taskMainGen'),
    status: 'running',
    detail: fallbackDetail || detail
  };
}
