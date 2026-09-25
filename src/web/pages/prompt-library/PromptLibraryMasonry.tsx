import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type Ref
} from 'react';
import { useInView } from 'react-intersection-observer';
import { Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { PromptCase } from '@/services/agent-api';
import { getPromptCaseModelLabel } from '@/shared/prompt-case-model-labels';
import {
  getOptimizedPromptCaseImageUrl,
  getPromptCasePrimaryVideoUrl,
  getPromptCaseResponsiveImageSet,
  isPromptCaseVideo,
  PROMPT_LIBRARY_CARD_IMAGE_SIZES,
  PROMPT_LIBRARY_CARD_IMAGE_WIDTHS
} from '@/utils/prompt-case';
import { Card } from '@/shared/ui';
import { Button } from '@/shared/ui/radix/button';
import {
  getPromptCaseCardAspectRatio,
  getPromptCaseCover,
  getPromptCasePreviewText
} from './promptLibraryDisplay';
import { PromptLibraryCard } from './PromptLibraryCard';
import '../../styles/marketing-pages.css';

// Keep the first two cards and every column's top card eager. Desktop has more
// than two columns, and any of their first-row images can become LCP.
const PROMPT_BROWSER_EAGER_IMAGE_COUNT = 2;
const PROMPT_BROWSER_HIGH_PRIORITY_IMAGE_COUNT = 2;
// Background refresh keeps stale cards visible briefly, then swaps to the
// loading grid only when the fetch is slow enough that a skeleton is useful.
// Rendering as many skeletons as visible cards keeps the grid height stable.
const PROMPT_BROWSER_REFRESH_SKELETON_DELAY_MS = 350;
const PROMPT_BROWSER_REFRESH_SKELETON_MAX_CARDS = 48;
// Cards in the initial viewport keep their reserved ratio so image loads do
// not shift the visible layout (CLS). Cards beyond this index may adopt their
// natural ratio to preserve the waterfall as the user scrolls.
const PROMPT_BROWSER_STABLE_RATIO_CARD_COUNT = 12;
// 首屏批次错峰：同一帧进入视口的图片按每波 4 张、90ms 间隔挂载。
let promptCaseImageStagger = 0;
export type PromptCaseLoadState = 'loading' | 'ready' | 'error';

export type PromptLibraryMasonryItem = {
  caseItem: PromptCase;
  index: number;
};

type PromptLibraryCaseStatusState =
  | 'empty'
  | 'error'
  | 'favorites-empty'
  | 'no-result'
  | null;

interface PromptLibraryMasonryProps {
  isZh: boolean;
  locale: 'zh-CN' | 'en-US';
  columns: PromptLibraryMasonryItem[][];
  activeColumnCount: number;
  loadState: PromptCaseLoadState;
  statusState: PromptLibraryCaseStatusState;
  allCasesHref: string;
  getCaseHref: (caseItem: PromptCase, locale: 'zh-CN' | 'en-US') => string;
  getCreateHref: (caseItem: PromptCase, locale: 'zh-CN' | 'en-US') => string;
  aspectRatios: Record<string, string>;
  onAspectRatioChange: (caseId: string, aspectRatio: string) => void;
  isFavorited: (caseId: string) => boolean;
  onOpenCase: (event: MouseEvent<HTMLElement>, caseItem: PromptCase) => void;
  onUseCase?: (caseItem: PromptCase) => void;
  onToggleFavorite: (caseId: string) => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  isRefreshing?: boolean;
  onLoadMore: () => void;
  loadMoreRef: Ref<HTMLDivElement>;
  visibleCount: number;
  reservedItemCount?: number;
  totalCount: number;
  hasAnyCases: boolean;
  onRetry?: () => void;
}

function getReservedCaseAspectRatio(index: number): string {
  const fallbackRatios = ['1 / 1', '4 / 5', '3 / 4', '4 / 3'];
  return fallbackRatios[index % fallbackRatios.length];
}

function parseCssAspectRatio(aspectRatio?: string): number | null {
  if (!aspectRatio) return null;
  const match = aspectRatio.match(
    /^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/
  );
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;
  return width / height;
}

function shouldUpdatePromptCaseAspectRatio(
  currentAspectRatio: string | undefined,
  naturalWidth: number,
  naturalHeight: number
): boolean {
  if (!Number.isFinite(naturalWidth) || !Number.isFinite(naturalHeight)) {
    return false;
  }
  if (naturalWidth <= 0 || naturalHeight <= 0) return false;

  const currentRatio = parseCssAspectRatio(currentAspectRatio);
  if (!currentRatio) return true;

  const nextRatio = naturalWidth / naturalHeight;
  return Math.abs(currentRatio - nextRatio) / currentRatio > 0.015;
}

function PromptLibraryCaseImage({
  caseItem,
  index,
  isColumnTop,
  cover,
  caseTitle,
  displayModel,
  aspectRatio,
  onAspectRatioChange
}: {
  caseItem: PromptCase;
  index: number;
  isColumnTop: boolean;
  cover: string;
  caseTitle: string;
  displayModel: string;
  aspectRatio?: string;
  onAspectRatioChange: (caseId: string, aspectRatio: string) => void;
}) {
  const isEagerImage = isColumnTop || index < PROMPT_BROWSER_EAGER_IMAGE_COUNT;
  const isStableRatioCard = index < PROMPT_BROWSER_STABLE_RATIO_CARD_COUNT;
  const fallbackAspectRatio = useMemo(
    () =>
      isStableRatioCard
        ? getReservedCaseAspectRatio(index)
        : getPromptCaseCardAspectRatio(caseItem, index),
    [caseItem, index, isStableRatioCard]
  );
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [useOriginalImage, setUseOriginalImage] = useState(false);
  const [isVideoPreviewActive, setIsVideoPreviewActive] = useState(false);
  // 测试环境（jsdom 无真实布局/网络）同步挂载；生产按视口错峰挂载。
  const [mounted, setMounted] = useState(
    () => isEagerImage || import.meta.env.MODE === 'test'
  );
  // 瀑布流分屏加载：卡片进入视口附近（rootMargin 一个多屏）才挂载 img，
  // 避免刷新时整页图片一次性加载导致卡片闪动。
  const { ref: imageInViewRef, inView } = useInView({
    // 激活窗口接近一屏：按屏加载，避免一次性大量图片同时加载。
    rootMargin: '200px 0px',
    // 无 IntersectionObserver 的环境（jsdom 测试）视为全部可见。
    fallbackInView: true
  });
  const shouldMountImage = inView || isEagerImage;

  useEffect(() => {
    if (!shouldMountImage || mounted) return;
    const delay = (promptCaseImageStagger++ % 4) * 90;
    const timer = window.setTimeout(() => setMounted(true), delay);
    return () => window.clearTimeout(timer);
  }, [mounted, shouldMountImage]);
  const imagePriorityProps = {
    fetchpriority: isEagerImage ? 'high' : 'auto'
  };
  const imageSrc = useOriginalImage
    ? cover
    : getOptimizedPromptCaseImageUrl(cover, {
        width: 520,
        quality: 72
      });
  const imageSrcSet = useOriginalImage
    ? undefined
    : getPromptCaseResponsiveImageSet(cover, PROMPT_LIBRARY_CARD_IMAGE_WIDTHS);
  const videoUrl = getPromptCasePrimaryVideoUrl(caseItem);
  const hasVideo = isPromptCaseVideo(caseItem) && Boolean(videoUrl);
  // Stable (initial-viewport) cards always use the reserved ratio so they can
  // never resize from a previously persisted natural ratio when data refreshes
  // or the order changes. Only cards beyond the stable window adopt natural
  // ratios (and those are below the fold when the layout settles).
  const resolvedAspectRatio = isStableRatioCard
    ? fallbackAspectRatio
    : aspectRatio || fallbackAspectRatio;
  const parsedResolvedRatio = parseCssAspectRatio(resolvedAspectRatio);
  const imageWidth = 520;
  const imageHeight = parsedResolvedRatio
    ? Math.max(1, Math.round(imageWidth / parsedResolvedRatio))
    : 650;

  const updateNaturalAspectRatio = (width: number, height: number) => {
    // Keep initial-viewport cards on their reserved ratio so image loads do
    // not shift the visible layout (CLS). Cards further down may still adopt
    // their natural ratio to preserve the waterfall layout.
    if (isStableRatioCard) return;
    if (
      !shouldUpdatePromptCaseAspectRatio(resolvedAspectRatio, width, height)
    ) {
      return;
    }
    const nextAspectRatio = `${Math.round(width)} / ${Math.round(height)}`;
    if (nextAspectRatio !== aspectRatio) {
      onAspectRatioChange(caseItem.id, nextAspectRatio);
    }
  };

  useEffect(() => {
    setUseOriginalImage(false);
  }, [cover]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hasVideo) return;
    if (isVideoPreviewActive) {
      video.play().catch(() => {
        setIsVideoPreviewActive(false);
      });
      return;
    }
    video.pause();
    try {
      video.currentTime = 0;
    } catch {
      // Some browsers reject seeking before metadata exists; the poster still remains visible.
    }
  }, [hasVideo, isVideoPreviewActive, videoUrl]);

  const showVideoPreview = () => {
    if (hasVideo) setIsVideoPreviewActive(true);
  };

  const hideVideoPreview = () => {
    if (hasVideo) setIsVideoPreviewActive(false);
  };

  const mediaImage = cover ? (
    mounted || isEagerImage ? (
      <img
        src={imageSrc}
        srcSet={imageSrcSet}
        sizes={PROMPT_LIBRARY_CARD_IMAGE_SIZES}
        alt={caseTitle}
        itemProp="image"
        loading={isEagerImage ? 'eager' : 'lazy'}
        decoding="async"
        {...imagePriorityProps}
        width={imageWidth}
        height={imageHeight}
        onLoad={(event) => {
          updateNaturalAspectRatio(
            event.currentTarget.naturalWidth,
            event.currentTarget.naturalHeight
          );
        }}
        onError={() => {
          if (!useOriginalImage) {
            setUseOriginalImage(true);
          }
        }}
      />
    ) : (
      <div className="prompt-browser-case-fallback" aria-hidden="true" />
    )
  ) : (
    <div className="prompt-browser-case-fallback" />
  );

  return (
    <div
      ref={imageInViewRef}
      className={
        hasVideo || cover
          ? 'prompt-browser-case-image-wrap prompt-browser-case-image-wrap-media'
          : 'prompt-browser-case-image-wrap'
      }
      style={
        {
          '--prompt-case-aspect-ratio': resolvedAspectRatio
        } as CSSProperties
      }
      onMouseEnter={showVideoPreview}
      onMouseLeave={hideVideoPreview}
    >
      {hasVideo ? (
        <>
          {mediaImage}
          <video
            ref={videoRef}
            className={
              isVideoPreviewActive
                ? 'prompt-browser-case-video-preview active'
                : 'prompt-browser-case-video-preview'
            }
            // Do not let remote video assets compete with the first viewport;
            // the poster is enough until the user previews the card.
            src={isVideoPreviewActive ? videoUrl : undefined}
            poster={cover || undefined}
            muted
            loop
            playsInline
            preload="none"
            aria-label={caseTitle}
            itemProp="video"
            onLoadedMetadata={(event) => {
              updateNaturalAspectRatio(
                event.currentTarget.videoWidth,
                event.currentTarget.videoHeight
              );
            }}
          />
          <span className="prompt-browser-case-video-badge">
            <Play size={12} strokeWidth={3} aria-hidden="true" />
            <span>{caseItem.locale === 'zh-CN' ? '视频' : 'Video'}</span>
          </span>
        </>
      ) : cover ? (
        mediaImage
      ) : (
        mediaImage
      )}
      <div className="prompt-browser-case-hover-panel">
        <div className="prompt-browser-case-hover-copy">
          <span>{displayModel}</span>
          <strong>{caseTitle}</strong>
        </div>
      </div>
    </div>
  );
}

