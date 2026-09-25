import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  memo,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type SyntheticEvent
} from 'react';
import { useTranslation } from 'react-i18next';
import { createLogger } from '@/utils/logger';
import { useVisualImageCache } from '@/shared/useVisualImageCache';
import { cn } from '@/lib/utils';
import {
  Card,
  imageFetchPriority,
  MediaTile,
  type ImageFetchPriority
} from '@/shared/ui';
import { Button } from '@/shared/ui/radix/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/shared/ui/radix/popover';
import { Separator } from '@/shared/ui/radix/separator';
import { Skeleton } from '@/shared/ui/radix/skeleton';
import {
  ToggleGroup,
  ToggleGroupItem
} from '@/shared/ui/radix/toggle-group';

const log = createLogger('BoardsOverview');
import {
  Plus,
  Inbox,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Grid,
  List,
  Clock,
  Search,
  ArrowUpDown,
  MoreHorizontal,
  Edit3,
  Star,
  Archive,
  Check,
  ArchiveRestore
} from 'lucide-react';
import {
  Project,
  updateProject,
  getAllSummaries
} from '@/services/workspace-api';
import { refreshVisualImageHistoryItem } from '@/services/agent-api';
import type { SavedSummary } from '@/services/database';
import { ProjectEditModal } from './ProjectEditModal';
import { GlobalSearchModal } from './GlobalSearchModal';
import {
  getProjectThumbnails,
  setProjectThumbnails
} from '@/services/workspace-cache';
import {
  WORKSPACE_SUMMARY_SAVED_EVENT,
  type WorkspaceSummarySavedDetail
} from '@/services/workspace-events';
import {
  compareSummariesByCreatedAtDescIdAsc,
  deriveVisualSummaryDisplay,
  type VisualSummaryDisplayMeta
} from '../utils/visual-summary';
import { isSourceSummary } from '../utils/workflow-state';

