import { useCallback, useEffect, useRef, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize2,
  Minus,
  Plus,
  Scan,
  Wand2,
  X
} from 'lucide-react';
import {
  useVisualImageCache,
  type VisualImageCacheStrategy,
  type VisualImageCacheVariant
} from '@/shared/useVisualImageCache';
import { useOverlayBehavior } from '@/shared/ui';
import { Button } from '@/shared/ui/radix/button';
import '../../styles/media-overlay-controls.css';

interface ImageLightboxProps {
  imageUrl: string;
  cacheId?: string | null;
  cacheVariant?: VisualImageCacheVariant;
  cacheStrategy?: VisualImageCacheStrategy;
  alt?: string;
  ariaLabel: string;
  downloadLabel: string;
  editLabel?: string;
  closeLabel: string;
  previousLabel?: string;
  nextLabel?: string;
  canNavigate?: boolean;
  onClose: () => void;
  onDownload?: () => void;
  onEdit?: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 4;
const SCALE_STEP = 0.16;

export function ImageLightbox({
  imageUrl,
  cacheId,
  cacheVariant = 'preview',
  cacheStrategy = 'network-immediate',
  alt = '',
  ariaLabel,
  downloadLabel,
  editLabel,
  closeLabel,
  previousLabel,
  nextLabel,
  canNavigate = false,
  onClose,
  onDownload,
  onEdit,
  onPrevious,
  onNext
}: ImageLightboxProps) {
  const displayImageUrl = useVisualImageCache({
    id: cacheId,
    sourceUrl: imageUrl,
    variant: cacheVariant,
    strategy: cacheStrategy
  });
  const [scale, setScale] = useState(1);
  const [fitScale, setFitScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const lightboxRef = useOverlayBehavior<HTMLDivElement>({
    open: true,
    onClose
  });
  const offsetRef = useRef(offset);
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const touchPanRef = useRef<{
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);

  useHotkeys(
    'arrowleft,arrowright',
    (event) => {
      if (event.key === 'ArrowLeft') onPrevious?.();
      else onNext?.();
    },
    { enabled: canNavigate },
    [onNext, onPrevious]
  );

  const updateOffset = useCallback((next: { x: number; y: number }) => {
    offsetRef.current = next;
    setOffset(next);
  }, []);

  const calculateFitScale = useCallback((width: number, height: number) => {
    if (!width || !height || typeof window === 'undefined') return 1;
    const viewportWidth = Math.max(240, window.innerWidth - 48);
    const viewportHeight = Math.max(240, window.innerHeight - 132);
    return Math.max(
      MIN_SCALE,
      Math.min(1, viewportWidth / width, viewportHeight / height)
    );
  }, []);

  useEffect(() => {
    const nextFitScale = calculateFitScale(
      naturalSize.width,
      naturalSize.height
    );
    setFitScale(nextFitScale);
    setScale(nextFitScale);
    updateOffset({ x: 0, y: 0 });
  }, [
    calculateFitScale,
    displayImageUrl,
    naturalSize.height,
    naturalSize.width,
    updateOffset
  ]);

  useEffect(() => {
    const handleResize = () => {
      const nextFitScale = calculateFitScale(
        naturalSize.width,
        naturalSize.height
      );
      setFitScale(nextFitScale);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [calculateFitScale, naturalSize.height, naturalSize.width]);

  useEffect(() => {
    setNaturalSize({ width: 0, height: 0 });
    setFitScale(1);
    setScale(1);
    updateOffset({ x: 0, y: 0 });
    dragRef.current = null;
    touchPanRef.current = null;
    pinchRef.current = null;
    setIsDragging(false);
  }, [displayImageUrl, updateOffset]);

  const updateScale = (next: number) => {
    setScale(Math.max(MIN_SCALE, Math.min(MAX_SCALE, next)));
  };

  const stopDrag = () => {
    dragRef.current = null;
    touchPanRef.current = null;
    setIsDragging(false);
  };

  const getTouchDistance = (touches: {
    length: number;
    item(index: number): { clientX: number; clientY: number } | null;
  }): number => {
    const first = touches.item(0);
    const second = touches.item(1);
    if (!first || !second) return 0;
    return Math.hypot(
      first.clientX - second.clientX,
      first.clientY - second.clientY
    );
  };

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className="creator-prompt-case-lightbox"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        className="creator-prompt-case-lightbox-actions"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {onEdit && editLabel && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={editLabel}
            onClick={(event) => {
              event.stopPropagation();
              onEdit();
            }}
          >
            <Wand2 data-icon="inline-start" />
          </Button>
        )}
        {onDownload && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={downloadLabel}
            onClick={(event) => {
              event.stopPropagation();
              onDownload();
            }}
          >
            <Download data-icon="inline-start" />
          </Button>
        )}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={closeLabel}
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        >
          <X data-icon="inline-start" />
        </Button>
      </div>

      {canNavigate && onPrevious && onNext && (
        <>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="creator-prompt-case-lightbox-nav prev"
            aria-label={previousLabel}
            onMouseDown={(event) => event.stopPropagation()}
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
            className="creator-prompt-case-lightbox-nav next"
            aria-label={nextLabel}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onNext();
            }}
          >
            <ChevronRight data-icon="inline-start" />
          </Button>
        </>
      )}

