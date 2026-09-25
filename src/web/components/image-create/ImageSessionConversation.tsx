import {
  CheckCircle2,
  Download,
  ImageOff,
  PencilLine,
  RefreshCw,
  X
} from 'lucide-react';
import type { VisualVideoGenerationItem } from '@/services/agent-api';
import type {
  ImageCreationTurn,
  VisualMoodboard
} from '@/shared/create-workspace-v2';
import type { GenerationRecordTask } from './GenerationRecordsRail';
import { ImageSessionResultCard } from './ImageSessionResultCard';
import { DiscoveryImageMoodboardActions } from '../create-workspace/DiscoveryImageMoodboardActions';
import type { CreationSessionHistoryItem } from './useImageSessionConversation';

interface ImageSessionConversationProps {
  turns: ImageCreationTurn[];
  historyById: Record<string, CreationSessionHistoryItem>;
  missingIds: string[];
  mediaType?: 'image' | 'video';
  isEnglish?: boolean;
  loading?: boolean;
  progressTasks?: GenerationRecordTask[];
  onPreview: (item: CreationSessionHistoryItem) => void;
  onDownload: (item: CreationSessionHistoryItem) => void;
  onRegenerate: (item: CreationSessionHistoryItem) => void;
  onReedit?: (item: CreationSessionHistoryItem) => void;
  onEditInEditor?: (item: CreationSessionHistoryItem) => void;
  onRetryTurn?: (turn: ImageCreationTurn) => void;
  onFavorite?: (item: CreationSessionHistoryItem) => void;
  onDelete?: (item: CreationSessionHistoryItem) => Promise<void> | void;
  onCopyPrompt: (prompt: string) => Promise<boolean> | boolean | void;
  activationMilestone?: FirstCreationMilestone | null;
  onActivationAction?: (
    action: 'continue_editing' | 'download' | 'favorite' | 'save_to_moodboard'
  ) => void;
  moodboardSave?: {
    boards: VisualMoodboard[];
    selectedBoardId: string;
    prefix: string;
    isEnglish: boolean;
    saved: boolean;
    saving: boolean;
    onSelectBoard: (boardId: string) => void;
    onSave: () => void;
  } | null;
}

export interface FirstCreationMilestone {
  generationIds: string[];
  rewardStatus: 'pending' | 'granted' | 'unavailable';
}

function toCssAspectRatio(value?: string) {
  const match = value?.trim().match(/^(\d+(?:\.\d+)?):([1-9]\d*(?:\.\d+)?)$/);
  if (!match) return '1 / 1';
  return `${match[1]} / ${match[2]}`;
}

function isVideoItem(
  item: CreationSessionHistoryItem
): item is VisualVideoGenerationItem {
  return 'videoUrl' in item;
}

function getResultAspectRatio(item: CreationSessionHistoryItem) {
  if (!isVideoItem(item) && item.width && item.height) {
    return `${item.width} / ${item.height}`;
  }
  return toCssAspectRatio(item.aspectRatio || undefined);
}

const TURN_STATUS_LABELS: Record<ImageCreationTurn['status'], string> = {
  pending: '排队中',
  running: '生成中',
  partial: '部分完成',
  succeeded: '已完成',
  failed: '生成失败'
};

