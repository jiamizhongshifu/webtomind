/**
 * 右上角全局任务进度面板。
 *
 * 纯展示组件 — 任务列表由父组件(ImageCreatePage)从 isGenerating / batchRunning /
 * batchStats 等状态派生好(label 已本地化)后通过 tasks 传入。
 * 组件只自持"折叠/展开"这个纯 UI 状态(localStorage 记忆)。
 * 即使 tasks 为空也常驻在工作台,方便用户随时确认队列状态。
 */

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  Sparkles,
  ChevronDown,
  PencilLine,
  RotateCcw,
  Trash2,
  X
} from 'lucide-react';
import { Button } from '@/shared/ui/radix/button';

export interface ProgressTask {
  key: string;
  label: string;
  status: 'processing' | 'queued' | 'failed' | 'succeeded' | 'cancelled';
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

const STORAGE_KEY = 'creator-progress-collapsed';

export function GenerationProgressPanel({
  tasks,
  embedded = false,
  showHeader = true
}: {
  tasks: ProgressTask[];
  embedded?: boolean;
  showHeader?: boolean;
}) {
  const { t } = useTranslation('imageCreate');
  const activeTaskCount = tasks.filter(
    (task) => task.status === 'processing' || task.status === 'queued'
  ).length;
  const visibleTaskCount = tasks.length;
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        // localStorage 不可用就不持久化,运行时不影响
      }
      return next;
    });
  }, []);
  const panelClassName = [
    'creator-progress-panel',
    embedded ? 'embedded' : '',
    showHeader ? '' : 'headless',
    showHeader && collapsed ? 'collapsed' : ''
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <aside
      className={panelClassName}
      aria-live="polite"
      aria-label={t('progress.title') as string}
    >
      {showHeader && (
        <Button
          type="button"
          variant="ghost"
          className="creator-progress-panel-head"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          title={
            collapsed
              ? (t('progress.expand') as string)
              : (t('progress.collapse') as string)
          }
        >
          <span className="creator-progress-panel-indicator">
            <Sparkles
              data-icon="inline-start"
              className={activeTaskCount > 0 ? 'creator-spin-icon' : undefined}
            />
          </span>
          <span className="creator-progress-panel-title">
            {t('progress.title')}
          </span>
          <span className="creator-progress-panel-count">
            {visibleTaskCount}
          </span>
          <ChevronDown
            data-icon="inline-start"
            className={`creator-progress-panel-chevron ${
              collapsed ? 'flip' : ''
            }`}
          />
        </Button>
      )}
      {(!showHeader || !collapsed) && (
        <ul className="creator-progress-panel-body">
          {tasks.length === 0 && (
            <li className="creator-progress-empty">{t('progress.empty')}</li>
          )}
          {tasks.map((task) => (
            <li
              key={task.key}
              className={`creator-progress-task status-${task.status}`}
            >
              <div className="creator-progress-task-head">
                <span className="creator-progress-task-dot" />
                <span className="creator-progress-task-label">
                  {task.label}
                </span>
                <em className="creator-progress-task-status">
                  {t(`historyRail.status.${task.status}`)}
                </em>
                {(task.onEdit ||
                  task.onCancel ||
                  task.onRetry ||
                  task.onAcknowledge ||
                  task.onDelete ||
                  task.onDismiss) && (
                  <span className="creator-progress-task-actions">
                    {task.onEdit && (
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="creator-progress-task-action"
                        title={
                          task.status === 'processing'
                            ? (t('progress.viewTaskPrompt') as string)
                            : (t('progress.editTask') as string)
                        }
                        aria-label={
                          task.status === 'processing'
                            ? (t('progress.viewTaskPrompt') as string)
                            : (t('progress.editTask') as string)
                        }
                        onClick={task.onEdit}
                      >
                        <PencilLine data-icon="inline-start" />
                      </Button>
                    )}
                    {task.onRetry && !task.retryLabel && (
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="creator-progress-task-action"
                        title={
                          task.retryLabel ||
                          (t('progress.retryFailed') as string)
                        }
                        aria-label={
                          task.retryLabel ||
                          (t('progress.retryFailed') as string)
                        }
                        onClick={task.onRetry}
                      >
                        <RotateCcw data-icon="inline-start" />
                      </Button>
                    )}
                    {task.onDelete && (
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="creator-progress-task-action"
                        title={t('progress.deleteFailed') as string}
                        aria-label={t('progress.deleteFailed') as string}
                        onClick={task.onDelete}
                      >
                        <Trash2 data-icon="inline-start" />
                      </Button>
                    )}
                    {task.onDismiss && (
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="creator-progress-task-action"
                        title={
                          task.dismissLabel ||
                          (t('progress.dismissTask') as string)
                        }
                        aria-label={
                          task.dismissLabel ||
                          (t('progress.dismissTask') as string)
                        }
                        onClick={task.onDismiss}
                      >
                        <X data-icon="inline-start" />
                      </Button>
                    )}
                    {task.onAcknowledge && (
                      <Button
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
                      </Button>
                    )}
                    {task.onCancel && (
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="creator-progress-task-action"
                        title={
                          task.status === 'processing'
                            ? (t('progress.cancelRunning') as string)
                            : (t('progress.cancelQueued') as string)
                        }
                        aria-label={
                          task.status === 'processing'
                            ? (t('progress.cancelRunning') as string)
                            : (t('progress.cancelQueued') as string)
                        }
                        onClick={task.onCancel}
                      >
                        <X data-icon="inline-start" />
                      </Button>
                    )}
                  </span>
                )}
              </div>
              {task.detail && (
                <small className="creator-progress-task-detail">
                  {task.detail}
                </small>
              )}
              {task.imageProgress && task.imageProgress.total > 1 && (
                <small className="creator-progress-task-image-count">
                  {typeof task.imageProgress.current === 'number'
                    ? t('progress.imageProgress', {
                        done: task.imageProgress.current,
                        total: task.imageProgress.total
                      })
                    : t('progress.imageTarget', {
                        total: task.imageProgress.total
                      })}
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
              {task.onRetry && task.retryLabel && (
                <div className="creator-progress-task-primary-actions">
                  <Button
                    type="button"
                    size="sm"
                    className="creator-progress-task-primary-action"
                    onClick={task.onRetry}
                  >
                    <RotateCcw data-icon="inline-start" />
                    <span>{task.retryLabel}</span>
                  </Button>
                </div>
              )}
              {task.progress && task.progress.total > 0 && (
                <div className="creator-progress-task-bar">
                  <span
                    style={{
                      transform: `scaleX(${
                        Math.min(
                          100,
                          (task.progress.current / task.progress.total) * 100
                        ) / 100
                      })`
                    }}
                  />
                </div>
              )}
              {task.progress && (
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
                          <Button
                            key={option.id}
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => task.onFeedback?.(option.id)}
                          >
                            {option.label}
                          </Button>
                        ))}
                      </span>
                    )}
                  </div>
                )}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
