import type {
  VisualImageGenerationRequest,
  VisualImageTaskListItem
} from '@/services/agent-api';
import type { GenerationRecordTask } from './GenerationRecordsRail';
import type { ImageGenerationQueueItem } from './useImageGeneration';
import { canRetryImageGenerationFailure } from '@/shared/image-generation-failure';
import {
  getImageTaskProgressViewModel,
  getImageTaskTimestampMs
} from './taskProgressViewModel';

type Translate = (key: string, options?: Record<string, unknown>) => unknown;
type FeedbackOptions = NonNullable<GenerationRecordTask['feedbackOptions']>;
type FailureFeedbackSource = 'server_task' | 'local_queue';

interface FailureFeedbackParams {
  taskId?: string;
  model?: string;
  imageSize?: string;
  quality?: string;
  referenceMode?: string;
  source: FailureFeedbackSource;
}

interface BatchProgressStats {
  total: number;
  done: number;
  failed: number;
  processing: number;
}

interface ProcessingAsset {
  title?: string;
}

interface BuildImageProgressTasksParams {
  generationQueue: ImageGenerationQueueItem[];
  imageTaskCenterTasks: VisualImageTaskListItem[];
  acknowledgedProgressTaskKeys: Set<string>;
  failureFeedbackByTaskKey: Record<string, string>;
  failureFeedbackOptions: FeedbackOptions;
  safetyFailureFeedbackOptions: FeedbackOptions;
  batchRunning: boolean;
  batchStats: BatchProgressStats;
  currentProcessingAsset?: ProcessingAsset | null;
  t: Translate;
  now?: number;
  acknowledgeProgressTask: (taskKey: string) => void;
  cancelQueuedGeneration: (id: string) => void;
  cancelServerQueuedGeneration: (
    taskId: string,
    request?: VisualImageGenerationRequest
  ) => void;
  cancelRunningGeneration: (id: string) => void;
  cancelServerRunningGeneration: (
    taskId: string,
    request?: VisualImageGenerationRequest
  ) => void;
  handleEditGenerationTask: (task: ImageGenerationQueueItem) => void;
  retryGenerationTask: (id: string) => void;
  retryServerGenerationTask: (
    taskId: string,
    request: VisualImageGenerationRequest,
    options?: { deleteOriginalFailedTask?: boolean }
  ) => void;
  dismissGenerationTask: (id: string) => void;
  deleteGenerationTask: (id: string) => Promise<void> | void;
  deleteServerGenerationTask: (taskId: string) => Promise<void> | void;
  handleFailureFeedback: (
    taskKey: string,
    reason: string,
    params: FailureFeedbackParams
  ) => void;
  removeImageTaskFromCenter: (taskId: string) => void;
  dismissImageTaskFromCenter: (taskId: string) => void;
  refreshImageTaskCenter: () => Promise<void> | void;
  setStatusText: (message: string) => void;
  trackImageGenerationEvent: (
    eventName: string,
    payload?: Record<string, unknown>
  ) => void;
}

