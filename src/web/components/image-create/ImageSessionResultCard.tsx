import {
  PopoverRoot,
  PopoverAnchor,
  PopoverContent
} from '@/shared/ui/PopoverPrimitives';
import { Button as ConfirmButton } from '@/shared/ui/radix/button';
import { TextTooltip } from '@/shared/ui/radix/tooltip';
import { useEffect, useRef, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { createPortal } from 'react-dom';
import {
  Download,
  Expand,
  Heart,
  MoreVertical,
  RefreshCw,
  Trash2,
  Wand2
} from 'lucide-react';
import type { VisualVideoGenerationItem } from '@/services/agent-api';
import type { CreationSessionHistoryItem } from './useImageSessionConversation';

interface ImageSessionResultCardProps {
  item: CreationSessionHistoryItem;
  prompt: string;
  aspectRatio: string;
  onPreview: (item: CreationSessionHistoryItem) => void;
  onDownload: (item: CreationSessionHistoryItem) => void;
  onRegenerate: (item: CreationSessionHistoryItem) => void;
  onFavorite?: (item: CreationSessionHistoryItem) => void;
  onDelete?: (item: CreationSessionHistoryItem) => Promise<void> | void;
  onEdit?: (item: CreationSessionHistoryItem) => void;
  isEnglish?: boolean;
}

function isVideoItem(
  item: CreationSessionHistoryItem
): item is VisualVideoGenerationItem {
  return 'videoUrl' in item;
}

export function ImageSessionResultCard({
  item,
  prompt,
  aspectRatio,
  onPreview,
  onDownload,
  onRegenerate,
  onFavorite,
  onDelete,
  onEdit,
  isEnglish = false
}: ImageSessionResultCardProps) {
  const deleteAnchor = useRef<HTMLElement | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{
    right: number;
    top: number;
  } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const isVideo = isVideoItem(item);

  const closeMenu = (restoreFocus = false) => {
    setMenuAnchor(null);
    if (restoreFocus) {
      menuTriggerRef.current?.focus({ preventScroll: true });
    }
  };

  useHotkeys(
    'escape',
    () => closeMenu(true),
    { enabled: Boolean(menuAnchor) },
    [menuAnchor]
  );

  useEffect(() => {
    if (!menuAnchor) return;
    const first = menuRef.current?.querySelector<HTMLElement>(
      '[role="menuitem"]'
    );
    first?.focus({ preventScroll: true });
  }, [menuAnchor]);

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      closeMenu(true);
      return;
    }
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
    );
    if (items.length === 0) return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next = index;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else if (event.key === 'ArrowDown')
      next = index < 0 ? 0 : (index + 1) % items.length;
    else next = index <= 0 ? items.length - 1 : index - 1;
    items[next]?.focus();
  };

  useEffect(() => {
    if (!menuAnchor) return;
    const close = () => setMenuAnchor(null);
    window.addEventListener('resize', close);
    document.addEventListener('pointerdown', close);
    return () => {
      window.removeEventListener('resize', close);
      document.removeEventListener('pointerdown', close);
    };
  }, [menuAnchor]);

  const runMenuAction = (action: () => void | Promise<void>) => {
    setMenuAnchor(null);
    void Promise.resolve(action()).catch((error) => {
      console.warn('[image-session] result action failed', error);
    });
  };

  const requestDelete = async () => {
    if (!onDelete || confirmBusy) return;
    setConfirmBusy(true);
    setConfirmError('');
    try {
      await onDelete(item);
      setConfirmOpen(false);
    } catch (error) {
      setConfirmError(error instanceof Error ? error.message : '删除失败');
    } finally {
      setConfirmBusy(false);
    }
  };

  const startVideoPreview = () => {
    if (!isVideo || !videoRef.current) return;
    void videoRef.current.play().catch(() => undefined);
  };

  const stopVideoPreview = () => {
    if (!isVideo || !videoRef.current) return;
    videoRef.current.pause();
    videoRef.current.currentTime = 0;
  };

  return (
    <figure
      className={`image-session-result-card${isVideo ? ' is-video' : ''}`}
      style={{ aspectRatio }}
      onMouseEnter={startVideoPreview}
      onMouseLeave={stopVideoPreview}
      onFocus={startVideoPreview}
      onBlur={stopVideoPreview}
    >
      <button
        type="button"
        className="image-session-result-preview"
        aria-label={isVideo ? '预览生成视频' : '预览生成图片'}
        onClick={() => onPreview(item)}
      >
        {isVideo ? (
          <video
            ref={videoRef}
            src={item.videoUrl}
            poster={item.posterUrl}
            preload="metadata"
            muted
            loop
            playsInline
          />
        ) : (
          <img
            src={item.previewUrl || item.imageUrl || item.thumbnailUrl}
            alt={item.prompt || prompt}
            loading="lazy"
            decoding="async"
          />
        )}
      </button>
      <div className="image-session-result-hover-actions">
        {!isVideo && onEdit ? (
          <TextTooltip text={isEnglish ? 'Edit in image editor' : '编辑图片'}>
            <button
              type="button"
              aria-label={isEnglish ? 'Edit in image editor' : '编辑图片'}
              onClick={(event) => {
                event.stopPropagation();
                onEdit(item);
              }}
            >
              <Wand2 />
            </button>
          </TextTooltip>
        ) : null}
        {onFavorite ? (
          <TextTooltip text={item.isFavorite ? '取消收藏' : '加入收藏'}>
            <button
              type="button"
              aria-label={item.isFavorite ? '取消收藏' : '加入收藏'}
              aria-pressed={Boolean(item.isFavorite)}
              onClick={(event) => {
                event.stopPropagation();
                onFavorite(item);
              }}
            >
              <Heart fill={item.isFavorite ? 'currentColor' : 'none'} />
            </button>
          </TextTooltip>
        ) : null}
        <TextTooltip text={isVideo ? '更多视频操作' : '更多图片操作'}>
          <button
            type="button"
            ref={(node) => {
              deleteAnchor.current = node;
              menuTriggerRef.current = node;
            }}
            aria-label={isVideo ? '更多视频操作' : '更多图片操作'}
            aria-haspopup="menu"
            aria-expanded={Boolean(menuAnchor)}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              const rect = event.currentTarget.getBoundingClientRect();
              setMenuAnchor((current) =>
                current
                  ? null
                  : {
                      right: Math.max(12, window.innerWidth - rect.right),
                      top: Math.min(
                        rect.bottom + 8,
                        Math.max(12, window.innerHeight - 254)
                      )
                    }
              );
            }}
          >
            <MoreVertical />
          </button>
        </TextTooltip>
      </div>
      {menuAnchor &&
        createPortal(
          <div
            ref={menuRef}
            className="image-session-result-menu"
            role="menu"
            aria-label={isVideo ? '视频操作' : '图片操作'}
            style={{ right: menuAnchor.right, top: menuAnchor.top }}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={handleMenuKeyDown}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => runMenuAction(() => onPreview(item))}
            >
              <Expand /> {isVideo ? '预览视频' : '预览大图'}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => runMenuAction(() => onRegenerate(item))}
            >
              <RefreshCw /> 重试
            </button>
            {onFavorite ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => runMenuAction(() => onFavorite(item))}
              >
                <Heart fill={item.isFavorite ? 'currentColor' : 'none'} />{' '}
                {item.isFavorite ? '取消收藏' : '加入收藏'}
              </button>
            ) : null}
            <button
              type="button"
              role="menuitem"
              onClick={() => runMenuAction(() => onDownload(item))}
            >
              <Download /> 下载
            </button>
            {!isVideo && onEdit ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => runMenuAction(() => onEdit(item))}
              >
                <Wand2 /> {isEnglish ? 'Edit image' : '编辑图片'}
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                role="menuitem"
                className="is-danger"
                onClick={() => {
                  setMenuAnchor(null);
                  setConfirmError('');
                  setConfirmOpen(true);
                }}
              >
                <Trash2 /> 删除
              </button>
            ) : null}
          </div>,
          document.body
        )}
      <PopoverRoot
        open={Boolean(confirmOpen)}
        onOpenChange={(open) => {
          if (!confirmBusy && !open) setConfirmOpen(false);
        }}
      >
        <PopoverAnchor virtualRef={deleteAnchor} />
        <PopoverContent
          data-floating-confirm="true"
          align="end"
          collisionPadding={12}
          aria-label={isVideo ? '删除视频' : '删除图片'}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            deleteAnchor.current?.focus();
          }}
        >
          <p className="text-sm text-muted-foreground">{`删除这个生成${isVideo ? '视频' : '图片'}？此操作无法撤销。`}</p>
          {confirmError && <p role="alert">{confirmError}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <ConfirmButton
              variant="outline"
              disabled={confirmBusy}
              onClick={() => setConfirmOpen(false)}
            >
              {isEnglish ? 'Cancel' : '取消'}
            </ConfirmButton>
            <ConfirmButton
              variant="destructive"
              disabled={confirmBusy}
              onClick={requestDelete}
            >
              {isVideo ? '删除视频' : '删除图片'}
            </ConfirmButton>
          </div>
        </PopoverContent>
      </PopoverRoot>{' '}
    </figure>
  );
}
