import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BorderBeam } from 'border-beam';
import {
  Check,
  Download,
  Heart,
  ImageIcon,
  PencilLine,
  Play,
  RotateCcw,
  Sparkles,
  Trash2,
  X
} from 'lucide-react';
import type {
  VisualImageHistoryItem,
  VisualVideoGenerationItem
} from '@/services/agent-api';
import { Button as ShadcnButton } from '@/shared/ui/radix/button';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/radix/toggle-group';
import { formatDateTime } from '@/shared/dates';
import { getVisualImageDisplayUrl } from '@/shared/visual-image-display';
import { useVisualImageCache } from '@/shared/useVisualImageCache';
import { StaggeredImageGrid } from './StaggeredImageGrid';

type RailFilter = 'all' | 'images' | 'videos';
type GenerationRecordTaskStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'dismissed';

export interface GenerationRecordTask {
  key: string;
  sessionId?: string;
  generationIds?: string[];
  prompt?: string;
  modelLabel?: string;
  aspectRatio?: string;
  imageCount?: number;
  label: string;
  status: GenerationRecordTaskStatus;
  progress?: { current: number; total: number };
  imageProgress?: { current?: number; total: number };
  progressText?: string;
  detail?: string;
  notices?: Array<{
    tone: 'info' | 'success' | 'warning';
    text: string;
  }>;
  feedbackOptions?: Array<{ id: string; label: string }>;
  feedbackSubmitted?: string;
  onEdit?: () => void;
  onCancel?: () => void;
  onRetry?: () => void;
  retryLabel?: string;
  onAcknowledge?: () => void;
  acknowledgeLabel?: string;
  onDelete?: () => void;
  onDismiss?: () => void;
  dismissLabel?: string;
  onFeedback?: (reason: string) => void;
}

interface HistoryGroup {
  id: string;
  signature: string;
  createdAtMs: number;
  items: VisualGenerationHistoryItem[];
}

export type VisualGenerationHistoryItem =
  | VisualImageHistoryItem
  | VisualVideoGenerationItem;

export interface GenerationRecordsRailProps {
  tasks: GenerationRecordTask[];
  historyItems: VisualGenerationHistoryItem[];
  historyTotal: number;
  activeGenerationId: string | null;
  dateLocale: string;
  historyTabLabel?: string;
  videoPreviewLabel?: string;
  onPreview: (item: VisualGenerationHistoryItem) => void;
  onRegenerate?: (item: VisualGenerationHistoryItem) => void;
  onFavorite?: (item: VisualGenerationHistoryItem) => void;
  onDownload?: (item: VisualImageHistoryItem) => void;
  onViewMoreHistory?: () => void;
}

const GROUP_WINDOW_MS = 120 * 1000;
const TASK_CARD_BEAM_RADIUS = 18;

function normalizePromptSignature(value?: string | null) {
  return (value || '').replace(/\s+/g, ' ').trim().slice(0, 260);
}

function isVideoHistoryItem(
  item: VisualGenerationHistoryItem
): item is VisualVideoGenerationItem {
  return 'videoUrl' in item && typeof item.videoUrl === 'string';
}

function isImageHistoryItem(
  item: VisualGenerationHistoryItem
): item is VisualImageHistoryItem {
  return 'imageUrl' in item && typeof item.imageUrl === 'string';
}

function getHistoryItemId(item: VisualGenerationHistoryItem) {
  return isVideoHistoryItem(item) ? item.generationId : item.id;
}

function getRequestedImageCount(item: VisualGenerationHistoryItem) {
  if (isVideoHistoryItem(item)) return 1;
  const requested =
    typeof item.requestedImageCount === 'number'
      ? item.requestedImageCount
      : typeof item.imageCount === 'number'
        ? item.imageCount
        : undefined;
  return requested && requested > 0 ? Math.floor(requested) : 1;
}

