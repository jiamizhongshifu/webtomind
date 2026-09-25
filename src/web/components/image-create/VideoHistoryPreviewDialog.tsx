import { useCallback, useMemo, useState } from 'react';
import ReactPlayer from 'react-player';
import { Check, Copy, Download, ExternalLink, PencilLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui';
import { formatDateTime } from '@/shared/dates';
import type { VisualVideoGenerationItem } from '@/services/agent-api';
import { CreationFavoriteButton } from './CreationFavoriteButton';
import { CreationPreviewDialog } from './CreationPreviewDialog';

function formatVideoBytes(value: number | null | undefined): string {
  if (!value || value <= 0) return '-';
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function getVideoFileExtension(value: string | null | undefined): string {
  if (!value) return 'mp4';
  try {
    const pathname = new URL(value).pathname;
    const match = pathname.match(/\.([a-z0-9]+)$/i);
    return match?.[1]?.toLowerCase() || 'mp4';
  } catch {
    const match = value.match(/\.([a-z0-9]+)(?:\?|#|$)/i);
    return match?.[1]?.toLowerCase() || 'mp4';
  }
}

export function VideoHistoryPreviewDialog({
  item,
  dateLocale,
  onReuse,
  onFavorite,
  favoriteLoading = false,
  onClose
}: {
  item: VisualVideoGenerationItem;
  dateLocale: string;
  onReuse?: () => void;
  onFavorite?: () => void;
  favoriteLoading?: boolean;
  onClose: () => void;
}) {
  const { i18n } = useTranslation();
  const [copied, setCopied] = useState(false);
  const isZh = i18n.language?.startsWith('zh');
  const copy = useMemo(
    () =>
      isZh
        ? {
            title: '视频详情',
            close: '关闭',
            prompt: '提示词',
            copyPrompt: '复制 Prompt',
            copied: '已复制',
            placeholder: '暂无提示词',
            model: '模型',
            time: '时间',
            ratio: '比例',
            duration: '时长',
            size: '文件',
            format: '格式',
            open: '打开视频',
            download: '下载视频',
            reuse: '重新编辑',
            favorite: '加入收藏',
            unfavorite: '取消收藏'
          }
        : {
            title: 'Video detail',
            close: 'Close',
            prompt: 'Prompt',
            copyPrompt: 'Copy prompt',
            copied: 'Copied',
            placeholder: 'No prompt',
            model: 'Model',
            time: 'Time',
            ratio: 'Ratio',
            duration: 'Duration',
            size: 'File',
            format: 'Format',
            open: 'Open video',
            download: 'Download video',
            reuse: 'Re-edit',
            favorite: 'Add to favorites',
            unfavorite: 'Remove favorite'
          },
    [isZh]
  );
  const prompt = item.prompt?.trim() || '';
  const createdAt = item.createdAt
    ? formatDateTime(item.createdAt, dateLocale)
    : '-';
  const duration = item.duration ? `${item.duration}s` : '-';
  const extension = getVideoFileExtension(item.videoUrl);

  const handleCopyPrompt = useCallback(async () => {
    if (!prompt) return;
    try {
      await navigator.clipboard?.writeText(prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }, [prompt]);

  const handleOpenVideo = useCallback(() => {
    window.open(item.videoUrl, '_blank', 'noopener,noreferrer');
  }, [item.videoUrl]);

  const handleDownloadVideo = useCallback(() => {
    window.open(item.videoUrl, '_blank', 'noopener,noreferrer');
  }, [item.videoUrl]);

  const actions = (
    <div className="creator-preview-actions creator-preview-head-action-row">
      {onReuse ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="creator-preview-reedit"
          onClick={onReuse}
        >
          <PencilLine data-icon="inline-start" />
          <span>{copy.reuse}</span>
        </Button>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="creator-preview-detail-link"
        onClick={handleOpenVideo}
      >
        <ExternalLink data-icon="inline-start" />
        <span>{copy.open}</span>
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="creator-preview-download"
        onClick={handleDownloadVideo}
      >
        <Download data-icon="inline-start" />
        <span>{copy.download}</span>
      </Button>
    </div>
  );

  return (
    <CreationPreviewDialog
      title={copy.title}
      ariaLabel={copy.title}
      closeLabel={copy.close}
      className="create-video-preview-modal"
      actions={actions}
      favoriteAction={
        onFavorite ? (
          <CreationFavoriteButton
            favorite={Boolean(item.isFavorite)}
            loading={favoriteLoading}
            favoriteLabel={copy.favorite}
            unfavoriteLabel={copy.unfavorite}
            onClick={onFavorite}
          />
        ) : undefined
      }
      onClose={onClose}
      media={
        <div className="creator-preview-image create-video-preview-player">
          <ReactPlayer
            className="creator-video-player"
            src={item.videoUrl}
            light={item.posterUrl}
            controls
            playsInline
            width="100%"
            height="100%"
          />
        </div>
      }
      details={
        <aside className="creator-preview-side">
          <div className="creator-preview-prompt">
            <div className="creator-preview-prompt-head">
              <span>{copy.prompt}</span>
              {prompt ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleCopyPrompt}
                >
                  {copied ? (
                    <Check data-icon="inline-start" />
                  ) : (
                    <Copy data-icon="inline-start" />
                  )}
                  {copied ? copy.copied : copy.copyPrompt}
                </Button>
              ) : null}
            </div>
            <pre>{prompt || copy.placeholder}</pre>
          </div>

          <dl className="creator-preview-meta">
            <div>
              <dt>{copy.model}</dt>
              <dd>{item.modelLabel || item.model || '-'}</dd>
            </div>
            <div>
              <dt>{copy.time}</dt>
              <dd>{createdAt}</dd>
            </div>
            <div>
              <dt>{copy.ratio}</dt>
              <dd>{item.aspectRatio || '-'}</dd>
            </div>
            <div>
              <dt>{copy.duration}</dt>
              <dd>{duration}</dd>
            </div>
            <div>
              <dt>{copy.size}</dt>
              <dd>{formatVideoBytes(item.byteSize)}</dd>
            </div>
            <div>
              <dt>{copy.format}</dt>
              <dd>{extension}</dd>
            </div>
          </dl>
        </aside>
      }
    />
  );
}