      <div
        ref={lightboxRef}
        className="creator-prompt-case-lightbox-stage"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        data-zoomed={scale > 1 ? 'true' : 'false'}
        data-dragging={isDragging ? 'true' : 'false'}
        onWheel={(event) => {
          event.preventDefault();
          updateScale(scale + (event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP));
        }}
        onPointerDown={(event) => {
          if (event.pointerType === 'touch') return;
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          dragRef.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            offsetX: offsetRef.current.x,
            offsetY: offsetRef.current.y
          };
          setIsDragging(true);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (
            !dragRef.current ||
            dragRef.current.pointerId !== event.pointerId
          ) {
            return;
          }
          event.preventDefault();
          updateOffset({
            x: dragRef.current.offsetX + event.clientX - dragRef.current.x,
            y: dragRef.current.offsetY + event.clientY - dragRef.current.y
          });
        }}
        onPointerUp={(event) => {
          if (dragRef.current?.pointerId === event.pointerId) {
            stopDrag();
          }
        }}
        onPointerCancel={(event) => {
          if (dragRef.current?.pointerId === event.pointerId) {
            stopDrag();
          }
        }}
        onTouchStart={(event) => {
          if (event.touches.length === 2) {
            pinchRef.current = {
              distance: getTouchDistance(event.touches),
              scale
            };
            touchPanRef.current = null;
            setIsDragging(false);
            return;
          }
          const touch = event.touches.item(0);
          if (!touch) return;
          touchPanRef.current = {
            x: touch.clientX,
            y: touch.clientY,
            offsetX: offsetRef.current.x,
            offsetY: offsetRef.current.y
          };
          setIsDragging(true);
        }}
        onTouchMove={(event) => {
          if (event.touches.length === 2 && pinchRef.current) {
            event.preventDefault();
            const distance = getTouchDistance(event.touches);
            if (!distance || !pinchRef.current.distance) return;
            updateScale(
              (distance / pinchRef.current.distance) * pinchRef.current.scale
            );
            return;
          }
          const touch = event.touches.item(0);
          if (!touch || !touchPanRef.current) return;
          event.preventDefault();
          updateOffset({
            x:
              touchPanRef.current.offsetX +
              touch.clientX -
              touchPanRef.current.x,
            y:
              touchPanRef.current.offsetY +
              touch.clientY -
              touchPanRef.current.y
          });
        }}
        onTouchEnd={() => {
          pinchRef.current = null;
          stopDrag();
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <img
          src={displayImageUrl || imageUrl}
          alt={alt}
          draggable={false}
          onLoad={(event) => {
            const image = event.currentTarget;
            setNaturalSize({
              width: image.naturalWidth,
              height: image.naturalHeight
            });
          }}
          style={{
            transform: `translate3d(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px), 0) scale(${scale})`
          }}
        />
      </div>

      <div
        className="creator-prompt-case-lightbox-zoom"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="缩小图片"
          onClick={(event) => {
            event.stopPropagation();
            updateScale(scale - SCALE_STEP);
          }}
        >
          <Minus data-icon="inline-start" />
        </Button>
        <span>{Math.round(scale * 100)}%</span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="放大图片"
          onClick={(event) => {
            event.stopPropagation();
            updateScale(scale + SCALE_STEP);
          }}
        >
          <Plus data-icon="inline-start" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="适应屏幕"
          onClick={(event) => {
            event.stopPropagation();
            updateScale(fitScale);
            updateOffset({ x: 0, y: 0 });
          }}
        >
          <Scan data-icon="inline-start" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="原始大小"
          onClick={(event) => {
            event.stopPropagation();
            updateScale(1);
            updateOffset({ x: 0, y: 0 });
          }}
        >
          <Maximize2 data-icon="inline-start" />
        </Button>
      </div>
    </div>,
    document.body
  );
}