function buildHistorySignature(item: VisualGenerationHistoryItem) {
  if (isVideoHistoryItem(item)) {
    return [
      normalizePromptSignature(item.prompt),
      item.model || item.modelLabel || '',
      item.aspectRatio || '',
      item.duration ? `${item.duration}s` : ''
    ].join('|');
  }
  return [
    normalizePromptSignature(item.prompt),
    normalizePromptSignature(item.negativePrompt),
    item.model || item.modelLabel || item.provider || '',
    item.aspectRatio || '',
    item.imageSize || item.actualImageSize || item.requestedImageSize || '',
    item.quality || '',
    item.outputFormat || ''
  ].join('|');
}

function buildHistoryGroups(
  items: VisualGenerationHistoryItem[]
): HistoryGroup[] {
  const groups: HistoryGroup[] = [];

  items.forEach((item) => {
    const createdAtMs = new Date(item.createdAt || Date.now()).getTime();
    const signature = buildHistorySignature(item);
    const previous = groups[groups.length - 1];
    const requestedCount = getRequestedImageCount(item);

    if (
      previous &&
      previous.signature === signature &&
      Math.abs(previous.createdAtMs - createdAtMs) <= GROUP_WINDOW_MS &&
      previous.items.length < Math.max(requestedCount, 1)
    ) {
      previous.items.push(item);
      previous.createdAtMs = Math.max(previous.createdAtMs, createdAtMs);
      return;
    }

    groups.push({
      id: `${getHistoryItemId(item)}-group`,
      signature,
      createdAtMs,
      items: [item]
    });
  });

  return groups;
}

function formatDate(value: string, locale: string) {
  return formatDateTime(value, locale);
}

function getHistoryCreatedAt(item: VisualGenerationHistoryItem) {
  return item.createdAt || new Date().toISOString();
}

function getHistoryKindLabel(
  item: VisualGenerationHistoryItem,
  locale: string,
  t: ImageCreateTranslate
) {
  if (!isVideoHistoryItem(item)) return t('historyRail.imageTask');
  return locale.startsWith('zh') ? '视频创作' : 'Video creation';
}

function HistoryRailMedia({
  item,
  active,
  priority,
  onPreview,
  videoPreviewLabel
}: {
  item: VisualGenerationHistoryItem;
  active: boolean;
  priority: boolean;
  onPreview: (item: VisualGenerationHistoryItem) => void;
  videoPreviewLabel?: string;
}) {
  const { t: rawT, i18n } = useTranslation('imageCreate');
  const t = rawT as unknown as ImageCreateTranslate;
  const isVideo = isVideoHistoryItem(item);
  const previewLabel = isVideo
    ? videoPreviewLabel ||
      (i18n?.language?.startsWith('zh') ? '预览视频' : 'Preview video')
    : (t('historyRail.previewImage') as string);
  const sourceUrl = isVideo ? '' : getVisualImageDisplayUrl(item);
  const cachedImageUrl = useVisualImageCache({
    id: getHistoryItemId(item),
    sourceUrl,
    variant:
      !isVideo && item.previewUrl
        ? 'preview'
        : !isVideo && item.imageUrl
          ? 'original'
          : 'thumbnail',
    strategy: 'cache-first'
  });
  const hasMedia = isVideo ? Boolean(item.videoUrl) : Boolean(cachedImageUrl);

  return (
    <div
      className={`creator-generation-media ${isVideo ? 'is-video' : ''} ${
        active ? 'active' : ''
      } ${hasMedia ? 'is-loaded' : 'is-loading'}`}
    >
      <button
        type="button"
        className="creator-generation-media-trigger"
        onClick={() => onPreview(item)}
        aria-label={previewLabel}
      >
        {isVideo && item.videoUrl ? (
          <video
            src={item.videoUrl}
            poster={item.posterUrl}
            preload={priority ? 'auto' : 'metadata'}
            muted
            playsInline
          />
        ) : hasMedia ? (
          <img
            src={cachedImageUrl || undefined}
            alt={
              item.prompt || item.modelLabel || (t('history.title') as string)
            }
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
          />
        ) : (
          <span className="creator-generation-media-placeholder">
            {isVideo ? <Play size={18} /> : <ImageIcon size={18} />}
          </span>
        )}
      </button>
    </div>
  );
}

type ImageCreateTranslate = (
  key: string,
  options?: Record<string, unknown>
) => string;

