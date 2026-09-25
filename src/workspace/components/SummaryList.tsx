import { createLogger } from '@/utils/logger';
import type { SavedSummary } from '@/services/database';
import { getSummaryById } from '@/services/workspace-api';
import { refreshVisualImageHistoryItem } from '@/services/agent-api';
import {
  RefreshCw,
  Loader2,
  Upload,
  MoreVertical,
  Trash2,
  FileText,
  FileImage
} from 'lucide-react';

const log = createLogger('SummaryList');
import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  memo,
  type ReactNode
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  compareSummariesByCreatedAtDescIdAsc,
  extractVisualSummaryFallbackImageUrl,
  deriveVisualSummaryDisplay,
  getVisualSummaryGenerationId,
  getVisualSummaryDisplayMeta,
  type VisualSummaryDisplayMeta
} from '../utils/visual-summary';
import { readVisualSummaryAspectRatioCache } from '../utils/visual-summary-aspect-cache';
import { snapWidthToGrid } from '../hooks/useColumnLayout';
import { VisualSummaryCard } from './VisualSummaryCard';

// Gemini API 支持的文件类型
const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
];
const SUPPORTED_DOCUMENT_TYPES = ['application/pdf', 'text/plain'];

function getImageSrcFromContent(content: string | undefined): string | null {
  return extractVisualSummaryFallbackImageUrl(content);
}

function getGenerationIdFromContent(
  content: string | undefined
): string | null {
  if (!content) return null;
  const match = content.match(/\bdata-generation-id=["']([^"']+)["']/i);
  return match?.[1]?.trim() || null;
}

function isRefreshableImageHistoryUrl(imageUrl: string | null): boolean {
  if (!imageUrl) return false;
  return (
    imageUrl.includes('/storage/v1/object/sign/') ||
    imageUrl.includes('/storage/v1/object/public/')
  );
}

interface SummaryListProps {
  summaries: SavedSummary[];
  loading: boolean;
  onEnterDetail: (summary: SavedSummary) => void;
  displayMode?: 'cards' | 'list';
  layoutDensity?: 'default' | 'mobile';
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: () => void;
  onRenameSummary?: (id: string, newTitle: string) => Promise<void> | void;
  onDeleteSummary?: (id: string) => Promise<void> | void;
  onRefresh: () => void;
  containerWidth?: number; // 容器宽度，用于自适应列数
  searchTerm?: string; // 搜索词（由父组件控制）
  onFilesDrop?: (files: File[]) => void; // 拖拽文件到列表区域的回调
  hasMore?: boolean; // 是否还有更多数据
  onLoadMore?: () => void; // 加载更多回调
  loadingMore?: boolean; // 是否正在加载更多
  dragToCanvasEnabled?: boolean;
}

const CANVAS_SUMMARY_DRAG_TYPE = 'application/x-webtomind-summary-id';

/**
 * 骨架卡片组件 - 显示保存中的加载状态
 */
function SkeletonCard() {
  const { t } = useTranslation('workspace');
  return (
    <div className="relative rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
      {/* 扫光动画背景 */}
      <div className="relative h-40 overflow-hidden">
        {/* 浅灰色背景 */}
        <div className="absolute inset-0 bg-slate-100 dark:bg-slate-700" />
        {/* 扫光动画 */}
        <div
          className="absolute inset-0 animate-shimmer"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 50%, transparent 100%)',
            backgroundSize: '200% 100%'
          }}
        />
        {/* 居中的加载图标和文案 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Loader2 className="w-8 h-8 text-slate-300 dark:text-slate-500 animate-spin mb-2" />
          <span className="text-sm text-muted-foreground dark:text-slate-500 font-medium">
            {t('summaryList.saving')}
          </span>
        </div>
      </div>
      {/* 底部骨架 */}
      <div className="px-3 pb-3 pt-2 bg-white dark:bg-slate-800">
        <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded w-3/4 mb-2 animate-pulse" />
        <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded w-1/2 animate-pulse" />
      </div>
    </div>
  );
}

const ListThumbnail = memo(function ListThumbnail({
  summary,
  imageSrc,
  icon,
  alt,
  resolveFullImageSrc
}: {
  summary: SavedSummary;
  imageSrc: string | null;
  icon: ReactNode;
  alt: string;
  resolveFullImageSrc?: (summary: SavedSummary) => Promise<string | null>;
}) {
  const [currentImageSrc, setCurrentImageSrc] = useState(imageSrc);
  const [imageError, setImageError] = useState(false);
  const triedFullSummaryRef = useRef(false);

  useEffect(() => {
    triedFullSummaryRef.current = false;
    setCurrentImageSrc(imageSrc);
    setImageError(false);
  }, [imageSrc, summary.id]);

  const handleImageError = useCallback(() => {
    if (!triedFullSummaryRef.current && resolveFullImageSrc) {
      triedFullSummaryRef.current = true;
      void resolveFullImageSrc(summary)
        .then((fullImageSrc) => {
          if (fullImageSrc && fullImageSrc !== currentImageSrc) {
            setImageError(false);
            setCurrentImageSrc(fullImageSrc);
            return;
          }
          setImageError(true);
        })
        .catch((error) => {
          log.warn('[ListThumbnail] Failed to resolve full image:', error);
          setImageError(true);
        });
      return;
    }

    setImageError(true);
  }, [currentImageSrc, resolveFullImageSrc, summary]);

  if (!currentImageSrc || imageError) {
    return <>{icon}</>;
  }

  return (
    <img
      src={currentImageSrc}
      alt={alt}
      className="w-full h-full object-cover"
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={handleImageError}
    />
  );
});