// 提取文本摘要工具函数
const getExcerpt = (markdown: string | undefined, length: number = 80) => {
  if (!markdown) return '';
  const text = markdown
    .replace(/<[^>]+>/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/[*_`~]/g, '')
    .trim();
  return text.slice(0, length) + (text.length > length ? '...' : '');
};

const handleVisualMediaLoad = (
  event: SyntheticEvent<HTMLImageElement>
): void => {
  if (event.currentTarget.dataset.preserveAspect !== 'true') return;
  const { naturalWidth, naturalHeight } = event.currentTarget;
  if (naturalWidth > 0 && naturalHeight > 0) {
    event.currentTarget.parentElement?.style.setProperty(
      '--workspace-visual-aspect-ratio',
      `${naturalWidth} / ${naturalHeight}`
    );
  }
};

interface CachedOverviewImageProps {
  summary: SavedSummary;
  src: string;
  candidates: string[];
  visualMeta?: VisualSummaryDisplayMeta;
  alt: string;
  className?: string;
  loading?: 'eager' | 'lazy';
  fetchPriority?: ImageFetchPriority;
  preserveAspect?: boolean;
}

const CachedOverviewImage = memo(function CachedOverviewImage({
  summary,
  src,
  candidates,
  visualMeta,
  alt,
  className,
  loading = 'lazy',
  fetchPriority = 'auto',
  preserveAspect = false
}: CachedOverviewImageProps) {
  const [currentSrc, setCurrentSrc] = useState(src);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isHidden, setIsHidden] = useState(!src);
  const fallbackIndexRef = useRef(0);
  const refreshAttemptedRef = useRef(false);

  useEffect(() => {
    setCurrentSrc(src);
    setIsLoaded(false);
    setIsHidden(!src);
    fallbackIndexRef.current = 0;
    refreshAttemptedRef.current = false;
  }, [src, summary.id]);

  const displaySrc = useVisualImageCache({
    id: summary.id,
    sourceUrl: currentSrc,
    variant: 'thumbnail',
    strategy: loading === 'eager' ? 'network-immediate' : 'cache-first'
  });

  const handleImageError = useCallback(() => {
    const currentIndex = Math.max(
      fallbackIndexRef.current,
      candidates.indexOf(currentSrc)
    );
    const nextUrl = candidates
      .slice(currentIndex + 1)
      .find((url) => url && url !== currentSrc);

    if (nextUrl) {
      const nextIndex = candidates.indexOf(nextUrl);
      fallbackIndexRef.current = nextIndex >= 0 ? nextIndex : currentIndex + 1;
      setIsLoaded(false);
      setIsHidden(false);
      setCurrentSrc(nextUrl);
      return;
    }

    if (
      visualMeta &&
      !refreshAttemptedRef.current &&
      (visualMeta.generationId ||
        visualMeta.refreshUrl ||
        visualMeta.originalUrl ||
        visualMeta.displayUrl)
    ) {
      refreshAttemptedRef.current = true;
      void refreshVisualImageHistoryItem({
        generationId: visualMeta.generationId,
        imageUrl:
          visualMeta.refreshUrl ||
          visualMeta.originalUrl ||
          visualMeta.displayUrl
      })
        .then((refreshed) => {
          if (!refreshed) {
            setIsHidden(true);
            return;
          }
          const refreshedUrl = [
            refreshed.thumbnailUrl,
            refreshed.previewUrl,
            refreshed.imageUrl
          ].find((url): url is string => Boolean(url));

          if (!refreshedUrl) {
            setIsHidden(true);
            return;
          }

          fallbackIndexRef.current = 0;
          setIsLoaded(false);
          setIsHidden(false);
          setCurrentSrc(refreshedUrl);
        })
        .catch((error) => {
          log.warn(
            '[BoardsOverview] Failed to refresh visual thumbnail:',
            error
          );
          setIsHidden(true);
        });
      return;
    }

    setIsHidden(true);
  }, [candidates, currentSrc, visualMeta]);

  useEffect(() => {
    if (!displaySrc || isLoaded || isHidden) return;
    const timeoutId = window.setTimeout(
      handleImageError,
      loading === 'eager' ? 7000 : 10000
    );
    return () => window.clearTimeout(timeoutId);
  }, [displaySrc, handleImageError, isHidden, isLoaded, loading]);

  if (!displaySrc || isHidden) return null;

  return (
    <img
      src={displaySrc}
      alt={alt}
      loading={loading}
      decoding="async"
      {...imageFetchPriority(fetchPriority)}
      referrerPolicy="no-referrer"
      data-preserve-aspect={preserveAspect ? 'true' : undefined}
      className={className}
      onLoad={(event) => {
        setIsLoaded(true);
        handleVisualMediaLoad(event);
      }}
      onError={handleImageError}
    />
  );
});

const RecentSkeleton = () => (
  <div className="flex gap-4 overflow-hidden py-1">
    {[1, 2, 3, 4, 5, 6].map((i) => (
      <MediaTile
        key={i}
        ratio="portrait"
        fit="cover"
        className="workspace-recent-media-card flex-shrink-0 overflow-hidden rounded-xl"
      >
        <Skeleton className="size-full rounded-none" />
      </MediaTile>
    ))}
  </div>
);

const ProjectCardSkeleton = () => (
  <Card variant="flat" className="relative overflow-hidden p-5">
    <div className="flex items-start justify-between mb-8">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-xl" />
        <div>
          <Skeleton className="mb-2 h-4 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    </div>
    <div className="h-[122px] mt-3 flex items-end -space-x-4">
      {[1, 2, 3].map((i) => (
        <MediaTile
          key={i}
          ratio="portrait"
          fit="cover"
          className="workspace-project-thumb-card relative overflow-hidden rounded-lg border border-background"
        >
          <Skeleton className="size-full rounded-none" />
        </MediaTile>
      ))}
    </div>
  </Card>
);

interface BoardsOverviewProps {
  onSelectProject: (projectId: string | null) => void;
  onSelectSummary?: (summary: SavedSummary) => void;
  currentProjectId: string | null;
  summaries: SavedSummary[];
  projects: Project[];
  summariesLoading: boolean;
  projectsLoading: boolean;
  onCreateProject: (name: string) => Promise<Project>;
  onDeleteProject: (id: string) => Promise<void>;
  onArchiveProject?: (id: string, archived: boolean) => Promise<void>;
  onFavoriteProject?: (id: string, favorited: boolean) => Promise<void>;
  onUpdateProject?: (
    id: string,
    data: {
      name?: string;
      icon?: string;
      color?: string;
      instructions?: string | null;
    }
  ) => Promise<void>;
}

export function BoardsOverview({
  onSelectProject,
  onSelectSummary,
  currentProjectId,
  summaries,
  projects,
  summariesLoading,
  projectsLoading,
  onCreateProject,
  onDeleteProject,
  onArchiveProject,
  onFavoriteProject,
  onUpdateProject
}: BoardsOverviewProps) {
  const { t } = useTranslation('boards');
  const [creating, setCreating] = useState(false);

  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    try {
      const saved = localStorage.getItem('boards_view_mode');
      return saved === 'list' || saved === 'grid' ? saved : 'grid';
    } catch {
      return 'grid';
    }
  });
  const [sortBy, setSortBy] = useState<
    | 'updatedDesc'
    | 'updatedAsc'
    | 'createdDesc'
    | 'createdAsc'
    | 'nameAsc'
    | 'nameDesc'
  >(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem('boards_sort_by');
    } catch {
      saved = null;
    }
    const validOptions: Array<
      | 'updatedDesc'
      | 'updatedAsc'
      | 'createdDesc'
      | 'createdAsc'
      | 'nameAsc'
      | 'nameDesc'
    > = [
      'updatedDesc',
      'updatedAsc',
      'createdDesc',
      'createdAsc',
      'nameAsc',
      'nameDesc'
    ];
    return validOptions.includes((saved || '') as (typeof validOptions)[number])
      ? ((saved || 'updatedDesc') as (typeof validOptions)[number])
      : 'updatedDesc';
  });
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);

  // 按需加载的项目 summaries 缓存
  const [projectSummariesCache, setProjectSummariesCache] = useState<
    Record<string, SavedSummary[]>
  >({});
  const [loadingProjects, setLoadingProjects] = useState<Set<string>>(
    new Set()
  );

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scheduledProjectLoadsRef = useRef<Set<string>>(new Set());
  const preloadSignatureRef = useRef<string>('');
  const projectSummariesCacheRef = useRef(projectSummariesCache);
  const loadingProjectsRef = useRef(loadingProjects);
  const projectSummaryCountsRef = useRef<Record<string, number>>({});
  const [optimisticSummaries, setOptimisticSummaries] = useState<
    SavedSummary[]
  >([]);

  useEffect(() => {
    projectSummariesCacheRef.current = projectSummariesCache;
  }, [projectSummariesCache]);

  useEffect(() => {
    loadingProjectsRef.current = loadingProjects;
  }, [loadingProjects]);

  const storeProjectSummaries = useCallback(
    (projectId: string, nextSummaries: SavedSummary[]) => {
      setProjectSummariesCache((prev) => ({
        ...prev,
        [projectId]: nextSummaries
      }));
      projectSummariesCacheRef.current = {
        ...projectSummariesCacheRef.current,
        [projectId]: nextSummaries
      };
    },
    []
  );

  useEffect(() => {
    const handleSummarySaved = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceSummarySavedDetail>).detail;
      const summary = detail?.summary;
      const projectId = detail?.projectId || summary?.projectId;
      if (!summary) return;

      setOptimisticSummaries((prev) => {
        const filtered = prev.filter((item) => item.id !== summary.id);
        return [summary, ...filtered].slice(0, 20);
      });

      if (!projectId) return;

      const current = projectSummariesCacheRef.current[projectId] || [];
      const nextSummaries = [
        summary,
        ...current.filter((item) => item.id !== summary.id)
      ].slice(0, 3);

      storeProjectSummaries(projectId, nextSummaries);
      void setProjectThumbnails(projectId, nextSummaries);
    };

    window.addEventListener(WORKSPACE_SUMMARY_SAVED_EVENT, handleSummarySaved);
    return () => {
      window.removeEventListener(
        WORKSPACE_SUMMARY_SAVED_EVENT,
        handleSummarySaved
      );
    };
  }, [storeProjectSummaries]);

  const boardSummaries = useMemo(() => {
    if (optimisticSummaries.length === 0) return summaries;

    const seen = new Set<string>();
    return [...optimisticSummaries, ...summaries].filter((summary) => {
      if (!summary.id) return true;
      if (seen.has(summary.id)) return false;
      seen.add(summary.id);
      return true;
    });
  }, [optimisticSummaries, summaries]);

  const refreshProjectSummariesFromNetwork = useCallback(
    async (projectId: string, showLoading: boolean) => {
      if (loadingProjectsRef.current.has(projectId)) return;
      if (showLoading) {
        loadingProjectsRef.current = new Set(loadingProjectsRef.current).add(
          projectId
        );
        setLoadingProjects(new Set(loadingProjectsRef.current));
      }

      try {
        const result = await getAllSummaries(projectId, {
          limit: 3,
          offset: 0
        });
        storeProjectSummaries(projectId, result.summaries);
        await setProjectThumbnails(projectId, result.summaries);
      } catch (error) {
        log.error(
          '[BoardsOverview] Failed to load project summaries:',
          projectId,
          error
        );
      } finally {
        scheduledProjectLoadsRef.current.delete(projectId);
        if (showLoading) {
          const next = new Set(loadingProjectsRef.current);
          next.delete(projectId);
          loadingProjectsRef.current = next;
          setLoadingProjects(next);
        }
      }
    },
    [storeProjectSummaries]
  );

  // 按需加载项目的 summaries。命中 IndexedDB 后仍后台刷新一次，避免过期签名图卡在灰块。
  const loadProjectSummaries = useCallback(
    async (projectId: string) => {
      if (
        loadingProjectsRef.current.has(projectId) ||
        projectSummariesCacheRef.current[projectId]
      ) {
        scheduledProjectLoadsRef.current.delete(projectId);
        return;
      }

      try {
        const cached = await getProjectThumbnails(projectId);
        if (cached && cached.length > 0) {
          storeProjectSummaries(projectId, cached);
          void refreshProjectSummariesFromNetwork(projectId, false);
          scheduledProjectLoadsRef.current.delete(projectId);
          return;
        }
      } catch (error) {
        log.warn('[BoardsOverview] Failed to get cached thumbnails:', error);
      }

      await refreshProjectSummariesFromNetwork(projectId, true);
    },
    [refreshProjectSummariesFromNetwork, storeProjectSummaries]
  );

  // 获取项目的 summaries（优先使用全局 summaries，否则使用已加载的缓存）
  const getProjectSummariesFromCache = useCallback(
    (projectId: string, summaryCount: number): SavedSummary[] => {
      // 先从全局 summaries 中查找
      const fromGlobal = boardSummaries
        .filter((s) => s.projectId === projectId)
        .sort(compareSummariesByCreatedAtDescIdAsc)
        .slice(0, 3);
      if (fromGlobal.length > 0) {
        return fromGlobal;
      }

      // 如果全局没有但项目有内容，尝试从缓存获取或触发加载
      if (summaryCount > 0) {
        const fromCache = projectSummariesCache[projectId];
        if (fromCache) {
          return [...fromCache].sort(compareSummariesByCreatedAtDescIdAsc);
        }
      }

      return [];
    },
    [boardSummaries, projectSummariesCache]
  );

  // 组件挂载时只预热已存在的缩略图缓存；网络请求交给可见卡片按需触发。
  useEffect(() => {
    const signature = projects
      .map((project) => `${project.id}:${project.summaryCount}`)
      .join('|');
    if (signature === preloadSignatureRef.current) return;
    preloadSignatureRef.current = signature;

    const preloadThumbnails = async () => {
      for (const project of projects.slice(0, 24)) {
        const previousCount = projectSummaryCountsRef.current[project.id];
        const currentCount = project.summaryCount || 0;
        const countChanged =
          previousCount !== undefined && previousCount !== currentCount;
        projectSummaryCountsRef.current[project.id] = currentCount;

        if (project.summaryCount > 0 && countChanged) {
          void refreshProjectSummariesFromNetwork(project.id, false);
          continue;
        }

        if (project.summaryCount > 0 && !projectSummariesCache[project.id]) {
          try {
            const cached = await getProjectThumbnails(project.id);
            if (cached && cached.length > 0) {
              storeProjectSummaries(project.id, cached);
              void refreshProjectSummariesFromNetwork(project.id, false);
            } else {
              scheduledProjectLoadsRef.current.delete(project.id);
            }
          } catch {
            // 忽略错误，后续会按需加载
          }
        }
      }
    };

    if (projects.length > 0) {
      preloadThumbnails();
    }
  }, [
    projectSummariesCache,
    projects,
    refreshProjectSummariesFromNetwork,
    storeProjectSummaries
  ]);

  // 保存视图模式到 localStorage
  useEffect(() => {
    try {
      localStorage.setItem('boards_view_mode', viewMode);
    } catch {
      // ignore unavailable storage
    }
  }, [viewMode]);

  // 保存排序方式到 localStorage
  useEffect(() => {
    try {
      localStorage.setItem('boards_sort_by', sortBy);
    } catch {
      // ignore unavailable storage
    }
  }, [sortBy]);

  // 排序选项
  const sortOptions = [
    { id: 'updatedDesc', label: t('boards.sort.updatedDesc', '最后更新 (↓)') },
    { id: 'updatedAsc', label: t('boards.sort.updatedAsc', '最后更新 (↑)') },
    { id: 'createdDesc', label: t('boards.sort.createdDesc', '创建日期 (↓)') },
    { id: 'createdAsc', label: t('boards.sort.createdAsc', '创建日期 (↑)') },
    { id: 'nameAsc', label: t('boards.sort.nameAsc', '项目名称 (A-Z)') },
    { id: 'nameDesc', label: t('boards.sort.nameDesc', '项目名称 (Z-A)') }
  ] as const;

  // 按归档状态筛选项目
  const filteredByArchive = projects.filter((p) => {
    if (activeTab === 'active') {
      return !p.archivedAt; // 未归档的项目
    } else {
      return !!p.archivedAt; // 已归档的项目
    }
  });

  // 对项目进行排序
  const sortedProjects = [...filteredByArchive].sort((a, b) => {
    switch (sortBy) {
      case 'updatedDesc':
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      case 'updatedAsc':
        return (a.updatedAt || 0) - (b.updatedAt || 0);
      case 'createdDesc':
        return (b.createdAt || 0) - (a.createdAt || 0);
      case 'createdAsc':
        return (a.createdAt || 0) - (b.createdAt || 0);
      case 'nameAsc':
        return a.name.localeCompare(b.name, 'zh-CN');
      case 'nameDesc':
        return b.name.localeCompare(a.name, 'zh-CN');
      default:
        return 0;
    }
  });

  // 归档/取消归档项目
  const handleArchiveProject = async (id: string, archived: boolean) => {
    try {
      if (onArchiveProject) {
        await onArchiveProject(id, archived);
      } else {
        await updateProject(id, { archived });
        // 刷新页面以获取最新数据
        window.location.reload();
      }
    } catch (error) {
      log.error('[BoardsOverview] Archive project failed:', error);
    }
  };

  // 收藏/取消收藏项目
  const handleFavoriteProject = async (id: string, favorited: boolean) => {
    try {
      if (onFavoriteProject) {
        await onFavoriteProject(id, favorited);
      } else {
        await updateProject(id, { favorited });
      }
    } catch (error) {
      log.error('[BoardsOverview] Favorite project failed:', error);
    }
  };

  // 编辑项目
  const handleEditProject = async (
    id: string,
    data: { name: string; icon: string; instructions: string }
  ) => {
    try {
      if (onUpdateProject) {
        await onUpdateProject(id, data);
      } else {
        // instructions 空串 → 传 null 让后端清空字段
        await updateProject(id, {
          name: data.name,
          icon: data.icon,
          instructions: data.instructions || null
        });
        // 刷新页面以获取最新数据
        window.location.reload();
      }
    } catch (error) {
      log.error('[BoardsOverview] Edit project failed:', error);
      throw error;
    }
  };

  // 快速创建项目 - 点击即创建，使用默认名称和随机图标
  const handleQuickCreateProject = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const defaultName = t('boards.defaultProjectName', '新建项目');
      const project = await onCreateProject(defaultName);
      // 创建成功后直接进入项目
      onSelectProject(project.id);
    } catch (error) {
      log.error('[BoardsOverview] Quick create project failed:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteProject = async (id: string, isDefault: boolean) => {
    if (isDefault) return;
    if (!confirm('确定要删除这个项目吗？项目内的内容将不再属于该项目。'))
      return;

    try {
      await onDeleteProject(id);
    } catch (error) {
      log.error('[BoardsOverview] Delete project failed:', error);
    }
  };

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const { scrollLeft, clientWidth } = scrollContainerRef.current;
      const scrollTo =
        direction === 'left'
          ? scrollLeft - clientWidth / 2
          : scrollLeft + clientWidth / 2;
      scrollContainerRef.current.scrollTo({
        left: scrollTo,
        behavior: 'smooth'
      });
    }
  };

  // 过滤出最近 10 条来源 (横向滚动)
  const recentSummaries = useMemo(
    () =>
      boardSummaries
        .filter(isSourceSummary)
        .sort(compareSummariesByCreatedAtDescIdAsc)
        .slice(0, 10),
    [boardSummaries]
  );

  // 记录上一次的第一个卡片 ID，用于检测新卡片
  const prevFirstIdRef = useRef<string | undefined>(undefined);

  // 当新卡片添加到最前面时，自动滚动到最左边
  useEffect(() => {
    const currentFirstId = recentSummaries[0]?.id;

    // 如果第一个卡片 ID 变化了（新卡片插入），滚动到最左边
    if (
      currentFirstId &&
      prevFirstIdRef.current &&
      currentFirstId !== prevFirstIdRef.current &&
      scrollContainerRef.current
    ) {
      scrollContainerRef.current.scrollTo({ left: 0, behavior: 'smooth' });
    }

    prevFirstIdRef.current = currentFirstId;
  }, [recentSummaries]);

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900 custom-scrollbar select-none">
      <div className="workspace-grid-wrap pt-6 pb-8">
        {/* 顶部操作区域 — 窄屏改成纵向排列,按钮与标题不挤一行 */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              {t('boards.title')}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => setShowGlobalSearch(true)}
              variant="outline"
            >
              <Search data-icon="inline-start" />
              {t('boards.search', '搜索')}
            </Button>
            <Button onClick={handleQuickCreateProject} disabled={creating}>
              {creating ? (
                <Loader2 data-icon="inline-start" className="animate-spin" />
              ) : (
                <Plus data-icon="inline-start" />
              )}
              {t('boards.createProject')}
            </Button>
          </div>
        </header>

        {/* 最近添加 (横向滚动区域) */}
        <section className="mb-12 relative group/recent">
          <div className="flex items-center gap-2 text-slate-500 mb-4 px-1 text-sm font-medium">
            <Clock className="w-4 h-4" />
            <span>{t('boards.recentContent')}</span>
          </div>

          <div className="relative">
            <div
              ref={scrollContainerRef}
              className="flex gap-4 overflow-x-auto py-3 px-1 snap-x scroll-smooth"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {summariesLoading ? (
                <RecentSkeleton />
              ) : recentSummaries.length > 0 ? (
                recentSummaries.map((s, idx) => {
                  const visualMeta = deriveVisualSummaryDisplay(s);
                  const mediaCandidates = visualMeta.candidates;
                  const mediaUrl = mediaCandidates[0] || visualMeta.refreshUrl;
                  const isVideoByType = s.contentType === 'video';
                  const shouldUseMediaCard = visualMeta.isVisual && !!mediaUrl;
                  const shouldRenderAsVideo =
                    isVideoByType && mediaUrl?.includes('data:video');

                  // 图片/视频卡片 - 整个容器都是媒体，悬停时显示信息
                  if (shouldUseMediaCard) {
                    return (
                      <MediaTile
                        key={s.id || idx}
                        ratio="portrait"
                        fit="cover"
                        data-summary-id={s.id}
                        onClick={() => onSelectSummary?.(s)}
                        className="workspace-recent-media-card snap-start flex-shrink-0 rounded-xl cursor-pointer transition-all hover:-translate-y-1.5 hover:shadow-xl overflow-hidden group/s relative"
                      >
                        {shouldRenderAsVideo ? (
                          <video
                            src={mediaUrl}
                            muted
                            playsInline
                            preload="metadata"
                            className="w-full h-full object-cover transition-transform duration-slow"
                          />
                        ) : (
                          <CachedOverviewImage
                            summary={s}
                            src={mediaUrl}
                            candidates={mediaCandidates}
                            visualMeta={visualMeta}
                            alt={s.title || 'Untitled'}
                            loading={idx < 8 ? 'eager' : 'lazy'}
                            fetchPriority={idx < 6 ? 'high' : 'auto'}
                            className="w-full h-full object-cover transition-transform duration-slow"
                          />
                        )}
                        {/* 视频类型标识 - 只有真正的视频内容才显示 */}
                        {isVideoByType && (
                          <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/60 rounded text-[10px] text-white font-medium flex items-center gap-1">
                            <svg
                              className="w-3 h-3"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                            >
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                        )}
                        {/* 底部渐变遮罩 + 信息 - 悬停时显示 */}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 opacity-0 group-hover/s:opacity-100 transition-opacity duration-base">
                          <h4 className="text-white text-xs font-semibold line-clamp-2 leading-snug mb-1">
                            {s.title || 'Untitled'}
                          </h4>
                          <span className="text-[10px] text-white/70">
                            {s.createdAt
                              ? new Date(s.createdAt).toLocaleDateString(
                                  'zh-CN'
                                )
                              : 'Just now'}
                          </span>
                        </div>
                      </MediaTile>
                    );
                  }

                  // 文本卡片 - 标题 + 内容摘要
                  return (
                    <Card
                      variant="interactive"
                      key={s.id || idx}
                      data-summary-id={s.id}
                      onClick={() => onSelectSummary?.(s)}
                      className="workspace-recent-text-card snap-start flex-shrink-0 p-4 cursor-pointer transition-all hover:-translate-y-1.5 hover:shadow-xl hover:border-blue-200 dark:hover:border-blue-500"
                    >
                      <h4 className="text-slate-900 dark:text-slate-100 text-sm font-semibold line-clamp-2 leading-snug mb-2">
                        {s.title || 'Untitled'}
                      </h4>
                      <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed mb-3">
                        {getExcerpt(s.markdown)}
                      </p>
                      <span className="text-[10px] text-muted-foreground dark:text-slate-500">
                        {s.createdAt
                          ? new Date(s.createdAt).toLocaleDateString('zh-CN')
                          : 'Just now'}
                      </span>
                    </Card>
                  );
                })
              ) : (
                <div className="p-8 text-center text-slate-500 w-full italic text-sm">
                  暂无最近内容
                </div>
              )}
            </div>

            {/* 左右滚动按钮 */}
            <Button
              onClick={() => scroll('left')}
              className="absolute left-[-20px] top-1/2 z-30 -translate-y-1/2 rounded-full opacity-0 shadow-md transition-opacity group-hover/recent:opacity-100"
              size="icon"
              type="button"
              variant="outline"
            >
              <ChevronLeft data-icon="inline-start" />
            </Button>
            <Button
              onClick={() => scroll('right')}
              className="absolute right-[-20px] top-1/2 z-30 -translate-y-1/2 rounded-full opacity-0 shadow-md transition-opacity group-hover/recent:opacity-100"
              size="icon"
              type="button"
              variant="outline"
            >
              <ChevronRight data-icon="inline-start" />
            </Button>
          </div>
        </section>

        {/* 项目列表头部控制 */}
        <div className="flex items-center justify-between mb-6 border-b border-slate-200 dark:border-slate-700 pb-4">
          <ToggleGroup
            aria-label={t('boards.filters', '项目筛选')}
            className="justify-start"
            onValueChange={(value) => {
              if (value === 'active' || value === 'archived') {
                setActiveTab(value);
              }
            }}
            type="single"
            value={activeTab}
            variant="outline"
          >
            <ToggleGroupItem value="active">
              <Inbox />
              <span>{t('boards.active')}</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="archived">
              <Trash2 />
              <span>{t('boards.archived')}</span>
            </ToggleGroupItem>
          </ToggleGroup>
          <div className="flex items-center gap-4 text-muted-foreground dark:text-slate-500">
            <Popover open={showSortMenu} onOpenChange={setShowSortMenu}>
              <PopoverTrigger asChild>
                <Button
                  aria-label={t('boards.sort.label', '排序')}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <ArrowUpDown />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-48 p-1"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex flex-col gap-1">
                  {sortOptions.map((option) => (
                    <Button
                      className="w-full justify-between"
                      key={option.id}
                      onClick={() => {
                        setSortBy(option.id);
                        setShowSortMenu(false);
                      }}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <span>{option.label}</span>
                      {sortBy === option.id ? (
                        <Check data-icon="inline-end" />
                      ) : null}
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Separator className="h-4" orientation="vertical" />
            <ToggleGroup
              aria-label={t('boards.viewMode', '视图模式')}
              onValueChange={(value) => {
                if (value === 'grid' || value === 'list') {
                  setViewMode(value);
                }
              }}
              size="sm"
              type="single"
              value={viewMode}
              variant="outline"
            >
              <ToggleGroupItem
                aria-label={t('boards.gridView', '网格视图')}
                value="grid"
              >
                <Grid />
              </ToggleGroupItem>
              <ToggleGroupItem
                aria-label={t('boards.listView', '列表视图')}
                value="list"
              >
                <List />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        {/* 项目网格 / 列表 */}
        {viewMode === 'grid' ? (
          <div className="workspace-project-grid">
            {projectsLoading ? (
              <>
                <ProjectCardSkeleton />
                <ProjectCardSkeleton />
                <ProjectCardSkeleton />
                <ProjectCardSkeleton />
              </>
            ) : sortedProjects.length > 0 ? (
              sortedProjects.map((project) => {
                // 使用智能获取函数，支持按需加载
                const projectSummaries = getProjectSummariesFromCache(
                  project.id,
                  project.summaryCount || 0
                );
                const isLoadingProjectSummaries = loadingProjects.has(
                  project.id
                );
                // 优先使用项目自己的 icon，没有时默认项目显示 Inbox，其他显示文件夹
                const projectIcon = project.icon ? (
                  <span className="text-2xl">{project.icon}</span>
                ) : project.isDefault ? (
                  <Inbox className="w-6 h-6 text-slate-500" />
                ) : (
                  <span className="text-2xl">📁</span>
                );
                return (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    name={project.name}
                    icon={projectIcon}
                    color={project.color}
                    isSelected={currentProjectId === project.id}
                    onClick={() => onSelectProject(project.id)}
                    summaryCount={project.summaryCount || 0}
                    conversationCount={project.conversationCount || 0}
                    onDelete={() =>
                      handleDeleteProject(project.id, project.isDefault)
                    }
                    onArchive={() =>
                      handleArchiveProject(project.id, !project.archivedAt)
                    }
                    onFavorite={() =>
                      handleFavoriteProject(project.id, !project.favoritedAt)
                    }
                    onEdit={() => setEditingProject(project)}
                    isDefault={project.isDefault}
                    isArchived={!!project.archivedAt}
                    isFavorited={!!project.favoritedAt}
                    createdAt={project.createdAt}
                    recentSummaries={projectSummaries}
                    summariesLoading={
                      summariesLoading || isLoadingProjectSummaries
                    }
                    onRequestSummaries={loadProjectSummaries}
                    onSelectSummary={onSelectSummary}
                  />
                );
              })
            ) : (
              <div className="col-span-full py-12 text-center text-muted-foreground dark:text-slate-500 italic">
                {activeTab === 'active'
                  ? t('boards.noProjects', '尚未创建项目')
                  : t('boards.noArchivedProjects', '暂无已归档项目')}
              </div>
            )}
          </div>
        ) : (
          /* 列表视图 */
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
            {/* 表头 */}
            <div className="workspace-project-list-row px-5 py-3 bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <div className="col-span-5">
                {t('boards.listHeader.name', '项目名称')}
              </div>
              <div className="col-span-2 text-center">
                {t('boards.listHeader.lastUpdated', '最后更新')}
              </div>
              <div className="col-span-2 text-center">
                {t('boards.listHeader.created', '创建日期')}
              </div>
              <div className="col-span-3 text-right"></div>
            </div>
            {/* 用户项目 */}
            {projectsLoading ? (
              [1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="workspace-project-list-row px-5 py-4 border-b border-slate-50 dark:border-slate-700 relative overflow-hidden"
                >
                  <div className="col-span-5 flex items-center gap-3">
                    <Skeleton className="size-8 rounded-lg" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <div className="col-span-2 flex justify-center">
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <div className="col-span-2 flex justify-center">
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <div className="col-span-3 flex justify-end">
                    <Skeleton className="h-4 w-8" />
                  </div>
                </div>
              ))
            ) : sortedProjects.length > 0 ? (
              sortedProjects.map((project) => {
                // 优先使用项目自己的 icon
                const listIcon = project.icon ? (
                  <span className="text-base">{project.icon}</span>
                ) : project.isDefault ? (
                  <Inbox className="w-4 h-4 text-slate-500" />
                ) : (
                  <span className="text-base">📁</span>
                );
                return (
                  <ProjectListItem
                    key={project.id}
                    project={project}
                    icon={listIcon}
                    isSelected={currentProjectId === project.id}
                    onClick={() => onSelectProject(project.id)}
                    onDelete={() =>
                      handleDeleteProject(project.id, project.isDefault)
                    }
                    onArchive={() =>
                      handleArchiveProject(project.id, !project.archivedAt)
                    }
                    onFavorite={() =>
                      handleFavoriteProject(project.id, !project.favoritedAt)
                    }
                    onEdit={() => setEditingProject(project)}
                  />
                );
              })
            ) : (
              <div className="py-12 text-center text-muted-foreground dark:text-slate-500 italic">
                {activeTab === 'active'
                  ? t('boards.noProjects', '尚未创建项目')
                  : t('boards.noArchivedProjects', '暂无已归档项目')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 编辑项目弹窗 */}
      {editingProject && (
        <ProjectEditModal
          project={editingProject}
          onClose={() => setEditingProject(null)}
          onSave={async (data) => {
            await handleEditProject(editingProject.id, data);
            setEditingProject(null);
          }}
        />
      )}

      {/* 全局搜索弹窗 */}
      <GlobalSearchModal
        isOpen={showGlobalSearch}
        onClose={() => setShowGlobalSearch(false)}
        onSelectResult={(summary) => {
          setShowGlobalSearch(false);
          onSelectSummary?.(summary);
        }}
        summaries={summaries}
        projects={projects}
      />
    </div>
  );
}

// ProjectCard 组件的 props 类型
interface ProjectCardProps {
  project: Project;
  name: string;
  icon: ReactNode;
  color?: string;
  isSelected?: boolean;
  onClick: () => void;
  onDelete: () => void;
  onArchive?: () => void;
  onFavorite?: () => void;
  onEdit?: () => void;
  isSpecial?: boolean;
  isDefault?: boolean;
  isArchived?: boolean;
  isFavorited?: boolean;
  summaryCount?: number;
  conversationCount?: number;
  createdAt?: number;
  recentSummaries?: SavedSummary[];
  summariesLoading?: boolean;
  onRequestSummaries?: (projectId: string) => void;
  onSelectSummary?: (summary: SavedSummary) => void;
}

// 内部项目卡片组件 - 使用 memo 优化避免不必要的重渲染
const ProjectCard = memo(function ProjectCard({
  project: _project,
  name,
  icon,
  color: _color,
  isSelected: _isSelected,
  onClick,
  onDelete,
  onArchive,
  onFavorite,
  onEdit,
  isSpecial,
  isDefault,
  isArchived,
  isFavorited,
  summaryCount = 0,
  createdAt,
  recentSummaries = [],
  summariesLoading,
  onRequestSummaries,
  onSelectSummary
}: ProjectCardProps) {
  const cardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (
      !onRequestSummaries ||
      summariesLoading ||
      summaryCount <= 0 ||
      recentSummaries.length > 0
    ) {
      return;
    }

    const node = cardRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onRequestSummaries(_project.id);
          observer.disconnect();
        }
      },
      { rootMargin: '360px 0px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [
    _project.id,
    onRequestSummaries,
    recentSummaries.length,
    summaryCount,
    summariesLoading
  ]);

  // 格式化日期
  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'Jan 5, 2026';
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <Card
      ref={cardRef}
      variant="interactive"
      onClick={onClick}
      className="group relative p-5 cursor-pointer transition-all hover:border-blue-300 dark:hover:border-blue-500 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-slate-900/50"
    >
      {/* 更多按钮 */}
      {!isSpecial && (
        <ProjectActionsPopover
          align="end"
          className="absolute top-3 right-3 z-[60] opacity-0 group-hover:opacity-100"
          isArchived={isArchived}
          isDefault={isDefault}
          isFavorited={isFavorited}
          onArchive={onArchive}
          onDelete={onDelete}
          onEdit={onEdit}
          onFavorite={onFavorite}
        />
      )}

      {/* 顶部：图标 + 项目名 + 日期 */}
      <div className="mb-4">
        {/* 项目图标 */}
        <div className="text-2xl mb-3">{icon}</div>

        {/* 项目名称 */}
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-0.5 truncate leading-snug">
          {name}
        </h3>

        {/* 创建日期 */}
        <span className="text-[11px] text-muted-foreground dark:text-slate-500 font-medium">
          {formatDate(createdAt)}
        </span>
      </div>

      {/* 底部：最近3个素材预览 */}
      <div className="relative h-[122px] mt-3 flex items-end z-0">
        {summariesLoading ? (
          <div className="flex -space-x-4">
            {[1, 2, 3].map((i) => (
              <MediaTile
                key={i}
                ratio="portrait"
                fit="cover"
                className={`workspace-project-thumb-card relative overflow-hidden rounded-xl border border-background ${i === 1 ? '-rotate-2' : i === 2 ? 'rotate-1' : 'rotate-3'}`}
                style={{ zIndex: 30 - (i - 1) * 10 }}
              >
                <Skeleton className="size-full rounded-none" />
              </MediaTile>
            ))}
          </div>
        ) : recentSummaries.length > 0 ? (
          <div className="flex -space-x-4">
            {recentSummaries.slice(0, 3).map((s, idx: number) => {
              const visualMeta = deriveVisualSummaryDisplay(s);
              const mediaCandidates = visualMeta.candidates;
              const mediaUrl = mediaCandidates[0] || visualMeta.refreshUrl;
              const isVideoByType = s.contentType === 'video';
              const shouldUseMediaCard = visualMeta.isVisual && !!mediaUrl;
              const shouldRenderAsVideo =
                isVideoByType && mediaUrl?.includes('data:video');

              // 这里的顺序是 0, 1, 2，我们让后面的层级更高，或者反过来
              // 根据图片效果，左侧的最靠前（z-index 最高）
              const zIndex = 30 - idx * 10;
              const rotation =
                idx === 0 ? '-rotate-2' : idx === 1 ? 'rotate-1' : 'rotate-3';
              const translateY = idx === 1 ? '-translate-y-1' : 'translate-y-0';

              return (
                <MediaTile
                  ratio="portrait"
                  fit="cover"
                  key={s.id || idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectSummary?.(s);
                  }}
                  className={`workspace-project-thumb-card bg-white dark:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-600 overflow-hidden relative group/item flex flex-col shadow-sm transition-all hover:z-50 hover:-translate-y-2 cursor-pointer ${rotation} ${translateY}`}
                  style={
                    {
                      zIndex
                    } as CSSProperties
                  }
                >
                  {shouldUseMediaCard ? (
                    shouldRenderAsVideo ? (
                      <video
                        src={mediaUrl}
                        muted
                        playsInline
                        preload="metadata"
                        className="w-full h-full object-cover transition-transform duration-slow"
                      />
                    ) : (
                      <>
                        <CachedOverviewImage
                          summary={s}
                          src={mediaUrl}
                          candidates={mediaCandidates}
                          visualMeta={visualMeta}
                          alt={s.title || 'Untitled'}
                          loading="eager"
                          fetchPriority={idx === 0 ? 'high' : 'auto'}
                          className="w-full h-full object-cover transition-transform duration-slow"
                        />
                        {/* 视频类型标识 */}
                        {isVideoByType && (
                          <div className="absolute top-1 right-1 px-1 py-0.5 bg-black/60 rounded text-[8px] text-white font-medium flex items-center gap-0.5">
                            <svg
                              className="w-2 h-2"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                            >
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                        )}
                      </>
                    )
                  ) : (
                    <div className="w-full h-full p-2 flex flex-col bg-white dark:bg-slate-700">
                      <h4 className="text-[10px] font-bold text-slate-900 dark:text-slate-100 line-clamp-2 leading-tight mb-1">
                        {s.title || 'Untitled'}
                      </h4>
                      <p className="text-[8px] text-muted-foreground dark:text-slate-500 line-clamp-4 leading-tight">
                        {getExcerpt(s.markdown, 50)}
                      </p>
                    </div>
                  )}
                  {/* 悬停信息 */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/item:opacity-100 transition-opacity flex flex-col justify-end p-2 overflow-hidden">
                    <p className="text-[9px] text-white font-medium line-clamp-1 leading-tight">
                      {s.title || 'Untitled'}
                    </p>
                    <p className="text-[7px] text-white/70">
                      {new Date(s.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                </MediaTile>
              );
            })}
          </div>
        ) : (
          /* 无素材时展示一个占位符 */
          <div className="h-[104px] aspect-[3/4] bg-slate-50/50 dark:bg-slate-700/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-600 flex items-center justify-center">
            {/* 留空 */}
          </div>
        )}
      </div>
    </Card>
  );
});

interface ProjectActionsPopoverProps {
  align?: 'start' | 'center' | 'end';
  className?: string;
  isArchived?: boolean;
  isDefault?: boolean;
  isFavorited?: boolean;
  onArchive?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onFavorite?: () => void;
  triggerSize?: 'default' | 'compact';
}

function ProjectActionsPopover({
  align = 'end',
  className,
  isArchived,
  isDefault,
  isFavorited,
  onArchive,
  onDelete,
  onEdit,
  onFavorite,
  triggerSize = 'default'
}: ProjectActionsPopoverProps) {
  const { t } = useTranslation('boards');
  const [open, setOpen] = useState(false);

  const runAction =
    (action?: () => void) => (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      setOpen(false);
      action?.();
    };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label={t('boards.actions.more', '更多操作')}
          className={cn(
            'text-muted-foreground',
            triggerSize === 'compact' && 'size-7',
            className
          )}
          onClick={(event) => event.stopPropagation()}
          size="icon"
          type="button"
          variant="ghost"
        >
          <MoreHorizontal />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-44 p-1"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-col gap-1">
          <Button
            className="w-full justify-start"
            disabled={!onEdit}
            onClick={runAction(onEdit)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Edit3 data-icon="inline-start" />
            {t('boards.actions.edit')}
          </Button>
          <Button
            className="w-full justify-start"
            disabled={!onFavorite}
            onClick={runAction(onFavorite)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Star
              className={isFavorited ? 'fill-amber-400 text-amber-400' : ''}
              data-icon="inline-start"
            />
            {isFavorited
              ? t('boards.actions.unfavorite', '取消收藏')
              : t('boards.actions.favorite')}
          </Button>
          <Button
            className="w-full justify-start"
            disabled={!onArchive}
            onClick={runAction(onArchive)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {isArchived ? (
              <ArchiveRestore data-icon="inline-start" />
            ) : (
              <Archive data-icon="inline-start" />
            )}
            {isArchived
              ? t('boards.actions.unarchive', '取消归档')
              : t('boards.actions.archive')}
          </Button>
          {!isDefault && (
            <>
              <Separator className="my-1" />
              <Button
                className="w-full justify-start text-destructive hover:text-destructive"
                disabled={!onDelete}
                onClick={runAction(onDelete)}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Trash2 data-icon="inline-start" />
                {t('boards.actions.delete')}
              </Button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// 列表视图项目组件
function ProjectListItem({
  project,
  icon,
  isSelected,
  onClick,
  onDelete,
  onArchive,
  onFavorite,
  onEdit
}: {
  project: Project;
  icon: ReactNode;
  isSelected: boolean;
  onClick: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onFavorite: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation('boards');

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const isArchived = !!project.archivedAt;

  return (
    <div
      onClick={onClick}
      className="workspace-project-list-row group px-5 py-3.5 cursor-pointer transition-all border-b border-slate-100 dark:border-slate-700 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-700"
    >
      {/* 项目名称 + 图标 */}
      <div className="col-span-5 flex items-center gap-3 min-w-0">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-sm flex-shrink-0"
          style={{ backgroundColor: project.color || '#3b82f6' }}
        >
          {icon}
        </div>
        <span
          className={`text-sm font-medium truncate ${isSelected ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}
        >
          {project.name}
        </span>
        {/* 悬停时显示的操作按钮 */}
        {!project.isDefault && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
            <Button
              aria-label={
                project.favoritedAt
                  ? t('boards.actions.unfavorite', '取消收藏')
                  : t('boards.actions.favorite')
              }
              className={cn(
                'size-7',
                project.favoritedAt && 'text-amber-500'
              )}
              onClick={(e) => {
                e.stopPropagation();
                onFavorite();
              }}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Star
                className={project.favoritedAt ? 'fill-amber-400' : ''}
                data-icon="inline-start"
              />
            </Button>
            <ProjectActionsPopover
              align="start"
              isArchived={isArchived}
              isDefault={project.isDefault}
              isFavorited={!!project.favoritedAt}
              onArchive={onArchive}
              onDelete={onDelete}
              onEdit={onEdit}
              onFavorite={onFavorite}
              triggerSize="compact"
            />
          </div>
        )}
      </div>

      {/* 最后更新 */}
      <div className="col-span-2 flex items-center justify-center">
        <span className="text-sm text-slate-500">
          {formatDate(project.updatedAt)}
        </span>
      </div>

      {/* 创建日期 */}
      <div className="col-span-2 flex items-center justify-center">
        <span className="text-sm text-slate-500">
          {formatDate(project.createdAt)}
        </span>
      </div>

      {/* 操作区域 - 保持空白，操作按钮在名称后面 */}
      <div className="col-span-3 flex items-center justify-end"></div>
    </div>
  );
}