function getTaskStatusLabel(
  t: ImageCreateTranslate,
  status: GenerationRecordTaskStatus
) {
  return t(`historyRail.status.${status}`);
}

type TaskStageTone = 'active' | 'pending' | 'info' | 'success' | 'warning';

function getTaskImageProgressText(
  task: GenerationRecordTask,
  t: ImageCreateTranslate
) {
  if (!task.imageProgress || task.imageProgress.total <= 1) return undefined;
  return typeof task.imageProgress.current === 'number'
    ? t('progress.imageProgress', {
        done: task.imageProgress.current,
        total: task.imageProgress.total
      })
    : t('progress.imageTarget', {
        total: task.imageProgress.total
      });
}

function buildThinkingStages(
  task: GenerationRecordTask,
  t: ImageCreateTranslate
) {
  const stages: Array<{ text: string; tone: TaskStageTone }> = [
    { text: task.label, tone: 'active' }
  ];

  if (task.detail) {
    stages.push({ text: task.detail, tone: 'info' });
  }

  const imageProgressText = getTaskImageProgressText(task, t);
  if (imageProgressText) {
    stages.push({
      text: imageProgressText,
      tone:
        typeof task.imageProgress?.current === 'number' &&
        task.imageProgress.current > 0
          ? 'success'
          : 'pending'
    });
  }

  if (task.progress) {
    stages.push({
      text:
        task.progressText ||
        t('progress.batchProgress', {
          done: task.progress.current,
          total: task.progress.total
        }),
      tone: task.progress.current >= task.progress.total ? 'success' : 'pending'
    });
  }

  task.notices?.forEach((notice) => {
    stages.push({ text: notice.text, tone: notice.tone });
  });

  return stages.slice(0, 6);
}