// 卡片尺寸配置
const CARD_CONFIG = {
  IDEAL_WIDTH: 200, // 理想卡片宽度（面板 >= 460px 时用于计算列数）
  MIN_WIDTH: 144, // 卡片最小宽度
  MAX_WIDTH: 304, // 卡片最大宽度
  COMPACT_THRESHOLD: 180, // 小于此宽度时使用紧凑模式
  COLUMN_GAP: 16, // 列间距
  MIN_COLUMNS: 2, // 最小列数
  NARROW_THRESHOLD: 460 // 窄面板阈值
};
const VISUAL_IMAGE_INITIAL_LOAD_MULTIPLIER = 5;
const VISUAL_IMAGE_PRELOAD_DISTANCE = 1600;
const VISUAL_IMAGE_PRELOAD_MARGIN = `${VISUAL_IMAGE_PRELOAD_DISTANCE}px 0px`;

type SummaryCardItem = {
  summary: SavedSummary;
  displayMeta: VisualSummaryDisplayMeta | null;
  imageSrc: string | null;
  imageCandidates: string[];
  isImage: boolean;
  estimatedHeight: number;
  priorityIndex: number;
};

function parseCssAspectRatioNumber(ratio: string | null): number | null {
  if (!ratio) return null;
  const match = ratio.match(/^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || height <= 0) {
    return null;
  }
  return width / height;
}

function estimateSummaryCardHeight(
  item: Pick<SummaryCardItem, 'summary' | 'isImage'> & {
    aspectRatio: string | null;
  },
  cardWidth: number,
  isCompact: boolean
): number {
  if (item.summary.isSaving) return 188;

  if (item.isImage) {
    const ratio = parseCssAspectRatioNumber(item.aspectRatio);
    return ratio ? Math.max(112, cardWidth / ratio) : cardWidth * 1.25;
  }

  return isCompact ? 112 : 168;
}

function distributeSummaryCards(
  items: SummaryCardItem[],
  columnCount: number
): SummaryCardItem[][] {
  const safeColumnCount = Math.max(1, columnCount);
  const columns = Array.from(
    { length: safeColumnCount },
    () => [] as SummaryCardItem[]
  );
  const columnHeights = Array.from({ length: safeColumnCount }, () => 0);

  items.forEach((item) => {
    let targetColumn = 0;
    for (let index = 1; index < safeColumnCount; index += 1) {
      if (columnHeights[index] < columnHeights[targetColumn]) {
        targetColumn = index;
      }
    }

    columns[targetColumn].push(item);
    columnHeights[targetColumn] +=
      item.estimatedHeight + CARD_CONFIG.COLUMN_GAP;
  });

  return columns;
}

