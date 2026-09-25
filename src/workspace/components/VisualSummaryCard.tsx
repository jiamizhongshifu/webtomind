import { createLogger } from '@/utils/logger';
import type { SavedSummary } from '@/services/database';
import { useVisualImageCache } from '@/shared/useVisualImageCache';
import { ImageOff, Trash2 } from 'lucide-react';
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type SyntheticEvent
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  getVisualSummaryCssAspectRatio,
  type VisualSummaryDisplayMeta
} from '../utils/visual-summary';
import {
  readVisualSummaryAspectRatioCache,
  writeVisualSummaryAspectRatioCache
} from '../utils/visual-summary-aspect-cache';

const log = createLogger('VisualSummaryCard');

async function extractVideoThumbnail(videoUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.crossOrigin = 'anonymous';

    video.onloadeddata = () => {
      video.currentTime = 0;
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }

        ctx.drawImage(video, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      } catch (error) {
        log.error('[extractVideoThumbnail] Failed:', error);
        resolve(null);
      }
    };

    video.onerror = (event) => {
      log.error(
        '[extractVideoThumbnail] Video load error:',
        videoUrl.substring(0, 100),
        event
      );
      resolve(null);
    };

    setTimeout(() => resolve(null), 5000);
    video.src = videoUrl;
  });
}

function isVideoUrl(url: string): boolean {
  if (url.startsWith('data:video/')) return true;
  const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
  const urlLower = url.toLowerCase();
  return videoExtensions.some((ext) => urlLower.includes(ext));
}

interface VisualSummaryCardProps {
  summary: SavedSummary;
  imageSrc: string;
  imageCandidates?: string[];
  displayMeta?: VisualSummaryDisplayMeta;
  title: string;
  time: string;
  selected: boolean;
  onToggleSelect?: (id: string) => void;
  onDeleteSummary?: (id: string) => void;
  onEnterDetail: (summary: SavedSummary) => void;
  resolveFullImageSrc?: (summary: SavedSummary) => Promise<string | null>;
  className?: string;
  dragToCanvasEnabled?: boolean;
  loadingMode?: 'eager' | 'lazy';
  fetchPriority?: 'high' | 'low' | 'auto';
  shouldLoad?: boolean;
}

const CANVAS_SUMMARY_DRAG_TYPE = 'application/x-webtomind-summary-id';

