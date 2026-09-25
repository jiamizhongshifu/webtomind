/**
 * 历史生成结果预览弹窗。
 *
 * 展示 item 的大图 + 元信息 + prompt + 复制/重新编辑。
 * - previewCopied(复制成功 toast)是局部 UI 态,组件自持
 * - ESC 关闭组件自持
 * - 复制走父级 onCopyPrompt(复用父级 writeToClipboard + 统一错误提示)
 * - 重新编辑是跨域操作(写 selection/settings/promptMode),留父级,onReedit 注入
 * - 删除走父级 onDelete(调用 API + 刷新历史),组件只负责确认和 loading 态
 */

import { useEffect, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useTranslation } from 'react-i18next';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Wand2,
  Trash2,
  Loader2,
  RotateCcw,
  ZoomIn
} from 'lucide-react';
import type { VisualImageHistoryItem } from '@/services/agent-api';
import { getVisualImageDisplayUrl } from '@/shared/visual-image-display';
import { formatDateTime } from '@/shared/dates';
import {
  useVisualImageCache,
  type VisualImageCacheVariant
} from '@/shared/useVisualImageCache';
import { sanitizeLegacyAutoNegativePrompt } from '@/shared/image-negative-prompt';
import { Button, imageFetchPriority } from '@/shared/ui';
import { cn } from '@/lib/utils';
import type { ResolvedVisualRecipeAsset } from './assetLibraryResolver';
import { CreationFavoriteButton } from './CreationFavoriteButton';
import { CreationPreviewDialog } from './CreationPreviewDialog';
import { VisualRecipeSummary } from './VisualRecipeSummary';

export interface HistoryPreviewModalProps {
  item: VisualImageHistoryItem;
  dateLocale: string;
  onClose: () => void;
  onReedit?: (item: VisualImageHistoryItem) => void;
  onRegenerate?: (item: VisualImageHistoryItem) => void;
  onDelete?: (item: VisualImageHistoryItem) => Promise<void>;
  onCopyPrompt?: (text: string) => Promise<boolean>;
  onFavorite?: (item: VisualImageHistoryItem) => void;
  favoriteLoading?: boolean;
  onOpenImage?: (item: VisualImageHistoryItem) => void;
  onDownloadOriginal?: (item: VisualImageHistoryItem) => void;
  onLocalEdit?: (item: VisualImageHistoryItem) => void;
  canNavigate?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  recipeAssets?: ResolvedVisualRecipeAsset[];
  getRecipeSlotLabel?: (slot: ResolvedVisualRecipeAsset['slot']) => string;
  onCreateFromRecipe?: (
    item: VisualImageHistoryItem,
    assets: ResolvedVisualRecipeAsset[]
  ) => void;
}

function getCacheVariantForUrl(
  item: VisualImageHistoryItem,
  sourceUrl: string
): VisualImageCacheVariant {
  if (sourceUrl && sourceUrl === item.thumbnailUrl) return 'thumbnail';
  if (sourceUrl && sourceUrl === item.imageUrl) return 'original';
  return 'preview';
}