export function SummaryList({
  summaries,
  loading,
  onEnterDetail,
  displayMode = 'cards',
  layoutDensity = 'default',
  selectedIds = [],
  onToggleSelect,
  onToggleSelectAll,
  onRenameSummary,
  onDeleteSummary,
  onRefresh,
  containerWidth,
  searchTerm = '',
  onFilesDrop,
  hasMore = false,
  onLoadMore,
  loadingMore = false,
  dragToCanvasEnabled = false
}: SummaryListProps) {
  const { t, i18n } = useTranslation('workspace');
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const canDragToCanvas = dragToCanvasEnabled;
  const [activeListMenuId, setActiveListMenuId] = useState<string | null>(null);
  const isMobileList = layoutDensity === 'mobile' && displayMode === 'list';

  // 无限滚动：滚动容器引用
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 使用 ref 稳定回调函数引用，避免子组件不必要的重渲染
  const onEnterDetailRef = useRef(onEnterDetail);
  useEffect(() => {
    onEnterDetailRef.current = onEnterDetail;
  }, [onEnterDetail]);

  // 稳定的回调函数，不会因为父组件重渲染而变化
  const stableOnEnterDetail = useCallback((summary: SavedSummary) => {
    const previousScrollTop = scrollContainerRef.current?.scrollTop ?? null;
    onEnterDetailRef.current(summary);
    if (previousScrollTop === null) return;
    window.requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = previousScrollTop;
      }
    });
  }, []);

  const handleCardDelete = useCallback(
    (id: string) => {
      if (!onDeleteSummary) return;
      const confirmed = window.confirm('确定要删除这张卡片吗？');
      if (!confirmed) return;
      void onDeleteSummary(id);
    },
    [onDeleteSummary]
  );

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[data-summary-list-menu]')) {
        setActiveListMenuId(null);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);
  // 拖拽状态
  const [isDragOver, setIsDragOver] = useState(false);

  // 无限滚动：使用 IntersectionObserver 替代 scroll 事件
  // 优势：
  // 1. 性能更好：不需要频繁计算滚动位置
  // 2. 更精确：当加载指示器进入视口时触发
  // 3. 节流内置：浏览器自动优化回调频率
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

  /**
   * onLoadMore 在父组件多为 `() => loadMoreSummaries(currentProjectId)` 这种 inline
   * 闭包,每次 render 是新引用,直接放进 useEffect deps 会让 observer 反复挂卸,
   * 如果触发元素还在视口里就会重复触发 → 无限循环加载。
   * 用 ref 镜像 onLoadMore,把它从 deps 移除,observer 只在 hasMore/loadingMore
   * 变化时重挂。
   */
  const onLoadMoreRef = useRef(onLoadMore);
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  // 计算列数和卡片宽度
  // 面板 >= 460px：根据理想宽度计算列数（至少2列）
  // 面板 < 460px：固定2列，卡片宽度自适应（最小144px）
  const PADDING_LEFT_CALC = 16; // 左侧内边距
  const PADDING_RIGHT_CALC = 32; // 右侧内边距（包含滚动条宽度补偿）
  const padding = PADDING_LEFT_CALC + PADDING_RIGHT_CALC; // 左右总内边距
  const availableWidth = containerWidth ? containerWidth - padding : 400;

  let columnCount: number;
  let cardWidth: number;

  if (containerWidth && containerWidth < CARD_CONFIG.NARROW_THRESHOLD) {
    // 窄面板：固定2列，卡片宽度自适应
    columnCount = CARD_CONFIG.MIN_COLUMNS;
    cardWidth = snapWidthToGrid(
      (availableWidth - CARD_CONFIG.COLUMN_GAP) / columnCount
    );
  } else {
    // 宽面板：根据理想宽度计算列数
    columnCount = Math.max(
      CARD_CONFIG.MIN_COLUMNS,
      Math.floor(
        availableWidth / (CARD_CONFIG.IDEAL_WIDTH + CARD_CONFIG.COLUMN_GAP)
      )
    );
    cardWidth = snapWidthToGrid(
      (availableWidth - (columnCount - 1) * CARD_CONFIG.COLUMN_GAP) /
        columnCount
    );
  }

  const isCompact = cardWidth < CARD_CONFIG.COMPACT_THRESHOLD;

  // 减少日志输出 - 只在列数变化时输出
  // log.info('[SummaryList] Layout:', {
  //   containerWidth,
  //   columnCount,
  //   cardWidth: Math.round(cardWidth),
  //   isCompact
  // });

  // 检测内容是否是"纯媒体卡片"（通过上传图片/视频按钮创建的）
  // 优先使用 contentType 字段判断，如果没有则通过内容分析判断
  // 区分"纯媒体卡片"和"带媒体的文章"：
  // - 纯媒体卡片：内容主要是图片/视频，文字很少（如只有图片+描述占位符）
  // - 带媒体的文章：普通文章中插入了图片/视频，但主要内容是文字
  // - 视频卡片：包含 video-thumbnail-wrapper 或 video-player-section 类的内容
  const isImageContent = useCallback(
    (
      content: string | undefined,
      _url?: string | null,
      contentType?: string
    ): boolean => {
      // 优先使用 contentType 字段判断
      if (contentType === 'image' || contentType === 'video') {
        return true;
      }

      if (!content) return false;

      // 优先检查是否是视频卡片（包含特定的视频卡片结构）
      const isVideoCard =
        content.includes('video-thumbnail-wrapper') ||
        content.includes('video-player-section') ||
        content.includes('class="video-thumbnail"');

      if (isVideoCard) {
        return true;
      }

      // 检查是否包含图片或视频
      const hasImage = content.includes('<img ') || content.includes('<img>');
      const hasVideo =
        content.includes('<video ') || content.includes('<video>');
      if (!hasImage && !hasVideo) {
        return false;
      }

      // 提取所有纯文本内容（排除图片 alt 和 data-placeholder 占位符）
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = content;

      // 移除图片和视频元素
      const imgs = tempDiv.querySelectorAll('img');
      imgs.forEach((img) => img.remove());
      const videos = tempDiv.querySelectorAll('video');
      videos.forEach((video) => video.remove());

      // 移除占位符元素
      const placeholders = tempDiv.querySelectorAll(
        '[data-placeholder="true"]'
      );
      placeholders.forEach((el) => el.remove());

      // 获取剩余的纯文本
      const remainingText = tempDiv.textContent?.trim() || '';

      // 如果剩余文本很少（少于 30 个字符），认为是纯媒体卡片
      // 这样可以区分：
      // - 纯媒体卡片（只有图片/视频+简短描述）
      // - 带媒体的文章（有大量文字内容）
      return remainingText.length < 30;
    },
    []
  );

  const resolveFullImageSrc = useCallback(
    async (summary: SavedSummary): Promise<string | null> => {
      if (!summary.id) return null;
      const fullSummary = await getSummaryById(summary.id);
      const summaryForMetadata = fullSummary || summary;
      const displayMeta = getVisualSummaryDisplayMeta(summaryForMetadata);
      const fullMarkdown = fullSummary?.markdown;
      const fullImageSrc = getImageSrcFromContent(fullMarkdown);
      const generationId =
        getVisualSummaryGenerationId(summaryForMetadata) ||
        getGenerationIdFromContent(fullMarkdown);
      const refreshableImageUrl =
        fullImageSrc && isRefreshableImageHistoryUrl(fullImageSrc)
          ? fullImageSrc
          : isRefreshableImageHistoryUrl(summary.url)
            ? summary.url
            : isRefreshableImageHistoryUrl(displayMeta.refreshUrl)
              ? displayMeta.refreshUrl
              : null;

      if (generationId || refreshableImageUrl) {
        try {
          const refreshed = await refreshVisualImageHistoryItem({
            generationId,
            imageUrl: refreshableImageUrl
          });
          if (
            refreshed?.thumbnailUrl ||
            refreshed?.previewUrl ||
            refreshed?.imageUrl
          ) {
            return (
              refreshed.thumbnailUrl ||
              refreshed.previewUrl ||
              refreshed.imageUrl
            );
          }
        } catch (error) {
          log.warn('[SummaryList] Failed to refresh generated image URL:', {
            summaryId: summary.id,
            error
          });
        }
      }

      const metadataImageSrc = displayMeta.displayUrl;
      if (metadataImageSrc) {
        return metadataImageSrc;
      }

      return fullImageSrc;
    },
    []
  );

  // 移除标题前的序号前缀，如 (1)、1.、1、、[1] 等
  const removeNumberPrefix = (text: string): string => {
    return text
      .replace(/^\s*\(\d+\)\s*/, '') // (1) 格式
      .replace(/^\s*\[\d+\]\s*/, '') // [1] 格式
      .replace(/^\s*\d+[.、:：]\s*/, '') // 1. 或 1、 或 1: 格式
      .trim();
  };

  // 从markdown或HTML中提取标题
  const getTitle = useCallback(
    (content: string | undefined): string => {
      if (!content) return t('summaryList.noTitle');
      // 检测是否是 HTML 格式（编辑后的内容）
      if (content.trim().startsWith('<')) {
        // 从 HTML 中提取第一个 div 的文本内容（标题）
        const match = content.match(
          /<div[^>]*class="[^"]*text-xl[^"]*"[^>]*>([^<]+)<\/div>/
        );
        if (match) return removeNumberPrefix(match[1].trim());

        // 如果没找到标题样式的 div，提取第一个 div 的文本
        const firstDiv = content.match(/<div[^>]*>([^<]+)<\/div>/);
        if (firstDiv) {
          const text = removeNumberPrefix(firstDiv[1].trim());
          return text.slice(0, 30) + (text.length > 30 ? '...' : '');
        }
        return t('summaryList.noTitle');
      }

      // Markdown 格式
      const match = content.match(/^#\s+(.+)$/m);
      if (match) {
        const title = match[1]
          .replace(/\*\*([^*]+)\*\*/g, '$1')
          .replace(/\*([^*]+)\*/g, '$1')
          .trim();
        return removeNumberPrefix(title);
      }
      // 如果没有标题，返回前30个字符作为标题
      const text = content
        .replace(/#{1,6}\s/g, '')
        .replace(/[*_`~]/g, '')
        .trim();
      const cleanText = removeNumberPrefix(text);
      return cleanText.slice(0, 30) + (cleanText.length > 30 ? '...' : '');
    },
    [t]
  );

  // 从markdown或HTML中提取内容摘要（跳过标题）
  const getExcerpt = (
    content: string | undefined,
    maxLength: number = 150
  ): string => {
    if (!content) return '';
    // 检测是否是 HTML 格式
    if (content.trim().startsWith('<')) {
      // 从 HTML 中提取所有文本，跳过第一个 div（标题）
      const divs = content.match(/<div[^>]*>([^<]*)<\/div>/g) || [];
      const texts = divs
        .slice(1)
        .map((div) => {
          const match = div.match(/<div[^>]*>([^<]*)<\/div>/);
          return match ? match[1].trim() : '';
        })
        .filter((t) => t.length > 0);

      const text = texts.join(' ').trim();
      return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
    }

    // Markdown 格式
    // 移除第一个标题行
    const withoutTitle = content.replace(/^#\s+.+\n?/, '');
    // 移除markdown标记
    const text = withoutTitle
      .replace(/#{1,6}\s/g, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/[_`~]/g, '')
      .replace(/\n+/g, ' ')
      .replace(/- /g, '')
      .trim();

    return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
  };

  // 格式化时间为相对时间
  const formatRelativeTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return t('summaryList.justNow');
    if (minutes < 60) return t('summaryList.minutesAgo', { count: minutes });
    if (hours < 24) return t('summaryList.hoursAgo', { count: hours });
    if (days < 30) return t('summaryList.daysAgo', { count: days });
    return new Date(timestamp).toLocaleDateString(
      i18n.language === 'zh-CN' ? 'zh-CN' : 'en-US'
    );
  };

  const searchedSummaries = useMemo(
    () =>
      summaries.filter((s) => {
        // 确保 searchTerm 是字符串
        const term = (searchTerm || '').toLowerCase();
        if (!term) return true; // 空搜索词显示所有结果

        // 安全地检查每个字段
        const titleMatch =
          typeof s.title === 'string' && s.title.toLowerCase().includes(term);
        const markdownMatch =
          typeof s.markdown === 'string' &&
          s.markdown.toLowerCase().includes(term);
        const urlMatch =
          typeof s.url === 'string' && s.url.toLowerCase().includes(term);

        return titleMatch || markdownMatch || urlMatch;
      }),
    [searchTerm, summaries]
  );

  const filteredSummaries = useMemo(() => {
    const next = [...searchedSummaries];
    next.sort(compareSummariesByCreatedAtDescIdAsc);

    return next;
  }, [searchedSummaries]);

  useEffect(() => {
    if (loading || !hasMore || loadingMore) return;

    const trigger = loadMoreTriggerRef.current;
    if (!trigger) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          log.info('[SummaryList] Load more trigger visible, loading...');
          onLoadMoreRef.current?.();
        }
      },
      {
        root: scrollContainerRef.current,
        rootMargin: '200px', // 提前 200px 触发
        threshold: 0
      }
    );

    observer.observe(trigger);
    return () => observer.disconnect();
  }, [displayMode, filteredSummaries.length, hasMore, loading, loadingMore]);

  const masonryItems = useMemo<SummaryCardItem[]>(() => {
    return filteredSummaries.map((summary, index) => {
      if (summary.isSaving) {
        return {
          summary,
          displayMeta: null,
          imageSrc: null,
          imageCandidates: [],
          isImage: false,
          estimatedHeight: 188,
          priorityIndex: index
        };
      }

      const displayMeta = deriveVisualSummaryDisplay(summary);
      const isImage =
        displayMeta.isVisual ||
        isImageContent(summary.markdown, summary.url, summary.contentType);
      const imageCandidates = displayMeta.candidates;
      const imageSrc = isImage ? imageCandidates[0] || null : null;
      const cachedAspectRatio = readVisualSummaryAspectRatioCache(
        summary.id,
        imageSrc
      );
      const aspectRatio = cachedAspectRatio || displayMeta.aspectRatio;

      return {
        summary,
        displayMeta,
        imageSrc,
        imageCandidates,
        isImage,
        estimatedHeight: estimateSummaryCardHeight(
          {
            summary,
            isImage,
            aspectRatio
          },
          cardWidth,
          isCompact
        ),
        priorityIndex: index
      };
    });
  }, [cardWidth, filteredSummaries, isCompact, isImageContent]);

  const masonryColumns = useMemo(
    () => distributeSummaryCards(masonryItems, columnCount),
    [columnCount, masonryItems]
  );
  const initialVisualImageIds = useMemo(() => {
    const initialLimit = Math.max(
      columnCount * VISUAL_IMAGE_INITIAL_LOAD_MULTIPLIER,
      8
    );
    return new Set(
      masonryItems
        .filter((item) => item.isImage && item.imageSrc)
        .slice(0, initialLimit)
        .map((item) => item.summary.id)
    );
  }, [columnCount, masonryItems]);
  const [warmVisualImageIds, setWarmVisualImageIds] = useState<Set<string>>(
    () => new Set(initialVisualImageIds)
  );

  useEffect(() => {
    if (initialVisualImageIds.size === 0) return;
    setWarmVisualImageIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      initialVisualImageIds.forEach((id) => {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [initialVisualImageIds]);

  const warmVisibleVisualImages = useCallback(() => {
    if (displayMode !== 'cards') return;
    const root = scrollContainerRef.current;
    if (!root) return;

    const rootRect = root.getBoundingClientRect();
    const preloadTop = rootRect.top - VISUAL_IMAGE_PRELOAD_DISTANCE;
    const preloadBottom = rootRect.bottom + VISUAL_IMAGE_PRELOAD_DISTANCE;
    const visibleIds: string[] = [];

    root
      .querySelectorAll<HTMLElement>('[data-visual-summary-id]')
      .forEach((card) => {
        const id = card.dataset.visualSummaryId;
        if (!id) return;

        const cardRect = card.getBoundingClientRect();
        if (cardRect.bottom >= preloadTop && cardRect.top <= preloadBottom) {
          visibleIds.push(id);
        }
      });

    if (visibleIds.length === 0) return;

    setWarmVisualImageIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      visibleIds.forEach((id) => {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [displayMode]);

  useEffect(() => {
    if (displayMode !== 'cards') return;
    const root = scrollContainerRef.current;
    if (!root) return;

    let animationFrameId = 0;
    const scheduleWarm = () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
      }
      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = 0;
        warmVisibleVisualImages();
      });
    };

    scheduleWarm();
    const timeoutId = window.setTimeout(scheduleWarm, 250);
    root.addEventListener('scroll', scheduleWarm, { passive: true });
    window.addEventListener('resize', scheduleWarm);

    return () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
      }
      window.clearTimeout(timeoutId);
      root.removeEventListener('scroll', scheduleWarm);
      window.removeEventListener('resize', scheduleWarm);
    };
  }, [columnCount, displayMode, masonryItems.length, warmVisibleVisualImages]);

  useEffect(() => {
    if (displayMode !== 'cards') return;
    const root = scrollContainerRef.current;
    if (!root) return;

    const cards = Array.from(
      root.querySelectorAll<HTMLElement>('[data-visual-summary-id]')
    );
    const pendingCards = cards.filter((card) => {
      const id = card.dataset.visualSummaryId;
      return id && !warmVisualImageIds.has(id);
    });

    if (pendingCards.length === 0) return;

    if (typeof IntersectionObserver === 'undefined') {
      setWarmVisualImageIds((prev) => {
        const next = new Set(prev);
        pendingCards.forEach((card) => {
          const id = card.dataset.visualSummaryId;
          if (id) next.add(id);
        });
        return next;
      });
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleIds = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => (entry.target as HTMLElement).dataset.visualSummaryId)
          .filter((id): id is string => Boolean(id));

        if (visibleIds.length === 0) return;

        entries.forEach((entry) => {
          if (entry.isIntersecting) observer.unobserve(entry.target);
        });

        setWarmVisualImageIds((prev) => {
          let changed = false;
          const next = new Set(prev);
          visibleIds.forEach((id) => {
            if (!next.has(id)) {
              next.add(id);
              changed = true;
            }
          });
          return changed ? next : prev;
        });
      },
      {
        root,
        rootMargin: VISUAL_IMAGE_PRELOAD_MARGIN,
        threshold: 0
      }
    );

    pendingCards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [displayMode, masonryColumns, warmVisualImageIds]);

  const getListThumb = (
    summary: SavedSummary
  ): {
    imageSrc: string | null;
    icon: JSX.Element;
  } => {
    const imageSrc = deriveVisualSummaryDisplay(summary).displayUrl;
    if (summary.contentType === 'image') {
      return {
        imageSrc,
        icon: <FileImage className="w-4 h-4 text-slate-500" />
      };
    }
    return {
      imageSrc,
      icon: <FileText className="w-4 h-4 text-slate-500" />
    };
  };

  // 拖拽事件处理
  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (onFilesDrop && e.dataTransfer.types.includes('Files')) {
        setIsDragOver(true);
      }
    },
    [onFilesDrop]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 只有当离开整个容器时才取消高亮
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (!onFilesDrop) return;

      const files = Array.from(e.dataTransfer.files);
      // 过滤出支持的文件类型
      const supportedFiles = files.filter(
        (file) =>
          SUPPORTED_IMAGE_TYPES.includes(file.type) ||
          SUPPORTED_DOCUMENT_TYPES.includes(file.type)
      );

      if (supportedFiles.length > 0) {
        log.info(
          '[SummaryList] Files dropped:',
          supportedFiles.map((f) => f.name)
        );
        onFilesDrop(supportedFiles);
      }
    },
    [onFilesDrop]
  );

  return (
    <div
      ref={scrollContainerRef}
      className={`min-h-0 flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900 custom-scrollbar relative ${isDragOver ? 'ring-2 ring-blue-500 ring-inset' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 拖拽提示覆盖层 */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-blue-500/10 backdrop-blur-sm pointer-events-none">
          <div className="flex flex-col items-center gap-3 text-blue-600 dark:text-blue-400">
            <Upload className="w-12 h-12" />
            <span className="text-lg font-medium">释放以创建来源</span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-muted-foreground dark:text-slate-500">
            {t('summaryList.loading')}
          </div>
        </div>
      ) : filteredSummaries.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground dark:text-slate-500">
          <p className="mb-2">
            {searchTerm
              ? t('summaryList.noMatches')
              : t('summaryList.noSummaries')}
          </p>
          <button
            type="button"
            onClick={onRefresh}
            className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
          >
            <RefreshCw className="w-4 h-4" />
            {t('summaryList.refresh')}
          </button>
        </div>
      ) : displayMode === 'list' ? (
        <div className={isMobileList ? 'p-3 space-y-2.5' : 'p-2 space-y-2'}>
          <div
            className={`sticky top-0 z-20 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-sm border border-slate-200 dark:border-slate-700 space-y-1.5 ${
              isMobileList ? 'rounded-xl px-3 py-2' : 'rounded-lg px-2 py-1.5'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                选择所有来源
              </span>
              {onToggleSelect && (
                <input
                  type="checkbox"
                  checked={
                    filteredSummaries.length > 0 &&
                    filteredSummaries.every((item) => selectedSet.has(item.id))
                  }
                  onChange={() => onToggleSelectAll?.()}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              )}
            </div>
          </div>

          {filteredSummaries.map((summary) => {
            if (summary.isSaving) {
              return <SkeletonCard key={summary.id} />;
            }

            const isSelected = selectedSet.has(summary.id);
            const isMenuOpen = activeListMenuId === summary.id;
            const { imageSrc, icon } = getListThumb(summary);

            return (
              <div
                key={summary.id}
                className={`group relative rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm cursor-pointer ${
                  isMobileList ? 'px-3 py-3' : 'px-3 py-2'
                }`}
                draggable={canDragToCanvas}
                onDragStart={(event) => {
                  if (!canDragToCanvas) return;
                  event.dataTransfer.setData(
                    CANVAS_SUMMARY_DRAG_TYPE,
                    summary.id
                  );
                  event.dataTransfer.setData('text/plain', summary.id);
                  event.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => stableOnEnterDetail(summary)}
              >
                <div
                  className={
                    isMobileList
                      ? 'flex items-start gap-3'
                      : 'flex items-center gap-3'
                  }
                >
                  <div
                    className={`relative shrink-0 ${isMobileList ? 'h-14 w-14' : 'h-6 w-6'}`}
                    data-summary-list-menu
                  >
                    <div
                      className={`absolute inset-0 flex items-center justify-center overflow-hidden bg-slate-100 dark:bg-slate-700 transition-opacity ${
                        isMobileList ? 'rounded-xl' : 'rounded'
                      } ${
                        isMenuOpen
                          ? 'opacity-0'
                          : isMobileList
                            ? 'opacity-100'
                            : 'opacity-100 group-hover:opacity-0'
                      }`}
                    >
                      <ListThumbnail
                        summary={summary}
                        imageSrc={imageSrc}
                        icon={icon}
                        alt={summary.title || getTitle(summary.markdown)}
                        resolveFullImageSrc={resolveFullImageSrc}
                      />
                    </div>
                    <button
                      type="button"
                      data-summary-list-menu
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveListMenuId((prev) =>
                          prev === summary.id ? null : summary.id
                        );
                      }}
                      className={`absolute flex items-center justify-center bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 transition-opacity ${
                        isMobileList
                          ? '-right-1 -top-1 h-7 w-7 rounded-full border border-white/80 shadow-sm dark:border-slate-800'
                          : 'inset-0 rounded'
                      } ${
                        isMenuOpen
                          ? 'opacity-100'
                          : isMobileList
                            ? 'opacity-100'
                            : 'opacity-0 group-hover:opacity-100'
                      }`}
                      title="更多"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    {isMenuOpen && (
                      <div
                        data-summary-list-menu
                        className="absolute left-0 top-full mt-1 min-w-[120px] rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg z-30 py-1"
                      >
                        <button
                          type="button"
                          className="w-full px-3 py-1.5 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveListMenuId(null);
                            if (!onRenameSummary) return;
                            const currentTitle =
                              summary.title || getTitle(summary.markdown);
                            const nextTitle = window.prompt(
                              '请输入新标题',
                              currentTitle
                            );
                            if (!nextTitle) return;
                            const trimmed = nextTitle.trim();
                            if (!trimmed || trimmed === currentTitle) return;
                            void onRenameSummary(summary.id, trimmed);
                          }}
                        >
                          重命名
                        </button>
                        <button
                          type="button"
                          className="w-full px-3 py-1.5 text-left text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveListMenuId(null);
                            if (!onDeleteSummary) return;
                            const confirmed =
                              window.confirm('确定要删除这张卡片吗？');
                            if (!confirmed) return;
                            void onDeleteSummary(summary.id);
                          }}
                        >
                          删除
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div
                      className={`font-medium text-slate-900 dark:text-slate-100 ${
                        isMobileList
                          ? 'text-sm leading-5 line-clamp-2'
                          : 'truncate text-sm'
                      }`}
                    >
                      {summary.title || getTitle(summary.markdown)}
                    </div>
                    {isMobileList && (
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {formatRelativeTime(summary.createdAt)}
                      </div>
                    )}
                  </div>

                  {onToggleSelect && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        onToggleSelect(summary.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className={`${isMobileList ? 'mt-1 h-5 w-5' : 'h-4 w-4'} rounded border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0`}
                    />
                  )}
                </div>
              </div>
            );
          })}

          <div
            ref={loadMoreTriggerRef}
            className="w-full flex justify-center py-4"
          >
            {loadingMore ? (
              <div className="flex items-center gap-2 text-muted-foreground dark:text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">
                  {t('summaryList.loadingMore', '加载更多...')}
                </span>
              </div>
            ) : hasMore ? (
              <div className="text-sm text-muted-foreground dark:text-slate-500">
                {t('summaryList.scrollForMore', '向下滚动加载更多')}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="p-3">
          <div
            className="grid items-start"
            style={{
              gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
              gap: `${CARD_CONFIG.COLUMN_GAP}px`
            }}
          >
            {masonryColumns.map((column, columnIndex) => (
              <div
                key={columnIndex}
                className="flex min-w-0 flex-col"
                style={{ gap: CARD_CONFIG.COLUMN_GAP }}
              >
                {column.map((item) => {
                  const { summary } = item;

                  // 如果正在保存中，显示骨架卡片
                  if (summary.isSaving) {
                    return (
                      <div key={summary.id} className="w-full">
                        <SkeletonCard />
                      </div>
                    );
                  }

                  return item.isImage && item.imageSrc && item.displayMeta ? (
                    // 图片类型卡片（使用独立组件处理加载状态和错误）
                    <div
                      key={summary.id}
                      className="w-full"
                      data-visual-summary-id={summary.id}
                    >
                      <VisualSummaryCard
                        summary={summary}
                        imageSrc={item.imageSrc}
                        imageCandidates={item.imageCandidates}
                        displayMeta={item.displayMeta}
                        title={summary.title || t('summaryList.image')}
                        time={formatRelativeTime(summary.createdAt)}
                        selected={selectedSet.has(summary.id)}
                        onToggleSelect={onToggleSelect}
                        onDeleteSummary={
                          onDeleteSummary ? handleCardDelete : undefined
                        }
                        onEnterDetail={stableOnEnterDetail}
                        resolveFullImageSrc={resolveFullImageSrc}
                        dragToCanvasEnabled={canDragToCanvas}
                        shouldLoad={
                          initialVisualImageIds.has(summary.id) ||
                          warmVisualImageIds.has(summary.id)
                        }
                        loadingMode={
                          initialVisualImageIds.has(summary.id)
                            ? 'eager'
                            : 'lazy'
                        }
                        fetchPriority={
                          initialVisualImageIds.has(summary.id)
                            ? 'high'
                            : 'auto'
                        }
                      />
                    </div>
                  ) : (
                    // 普通文本卡片
                    <div
                      key={summary.id}
                      className={`group relative rounded-xl cursor-pointer transition-all bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 ${isCompact ? 'p-3' : 'p-4'}`}
                      draggable={canDragToCanvas}
                      onDragStart={(event) => {
                        if (!canDragToCanvas) return;
                        event.dataTransfer.setData(
                          CANVAS_SUMMARY_DRAG_TYPE,
                          summary.id
                        );
                        event.dataTransfer.setData('text/plain', summary.id);
                        event.dataTransfer.effectAllowed = 'copy';
                      }}
                      onClick={() => stableOnEnterDetail(summary)}
                    >
                      {onDeleteSummary && (
                        <button
                          type="button"
                          className="absolute left-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-50/95 text-slate-500 opacity-0 shadow-sm transition-all hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 dark:bg-slate-700/95 dark:text-slate-300 dark:hover:bg-red-900/30 dark:hover:text-red-300"
                          title="删除"
                          aria-label="删除卡片"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleCardDelete(summary.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {onToggleSelect &&
                        (() => {
                          const isSelected = selectedSet.has(summary.id);
                          return (
                            <label
                              className={`absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-1.5 py-1 rounded-md bg-slate-50/95 dark:bg-slate-700/95 transition-opacity ${
                                isSelected
                                  ? 'opacity-100'
                                  : 'opacity-0 group-hover:opacity-100'
                              }`}
                              onClick={(e) => e.stopPropagation()}
                              onDragStart={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => onToggleSelect(summary.id)}
                                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              />
                            </label>
                          );
                        })()}

                      {/* 标题：紧凑模式 2 行，正常模式 3 行 */}
                      {/* 优先使用 summary.title 字段，与 BoardsOverview 保持一致 */}
                      <h3
                        className={`font-semibold text-slate-900 dark:text-slate-100 leading-snug overflow-hidden ${isCompact ? 'text-sm mb-1' : 'text-base mb-2'}`}
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: isCompact ? 2 : 3,
                          WebkitBoxOrient: 'vertical'
                        }}
                      >
                        {summary.title || getTitle(summary.markdown)}
                      </h3>

                      {/* 内容摘要：紧凑模式不显示，正常模式显示 3 行 */}
                      {!isCompact && (
                        <p
                          className="text-xs text-slate-600 leading-relaxed mb-2 overflow-hidden"
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical'
                          }}
                        >
                          {getExcerpt(summary.markdown, 200)}
                        </p>
                      )}

                      {/* 时间 */}
                      <p className="text-xs text-muted-foreground dark:text-slate-500">
                        {formatRelativeTime(summary.createdAt)}
                      </p>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* 加载更多触发器 - 使用 IntersectionObserver 检测 */}
          <div
            ref={loadMoreTriggerRef}
            className="w-full flex justify-center py-4"
          >
            {loadingMore ? (
              <div className="flex items-center gap-2 text-muted-foreground dark:text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">
                  {t('summaryList.loadingMore', '加载更多...')}
                </span>
              </div>
            ) : hasMore ? (
              <div className="text-sm text-muted-foreground dark:text-slate-500">
                {t('summaryList.scrollForMore', '向下滚动加载更多')}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
