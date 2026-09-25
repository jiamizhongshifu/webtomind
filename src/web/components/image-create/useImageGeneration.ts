/**
 * 视觉图片生成:提交生成请求 + 结果态 + 历史列表。
 *
 * - isGenerating / resultImageUrl / activeGenerationId:当前一次生成的进行态与结果
 * - generationHistory:最近 12 条历史(登录后 mount 拉取,生成完成后延迟刷新)
 * - generationQueue:用户连续发起的生图队列,未开始的任务可取消
 * - handleGenerate:按 promptMode 冻结当前 prompt / settings 快照并入队;
 *   队列 worker 串行调用 generateVisualImage,成功写结果 + 状态文案
 *   (含 fallback / 退款提示),失败写 error,完成派发 credits-changed 并延迟刷新历史
 *
 * 从 ImageCreatePage 抽出。compiled / settings / promptMode / customPromptText
 * 由页面(composer 态)传入;跨域副作用(error/status)通过 setter 上抛。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import {
  cancelVisualImageTask,
  deleteFailedVisualImageTask,
  deleteVisualImageHistoryItem,
  enqueueVisualImageTask,
  generateVisualImage,
  getVisualImageHistoryResult,
  getVisualImageTaskSnapshot,
  retryVisualImageTask,
  VisualImageGenerationError,
  waitForVisualImageTask,
  type VisualImageGenerationResult,
  type VisualImageGenerationRequest,
  type VisualImageHistoryItem,
  type VisualImageTaskCancelResult,
  type VisualImageTaskListItem,
  type VisualImageTaskStage
} from '@/services/agent-api';
import { getImageTaskProgressViewModel } from './taskProgressViewModel';
import { canRetryImageGenerationFailure } from '@/shared/image-generation-failure';
import {
  playGenerationCompleteSound,
  playGenerationFailedSound,
  primeGenerationCompleteSound
} from './generationCompleteSound';
import { trackImageGenerationEvent } from '../../lib/analytics';
import type { ImageCharacterReferenceGroup } from '@/shared/image-reference-types';
import type { ImagePromptRecipeAudit } from '@/shared/image-prompt-recipe-audit';
import type { ImageCreationContext } from '@/shared/create-workspace-v2';
import type {
  ImagePromptAsset,
  ImagePromptSettings
} from '../../data/image-prompt-core';

interface CompiledPrompt {
  prompt: string;
  negativePrompt: string;
  selectedAssets: ImagePromptAsset[];
  warnings: string[];
}

export interface UseImageGenerationParams {
  isAuthenticated: boolean;
  onRequireLogin: () => void;
  settings: ImagePromptSettings;
  promptMode: 'composed' | 'custom';
  customPromptText: string;
  customNegativePromptText: string;
  selectedReferenceIds: string[];
  selectedCharacterCardIds?: string[];
  characterReferenceGroups?: ImageCharacterReferenceGroup[];
  compiled: CompiledPrompt;
  recipeAssetIds?: string[];
  recipeAudit?: ImagePromptRecipeAudit;
  creationContext?: ImageCreationContext;
  setError: (message: string) => void;
  setStatusText: (message: string) => void;
  trackingSource?: string;
  trackingEntryPath?: string;
  onCreditBlocked?: (message: string) => void;
  onGenerationSuccess?: (params: {
    result: VisualImageGenerationResult;
    request: VisualImageGenerationRequest;
    taskId?: string;
  }) => void;
  onGenerationFailure?: (params: {
    error: unknown;
    message: string;
    request: VisualImageGenerationRequest;
    taskId?: string;
  }) => void;
}

export type ImageGenerationQueueStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface ImageGenerationQueueItem {
  id: string;
  serverTaskId?: string;
  /** Local-only placeholder while the enqueue request is still in flight. */
  clientSubmissionPending?: boolean;
  request: VisualImageGenerationRequest;
  status: ImageGenerationQueueStatus;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  progressDetail?: string;
  imageUrl?: string;
  imageUrls?: string[];
  imageCount?: number;
  requestedImageCount?: number;
  actualImageCount?: number;
  refunded?: number;
  refundFailed?: boolean;
  partialRefundWarning?: string;
  batchConsistencyMode?: string;
  strictBatchConsistency?: boolean;
  skippedCrossChannelSupplement?: boolean;
  currentStage?: VisualImageTaskStage;
  cancelledTaskStatus?: 'queued' | 'running' | 'cancelled';
  interruptMode?: 'queue' | 'soft';
  generationId?: string | null;
  generationIds?: Array<string | null>;
  error?: string;
  errorCategory?: string;
  errorCode?: string;
  retryable?: boolean;
  creditWaived?: boolean;
  retryOfTaskId?: string;
}

export interface ImageGenerateOverrides {
  promptOverride?: string;
  negativePromptOverride?: string;
  creationContextOverride?: ImageCreationContext;
}

const GENERATION_QUEUE_STORAGE_KEY = 'webtomind_image_generation_queue_v1';
const GENERATION_QUEUE_STORAGE_TTL_MS = 12 * 60 * 60 * 1000;
const RECENT_GENERATION_HISTORY_LIMIT = 12;
const ACTIVE_TASK_SYNC_INTERVAL_MS = 10 * 1000;
const IDLE_TASK_SYNC_INTERVAL_MS = 45 * 1000;
const MAX_IDLE_TASK_SYNC_INTERVAL_MS = 90 * 1000;

function canUseGenerationQueueStorage(): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function isRestorableGenerationTask(
  item: ImageGenerationQueueItem,
  now = Date.now()
): boolean {
  if (item.clientSubmissionPending) return false;
  const authFailureText = `${item.error || ''} ${item.progressDetail || ''}`;
  if (/请先登录|未登录|login/i.test(authFailureText)) {
    return false;
  }
  if (now - item.createdAt >= GENERATION_QUEUE_STORAGE_TTL_MS) {
    return false;
  }
  if (item.status === 'queued') {
    return true;
  }
  return Boolean(item.serverTaskId) && item.status === 'running';
}