export function HistoryPreviewModal({
  item,
  dateLocale,
  onClose,
  onReedit,
  onRegenerate,
  onDelete,
  onCopyPrompt,
  onFavorite,
  favoriteLoading = false,
  onOpenImage,
  onDownloadOriginal,
  onLocalEdit,
  canNavigate = false,
  onPrevious,
  onNext,
  recipeAssets = [],
  getRecipeSlotLabel = (slot) => slot,
  onCreateFromRecipe
}: HistoryPreviewModalProps) {
  const { t } = useTranslation('imageCreate');
  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [shouldLoadPreview, setShouldLoadPreview] = useState(false);
  const displayNegativePrompt = sanitizeLegacyAutoNegativePrompt(
    item.negativePrompt
  );
  const thumbnailImageSourceUrl =
    getVisualImageDisplayUrl(item, 'thumbnail') || '';
  const previewImageSourceUrl = getVisualImageDisplayUrl(item, 'preview') || '';
  const hasSeparateThumbnail =
    Boolean(thumbnailImageSourceUrl) &&
    thumbnailImageSourceUrl !== previewImageSourceUrl;
  const thumbnailImageUrl = useVisualImageCache({
    id: item.id,
    sourceUrl: hasSeparateThumbnail ? thumbnailImageSourceUrl : null,
    variant: 'thumbnail',
    strategy: 'cache-first'
  });
  const previewImageUrl = useVisualImageCache({
    id: item.id,
    sourceUrl: shouldLoadPreview ? previewImageSourceUrl : null,
    variant: getCacheVariantForUrl(item, previewImageSourceUrl),
    strategy: 'network-immediate'
  });
  const isImageReady =
    previewLoaded || (hasSeparateThumbnail && thumbnailLoaded);
  const actualImageSize =
    item.actualImageSize ||
    (item.width && item.height ? `${item.width}x${item.height}` : '');
  const requestedImageSize = item.requestedImageSize || item.imageSize || '';
  const showRequestedImageSize =
    requestedImageSize && requestedImageSize !== actualImageSize;
  // Shared overlay shell owns Escape/focus/scroll; this component owns history navigation.
  useEffect(() => {
    setCopied(false);
    setDeleteError('');
    setIsDeleting(false);
  }, [item]);

  useHotkeys(
    'arrowleft,arrowright',
    (event) => {
      if (event.key === 'ArrowLeft') onPrevious?.();
      else onNext?.();
    },
    { enabled: canNavigate },
    [onNext, onPrevious]
  );

  useEffect(() => {
    setThumbnailLoaded(false);
    setPreviewLoaded(false);
    setShouldLoadPreview(false);
    if (!previewImageSourceUrl) return;

    const timer = window.setTimeout(
      () => setShouldLoadPreview(true),
      hasSeparateThumbnail ? 80 : 0
    );
    return () => window.clearTimeout(timer);
  }, [hasSeparateThumbnail, item.id, previewImageSourceUrl]);

  const handleCopy = async () => {
    if (!onCopyPrompt) return;
    const negativePrompt = displayNegativePrompt || '';
    const text = negativePrompt
      ? `${item.prompt.trim()}\n\nNegative prompt: ${negativePrompt}`
      : item.prompt.trim();
    const ok = await onCopyPrompt(text);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (isDeleting) return;
    const confirmed = window.confirm(t('preview.deleteConfirm') as string);
    if (!confirmed) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      await onDelete(item);
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : (t('preview.deleteFailed') as string)
      );
      setIsDeleting(false);
    }
  };

  const handleLocalEdit = () => onLocalEdit?.(item);

  const actions = (
    <div className="creator-preview-actions creator-preview-head-action-row">
      {onRegenerate && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="creator-preview-regenerate"
          disabled={isDeleting}
          onClick={() => onRegenerate(item)}
        >
          <RotateCcw data-icon="inline-start" />
          {t('historyRail.regenerateSame')}
        </Button>
      )}
      {onDelete && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="creator-preview-delete"
          disabled={isDeleting}
          onClick={handleDelete}
        >
          {isDeleting ? (
            <Loader2 data-icon="inline-start" className="creator-spin-icon" />
          ) : (
            <Trash2 data-icon="inline-start" />
          )}
          {isDeleting ? t('preview.deleting') : t('preview.delete')}
        </Button>
      )}
      {onDownloadOriginal && item.imageUrl && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="creator-preview-download"
          disabled={isDeleting}
          onClick={() => onDownloadOriginal(item)}
        >
          <Download data-icon="inline-start" />
          {t('preview.downloadOriginal')}
        </Button>
      )}
      {onLocalEdit && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="creator-preview-local-edit"
          disabled={isDeleting}
          onClick={handleLocalEdit}
        >
          <Wand2 data-icon="inline-start" />
          {t('preview.localEdit')}
        </Button>
      )}
      {onReedit && !onLocalEdit && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="creator-preview-reedit"
          disabled={isDeleting}
          onClick={() => onReedit(item)}
        >
          <Wand2 data-icon="inline-start" />
          {t('preview.reedit')}
        </Button>
      )}
    </div>
  );

  return (
    <CreationPreviewDialog
      title={t('preview.title')}
      ariaLabel={t('preview.title') as string}
      closeLabel={t('preview.close') as string}
      actions={actions}
      favoriteAction={
        onFavorite ? (
          <CreationFavoriteButton
            favorite={Boolean(item.isFavorite)}
            loading={favoriteLoading}
            disabled={isDeleting}
            onClick={() => onFavorite(item)}
          />
        ) : undefined
      }
      onClose={onClose}
      media={
        <div className="creator-preview-image">
          {canNavigate && onPrevious && onNext && (
            <>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="creator-preview-nav prev"
                aria-label={t('promptCases.previousImage') as string}
                onClick={(event) => {
                  event.stopPropagation();
                  onPrevious();
                }}
              >
                <ChevronLeft data-icon="inline-start" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="creator-preview-nav next"
                aria-label={t('promptCases.nextImage') as string}
                onClick={(event) => {
                  event.stopPropagation();
                  onNext();
                }}
              >
                <ChevronRight data-icon="inline-start" />
              </Button>
            </>
          )}
          <button
            type="button"
            className={cn(
              'creator-preview-image-zoom create-gallery-preview-image-button',
              isImageReady ? 'is-loaded' : 'is-loading'
            )}
            onClick={() => onOpenImage?.(item)}
            aria-label={t('preview.openFullscreen') as string}
          >
            {thumbnailImageUrl && hasSeparateThumbnail && (
              <img
                className={`creator-preview-image-thumb ${
                  thumbnailLoaded ? 'is-loaded' : ''
                }`}
                src={thumbnailImageUrl}
                alt=""
                loading="eager"
                decoding="async"
                {...imageFetchPriority('high')}
                referrerPolicy="no-referrer"
                onLoad={() => setThumbnailLoaded(true)}
              />
            )}
            {previewImageUrl && (
              <img
                className={`creator-preview-image-main ${
                  previewLoaded ? 'is-loaded' : ''
                }`}
                src={previewImageUrl}
                alt=""
                loading="eager"
                decoding="async"
                {...imageFetchPriority(hasSeparateThumbnail ? 'auto' : 'high')}
                referrerPolicy="no-referrer"
                onLoad={() => setPreviewLoaded(true)}
              />
            )}
            {!isImageReady && (
              <span className="creator-preview-image-loading">
                <Loader2 size={18} />
                {t('history.thumbnailPreparing', {
                  defaultValue: '图片加载中'
                })}
              </span>
            )}
            <span aria-hidden>
              <ZoomIn size={18} />
            </span>
          </button>
        </div>
      }
      details={
        <div className="creator-preview-side">
          <VisualRecipeSummary
            assets={recipeAssets}
            getSlotLabel={getRecipeSlotLabel}
            label={
              t('preview.visualRecipe', {
                defaultValue: '可视化配方'
              }) as string
            }
            createLabel={
              t('preview.createFromRecipe', {
                defaultValue: '按配方创作'
              }) as string
            }
            onCreateFromRecipe={
              onCreateFromRecipe
                ? () => onCreateFromRecipe(item, recipeAssets)
                : undefined
            }
          />
          <div className="creator-preview-prompt">
            <div className="creator-preview-prompt-head">
              <span>{t('preview.promptLabel')}</span>
              {onCopyPrompt && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check data-icon="inline-start" />
                  ) : (
                    <Copy data-icon="inline-start" />
                  )}
                  {copied ? t('preview.copied') : t('preview.copyPrompt')}
                </Button>
              )}
            </div>
            <pre>{item.prompt}</pre>
            {displayNegativePrompt && (
              <>
                <span className="creator-preview-prompt-sub">
                  {t('preview.negativeLabel')}
                </span>
                <pre>{displayNegativePrompt}</pre>
              </>
            )}
          </div>
          <dl className="creator-preview-meta">
            <div>
              <dt>{t('preview.meta.model')}</dt>
              <dd>{item.modelLabel || item.model || '—'}</dd>
            </div>
            <div>
              <dt>{t('preview.meta.time')}</dt>
              <dd>{formatDateTime(item.createdAt, dateLocale)}</dd>
            </div>
            <div>
              <dt>{t('preview.meta.aspectRatio')}</dt>
              <dd>{item.aspectRatio || '—'}</dd>
            </div>
            <div>
              <dt>{t('preview.meta.imageSize')}</dt>
              <dd>
                {actualImageSize || requestedImageSize || '—'}
                {showRequestedImageSize && (
                  <small className="creator-preview-meta-note">
                    {t('preview.meta.requestedImageSize', {
                      size: requestedImageSize
                    })}
                  </small>
                )}
              </dd>
            </div>
            <div>
              <dt>{t('preview.meta.quality')}</dt>
              <dd>{item.quality || '—'}</dd>
            </div>
            <div>
              <dt>{t('preview.meta.outputFormat')}</dt>
              <dd>{item.outputFormat || '—'}</dd>
            </div>
          </dl>
          {deleteError && (
            <p className="creator-preview-delete-error">{deleteError}</p>
          )}
        </div>
      }
    />
  );
}