export function GenerationTaskProgressList({
  tasks
}: {
  tasks: GenerationRecordTask[];
}) {
  const { t: rawT } = useTranslation('imageCreate');
  const t = rawT as unknown as ImageCreateTranslate;

  return (
    <aside
      className="creator-progress-panel embedded headless"
      aria-live="polite"
      aria-label={t('progress.title') as string}
    >
      <ul className="creator-progress-panel-body">
        {tasks.map((task) => {
          const isRunning = task.status === 'running';
          const isInProgress =
            task.status === 'queued' || task.status === 'running';
          const shouldAnimateBeam =
            task.status === 'queued' || task.status === 'running';
          const taskClassName = [
            'creator-progress-task',
            `status-${task.status}`,
            isInProgress ? 'status-processing' : ''
          ]
            .filter(Boolean)
            .join(' ');
          const hasActions = Boolean(
            task.onEdit ||
            task.onCancel ||
            task.onRetry ||
            task.onAcknowledge ||
            task.onDelete ||
            task.onDismiss
          );
          const taskActions = hasActions ? (
            <span className="creator-progress-task-actions">
              {task.onEdit && (
                <ShadcnButton
                  type="button"
                  size="icon"
                  variant="outline"
                  className="creator-progress-task-action"
                  title={
                    isRunning
                      ? (t('progress.viewTaskPrompt') as string)
                      : (t('progress.editTask') as string)
                  }
                  aria-label={
                    isRunning
                      ? (t('progress.viewTaskPrompt') as string)
                      : (t('progress.editTask') as string)
                  }
                  onClick={task.onEdit}
                >
                  <PencilLine data-icon="inline-start" />
                </ShadcnButton>
              )}
              {task.onRetry && !task.retryLabel && (
                <ShadcnButton
                  type="button"
                  size="icon"
                  variant="outline"
                  className="creator-progress-task-action"
                  title={
                    task.retryLabel || (t('progress.retryFailed') as string)
                  }
                  aria-label={
                    task.retryLabel || (t('progress.retryFailed') as string)
                  }
                  onClick={task.onRetry}
                >
                  <RotateCcw data-icon="inline-start" />
                </ShadcnButton>
              )}
              {task.onDelete && (
                <ShadcnButton
                  type="button"
                  size="icon"
                  variant="outline"
                  className="creator-progress-task-action"
                  title={t('progress.deleteFailed') as string}
                  aria-label={t('progress.deleteFailed') as string}
                  onClick={task.onDelete}
                >
                  <Trash2 data-icon="inline-start" />
                </ShadcnButton>
              )}
              {task.onDismiss && (
                <ShadcnButton
                  type="button"
                  size="icon"
                  variant="outline"
                  className="creator-progress-task-action"
                  title={
                    task.dismissLabel || (t('progress.dismissTask') as string)
                  }
                  aria-label={
                    task.dismissLabel || (t('progress.dismissTask') as string)
                  }
                  onClick={task.onDismiss}
                >
                  <X data-icon="inline-start" />
                </ShadcnButton>
              )}
              {task.onAcknowledge && (
                <ShadcnButton
                  type="button"
                  size="icon"
                  variant="outline"
                  className="creator-progress-task-action"
                  title={
                    task.acknowledgeLabel ||
                    (t('progress.acknowledgeDone') as string)
                  }
                  aria-label={
                    task.acknowledgeLabel ||
                    (t('progress.acknowledgeDone') as string)
                  }
                  onClick={task.onAcknowledge}
                >
                  <Check data-icon="inline-start" />
                </ShadcnButton>
              )}
              {task.onCancel && (
                <ShadcnButton
                  type="button"
                  size="icon"
                  variant="outline"
                  className="creator-progress-task-action"
                  title={
                    isRunning
                      ? (t('progress.cancelRunning') as string)
                      : (t('progress.cancelQueued') as string)
                  }
                  aria-label={
                    isRunning
                      ? (t('progress.cancelRunning') as string)
                      : (t('progress.cancelQueued') as string)
                  }
                  onClick={task.onCancel}
                >
                  <X data-icon="inline-start" />
                </ShadcnButton>
              )}
            </span>
          ) : null;
          const thinkingStages = isInProgress
            ? buildThinkingStages(task, t)
            : [];

          return (
            <li
              key={task.key}
              className={`creator-progress-task-shell status-${task.status} ${
                isInProgress ? 'status-processing' : ''
              }`}
            >
              <BorderBeam
                active={shouldAnimateBeam}
                borderRadius={TASK_CARD_BEAM_RADIUS}
                brightness={1.25}
                className="creator-progress-task-beam"
                colorVariant="colorful"
                size="pulse-inner"
                strength={shouldAnimateBeam ? 0.7 : 0}
                theme="dark"
              >
                <div className={taskClassName}>
                  {isInProgress ? (
                    <div className="creator-progress-thinking">
                      <div className="creator-progress-thinking-head">
                        <span className="creator-progress-thinking-title">
                          {t('progress.thinking')}
                        </span>
                        <em className="creator-progress-task-status">
                          {getTaskStatusLabel(t, task.status)}
                        </em>
                        {taskActions}
                      </div>
                      <ol className="creator-progress-stage-list">
                        {thinkingStages.map((stage, index) => (
                          <li
                            key={`${task.key}-${index}-${stage.text}`}
                            className={`creator-progress-stage-item tone-${stage.tone}`}
                          >
                            <span className="creator-progress-stage-marker" />
                            <span className="creator-progress-stage-text">
                              {stage.text}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : (
                    <>
                      <div className="creator-progress-task-head">
                        <span className="creator-progress-task-dot" />
                        <span className="creator-progress-task-label">
                          {task.label}
                        </span>
                        <em className="creator-progress-task-status">
                          {getTaskStatusLabel(t, task.status)}
                        </em>
                        {taskActions}
                      </div>
                      {task.detail && (
                        <small className="creator-progress-task-detail">
                          {task.detail}
                        </small>
                      )}
                      {task.imageProgress && task.imageProgress.total > 1 && (
                        <small className="creator-progress-task-image-count">
                          {getTaskImageProgressText(task, t)}
                        </small>
                      )}
                      {task.notices && task.notices.length > 0 && (
                        <div className="creator-progress-task-notices">
                          {task.notices.map((notice, index) => (
                            <small
                              key={`${notice.tone}-${index}-${notice.text}`}
                              className={`creator-progress-task-notice tone-${notice.tone}`}
                            >
                              {notice.text}
                            </small>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {task.onRetry && task.retryLabel && (
                    <div className="creator-progress-task-primary-actions">
                      <ShadcnButton
                        type="button"
                        size="sm"
                        className="creator-progress-task-primary-action"
                        onClick={task.onRetry}
                      >
                        <RotateCcw data-icon="inline-start" />
                        <span>{task.retryLabel}</span>
                      </ShadcnButton>
                    </div>
                  )}
                  {task.progress && task.progress.total > 0 && (
                    <div className="creator-progress-task-bar">
                      <span
                        style={{
                          transform: `scaleX(${
                            Math.min(
                              100,
                              (task.progress.current / task.progress.total) *
                                100
                            ) / 100
                          })`
                        }}
                      />
                    </div>
                  )}
                  {task.progress && !isInProgress && (
                    <small className="creator-progress-task-meta">
                      {task.progressText ||
                        t('progress.batchProgress', {
                          done: task.progress.current,
                          total: task.progress.total
                        })}
                    </small>
                  )}
                  {task.status === 'failed' &&
                    task.feedbackOptions &&
                    task.feedbackOptions.length > 0 && (
                      <div className="creator-progress-feedback">
                        <small>
                          {task.feedbackSubmitted
                            ? t('progress.feedback.thanks')
                            : t('progress.feedback.title')}
                        </small>
                        {!task.feedbackSubmitted && (
                          <span>
                            {task.feedbackOptions.map((option) => (
                              <ShadcnButton
                                key={option.id}
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => task.onFeedback?.(option.id)}
                              >
                                {option.label}
                              </ShadcnButton>
                            ))}
                          </span>
                        )}
                      </div>
                    )}
                </div>
              </BorderBeam>
            </li>
          );
        })}
        {tasks.length === 0 && (
          <li className="creator-progress-empty">{t('progress.empty')}</li>
        )}
      </ul>
    </aside>
  );
}

export function GenerationRecordsRail({
  tasks,
  historyItems,
  historyTotal,
  activeGenerationId,
  dateLocale,
  historyTabLabel,
  videoPreviewLabel,
  onPreview,
  onRegenerate,
  onFavorite,
  onDownload,
  onViewMoreHistory
}: GenerationRecordsRailProps) {
  const { t: rawT } = useTranslation('imageCreate');
  const t = rawT as unknown as ImageCreateTranslate;
  const [filter, setFilter] = useState<RailFilter>('all');
  const historyGroups = useMemo(
    () => buildHistoryGroups(historyItems),
    [historyItems]
  );
  const visibleTaskPanelTasks = filter === 'all' ? tasks : [];
  const visibleGroups = useMemo(() => {
    if (filter === 'images') {
      return historyGroups.filter((group) => {
        const first = group.items[0];
        return first ? !isVideoHistoryItem(first) : false;
      });
    }
    if (filter === 'videos') {
      return historyGroups.filter((group) => {
        const first = group.items[0];
        return first ? isVideoHistoryItem(first) : false;
      });
    }
    return historyGroups;
  }, [filter, historyGroups]);
  const hasVisibleContent =
    visibleTaskPanelTasks.length > 0 || visibleGroups.length > 0;

  return (
    <aside
      className="creator-generation-rail"
      aria-label={t('historyRail.title') as string}
    >
      <header className="creator-generation-rail-head">
        <div>
          <span>{t('historyRail.eyebrow')}</span>
          <strong>{t('historyRail.title')}</strong>
        </div>
        <ShadcnButton
          type="button"
          size="sm"
          variant="outline"
          onClick={onViewMoreHistory}
          disabled={!onViewMoreHistory || historyTotal <= 0}
          title={t('history.viewMore') as string}
          aria-label={t('history.viewMore') as string}
        >
          <Sparkles data-icon="inline-start" />
          {historyTotal}
        </ShadcnButton>
      </header>

      <ToggleGroup
        type="single"
        value={filter}
        onValueChange={(value) => {
          if (!value) return;
          setFilter(value as RailFilter);
        }}
        className="creator-generation-tabs"
        aria-label={t('historyRail.title') as string}
      >
        {(['all', 'images', 'videos'] as RailFilter[]).map((item) => (
          <ToggleGroupItem
            key={item}
            value={item}
            className={filter === item ? 'active' : ''}
            aria-label={
              item === 'videos' && historyTabLabel
                ? historyTabLabel
                : (t(`historyRail.tabs.${item}`) as string)
            }
          >
            {item === 'videos' && historyTabLabel
              ? historyTabLabel
              : t(`historyRail.tabs.${item}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {visibleTaskPanelTasks.length > 0 && (
        <div className="creator-generation-queue-top">
          <GenerationTaskProgressList tasks={visibleTaskPanelTasks} />
        </div>
      )}

      <div className="creator-generation-feed">
        {visibleGroups.map((group, groupIndex) => {
          const first = group.items[0];
          if (!first) return null;
          const MediaGrid = groupIndex < 3 ? StaggeredImageGrid : 'div';
          const requestedCount = getRequestedImageCount(first);
          const gridClass =
            group.items.length === 1
              ? 'single'
              : group.items.length === 2
                ? 'double'
                : 'multi';

          return (
            <article key={group.id} className="creator-generation-card">
              <div className="creator-generation-card-meta">
                <span>{getHistoryKindLabel(first, dateLocale, t)}</span>
                <time>
                  {formatDate(getHistoryCreatedAt(first), dateLocale)}
                </time>
              </div>
              <div className="creator-generation-card-chips">
                <span>
                  {first.modelLabel ||
                    first.model ||
                    (isVideoHistoryItem(first) ? 'Video' : 'Image')}
                </span>
                {first.aspectRatio && <span>{first.aspectRatio}</span>}
                {isVideoHistoryItem(first) && first.duration ? (
                  <span>{first.duration}s</span>
                ) : null}
                {!isVideoHistoryItem(first) &&
                  (first.actualImageSize ||
                    first.imageSize ||
                    first.requestedImageSize) && (
                    <span>
                      {first.actualImageSize ||
                        first.imageSize ||
                        first.requestedImageSize}
                    </span>
                  )}
                {requestedCount > 1 && (
                  <span>
                    {group.items.length}/{requestedCount}
                  </span>
                )}
              </div>
              {first.prompt && <p>{first.prompt}</p>}
              <MediaGrid className={`creator-generation-grid ${gridClass}`}>
                {group.items.map((item, itemIndex) => (
                  <HistoryRailMedia
                    key={getHistoryItemId(item)}
                    item={item}
                    active={activeGenerationId === getHistoryItemId(item)}
                    priority={groupIndex === 0 && itemIndex < 2}
                    onPreview={onPreview}
                    videoPreviewLabel={videoPreviewLabel}
                  />
                ))}
              </MediaGrid>
              {(onRegenerate || onFavorite || onDownload) && (
                <div className="creator-generation-card-actions">
                  {onRegenerate && (
                    <ShadcnButton
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onRegenerate(first)}
                      aria-label={t('historyRail.regenerateSame') as string}
                    >
                      <RotateCcw data-icon="inline-start" />
                      <span>{t('historyRail.regenerateSame')}</span>
                    </ShadcnButton>
                  )}
                  {onFavorite && isImageHistoryItem(first) && (
                    <ShadcnButton
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onFavorite(first)}
                      aria-label={first.isFavorite ? '取消收藏' : '加入收藏'}
                    >
                      <Heart
                        data-icon="inline-start"
                        fill={first.isFavorite ? 'currentColor' : 'none'}
                      />
                      <span>{first.isFavorite ? '取消收藏' : '收藏'}</span>
                    </ShadcnButton>
                  )}
                  {onDownload && isImageHistoryItem(first) && (
                    <ShadcnButton
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onDownload(first)}
                      aria-label={t('preview.downloadOriginal') as string}
                    >
                      <Download data-icon="inline-start" />
                      <span>{t('preview.downloadOriginal')}</span>
                    </ShadcnButton>
                  )}
                </div>
              )}
            </article>
          );
        })}

        {!hasVisibleContent && (
          <div className="creator-generation-empty">
            <ImageIcon size={22} />
            <span>{t('history.empty')}</span>
          </div>
        )}
      </div>
    </aside>
  );
}