function readPersistedGenerationQueue(): ImageGenerationQueueItem[] {
  if (!canUseGenerationQueueStorage()) return [];
  try {
    const raw = window.localStorage.getItem(GENERATION_QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ImageGenerationQueueItem[];
    if (!Array.isArray(parsed)) return [];
    const restorable = parsed.filter((item) =>
      isRestorableGenerationTask(item)
    );
    if (restorable.length !== parsed.length) {
      if (restorable.length === 0) {
        window.localStorage.removeItem(GENERATION_QUEUE_STORAGE_KEY);
      } else {
        window.localStorage.setItem(
          GENERATION_QUEUE_STORAGE_KEY,
          JSON.stringify(restorable)
        );
      }
    }
    return restorable;
  } catch {
    return [];
  }
}

function writePersistedGenerationQueue(
  queue: ImageGenerationQueueItem[]
): void {
  if (!canUseGenerationQueueStorage()) return;
  try {
    const active = queue.filter((item) => isRestorableGenerationTask(item));
    if (active.length === 0) {
      window.localStorage.removeItem(GENERATION_QUEUE_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      GENERATION_QUEUE_STORAGE_KEY,
      JSON.stringify(active)
    );
  } catch {
    // 进度缓存只是刷新恢复辅助,写失败不影响生图主流程。
  }
}

function getFriendlyGenerationErrorMessage(
  error: unknown,
  fallback: string,
  t: TFunction<'imageCreate'>
): string {
  if (!(error instanceof VisualImageGenerationError)) {
    return error instanceof Error ? error.message : fallback;
  }

  const category = error.errorDetails?.category;
  if (category === 'pipeline_deadline') {
    return t('errors.pipelineDeadline') as string;
  }
  if (category === 'provider_policy') {
    return t('errors.providerPolicy') as string;
  }
  if (
    category === 'provider_unavailable' ||
    category === 'provider_rate_limit' ||
    category === 'provider_timeout'
  ) {
    return t('errors.providerUnavailable') as string;
  }
  if (category === 'credit') {
    return error.message || (t('errors.creditFailed') as string);
  }
  return error.message || fallback;
}

function isImageTaskCancelledError(error: unknown): boolean {
  return (
    error instanceof VisualImageGenerationError &&
    error.errorDetails?.code === 'IMAGE_TASK_CANCELLED'
  );
}

function parseTaskTimestamp(value?: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isActiveGenerationQueueItem(item: ImageGenerationQueueItem): boolean {
  return item.status === 'queued' || item.status === 'running';
}

function getCancelledTaskDetail(
  t: TFunction<'imageCreate'>,
  result?: VisualImageTaskCancelResult,
  fallbackStatus?: 'queued' | 'running' | 'cancelled'
): string {
  const cancelledStatus =
    result?.cancelledTaskStatus || fallbackStatus || 'cancelled';
  const base =
    cancelledStatus === 'queued'
      ? (t('progress.cancelledQueued') as string)
      : (t('progress.cancelledRunning') as string);
  if (result?.refundFailed) {
    return `${base} · ${t('progress.cancelRefundFailed') as string}`;
  }
  if (typeof result?.refunded === 'number' && result.refunded > 0) {
    return `${base} · ${t('progress.cancelRefunded', {
      credits: result.refunded
    })}`;
  }
  return base;
}

function warmRecentGenerationImages(
  urls: Array<string | null | undefined>
): void {
  if (typeof window === 'undefined') return;
  urls
    .filter(Boolean)
    .slice(0, 6)
    .forEach((url) => {
      const image = new Image();
      image.decoding = 'async';
      image.src = url as string;
    });
}

interface ActiveServerTaskSyncResult {
  activeCount: number;
  addedTaskIds: string[];
}

export interface UseImageGenerationResult {
  isGenerating: boolean;
  generationQueue: ImageGenerationQueueItem[];
  resultImageUrl: string | null;
  setResultImageUrl: (url: string | null) => void;
  resultImageUrls: string[];
  setResultImageUrls: (urls: string[]) => void;
  generationHistory: VisualImageHistoryItem[];
  generationHistoryTotal: number;
  generationHistoryLoaded: boolean;
  updateGenerationHistoryItem: (item: VisualImageHistoryItem) => void;
  activeGenerationId: string | null;
  setActiveGenerationId: (id: string | null) => void;
  handleGenerate: (overrides?: ImageGenerateOverrides) => Promise<void>;
  enqueueGenerationRequests: (
    requests: VisualImageGenerationRequest[],
    options?: { statusText?: string }
  ) => Promise<void>;
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
  retryGenerationTask: (id: string) => void;
  retryServerGenerationTask: (
    taskId: string,
    request: VisualImageGenerationRequest,
    options?: { deleteOriginalFailedTask?: boolean }
  ) => void;
  dismissGenerationTask: (id: string) => void;
  deleteGenerationTask: (id: string) => Promise<void>;
  deleteServerGenerationTask: (taskId: string) => Promise<void>;
  deleteGenerationFromHistory: (item: VisualImageHistoryItem) => Promise<void>;
}

export function useImageGeneration({
  isAuthenticated,
  onRequireLogin,
  settings,
  promptMode,
  customPromptText,
  selectedReferenceIds,
  selectedCharacterCardIds = [],
  characterReferenceGroups = [],
  compiled,
  recipeAssetIds = [],
  recipeAudit,
  creationContext,
  setError,
  setStatusText,
  trackingSource,
  trackingEntryPath,
  onCreditBlocked,
  onGenerationSuccess,
  onGenerationFailure
}: UseImageGenerationParams): UseImageGenerationResult {
  const { t } = useTranslation('imageCreate');

  const [isGenerating, setIsGenerating] = useState(false);
  const [resultImageUrl, setResultImageUrl] = useState<string | null>(null);
  const [resultImageUrls, setResultImageUrls] = useState<string[]>([]);
  const [generationHistory, setGenerationHistory] = useState<
    VisualImageHistoryItem[]
  >([]);
  const [generationHistoryTotal, setGenerationHistoryTotal] = useState(0);
  const [generationHistoryLoaded, setGenerationHistoryLoaded] = useState(
    !isAuthenticated
  );
  const [activeGenerationId, setActiveGenerationId] = useState<string | null>(
    null
  );
  const [generationQueue, setGenerationQueueState] = useState<
    ImageGenerationQueueItem[]
  >(() => (isAuthenticated ? readPersistedGenerationQueue() : []));
  const generationQueueRef =
    useRef<ImageGenerationQueueItem[]>(generationQueue);
  const queueWorkerRunningRef = useRef(false);
  const activeTaskSyncPromiseRef =
    useRef<Promise<ActiveServerTaskSyncResult> | null>(null);
  const emptyActiveTaskSyncCountRef = useRef(0);

  const replaceGenerationQueue = useCallback(
    (
      updater: (
        current: ImageGenerationQueueItem[]
      ) => ImageGenerationQueueItem[]
    ) => {
      const next = updater(generationQueueRef.current);
      generationQueueRef.current = next;
      setGenerationQueueState(next);
      writePersistedGenerationQueue(next);
      return next;
    },
    []
  );

  const loadGenerationHistory = useCallback(async () => {
    if (!isAuthenticated) {
      setGenerationHistory([]);
      setGenerationHistoryTotal(0);
      setGenerationHistoryLoaded(true);
      return;
    }
    setGenerationHistoryLoaded(false);
    try {
      const result = await getVisualImageHistoryResult(
        RECENT_GENERATION_HISTORY_LIMIT
      );
      warmRecentGenerationImages(
        result.items.map(
          (item) => item.thumbnailUrl || item.previewUrl || item.imageUrl
        )
      );
      setGenerationHistory(result.items);
      setGenerationHistoryTotal(result.total);
    } catch (historyError) {
      console.warn('[ImageCreate] load history failed:', historyError);
      setGenerationHistory([]);
      setGenerationHistoryTotal(0);
    } finally {
      setGenerationHistoryLoaded(true);
    }
  }, [isAuthenticated]);

  const insertGenerationResultIntoHistory = useCallback(
    (
      result: VisualImageGenerationResult,
      request: VisualImageGenerationRequest
    ) => {
      const nowIso = new Date().toISOString();
      const images =
        result.images.length > 0
          ? result.images
          : result.imageUrl
            ? [
                {
                  generationId: result.generationId,
                  imageUrl: result.imageUrl,
                  imageUrlExpiresIn: result.imageUrlExpiresIn
                }
              ]
            : [];
      if (images.length === 0) return;

      warmRecentGenerationImages(
        images.map(
          (image) => image.thumbnailUrl || image.previewUrl || image.imageUrl
        )
      );
      const optimisticItems = images
        .filter((image) => image.generationId || image.imageUrl)
        .map(
          (image, index) =>
            ({
              id:
                image.generationId || `${request.model}-${Date.now()}-${index}`,
              imageUrl: image.imageUrl,
              imageUrlExpiresIn: image.imageUrlExpiresIn,
              thumbnailUrl: image.thumbnailUrl,
              previewUrl: image.previewUrl,
              storageBucket: image.storageBucket,
              storagePath: image.storagePath,
              thumbnailStoragePath: image.thumbnailStoragePath,
              previewStoragePath: image.previewStoragePath,
              width: image.width,
              height: image.height,
              prompt: request.prompt,
              negativePrompt: request.negativePrompt,
              provider: result.provider || image.provider || '',
              model: result.model || image.model || request.model,
              modelLabel: result.modelLabel || image.modelLabel,
              aspectRatio: result.aspectRatio,
              imageSize: result.imageSize || request.imageSize,
              actualImageSize:
                image.width && image.height
                  ? `${image.width}x${image.height}`
                  : undefined,
              requestedImageSize: result.imageSize || request.imageSize,
              quality: result.quality || request.quality,
              outputFormat: result.outputFormat || request.outputFormat,
              assetIds: request.assetIds || [],
              referenceImageIds: request.referenceImageIds || [],
              referenceMode: request.referenceMode,
              characterCardIds: request.characterCardIds || [],
              characterReferenceGroups: request.characterReferenceGroups || [],
              sourceGenerationId: request.sourceGenerationId,
              editInstruction: request.editInstruction,
              editMode: request.editMode,
              appSlug: request.appSlug,
              appOperation: request.appOperation,
              sourceApp: request.sourceApp,
              createdAt: nowIso
            }) satisfies VisualImageHistoryItem
        );

      setGenerationHistory((current) => {
        const existingIds = new Set(current.map((item) => item.id));
        const nextItems = optimisticItems.filter(
          (item) => !existingIds.has(item.id)
        );
        if (nextItems.length === 0) return current;
        return [...nextItems, ...current].slice(
          0,
          RECENT_GENERATION_HISTORY_LIMIT
        );
      });
      setGenerationHistoryTotal((current) =>
        Math.max(current + optimisticItems.length, optimisticItems.length)
      );
    },
    []
  );

  useEffect(() => {
    void loadGenerationHistory();
  }, [loadGenerationHistory]);

  const getRunningDetail = useCallback(
    (startedAt: number) => {
      const elapsedMs = Math.max(0, Date.now() - startedAt);
      const elapsedSeconds = Math.floor(elapsedMs / 1000);
      let detail = t('progress.detailSubmitted') as string;
      if (elapsedSeconds >= 8 && elapsedSeconds < 60) {
        detail = t('progress.detailWaitingModel', {
          seconds: elapsedSeconds
        }) as string;
      } else if (elapsedSeconds >= 60 && elapsedSeconds < 180) {
        detail = t('progress.detailGenerating', {
          seconds: elapsedSeconds
        }) as string;
      } else if (elapsedSeconds >= 180) {
        detail = t('progress.detailFinalizing', {
          seconds: elapsedSeconds
        }) as string;
      }
      return detail;
    },
    [t]
  );

  const runGenerationQueue = useCallback(async () => {
    if (queueWorkerRunningRef.current) return;

    queueWorkerRunningRef.current = true;
    setIsGenerating(true);

    try {
      const findNextTask = () =>
        generationQueueRef.current.find(
          (item) => item.status === 'running' && item.serverTaskId
        ) ||
        generationQueueRef.current.find(
          (item) => item.status === 'queued' && !item.clientSubmissionPending
        );
      let nextTask = findNextTask();
      while (nextTask) {
        const activeTask = nextTask;
        const startedAt = activeTask.startedAt || Date.now();
        const initialDetail = getRunningDetail(startedAt);
        replaceGenerationQueue((current) =>
          current.map((item) =>
            item.id === activeTask.id
              ? {
                  ...item,
                  status: 'running',
                  startedAt,
                  progressDetail: initialDetail
                }
              : item
          )
        );
        setError('');
        setActiveGenerationId(null);
        setResultImageUrl(null);
        setResultImageUrls([]);

        const progressTimer = window.setInterval(() => {
          const detail = getRunningDetail(startedAt);
          replaceGenerationQueue((current) =>
            current.map((item) =>
              item.id === activeTask.id && item.status === 'running'
                ? {
                    ...item,
                    progressDetail: detail
                  }
                : item
            )
          );
        }, 1000);

        try {
          const result = activeTask.serverTaskId
            ? await waitForVisualImageTask(activeTask.serverTaskId)
            : await generateVisualImage(activeTask.request, {
                onQueued: (serverTaskId) => {
                  replaceGenerationQueue((current) =>
                    current.map((item) =>
                      item.id === activeTask.id
                        ? {
                            ...item,
                            serverTaskId
                          }
                        : item
                    )
                  );
                }
              });
          const latestTask = generationQueueRef.current.find(
            (item) => item.id === activeTask.id
          );
          if (latestTask?.status === 'cancelled') {
            continue;
          }
          replaceGenerationQueue((current) =>
            current.map((item) =>
              item.id === activeTask.id
                ? {
                    ...item,
                    status: 'succeeded',
                    finishedAt: Date.now(),
                    progressDetail: t('progress.detailDone') as string,
                    imageUrl: result.imageUrl,
                    imageUrls: result.images.map((image) => image.imageUrl),
                    imageCount: result.imageCount || result.images.length,
                    requestedImageCount:
                      result.requestedImageCount ||
                      activeTask.request.imageCount ||
                      result.images.length,
                    actualImageCount:
                      result.actualImageCount ||
                      result.imageCount ||
                      result.images.length,
                    refunded: result.refunded ?? result.credits?.refunded,
                    refundFailed: result.refundFailed,
                    partialRefundWarning:
                      result.partialRefundWarning || result.credits?.warning,
                    batchConsistencyMode: result.batchConsistencyMode,
                    strictBatchConsistency: result.strictBatchConsistency,
                    skippedCrossChannelSupplement:
                      result.skippedCrossChannelSupplement,
                    generationId: result.generationId,
                    generationIds: result.images.map(
                      (image) => image.generationId
                    )
                  }
                : item
            )
          );
          if (
            !generationQueueRef.current.some(
              (item) => item.id === activeTask.id
            )
          ) {
            continue;
          }
          setResultImageUrl(result.imageUrl);
          setResultImageUrls(result.images.map((image) => image.imageUrl));
          setActiveGenerationId(result.generationId);
          insertGenerationResultIntoHistory(result, activeTask.request);
          playGenerationCompleteSound();
          const displayModel =
            result.modelLabel || result.model || result.provider || '';
          const creditPart = result.credits?.consumed
            ? t('status.creditsConsumed', { n: result.credits.consumed })
            : '';
          const refundWarning = (
            result.credits as { warning?: string } | undefined
          )?.warning;
          const base = t('status.done', {
            model: displayModel,
            credits: creditPart
          });
          setStatusText(refundWarning ? `${base} · ${refundWarning}` : base);
          trackImageGenerationEvent('generation_success', {
            task_id: activeTask.serverTaskId,
            cta_source: trackingSource,
            entry_path: trackingEntryPath,
            model: result.model || activeTask.request.model,
            provider: result.provider,
            used_fallback: result.usedFallback,
            image_count: result.images.length,
            credits_consumed: result.credits?.consumed,
            prompt_mode: activeTask.request.promptMode,
            image_size: activeTask.request.imageSize,
            quality: activeTask.request.quality,
            reference_mode: activeTask.request.referenceMode
          });
          onGenerationSuccess?.({
            result,
            request: activeTask.request,
            taskId: activeTask.serverTaskId
          });
        } catch (generateError) {
          if (isImageTaskCancelledError(generateError)) {
            replaceGenerationQueue((current) =>
              current.filter((item) => item.id !== activeTask.id)
            );
            setError('');
            setStatusText(t('status.taskCancelled'));
            trackImageGenerationEvent('generation_cancelled', {
              task_id: activeTask.serverTaskId,
              cta_source: trackingSource,
              entry_path: trackingEntryPath,
              model: activeTask.request.model,
              prompt_mode: activeTask.request.promptMode,
              image_size: activeTask.request.imageSize,
              quality: activeTask.request.quality,
              reference_mode: activeTask.request.referenceMode
            });
            continue;
          }
          const message = getFriendlyGenerationErrorMessage(
            generateError,
            t('errors.generateFailed') as string,
            t
          );
          const generationErrorDetails =
            generateError instanceof VisualImageGenerationError
              ? generateError.errorDetails
              : undefined;
          const retryable =
            generateError instanceof VisualImageGenerationError
              ? Boolean(generationErrorDetails?.retryable)
              : false;
          if (
            generateError instanceof VisualImageGenerationError &&
            (generateError.status === 402 || generateError.status === 429)
          ) {
            onCreditBlocked?.(message);
          }
          replaceGenerationQueue((current) =>
            current.map((item) =>
              item.id === activeTask.id
                ? {
                    ...item,
                    status: 'failed',
                    finishedAt: Date.now(),
                    progressDetail: message,
                    error: message,
                    errorCategory:
                      typeof generationErrorDetails?.category === 'string'
                        ? generationErrorDetails.category
                        : undefined,
                    errorCode:
                      typeof generationErrorDetails?.code === 'string'
                        ? generationErrorDetails.code
                        : undefined,
                    retryable
                  }
                : item
            )
          );
          setError(message);
          setStatusText('');
          playGenerationFailedSound();
          trackImageGenerationEvent('generation_failed', {
            task_id: activeTask.serverTaskId,
            cta_source: trackingSource,
            entry_path: trackingEntryPath,
            model: activeTask.request.model,
            prompt_mode: activeTask.request.promptMode,
            image_size: activeTask.request.imageSize,
            quality: activeTask.request.quality,
            reference_mode: activeTask.request.referenceMode,
            retryable,
            error_code:
              generateError instanceof VisualImageGenerationError
                ? generationErrorDetails?.code
                : undefined,
            error_category:
              generateError instanceof VisualImageGenerationError
                ? generationErrorDetails?.category
                : undefined,
            provider:
              generateError instanceof VisualImageGenerationError
                ? generationErrorDetails?.provider
                : undefined,
            provider_model:
              generateError instanceof VisualImageGenerationError
                ? generationErrorDetails?.model
                : undefined,
            refund_status:
              generateError instanceof VisualImageGenerationError
                ? generateError.refundFailed
                  ? 'refund_failed'
                  : 'not_charged_or_refunded'
                : undefined,
            status:
              generateError instanceof VisualImageGenerationError
                ? generateError.status
                : undefined
          });
          onGenerationFailure?.({
            error: generateError,
            message,
            request: activeTask.request,
            taskId: activeTask.serverTaskId
          });
        } finally {
          window.dispatchEvent(new CustomEvent('credits-changed'));
          window.setTimeout(() => {
            void loadGenerationHistory();
          }, 800);
          window.clearInterval(progressTimer);
        }

        nextTask = findNextTask();
      }
    } finally {
      queueWorkerRunningRef.current = false;
      setIsGenerating(
        generationQueueRef.current.some(isActiveGenerationQueueItem)
      );
    }
  }, [
    getRunningDetail,
    insertGenerationResultIntoHistory,
    loadGenerationHistory,
    replaceGenerationQueue,
    setError,
    setStatusText,
    onCreditBlocked,
    onGenerationFailure,
    onGenerationSuccess,
    t,
    trackingEntryPath,
    trackingSource
  ]);

  const hydrateActiveServerTasks =
    useCallback(async (): Promise<ActiveServerTaskSyncResult> => {
      if (!isAuthenticated) {
        return { activeCount: 0, addedTaskIds: [] };
      }

      if (activeTaskSyncPromiseRef.current) {
        return activeTaskSyncPromiseRef.current;
      }

      const syncPromise = (async (): Promise<ActiveServerTaskSyncResult> => {
        try {
          const knownServerTaskIds = new Set(
            generationQueueRef.current
              .map((item) => item.serverTaskId)
              .filter(Boolean)
          );
          const activeSnapshot = await getVisualImageTaskSnapshot(20);
          const activeTasks = activeSnapshot.tasks;
          const addedTaskIds = activeTasks
            .map((task) => task.taskId)
            .filter((taskId) => !knownServerTaskIds.has(taskId));

          if (activeTasks.length === 0) {
            emptyActiveTaskSyncCountRef.current = Math.min(
              emptyActiveTaskSyncCountRef.current + 1,
              3
            );
            return { activeCount: 0, addedTaskIds: [] };
          }

          emptyActiveTaskSyncCountRef.current = 0;

          const translateTaskProgress = t as unknown as (
            key: string,
            options?: Record<string, unknown>
          ) => string;
          const serverItems = activeTasks.map(
            (task: VisualImageTaskListItem) => {
              const createdAt =
                parseTaskTimestamp(task.createdAt) || Date.now();
              const startedAt =
                parseTaskTimestamp(task.startedAt) ||
                (task.status === 'running' ? createdAt : undefined);
              const finishedAt =
                task.status === 'failed'
                  ? parseTaskTimestamp(task.updatedAt)
                  : undefined;
              const progressDetail = getImageTaskProgressViewModel({
                task,
                translate: translateTaskProgress
              }).detail;

              return {
                id: `task-${task.taskId}`,
                serverTaskId: task.taskId,
                request: task.request,
                status: task.status,
                createdAt,
                startedAt,
                finishedAt,
                progressDetail,
                error: task.status === 'failed' ? task.error : undefined,
                errorCategory: task.errorCategory,
                errorCode: task.errorCode,
                retryable:
                  task.status === 'failed'
                    ? canRetryImageGenerationFailure({
                        retryable: task.retryable,
                        errorCategory: task.errorCategory,
                        errorCode: task.errorCode
                      })
                    : undefined,
                imageCount: task.imageCount,
                requestedImageCount: task.requestedImageCount,
                actualImageCount: task.actualImageCount,
                refunded: task.refunded,
                refundFailed: task.refundFailed,
                partialRefundWarning: task.partialRefundWarning,
                batchConsistencyMode: task.batchConsistencyMode,
                strictBatchConsistency: task.strictBatchConsistency,
                skippedCrossChannelSupplement:
                  task.skippedCrossChannelSupplement,
                currentStage: task.currentStage,
                cancelledTaskStatus: task.cancelledTaskStatus,
                interruptMode: task.interruptMode
              } satisfies ImageGenerationQueueItem;
            }
          );

          replaceGenerationQueue((current) => {
            // `mode=active` is intentionally not a terminal task snapshot. A
            // task disappears from this list as soon as the server finishes,
            // while the task-id poll may still be receiving its result. Keep
            // local unresolved items until that authoritative poll records a
            // success or failure; otherwise a completed image can reach the
            // Gallery without ever being persisted into the current session.
            const next = [...current];
            serverItems.forEach((serverItem) => {
              const existingIndex = next.findIndex(
                (item) =>
                  item.serverTaskId === serverItem.serverTaskId ||
                  item.id === serverItem.id
              );
              if (existingIndex >= 0) {
                const existing = next[existingIndex];
                const keepLocalRunningState =
                  existing.status === 'running' &&
                  serverItem.status === 'queued';
                next[existingIndex] = {
                  ...existing,
                  ...(keepLocalRunningState
                    ? {
                        serverTaskId:
                          existing.serverTaskId || serverItem.serverTaskId,
                        request: {
                          ...existing.request,
                          ...serverItem.request,
                          creationContext:
                            serverItem.request.creationContext ||
                            existing.request.creationContext
                        }
                      }
                    : {
                        ...serverItem,
                        request: {
                          ...existing.request,
                          ...serverItem.request,
                          creationContext:
                            serverItem.request.creationContext ||
                            existing.request.creationContext
                        }
                      }),
                  id: existing.id,
                  createdAt: existing.createdAt || serverItem.createdAt
                };
                return;
              }
              next.push(serverItem);
            });
            return next.sort((a, b) => a.createdAt - b.createdAt);
          });

          void runGenerationQueue();
          return { activeCount: activeTasks.length, addedTaskIds };
        } catch (serverTaskError) {
          emptyActiveTaskSyncCountRef.current = Math.min(
            emptyActiveTaskSyncCountRef.current + 1,
            3
          );
          console.warn(
            '[ImageCreate] active image tasks sync failed:',
            serverTaskError
          );
          return {
            activeCount: generationQueueRef.current.filter(
              isActiveGenerationQueueItem
            ).length,
            addedTaskIds: []
          };
        } finally {
          activeTaskSyncPromiseRef.current = null;
        }
      })();

      activeTaskSyncPromiseRef.current = syncPromise;
      return syncPromise;
    }, [isAuthenticated, replaceGenerationQueue, runGenerationQueue, t]);

  useEffect(() => {
    if (!isAuthenticated) {
      generationQueueRef.current = [];
      setGenerationQueueState([]);
      return;
    }
    const persisted = readPersistedGenerationQueue();
    if (persisted.length > 0) {
      replaceGenerationQueue((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...persisted.filter((item) => !seen.has(item.id))];
      });
    }
    void (async () => {
      await hydrateActiveServerTasks();
      await runGenerationQueue();
    })();
  }, [
    hydrateActiveServerTasks,
    isAuthenticated,
    replaceGenerationQueue,
    runGenerationQueue
  ]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    let timer: number | undefined;

    const syncActiveTasks = () => {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState === 'hidden'
      ) {
        return;
      }
      void hydrateActiveServerTasks();
    };

    const getNextDelay = () => {
      const hasLocalActiveTasks = generationQueueRef.current.some(
        isActiveGenerationQueueItem
      );
      if (hasLocalActiveTasks) return ACTIVE_TASK_SYNC_INTERVAL_MS;
      return emptyActiveTaskSyncCountRef.current >= 2
        ? MAX_IDLE_TASK_SYNC_INTERVAL_MS
        : IDLE_TASK_SYNC_INTERVAL_MS;
    };

    const scheduleSync = () => {
      if (cancelled) return;
      timer = window.setTimeout(async () => {
        if (
          typeof document === 'undefined' ||
          document.visibilityState !== 'hidden'
        ) {
          await hydrateActiveServerTasks();
        }
        scheduleSync();
      }, getNextDelay());
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncActiveTasks();
      }
    };

    scheduleSync();
    window.addEventListener('focus', syncActiveTasks);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      window.removeEventListener('focus', syncActiveTasks);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [hydrateActiveServerTasks, isAuthenticated]);

  const enqueueGenerationRequests = useCallback(
    async (
      requests: VisualImageGenerationRequest[],
      options: { statusText?: string } = {}
    ) => {
      if (requests.length === 0) return;
      const optimisticTasks: ImageGenerationQueueItem[] = requests.map(
        (request, index) =>
          ({
            id: crypto.randomUUID(),
            request,
            status: 'queued',
            createdAt: Date.now() + index,
            progressDetail: t('progress.detailSubmitted') as string,
            clientSubmissionPending: true
          }) satisfies ImageGenerationQueueItem
      );

      setError('');
      setStatusText(options.statusText || (t('status.queued') as string));
      setIsGenerating(true);
      replaceGenerationQueue((current) => [...current, ...optimisticTasks]);

      await hydrateActiveServerTasks();
      setStatusText(options.statusText || (t('status.queued') as string));
      setIsGenerating(true);

      try {
        for (const [index, request] of requests.entries()) {
          const serverTask = await enqueueVisualImageTask(request);
          const optimisticTask = optimisticTasks[index];
          replaceGenerationQueue((current) =>
            current.map((item) =>
              item.id === optimisticTask.id
                ? {
                    ...item,
                    serverTaskId: serverTask.taskId,
                    clientSubmissionPending: false
                  }
                : item
            )
          );
          void runGenerationQueue();
          trackImageGenerationEvent('generation_queued', {
            task_id: serverTask.taskId,
            cta_source: trackingSource,
            entry_path: trackingEntryPath,
            model: request.model,
            prompt_mode: request.promptMode,
            image_size: request.imageSize,
            quality: request.quality,
            output_format: request.outputFormat,
            image_count: request.imageCount,
            asset_count: request.assetIds.length,
            reference_count: request.referenceImageIds?.length || 0,
            reference_mode: request.referenceMode,
            character_card_count: request.characterCardIds?.length || 0,
            app_slug: request.appSlug,
            app_operation: request.appOperation,
            source_app: request.sourceApp
          });
        }

        window.dispatchEvent(new CustomEvent('credits-changed'));
        void runGenerationQueue();
      } catch (enqueueError) {
        const optimisticIds = new Set(optimisticTasks.map((item) => item.id));
        if (
          enqueueError instanceof VisualImageGenerationError &&
          enqueueError.status === 409 &&
          enqueueError.errorDetails?.code === 'IMAGE_TASK_ALREADY_ACTIVE'
        ) {
          replaceGenerationQueue((current) =>
            current.filter((item) => !optimisticIds.has(item.id))
          );
          const activeSync = await hydrateActiveServerTasks();
          const syncedCount = Math.max(
            activeSync.activeCount,
            enqueueError.activeTasks?.length || 0,
            generationQueueRef.current.filter(isActiveGenerationQueueItem)
              .length
          );
          setError('');
          setStatusText('');
          setIsGenerating(syncedCount > 0);
          void runGenerationQueue();
          return;
        }

        const message = getFriendlyGenerationErrorMessage(
          enqueueError,
          t('errors.generateFailed') as string,
          t
        );
        if (
          enqueueError instanceof VisualImageGenerationError &&
          (enqueueError.status === 402 || enqueueError.status === 429)
        ) {
          onCreditBlocked?.(message);
        }
        replaceGenerationQueue((current) =>
          current.map((item) =>
            optimisticIds.has(item.id) && item.clientSubmissionPending
              ? {
                  ...item,
                  clientSubmissionPending: false,
                  status: 'failed',
                  finishedAt: Date.now(),
                  progressDetail: message,
                  error: message
                }
              : item
          )
        );
        setError(message);
        setStatusText('');
        const hasServerBackedActiveTask = generationQueueRef.current.some(
          (item) => isActiveGenerationQueueItem(item) && item.serverTaskId
        );
        setIsGenerating(hasServerBackedActiveTask);
        if (hasServerBackedActiveTask) void runGenerationQueue();
        playGenerationFailedSound();
      }
    },
    [
      hydrateActiveServerTasks,
      onCreditBlocked,
      replaceGenerationQueue,
      runGenerationQueue,
      setError,
      setStatusText,
      t,
      trackingEntryPath,
      trackingSource
    ]
  );

  const handleGenerate = async (overrides: ImageGenerateOverrides = {}) => {
    if (!isAuthenticated) {
      onRequireLogin();
      return;
    }
    primeGenerationCompleteSound();

    const finalPrompt =
      overrides.promptOverride !== undefined
        ? overrides.promptOverride.trim()
        : promptMode === 'custom'
          ? customPromptText.trim()
          : compiled.prompt;
    // 自定义模式下用户可能清空输入框;空 prompt 提交会白扣积分,提前拦截
    if (!finalPrompt) {
      setError(t('errors.emptyPrompt'));
      return;
    }

    const isCustomPrompt = promptMode === 'custom';
    const finalNegativePrompt =
      overrides.negativePromptOverride !== undefined
        ? overrides.negativePromptOverride.trim() || undefined
        : undefined;
    const generationRequest: VisualImageGenerationRequest = {
      prompt: finalPrompt,
      negativePrompt: finalNegativePrompt,
      model: settings.model,
      aspectRatio: settings.aspectRatio,
      imageSize: settings.imageSize,
      quality: settings.quality,
      outputFormat: settings.outputFormat,
      imageCount: settings.imageCount,
      assetIds: isCustomPrompt
        ? recipeAssetIds
        : compiled.selectedAssets.map((asset) => asset.id),
      promptMode,
      recipeAudit,
      creationContext: overrides.creationContextOverride || creationContext,
      referenceImageIds: selectedReferenceIds,
      referenceMode:
        characterReferenceGroups.length > 0
          ? 'character_consistency'
          : selectedReferenceIds.length > 0
            ? 'image_reference'
            : 'none',
      characterCardIds: selectedCharacterCardIds,
      characterReferenceGroups
    };

    await enqueueGenerationRequests([generationRequest]);
  };

  const cancelQueuedGeneration = useCallback(
    (id: string) => {
      let serverTaskId: string | undefined;
      replaceGenerationQueue((current) => {
        const target = current.find(
          (item) =>
            item.status === 'queued' &&
            (item.id === id || item.serverTaskId === id)
        );
        serverTaskId = target?.serverTaskId;
        return current.map((item) =>
          item.status === 'queued' &&
          (item.id === id || item.serverTaskId === id)
            ? {
                ...item,
                status: 'cancelled' as const,
                finishedAt: Date.now(),
                progressDetail: getCancelledTaskDetail(t, undefined, 'queued'),
                cancelledTaskStatus: 'queued' as const,
                interruptMode: 'queue' as const
              }
            : item
        );
      });
      if (serverTaskId) {
        void cancelVisualImageTask(serverTaskId)
          .then((result) => {
            replaceGenerationQueue((current) =>
              current.map((item) =>
                item.serverTaskId === serverTaskId || item.id === id
                  ? {
                      ...item,
                      progressDetail: getCancelledTaskDetail(
                        t,
                        result,
                        'queued'
                      ),
                      refunded: result.refunded,
                      refundFailed: result.refundFailed,
                      cancelledTaskStatus: result.cancelledTaskStatus,
                      interruptMode: result.interruptMode
                    }
                  : item
              )
            );
            window.dispatchEvent(new CustomEvent('credits-changed'));
          })
          .catch((cancelError) => {
            console.warn(
              '[ImageCreate] cancel queued task failed:',
              cancelError
            );
            replaceGenerationQueue((current) =>
              current.map((item) =>
                item.serverTaskId === serverTaskId || item.id === id
                  ? {
                      ...item,
                      status: 'failed' as const,
                      error:
                        cancelError instanceof Error
                          ? cancelError.message
                          : (t('errors.generateFailed') as string),
                      progressDetail:
                        cancelError instanceof Error
                          ? cancelError.message
                          : (t('errors.generateFailed') as string)
                    }
                  : item
              )
            );
          });
      }
      setStatusText(t('status.queueCancelled'));
    },
    [replaceGenerationQueue, setStatusText, t]
  );

  const cancelServerQueuedGeneration = useCallback(
    (taskId: string, request?: VisualImageGenerationRequest) => {
      const createdAt = Date.now();
      replaceGenerationQueue((current) => [
        ...current.filter((item) => item.serverTaskId !== taskId),
        ...(request
          ? [
              {
                id: `task-${taskId}`,
                serverTaskId: taskId,
                request,
                status: 'cancelled' as const,
                createdAt,
                finishedAt: createdAt,
                progressDetail: getCancelledTaskDetail(t, undefined, 'queued'),
                cancelledTaskStatus: 'queued' as const,
                interruptMode: 'queue' as const
              }
            ]
          : [])
      ]);
      void cancelVisualImageTask(taskId)
        .then((result) => {
          replaceGenerationQueue((current) =>
            current.map((item) =>
              item.serverTaskId === taskId
                ? {
                    ...item,
                    progressDetail: getCancelledTaskDetail(t, result, 'queued'),
                    refunded: result.refunded,
                    refundFailed: result.refundFailed,
                    cancelledTaskStatus: result.cancelledTaskStatus,
                    interruptMode: result.interruptMode
                  }
                : item
            )
          );
          window.dispatchEvent(new CustomEvent('credits-changed'));
        })
        .catch((cancelError) => {
          console.warn('[ImageCreate] cancel queued task failed:', cancelError);
        });
      setStatusText(t('status.queueCancelled'));
    },
    [replaceGenerationQueue, setStatusText, t]
  );

  const cancelRunningGeneration = useCallback(
    (id: string) => {
      let serverTaskId: string | undefined;
      replaceGenerationQueue((current) => {
        const target = current.find(
          (item) =>
            item.status === 'running' &&
            (item.id === id || item.serverTaskId === id)
        );
        serverTaskId = target?.serverTaskId;
        return current.map((item) =>
          item.status === 'running' &&
          (item.id === id || item.serverTaskId === id)
            ? {
                ...item,
                status: 'cancelled' as const,
                finishedAt: Date.now(),
                progressDetail: getCancelledTaskDetail(t, undefined, 'running'),
                cancelledTaskStatus: 'running' as const,
                interruptMode: 'soft' as const
              }
            : item
        );
      });
      if (serverTaskId) {
        void cancelVisualImageTask(serverTaskId)
          .then((result) => {
            replaceGenerationQueue((current) =>
              current.map((item) =>
                item.serverTaskId === serverTaskId || item.id === id
                  ? {
                      ...item,
                      progressDetail: getCancelledTaskDetail(
                        t,
                        result,
                        'running'
                      ),
                      refunded: result.refunded,
                      refundFailed: result.refundFailed,
                      cancelledTaskStatus: result.cancelledTaskStatus,
                      interruptMode: result.interruptMode
                    }
                  : item
              )
            );
            window.dispatchEvent(new CustomEvent('credits-changed'));
          })
          .catch((cancelError) => {
            console.warn(
              '[ImageCreate] cancel running task failed:',
              cancelError
            );
          });
      }
      setError('');
      setStatusText(t('status.taskCancelled'));
      window.dispatchEvent(new CustomEvent('credits-changed'));
    },
    [replaceGenerationQueue, setError, setStatusText, t]
  );

  const cancelServerRunningGeneration = useCallback(
    (taskId: string, request?: VisualImageGenerationRequest) => {
      const createdAt = Date.now();
      replaceGenerationQueue((current) => [
        ...current.filter((item) => item.serverTaskId !== taskId),
        ...(request
          ? [
              {
                id: `task-${taskId}`,
                serverTaskId: taskId,
                request,
                status: 'cancelled' as const,
                createdAt,
                finishedAt: createdAt,
                progressDetail: getCancelledTaskDetail(t, undefined, 'running'),
                cancelledTaskStatus: 'running' as const,
                interruptMode: 'soft' as const
              }
            ]
          : [])
      ]);
      void cancelVisualImageTask(taskId)
        .then((result) => {
          replaceGenerationQueue((current) =>
            current.map((item) =>
              item.serverTaskId === taskId
                ? {
                    ...item,
                    progressDetail: getCancelledTaskDetail(
                      t,
                      result,
                      'running'
                    ),
                    refunded: result.refunded,
                    refundFailed: result.refundFailed,
                    cancelledTaskStatus: result.cancelledTaskStatus,
                    interruptMode: result.interruptMode
                  }
                : item
            )
          );
          window.dispatchEvent(new CustomEvent('credits-changed'));
        })
        .catch((cancelError) => {
          console.warn(
            '[ImageCreate] cancel running task failed:',
            cancelError
          );
        });
      setError('');
      setStatusText(t('status.taskCancelled'));
      window.dispatchEvent(new CustomEvent('credits-changed'));
    },
    [replaceGenerationQueue, setError, setStatusText, t]
  );

  const retryGenerationTask = useCallback(
    (id: string) => {
      primeGenerationCompleteSound();
      const failedTask = generationQueueRef.current.find(
        (item) => item.id === id && item.status === 'failed'
      );
      if (!failedTask) return;

      if (failedTask.serverTaskId) {
        const failedServerTaskId = failedTask.serverTaskId;
        setError('');
        setStatusText(t('status.queued'));
        void retryVisualImageTask(failedServerTaskId)
          .then((retryTask) => {
            void deleteFailedVisualImageTask(failedServerTaskId).catch(
              (deleteError) => {
                console.warn(
                  '[ImageCreate] delete retried failed image task failed:',
                  deleteError
                );
              }
            );
            replaceGenerationQueue((current) =>
              current.map((item) =>
                item.id === id
                  ? {
                      ...item,
                      serverTaskId: retryTask.taskId,
                      status: 'queued',
                      startedAt: undefined,
                      finishedAt: undefined,
                      progressDetail: retryTask.creditWaived
                        ? (t('progress.detailRetryWaived') as string)
                        : undefined,
                      imageUrl: undefined,
                      imageUrls: undefined,
                      imageCount: undefined,
                      requestedImageCount: undefined,
                      actualImageCount: undefined,
                      refunded: undefined,
                      refundFailed: undefined,
                      partialRefundWarning: undefined,
                      batchConsistencyMode: undefined,
                      strictBatchConsistency: undefined,
                      skippedCrossChannelSupplement: undefined,
                      cancelledTaskStatus: undefined,
                      interruptMode: undefined,
                      generationId: undefined,
                      generationIds: undefined,
                      error: undefined,
                      retryable: undefined,
                      creditWaived: retryTask.creditWaived,
                      retryOfTaskId: retryTask.retryOfTaskId
                    }
                  : item
              )
            );
            void runGenerationQueue();
          })
          .catch((retryError) => {
            const message = getFriendlyGenerationErrorMessage(
              retryError,
              t('errors.retryNotAllowed') as string,
              t
            );
            replaceGenerationQueue((current) =>
              current.map((item) =>
                item.id === id
                  ? {
                      ...item,
                      error: message,
                      progressDetail: message,
                      retryable: false
                    }
                  : item
              )
            );
            setError(message);
            setStatusText('');
            playGenerationFailedSound();
          });
        return;
      }

      replaceGenerationQueue((current) =>
        current.map((item) =>
          item.id === id && item.status === 'failed'
            ? {
                ...item,
                serverTaskId: undefined,
                status: 'queued',
                startedAt: undefined,
                finishedAt: undefined,
                progressDetail: undefined,
                imageUrl: undefined,
                imageUrls: undefined,
                imageCount: undefined,
                requestedImageCount: undefined,
                actualImageCount: undefined,
                refunded: undefined,
                refundFailed: undefined,
                partialRefundWarning: undefined,
                batchConsistencyMode: undefined,
                strictBatchConsistency: undefined,
                skippedCrossChannelSupplement: undefined,
                cancelledTaskStatus: undefined,
                interruptMode: undefined,
                generationId: undefined,
                generationIds: undefined,
                error: undefined,
                retryable: undefined,
                creditWaived: undefined
              }
            : item
        )
      );
      setError('');
      setStatusText(t('status.queued'));
      void runGenerationQueue();
    },
    [replaceGenerationQueue, runGenerationQueue, setError, setStatusText, t]
  );

  const retryServerGenerationTask = useCallback(
    (
      taskId: string,
      request: VisualImageGenerationRequest,
      options: { deleteOriginalFailedTask?: boolean } = {}
    ) => {
      primeGenerationCompleteSound();
      setError('');
      setStatusText(t('status.queued'));
      void retryVisualImageTask(taskId)
        .then((retryTask) => {
          if (options.deleteOriginalFailedTask !== false) {
            void deleteFailedVisualImageTask(taskId).catch((deleteError) => {
              console.warn(
                '[ImageCreate] delete retried failed image task failed:',
                deleteError
              );
            });
          }
          const createdAt = Date.now();
          replaceGenerationQueue((current) => {
            let replaced = false;
            const next = current.map((item) => {
              if (
                item.serverTaskId !== taskId &&
                item.id !== `task-${taskId}`
              ) {
                return item;
              }
              replaced = true;
              return {
                ...item,
                id: item.id || `task-${retryTask.taskId}`,
                serverTaskId: retryTask.taskId,
                request,
                status: 'queued' as const,
                createdAt,
                startedAt: undefined,
                finishedAt: undefined,
                progressDetail: retryTask.creditWaived
                  ? (t('progress.detailRetryWaived') as string)
                  : (t('progress.detailSubmitted') as string),
                imageUrl: undefined,
                imageUrls: undefined,
                imageCount: undefined,
                requestedImageCount: undefined,
                actualImageCount: undefined,
                refunded: undefined,
                refundFailed: undefined,
                partialRefundWarning: undefined,
                batchConsistencyMode: undefined,
                strictBatchConsistency: undefined,
                skippedCrossChannelSupplement: undefined,
                cancelledTaskStatus: undefined,
                interruptMode: undefined,
                generationId: undefined,
                generationIds: undefined,
                error: undefined,
                retryable: undefined,
                creditWaived: retryTask.creditWaived,
                retryOfTaskId: retryTask.retryOfTaskId || taskId
              };
            });
            if (!replaced) {
              next.push({
                id: `task-${retryTask.taskId}`,
                serverTaskId: retryTask.taskId,
                request,
                status: 'queued',
                createdAt,
                progressDetail: retryTask.creditWaived
                  ? (t('progress.detailRetryWaived') as string)
                  : (t('progress.detailSubmitted') as string),
                creditWaived: retryTask.creditWaived,
                retryOfTaskId: retryTask.retryOfTaskId || taskId
              });
            }
            return next.sort((a, b) => a.createdAt - b.createdAt);
          });
          void runGenerationQueue();
        })
        .catch((retryError) => {
          const message = getFriendlyGenerationErrorMessage(
            retryError,
            t('errors.retryNotAllowed') as string,
            t
          );
          replaceGenerationQueue((current) => {
            const hasExisting = current.some(
              (item) =>
                item.serverTaskId === taskId || item.id === `task-${taskId}`
            );
            if (hasExisting) {
              return current.map((item) =>
                item.serverTaskId === taskId || item.id === `task-${taskId}`
                  ? {
                      ...item,
                      error: message,
                      progressDetail: message,
                      retryable: false
                    }
                  : item
              );
            }
            return [
              ...current,
              {
                id: `task-${taskId}`,
                serverTaskId: taskId,
                request,
                status: 'failed' as const,
                createdAt: Date.now(),
                finishedAt: Date.now(),
                progressDetail: message,
                error: message,
                retryable: false
              }
            ];
          });
          setError(message);
          setStatusText('');
          playGenerationFailedSound();
        });
    },
    [replaceGenerationQueue, runGenerationQueue, setError, setStatusText, t]
  );

  const deleteGenerationTask = useCallback(
    async (id: string) => {
      const failedTask = generationQueueRef.current.find(
        (item) => item.id === id && item.status === 'failed'
      );
      replaceGenerationQueue((current) =>
        current.filter((item) => item.id !== id)
      );
      if (failedTask?.serverTaskId) {
        try {
          await deleteFailedVisualImageTask(failedTask.serverTaskId);
        } catch (deleteError) {
          console.warn(
            '[ImageCreate] delete failed image task failed:',
            deleteError
          );
          throw deleteError;
        }
      }
    },
    [replaceGenerationQueue]
  );

  const dismissGenerationTask = useCallback(
    (id: string) => {
      replaceGenerationQueue((current) =>
        current.filter(
          (item) =>
            item.id !== id &&
            item.serverTaskId !== id &&
            item.id !== `task-${id}`
        )
      );
    },
    [replaceGenerationQueue]
  );

  const deleteServerGenerationTask = useCallback(
    async (taskId: string) => {
      replaceGenerationQueue((current) =>
        current.filter((item) => item.serverTaskId !== taskId)
      );
      try {
        await deleteFailedVisualImageTask(taskId);
      } catch (deleteError) {
        console.warn(
          '[ImageCreate] delete failed image task failed:',
          deleteError
        );
        throw deleteError;
      }
    },
    [replaceGenerationQueue]
  );

  const deleteGenerationFromHistory = async (item: VisualImageHistoryItem) => {
    await deleteVisualImageHistoryItem(item.id);
    setGenerationHistory((current) =>
      current.filter((historyItem) => historyItem.id !== item.id)
    );
    setGenerationHistoryTotal((current) => Math.max(0, current - 1));
    if (activeGenerationId === item.id) {
      setActiveGenerationId(null);
      setResultImageUrl(null);
      setResultImageUrls([]);
    }
  };

  const updateGenerationHistoryItem = useCallback(
    (updated: VisualImageHistoryItem) => {
      setGenerationHistory((current) =>
        current.map((item) =>
          item.id === updated.id ? { ...item, ...updated } : item
        )
      );
    },
    []
  );

  return {
    isGenerating,
    generationQueue,
    resultImageUrl,
    setResultImageUrl,
    resultImageUrls,
    setResultImageUrls,
    generationHistory,
    generationHistoryTotal,
    generationHistoryLoaded,
    updateGenerationHistoryItem,
    activeGenerationId,
    setActiveGenerationId,
    handleGenerate,
    enqueueGenerationRequests,
    cancelQueuedGeneration,
    cancelServerQueuedGeneration,
    cancelRunningGeneration,
    cancelServerRunningGeneration,
    retryGenerationTask,
    retryServerGenerationTask,
    dismissGenerationTask,
    deleteGenerationTask,
    deleteServerGenerationTask,
    deleteGenerationFromHistory
  };
}