function PromptLibraryCaseLoadingGrid({
  isZh,
  columnCount = 3,
  count = 12
}: {
  isZh: boolean;
  columnCount?: number;
  count?: number;
}) {
  const columns = useMemo(
    () =>
      Array.from({ length: columnCount }, (_, columnIndex) =>
        Array.from(
          { length: Math.ceil(count / columnCount) },
          (_, rowIndex) => rowIndex * columnCount + columnIndex
        )
      ),
    [columnCount, count]
  );
  return (
    <div
      className="prompt-browser-loading-grid"
      aria-label={isZh ? '正在加载 Prompt 案例' : 'Loading prompt cases'}
      style={
        {
          '--prompt-browser-active-columns': columnCount
        } as CSSProperties
      }
    >
      {columns.map((column, columnIndex) => (
        <div
          key={`prompt-case-loading-column-${columnIndex}`}
          className="prompt-browser-masonry-column"
        >
          {column.map((index) => (
            <Card
              as="article"
              key={`prompt-case-loading-${index}`}
              variant="media"
              density="compact"
              className="prompt-browser-case-card prompt-browser-case-card-loading"
              aria-hidden="true"
            >
              <div
                className="prompt-browser-case-image-wrap skeleton-block"
                style={
                  {
                    '--prompt-case-aspect-ratio':
                      getReservedCaseAspectRatio(index)
                  } as CSSProperties
                }
              />
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
}

function PromptLibraryCaseState({
  isZh,
  state,
  actionHref,
  showAction,
  onRetry
}: {
  isZh: boolean;
  state: Exclude<PromptLibraryCaseStatusState, null>;
  actionHref: string;
  showAction: boolean;
  onRetry?: () => void;
}) {
  const copy = {
    error: {
      title: isZh ? '案例暂时不可用' : 'Prompt cases unavailable',
      body: isZh
        ? '内容服务暂时没有返回案例，请稍后刷新重试。'
        : 'The content service did not return cases. Refresh and try again.'
    },
    empty: {
      title: isZh ? '暂无可展示的 Prompt 案例' : 'No prompt cases to show yet',
      body: isZh
        ? '这个页面的案例还在整理中，可以先浏览其他模型或创作场景。'
        : 'Cases for this page are still being curated. Try another model or use case.'
    },
    'favorites-empty': {
      title: isZh ? '还没有收藏案例' : 'No saved cases yet',
      body: isZh
        ? '浏览案例时点亮星标，就能在这里集中查看收藏。'
        : 'Save cases with the star button and they will appear here.'
    },
    'no-result': {
      title: isZh ? '当前筛选没有匹配案例' : 'No cases match this filter',
      body: isZh
        ? '暂时没有精选案例，切回全部案例可以继续浏览。'
        : 'No featured cases match yet. Switch back to all cases to keep browsing.'
    }
  }[state];

  return (
    <section className="prompt-browser-case-state" role="status">
      <span className="prompt-browser-case-state-mark" aria-hidden="true" />
      <div>
        <h2>{copy.title}</h2>
        <p>{copy.body}</p>
      </div>
      {showAction && (
        <Button
          asChild
          className="prompt-browser-case-state-action"
          variant="outline"
        >
          <Link to={actionHref}>
            {isZh ? '查看全部案例' : 'View all cases'}
          </Link>
        </Button>
      )}
      {state === 'error' && onRetry && (
        <Button
          className="prompt-browser-case-state-action"
          variant="outline"
          onClick={onRetry}
        >
          {isZh ? '重新加载' : 'Retry'}
        </Button>
      )}
    </section>
  );
}

export const PromptLibraryMasonry = forwardRef<
  HTMLElement,
  PromptLibraryMasonryProps
>(function PromptLibraryMasonry(
  {
    isZh,
    locale,
    columns,
    activeColumnCount,
    loadState,
    statusState,
    allCasesHref,
    getCaseHref,
    getCreateHref,
    aspectRatios,
    onAspectRatioChange,
    isFavorited,
    onOpenCase,
    onUseCase = () => undefined,
    onToggleFavorite,
    hasMore,
    isLoadingMore,
    isRefreshing = false,
    onLoadMore,
    loadMoreRef,
    visibleCount,
    reservedItemCount = visibleCount,
    totalCount,
    hasAnyCases,
    onRetry
  },
  ref
) {
  const columnCountForLayout =
    statusState || loadState === 'loading' || isRefreshing
      ? columns.length || activeColumnCount
      : activeColumnCount;
  const [showRefreshSkeleton, setShowRefreshSkeleton] = useState(false);
  useEffect(() => {
    if (!isRefreshing) {
      setShowRefreshSkeleton(false);
      return undefined;
    }
    const timer = window.setTimeout(
      () => setShowRefreshSkeleton(true),
      PROMPT_BROWSER_REFRESH_SKELETON_DELAY_MS
    );
    return () => window.clearTimeout(timer);
  }, [isRefreshing]);
  const showsRefreshSkeleton = isRefreshing && showRefreshSkeleton;
  const refreshSkeletonCount = Math.max(
    8,
    Math.min(visibleCount, PROMPT_BROWSER_REFRESH_SKELETON_MAX_CARDS)
  );
  const layoutColumns = useMemo(
    () =>
      Array.from(
        { length: Math.max(columns.length, columnCountForLayout) },
        (_, index) => columns[index] || []
      ),
    [columnCountForLayout, columns]
  );
  const reservedColumns = useMemo(() => {
    if (loadState !== 'ready' || statusState) return [];
    const placeholderCount = Math.max(0, reservedItemCount - visibleCount);
    if (placeholderCount === 0) return [];
    const columnCount = Math.max(1, layoutColumns.length);
    const placeholders = Array.from(
      { length: columnCount },
      () => [] as number[]
    );
    for (let index = visibleCount; index < reservedItemCount; index += 1) {
      placeholders[index % columnCount].push(index);
    }
    return placeholders;
  }, [
    layoutColumns.length,
    loadState,
    reservedItemCount,
    statusState,
    visibleCount
  ]);

  return (
    <>
      <section
        ref={ref}
        className="prompt-browser-masonry"
        aria-label={isZh ? 'Prompt 案例' : 'Prompt cases'}
        data-refreshing={
          isRefreshing && !showsRefreshSkeleton ? 'true' : undefined
        }
        style={
          {
            '--prompt-browser-active-columns': columnCountForLayout
          } as CSSProperties
        }
      >
        {loadState === 'loading' || showsRefreshSkeleton ? (
          <PromptLibraryCaseLoadingGrid
            isZh={isZh}
            columnCount={columnCountForLayout}
            count={showsRefreshSkeleton ? refreshSkeletonCount : undefined}
          />
        ) : statusState ? (
          <PromptLibraryCaseState
            isZh={isZh}
            state={statusState}
            actionHref={allCasesHref}
            showAction={
              statusState === 'no-result' || statusState === 'favorites-empty'
            }
            onRetry={onRetry}
          />
        ) : (
          layoutColumns.map((column, columnIndex) => (
            <div
              key={`prompt-case-column-${columnIndex}`}
              className="prompt-browser-masonry-column"
            >
              {column.map(({ caseItem, index }, rowIndex) => {
                const cover = getPromptCaseCover(caseItem);
                const previewText = getPromptCasePreviewText(caseItem);
                const caseTitle = caseItem.title || 'AI image prompt example';
                const displayModel =
                  getPromptCaseModelLabel(caseItem.model) ||
                  caseItem.category ||
                  'AI prompt';
                return (
                  <PromptLibraryCard
                    key={caseItem.id}
                    caseItem={caseItem}
                    index={index}
                    href={getCaseHref(caseItem, locale)}
                    createHref={getCreateHref(caseItem, locale)}
                    isZh={isZh}
                    caseTitle={caseTitle}
                    previewText={previewText}
                    isFavorited={isFavorited(caseItem.id)}
                    highPriorityCount={PROMPT_BROWSER_HIGH_PRIORITY_IMAGE_COUNT}
                    onOpen={onOpenCase}
                    onUse={onUseCase}
                    onToggleFavorite={onToggleFavorite}
                    media={
                      <PromptLibraryCaseImage
                        caseItem={caseItem}
                        index={index}
                        isColumnTop={rowIndex === 0}
                        cover={cover}
                        caseTitle={caseTitle}
                        displayModel={displayModel}
                        aspectRatio={aspectRatios[caseItem.id]}
                        onAspectRatioChange={onAspectRatioChange}
                      />
                    }
                  />
                );
              })}
              {reservedColumns[columnIndex]?.map((index) => (
                <Card
                  as="article"
                  key={`prompt-case-reserved-${index}`}
                  variant="media"
                  density="compact"
                  className="prompt-browser-case-card prompt-browser-case-card-loading"
                  aria-hidden="true"
                >
                  <div
                    className="prompt-browser-case-image-wrap skeleton-block"
                    style={
                      {
                        '--prompt-case-aspect-ratio':
                          getReservedCaseAspectRatio(index)
                      } as CSSProperties
                    }
                  />
                </Card>
              ))}
            </div>
          ))
        )}
      </section>

      {loadState === 'ready' && hasMore && !isRefreshing ? (
        <div
          ref={loadMoreRef}
          role="status"
          aria-live="polite"
          className="prompt-browser-load-sentinel"
          data-state={isLoadingMore ? 'loading' : 'auto'}
        >
          {isLoadingMore
            ? isZh
              ? '正在加载更多案例...'
              : 'Loading more cases...'
            : isZh
              ? `继续向下浏览，更多案例会自动加载（${visibleCount}/${totalCount}）`
              : `Keep scrolling, more cases load automatically (${visibleCount}/${totalCount})`}
          {!isLoadingMore && onLoadMore ? (
            <button
              type="button"
              className="prompt-browser-load-more-button"
              onClick={onLoadMore}
            >
              {isZh ? '加载更多案例' : 'Load more cases'}
            </button>
          ) : null}
        </div>
      ) : loadState === 'ready' && hasAnyCases && !isRefreshing ? (
        <div className="prompt-browser-load-sentinel" data-state="done">
          {isZh
            ? `已显示全部 ${visibleCount} 个案例`
            : `All ${visibleCount} cases shown`}
        </div>
      ) : null}
    </>
  );
});