function getFailureSignalText(
  task:
    | ImageGenerationQueueItem
    | VisualImageTaskListItem
    | (Partial<ImageGenerationQueueItem> & Partial<VisualImageTaskListItem>)
) {
  return [
    task.error,
    'progressDetail' in task ? task.progressDetail : undefined,
    'errorCategory' in task ? task.errorCategory : undefined,
    'errorCode' in task ? task.errorCode : undefined,
    'failureReason' in task ? task.failureReason : undefined,
    'currentStage' in task ? task.currentStage?.errorCategory : undefined,
    'currentStage' in task ? task.currentStage?.errorCode : undefined,
    'currentStage' in task ? task.currentStage?.errorMessage : undefined,
    'currentStage' in task ? task.currentStage?.failureReason : undefined
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
}

function isSafetyPolicyFailure(
  task:
    | ImageGenerationQueueItem
    | VisualImageTaskListItem
    | (Partial<ImageGenerationQueueItem> & Partial<VisualImageTaskListItem>)
) {
  const signalText = getFailureSignalText(task);
  return (
    signalText.includes('provider_policy') ||
    signalText.includes('safety system') ||
    signalText.includes('安全系统') ||
    signalText.includes('安全拦截')
  );
}

function getFailureFeedbackOptions(
  task: ImageGenerationQueueItem | VisualImageTaskListItem,
  failureFeedbackOptions: FeedbackOptions,
  safetyFailureFeedbackOptions: FeedbackOptions
) {
  return isSafetyPolicyFailure(task)
    ? safetyFailureFeedbackOptions
    : failureFeedbackOptions;
}

type ImageCountSource = Pick<VisualImageTaskListItem, 'request'> &
  Partial<
    Pick<
      VisualImageTaskListItem,
      | 'requestedImageCount'
      | 'actualImageCount'
      | 'imageCount'
      | 'missingImageCount'
      | 'refunded'
      | 'refundFailed'
      | 'partialRefundWarning'
      | 'batchConsistencyMode'
      | 'strictBatchConsistency'
      | 'skippedCrossChannelSupplement'
    >
  > & {
    imageUrls?: string[];
    status?: GenerationRecordTask['status'];
  };

function tr(
  translate: Translate,
  key: string,
  options?: Record<string, unknown>
): string {
  return String(translate(key, options));
}

export function getRequestedImageTaskCount(source: ImageCountSource) {
  const requested =
    typeof source.requestedImageCount === 'number'
      ? source.requestedImageCount
      : typeof source.request.imageCount === 'number'
        ? source.request.imageCount
        : typeof source.imageCount === 'number'
          ? source.imageCount
          : undefined;
  return requested && requested > 0 ? Math.floor(requested) : undefined;
}

export function getActualImageTaskCount(
  source: Pick<
    ImageCountSource,
    'actualImageCount' | 'imageCount' | 'imageUrls'
  >
) {
  const actual =
    typeof source.actualImageCount === 'number'
      ? source.actualImageCount
      : typeof source.imageCount === 'number'
        ? source.imageCount
        : Array.isArray(source.imageUrls)
          ? source.imageUrls.length
          : undefined;
  return typeof actual === 'number' && actual >= 0
    ? Math.floor(actual)
    : undefined;
}

export function getMissingImageTaskCount(source: ImageCountSource) {
  if (
    typeof source.missingImageCount === 'number' &&
    source.missingImageCount > 0
  ) {
    return Math.floor(source.missingImageCount);
  }
  const total = getRequestedImageTaskCount(source);
  const actual = getActualImageTaskCount(source);
  if (!total || typeof actual !== 'number' || actual <= 0 || actual >= total) {
    return 0;
  }
  return total - actual;
}

function getPartialSucceededDetail(
  source: ImageCountSource,
  translate: Translate
) {
  return tr(translate, 'progress.detailPartialSucceeded', {
    done: getActualImageTaskCount(source),
    total: getRequestedImageTaskCount(source),
    missing: getMissingImageTaskCount(source)
  });
}

function getImageProgress(source: ImageCountSource) {
  const total = getRequestedImageTaskCount(source);
  if (!total || total <= 1) return undefined;
  return {
    total,
    current: getActualImageTaskCount(source)
  };
}

function getBatchNotices(
  source: ImageCountSource,
  translate: Translate
): GenerationRecordTask['notices'] {
  const total = getRequestedImageTaskCount(source);
  const actual = getActualImageTaskCount(source);
  const notices: GenerationRecordTask['notices'] = [];
  const isMultiImage = Boolean(total && total > 1);
  const isPartial =
    isMultiImage &&
    typeof actual === 'number' &&
    actual > 0 &&
    actual < (total as number);
  const hasStrictBatch =
    source.strictBatchConsistency ||
    source.batchConsistencyMode === 'strict' ||
    source.skippedCrossChannelSupplement ||
    isPartial;

  if (
    isMultiImage &&
    (source.status === 'queued' || source.status === 'running')
  ) {
    notices.push({
      tone: 'info',
      text: tr(translate, 'progress.strictBatchPending')
    });
  }

  if (hasStrictBatch && (isPartial || source.skippedCrossChannelSupplement)) {
    notices.push({
      tone: 'warning',
      text: tr(translate, 'progress.strictBatchPartial')
    });
  }

  if (isPartial) {
    if (source.refundFailed) {
      notices.push({
        tone: 'warning',
        text: tr(translate, 'progress.partialRefundFailed', {
          done: actual,
          total
        })
      });
    } else if (typeof source.refunded === 'number' && source.refunded > 0) {
      notices.push({
        tone: 'success',
        text: tr(translate, 'progress.partialRefunded', {
          done: actual,
          total,
          credits: source.refunded
        })
      });
    } else {
      notices.push({
        tone: 'success',
        text: tr(translate, 'progress.partialRefundedNoAmount', {
          done: actual,
          total
        })
      });
    }
  }

  return notices.length > 0 ? notices : undefined;
}

function isActiveImageTaskStatus(
  status: ImageGenerationQueueItem['status'] | VisualImageTaskListItem['status']
) {
  return status === 'queued' || status === 'running';
}

function buildActiveMissingImageRetryState(
  generationQueue: ImageGenerationQueueItem[],
  imageTaskCenterTasks: VisualImageTaskListItem[]
) {
  const activeRetryTaskIds = new Set<string>();
  const activeRetrySourceTaskIds = new Set<string>();

  imageTaskCenterTasks.forEach((task) => {
    if (!isActiveImageTaskStatus(task.status)) return;
    activeRetryTaskIds.add(task.taskId);
    if (task.retryOfTaskId) {
      activeRetrySourceTaskIds.add(task.retryOfTaskId);
    }
  });

  generationQueue.forEach((task) => {
    if (!isActiveImageTaskStatus(task.status)) return;
    if (task.serverTaskId) {
      activeRetryTaskIds.add(task.serverTaskId);
    }
    if (task.retryOfTaskId) {
      activeRetrySourceTaskIds.add(task.retryOfTaskId);
    }
  });

  return { activeRetryTaskIds, activeRetrySourceTaskIds };
}

function isPartialTaskSupersededByActiveRetry(
  sourceTaskId: string | undefined,
  retryTaskId: string | undefined,
  activeRetryTaskIds: Set<string>,
  activeRetrySourceTaskIds: Set<string>
) {
  return Boolean(
    (sourceTaskId && activeRetrySourceTaskIds.has(sourceTaskId)) ||
    (retryTaskId && activeRetryTaskIds.has(retryTaskId))
  );
}

function getServerTaskDetail(
  task: VisualImageTaskListItem,
  localTask: ImageGenerationQueueItem | undefined,
  translate: Translate
) {
  return getImageTaskProgressViewModel({
    task,
    translate,
    fallbackDetail:
      task.status === 'succeeded' ? undefined : localTask?.progressDetail
  }).detail;
}

function serverTaskToQueueItem(
  task: VisualImageTaskListItem,
  localTask: ImageGenerationQueueItem | undefined,
  translate: Translate,
  now: number
): ImageGenerationQueueItem {
  return {
    id: localTask?.id || task.taskId,
    serverTaskId: task.taskId,
    request: task.request,
    status: task.status,
    createdAt:
      localTask?.createdAt || getImageTaskTimestampMs(task.createdAt) || now,
    startedAt: localTask?.startedAt || getImageTaskTimestampMs(task.startedAt),
    progressDetail: getServerTaskDetail(task, localTask, translate),
    error: task.status === 'failed' ? task.error : localTask?.error,
    imageCount: task.imageCount,
    requestedImageCount: task.requestedImageCount,
    actualImageCount: task.actualImageCount,
    refunded: task.refunded,
    refundFailed: task.refundFailed,
    partialRefundWarning: task.partialRefundWarning,
    batchConsistencyMode: task.batchConsistencyMode,
    strictBatchConsistency: task.strictBatchConsistency,
    skippedCrossChannelSupplement: task.skippedCrossChannelSupplement,
    currentStage: task.currentStage,
    cancelledTaskStatus: task.cancelledTaskStatus,
    interruptMode: task.interruptMode
  };
}

export function buildImageProgressTasks({
  generationQueue,
  imageTaskCenterTasks,
  acknowledgedProgressTaskKeys,
  failureFeedbackByTaskKey,
  failureFeedbackOptions,
  safetyFailureFeedbackOptions,
  batchRunning,
  batchStats,
  currentProcessingAsset,
  t,
  now = Date.now(),
  acknowledgeProgressTask,
  cancelQueuedGeneration,
  cancelServerQueuedGeneration,
  cancelRunningGeneration,
  cancelServerRunningGeneration,
  handleEditGenerationTask,
  retryGenerationTask,
  retryServerGenerationTask,
  dismissGenerationTask,
  deleteGenerationTask,
  deleteServerGenerationTask,
  handleFailureFeedback,
  removeImageTaskFromCenter,
  dismissImageTaskFromCenter,
  refreshImageTaskCenter,
  setStatusText,
  trackImageGenerationEvent
}: BuildImageProgressTasksParams): GenerationRecordTask[] {
  const tasks: GenerationRecordTask[] = [];
  const recentTerminalTaskWindowMs = 2 * 60 * 1000;
  const localByServerTaskId = new Map(
    generationQueue
      .filter((task) => task.serverTaskId)
      .map((task) => [task.serverTaskId as string, task])
  );
  const serverTaskIds = new Set(
    imageTaskCenterTasks.map((task) => task.taskId)
  );
  const { activeRetryTaskIds, activeRetrySourceTaskIds } =
    buildActiveMissingImageRetryState(generationQueue, imageTaskCenterTasks);

  imageTaskCenterTasks.forEach((serverTask) => {
    const localTask = localByServerTaskId.get(serverTask.taskId);
    const queueItem = serverTaskToQueueItem(serverTask, localTask, t, now);
    const taskView = getImageTaskProgressViewModel({
      task: serverTask,
      translate: t,
      fallbackDetail:
        serverTask.status === 'succeeded'
          ? undefined
          : localTask?.progressDetail
    });
    const taskKey = `image-server-${serverTask.taskId}`;
    const missingImageCount = getMissingImageTaskCount(serverTask);
    const canRetryMissingImages =
      serverTask.status === 'succeeded' &&
      Boolean(serverTask.canRetryMissingImages) &&
      missingImageCount > 0;
    const isSupersededPartial =
      canRetryMissingImages &&
      isPartialTaskSupersededByActiveRetry(
        serverTask.taskId,
        serverTask.missingImageRetryTaskId,
        activeRetryTaskIds,
        activeRetrySourceTaskIds
      );
    const canDismissServerTask = serverTask.status === 'cancelled';
    const canRetryFailedServerTask =
      serverTask.status === 'failed' &&
      canRetryImageGenerationFailure(serverTask);
    if (isSupersededPartial) {
      return;
    }
    if (
      serverTask.status === 'succeeded' &&
      acknowledgedProgressTaskKeys.has(taskKey)
    ) {
      return;
    }

    tasks.push({
      key: taskKey,
      sessionId: serverTask.request.creationContext?.sessionId,
      generationIds: localTask?.generationIds?.filter((id): id is string =>
        Boolean(id)
      ),
      prompt: serverTask.request.prompt,
      modelLabel: serverTask.currentStage?.model || serverTask.request.model,
      aspectRatio: serverTask.request.aspectRatio,
      imageCount:
        serverTask.requestedImageCount || serverTask.request.imageCount || 1,
      label: taskView.label,
      status: taskView.status,
      detail: taskView.detail,
      imageProgress: getImageProgress(serverTask),
      notices: getBatchNotices(
        {
          ...serverTask,
          status: taskView.status
        },
        t
      ),
      feedbackOptions:
        serverTask.status === 'failed'
          ? getFailureFeedbackOptions(
              serverTask,
              failureFeedbackOptions,
              safetyFailureFeedbackOptions
            )
          : undefined,
      feedbackSubmitted: failureFeedbackByTaskKey[taskKey],
      onFeedback:
        serverTask.status === 'failed'
          ? (reason) =>
              handleFailureFeedback(taskKey, reason, {
                taskId: serverTask.taskId,
                model: serverTask.request.model,
                imageSize: serverTask.request.imageSize,
                quality: serverTask.request.quality,
                referenceMode: serverTask.request.referenceMode,
                source: 'server_task'
              })
          : undefined,
      onCancel:
        serverTask.status === 'queued'
          ? () =>
              cancelServerQueuedGeneration(
                serverTask.taskId,
                serverTask.request
              )
          : serverTask.status === 'running'
            ? () =>
                cancelServerRunningGeneration(
                  serverTask.taskId,
                  serverTask.request
                )
            : undefined,
      onEdit:
        serverTask.status === 'queued' ||
        serverTask.status === 'running' ||
        serverTask.status === 'failed' ||
        canRetryMissingImages
          ? () => handleEditGenerationTask(queueItem)
          : undefined,
      retryLabel: canRetryMissingImages
        ? tr(t, 'progress.retryMissing')
        : undefined,
      acknowledgeLabel:
        serverTask.status === 'succeeded'
          ? tr(t, 'progress.acknowledgeDone')
          : undefined,
      onAcknowledge:
        serverTask.status === 'succeeded'
          ? () => {
              acknowledgeProgressTask(taskKey);
              if (localTask) {
                acknowledgeProgressTask('image-' + localTask.id);
              }
            }
          : undefined,
      dismissLabel: canDismissServerTask
        ? tr(t, 'progress.dismissTask')
        : undefined,
      onDismiss: canDismissServerTask
        ? () => {
            dismissImageTaskFromCenter(serverTask.taskId);
            dismissGenerationTask(localTask?.id || serverTask.taskId);
          }
        : undefined,
      onRetry:
        canRetryFailedServerTask || canRetryMissingImages
          ? () => {
              trackImageGenerationEvent('retry_click', {
                task_key: taskKey,
                task_id: serverTask.taskId,
                model: serverTask.request.model,
                image_size: serverTask.request.imageSize,
                quality: serverTask.request.quality,
                source: canRetryMissingImages
                  ? 'server_task_partial_missing'
                  : 'server_task'
              });
              retryServerGenerationTask(
                serverTask.taskId,
                canRetryMissingImages
                  ? {
                      ...serverTask.request,
                      imageCount: missingImageCount
                    }
                  : serverTask.request,
                canRetryMissingImages
                  ? { deleteOriginalFailedTask: false }
                  : undefined
              );
            }
          : undefined,
      onDelete:
        serverTask.status === 'failed'
          ? () => {
              removeImageTaskFromCenter(serverTask.taskId);
              void Promise.resolve(
                deleteServerGenerationTask(serverTask.taskId)
              )
                .catch((deleteError) => {
                  setStatusText(
                    deleteError instanceof Error
                      ? deleteError.message
                      : tr(t, 'progress.deleteFailed')
                  );
                })
                .finally(() => {
                  void refreshImageTaskCenter();
                });
            }
          : undefined
    });
  });

  const activeImageTasks = generationQueue.filter((task) => {
    if (task.serverTaskId && serverTaskIds.has(task.serverTaskId)) {
      return false;
    }
    const taskKey = `image-${task.id}`;
    if (
      task.status === 'succeeded' &&
      acknowledgedProgressTaskKeys.has(taskKey)
    ) {
      return false;
    }
    return (
      task.status === 'queued' ||
      task.status === 'running' ||
      task.status === 'failed' ||
      ((task.status === 'succeeded' || task.status === 'cancelled') &&
        Boolean(task.finishedAt) &&
        now - (task.finishedAt || 0) <= recentTerminalTaskWindowMs)
    );
  });
  let queuedIndex = 0;
  activeImageTasks.forEach((task) => {
    if (task.status === 'queued') queuedIndex += 1;
    const taskKey = `image-${task.id}`;
    const taskStatus =
      task.status === 'running'
        ? 'running'
        : task.status === 'failed'
          ? 'failed'
          : task.status === 'succeeded'
            ? 'succeeded'
            : task.status === 'cancelled'
              ? 'cancelled'
              : 'queued';
    const missingImageCount = getMissingImageTaskCount(task);
    const canRetryMissingImages =
      task.status === 'succeeded' &&
      Boolean(task.serverTaskId) &&
      missingImageCount > 0;
    const canRetryFailedLocalTask =
      task.status === 'failed' && canRetryImageGenerationFailure(task);
    if (
      canRetryMissingImages &&
      isPartialTaskSupersededByActiveRetry(
        task.serverTaskId,
        undefined,
        activeRetryTaskIds,
        activeRetrySourceTaskIds
      )
    ) {
      return;
    }

    tasks.push({
      key: taskKey,
      sessionId: task.request.creationContext?.sessionId,
      generationIds: task.generationIds?.filter((id): id is string =>
        Boolean(id)
      ),
      prompt: task.request.prompt,
      modelLabel: task.request.model,
      aspectRatio: task.request.aspectRatio,
      imageCount: task.request.imageCount || 1,
      label:
        task.status === 'running'
          ? tr(t, 'progress.taskMainGen')
          : task.status === 'failed'
            ? tr(t, 'progress.taskFailed')
            : task.status === 'succeeded'
              ? canRetryMissingImages
                ? tr(t, 'progress.taskPartialSucceeded')
                : tr(t, 'progress.taskSucceeded')
              : task.status === 'cancelled'
                ? tr(t, 'progress.taskCancelled')
                : tr(t, 'progress.taskQueued'),
      status: taskStatus,
      detail:
        task.status === 'running'
          ? task.progressDetail || task.request.model
          : task.status === 'failed'
            ? task.error || task.progressDetail || task.request.model
            : task.status === 'succeeded'
              ? canRetryMissingImages
                ? getPartialSucceededDetail(task, t)
                : task.progressDetail || task.request.model
              : task.status === 'cancelled'
                ? task.progressDetail || task.request.model
                : tr(t, 'progress.queuePosition', { n: queuedIndex }),
      imageProgress: getImageProgress(task),
      notices: getBatchNotices(
        {
          ...task,
          status: taskStatus
        },
        t
      ),
      feedbackOptions:
        task.status === 'failed'
          ? getFailureFeedbackOptions(
              task,
              failureFeedbackOptions,
              safetyFailureFeedbackOptions
            )
          : undefined,
      feedbackSubmitted: failureFeedbackByTaskKey[taskKey],
      onFeedback:
        task.status === 'failed'
          ? (reason) =>
              handleFailureFeedback(taskKey, reason, {
                taskId: task.serverTaskId,
                model: task.request.model,
                imageSize: task.request.imageSize,
                quality: task.request.quality,
                referenceMode: task.request.referenceMode,
                source: 'local_queue'
              })
          : undefined,
      onCancel:
        task.status === 'queued'
          ? () => cancelQueuedGeneration(task.id)
          : task.status === 'running'
            ? () => cancelRunningGeneration(task.id)
            : undefined,
      onEdit:
        task.status === 'queued' ||
        task.status === 'running' ||
        task.status === 'failed' ||
        canRetryMissingImages
          ? () => handleEditGenerationTask(task)
          : undefined,
      retryLabel: canRetryMissingImages
        ? tr(t, 'progress.retryMissing')
        : undefined,
      acknowledgeLabel:
        task.status === 'succeeded'
          ? tr(t, 'progress.acknowledgeDone')
          : undefined,
      onAcknowledge:
        task.status === 'succeeded'
          ? () => acknowledgeProgressTask(taskKey)
          : undefined,
      dismissLabel:
        task.status === 'cancelled' ? tr(t, 'progress.dismissTask') : undefined,
      onDismiss:
        task.status === 'cancelled'
          ? () => dismissGenerationTask(task.id)
          : undefined,
      onRetry:
        canRetryFailedLocalTask || canRetryMissingImages
          ? () => {
              trackImageGenerationEvent('retry_click', {
                task_key: taskKey,
                task_id: task.serverTaskId,
                model: task.request.model,
                image_size: task.request.imageSize,
                quality: task.request.quality,
                source: canRetryMissingImages
                  ? 'local_queue_partial_missing'
                  : 'local_queue'
              });
              if (canRetryMissingImages && task.serverTaskId) {
                retryServerGenerationTask(
                  task.serverTaskId,
                  {
                    ...task.request,
                    imageCount: missingImageCount
                  },
                  { deleteOriginalFailedTask: false }
                );
                return;
              }
              retryGenerationTask(task.id);
            }
          : undefined,
      onDelete:
        task.status === 'failed'
          ? () => {
              void Promise.resolve(deleteGenerationTask(task.id)).catch(
                (deleteError) => {
                  setStatusText(
                    deleteError instanceof Error
                      ? deleteError.message
                      : tr(t, 'progress.deleteFailed')
                  );
                }
              );
            }
          : undefined
    });
  });

  if (batchRunning) {
    const isSingle = batchStats.total === 1;
    tasks.push({
      key: 'batch',
      label: isSingle
        ? tr(t, 'progress.taskRegen')
        : tr(t, 'progress.taskBatch'),
      status: 'running',
      progress: isSingle
        ? undefined
        : {
            current:
              batchStats.done + batchStats.failed + batchStats.processing,
            total: batchStats.total
          },
      detail: currentProcessingAsset?.title || undefined
    });
  } else if (batchStats.failed > 0 && batchStats.total > 0) {
    tasks.push({
      key: 'batch-failed',
      label: tr(t, 'progress.allFailedHint', { n: batchStats.failed }),
      status: 'failed'
    });
  }

  return tasks;
}
