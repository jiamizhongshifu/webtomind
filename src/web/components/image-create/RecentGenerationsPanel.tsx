import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Grid2X2, ImageIcon } from 'lucide-react';
import { Button } from '@/shared/ui/radix/button';
import type { VisualImageHistoryItem } from '@/services/agent-api';
import { VisualImageTile } from '@/shared/components/VisualImageTile';
import { StaggeredImageGrid } from './StaggeredImageGrid';

export interface RecentGenerationsPanelProps {
  statusText: string;
  error: string;
  generationHistory: VisualImageHistoryItem[];
  generationHistoryTotal: number;
  activeGenerationId: string | null;
  onSelectHistory: (item: VisualImageHistoryItem) => void;
  onViewMoreHistory?: () => void;
}

function getHistoryDisplayImageUrl(item: VisualImageHistoryItem): string {
  return item.previewUrl || item.imageUrl || item.thumbnailUrl || '';
}

function getHistoryCacheVariant(
  item: VisualImageHistoryItem
): 'thumbnail' | 'preview' | 'original' {
  if (item.previewUrl) return 'preview';
  if (item.imageUrl) return 'original';
  return 'thumbnail';
}

export function RecentGenerationsPanel({
  statusText,
  error,
  generationHistory,
  generationHistoryTotal,
  activeGenerationId,
  onSelectHistory,
  onViewMoreHistory
}: RecentGenerationsPanelProps) {
  const { t } = useTranslation('imageCreate');
  const [loadedImageIds, setLoadedImageIds] = useState<Set<string>>(
    () => new Set()
  );

  return (
    <aside className="creator-panel creator-recent-panel">
      <div className="creator-panel-head creator-recent-head">
        <span>{t('history.title')}</span>
        <div className="creator-history-head-actions">
          <strong>{generationHistoryTotal}</strong>
          {generationHistory.length > 0 && onViewMoreHistory && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onViewMoreHistory}
            >
              <Grid2X2 />
              {t('history.viewMore')}
            </Button>
          )}
        </div>
      </div>

      {statusText && <p className="creator-recent-status">{statusText}</p>}
      {error && <p className="creator-error creator-recent-error">{error}</p>}

      {generationHistory.length > 0 ? (
        <StaggeredImageGrid
          className="creator-recent-grid"
          observeAdditions
        >
          {generationHistory.map((item, index) => {
            const imageUrl = getHistoryDisplayImageUrl(item);
            const isLoaded = loadedImageIds.has(item.id);
            const placeholder = (
              <span className="creator-recent-loading-label">
                {t('history.thumbnailPreparing', {
                  defaultValue: '生成完成，缩略图准备中'
                })}
              </span>
            );

            return (
              <VisualImageTile
                key={item.id}
                imageUrl={imageUrl}
                cacheId={item.id}
                cacheVariant={getHistoryCacheVariant(item)}
                cacheStrategy="cache-first"
                alt={item.prompt || item.modelLabel || t('history.title')}
                active={activeGenerationId === item.id}
                loaded={isLoaded}
                loading={index < 4 ? 'eager' : 'lazy'}
                fetchPriority={index < 4 ? 'high' : 'auto'}
                placeholder={placeholder}
                onClick={() => onSelectHistory(item)}
                onImageLoad={() => {
                  setLoadedImageIds((current) => {
                    if (current.has(item.id)) return current;
                    const next = new Set(current);
                    next.add(item.id);
                    return next;
                  });
                }}
              />
            );
          })}
        </StaggeredImageGrid>
      ) : (
        <div className="creator-recent-empty">
          <ImageIcon size={24} />
          <span>{t('history.empty')}</span>
        </div>
      )}
    </aside>
  );
}
