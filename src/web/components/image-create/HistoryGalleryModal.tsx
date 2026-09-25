import { useTranslation } from 'react-i18next';
import { ImageIcon, Loader2, X } from 'lucide-react';
import { Button } from '@/shared/ui/radix/button';
import { cn } from '@/lib/utils';
import type { VisualImageHistoryItem } from '@/services/agent-api';
import { useOverlayBehavior } from '@/shared/ui';
import { useVisualImageCache } from '@/shared/useVisualImageCache';
import { StaggeredImageGrid } from './StaggeredImageGrid';

export interface HistoryGalleryModalProps {
  mode?: 'preview' | 'reference-picker';
  items: VisualImageHistoryItem[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  error: string;
  dateLocale: string;
  onClose: () => void;
  onSelect: (item: VisualImageHistoryItem) => void;
  selectedIds?: string[];
  importingId?: string | null;
  confirmingReferences?: boolean;
  title?: string;
  onToggleReference?: (id: string) => void | Promise<void>;
  onConfirmReferences?: () => void;
  onLoadMore: () => void;
}

function getHistoryReferenceKey(item: VisualImageHistoryItem): string {
  return item.id;
}

function getGalleryImageUrl(item: VisualImageHistoryItem): string {
  return item.previewUrl || item.imageUrl || item.thumbnailUrl || '';
}

function getGalleryCacheVariant(
  item: VisualImageHistoryItem
): 'thumbnail' | 'preview' | 'original' {
  if (item.previewUrl) return 'preview';
  if (item.imageUrl) return 'original';
  return 'thumbnail';
}

function HistoryGalleryImage({ item }: { item: VisualImageHistoryItem }) {
  const sourceUrl = getGalleryImageUrl(item);
  const imageUrl = useVisualImageCache({
    id: item.id,
    sourceUrl,
    variant: getGalleryCacheVariant(item),
    strategy: 'network-immediate'
  });

  return imageUrl ? (
    <img src={imageUrl} alt="" loading="lazy" decoding="async" />
  ) : (
    <div className="creator-history-modal-card-placeholder">
      <ImageIcon size={22} />
    </div>
  );
}

export function HistoryGalleryModal({
  mode = 'preview',
  items,
  total,
  loading,
  loadingMore,
  error,
  dateLocale,
  onClose,
  onSelect,
  selectedIds = [],
  importingId = null,
  confirmingReferences = false,
  title,
  onToggleReference,
  onConfirmReferences,
  onLoadMore
}: HistoryGalleryModalProps) {
  const { t } = useTranslation('imageCreate');
  const canLoadMore = total > items.length;
  const isReferencePicker = mode === 'reference-picker';
  const modalTitle =
    title || (isReferencePicker ? '从图库选择参考图' : t('history.modalTitle'));
  const modalRef = useOverlayBehavior<HTMLElement>({
    open: true,
    onClose
  });

  return (
    <div
      className={`creator-preview-backdrop ${
        isReferencePicker ? 'creator-history-modal-backdrop' : ''
      }`}
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        ref={modalRef}
        className="creator-preview creator-history-modal"
        role="dialog"
        aria-modal="true"
        aria-label={modalTitle as string}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="creator-preview-head">
          <div className="creator-history-modal-title">
            <span>{modalTitle}</span>
            <small>
              {total > items.length
                ? t('history.modalCountLoaded', {
                    loaded: items.length,
                    total
                  })
                : t('history.modalCount', { count: items.length })}
            </small>
          </div>
          {isReferencePicker && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="creator-history-modal-confirm"
              disabled={confirmingReferences}
              onClick={onConfirmReferences}
            >
              {confirmingReferences
                ? '正在导入...'
                : `使用 ${selectedIds.length} 张`}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('preview.close') as string}
            onClick={onClose}
          >
            <X />
          </Button>
        </div>

        <div className="creator-history-modal-body">
          {loading && items.length === 0 ? (
            <div className="creator-history-modal-state">
              <Loader2 className="creator-spin-icon" size={24} />
              <span>{t('history.loading')}</span>
            </div>
          ) : items.length > 0 ? (
            <StaggeredImageGrid
              className="creator-history-modal-grid"
              observeAdditions
            >
              {items.map((item) => {
                const referenceKey = getHistoryReferenceKey(item);
                const isImporting = importingId === referenceKey;
                const isSelected =
                  selectedIds.includes(referenceKey) || isImporting;
                return (
                  <Button
                    key={item.id}
                    type="button"
                    variant="ghost"
                    className={cn(
                      'creator-history-modal-card',
                      isSelected && 'selected'
                    )}
                    aria-label={`${item.modelLabel || item.model || 'AI'} · ${new Date(
                      item.createdAt
                    ).toLocaleDateString(dateLocale)}`}
                    aria-pressed={isReferencePicker ? isSelected : undefined}
                    disabled={confirmingReferences || isImporting}
                    onClick={() => {
                      if (isReferencePicker && onToggleReference) {
                        void onToggleReference(referenceKey);
                        return;
                      }
                      onSelect(item);
                    }}
                  >
                    <HistoryGalleryImage item={item} />
                    {isReferencePicker && (
                      <em>
                        {isImporting ? '导入中' : isSelected ? '已选' : '选择'}
                      </em>
                    )}
                    <span>
                      <strong>{item.modelLabel || item.model || 'AI'}</strong>
                      <small>
                        {new Date(item.createdAt).toLocaleDateString(
                          dateLocale
                        )}
                      </small>
                    </span>
                  </Button>
                );
              })}
              {canLoadMore && (
                <Button
                  type="button"
                  variant="outline"
                  className="creator-history-modal-load-more"
                  disabled={loadingMore}
                  onClick={onLoadMore}
                >
                  {loadingMore ? (
                    <Loader2 className="creator-spin-icon" />
                  ) : (
                    <ImageIcon />
                  )}
                  <span>
                    {loadingMore
                      ? t('history.loadingMore')
                      : t('history.loadMore')}
                  </span>
                </Button>
              )}
              {loading && (
                <div className="creator-history-modal-inline-loading">
                  <Loader2 className="creator-spin-icon" size={14} />
                  <span>{t('history.loading')}</span>
                </div>
              )}
              {error && (
                <div className="creator-history-modal-inline-error">
                  {error}
                </div>
              )}
            </StaggeredImageGrid>
          ) : error ? (
            <div className="creator-history-modal-state is-error">
              <span>{error}</span>
            </div>
          ) : (
            <div className="creator-history-modal-state">
              <ImageIcon size={26} />
              <span>{t('history.empty')}</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