export const VisualSummaryCard = memo(function VisualSummaryCard({
  summary,
  imageSrc,
  imageCandidates = [],
  displayMeta,
  title,
  time,
  selected,
  onToggleSelect,
  onDeleteSummary,
  onEnterDetail,
  resolveFullImageSrc,
  className = '',
  dragToCanvasEnabled = false,
  loadingMode = 'lazy',
  fetchPriority = 'auto',
  shouldLoad = true
}: VisualSummaryCardProps) {
  const { t } = useTranslation('workspace');
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [thumbnailSrc, setThumbnailSrc] = useState<string | null>(null);
  const [currentImageSrc, setCurrentImageSrc] = useState(imageSrc);
  const [isVideo, setIsVideo] = useState(false);
  const [naturalAspectRatio, setNaturalAspectRatio] = useState<string | null>(
    () => readVisualSummaryAspectRatioCache(summary.id, imageSrc)
  );
  const triedFullSummaryRef = useRef(false);
  const candidateIndexRef = useRef(0);

  useEffect(() => {
    triedFullSummaryRef.current = false;
    candidateIndexRef.current = 0;
    setCurrentImageSrc(imageSrc);
    setImageError(false);
    setImageLoaded(false);
    setNaturalAspectRatio(
      readVisualSummaryAspectRatioCache(summary.id, imageSrc)
    );
  }, [imageSrc, summary.id]);

  useEffect(() => {
    let cancelled = false;

    if (isVideoUrl(currentImageSrc)) {
      setIsVideo(true);
      setThumbnailSrc(null);
      if (!shouldLoad) {
        return () => {
          cancelled = true;
        };
      }
      void extractVideoThumbnail(currentImageSrc)
        .then((thumb) => {
          if (cancelled) return;
          if (thumb) {
            setThumbnailSrc(thumb);
          } else {
            setImageError(true);
          }
        })
        .catch(() => {
          if (!cancelled) setImageError(true);
        });
      return () => {
        cancelled = true;
      };
    }

    setIsVideo(false);
    setThumbnailSrc(currentImageSrc);
    return () => {
      cancelled = true;
    };
  }, [currentImageSrc, shouldLoad]);

  const handleImageError = useCallback(() => {
    const candidates = Array.from(
      new Set([imageSrc, currentImageSrc, ...imageCandidates].filter(Boolean))
    );
    const currentIndex = candidates.indexOf(currentImageSrc);
    const nextCandidate = candidates
      .slice(Math.max(currentIndex, candidateIndexRef.current) + 1)
      .find((candidate) => candidate && candidate !== currentImageSrc);

    if (nextCandidate) {
      candidateIndexRef.current = candidates.indexOf(nextCandidate);
      setImageLoaded(false);
      setImageError(false);
      setNaturalAspectRatio(
        readVisualSummaryAspectRatioCache(summary.id, nextCandidate)
      );
      setCurrentImageSrc(nextCandidate);
      return;
    }

    if (!triedFullSummaryRef.current && resolveFullImageSrc) {
      triedFullSummaryRef.current = true;
      void resolveFullImageSrc(summary)
        .then((fullImageSrc) => {
          if (fullImageSrc && fullImageSrc !== currentImageSrc) {
            setImageLoaded(false);
            setImageError(false);
            setNaturalAspectRatio(
              readVisualSummaryAspectRatioCache(summary.id, fullImageSrc)
            );
            setCurrentImageSrc(fullImageSrc);
            return;
          }
          log.warn('[VisualSummaryCard] Image failed to load:', summary.id);
          setImageError(true);
        })
        .catch((error) => {
          log.warn('[VisualSummaryCard] Failed to resolve full image:', error);
          setImageError(true);
        });
      return;
    }

    log.warn('[VisualSummaryCard] Image failed to load:', summary.id);
    setImageError(true);
  }, [
    currentImageSrc,
    imageCandidates,
    imageSrc,
    resolveFullImageSrc,
    summary
  ]);

  const handleImageLoad = useCallback(
    (event: SyntheticEvent<HTMLImageElement>) => {
      const { naturalWidth, naturalHeight } = event.currentTarget;
      if (naturalWidth > 0 && naturalHeight > 0) {
        const ratio = `${naturalWidth} / ${naturalHeight}`;
        writeVisualSummaryAspectRatioCache(summary.id, currentImageSrc, ratio);
      }

      setImageLoaded(true);
    },
    [currentImageSrc, summary.id]
  );

  const imageFrameStyle = useCallback(
    (aspectRatio: string | null): CSSProperties =>
      aspectRatio ? { aspectRatio } : { aspectRatio: '4 / 5' },
    []
  );

  const metaLine = [displayMeta?.modelLabel, displayMeta?.aspectRatio]
    .filter(Boolean)
    .join(' · ');
  const cssAspectRatio = displayMeta
    ? getVisualSummaryCssAspectRatio(displayMeta)
    : null;
  const resolvedAspectRatio = naturalAspectRatio || cssAspectRatio;
  const fallbackAspectRatio = resolvedAspectRatio || '4 / 5';
  const cachedThumbnailSrc = useVisualImageCache({
    id: summary.id,
    sourceUrl: shouldLoad ? thumbnailSrc : null,
    variant: 'thumbnail',
    strategy: loadingMode === 'eager' ? 'network-immediate' : 'cache-first'
  });
  const displayThumbnailSrc =
    thumbnailSrc && isVideo ? thumbnailSrc : cachedThumbnailSrc || thumbnailSrc;
  const imagePriorityProps =
    fetchPriority === 'auto'
      ? {}
      : ({ fetchpriority: fetchPriority } as Record<string, string>);

  useEffect(() => {
    if (!shouldLoad || !displayThumbnailSrc || imageLoaded || imageError)
      return;
    const timeoutId = window.setTimeout(
      () => {
        handleImageError();
      },
      loadingMode === 'eager' ? 7000 : 10000
    );
    return () => window.clearTimeout(timeoutId);
  }, [
    displayThumbnailSrc,
    handleImageError,
    imageError,
    imageLoaded,
    loadingMode,
    shouldLoad
  ]);

  if (imageError) {
    return (
      <div
        className={`visual-summary-card group relative rounded-xl cursor-pointer transition-all overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500 hover:shadow-md ${className}`}
        draggable={dragToCanvasEnabled}
        onDragStart={(event) => {
          if (!dragToCanvasEnabled) return;
          event.dataTransfer.setData(CANVAS_SUMMARY_DRAG_TYPE, summary.id);
          event.dataTransfer.setData('text/plain', summary.id);
          event.dataTransfer.effectAllowed = 'copy';
        }}
        onClick={() => onEnterDetail(summary)}
        style={{ aspectRatio: fallbackAspectRatio } as CSSProperties}
      >
        {onToggleSelect && (
          <label
            className={`absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-1.5 py-1 rounded-md bg-white/90 dark:bg-slate-800/90 transition-opacity ${
              selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
            onClick={(event) => event.stopPropagation()}
            onDragStart={(event) => event.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(summary.id)}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
          </label>
        )}

        {onDeleteSummary && (
          <button
            type="button"
            className="absolute left-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md bg-white/95 text-slate-500 opacity-0 shadow-sm transition-all hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 dark:bg-slate-800/95 dark:text-slate-300 dark:hover:bg-red-900/30 dark:hover:text-red-300"
            title="删除"
            aria-label="删除卡片"
            onClick={(event) => {
              event.stopPropagation();
              onDeleteSummary(summary.id);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}

        <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground dark:text-slate-500 bg-slate-50 dark:bg-slate-800">
          <ImageOff className="w-10 h-10 mb-2" />
          <span className="text-xs">{t('summaryList.imagePreparing')}</span>
        </div>

        <div className="px-3 pb-2 pt-1 bg-white dark:bg-slate-800 border-t border-slate-50 dark:border-slate-700">
          <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate mb-0.5">
            {title}
          </h3>
          <p className="text-xs text-muted-foreground dark:text-slate-500">
            {metaLine || time}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`visual-summary-card group relative rounded-xl cursor-pointer transition-all overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 ${className}`}
      draggable={dragToCanvasEnabled}
      onDragStart={(event) => {
        if (!dragToCanvasEnabled) return;
        event.dataTransfer.setData(CANVAS_SUMMARY_DRAG_TYPE, summary.id);
        event.dataTransfer.setData('text/plain', summary.id);
        event.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={() => onEnterDetail(summary)}
      style={imageFrameStyle(fallbackAspectRatio)}
    >
      {onToggleSelect && (
        <label
          className={`absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-1.5 py-1 rounded-md bg-white/90 dark:bg-slate-800/90 transition-opacity ${
            selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          onClick={(event) => event.stopPropagation()}
          onDragStart={(event) => event.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(summary.id)}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
        </label>
      )}

      {onDeleteSummary && (
        <button
          type="button"
          className="absolute left-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md bg-white/95 text-slate-500 opacity-0 shadow-sm transition-all hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 dark:bg-slate-800/95 dark:text-slate-300 dark:hover:bg-red-900/30 dark:hover:text-red-300"
          title="删除"
          aria-label="删除卡片"
          onClick={(event) => {
            event.stopPropagation();
            onDeleteSummary(summary.id);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}

      {(!imageLoaded || !displayThumbnailSrc) && (
        <div className="absolute inset-0 bg-slate-100 dark:bg-slate-700 animate-pulse rounded-xl border border-slate-200 dark:border-slate-600" />
      )}

      {displayThumbnailSrc && (
        <img
          src={displayThumbnailSrc}
          alt={title}
          loading={loadingMode}
          decoding="async"
          {...imagePriorityProps}
          referrerPolicy="no-referrer"
          className={`absolute inset-0 h-full w-full object-cover rounded-xl transition-opacity duration-slow ${
            imageLoaded ? 'visible opacity-100' : 'invisible opacity-0'
          }`}
          onError={handleImageError}
          onLoad={handleImageLoad}
        />
      )}

      {isVideo && imageLoaded && (
        <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/60 rounded text-[10px] text-white font-medium">
          GIF
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 px-3 pb-3 pt-10 opacity-0 group-hover:opacity-100 transition-opacity duration-base rounded-b-xl bg-gradient-to-t from-black/80 to-transparent">
        <h3 className="text-sm font-semibold text-white truncate mb-0.5">
          {title}
        </h3>
        <p className="text-[11px] text-white/70">{metaLine || time}</p>
      </div>
    </div>
  );
});