function ImageTaskSkeletonTurn({
  task,
  onCopyPrompt,
  mediaType
}: {
  task: GenerationRecordTask;
  onCopyPrompt: (prompt: string) => Promise<boolean> | boolean | void;
  mediaType: 'image' | 'video';
}) {
  const imageCount = Math.max(
    1,
    Math.min(4, task.imageProgress?.total || task.imageCount || 1)
  );
  const aspectRatio = toCssAspectRatio(task.aspectRatio);
  const isWaitingForResult = task.status === 'succeeded';

  return (
    <article
      className="image-session-turn image-session-task-turn"
      data-status={task.status}
      aria-live="polite"
    >
      <div className="image-session-turn-layout">
        <header className="image-session-prompt image-session-prompt-panel">
          <div className="image-session-prompt-copy-shell">
            <button
              type="button"
              className="image-session-prompt-scroll is-copyable"
              aria-label="复制本次生成提示词"
              title="点击复制提示词"
              onClick={() => void onCopyPrompt(task.prompt || '')}
            >
              <p>{task.prompt || '未填写提示词'}</p>
            </button>
          </div>
          <div className="image-session-prompt-footer">
            <div className="image-session-prompt-meta">
              <em>{task.label}</em>
            </div>
            {task.modelLabel && (
              <span className="image-session-prompt-model">
                {task.modelLabel}
              </span>
            )}
          </div>
          {(task.onEdit || task.onCancel) && (
            <div className="image-session-task-actions">
              {task.onEdit && (
                <button
                  type="button"
                  aria-label="查看任务提示词"
                  title="查看任务提示词"
                  onClick={task.onEdit}
                >
                  <PencilLine />
                </button>
              )}
              {task.onCancel && (
                <button
                  type="button"
                  aria-label="取消生成任务"
                  title="取消生成任务"
                  onClick={task.onCancel}
                >
                  <X />
                </button>
              )}
            </div>
          )}
        </header>
        <div
          className="image-session-skeleton-grid"
          data-count={imageCount}
          aria-label={
            isWaitingForResult
              ? '正在载入生成结果'
              : `正在生成${mediaType === 'video' ? '视频' : '图片'}`
          }
        >
          {Array.from({ length: imageCount }, (_, index) => (
            <div
              key={`${task.key}-skeleton-${index}`}
              className="image-session-image-skeleton"
              style={{ aspectRatio }}
            >
              <div>
                <RefreshCw className="creator-spin-icon" />
                <small>
                  {isWaitingForResult
                    ? '正在载入结果'
                    : task.detail || task.label}
                </small>
              </div>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

export function ImageSessionConversation({
  turns,
  historyById,
  missingIds,
  loading = false,
  progressTasks = [],
  mediaType = 'image',
  isEnglish = false,
  onPreview,
  onDownload,
  onRegenerate,
  onReedit,
  onEditInEditor,
  onRetryTurn,
  onFavorite,
  onDelete,
  onCopyPrompt,
  activationMilestone = null,
  onActivationAction,
  moodboardSave = null
}: ImageSessionConversationProps) {
  if (turns.length === 0 && progressTasks.length === 0) return null;
  const missing = new Set(missingIds);

  return (
    <section
      className="image-session-conversation"
      data-media-type={mediaType}
      aria-label="当前创作会话"
    >
      {turns.map((turn) => {
        const results = turn.generationIds
          .map((id) => historyById[id])
          .filter((item): item is CreationSessionHistoryItem => Boolean(item));
        const modelLabel = results[0]?.modelLabel || results[0]?.model || '';
        const showsActivationMilestone = Boolean(
          mediaType === 'image' &&
          activationMilestone?.generationIds.some((id) =>
            turn.generationIds.includes(id)
          ) &&
          results.length > 0
        );
        return (
          <article
            key={turn.id}
            className="image-session-turn"
            data-status={turn.status}
          >
            <div className="image-session-turn-layout">
              <header className="image-session-prompt image-session-prompt-panel">
                <div className="image-session-prompt-copy-shell">
                  <button
                    type="button"
                    className="image-session-prompt-scroll is-copyable"
                    aria-label="复制本次生成提示词"
                    title="点击复制提示词"
                    onClick={() => void onCopyPrompt(turn.prompt || '')}
                  >
                    <p>{turn.prompt || '未填写提示词'}</p>
                  </button>
                </div>
                <div className="image-session-prompt-footer">
                  <div className="image-session-prompt-meta">
                    {turn.context.moodboard && <span>Moodboard</span>}
                    {turn.context.recipeId && <span>可视化配方</span>}
                    {turn.status !== 'succeeded' && (
                      <em>{TURN_STATUS_LABELS[turn.status]}</em>
                    )}
                  </div>
                  {modelLabel && (
                    <span className="image-session-prompt-model">
                      {modelLabel}
                    </span>
                  )}
                </div>
                {turn.errorMessage && (
                  <p className="image-session-error">{turn.errorMessage}</p>
                )}
              </header>
              <div
                className="image-session-result-grid"
                data-count={Math.max(1, turn.generationIds.length)}
              >
                {results.map((item) => (
                  <ImageSessionResultCard
                    key={isVideoItem(item) ? item.generationId : item.id}
                    item={item}
                    prompt={turn.prompt}
                    aspectRatio={getResultAspectRatio(item)}
                    onPreview={onPreview}
                    onDownload={(result) => {
                      if (showsActivationMilestone) {
                        onActivationAction?.('download');
                      }
                      onDownload(result);
                    }}
                    onRegenerate={onRegenerate}
                    onFavorite={
                      onFavorite
                        ? (result) => {
                            if (showsActivationMilestone) {
                              onActivationAction?.('favorite');
                            }
                            onFavorite(result);
                          }
                        : undefined
                    }
                    onDelete={onDelete}
                    onEdit={onEditInEditor}
                    isEnglish={isEnglish}
                  />
                ))}
                {turn.generationIds
                  .filter((id) => missing.has(id))
                  .map((id) => (
                    <div key={id} className="image-session-missing">
                      <ImageOff />
                      <span>
                        {mediaType === 'video' ? '视频' : '图片'}
                        已删除或暂不可用
                      </span>
                    </div>
                  ))}
                {loading &&
                  results.length === 0 &&
                  turn.generationIds.length > 0 && (
                    <div className="image-session-loading">
                      <RefreshCw className="creator-spin-icon" />
                      <span>正在恢复生成结果…</span>
                    </div>
                  )}
                {turn.status === 'failed' &&
                  turn.generationIds.length === 0 && (
                    <div className="image-session-missing">
                      <ImageOff />
                      <span>
                        本次生成失败，未产生
                        {mediaType === 'video' ? '视频' : '图片'}
                      </span>
                    </div>
                  )}
              </div>
            </div>
            {showsActivationMilestone ? (
              <div
                className="image-session-activation-milestone"
                role="status"
                aria-label="首图创作完成"
              >
                <CheckCircle2 aria-hidden="true" />
                <span>
                  <strong>第一张商业图完成</strong>
                  <small>
                    {activationMilestone?.rewardStatus === 'granted'
                      ? '+15 积分已到账'
                      : activationMilestone?.rewardStatus === 'pending'
                        ? '正在核验首图奖励…'
                        : '可以继续修改、下载或收藏'}
                  </small>
                </span>
              </div>
            ) : null}
            {results.length > 0 && (
              <div className="image-session-turn-actions">
                {onReedit && !isVideoItem(results[0]) ? (
                  <button
                    type="button"
                    className="is-primary"
                    onClick={() => {
                      if (showsActivationMilestone) {
                        onActivationAction?.('continue_editing');
                      }
                      onReedit(results[0]);
                    }}
                  >
                    <PencilLine /> 继续修改
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onRegenerate(results[0])}
                  >
                    <RefreshCw /> 再次生成
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (showsActivationMilestone) {
                      onActivationAction?.('download');
                    }
                    results.forEach((item) => onDownload(item));
                  }}
                >
                  <Download /> 下载
                </button>
                {showsActivationMilestone && moodboardSave ? (
                  <DiscoveryImageMoodboardActions
                    boards={moodboardSave.boards}
                    selectedBoardId={moodboardSave.selectedBoardId}
                    prefix={moodboardSave.prefix}
                    isEnglish={moodboardSave.isEnglish}
                    saved={moodboardSave.saved}
                    saving={moodboardSave.saving}
                    onSelectBoard={moodboardSave.onSelectBoard}
                    onSave={() => {
                      onActivationAction?.('save_to_moodboard');
                      moodboardSave.onSave();
                    }}
                  />
                ) : null}
              </div>
            )}
            {turn.status === 'failed' && onRetryTurn ? (
              <div className="image-session-turn-actions">
                <button
                  type="button"
                  className="is-primary"
                  onClick={() => onRetryTurn(turn)}
                >
                  <RefreshCw /> 重试生成
                </button>
              </div>
            ) : null}
          </article>
        );
      })}
      {progressTasks.map((task) => (
        <ImageTaskSkeletonTurn
          key={task.key}
          task={task}
          onCopyPrompt={onCopyPrompt}
          mediaType={mediaType}
        />
      ))}
    </section>
  );
}
