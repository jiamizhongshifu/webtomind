import { useEffect, useState } from 'react';
import { ImageOff, LoaderCircle, X } from 'lucide-react';
import { getVisualImageHistoryResult, type VisualImageHistoryItem } from '@/services/agent-api';

interface ImageEditorAssetPickerProps {
  isEnglish: boolean;
  open: boolean;
  onClose: () => void;
  selectionMode?: 'single' | 'multi';
  onPick?: (item: VisualImageHistoryItem) => void;
  onPickMany?: (items: VisualImageHistoryItem[]) => void;
}

export function ImageEditorAssetPicker({
  isEnglish,
  open,
  onClose,
  selectionMode = 'single',
  onPick,
  onPickMany
}: ImageEditorAssetPickerProps) {
  const [items, setItems] = useState<VisualImageHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pickingId, setPickingId] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const multi = selectionMode === 'multi';

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setSelectedIds(new Set());
    setPickingId('');
    getVisualImageHistoryResult(48)
      .then((result) => {
        if (!cancelled) setItems(result.items);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : isEnglish
                ? 'Could not load your assets.'
                : '资产库加载失败，请稍后重试。'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isEnglish, open]);

  if (!open) return null;

  const toggleSelect = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmMany = () => {
    const selected = items.filter((item) => selectedIds.has(item.id));
    if (selected.length === 0) return;
    onPickMany?.(selected);
  };

  return (
    <div
      className="image-editor-asset-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="image-editor-asset-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={isEnglish ? 'Select an asset' : '选择一张图片资产'}
      >
        <header>
          <h2>{isEnglish ? 'Select an asset' : '选择一张图片资产'}</h2>
          <button type="button" aria-label={isEnglish ? 'Close' : '关闭'} onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        {loading ? (
          <div className="image-editor-asset-state">
            <LoaderCircle className="spin" aria-hidden="true" />
            <span>{isEnglish ? 'Loading your assets…' : '正在加载资产…'}</span>
          </div>
        ) : error ? (
          <div className="image-editor-asset-state is-error">
            <ImageOff aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : items.length === 0 ? (
          <div className="image-editor-asset-state">
            <ImageOff aria-hidden="true" />
            <span>
              {isEnglish
                ? 'No images yet. Create some first, or upload one directly.'
                : '还没有图片资产。先去生成一些图片，或直接上传一张。'}
            </span>
          </div>
        ) : (
          <div className="image-editor-asset-grid">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={[
                  pickingId === item.id ? 'is-picking' : undefined,
                  multi && selectedIds.has(item.id) ? 'is-selected' : undefined
                ]
                  .filter(Boolean)
                  .join(' ')}
                disabled={Boolean(pickingId)}
                aria-label={
                  multi
                    ? isEnglish
                      ? 'Toggle selection'
                      : '切换选择'
                    : isEnglish
                      ? 'Use this image'
                      : '使用这张图片'
                }
                aria-pressed={multi ? selectedIds.has(item.id) : undefined}
                onClick={() => {
                  if (multi) {
                    toggleSelect(item.id);
                    return;
                  }
                  setPickingId(item.id);
                  onPick?.(item);
                }}
              >
                <img
                  src={item.thumbnailUrl || item.previewUrl || item.imageUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
                {multi && selectedIds.has(item.id) ? (
                  <span className="image-editor-asset-check">✓</span>
                ) : null}
                {pickingId === item.id ? (
                  <span className="image-editor-asset-picking">
                    <LoaderCircle className="spin" aria-hidden="true" />
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        )}
        {multi ? (
          <footer className="image-editor-asset-footer">
            <span>
              {isEnglish
                ? `${selectedIds.size} selected`
                : `已选 ${selectedIds.size} 张`}
            </span>
            <button
              type="button"
              className="image-editor-asset-confirm"
              disabled={selectedIds.size === 0}
              onClick={confirmMany}
            >
              {isEnglish
                ? `Add ${selectedIds.size || ''}`.trim()
                : `添加${selectedIds.size ? ` ${selectedIds.size} 张` : ''}`}
            </button>
          </footer>
        ) : null}
      </section>
    </div>
  );
}
