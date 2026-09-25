import {
  lazy,
  Suspense,
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
  startTransition,
  type CSSProperties,
  type ComponentType
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { createLogger } from '@/utils/logger';
import { FREE_DAILY_CREDITS } from '@/shared/credit-policy';

const log = createLogger('App');
import type { SavedSummary } from '@/services/database';
import type { Reference } from '@/types';
import {
  Plus,
  FileText,
  ImageIcon,
  Search,
  X,
  Layout,
  Zap,
  LogOut,
  Crown,
  Settings,
  Trash2,
  Download,
  Puzzle,
  Wand2,
  Home,
  MessageSquare,
  ChevronRight,
  Grid3X3,
  List,
  Bot,
  MousePointer2,
  PanelLeftClose
} from 'lucide-react';
import { isAllowedWebOrigin } from '@/utils/constants';
import { escapeHtml, compressImage } from '@/utils/image-utils';
import { deriveVisualSummaryDisplay } from './utils/visual-summary';
import { SummaryList } from './components/SummaryList';
import { SummaryDetail } from './components/SummaryDetail';
import { AddSourceModal } from './components/AddSourceModal';
import { ChatArea } from './components/ChatArea';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useWorkspaceUser } from './hooks/useWorkspaceUser';
import {
  saveSummary,
  updateSummary,
  deleteSummary as deleteSummaryApi,
  getSummaryById,
  createSkill,
  updateSkill,
  deleteSkill,
  createStudioDocument,
  type Skill
} from '@/services/workspace-api';
// hooks
import { useWorkspaceProjects } from './hooks/useWorkspaceProjects';
import { useWorkspaceShortcuts } from './hooks/useWorkspaceShortcuts';
import { useWorkspaceSummaries } from './hooks/useWorkspaceSummaries';
import { useSkills } from './hooks/useSkills';
import {
  WorkbenchProjectSwitcher,
  WorkbenchTopbar
} from './components/WorkbenchTopbar';
import { Navigation, NavigationLink, NavigationList } from '@/shared/ui';
import { UserAvatar } from '@/shared/components/UserAvatar';
import { Logo } from './components/Logo';
import {
  updateSummaryCache,
  removeSummaryFromCache,
  addSummaryToCache,
  consumePendingRefresh
} from '@/services/workspace-cache';
import { uploadBrowserFileToStorage } from '@/services/image-storage';
import type {
  CanvasAnnotationKind,
  CanvasConnection,
  CanvasCustomNode,
  CanvasProjectState
} from './canvas/types';

const SELECTED_SUMMARY_REF_PREFIX = 'selected-summary-ref-';
const CANVAS_SUMMARY_REF_PREFIX = 'canvas-node-ref-';
const PROJECT_CANVAS_NODE_IDS_STORAGE_KEY =
  'webtomind:project-canvas-node-ids:v1';
const PROJECT_CANVAS_STATE_STORAGE_KEY = 'webtomind:project-canvas-state:v1';
const PROJECT_AGENT_PANEL_MAX_WIDTH = 416;
const PROJECT_AGENT_PANEL_MAX_RATIO = 0.27;
const CANVAS_POSITION_LIMIT = 100000;
const CANVAS_NODE_MIN_SIZE = 16;
const CANVAS_NODE_MAX_SIZE = 8192;
const CANVAS_MIN_SCALE = 0.05;
const CANVAS_MAX_SCALE = 5;
const CANVAS_AI_HOLDER_DEFAULT_TARGET_WIDTH = 1024;
const CANVAS_AI_HOLDER_DEFAULT_TARGET_HEIGHT = 1024;
const CANVAS_AI_HOLDER_DEFAULT_ASPECT_RATIO = '1:1';

function createEmptyCanvasProjectState(): CanvasProjectState {
  return {
    nodeIds: [],
    activeNodeIds: [],
    customNodes: {},
    positions: {},
    sizes: {},
    connections: []
  };
}

function getCanvasSummaryImageUrl(summary: SavedSummary): string | undefined {
  const display = deriveVisualSummaryDisplay(summary);
  const value = display.displayUrl || display.candidates[0];
  return value || undefined;
}

function getCanvasAnnotationKindLabel(kind?: CanvasAnnotationKind): string {
  switch (kind) {
    case 'arrow_text':
      return '箭头标注';
    case 'box_text':
      return '框选标注';
    case 'circle_text':
      return '圈选标注';
    case 'draw_mark':
      return '手绘标注';
    case 'text_near_image':
      return '邻近说明';
    case 'note':
    default:
      return '修改标注';
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeFiniteNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  return isFiniteNumber(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function normalizeCanvasPositions(
  value: unknown,
  allowedNodeIds: Set<string>,
  onRecover?: () => void
): CanvasProjectState['positions'] {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, { x?: unknown; y?: unknown }>)
      .map(([id, position]) => {
        if (
          !allowedNodeIds.has(id) ||
          !position ||
          typeof position !== 'object'
        ) {
          onRecover?.();
          return null;
        }
        if (!isFiniteNumber(position.x) || !isFiniteNumber(position.y)) {
          onRecover?.();
          return null;
        }
        return [
          id,
          {
            x: normalizeFiniteNumber(
              position.x,
              0,
              -CANVAS_POSITION_LIMIT,
              CANVAS_POSITION_LIMIT
            ),
            y: normalizeFiniteNumber(
              position.y,
              0,
              -CANVAS_POSITION_LIMIT,
              CANVAS_POSITION_LIMIT
            )
          }
        ] as const;
      })
      .filter((entry): entry is readonly [string, { x: number; y: number }] =>
        Boolean(entry)
      )
  );
}

function normalizeCanvasSizes(
  value: unknown,
  allowedNodeIds: Set<string>,
  onRecover?: () => void
): CanvasProjectState['sizes'] {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(
      value as Record<string, { width?: unknown; height?: unknown }>
    )
      .map(([id, size]) => {
        if (!allowedNodeIds.has(id) || !size || typeof size !== 'object') {
          onRecover?.();
          return null;
        }
        if (!isFiniteNumber(size.width) || !isFiniteNumber(size.height)) {
          onRecover?.();
          return null;
        }
        return [
          id,
          {
            width: normalizeFiniteNumber(
              size.width,
              CANVAS_NODE_MIN_SIZE,
              CANVAS_NODE_MIN_SIZE,
              CANVAS_NODE_MAX_SIZE
            ),
            height: normalizeFiniteNumber(
              size.height,
              CANVAS_NODE_MIN_SIZE,
              CANVAS_NODE_MIN_SIZE,
              CANVAS_NODE_MAX_SIZE
            )
          }
        ] as const;
      })
      .filter(
        (
          entry
        ): entry is readonly [string, { width: number; height: number }] =>
          Boolean(entry)
      )
  );
}

function normalizeCanvasViewport(
  value: unknown,
  onRecover?: () => void
): CanvasProjectState['viewport'] {
  if (!value || typeof value !== 'object') return undefined;
  const viewport = value as { x?: unknown; y?: unknown; k?: unknown };
  if (
    !isFiniteNumber(viewport.x) ||
    !isFiniteNumber(viewport.y) ||
    !isFiniteNumber(viewport.k)
  ) {
    onRecover?.();
    return undefined;
  }
  return {
    x: normalizeFiniteNumber(
      viewport.x,
      0,
      -CANVAS_POSITION_LIMIT,
      CANVAS_POSITION_LIMIT
    ),
    y: normalizeFiniteNumber(
      viewport.y,
      0,
      -CANVAS_POSITION_LIMIT,
      CANVAS_POSITION_LIMIT
    ),
    k: normalizeFiniteNumber(viewport.k, 1, CANVAS_MIN_SCALE, CANVAS_MAX_SCALE)
  };
}

function normalizeCanvasCustomNodes(
  value: unknown,
  onRecover?: () => void
): Record<string, CanvasCustomNode> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, Partial<CanvasCustomNode>>)
      .map(([id, node]): [string, CanvasCustomNode] | null => {
        if (!node || typeof node !== 'object') {
          onRecover?.();
          return null;
        }
        if (node.type !== 'ai_image_holder' && node.type !== 'annotation') {
          onRecover?.();
          return null;
        }
        const isHolder = node.type === 'ai_image_holder';
        return [
          id,
          {
            id,
            type: node.type,
            title: typeof node.title === 'string' ? node.title : '画布节点',
            content:
              typeof node.content === 'string' ? node.content : undefined,
            prompt: typeof node.prompt === 'string' ? node.prompt : undefined,
            targetWidth: isHolder
              ? normalizeFiniteNumber(
                  node.targetWidth,
                  CANVAS_AI_HOLDER_DEFAULT_TARGET_WIDTH,
                  CANVAS_NODE_MIN_SIZE,
                  CANVAS_NODE_MAX_SIZE
                )
              : undefined,
            targetHeight: isHolder
              ? normalizeFiniteNumber(
                  node.targetHeight,
                  CANVAS_AI_HOLDER_DEFAULT_TARGET_HEIGHT,
                  CANVAS_NODE_MIN_SIZE,
                  CANVAS_NODE_MAX_SIZE
                )
              : undefined,
            aspectRatio: isHolder
              ? typeof node.aspectRatio === 'string' && node.aspectRatio.trim()
                ? node.aspectRatio.trim()
                : CANVAS_AI_HOLDER_DEFAULT_ASPECT_RATIO
              : undefined,
            aspectPreset: isHolder
              ? typeof node.aspectPreset === 'string' &&
                node.aspectPreset.trim()
                ? node.aspectPreset.trim()
                : CANVAS_AI_HOLDER_DEFAULT_ASPECT_RATIO
              : undefined,
            aspectLocked: isHolder
              ? typeof node.aspectLocked === 'boolean'
                ? node.aspectLocked
                : true
              : undefined,
            annotationKind:
              node.annotationKind === 'note' ||
              node.annotationKind === 'arrow_text' ||
              node.annotationKind === 'box_text' ||
              node.annotationKind === 'circle_text' ||
              node.annotationKind === 'draw_mark' ||
              node.annotationKind === 'text_near_image'
                ? node.annotationKind
                : undefined,
            targetNodeId:
              typeof node.targetNodeId === 'string'
                ? node.targetNodeId
                : undefined,
            versionOfNodeId:
              typeof node.versionOfNodeId === 'string'
                ? node.versionOfNodeId
                : undefined,
            version:
              typeof node.version === 'number' ? node.version : undefined,
            output:
              node.output && typeof node.output === 'object'
                ? {
                    imageUrl:
                      typeof node.output.imageUrl === 'string'
                        ? node.output.imageUrl
                        : undefined,
                    summaryId:
                      typeof node.output.summaryId === 'string'
                        ? node.output.summaryId
                        : undefined,
                    sourceSummaryId:
                      typeof node.output.sourceSummaryId === 'string'
                        ? node.output.sourceSummaryId
                        : undefined,
                    messageId:
                      typeof node.output.messageId === 'string'
                        ? node.output.messageId
                        : undefined,
                    mimeType:
                      typeof node.output.mimeType === 'string'
                        ? node.output.mimeType
                        : undefined,
                    title:
                      typeof node.output.title === 'string'
                        ? node.output.title
                        : undefined,
                    version:
                      typeof node.output.version === 'number'
                        ? node.output.version
                        : undefined,
                    savedAt:
                      typeof node.output.savedAt === 'number'
                        ? node.output.savedAt
                        : undefined,
                    targetWidth: isFiniteNumber(node.output.targetWidth)
                      ? normalizeFiniteNumber(
                          node.output.targetWidth,
                          CANVAS_AI_HOLDER_DEFAULT_TARGET_WIDTH,
                          CANVAS_NODE_MIN_SIZE,
                          CANVAS_NODE_MAX_SIZE
                        )
                      : undefined,
                    targetHeight: isFiniteNumber(node.output.targetHeight)
                      ? normalizeFiniteNumber(
                          node.output.targetHeight,
                          CANVAS_AI_HOLDER_DEFAULT_TARGET_HEIGHT,
                          CANVAS_NODE_MIN_SIZE,
                          CANVAS_NODE_MAX_SIZE
                        )
                      : undefined,
                    aspectRatio:
                      typeof node.output.aspectRatio === 'string'
                        ? node.output.aspectRatio
                        : undefined
                  }
                : undefined,
            createdAt:
              typeof node.createdAt === 'number' ? node.createdAt : undefined
          } satisfies CanvasCustomNode
        ];
      })
      .filter((entry): entry is [string, CanvasCustomNode] => Boolean(entry))
  );
}

function normalizeCanvasConnections(
  value: unknown,
  allowedNodeIds: Set<string>,
  onRecover?: () => void
): CanvasConnection[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .map((connection): CanvasConnection | null => {
      if (!connection || typeof connection !== 'object') return null;
      const raw = connection as {
        id?: unknown;
        fromNodeId?: unknown;
        toNodeId?: unknown;
        from?: unknown;
        to?: unknown;
      };
      const fromNodeId =
        typeof raw.fromNodeId === 'string'
          ? raw.fromNodeId
          : typeof raw.from === 'string'
            ? raw.from
            : null;
      const toNodeId =
        typeof raw.toNodeId === 'string'
          ? raw.toNodeId
          : typeof raw.to === 'string'
            ? raw.to
            : null;
      if (
        !fromNodeId ||
        !toNodeId ||
        fromNodeId === toNodeId ||
        !allowedNodeIds.has(fromNodeId) ||
        !allowedNodeIds.has(toNodeId)
      ) {
        onRecover?.();
        return null;
      }
      const key = `${fromNodeId}->${toNodeId}`;
      if (seen.has(key)) {
        onRecover?.();
        return null;
      }
      seen.add(key);
      return {
        id:
          typeof raw.id === 'string'
            ? raw.id
            : `${fromNodeId}:${toNodeId}:${seen.size}`,
        fromNodeId,
        toNodeId
      };
    })
    .filter((connection): connection is CanvasConnection =>
      Boolean(connection)
    );
}

export function normalizeCanvasProjectState(
  value: unknown
): Record<string, CanvasProjectState> {
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, Partial<CanvasProjectState>>;
  return Object.fromEntries(
    Object.entries(record).map(([projectId, state]) => {
      let recoveredRecordCount = 0;
      const recover = () => {
        recoveredRecordCount += 1;
      };
      if (!state || typeof state !== 'object') {
        recover();
        return [
          projectId,
          {
            ...createEmptyCanvasProjectState(),
            recoveredRecordCount
          } satisfies CanvasProjectState
        ];
      }
      const nodeIds = Array.isArray(state.nodeIds)
        ? Array.from(
            new Set(
              state.nodeIds.filter((id): id is string => typeof id === 'string')
            )
          )
        : [];
      const customNodes = normalizeCanvasCustomNodes(
        state.customNodes,
        recover
      );
      const allNodeIds = new Set([...nodeIds, ...Object.keys(customNodes)]);
      const activeNodeIds = Array.isArray(state.activeNodeIds)
        ? Array.from(
            new Set(
              state.activeNodeIds.filter(
                (id): id is string =>
                  typeof id === 'string' && allNodeIds.has(id)
              )
            )
          )
        : [...nodeIds, ...Object.keys(customNodes)];
      return [
        projectId,
        {
          nodeIds,
          activeNodeIds,
          customNodes,
          positions: normalizeCanvasPositions(
            state.positions,
            allNodeIds,
            recover
          ),
          sizes: normalizeCanvasSizes(state.sizes, allNodeIds, recover),
          connections: normalizeCanvasConnections(
            state.connections,
            allNodeIds,
            recover
          ),
          selectedNodeId:
            typeof state.selectedNodeId === 'string' &&
            allNodeIds.has(state.selectedNodeId)
              ? state.selectedNodeId
              : undefined,
          viewport: normalizeCanvasViewport(state.viewport, recover),
          updatedAt:
            typeof state.updatedAt === 'number' ? state.updatedAt : undefined,
          recoveredRecordCount:
            recoveredRecordCount > 0 ? recoveredRecordCount : undefined
        } satisfies CanvasProjectState
      ];
    })
  );
}
const SkillsPlaza = lazy(() =>
  import('./components/SkillsPlaza').then((mod) => ({
    default: mod.SkillsPlaza
  }))
);
const PricingPage = lazy(() =>
  import('./components/PricingPage').then((mod) => ({
    default: mod.PricingPage
  }))
);
const SettingsPage = lazy(() =>
  import('./components/SettingsPage').then((mod) => ({
    default: mod.SettingsPage
  }))
);
const TrashPanel = lazy(() =>
  import('./components/TrashPanel').then((mod) => ({
    default: mod.TrashPanel
  }))
);
const BoardsOverview = lazy(() =>
  import('./components/BoardsOverview').then((mod) => ({
    default: mod.BoardsOverview
  }))
);
const GlobalSearchModal = lazy(() =>
  import('./components/GlobalSearchModal').then((mod) => ({
    default: mod.GlobalSearchModal
  }))
);
const InfiniteCanvasBoard = lazy(() =>
  import('./components/InfiniteCanvasBoard').then((mod) => ({
    default: mod.InfiniteCanvasBoard
  }))
);

function WorkspacePanelFallback({
  className = 'flex-1 bg-white dark:bg-slate-900'
}: {
  className?: string;
}) {
  return <div className={className} aria-busy="true" />;
}

// 从 URL 提取参数
// URL 格式设计（参考竞品 youmind.com）：
// - /boards                          → 全部素材（无项目过滤）
// - /boards/{projectId}              → 项目视图
// - /boards/{projectId}?summary-id={summaryId} → 项目内的卡片详情
// - /boards?summary-id={summaryId}   → 全部素材中的卡片详情（兼容旧格式）
function getUrlParams(): {
  projectId: string | null;
  summaryId: string | null;
  isNew: boolean;
} {
  return getUrlParamsFromLocation(
    window.location.pathname,
    window.location.search
  );
}

function getUrlParamsFromLocation(
  pathname: string,
  search: string
): {
  projectId: string | null;
  summaryId: string | null;
  isNew: boolean;
} {
  const searchParams = new URLSearchParams(search);

  // 从路径提取 projectId：/boards/{projectId}
  const match = pathname.match(/\/boards\/([a-zA-Z0-9_-]+)/);
  const projectId = match ? match[1] : null;

  // 从查询参数提取 summaryId：?summary-id=xxx
  let summaryId = searchParams.get('summary-id');

  // 兼容旧的 ?new=true 格式（新保存跳转）
  const isNew = searchParams.get('new') === 'true';

  // 兼容历史链接：/boards/{summaryId}?new=true
  // 新格式已统一为 /boards?summary-id={summaryId}&new=true
  let normalizedProjectId = projectId;
  if (!summaryId && isNew && projectId) {
    const looksLikeUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        projectId
      );
    if (looksLikeUuid) {
      summaryId = projectId;
      normalizedProjectId = null;
    }
  }

  return {
    projectId: normalizedProjectId,
    summaryId,
    isNew
  };
}

export function getEffectiveWorkspaceProjectId(
  routeProjectId: string | null | undefined,
  urlProjectId: string | null | undefined,
  currentProjectId: string | null | undefined
): string | null {
  return routeProjectId || urlProjectId || currentProjectId || null;
}

import {
  getInitialViewMode,
  shouldResetProjectWorkspaceViewMode,
  useWorkspaceUIStore
} from './store/workspaceUIStore';
import { useChatUIStore } from './store/chatUIStore';

// 获取初始项目 ID
function getInitialProjectId(): string | null {
  const params = getUrlParams();
  return params.projectId;
}

function getWorkspaceLocalePrefix(pathname: string): '' | '/zh-CN' | '/en-US' {
  if (pathname.startsWith('/zh-CN')) return '/zh-CN';
  if (pathname.startsWith('/en-US')) return '/en-US';
  return '';
}

function stripWorkspaceLocale(pathname: string): string {
  const localePrefix = getWorkspaceLocalePrefix(pathname);
  return localePrefix ? pathname.slice(localePrefix.length) || '/' : pathname;
}

function isBoardsHomePath(pathname: string): boolean {
  const normalized = stripWorkspaceLocale(pathname);
  return normalized === '/create/boards' || normalized === '/boards';
}

function isStandaloneBoardsPath(pathname: string): boolean {
  const normalized = stripWorkspaceLocale(pathname);
  return normalized === '/boards' || normalized.startsWith('/boards/');
}

function getBoardsBasePath(): string {
  if (typeof window === 'undefined') return '/create/boards';
  const localePrefix = getWorkspaceLocalePrefix(window.location.pathname);
  const normalized = stripWorkspaceLocale(window.location.pathname);
  if (normalized === '/boards' || normalized.startsWith('/boards/')) {
    return '/boards';
  }
  return `${localePrefix}/create/boards`;
}

function getStandaloneBoardsBasePath(): string {
  return '/boards';
}

function getSettingsBasePath(): string {
  if (typeof window === 'undefined') return '/settings';
  const localePrefix = getWorkspaceLocalePrefix(window.location.pathname);
  return `${localePrefix}/settings`;
}

// 生成工作台 URL（新格式）
// - /boards                                    → 全部素材
// - /boards/{projectId}                        → 项目视图
// - /boards?summary-id={summaryId}             → 全部素材中的卡片详情
// - /boards/{projectId}?summary-id={summaryId} → 项目内的卡片详情
function buildBoardsUrl(options: {
  projectId?: string | null;
  summaryId?: string | null;
}): string {
  const { projectId, summaryId } = options;
  let url = getBoardsBasePath();

  if (projectId) {
    url += `/${projectId}`;
  }

  if (summaryId) {
    url += `?summary-id=${summaryId}`;
  }

  return url;
}

function buildStandaloneBoardsUrl(options: {
  projectId?: string | null;
  summaryId?: string | null;
}): string {
  const { projectId, summaryId } = options;
  let url = getStandaloneBoardsBasePath();

  if (projectId) {
    url += `/${projectId}`;
  }

  if (summaryId) {
    url += `?summary-id=${summaryId}`;
  }

  return url;
}

function buildBoardsViewUrl(view: 'boards' | 'skills' | 'trash'): string {
  const basePath = getBoardsBasePath();
  if (view === 'boards') return basePath;
  return `${basePath}?view=${view}`;
}

interface AppProps {
  /** Web 环境下，认证是否已就绪（用于等待 token 加载后再发起 API 请求） */
  isAuthReady?: boolean;
  /** 嵌入创意工作台时，外层已经提供统一导航。 */
  embeddedInCreate?: boolean;
  /** React Router 解析出的 /boards/:id，避免首次进入项目页时依赖旧的全局状态。 */
  routeProjectId?: string | null;
}

const SHOW_PROJECT_WORKBENCH = true;
const ENABLE_INFINITE_CANVAS_WORKBENCH = true;
type MobileProjectPanel = 'canvas' | 'sources' | 'ask';

import {
  LEFT_PANEL_MIN_WIDTH,
  STUDIO_PANEL_MIN_WIDTH,
  STUDIO_PANEL_MAX_WIDTH,
  CENTER_PANEL_MIN_WIDTH_TWO_COLUMNS,
  CENTER_PANEL_MIN_WIDTH_THREE_COLUMNS,
  LEFT_PANEL_MAX_RATIO,
  LEFT_PANEL_MAX_RATIO_TWO_COLUMNS,
  STUDIO_PANEL_MAX_RATIO,
  XL_BREAKPOINT,
  SINGLE_RESIZER_WIDTH,
  DOUBLE_RESIZER_WIDTH,
  clampGridWidth,
  getDefaultTripleColumnWidths,
  snapWidthToGrid,
  useColumnLayout
} from './hooks/useColumnLayout';

function App({
  isAuthReady = true,
  embeddedInCreate = false,
  routeProjectId = null
}: AppProps) {
  const [createMiniNavProjectSlot, setCreateMiniNavProjectSlot] =
    useState<HTMLElement | null>(null);
  const {
    sidebarWidth,
    setSidebarWidth,
    studioWidth,
    setStudioWidth,
    hasManualColumnResize,
    setHasManualColumnResize,
    manualLeftRatioRef,
    manualStudioRatioRef,
    isDragging,
    setIsDragging,
    dragTarget,
    setDragTarget,
    saveLayoutState
  } = useColumnLayout();

  const { t } = useTranslation(['workspace', 'boards']);
  const setChatInput = useChatUIStore((state) => state.setInput);
  const setChatImageMode = useChatUIStore((state) => state.setImageMode);
  const setChatImageSettings = useChatUIStore(
    (state) => state.setImageSettings
  );
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, credits, subscription, signOut } =
    useWorkspaceUser(isAuthReady);

  useEffect(() => {
    if (!embeddedInCreate) {
      setCreateMiniNavProjectSlot(null);
      return;
    }

    setCreateMiniNavProjectSlot(
      document.getElementById('create-mininav-workspace-slot')
    );

    return () => setCreateMiniNavProjectSlot(null);
  }, [embeddedInCreate, location.pathname]);

  const {
    projects,
    projectsLoading,
    currentProjectId,
    setCurrentProjectId,
    loadProjects,
    handleCreateProject,
    handleDeleteProject,
    handleFavoriteProject,
    handleArchiveProject,
    handleUpdateProject
  } = useWorkspaceProjects(routeProjectId || getInitialProjectId());

  const {
    summaries,
    setSummaries,
    selectedSummary,
    setSelectedSummary,
    loading,
    isDetailLoading,
    setIsDetailLoading,
    hasMoreSummaries,
    setHasMoreSummaries,
    loadingMore,
    hasInitialLoadRef,
    loadSummaries,
    loadMoreSummaries
  } = useWorkspaceSummaries();
  const {
    catalog: skillCatalog,
    marketSkills: catalogMarketSkills,
    refresh: refreshSkills
  } = useSkills({
    enabled: true
  });
  const {
    viewMode,
    setViewMode,
    skillsPlazaTab,
    setSkillsPlazaTab,
    showAddMenu,
    setShowAddMenu,
    showAddSourceModal,
    setShowAddSourceModal,
    showSearch,
    setShowSearch,
    searchTerm,
    setSearchTerm,
    showPricing,
    setShowPricing,
    showSettings,
    setShowSettings,
    showSidebarSearch,
    setShowSidebarSearch,
    workspaceToast,
    setWorkspaceToast,
    summaryDisplayMode,
    setSummaryDisplayMode,
    showTypeFilter,
    setShowTypeFilter,
    selectedTypes,
    setSelectedTypes,
    pricingReturnTo,
    setPricingReturnTo
  } = useWorkspaceUIStore();
  const [pendingProjectSkill, setPendingProjectSkill] = useState<Skill | null>(
    null
  );
  // projectSourceSearch removed — now handled by AddSourceModal
  const [references, setReferences] = useState<Reference[]>([]);
  const [selectionRef, setSelectionRef] = useState<Reference | null>(null); // 临时选中引用
  const containerRef = useRef<HTMLDivElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { shortcuts, loadShortcuts } = useWorkspaceShortcuts();
  // states migrated to workspaceUIStore
  // summaryDisplayMode migrated to workspaceUIStore
  const [selectedSummaryIds, setSelectedSummaryIds] = useState<string[]>([]);
  const [mobileProjectPanel, setMobileProjectPanel] =
    useState<MobileProjectPanel>('canvas');
  const [isSourcePanelCollapsed, setIsSourcePanelCollapsed] = useState(false);
  const [isAgentPanelCollapsed, setIsAgentPanelCollapsed] = useState(false);
  const [canvasStateByProject, setCanvasStateByProject] = useState<
    Record<string, CanvasProjectState>
  >(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(PROJECT_CANVAS_STATE_STORAGE_KEY);
      if (raw) return normalizeCanvasProjectState(JSON.parse(raw));

      const legacyRaw = window.localStorage.getItem(
        PROJECT_CANVAS_NODE_IDS_STORAGE_KEY
      );
      if (!legacyRaw) return {};
      const legacy = JSON.parse(legacyRaw);
      if (!legacy || typeof legacy !== 'object') return {};
      return normalizeCanvasProjectState(
        Object.fromEntries(
          Object.entries(legacy as Record<string, unknown>).map(
            ([projectId, ids]) => {
              const nodeIds = Array.isArray(ids)
                ? ids.filter((id): id is string => typeof id === 'string')
                : [];
              return [
                projectId,
                {
                  ...createEmptyCanvasProjectState(),
                  nodeIds,
                  activeNodeIds: nodeIds
                }
              ];
            }
          )
        )
      );
    } catch {
      return {};
    }
  });
  // pricingReturnTo migrated to workspaceUIStore
  const urlParams = useMemo(
    () => getUrlParamsFromLocation(location.pathname, location.search),
    [location.pathname, location.search]
  );
  const routeSyncedProjectId = routeProjectId || urlParams.projectId;
  const effectiveProjectId = getEffectiveWorkspaceProjectId(
    routeProjectId,
    urlParams.projectId,
    currentProjectId
  );
  const isProjectRoutePending = Boolean(
    routeSyncedProjectId && !effectiveProjectId
  );
  const hasInitialDataLoadRef = useRef(false); // 使用 ref 实现同步防重复检查
  const autoOpenedSummaryIdRef = useRef<string | null>(null);
  // hasInitialLoadRef migrated to useWorkspaceSummaries
  const pendingRefreshCheckedRef = useRef(false); // 防止重复检查待刷新标记
  const pendingRefreshResolvedRef = useRef(false); // 标记扩展待刷新请求是否已返回
  const loadSummariesRef = useRef(
    async (_forceRefresh = false, _projectId: string | null = null) => {}
  );
  const [pendingRefreshData, setPendingRefreshData] = useState<
    { summaryId: string; projectId?: string } | null | undefined
  >(undefined); // undefined = 未检查, null = 无待刷新
  const [workspaceContainerWidth, setWorkspaceContainerWidth] = useState(0);

  useEffect(() => {
    if (!workspaceToast) return;
    const timer = setTimeout(() => setWorkspaceToast(null), 3000);
    return () => clearTimeout(timer);
  }, [setWorkspaceToast, workspaceToast]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      PROJECT_CANVAS_STATE_STORAGE_KEY,
      JSON.stringify(canvasStateByProject)
    );
  }, [canvasStateByProject]);

  // 兼容旧入口：过去通过 /create/boards state 打开设置面板，现在统一跳到独立设置页。
  useEffect(() => {
    const state = location.state as { openSettings?: boolean } | null;
    if (state?.openSettings) {
      navigate(getSettingsBasePath(), { replace: true });
      // 消费后清理 state，避免回退或刷新时重复打开
      window.history.replaceState({}, '');
    }
  }, [location.state, navigate]);

  useEffect(() => {
    if (!isBoardsHomePath(location.pathname)) return;

    const searchParams = new URLSearchParams(location.search);
    if (searchParams.has('summary-id')) return;

    const nextViewMode = getInitialViewMode();
    if (currentProjectId !== null) {
      setCurrentProjectId(null);
      loadSummariesRef.current(false, null);
    }
    if (selectedSummary) {
      setSelectedSummary(null);
    }
    if (viewMode !== nextViewMode) {
      setViewMode(nextViewMode);
    }
  }, [
    currentProjectId,
    location.pathname,
    location.search,
    selectedSummary,
    setCurrentProjectId,
    setSelectedSummary,
    setViewMode,
    viewMode
  ]);

  useEffect(() => {
    if (!routeSyncedProjectId) return;
    const shouldPreserveSummaryDetail = Boolean(urlParams.summaryId);

    if (currentProjectId !== routeSyncedProjectId) {
      setCurrentProjectId(routeSyncedProjectId);
      if (!shouldPreserveSummaryDetail) {
        setSelectedSummary(null);
      }
      loadSummariesRef.current(true, routeSyncedProjectId);
    }

    if (
      viewMode === 'boards' ||
      viewMode === 'skills' ||
      viewMode === 'trash'
    ) {
      setViewMode('list');
    }

    setMobileProjectPanel('canvas');
  }, [
    currentProjectId,
    setCurrentProjectId,
    setSelectedSummary,
    setViewMode,
    routeSyncedProjectId,
    urlParams.summaryId,
    viewMode
  ]);

  useEffect(() => {
    if (!effectiveProjectId || !isStandaloneBoardsPath(location.pathname)) {
      return;
    }

    if (
      shouldResetProjectWorkspaceViewMode({
        hasProjectId: Boolean(effectiveProjectId),
        isStandaloneBoardsPath: isStandaloneBoardsPath(location.pathname),
        hasSelectedSummary: Boolean(selectedSummary),
        viewMode
      })
    ) {
      setViewMode('list');
    }
  }, [
    effectiveProjectId,
    location.pathname,
    selectedSummary,
    setViewMode,
    viewMode
  ]);

  useEffect(() => {
    try {
      localStorage.setItem(
        'workspace:summary-display-mode',
        summaryDisplayMode
      );
    } catch {
      // ignore storage errors
    }
  }, [summaryDisplayMode]);

  // 类型筛选状态 migrated to workspaceUIStore
  const typeFilterRef = useRef<HTMLDivElement>(null);

  // 卡片类型定义
  const CARD_TYPES = [
    { id: 'article', label: t('types.article'), icon: '📄' },
    { id: 'video', label: t('types.video'), icon: '🎬' },
    { id: 'audio', label: t('types.audio'), icon: '🎵' },
    { id: 'image', label: t('types.image'), icon: '🖼️' },
    { id: 'pdf', label: t('types.pdf'), icon: '📑' },
    { id: 'office', label: t('types.office'), icon: '📊' },
    { id: 'text', label: t('types.text'), icon: '📝' },
    { id: 'note', label: t('types.note'), icon: '✏️' },
    { id: 'other', label: t('types.other'), icon: '📦' }
  ];

  // 用户菜单交互状态
  const [showUserPopover, setShowUserPopover] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactQrLoadFailed, setContactQrLoadFailed] = useState(false);
  const userPopoverRef = useRef<HTMLDivElement>(null);
  const CONTACT_WECHAT_QR_URL = `${import.meta.env.BASE_URL}contact/wechat-qr.jpg`;

  useEffect(() => {
    if (!showContactModal) {
      return;
    }

    const handleEscClose = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowContactModal(false);
      }
    };

    window.addEventListener('keydown', handleEscClose);
    return () => window.removeEventListener('keydown', handleEscClose);
  }, [showContactModal]);

  // 点击外部关闭用户浮窗
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        userPopoverRef.current &&
        !userPopoverRef.current.contains(event.target as Node)
      ) {
        setShowUserPopover(false);
      }
    };

    if (showUserPopover) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showUserPopover]);

  // 加载所有保存的总结
  // 注意：必须等待 isAuthReady，确保 token 已设置后再发起 API 请求
  // 否则可能读取到错误的数据（如旧用户的缓存或空数据）
  //
  // 重要：不依赖 currentProjectId，避免进入详情页时触发重新加载
  // 详情页的项目切换不应该影响列表数据，列表数据的刷新由 handleBackToList 控制

  // 步骤1：当 auth 就绪时，请求检查待刷新标记
  useEffect(() => {
    if (!isAuthReady) {
      log.info(
        '[Workspace] Waiting for auth before checking pending refresh...'
      );
      return;
    }
    if (pendingRefreshCheckedRef.current) {
      return;
    }
    pendingRefreshCheckedRef.current = true;

    // 先尝试从 localStorage 读取（兼容旧版本）
    const localPending = consumePendingRefresh();
    if (localPending) {
      log.info(
        '[Workspace] Found pending refresh in localStorage:',
        localPending.summaryId
      );
      setPendingRefreshData(localPending);
      return;
    }

    // 通过 postMessage 请求 content script 从 chrome.storage.local 获取
    // 使用短轮询重试，覆盖 content script 晚于工作台监听器就绪的时序场景
    log.info('[Workspace] Requesting pending refresh from extension...');
    pendingRefreshResolvedRef.current = false;

    let attempts = 0;
    const maxAttempts = 6;
    const requestPendingRefresh = () => {
      if (pendingRefreshResolvedRef.current) return;
      attempts += 1;
      window.postMessage({ type: 'GET_PENDING_REFRESH' }, '*');
      if (attempts >= maxAttempts) {
        window.clearInterval(retryTimerId);
      }
    };

    requestPendingRefresh();
    const retryTimerId = window.setInterval(requestPendingRefresh, 250);

    // 最终兜底超时：如果仍无响应，继续正常加载流程
    const timeoutId = window.setTimeout(() => {
      if (!pendingRefreshResolvedRef.current) {
        log.info(
          '[Workspace] Pending refresh check timeout, proceeding without refresh'
        );
        pendingRefreshResolvedRef.current = true;
        setPendingRefreshData(null);
      }
    }, 1800);

    return () => {
      window.clearInterval(retryTimerId);
      window.clearTimeout(timeoutId);
    };
  }, [isAuthReady, pendingRefreshData]);

  // 监听来自 content script 的待刷新响应
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GET_PENDING_REFRESH_RESPONSE') {
        pendingRefreshResolvedRef.current = true;
        log.info(
          '[Workspace] Received pending refresh response:',
          event.data.data
        );

        // 检查是否是 pending summary（书签保存后的通知）
        if (event.data.data?.type === 'SUMMARY_SAVED' && event.data.data?.id) {
          const { id, title, url, markdown, projectId } = event.data.data;
          log.info('[Workspace] Processing pending summary from storage:', id);

          // 检查是否属于当前项目
          if (projectId && currentProjectId && projectId !== currentProjectId) {
            log.info('[Workspace] Skipping summary for different project');
            setPendingRefreshData(null);
            return;
          }

          // 添加骨架卡片
          const skeletonSummary: SavedSummary = {
            id,
            title: title || '加载中...',
            url: url || '',
            markdown: markdown || '',
            createdAt: Date.now(),
            projectId: projectId || undefined,
            isSaving: true
          };

          setSummaries((prev) => {
            // 避免重复添加
            if (prev.some((s) => s.id === id)) {
              return prev;
            }
            log.info('[Workspace] Adding summary card from storage:', id);
            return [skeletonSummary, ...prev];
          });

          // 从服务器获取完整数据
          getSummaryById(id).then((summary) => {
            if (summary) {
              setSummaries((prev) =>
                prev.map((s) =>
                  s.id === id ? { ...summary, isSaving: false } : s
                )
              );
              // 将新卡片添加到缓存，确保刷新后仍然可见
              addSummaryToCache(summary);
              log.info('[Workspace] New summary added to cache:', id);
            } else {
              // 如果获取失败，移除骨架卡片
              setSummaries((prev) => prev.filter((s) => s.id !== id));
            }
          });

          setPendingRefreshData(null);
          return;
        }

        // 检查是否是 pending skeleton（新方案：显示骨架卡片）
        if (event.data.data?.tempId) {
          const { tempId, title, url, projectId, type } = event.data.data;
          log.info(
            '[Workspace] Processing pending skeleton:',
            tempId,
            'type:',
            type
          );

          // 检查是否属于当前项目
          if (projectId && currentProjectId && projectId !== currentProjectId) {
            log.info('[Workspace] Skipping skeleton for different project');
            setPendingRefreshData(null);
            return;
          }

          // 添加骨架卡片
          const skeletonSummary: SavedSummary = {
            id: tempId,
            title: title || '保存中...',
            url: url || '',
            markdown: '',
            createdAt: Date.now(),
            projectId: projectId || undefined,
            isSaving: true
          };

          setSummaries((prev) => {
            // 避免重复添加
            if (prev.some((s) => s.id === tempId)) {
              return prev;
            }
            log.info('[Workspace] Adding skeleton card from storage:', tempId);
            return [skeletonSummary, ...prev];
          });

          // 如果数据已经加载完成（超时后到达的响应），强制刷新以获取完整数据
          // 这解决了时序问题：content script 初始化比工作台超时更慢
          if (hasInitialLoadRef.current) {
            log.info(
              '[Workspace] Late pending skeleton received, forcing data refresh'
            );
            // 延迟刷新，确保骨架卡片先显示
            setTimeout(() => {
              loadSummariesRef.current(true, null);
            }, 100);
          }

          // 标记为已处理
          setPendingRefreshData(null);
          return;
        }

        // 否则是 pending refresh（旧方案：刷新数据）
        setPendingRefreshData(event.data.data || null);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [currentProjectId, hasInitialLoadRef, setSummaries]);

  // 步骤2：当待刷新检查完成后，加载数据
  useEffect(() => {
    if (!isAuthReady) {
      return;
    }
    // 等待待刷新检查完成
    if (pendingRefreshData === undefined) {
      log.info('[Workspace] Waiting for pending refresh check...');
      return;
    }
    // 防止重复初始化加载
    if (hasInitialDataLoadRef.current) {
      log.info('[Workspace] Initial load already done, skipping...');
      return;
    }
    hasInitialDataLoadRef.current = true;

    const shouldForceRefresh = !!pendingRefreshData;

    if (pendingRefreshData) {
      log.info(
        '[Workspace] Found pending refresh, forcing data reload:',
        pendingRefreshData.summaryId
      );
    } else {
      log.info('[Workspace] Auth ready, loading data...');
    }

    // 初始加载策略：
    // 1. 如果当前在项目视图（URL 中有 projectId），优先加载该项目数据
    // 2. 同时后台加载全局数据（用于切换到"全部"视图时快速显示）
    if (effectiveProjectId) {
      // 优先加载当前项目数据
      log.info(
        '[Workspace] Initial load: loading project data first:',
        effectiveProjectId
      );
      loadSummariesRef.current(shouldForceRefresh, effectiveProjectId);
      // 后台静默加载全局数据
      setTimeout(() => {
        loadSummariesRef.current(false, null);
      }, 100);
    } else {
      // 全局视图，只加载全局数据
      loadSummariesRef.current(shouldForceRefresh, null);
    }

    loadProjects();
    loadShortcuts();
  }, [
    effectiveProjectId,
    isAuthReady,
    loadProjects,
    loadShortcuts,
    pendingRefreshData
  ]);

  // 跟踪正在加载中的项目 ID（防止重复请求）
  const loadingProjectsRef = useRef<Set<string>>(new Set());
  // 使用 ref 跟踪最新的 summaries，避免 useEffect 依赖导致循环
  const summariesRef = useRef(summaries);
  summariesRef.current = summaries;
  // 跟踪上一次的 projectId，用于检测项目切换
  const prevProjectIdRef = useRef<string | null>(null);

  // 当项目切换时，检查是否需要加载该项目的数据
  // 采用"按需加载"策略：切换到项目时，如果该项目数据不在内存中，则从缓存或服务器加载
  //
  // 缓存策略说明：
  // - 全局视图（currentProjectId = null）：从全局缓存加载最近 100 条
  // - 项目视图（currentProjectId = xxx）：从项目缓存加载该项目的 20 条
  // - 项目数据合并到内存状态中，不会覆盖其他项目的数据
  // - 每次切换到项目时，检查内存中是否有该项目数据，没有则加载
  useEffect(() => {
    // 检测项目切换，重置分页状态
    if (prevProjectIdRef.current !== effectiveProjectId) {
      prevProjectIdRef.current = effectiveProjectId;
      // 项目切换时，重置 hasMoreSummaries
      // 新项目的 hasMore 状态会在 loadSummaries 中设置
      setHasMoreSummaries(false);
    }

    if (!isAuthReady || !effectiveProjectId) return;

    // 如果正在加载这个项目，跳过
    if (loadingProjectsRef.current.has(effectiveProjectId)) {
      return;
    }

    // 查找当前项目的信息。summaryCount 只是展示计数，不能作为是否加载的硬门槛；
    // 项目列表数据可能先于最新素材/会话状态返回，依赖它会导致首进详情空白。
    const currentProject = projects.find((p) => p.id === effectiveProjectId);
    if (!currentProject && !projectsLoading) {
      return;
    }

    // 使用 ref 检查最新的 summaries 状态，避免闭包问题
    const currentSummaries = summariesRef.current;
    const projectSummaries = currentSummaries.filter(
      (s) => s.projectId === effectiveProjectId
    );

    if (projectSummaries.length > 0) {
      // 内存中已有数据，检查是否还有更多
      // 如果当前数据量小于项目总数，说明还有更多
      if (
        typeof currentProject?.summaryCount === 'number' &&
        currentProject.summaryCount > projectSummaries.length
      ) {
        setHasMoreSummaries(true);
      }
      return;
    }

    // 项目内存中没有数据时直接触发按项目加载，避免依赖可能过期的 summaryCount。
    // 使用 forceRefresh=false，优先从项目缓存读取
    log.info(
      '[Workspace] Project has content but not in memory, loading project summaries:',
      effectiveProjectId
    );
    loadingProjectsRef.current.add(effectiveProjectId);
    loadSummariesRef.current(false, effectiveProjectId).finally(() => {
      loadingProjectsRef.current.delete(effectiveProjectId);
    });
  }, [
    effectiveProjectId,
    isAuthReady,
    projects,
    projectsLoading,
    setHasMoreSummaries
  ]); // 不依赖 summaries，通过 ref 访问最新值

  // 唯一的 summary-id 路由入口。
  // 负责 /boards/:projectId?summary-id=... 和历史 new=true 跳转，避免多个 effect 抢写详情态。
  useEffect(() => {
    if (!urlParams.summaryId) {
      autoOpenedSummaryIdRef.current = null;
      return;
    }

    const targetSummaryId = urlParams.summaryId;
    if (autoOpenedSummaryIdRef.current === targetSummaryId) return;

    let cancelled = false;

    const openSummaryDetail = (summary: SavedSummary) => {
      if (cancelled) return;
      const summaryProjectId = summary.projectId || null;
      if (summaryProjectId && summaryProjectId !== effectiveProjectId) {
        setCurrentProjectId(summaryProjectId);
      }
      previousProjectIdRef.current = summaryProjectId;
      setSelectedSummary(summary);
      setViewMode('detail');
    };

    const fetchWithRetry = async (
      id: string,
      maxRetries = 5,
      delay = 1000
    ): Promise<SavedSummary | null> => {
      for (let i = 0; i < maxRetries; i += 1) {
        log.info(
          `[Workspace] Fetching summary(attempt ${i + 1}/${maxRetries}): `,
          id
        );
        const summary = await getSummaryById(id);
        if (summary) return summary;
        if (i < maxRetries - 1) {
          log.info(`[Workspace] Summary not ready, retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
      return null;
    };

    if (urlParams.isNew) {
      if (!isAuthReady) {
        log.info('[Workspace] Waiting for auth before fetching new summary...');
        return;
      }

      autoOpenedSummaryIdRef.current = targetSummaryId;
      log.info(
        '[Workspace] New summary detected, auth ready, fetching:',
        targetSummaryId
      );

      const skeletonSummary: SavedSummary = {
        id: targetSummaryId,
        title: t('app.loading'),
        url: '',
        markdown: '',
        createdAt: Date.now(),
        isSaving: true
      };
      setSummaries((prev) => [
        skeletonSummary,
        ...prev.filter((s) => s.id !== targetSummaryId)
      ]);

      navigate(buildBoardsUrl({ summaryId: targetSummaryId }), {
        replace: true
      });

      fetchWithRetry(targetSummaryId)
        .then((summary) => {
          if (cancelled) return;
          if (summary) {
            log.info(
              '[Workspace] Summary loaded:',
              summary.id,
              'projectId:',
              summary.projectId
            );
            setSummaries((prev) =>
              prev.map((s) =>
                s.id === targetSummaryId ? { ...summary, isSaving: false } : s
              )
            );
            addSummaryToCache(summary);
            openSummaryDetail(summary);
          } else {
            log.info(
              '[Workspace] Summary not found after retries:',
              targetSummaryId
            );
            setSummaries((prev) =>
              prev.filter((s) => s.id !== targetSummaryId)
            );
            autoOpenedSummaryIdRef.current = null;
          }
        })
        .catch((error) => {
          if (cancelled) return;
          log.error('[Workspace] Failed to load summary:', error);
          setSummaries((prev) => prev.filter((s) => s.id !== targetSummaryId));
          autoOpenedSummaryIdRef.current = null;
        });

      return () => {
        cancelled = true;
      };
    }

    const matchedSummary = summaries.find((s) => s.id === targetSummaryId);
    if (matchedSummary) {
      autoOpenedSummaryIdRef.current = targetSummaryId;
      log.info(
        '[Workspace] Auto-opening summary from URL:',
        targetSummaryId,
        'projectId:',
        matchedSummary.projectId
      );
      openSummaryDetail(matchedSummary);
      return () => {
        cancelled = true;
      };
    }

    if (loading) return;

    if (!isAuthReady) {
      log.info('[Workspace] Waiting for auth before fetching summary from API');
      return;
    }

    autoOpenedSummaryIdRef.current = targetSummaryId;
    log.info(
      '[Workspace] Summary not in list, fetching from API:',
      targetSummaryId
    );
    getSummaryById(targetSummaryId)
      .then((summary) => {
        if (cancelled) return;
        if (summary) {
          log.info(
            '[Workspace] Summary fetched from API:',
            summary.id,
            'projectId:',
            summary.projectId
          );
          setSummaries((prev) => [
            summary,
            ...prev.filter((s) => s.id !== summary.id)
          ]);
          addSummaryToCache(summary);
          openSummaryDetail(summary);
        } else {
          log.info('[Workspace] Summary not found in API:', targetSummaryId);
          autoOpenedSummaryIdRef.current = null;
        }
      })
      .catch((error) => {
        if (cancelled) return;
        log.error('[Workspace] Failed to fetch summary:', error);
        autoOpenedSummaryIdRef.current = null;
      });

    return () => {
      cancelled = true;
    };
  }, [
    effectiveProjectId,
    isAuthReady,
    loading,
    navigate,
    setCurrentProjectId,
    setSelectedSummary,
    setSummaries,
    setViewMode,
    summaries,
    t,
    urlParams.isNew,
    urlParams.summaryId
  ]);

  // 监听页面可见性变化，当页面从隐藏变为可见时刷新数据
  // 这样插件保存后，切换到 Web 工作台时会自动刷新
  // 注意：使用非强制刷新，避免卡片重排
  const lastVisibilityRefreshRef = useRef<number>(0);
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        // 节流：5 分钟内只允许自动刷新一次 (300000ms)
        const AUTO_REFRESH_THROTTLE = 300000;

        if (now - lastVisibilityRefreshRef.current < AUTO_REFRESH_THROTTLE) {
          log.info(
            '[Workspace] Skipping auto-refresh, throttled (last refresh was < 5 mins ago)'
          );
          return;
        }

        lastVisibilityRefreshRef.current = now;
        log.info(
          '[Workspace] Page became visible, refreshing data silently...'
        );
        // 使用非强制刷新，先显示缓存，后台静默更新。
        // 项目详情页必须刷新当前项目，避免首次进入后被全局数据加载覆盖。
        loadSummariesRef.current(false, getInitialProjectId());
        loadShortcuts(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadShortcuts]);

  // 监听浏览器 URL 变化 (前进/后退)
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const state = event.state;
      if (state) {
        if (state.view) setViewMode(state.view);
        if (state.projectId !== undefined) setCurrentProjectId(state.projectId);
      } else {
        // 后退到最初状态，重新根据 URL 探测
        setViewMode(getInitialViewMode());
        setCurrentProjectId(getInitialProjectId());
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [currentProjectId, setCurrentProjectId, setViewMode]);

  // 监听来自插件的消息（SAVING_STARTED, SAVING_FAILED, SUMMARY_SAVED）
  // 消息通过 content script 的 postMessage 转发到 Web 页面
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // 只处理来自同源或允许的源的消息
      if (
        !isAllowedWebOrigin(event.origin) &&
        event.origin !== window.location.origin
      ) {
        return;
      }

      // 处理保存开始通知 - 立即显示骨架卡片
      if (event.data?.type === 'SAVING_STARTED' && event.data?.data) {
        const { tempId, title, url, projectId, type } = event.data.data;
        log.info('[Workspace] Received SAVING_STARTED:', tempId, 'type:', type);

        // 检查是否属于当前项目
        if (projectId && currentProjectId && projectId !== currentProjectId) {
          log.info('[Workspace] Skipping skeleton for different project');
          return;
        }

        // 立即添加骨架卡片
        const skeletonSummary: SavedSummary = {
          id: tempId,
          title: title || '保存中...',
          url: url || '',
          markdown: '', // 骨架卡片不需要内容
          createdAt: Date.now(),
          projectId: projectId || undefined,
          isSaving: true
        };

        setSummaries((prev: SavedSummary[]) => {
          // 避免重复添加
          if (prev.some((s) => s.id === tempId)) {
            return prev;
          }
          log.info('[Workspace] Adding skeleton card for:', tempId);
          return [skeletonSummary, ...prev];
        });
        return;
      }

      // 处理保存失败通知 - 移除骨架卡片
      if (event.data?.type === 'SAVING_FAILED' && event.data?.data) {
        const { tempId } = event.data.data;
        log.info('[Workspace] Received SAVING_FAILED:', tempId);

        setSummaries((prev) => prev.filter((s) => s.id !== tempId));
        return;
      }

      if (event.data?.type === 'SUMMARY_SAVED' && event.data?.data) {
        const messageData = event.data.data;
        log.info(
          '[Workspace] Received SUMMARY_SAVED from extension:',
          messageData.id,
          'tempId:',
          messageData.tempId
        );

        // 如果有 tempId，替换骨架卡片；否则添加新卡片
        const tempId = messageData.tempId;

        // 1. 立即添加或替换骨架卡片（乐观更新）
        const skeletonSummary: SavedSummary = {
          id: messageData.id,
          title: messageData.title || '加载中...',
          url: messageData.url || '',
          markdown: messageData.markdown || '',
          createdAt: messageData.createdAt || Date.now(),
          projectId: messageData.projectId, // 包含 projectId 以确保正确分类
          contentType: messageData.contentType, // 传递内容类型以便正确显示卡片样式
          isSaving: true // 标记为保存中，显示骨架
        };

        setSummaries((prev) => {
          // 如果有 tempId，先移除对应的骨架卡片
          let filtered = prev;
          if (tempId) {
            filtered = prev.filter((s) => s.id !== tempId);
          }

          // 避免重复添加
          if (filtered.some((s) => s.id === messageData.id)) {
            log.info('[Workspace] Summary already exists, skipping skeleton');
            return filtered;
          }
          log.info(
            '[Workspace] Adding skeleton card for:',
            messageData.id,
            tempId ? `(replacing ${tempId})` : ''
          );
          return [skeletonSummary, ...filtered];
        });

        // 2. 记录骨架卡片添加时间，确保至少显示一段时间
        const skeletonAddedAt = Date.now();
        const MIN_SKELETON_DISPLAY_TIME = 800; // 骨架卡片最少显示 800ms

        // 3. 延迟后从服务器获取完整数据并替换骨架
        const fetchWithRetry = async (
          id: string,
          maxRetries = 5,
          delay = 800
        ): Promise<SavedSummary | null> => {
          for (let i = 0; i < maxRetries; i++) {
            log.info(
              `[Workspace] Fetching new summary(attempt ${i + 1}/${maxRetries}): `,
              id
            );
            const summary = await getSummaryById(id);
            if (summary) {
              return summary;
            }
            if (i < maxRetries - 1) {
              await new Promise((resolve) => setTimeout(resolve, delay));
            }
          }
          return null;
        };

        fetchWithRetry(messageData.id)
          .then(async (summary) => {
            // 确保骨架卡片至少显示一段时间
            const elapsed = Date.now() - skeletonAddedAt;
            if (elapsed < MIN_SKELETON_DISPLAY_TIME) {
              await new Promise((resolve) =>
                setTimeout(resolve, MIN_SKELETON_DISPLAY_TIME - elapsed)
              );
            }
            if (summary) {
              log.info(
                '[Workspace] Skeleton replaced with real card:',
                summary.id,
                'contentType:',
                summary.contentType
              );
              setSummaries((prev) =>
                prev.map((s) =>
                  s.id === summary.id ? { ...summary, isSaving: false } : s
                )
              );
              addSummaryToCache(summary);
            } else {
              log.info(
                '[Workspace] Failed to fetch summary, keeping skeleton data'
              );
              // 使用消息中的数据作为降级
              setSummaries((prev) =>
                prev.map((s) =>
                  s.id === messageData.id ? { ...s, isSaving: false } : s
                )
              );
            }
          })
          .catch((error) => {
            log.error('[Workspace] Failed to fetch new summary:', error);
            // 使用消息中的数据作为降级
            setSummaries((prev) =>
              prev.map((s) =>
                s.id === messageData.id ? { ...s, isSaving: false } : s
              )
            );
          });
      }
    };

    window.addEventListener('message', handleMessage);
    log.info('[Workspace] PostMessage listener registered for SUMMARY_SAVED');

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [currentProjectId, setSummaries]);

  // loadSummaries and loadMoreSummaries extracted to useWorkspaceSummaries Hook

  const handleInstallMarketSkill = useCallback(
    async (skill: {
      marketSkillId: string;
      name: string;
      prompt: string;
      description?: string;
      category?: string;
    }) => {
      await createSkill({
        name: skill.name,
        displayName: skill.name,
        description: skill.description,
        triggers: [],
        coreInstructions: skill.prompt,
        category: skill.category || 'template',
        metadata: {
          originType: 'market-installed',
          marketSkillId: skill.marketSkillId,
          marketSkillName: skill.name
        }
      });
      await refreshSkills();
      setWorkspaceToast({
        type: 'success',
        message: `已加入作品模板：${skill.name} `
      });
    },
    [refreshSkills, setWorkspaceToast]
  );

  const handleCreateSkillFromPlaza = useCallback(
    async (skill: {
      name: string;
      prompt: string;
      description?: string;
      referenceIds?: string[];
    }) => {
      const created = await createSkill({
        name: skill.name,
        displayName: skill.name,
        description: skill.description,
        triggers: [],
        coreInstructions: skill.prompt,
        category: 'custom',
        ...(skill.referenceIds && skill.referenceIds.length > 0
          ? { defaultOptions: { referenceIds: skill.referenceIds } }
          : {})
      });
      await refreshSkills();
      setSkillsPlazaTab('mine');
      setWorkspaceToast({
        type: 'success',
        message: `已创建技能：${skill.name} `
      });
      return created;
    },
    [refreshSkills, setSkillsPlazaTab, setWorkspaceToast]
  );

  const handleUpdateSkillFromPlaza = useCallback(
    async (
      skillId: string,
      updates: { name?: string; prompt?: string; description?: string }
    ) => {
      await updateSkill(skillId, {
        ...(updates.name
          ? { name: updates.name, displayName: updates.name }
          : {}),
        ...(updates.prompt ? { coreInstructions: updates.prompt } : {}),
        ...(updates.description !== undefined
          ? { description: updates.description }
          : {})
      });
      await refreshSkills();
      setWorkspaceToast({
        type: 'success',
        message: '技能已更新'
      });
    },
    [refreshSkills, setWorkspaceToast]
  );

  const handleDeleteSkillFromPlaza = useCallback(
    async (skillId: string) => {
      await deleteSkill(skillId);
      await refreshSkills();
      setWorkspaceToast({
        type: 'success',
        message: '技能已删除'
      });
    },
    [refreshSkills, setWorkspaceToast]
  );

  loadSummariesRef.current = loadSummaries;

  const handleDeleteSummary = async (id: string) => {
    try {
      await deleteSummaryApi(id);
      log.info('[Workspace] Summary deleted:', id);
      const summaryToDelete = summaries.find((s) => s.id === id);
      setSummaries((prev) => prev.filter((s) => s.id !== id));
      removeSummaryFromCache(id, summaryToDelete?.projectId || undefined);

      if (selectedSummary?.id === id) {
        setSelectedSummary(null);
        setViewMode('list');
      }
    } catch (error: unknown) {
      log.error('[Workspace] Delete failed:', error);
      if (error instanceof Error && error.message.includes('404')) {
        setSummaries((prev) => prev.filter((s) => s.id !== id));
        removeSummaryFromCache(id, currentProjectId || undefined);
        if (selectedSummary?.id === id) {
          setSelectedSummary(null);
          setViewMode('list');
        }
      } else {
        setWorkspaceToast({
          type: 'error',
          message: t('app.deleteFailed')
        });
      }
    }
  };

  // 记录进入详情页前的项目 ID，用于检测项目切换
  const previousProjectIdRef = useRef<string | null>(null);

  // 进入详情页
  const handleEnterDetail = async (summary: SavedSummary) => {
    const targetProjectId =
      summary.projectId ?? effectiveProjectId ?? currentProjectId ?? null;

    // 记录进入详情前的项目 ID，返回时恢复
    // 如果当前是 boards 视图（currentProjectId 为 null），使用卡片所属的项目 ID
    // 这样从项目管理页的"最近添加"点击卡片后返回，会回到对应项目页面
    previousProjectIdRef.current = currentProjectId ?? targetProjectId;

    // 检测缓存内容是否被截断（markdown 长度接近截断阈值）
    // MAX_MARKDOWN_LENGTH = 8000，如果接近这个值，说明可能被截断了
    const TRUNCATION_THRESHOLD = 7500;
    const isTruncated = summary.markdown.length >= TRUNCATION_THRESHOLD;

    // 如果内容可能被截断，先显示 loading 状态
    if (isTruncated) {
      setIsDetailLoading(true);
    }

    // 先用缓存数据显示详情页（快速响应）
    setSelectedSummary(summary);
    setViewMode('detail');
    setMobileProjectPanel('sources');

    // 设置当前项目为卡片所属的项目，这样详情页左上角会显示正确的项目名
    // 注意：这不会触发数据刷新，因为我们在详情页不加载列表数据
    if (targetProjectId && targetProjectId !== currentProjectId) {
      setCurrentProjectId(targetProjectId);
    }

    // 更新 URL，使刷新后能保持在当前详情页（使用新 URL 格式）
    navigate(
      buildBoardsUrl({ projectId: targetProjectId, summaryId: summary.id }),
      { replace: true }
    );

    // 始终从 API 获取完整数据（缓存中的 markdown 可能被截断导致图片位置错乱）
    // 原因：truncateMarkdown 会把图片移到开头，破坏原始结构
    log.info('[Workspace] Fetching full content for detail view:', summary.id);
    try {
      const fullSummary = await getSummaryById(summary.id);
      if (fullSummary) {
        log.info(
          '[Workspace] Got full summary, markdown length:',
          fullSummary.markdown.length
        );
        // 更新详情页显示
        setSelectedSummary(fullSummary);
        // 同时更新列表中的数据和缓存
        setSummaries((prev: SavedSummary[]) =>
          prev.map((s) => (s.id === summary.id ? fullSummary : s))
        );
        // 更新缓存中的完整数据（不只是 markdown，还包括 title 等）
        // 这解决了从详情页返回时缓存数据不完整的问题
        updateSummaryCache(
          summary.id,
          fullSummary,
          fullSummary.projectId || undefined
        );
      }
    } catch (error) {
      log.warn('[Workspace] Failed to fetch full summary:', error);
      // 失败时继续使用缓存数据
    } finally {
      // 无论成功失败，都清除 loading 状态
      setIsDetailLoading(false);
    }
  };

  // 返回列表
  const handleBackToList = () => {
    log.info(
      '[Workspace] handleBackToList called, currentProjectId:',
      currentProjectId,
      'previousProjectId:',
      previousProjectIdRef.current
    );

    // 恢复进入详情前的项目 ID
    // 这样从"全部"视图进入详情后返回，仍然显示全部内容
    const restoreProjectId = previousProjectIdRef.current;
    previousProjectIdRef.current = null; // 清除记录

    // 如果当前有选中的 summary，确保它在列表中存在并使用完整数据
    // 这解决了新保存的卡片从详情页返回时不显示的问题
    // 同时确保从详情页获取的完整数据不被缓存中的截断数据覆盖
    if (selectedSummary) {
      setSummaries((prev) => {
        const existingIndex = prev.findIndex(
          (s) => s.id === selectedSummary.id
        );
        if (existingIndex === -1) {
          log.info(
            '[Workspace] Adding current summary to list on back:',
            selectedSummary.id
          );
          return [selectedSummary, ...prev];
        }
        // 用完整数据替换可能被截断的缓存数据
        const existing = prev[existingIndex];
        if (selectedSummary.markdown.length > existing.markdown.length) {
          log.info(
            '[Workspace] Updating summary with full content:',
            selectedSummary.id,
            'old length:',
            existing.markdown.length,
            'new length:',
            selectedSummary.markdown.length
          );
          const updated = [...prev];
          updated[existingIndex] = selectedSummary;
          return updated;
        }
        return prev;
      });
    }

    log.info(
      '[Workspace] Setting viewMode to list, restoring projectId to:',
      restoreProjectId
    );
    setViewMode('list');
    setSelectedSummary(null); // 清除选中的 summary
    setSelectionRef(null);
    setMobileProjectPanel('sources');

    // 只有当项目 ID 真正变化时才更新
    if (currentProjectId !== restoreProjectId) {
      setCurrentProjectId(restoreProjectId);
    }

    // 清除 URL 中的 summary-id 参数，保留项目路径
    const newUrl = buildBoardsUrl({ projectId: restoreProjectId });
    log.info('[Workspace] Updating URL to:', newUrl);
    window.history.replaceState(
      { view: 'list', projectId: restoreProjectId },
      '',
      newUrl
    );

    // 不再强制刷新列表数据，避免卡片重新排列
    // 缓存数据已经在 setSummaries 中更新，无需重新加载
    // 如果需要同步服务器数据，依赖页面可见性变化时的自动刷新（5分钟节流）
  };

  // 点击引用跳转到对应总结详情
  const handleReferenceClick = (summaryId: string) => {
    const summary = summaries.find((s) => s.id === summaryId);
    if (summary) {
      // 记录进入详情前的项目 ID，返回时恢复
      previousProjectIdRef.current = currentProjectId;
      setSelectedSummary(summary);
      setViewMode('detail');
      setMobileProjectPanel('sources');
      // 更新 URL（使用新格式）
      window.history.replaceState(
        {},
        '',
        buildBoardsUrl({ projectId: currentProjectId, summaryId: summary.id })
      );
    }
  };

  // 批量添加引用
  const handleAddReferences = (refs: Reference[]) => {
    log.info('[App] handleAddReferences called:', {
      incomingCount: refs.length,
      refs: refs.map((r) => ({
        id: r.id,
        summaryId: r.summaryId,
        hasContent: !!r.content,
        contentLength: r.content?.length || 0
      }))
    });
    setReferences((prev) => {
      const newRefs = refs.filter(
        (ref) =>
          !prev.some(
            (r) =>
              r.id === ref.id ||
              (r.summaryId === ref.summaryId && r.type === 'summary')
          )
      );
      log.info('[App] handleAddReferences result:', {
        prevCount: prev.length,
        newRefsCount: newRefs.length,
        totalCount: prev.length + newRefs.length
      });
      return [...prev, ...newRefs];
    });
  };

  // 移除引用（支持持久引用和临时选中引用）
  const handleRemoveReference = (refId: string) => {
    if (refId.startsWith(SELECTED_SUMMARY_REF_PREFIX)) {
      const summaryId = refId.slice(SELECTED_SUMMARY_REF_PREFIX.length);
      setSelectedSummaryIds((prev) => prev.filter((id) => id !== summaryId));
      return;
    }

    // 检查是否是临时选中引用
    if (selectionRef && selectionRef.id === refId) {
      setSelectionRef(null);
      return;
    }
    // 否则从持久引用中移除
    setReferences((prev) => prev.filter((r) => r.id !== refId));
  };

  // 文字选中变化（临时引用）
  const handleSelectionChange = (ref: Reference | null) => {
    setSelectionRef(ref);
  };

  // 保存编辑后的内容
  const handleSaveSummary = async (id: string, content: string) => {
    try {
      await updateSummary(id, { markdown: content });
      log.info('[Workspace] Summary saved:', id);
      // 更新本地状态
      setSummaries((prev: SavedSummary[]) =>
        prev.map((s: SavedSummary) =>
          s.id === id ? { ...s, isSaving: true, markdown: content } : s
        )
      );
      // 更新选中的summary
      if (selectedSummary?.id === id) {
        setSelectedSummary((prev) =>
          prev ? { ...prev, markdown: content } : null
        );
      }
      // 同步更新缓存
      updateSummaryCache(
        id,
        { markdown: content },
        selectedSummary?.projectId || undefined
      );
    } catch (error) {
      log.error('[Workspace] Save failed:', error);
      throw error;
    }
  };

  // 重命名标题
  const handleRenameSummary = async (id: string, newTitle: string) => {
    try {
      await updateSummary(id, { title: newTitle });
      log.info('[Workspace] Summary renamed:', id, newTitle);
      // 更新本地状态
      setSummaries((prev: SavedSummary[]) =>
        prev.map((s: SavedSummary) =>
          s.id === id ? { ...s, isSaving: true, title: newTitle } : s
        )
      );
      // 更新选中的summary
      if (selectedSummary?.id === id) {
        setSelectedSummary((prev) =>
          prev ? { ...prev, title: newTitle } : null
        );
      }
      // 同步更新缓存
      updateSummaryCache(
        id,
        { title: newTitle },
        selectedSummary?.projectId || undefined
      );
    } catch (error) {
      log.error('[Workspace] Rename failed:', error);
      throw error;
    }
  };

  // 添加骨架卡片（乐观更新）
  const handleAddPendingSummary = useCallback(
    (summary: SavedSummary): string => {
      log.info('[Workspace] Adding pending summary:', summary.id);
      setSummaries((prev) => [summary, ...prev]); // 添加到列表最前面
      return summary.id;
    },
    [setSummaries]
  );

  // 更新骨架卡片为真实卡片
  const handleUpdatePendingSummary = useCallback(
    (tempId: string, realId: string, summary: SavedSummary) => {
      log.info('[Workspace] Updating pending summary:', tempId, '->', realId);
      setSummaries((prev: SavedSummary[]) =>
        prev.map((s) => (s.id === tempId ? { ...summary, isSaving: false } : s))
      );
      // 同步添加到缓存
      addSummaryToCache(summary);
    },
    [setSummaries]
  );

  // 移除骨架卡片（保存失败时）
  const handleRemovePendingSummary = useCallback((tempId: string) => {
    log.info('[Workspace] Removing pending summary:', tempId);
    setSummaries((prev) => prev.filter((s) => s.id !== tempId));
  }, [setSummaries]);

  // 检测卡片类型的函数（纯函数，用于 useMemo）
  const detectCardType = useCallback((summary: SavedSummary): string => {
    const url = summary.url?.toLowerCase() || '';
    const markdown = summary.markdown?.toLowerCase() || '';

    // 笔记类型（本地创建）
    if (url === 'note://local') {
      // 检查是否是图片笔记
      if (markdown.includes('<img') || markdown.includes('data:image')) {
        return 'image';
      }
      return 'note';
    }

    // 视频类型
    if (
      url.includes('youtube.com') ||
      url.includes('youtu.be') ||
      url.includes('bilibili.com') ||
      url.includes('vimeo.com') ||
      url.includes('twitter.com') ||
      url.includes('x.com')
    ) {
      return 'video';
    }

    // 音频类型
    if (
      url.includes('spotify.com') ||
      url.includes('music.') ||
      url.includes('podcast') ||
      url.includes('soundcloud.com')
    ) {
      return 'audio';
    }

    // PDF 类型
    if (url.endsWith('.pdf') || markdown.includes('[pdf]')) {
      return 'pdf';
    }

    // Office 类型
    if (
      url.endsWith('.doc') ||
      url.endsWith('.docx') ||
      url.endsWith('.xls') ||
      url.endsWith('.xlsx') ||
      url.endsWith('.ppt') ||
      url.endsWith('.pptx')
    ) {
      return 'office';
    }

    // 图片类型（纯图片内容）
    if (
      (markdown.includes('<img') || markdown.includes('data:image')) &&
      markdown.replace(/<[^>]+>/g, '').trim().length < 100
    ) {
      return 'image';
    }

    // 文本类型（纯文本，无 URL）
    if (!url || url === '') {
      return 'text';
    }

    // 默认为文章类型
    return 'article';
  }, []);

  // 预计算每个 summary 的类型（只在 summaries 变化时重新计算）
  const summaryTypesMap = useMemo(() => {
    const map = new Map<string, string>();
    summaries.forEach((s) => {
      if (s.id) {
        map.set(s.id, detectCardType(s));
      }
    });
    return map;
  }, [summaries, detectCardType]);

  const currentProjectSourceSummaries = useMemo(() => {
    return (
      effectiveProjectId
        ? summaries.filter((s) => s.projectId === effectiveProjectId)
        : summaries
    ).filter((s) => {
      if (!Array.isArray(s.tags)) return true;
      return !s.tags.some(
        (tag) => tag === 'studio-note' || tag === 'chat-output'
      );
    });
  }, [summaries, effectiveProjectId]);

  // 根据当前项目和类型过滤 summaries（使用预计算的类型）
  const filteredSummaries = useMemo(() => {
    let result = currentProjectSourceSummaries;

    // 如果选择了类型筛选
    if (selectedTypes.length > 0) {
      result = result.filter((s) => {
        const type = s.id ? summaryTypesMap.get(s.id) : detectCardType(s);
        return type && selectedTypes.includes(type);
      });
    }

    return result;
  }, [
    currentProjectSourceSummaries,
    selectedTypes,
    summaryTypesMap,
    detectCardType
  ]);

  const selectedSummaries = useMemo(
    () =>
      filteredSummaries.filter((summary) =>
        selectedSummaryIds.includes(summary.id)
      ),
    [filteredSummaries, selectedSummaryIds]
  );
  const canvasProjectState = useMemo<CanvasProjectState>(() => {
    if (!effectiveProjectId) return createEmptyCanvasProjectState();
    return (
      canvasStateByProject[effectiveProjectId] ||
      createEmptyCanvasProjectState()
    );
  }, [canvasStateByProject, effectiveProjectId]);
  const canvasNodeIds = canvasProjectState.nodeIds;
  const canvasCustomNodes = useMemo(
    () => canvasProjectState.customNodes || {},
    [canvasProjectState.customNodes]
  );
  const canvasCustomNodeIds = useMemo(
    () => Object.keys(canvasCustomNodes),
    [canvasCustomNodes]
  );
  const allCanvasNodeIds = useMemo(
    () => [...canvasNodeIds, ...canvasCustomNodeIds],
    [canvasCustomNodeIds, canvasNodeIds]
  );
  const canvasSummaries = useMemo(() => {
    if (!effectiveProjectId || canvasNodeIds.length === 0) return [];
    const summaryById = new Map(
      summaries.map((summary) => [summary.id, summary])
    );
    return canvasNodeIds
      .map((id) => summaryById.get(id))
      .filter((summary): summary is SavedSummary => Boolean(summary));
  }, [canvasNodeIds, effectiveProjectId, summaries]);
  const activeCanvasNodeIds = useMemo(
    () =>
      canvasProjectState.activeNodeIds.filter((id) =>
        allCanvasNodeIds.includes(id)
      ),
    [allCanvasNodeIds, canvasProjectState.activeNodeIds]
  );
  const agentCanvasNodeIds = useMemo(() => {
    const allowedNodeIds = new Set(allCanvasNodeIds);
    const ids = new Set(
      activeCanvasNodeIds.filter((id) => allowedNodeIds.has(id))
    );
    const includeRelatedCanvasNodes = (nodeId?: string) => {
      if (!nodeId || !allowedNodeIds.has(nodeId)) return;
      ids.add(nodeId);
      const customNode = canvasCustomNodes[nodeId];
      if (customNode?.type === 'annotation') {
        if (
          customNode.targetNodeId &&
          allowedNodeIds.has(customNode.targetNodeId)
        ) {
          ids.add(customNode.targetNodeId);
        }
        canvasProjectState.connections.forEach((connection) => {
          if (
            connection.fromNodeId === nodeId &&
            allowedNodeIds.has(connection.toNodeId)
          ) {
            ids.add(connection.toNodeId);
          }
        });
      }
      canvasProjectState.connections.forEach((connection) => {
        if (
          connection.toNodeId === nodeId &&
          allowedNodeIds.has(connection.fromNodeId)
        ) {
          ids.add(connection.fromNodeId);
        }
      });
    };

    activeCanvasNodeIds.forEach(includeRelatedCanvasNodes);
    includeRelatedCanvasNodes(canvasProjectState.selectedNodeId);
    return Array.from(ids);
  }, [
    activeCanvasNodeIds,
    allCanvasNodeIds,
    canvasCustomNodes,
    canvasProjectState.connections,
    canvasProjectState.selectedNodeId
  ]);
  const activeCanvasSummaries = useMemo(() => {
    const agentIdSet = new Set(agentCanvasNodeIds);
    return canvasSummaries.filter((summary) => agentIdSet.has(summary.id));
  }, [agentCanvasNodeIds, canvasSummaries]);
  const activeCanvasCustomNodes = useMemo(() => {
    const activeIdSet = new Set(agentCanvasNodeIds);
    return Object.values(canvasCustomNodes).filter((node) =>
      activeIdSet.has(node.id)
    );
  }, [agentCanvasNodeIds, canvasCustomNodes]);
  const canvasAgentReferences = useMemo<Reference[]>(() => {
    const canvasSummaryTitleById = new Map(
      canvasSummaries.map((summary) => [
        summary.id,
        summary.title?.trim() || '未命名画布节点'
      ])
    );
    const customNodeTitleById = new Map(
      Object.values(canvasCustomNodes).map((node) => [
        node.id,
        node.title?.trim() || '画布自定义节点'
      ])
    );
    const getCanvasNodeTitle = (nodeId?: string) => {
      if (!nodeId) return undefined;
      return (
        canvasSummaryTitleById.get(nodeId) || customNodeTitleById.get(nodeId)
      );
    };
    const annotationTargetNodeIds = new Set<string>();
    activeCanvasCustomNodes.forEach((node) => {
      if (node.type !== 'annotation') return;
      if (node.targetNodeId) annotationTargetNodeIds.add(node.targetNodeId);
      canvasProjectState.connections.forEach((connection) => {
        if (connection.fromNodeId === node.id) {
          annotationTargetNodeIds.add(connection.toNodeId);
        }
      });
    });
    const canvasReferences = activeCanvasSummaries.map((summary) => {
      const title = summary.title?.trim() || '未命名画布节点';
      const imageUrl = getCanvasSummaryImageUrl(summary);
      return {
        id: `${CANVAS_SUMMARY_REF_PREFIX}${summary.id}`,
        type: 'summary',
        summaryId: summary.id,
        summaryTitle: title,
        content: summary.markdown || '',
        preview: title.slice(0, 8),
        canvas: {
          nodeId: summary.id,
          imageUrl,
          role:
            summary.id === canvasProjectState.selectedNodeId
              ? 'selected'
              : activeCanvasNodeIds.includes(summary.id)
                ? 'active'
                : annotationTargetNodeIds.has(summary.id)
                  ? 'target'
                  : 'upstream'
        }
      } satisfies Reference;
    });
    const customReferences = activeCanvasCustomNodes.map((node) => {
      const title = node.title.trim() || '画布自定义节点';
      const outboundTargetId =
        node.targetNodeId ||
        canvasProjectState.connections.find(
          (connection) => connection.fromNodeId === node.id
        )?.toNodeId;
      const outboundTargetTitle = getCanvasNodeTitle(outboundTargetId);
      const content =
        node.type === 'ai_image_holder'
          ? [
              `画布节点类型：AI 图片槽`,
              node.prompt ? `生成意图：${node.prompt}` : '生成意图：待补充',
              `目标规格：${node.targetWidth || CANVAS_AI_HOLDER_DEFAULT_TARGET_WIDTH}x${node.targetHeight || CANVAS_AI_HOLDER_DEFAULT_TARGET_HEIGHT}`,
              `宽高比：${node.aspectRatio || CANVAS_AI_HOLDER_DEFAULT_ASPECT_RATIO}`,
              node.output?.version ? `当前版本：v${node.output.version}` : '',
              node.output?.imageUrl
                ? `已生成图片：${node.output.imageUrl}`
                : '',
              node.output?.sourceSummaryId
                ? `上一版本节点：${getCanvasNodeTitle(node.output.sourceSummaryId) || node.output.sourceSummaryId}`
                : '',
              node.content ? `说明：${node.content}` : ''
            ]
              .filter(Boolean)
              .join('\n')
          : [
              `画布节点类型：修改标注`,
              `标注类型：${getCanvasAnnotationKindLabel(node.annotationKind)}`,
              outboundTargetTitle
                ? `关联目标：${outboundTargetTitle}`
                : '关联目标：未指定',
              `标注内容：${node.content || '暂无批注内容'}`,
              `执行原则：优先只修改关联目标或上游选中节点，未标注区域保持原样。`
            ].join('\n');
      return {
        id: `${CANVAS_SUMMARY_REF_PREFIX}${node.id}`,
        type: 'selection',
        summaryId: node.id,
        summaryTitle: title,
        content,
        preview: title.slice(0, 8),
        canvas: {
          nodeId: node.id,
          role:
            node.type === 'ai_image_holder' &&
            node.id === canvasProjectState.selectedNodeId
              ? 'target'
              : node.id === canvasProjectState.selectedNodeId
                ? 'selected'
                : activeCanvasNodeIds.includes(node.id)
                  ? 'active'
                  : annotationTargetNodeIds.has(node.id)
                    ? 'target'
                    : 'upstream',
          customNodeType: node.type,
          targetWidth: node.targetWidth,
          targetHeight: node.targetHeight,
          aspectRatio: node.aspectRatio,
          aspectPreset: node.aspectPreset,
          imageUrl: node.output?.imageUrl,
          annotationKind: node.annotationKind,
          version: node.output?.version || node.version
        }
      } satisfies Reference;
    });

    const merged = [...references, ...canvasReferences, ...customReferences];
    if (selectionRef) merged.push(selectionRef);
    return merged.filter(
      (ref, index, arr) =>
        arr.findIndex(
          (item) => item.id === ref.id || item.summaryId === ref.summaryId
        ) === index
    );
  }, [
    activeCanvasCustomNodes,
    activeCanvasSummaries,
    activeCanvasNodeIds,
    canvasProjectState.selectedNodeId,
    canvasProjectState.connections,
    canvasSummaries,
    canvasCustomNodes,
    references,
    selectionRef
  ]);
  const selectedSummaryReferences = useMemo<Reference[]>(
    () =>
      selectedSummaries.map((summary) => {
        const title = summary.title?.trim() || '未命名来源';
        return {
          id: `${SELECTED_SUMMARY_REF_PREFIX}${summary.id}`,
          type: 'summary',
          summaryId: summary.id,
          summaryTitle: title,
          content: summary.markdown || '',
          preview: title.slice(0, 8)
        };
      }),
    [selectedSummaries]
  );

  // 合并所有引用：持久引用 + 列表勾选来源 + 临时选中引用
  const allReferences = useMemo(() => {
    const merged = [...references, ...selectedSummaryReferences];
    const deduped = merged.filter(
      (ref, index, arr) =>
        arr.findIndex(
          (item) => item.id === ref.id || item.summaryId === ref.summaryId
        ) === index
    );

    if (!selectionRef) return deduped;
    return [
      ...deduped.filter((ref) => ref.id !== selectionRef.id),
      selectionRef
    ];
  }, [references, selectedSummaryReferences, selectionRef]);

  useEffect(() => {
    const validIds = new Set(filteredSummaries.map((summary) => summary.id));
    setSelectedSummaryIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [filteredSummaries]);

  const toggleSummarySelect = useCallback((id: string) => {
    setSelectedSummaryIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }, []);

  const selectAllVisibleSummaries = useCallback(() => {
    setSelectedSummaryIds((prev) => {
      if (filteredSummaries.length === 0) return prev;
      const allVisibleIds = filteredSummaries.map((summary) => summary.id);
      const allSelected = allVisibleIds.every((id) => prev.includes(id));
      return allSelected
        ? prev.filter((id) => !allVisibleIds.includes(id))
        : allVisibleIds;
    });
  }, [filteredSummaries]);

  const updateCurrentCanvasState = useCallback(
    (updater: (current: CanvasProjectState) => CanvasProjectState) => {
      if (!effectiveProjectId) return;
      setCanvasStateByProject((prev) => {
        const current =
          prev[effectiveProjectId] || createEmptyCanvasProjectState();
        return {
          ...prev,
          [effectiveProjectId]: {
            ...updater(current),
            recoveredRecordCount: undefined,
            updatedAt: Date.now()
          }
        };
      });
    },
    [effectiveProjectId]
  );

  const addCanvasNodeIds = useCallback(
    (ids: string[], statePatch: Partial<CanvasProjectState> = {}) => {
      if (!effectiveProjectId || ids.length === 0) return;

      setCanvasStateByProject((prev) => {
        const current =
          prev[effectiveProjectId] || createEmptyCanvasProjectState();
        const nextIds = [...current.nodeIds];
        ids.forEach((id) => {
          if (!nextIds.includes(id)) nextIds.push(id);
        });
        const nextCustomNodes = {
          ...current.customNodes,
          ...normalizeCanvasCustomNodes(statePatch.customNodes || {})
        };
        const allowedNodeIds = new Set([
          ...nextIds,
          ...Object.keys(nextCustomNodes)
        ]);
        const incomingActiveIds = statePatch.activeNodeIds || ids;
        const activeNodeIds = Array.from(
          new Set([
            ...current.activeNodeIds.filter((id) => allowedNodeIds.has(id)),
            ...incomingActiveIds.filter((id) => allowedNodeIds.has(id))
          ])
        );
        return {
          ...prev,
          [effectiveProjectId]: {
            ...current,
            ...statePatch,
            nodeIds: nextIds,
            activeNodeIds,
            customNodes: nextCustomNodes,
            positions: {
              ...current.positions,
              ...(statePatch.positions || {})
            },
            sizes: {
              ...current.sizes,
              ...(statePatch.sizes || {})
            },
            connections: normalizeCanvasConnections(
              statePatch.connections || current.connections,
              allowedNodeIds
            ),
            viewport: statePatch.viewport || current.viewport,
            updatedAt: Date.now()
          }
        };
      });
    },
    [effectiveProjectId]
  );

  const removeCanvasNode = useCallback(
    (id: string) => {
      if (!effectiveProjectId) return;
      setCanvasStateByProject((prev) => {
        const current =
          prev[effectiveProjectId] || createEmptyCanvasProjectState();
        const positions = { ...current.positions };
        const sizes = { ...current.sizes };
        const customNodes = { ...current.customNodes };
        delete positions[id];
        delete sizes[id];
        delete customNodes[id];
        return {
          ...prev,
          [effectiveProjectId]: {
            ...current,
            nodeIds: current.nodeIds.filter((item) => item !== id),
            activeNodeIds: current.activeNodeIds.filter((item) => item !== id),
            customNodes,
            positions,
            sizes,
            connections: current.connections.filter(
              (connection) =>
                connection.fromNodeId !== id && connection.toNodeId !== id
            ),
            selectedNodeId:
              current.selectedNodeId === id
                ? undefined
                : current.selectedNodeId,
            updatedAt: Date.now()
          }
        };
      });
    },
    [effectiveProjectId]
  );

  const replaceCanvasNodeIds = useCallback(
    (ids: string[], statePatch: Partial<CanvasProjectState> = {}) => {
      if (!effectiveProjectId) return;
      const uniqueIds = Array.from(new Set(ids));
      setCanvasStateByProject((prev) => {
        const current =
          prev[effectiveProjectId] || createEmptyCanvasProjectState();
        const customNodes = Object.prototype.hasOwnProperty.call(
          statePatch,
          'customNodes'
        )
          ? normalizeCanvasCustomNodes(statePatch.customNodes || {})
          : current.customNodes;
        const allowedNodeIds = new Set([
          ...uniqueIds,
          ...Object.keys(customNodes || {})
        ]);
        return {
          ...prev,
          [effectiveProjectId]: {
            ...current,
            ...statePatch,
            nodeIds: uniqueIds,
            activeNodeIds: (
              statePatch.activeNodeIds || current.activeNodeIds
            ).filter((id) => allowedNodeIds.has(id)),
            customNodes,
            positions: statePatch.positions || current.positions,
            sizes: statePatch.sizes || current.sizes,
            connections: normalizeCanvasConnections(
              statePatch.connections || current.connections,
              allowedNodeIds
            ),
            selectedNodeId: Object.prototype.hasOwnProperty.call(
              statePatch,
              'selectedNodeId'
            )
              ? typeof statePatch.selectedNodeId === 'string' &&
                allowedNodeIds.has(statePatch.selectedNodeId)
                ? statePatch.selectedNodeId
                : undefined
              : current.selectedNodeId &&
                  allowedNodeIds.has(current.selectedNodeId)
                ? current.selectedNodeId
                : undefined,
            viewport: statePatch.viewport || current.viewport,
            updatedAt: Date.now()
          }
        };
      });
    },
    [effectiveProjectId]
  );

  const toggleCanvasNodeActive = useCallback(
    (id: string) => {
      updateCurrentCanvasState((current) => {
        const isActive = current.activeNodeIds.includes(id);
        const allowedNodeIds = new Set([
          ...current.nodeIds,
          ...Object.keys(current.customNodes || {})
        ]);
        return {
          ...current,
          activeNodeIds: isActive
            ? current.activeNodeIds.filter((item) => item !== id)
            : [...current.activeNodeIds, id].filter((item) =>
                allowedNodeIds.has(item)
              )
        };
      });
    },
    [updateCurrentCanvasState]
  );

  const updateCanvasProjectState = useCallback(
    (statePatch: Partial<CanvasProjectState>) => {
      updateCurrentCanvasState((current) => {
        const nodeIds = statePatch.nodeIds || current.nodeIds;
        const hasCustomNodesPatch = Object.prototype.hasOwnProperty.call(
          statePatch,
          'customNodes'
        );
        const customNodes = hasCustomNodesPatch
          ? normalizeCanvasCustomNodes(statePatch.customNodes || {})
          : current.customNodes;
        const allowedNodeIds = new Set([
          ...nodeIds,
          ...Object.keys(customNodes || {})
        ]);
        const hasPositionsPatch = Object.prototype.hasOwnProperty.call(
          statePatch,
          'positions'
        );
        const hasSizesPatch = Object.prototype.hasOwnProperty.call(
          statePatch,
          'sizes'
        );
        return {
          ...current,
          ...statePatch,
          nodeIds,
          customNodes,
          activeNodeIds: (
            statePatch.activeNodeIds || current.activeNodeIds
          ).filter((id) => allowedNodeIds.has(id)),
          positions: hasPositionsPatch
            ? statePatch.positions || {}
            : current.positions,
          sizes: hasSizesPatch ? statePatch.sizes || {} : current.sizes,
          connections: normalizeCanvasConnections(
            statePatch.connections || current.connections,
            allowedNodeIds
          ),
          selectedNodeId: Object.prototype.hasOwnProperty.call(
            statePatch,
            'selectedNodeId'
          )
            ? typeof statePatch.selectedNodeId === 'string' &&
              allowedNodeIds.has(statePatch.selectedNodeId)
              ? statePatch.selectedNodeId
              : undefined
            : current.selectedNodeId,
          viewport: statePatch.viewport || current.viewport
        };
      });
    },
    [updateCurrentCanvasState]
  );

  const requestCanvasImageGeneration = useCallback(
    (node: CanvasCustomNode) => {
      const prompt = node.prompt?.trim();
      if (!prompt) return;
      const targetWidth =
        node.targetWidth || CANVAS_AI_HOLDER_DEFAULT_TARGET_WIDTH;
      const targetHeight =
        node.targetHeight || CANVAS_AI_HOLDER_DEFAULT_TARGET_HEIGHT;
      const aspectRatio =
        node.aspectRatio || CANVAS_AI_HOLDER_DEFAULT_ASPECT_RATIO;
      setIsAgentPanelCollapsed(false);
      setMobileProjectPanel('ask');
      setChatImageMode(true);
      setChatImageSettings((current) => ({
        ...current,
        aspectRatio
      }));
      setChatInput(
        `请基于当前 AI 图片槽生成图片：${prompt}\n\n目标规格：${targetWidth}x${targetHeight}，宽高比 ${aspectRatio}。生成结果请回填到当前 AI 图片槽。`
      );
      window.setTimeout(() => {
        window.dispatchEvent(new Event('workspace:focus-chat-input'));
      }, 0);
    },
    [setChatImageMode, setChatImageSettings, setChatInput]
  );

  const saveGeneratedImageToCanvas = useCallback(
    (payload: {
      imageUrl: string;
      mimeType?: string;
      summaryId: string;
      title: string;
      targetHolderId?: string;
      messageId?: string;
    }) => {
      if (!effectiveProjectId) return;
      updateCurrentCanvasState((current) => {
        const customNodes = { ...current.customNodes };
        const targetHolder =
          payload.targetHolderId &&
          customNodes[payload.targetHolderId]?.type === 'ai_image_holder'
            ? customNodes[payload.targetHolderId]
            : undefined;
        const previousSummaryId = targetHolder?.output?.summaryId;
        const previousVersion =
          typeof targetHolder?.output?.version === 'number'
            ? targetHolder.output.version
            : previousSummaryId
              ? 1
              : 0;
        const nextVersion =
          previousSummaryId && previousSummaryId !== payload.summaryId
            ? previousVersion + 1
            : Math.max(previousVersion, 1);
        if (targetHolder && payload.targetHolderId) {
          customNodes[payload.targetHolderId] = {
            ...targetHolder,
            output: {
              imageUrl: payload.imageUrl,
              summaryId: payload.summaryId,
              sourceSummaryId:
                previousSummaryId && previousSummaryId !== payload.summaryId
                  ? previousSummaryId
                  : undefined,
              messageId: payload.messageId,
              mimeType: payload.mimeType,
              title: payload.title,
              version: nextVersion,
              savedAt: Date.now(),
              targetWidth: targetHolder.targetWidth,
              targetHeight: targetHolder.targetHeight,
              aspectRatio: targetHolder.aspectRatio
            },
            content:
              nextVersion > 1
                ? `生成图片已保存到画布，当前为 v${nextVersion}。`
                : '生成图片已保存到画布。'
          };
        }

        const nodeIds = current.nodeIds.includes(payload.summaryId)
          ? current.nodeIds
          : [...current.nodeIds, payload.summaryId];
        const allowedNodeIds = new Set([
          ...nodeIds,
          ...Object.keys(customNodes)
        ]);
        const holderPosition =
          targetHolder && payload.targetHolderId
            ? current.positions[payload.targetHolderId]
            : undefined;
        const versionSourceNodeId =
          previousSummaryId &&
          previousSummaryId !== payload.summaryId &&
          allowedNodeIds.has(previousSummaryId)
            ? previousSummaryId
            : targetHolder && payload.targetHolderId
              ? payload.targetHolderId
              : undefined;
        const versionSourcePosition = versionSourceNodeId
          ? current.positions[versionSourceNodeId]
          : undefined;
        const versionSourceSize = versionSourceNodeId
          ? current.sizes[versionSourceNodeId]
          : undefined;
        const nextPositions = { ...current.positions };
        if (!nextPositions[payload.summaryId]) {
          nextPositions[payload.summaryId] = versionSourcePosition
            ? {
                x:
                  versionSourcePosition.x +
                  (versionSourceSize?.width || 264) +
                  96,
                y: versionSourcePosition.y
              }
            : holderPosition
              ? { x: holderPosition.x + 380, y: holderPosition.y }
              : { x: 120, y: 120 };
        }
        const nextConnections = versionSourceNodeId
          ? normalizeCanvasConnections(
              [
                ...current.connections,
                {
                  id: `${versionSourceNodeId}:${payload.summaryId}:${Date.now().toString(36)}`,
                  fromNodeId: versionSourceNodeId,
                  toNodeId: payload.summaryId
                }
              ],
              allowedNodeIds
            )
          : normalizeCanvasConnections(current.connections, allowedNodeIds);

        return {
          ...current,
          nodeIds,
          customNodes,
          positions: nextPositions,
          connections: nextConnections,
          activeNodeIds: Array.from(
            new Set([
              ...current.activeNodeIds,
              ...(payload.targetHolderId ? [payload.targetHolderId] : []),
              payload.summaryId
            ])
          ).filter((id) => allowedNodeIds.has(id)),
          selectedNodeId: payload.summaryId
        };
      });
      setMobileProjectPanel('canvas');
    },
    [effectiveProjectId, updateCurrentCanvasState]
  );

  const handleSaveChatToStudio = useCallback(
    async (payload: { title: string; markdown: string }) => {
      const title = (payload.title || '').trim() || '对话项目笔记';
      const markdown = payload.markdown || '';
      if (effectiveProjectId) {
        await createStudioDocument({
          projectId: effectiveProjectId,
          title,
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: markdown
                  ? [{ type: 'text', text: markdown }]
                  : [{ type: 'text', text: '' }]
              }
            ]
          },
          content_type: 'text',
          status: 'draft'
        });
      }

      const result = await saveSummary({
        title,
        url: 'studio://chat-output',
        markdown,
        tags: ['chat-output'],
        project_id: effectiveProjectId || undefined
      });

      const sourceCard: SavedSummary = {
        id: result.id,
        title,
        url: 'studio://chat-output',
        markdown,
        createdAt: Date.now(),
        projectId: effectiveProjectId || undefined,
        tags: ['chat-output']
      };

      setSummaries((prev) => [sourceCard, ...prev]);
      addSummaryToCache(sourceCard);
    },
    [effectiveProjectId, setSummaries]
  );

  // 点击外部关闭添加菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        addMenuRef.current &&
        !addMenuRef.current.contains(event.target as Node)
      ) {
        setShowAddMenu(false);
      }
    };

    if (showAddMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [setShowAddMenu, showAddMenu]);

  // 点击外部关闭类型筛选菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        typeFilterRef.current &&
        !typeFilterRef.current.contains(event.target as Node)
      ) {
        setShowTypeFilter(false);
      }
    };

    if (showTypeFilter) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [setShowTypeFilter, showTypeFilter]);

  // 新建笔记
  const handleCreateNote = async () => {
    setShowAddMenu(false);

    // 新笔记的初始内容：标题占位符 + 空正文
    const initialMarkdown = '# New note\n\n';

    try {
      const result = await saveSummary({
        title: t('app.newNote'),
        url: 'note://local',
        markdown: initialMarkdown,
        tags: [],
        project_id: currentProjectId || undefined
      });

      const newNote: SavedSummary = {
        id: result.id,
        title: t('app.newNote'),
        url: 'note://local',
        markdown: initialMarkdown,
        createdAt: Date.now(),
        projectId: currentProjectId || undefined
      };

      setSummaries((prev) => [newNote, ...prev]);

      // 记录进入详情前的项目 ID，返回时恢复
      previousProjectIdRef.current = currentProjectId;
      setSelectedSummary(newNote);
      setViewMode('detail');

      // 同步添加到缓存
      addSummaryToCache(newNote);
    } catch (error) {
      log.error('[Workspace] Create note failed:', error);
    }
  };

  // 上传图片
  const handleUploadImage = () => {
    setShowAddMenu(false);

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async () => {
        const originalBase64 = reader.result as string;

        // 压缩图片以避免 413 Payload Too Large 错误
        let finalBase64 = originalBase64;
        try {
          // 提取 mimeType 和纯 base64 数据
          const match = originalBase64.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            const [, mimeType, base64Data] = match;
            log.info('[Workspace] Compressing image...', {
              originalSize: Math.round(base64Data.length / 1024) + 'KB',
              mimeType
            });

            const compressed = await compressImage(base64Data, mimeType);
            finalBase64 = `data:${compressed.mimeType};base64,${compressed.data}`;

            log.info('[Workspace] Image compressed:', {
              originalSize: Math.round(base64Data.length / 1024) + 'KB',
              compressedSize: Math.round(compressed.data.length / 1024) + 'KB'
            });
          }
        } catch (compressError) {
          log.warn(
            '[Workspace] Image compression failed, using original:',
            compressError
          );
          // 压缩失败时使用原图
        }

        // 转义文件名防止 XSS
        const safeFileName = escapeHtml(file.name);

        // 图片内容：图片 + 描述占位符
        const imageMarkdown = `<div class="mb-4"><img src="${finalBase64}" alt="${safeFileName}" class="max-w-full rounded-lg" /></div><div class="text-sm text-slate-500 mb-2" data-placeholder="true">${t('app.addDescription')}</div>`;

        try {
          const result = await saveSummary({
            title: file.name,
            url: 'note://local',
            markdown: imageMarkdown,
            tags: [],
            project_id: currentProjectId || undefined
          });

          const newNote: SavedSummary = {
            id: result.id,
            title: file.name,
            url: 'note://local',
            markdown: imageMarkdown,
            createdAt: Date.now(),
            projectId: currentProjectId || undefined
          };

          setSummaries((prev) => [newNote, ...prev]);

          // 记录进入详情前的项目 ID，返回时恢复
          previousProjectIdRef.current = currentProjectId;
          setSelectedSummary(newNote);
          setViewMode('detail');

          // 同步添加到缓存
          addSummaryToCache(newNote);
        } catch (error) {
          log.error('[Workspace] Upload image failed:', error);
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  // 处理拖拽文件到列表区域 - 创建资料卡片
  const handleFilesDropToList = useCallback(
    async (files: File[]) => {
      log.info(
        '[Workspace] Files dropped to list:',
        files.map((f) => f.name)
      );

      const pendingCards = files
        .map((file) => {
          const isImage = file.type.startsWith('image/');
          const isPdf = file.type === 'application/pdf';
          const isText = file.type === 'text/plain';

          if (!isImage && !isPdf && !isText) {
            log.warn('[Workspace] Unsupported file type:', file.type);
            return null;
          }

          const tempId = `temp-${crypto.randomUUID()}`;
          const safeFileName = file.name.replace(/[<>&"']/g, '');
          return {
            file,
            tempId,
            safeFileName,
            tempCard: {
              id: tempId,
              title: safeFileName,
              url: '',
              markdown: '',
              createdAt: Date.now(),
              projectId: currentProjectId || undefined,
              isSaving: true
            } as SavedSummary
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      if (pendingCards.length === 0) {
        return;
      }

      startTransition(() => {
        setSummaries((prev) => [
          ...pendingCards.map((item) => item.tempCard),
          ...prev
        ]);
      });

      await Promise.all(
        pendingCards.map(async ({ file, tempId, safeFileName }) => {
          const isImage = file.type.startsWith('image/');
          const isPdf = file.type === 'application/pdf';
          const isText = file.type === 'text/plain';
          const title = safeFileName;

          try {
            const [publicUrl, textPreview] = await Promise.all([
              uploadBrowserFileToStorage(file, user?.id, file.name),
              isText ? file.text() : Promise.resolve('')
            ]);

            let markdown = '';
            if (isImage) {
              markdown = `<div class="mb-4"><img src="${publicUrl}" alt="${safeFileName}" class="max-w-full rounded-lg" /></div><div class="text-sm text-slate-500 mb-2" data-placeholder="true">${t('app.addDescription')}</div>`;
            } else if (isPdf) {
              markdown = `<div class="file-preview-card" data-file-url="${publicUrl}" data-file-type="pdf" data-file-name="${safeFileName}">
  <div class="p-4 bg-slate-100 dark:bg-slate-700 rounded-lg mb-4">
    <div class="flex items-center gap-3">
      <span class="text-2xl">??</span>
      <div class="flex-1">
        <div class="font-medium text-slate-900 dark:text-slate-100">${safeFileName}</div>
        <div class="text-sm text-slate-500">${(file.size / 1024).toFixed(1)} KB</div>
      </div>
      <a href="${publicUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:text-blue-600 text-sm">
        ??? ??
      </a>
    </div>
  </div>
  <iframe src="${publicUrl}" class="w-full h-96 rounded-lg border border-slate-200 dark:border-slate-600" title="${safeFileName}"></iframe>
</div>`;
            } else {
              const escapedContent = textPreview
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .slice(0, 5000);
              markdown = `<div class="file-preview-card" data-file-url="${publicUrl}" data-file-type="text" data-file-name="${safeFileName}">
  <div class="p-4 bg-slate-100 dark:bg-slate-700 rounded-lg mb-4">
    <div class="flex items-center gap-3">
      <span class="text-2xl">??</span>
      <div class="flex-1">
        <div class="font-medium text-slate-900 dark:text-slate-100">${safeFileName}</div>
        <div class="text-sm text-slate-500">${(file.size / 1024).toFixed(1)} KB</div>
      </div>
      <a href="${publicUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:text-blue-600 text-sm">
        ??? ??
      </a>
    </div>
  </div>
  <pre class="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm overflow-auto max-h-96"><code>${escapedContent}</code></pre>
</div>`;
            }

            const result = await saveSummary({
              title,
              url: publicUrl,
              markdown,
              tags: [],
              project_id: currentProjectId || undefined
            });

            const newNote: SavedSummary = {
              id: result.id,
              title,
              url: publicUrl,
              markdown,
              createdAt: Date.now(),
              projectId: currentProjectId || undefined
            };

            startTransition(() => {
              setSummaries((prev) =>
                prev.map((s) => (s.id === tempId ? newNote : s))
              );
            });
            addSummaryToCache(newNote);
            log.info('[Workspace] Replaced skeleton with real card:', title);
          } catch (error) {
            log.error(
              '[Workspace] Failed to create card from dropped file:',
              error
            );
            startTransition(() => {
              setSummaries((prev) => prev.filter((s) => s.id !== tempId));
            });
          }
        })
      );
    },
    [currentProjectId, setSummaries, t, user?.id]
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    const applyResponsiveWidths = () => {
      const containerWidth = container.getBoundingClientRect().width;
      setWorkspaceContainerWidth(containerWidth);
      if (containerWidth < 768) return;

      if (hasManualColumnResize) {
        if (SHOW_PROJECT_WORKBENCH && containerWidth >= XL_BREAKPOINT) {
          const targetLeft = Math.round(
            containerWidth * manualLeftRatioRef.current
          );
          const targetStudio = Math.round(
            containerWidth * manualStudioRatioRef.current
          );

          const maxLeftByCenter =
            containerWidth -
            targetStudio -
            CENTER_PANEL_MIN_WIDTH_THREE_COLUMNS -
            DOUBLE_RESIZER_WIDTH;
          const maxLeftByRatio = containerWidth * LEFT_PANEL_MAX_RATIO;
          const nextLeft = clampGridWidth(
            targetLeft,
            LEFT_PANEL_MIN_WIDTH,
            Math.max(
              LEFT_PANEL_MIN_WIDTH,
              Math.min(maxLeftByCenter, maxLeftByRatio)
            )
          );

          const maxStudioByCenter =
            containerWidth -
            nextLeft -
            CENTER_PANEL_MIN_WIDTH_THREE_COLUMNS -
            DOUBLE_RESIZER_WIDTH;
          const nextStudio = clampGridWidth(
            targetStudio,
            STUDIO_PANEL_MIN_WIDTH,
            Math.max(
              STUDIO_PANEL_MIN_WIDTH,
              Math.min(
                STUDIO_PANEL_MAX_WIDTH,
                containerWidth * STUDIO_PANEL_MAX_RATIO,
                maxStudioByCenter
              )
            )
          );

          setSidebarWidth(nextLeft);
          setStudioWidth(nextStudio);
          return;
        }

        const targetLeft = Math.round(
          containerWidth * manualLeftRatioRef.current
        );
        const maxLeftByRatio =
          containerWidth * LEFT_PANEL_MAX_RATIO_TWO_COLUMNS;
        const maxLeft =
          containerWidth -
          CENTER_PANEL_MIN_WIDTH_TWO_COLUMNS -
          SINGLE_RESIZER_WIDTH;
        setSidebarWidth(
          clampGridWidth(
            targetLeft,
            LEFT_PANEL_MIN_WIDTH,
            Math.max(LEFT_PANEL_MIN_WIDTH, Math.min(maxLeft, maxLeftByRatio))
          )
        );
        return;
      }

      if (SHOW_PROJECT_WORKBENCH && containerWidth >= XL_BREAKPOINT) {
        const next = getDefaultTripleColumnWidths(containerWidth);
        setSidebarWidth(next.left);
        setStudioWidth(next.studio);
        return;
      }

      const defaultLeft = snapWidthToGrid(containerWidth * 0.28);
      const maxLeftByRatio = containerWidth * LEFT_PANEL_MAX_RATIO_TWO_COLUMNS;
      const maxLeft =
        containerWidth -
        CENTER_PANEL_MIN_WIDTH_TWO_COLUMNS -
        SINGLE_RESIZER_WIDTH;
      setSidebarWidth(
        clampGridWidth(
          defaultLeft,
          LEFT_PANEL_MIN_WIDTH,
          Math.max(LEFT_PANEL_MIN_WIDTH, Math.min(maxLeft, maxLeftByRatio))
        )
      );
    };

    applyResponsiveWidths();

    const observer = new ResizeObserver(() => {
      applyResponsiveWidths();
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, [
    hasManualColumnResize,
    manualLeftRatioRef,
    manualStudioRatioRef,
    setSidebarWidth,
    setStudioWidth
  ]);

  useEffect(() => {
    if (!hasManualColumnResize) return;
    if (typeof window === 'undefined') return;

    saveLayoutState(
      true,
      manualLeftRatioRef.current,
      manualStudioRatioRef.current
    );
  }, [
    hasManualColumnResize,
    manualLeftRatioRef,
    manualStudioRatioRef,
    saveLayoutState,
    sidebarWidth,
    studioWidth
  ]);

  // 拖拽开始
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setHasManualColumnResize(true);
    setDragTarget('left');
    setIsDragging(true);
  }, [setDragTarget, setHasManualColumnResize, setIsDragging]);

  const handleStudioMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setHasManualColumnResize(true);
    setDragTarget('studio');
    setIsDragging(true);
  }, [setDragTarget, setHasManualColumnResize, setIsDragging]);

  // 拖拽移动
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const isTripleColumn =
        SHOW_PROJECT_WORKBENCH && window.innerWidth >= XL_BREAKPOINT;

      if (dragTarget === 'left') {
        const newWidth = e.clientX - containerRect.left;

        const maxByCenter = isTripleColumn
          ? containerWidth -
            studioWidth -
            CENTER_PANEL_MIN_WIDTH_THREE_COLUMNS -
            DOUBLE_RESIZER_WIDTH
          : containerWidth -
            CENTER_PANEL_MIN_WIDTH_TWO_COLUMNS -
            SINGLE_RESIZER_WIDTH;
        const maxByRatio = isTripleColumn
          ? containerWidth * LEFT_PANEL_MAX_RATIO
          : containerWidth * LEFT_PANEL_MAX_RATIO_TWO_COLUMNS;
        const maxWidth = Math.max(
          LEFT_PANEL_MIN_WIDTH,
          Math.min(maxByCenter, maxByRatio)
        );

        const nextLeft = clampGridWidth(
          newWidth,
          LEFT_PANEL_MIN_WIDTH,
          maxWidth
        );
        setSidebarWidth(nextLeft);
        manualLeftRatioRef.current = nextLeft / containerWidth;
      }

      if (dragTarget === 'studio') {
        const newWidth = containerRect.right - e.clientX;
        const maxByCenter =
          containerWidth -
          sidebarWidth -
          CENTER_PANEL_MIN_WIDTH_THREE_COLUMNS -
          DOUBLE_RESIZER_WIDTH;
        const maxWidth = Math.max(
          STUDIO_PANEL_MIN_WIDTH,
          Math.min(
            STUDIO_PANEL_MAX_WIDTH,
            containerWidth * STUDIO_PANEL_MAX_RATIO,
            maxByCenter
          )
        );
        const nextStudio = clampGridWidth(
          newWidth,
          STUDIO_PANEL_MIN_WIDTH,
          maxWidth
        );
        setStudioWidth(nextStudio);
        manualStudioRatioRef.current = nextStudio / containerWidth;
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDragTarget(null);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [
    dragTarget,
    isDragging,
    manualLeftRatioRef,
    manualStudioRatioRef,
    setDragTarget,
    setIsDragging,
    setSidebarWidth,
    setStudioWidth,
    sidebarWidth,
    studioWidth
  ]);

  // 查找当前项目名称
  const currentProjectName =
    projects.find((p) => p.id === effectiveProjectId)?.name || '';
  const projectAgentPanelWidth = useMemo(() => {
    const containerWidth =
      workspaceContainerWidth ||
      (typeof window !== 'undefined' ? window.innerWidth : 0);
    if (containerWidth <= 0) return studioWidth;

    const visibleLeftWidth =
      ENABLE_INFINITE_CANVAS_WORKBENCH &&
      effectiveProjectId &&
      isSourcePanelCollapsed
        ? 0
        : sidebarWidth;
    const reservedResizers = visibleLeftWidth > 0 ? DOUBLE_RESIZER_WIDTH : 12;
    const maxByCenter =
      containerWidth -
      visibleLeftWidth -
      CENTER_PANEL_MIN_WIDTH_THREE_COLUMNS -
      reservedResizers;
    const maxWidth = Math.max(
      STUDIO_PANEL_MIN_WIDTH,
      Math.min(
        STUDIO_PANEL_MAX_WIDTH,
        PROJECT_AGENT_PANEL_MAX_WIDTH,
        Math.floor(containerWidth * PROJECT_AGENT_PANEL_MAX_RATIO),
        maxByCenter
      )
    );

    return clampGridWidth(studioWidth, STUDIO_PANEL_MIN_WIDTH, maxWidth);
  }, [
    effectiveProjectId,
    isSourcePanelCollapsed,
    sidebarWidth,
    studioWidth,
    workspaceContainerWidth
  ]);
  const handleBackToBoardsView = useCallback(() => {
    setCurrentProjectId(null);
    setViewMode('boards');
    navigate(getBoardsBasePath());
    // 切换到 boards 视图时，重新加载全局数据
    // 确保所有项目的缩略图都能正确显示
    loadSummaries(false, null);
  }, [loadSummaries, navigate, setCurrentProjectId, setViewMode]);
  const handleSelectProjectFromSwitcher = useCallback(
    (id: string | null) => {
      const projectUrl = buildStandaloneBoardsUrl({ projectId: id });
      setCurrentProjectId(id);
      setSelectedSummary(null);
      setViewMode('list');
      setMobileProjectPanel('canvas');
      navigate(projectUrl);
      loadSummaries(true, id);
    },
    [
      loadSummaries,
      navigate,
      setCurrentProjectId,
      setSelectedSummary,
      setViewMode
    ]
  );
  const handleOpenProjectFromBoardsOverview = useCallback(
    (id: string | null) => {
      if (!id || typeof window === 'undefined') return;

      const projectUrl = buildStandaloneBoardsUrl({ projectId: id });

      if (embeddedInCreate) {
        window.open(projectUrl, '_blank', 'noopener,noreferrer');
        return;
      }

      setCurrentProjectId(id);
      setSelectedSummary(null);
      setViewMode('list');
      setMobileProjectPanel('canvas');
      navigate(projectUrl);
      loadSummaries(true, id);
    },
    [
      embeddedInCreate,
      loadSummaries,
      navigate,
      setCurrentProjectId,
      setSelectedSummary,
      setViewMode
    ]
  );
  const mobileProjectTabs: Array<{
    id: MobileProjectPanel;
    label: string;
    icon: ComponentType<{ className?: string }>;
    count?: number;
  }> = [
    {
      id: 'canvas',
      label: '画布',
      icon: MousePointer2,
      count: selectedSummaries.length
    },
    {
      id: 'sources',
      label: selectedSummary ? '来源预览' : '来源素材',
      icon: Grid3X3,
      count: filteredSummaries.length
    },
    {
      id: 'ask',
      label: 'Agent',
      icon: Bot
    }
  ];
  const showWorkspaceSidebar =
    !isStandaloneBoardsPath(location.pathname) &&
    !embeddedInCreate &&
    (viewMode === 'boards' || viewMode === 'skills' || viewMode === 'trash');

  return (
    <div
      ref={containerRef}
      className={`workspace-shell-root ${
        embeddedInCreate
          ? 'workspace-shell-root--embedded'
          : 'workspace-shell-root--screen'
      }`}
    >
      {workspaceToast && (
        <div className="workspace-toast-layer">
          <div
            className={`workspace-toast ${
              workspaceToast.type === 'error'
                ? 'workspace-toast--error'
                : 'workspace-toast--success'
            }`}
            role={workspaceToast.type === 'error' ? 'alert' : 'status'}
            aria-live={workspaceToast.type === 'error' ? 'assertive' : 'polite'}
          >
            {workspaceToast.message}
          </div>
        </div>
      )}

      {/* WebtoMind 工作区侧边栏 - 桌面端显示完整导航 */}
      {showWorkspaceSidebar && (
        <aside className="workspace-shell-sidebar">
          <div className="workspace-shell-brand">
            <button
              onClick={() => {
                setViewMode('boards');
                navigate(getBoardsBasePath());
                // 确保显示全局数据
                loadSummaries(false, null);
              }}
              className="workspace-shell-brand-button"
            >
              <Logo size={32} />
              <span className="workspace-shell-brand-text">WebtoMind</span>
            </button>
          </div>

          {/* 搜索和新建项目按钮 */}
          <div className="workspace-shell-quick-actions">
            <button
              type="button"
              onClick={() => setShowSidebarSearch(true)}
              className="workspace-shell-action-button"
            >
              <Search className="workspace-shell-action-icon" />
              <span className="workspace-shell-action-label">
                {t('boards:boards.search', '搜索')}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                handleCreateProject(
                  t('boards:boards.defaultProjectName', '新建项目')
                ).then((project) => {
                  if (project) {
                    setCurrentProjectId(project.id);
                    setViewMode('list');
                    navigate(buildBoardsUrl({ projectId: project.id }));
                  }
                });
              }}
              className="workspace-shell-action-button"
            >
              <Plus className="workspace-shell-action-icon" />
              <span className="workspace-shell-action-label">
                {t('boards:boards.newProject', '新建项目')}
              </span>
            </button>
          </div>

          {/* 导航项 */}
          <nav className="workspace-shell-nav">
            <button
              onClick={() => {
                setViewMode('boards');
                navigate(getBoardsBasePath());
                // 确保显示全局数据
                loadSummaries(false, null);
              }}
              className={`workspace-shell-nav-button ${
                viewMode === 'boards'
                  ? 'workspace-shell-nav-button--active'
                  : ''
              }`}
            >
              <Layout className="workspace-shell-nav-icon" />
              <span>{t('boards:boards.title')}</span>
            </button>
            <button
              onClick={() => {
                navigate('/create');
              }}
              className="workspace-shell-nav-button"
            >
              <Wand2 className="workspace-shell-nav-icon" />
              <span>{t('boards:boards.create', '创作台')}</span>
            </button>

            {/* 收藏项目 */}
            {projects.filter((p) => p.favoritedAt).length > 0 && (
              <div className="workspace-shell-project-section">
                <h3 className="workspace-shell-project-section-title">
                  {t('boards:boards.favorites')}
                </h3>
                <div className="workspace-shell-project-list workspace-shell-project-list--favorites">
                  {projects
                    .filter((p) => p.favoritedAt)
                    .sort((a, b) => (b.favoritedAt || 0) - (a.favoritedAt || 0))
                    .map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setCurrentProjectId(p.id);
                          setViewMode('list');
                          navigate(buildBoardsUrl({ projectId: p.id }));
                        }}
                        className={`workspace-shell-project-button ${effectiveProjectId === p.id && viewMode !== 'boards' ? 'workspace-shell-project-button--active' : ''}`}
                      >
                        <span className="workspace-shell-project-icon">
                          {p.icon || '📁'}
                        </span>
                        <span className="workspace-shell-project-name">
                          {p.name || 'Untitled'}
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* 最近项目 */}
            <div className="workspace-shell-project-section">
              <h3 className="workspace-shell-project-section-title">
                {t('boards:boards.recent')}
              </h3>
              <div className="workspace-shell-project-list workspace-shell-project-list--recent">
                {projects
                  .filter((p) => !p.archivedAt)
                  .slice(0, 8)
                  .map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setCurrentProjectId(p.id);
                        setViewMode('list');
                        navigate(buildBoardsUrl({ projectId: p.id }));
                      }}
                      className={`workspace-shell-project-button ${effectiveProjectId === p.id && viewMode !== 'boards' ? 'workspace-shell-project-button--active' : ''}`}
                    >
                      <span className="workspace-shell-project-icon">
                        {p.icon || '📁'}
                      </span>
                      <span className="workspace-shell-project-name">
                        {p.name || 'Untitled'}
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          </nav>

          {/* 底部用户信息 */}
          <div className="workspace-shell-user-panel">
            <div
              className="workspace-shell-user-popover-anchor"
              ref={userPopoverRef}
            >
              <div
                onMouseEnter={() => setShowUserPopover(true)}
                onMouseLeave={() => setShowUserPopover(false)}
                className={`workspace-shell-user-trigger ${
                  showUserPopover ? 'workspace-shell-user-trigger--open' : ''
                }`}
                title={user?.email || 'User Settings'}
              >
                <div className="workspace-shell-user-summary">
                  <UserAvatar
                    user={user}
                    email={user?.email}
                    className="workspace-shell-avatar-sm"
                    imageClassName="workspace-shell-avatar-image"
                    loading="eager"
                    fetchPriority="high"
                    preload
                  />
                  <div className="workspace-shell-user-copy">
                    <span className="workspace-shell-user-name">
                      {user?.user_metadata?.full_name ||
                        user?.email?.split('@')[0] ||
                        'WebtoMind User'}
                    </span>
                    <div className="workspace-shell-user-plan-row">
                      <span
                        className={`workspace-shell-plan-badge workspace-shell-plan-badge--sm ${
                          subscription?.planName &&
                          subscription.planName !== 'free'
                            ? 'workspace-shell-plan-badge--paid'
                            : 'workspace-shell-plan-badge--free'
                        }`}
                      >
                        {subscription?.planName
                          ? subscription.planName === 'free'
                            ? 'Free'
                            : subscription.planName.toUpperCase()
                          : 'Free'}
                      </span>
                    </div>
                  </div>
                </div>
                <div
                  className={`workspace-shell-chevron-wrap ${
                    showUserPopover ? 'workspace-shell-chevron-wrap--open' : ''
                  }`}
                >
                  <ChevronRight className="workspace-shell-chevron" />
                </div>
              </div>

              {/* 用户信息浮窗 (Popover) - 包含在hover区域内 */}
              {/* 用户信息浮窗 (Popover) - 使用 CSS 控制显示，避免重新渲染导致头像重新加载 */}
              <div
                onMouseEnter={() => setShowUserPopover(true)}
                onMouseLeave={() => setShowUserPopover(false)}
                className={`workspace-shell-popover ${
                  showUserPopover
                    ? 'workspace-shell-popover--open'
                    : 'workspace-shell-popover--closed'
                }`}
              >
                {/* 透明连接桥 - 消除与触发器之间的间隙 */}
                <div className="workspace-shell-popover-bridge" />
                <div className="workspace-shell-popover-head">
                  <div className="workspace-shell-popover-user-row">
                    <UserAvatar
                      user={user}
                      email={user?.email}
                      className="workspace-shell-avatar-md"
                      imageClassName="workspace-shell-avatar-image"
                    />
                    <div className="workspace-shell-user-copy">
                      <div className="workspace-shell-popover-name-row">
                        <span className="workspace-shell-popover-name">
                          {user?.user_metadata?.full_name ||
                            user?.email?.split('@')[0] ||
                            'WebtoMind User'}
                        </span>
                        <span
                          className={`workspace-shell-plan-badge workspace-shell-plan-badge--sm ${
                            subscription?.planName &&
                            subscription.planName !== 'free'
                              ? 'workspace-shell-plan-badge--paid'
                              : 'workspace-shell-plan-badge--free-solid'
                          }`}
                        >
                          {subscription?.planName
                            ? subscription.planName === 'free'
                              ? 'Free'
                              : subscription.planName.toUpperCase()
                          : 'Free'}
                        </span>
                      </div>
                      <span className="workspace-shell-user-email">{user?.email}</span>
                    </div>
                  </div>

                  {/* 创始成员勋章 */}
                  {profile?.member_number_formatted && (
                    <div className="workspace-shell-founder-badge">
                      <Crown className="workspace-shell-founder-icon" />
                      创始成员 {profile.member_number_formatted}
                    </div>
                  )}
                </div>

                {/* 积分与套餐 */}
                <div className="workspace-shell-popover-body">
                  <div className="workspace-shell-credit-card">
                    {subscription?.planName &&
                    subscription.planName !== 'free' ? (
                      <>
                        {/* 付费会员：显示总积分 + 箭头链接 */}
                        <div className="workspace-shell-credit-row">
                          <span className="workspace-shell-credit-label">
                            当前积分
                          </span>
                          <div className="workspace-shell-user-plan-row">
                            <span className="workspace-shell-credit-value">
                              {credits?.total || 0}
                            </span>
                            <button
                              onClick={() => {
                                setShowPricing(true);
                                setShowUserPopover(false);
                              }}
                              className="workspace-shell-credit-link"
                              title="查看套餐"
                            >
                              <ChevronRight className="workspace-shell-credit-link-icon" />
                            </button>
                          </div>
                        </div>
                        <div className="workspace-shell-credit-row workspace-shell-credit-row--muted">
                          <span>邀请奖励: {credits?.referral || 0}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* 免费用户：显示每日免费积分 */}
                        <div className="workspace-shell-credit-row">
                          <span className="workspace-shell-credit-label">
                            每日免费积分
                          </span>
                          <span className="workspace-shell-credit-value">
                            {credits?.daily || 0}/{credits?.dailyMax ?? FREE_DAILY_CREDITS}
                          </span>
                        </div>
                        <div className="workspace-shell-progress-track">
                          <div
                            className="workspace-shell-progress-fill"
                            style={{
                              width: `${Math.min(100, ((credits?.daily || 0) / (credits?.dailyMax ?? FREE_DAILY_CREDITS)) * 100)}% `
                            }}
                          />
                        </div>
                        <div className="workspace-shell-credit-row workspace-shell-credit-row--muted">
                          <span>邀请奖励: {credits?.referral || 0}</span>
                          <span>总计: {credits?.total || 0}</span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* 只对免费用户显示升级按钮 */}
                  {(!subscription?.planName ||
                    subscription.planName === 'free') && (
                    <button
                      onClick={() => {
                        setShowPricing(true);
                        setShowUserPopover(false);
                      }}
                      className="workspace-shell-upgrade-button"
                    >
                      <Zap className="workspace-shell-upgrade-icon" />
                      升级专业版
                    </button>
                  )}
                </div>

                {/* 功能菜单 */}
                <div className="workspace-shell-menu">
                  <div className="workspace-shell-menu-grid">
                    <button
                      onClick={() => {
                        navigate(getSettingsBasePath());
                        setShowUserPopover(false);
                      }}
                      className="workspace-shell-menu-item"
                    >
                      <Settings className="workspace-shell-menu-icon workspace-shell-menu-icon--settings" />
                      <span>个人设置</span>
                    </button>
                    <button
                      onClick={() => {
                        setViewMode('trash');
                        setShowUserPopover(false);
                        navigate(buildBoardsViewUrl('trash'));
                      }}
                      className="workspace-shell-menu-item"
                    >
                      <Trash2 className="workspace-shell-menu-icon workspace-shell-menu-icon--trash" />
                      <span>回收站</span>
                    </button>
                    <div className="workspace-shell-menu-spacer" />
                    <button className="workspace-shell-menu-item">
                      <Download className="workspace-shell-menu-icon workspace-shell-menu-icon--download" />
                      <span>下载应用</span>
                    </button>
                    <a
                      href="https://chromewebstore.google.com/detail/webtomind/fjhopalhpkgfakchpphhonaofimflnon"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="workspace-shell-menu-item"
                    >
                      <Puzzle className="workspace-shell-menu-icon workspace-shell-menu-icon--plugin" />
                      <span>安装插件</span>
                    </a>
                    <div className="workspace-shell-menu-spacer" />
                    <button
                      onClick={() =>
                        window.open(
                          'https://webtomind.com/zh-CN/overview',
                          '_blank'
                        )
                      }
                      className="workspace-shell-menu-item"
                    >
                      <Home className="workspace-shell-menu-icon workspace-shell-menu-icon--home" />
                      <span>官网首页</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowContactModal(true);
                        setShowUserPopover(false);
                        setContactQrLoadFailed(false);
                      }}
                      className="workspace-shell-menu-item"
                    >
                      <MessageSquare className="workspace-shell-menu-icon workspace-shell-menu-icon--contact" />
                      <span>联系我们</span>
                    </button>
                  </div>
                </div>

                {/* 退出登录 */}
                <div className="workspace-shell-signout">
                  <button
                    onClick={() => signOut()}
                    className="workspace-shell-signout-button"
                  >
                    <LogOut className="workspace-shell-signout-icon" />
                    <span>退出登录</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </aside>
      )}

      {!embeddedInCreate && viewMode === 'boards' && (
        <header className="workspace-shell-mobile-header">
          <div className="workspace-shell-mobile-header-inner">
            <div className="workspace-shell-mobile-topbar">
              <button
                type="button"
                onClick={() => {
                  setViewMode('boards');
                  navigate(getBoardsBasePath());
                  loadSummaries(false, null);
                }}
                className="workspace-shell-mobile-brand-button"
                aria-label={t('boards:boards.title')}
              >
                <Logo size={34} className="workspace-shell-mobile-logo" />
                <div className="workspace-shell-mobile-brand-copy">
                  <div className="workspace-shell-mobile-kicker">
                    WebToMind
                  </div>
                  <div className="workspace-shell-mobile-title">
                    {t('boards:boards.title')}
                  </div>
                </div>
              </button>

              <div className="workspace-shell-mobile-actions">
                <button
                  type="button"
                  onClick={() => navigate('/create')}
                  className="workspace-shell-mobile-primary-action"
                >
                  <Wand2 className="workspace-shell-mobile-action-icon" />
                  <span>{t('boards:boards.create', '创意工作台')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate(getSettingsBasePath())}
                  className="workspace-shell-mobile-avatar-button"
                  aria-label="个人中心"
                  title="个人中心"
                >
                  <UserAvatar
                    user={user}
                    email={user?.email}
                    alt=""
                    className="workspace-shell-mobile-avatar"
                    imageClassName="workspace-shell-avatar-image"
                    loading="eager"
                    fetchPriority="high"
                    preload
                  />
                </button>
              </div>
            </div>

            <Navigation
              className="workspace-shell-mobile-nav"
              aria-label="移动端工作台导航"
              variant="mobile"
              density="compact"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              <NavigationList>
                <NavigationLink
                  as="button"
                  type="button"
                  isActive
                  icon={<Layout className="workspace-shell-mobile-nav-icon" />}
                  onClick={() => {
                    setViewMode('boards');
                    navigate(getBoardsBasePath());
                    loadSummaries(false, null);
                  }}
                >
                  {t('boards:boards.title')}
                </NavigationLink>
                <NavigationLink
                  as="button"
                  type="button"
                  icon={
                    <Settings className="workspace-shell-mobile-nav-icon" />
                  }
                  onClick={() => navigate(getSettingsBasePath())}
                >
                  个人中心
                </NavigationLink>
                <NavigationLink
                  as="button"
                  type="button"
                  icon={<Search className="workspace-shell-mobile-nav-icon" />}
                  onClick={() => setShowSidebarSearch(true)}
                >
                  {t('boards:boards.search', '搜索')}
                </NavigationLink>
              </NavigationList>
            </Navigation>
          </div>
        </header>
      )}

      {/* 主内容区：根据当前视图渲染对应页面 */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {isProjectRoutePending ? (
          <main className="flex-1 flex min-h-0 min-w-0 items-center justify-center overflow-hidden bg-[#f7f4ef] dark:bg-slate-950">
            <div className="rounded-3xl border border-stone-200 bg-white/85 px-6 py-5 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/85">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900 dark:border-slate-700 dark:border-t-white" />
              <div className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                正在打开项目画布...
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                正在同步项目状态
              </div>
            </div>
          </main>
        ) : viewMode === 'boards' ? (
          <main className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden bg-slate-50 dark:bg-slate-900">
            <Suspense
              fallback={
                <WorkspacePanelFallback className="flex-1 bg-slate-50 dark:bg-slate-900" />
              }
            >
              <BoardsOverview
                onSelectProject={handleOpenProjectFromBoardsOverview}
                onSelectSummary={handleEnterDetail}
                currentProjectId={currentProjectId}
                summaries={summaries}
                projects={projects}
                summariesLoading={loading}
                projectsLoading={projectsLoading}
                onCreateProject={handleCreateProject}
                onDeleteProject={handleDeleteProject}
                onFavoriteProject={handleFavoriteProject}
                onArchiveProject={handleArchiveProject}
                onUpdateProject={handleUpdateProject}
              />
            </Suspense>
          </main>
        ) : viewMode === 'skills' ? (
          <main className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden bg-slate-50 dark:bg-slate-900">
            <Suspense
              fallback={
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  技能加载中...
                </div>
              }
            >
              <SkillsPlaza
                shortcuts={shortcuts}
                summaries={summaries}
                catalog={skillCatalog}
                marketSkills={catalogMarketSkills}
                initialTab={skillsPlazaTab}
                onCreateSkill={handleCreateSkillFromPlaza}
                onUpdateSkill={handleUpdateSkillFromPlaza}
                onInstallMarketSkill={handleInstallMarketSkill}
                onDeleteSkill={handleDeleteSkillFromPlaza}
              />
            </Suspense>
          </main>
        ) : viewMode === 'trash' ? (
          <main className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden bg-slate-50 dark:bg-slate-900">
            <Suspense
              fallback={
                <WorkspacePanelFallback className="flex-1 bg-slate-50 dark:bg-slate-900" />
              }
            >
              <TrashPanel
                projects={projects}
                onRestore={() => {
                  // ???????????
                  loadSummaries(true, currentProjectId);
                }}
              />
            </Suspense>
          </main>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-slate-900">
            {embeddedInCreate &&
              createMiniNavProjectSlot &&
              createPortal(
                <WorkbenchProjectSwitcher
                  projectName={currentProjectName}
                  projects={projects}
                  currentProjectId={effectiveProjectId}
                  projectsLoading={projectsLoading}
                  onBack={handleBackToBoardsView}
                  onSelectProject={handleSelectProjectFromSwitcher}
                  showLogo={false}
                  showBackButton
                  className="create-mininav-project-switcher"
                />,
                createMiniNavProjectSlot
              )}
            {/* 工作台顶栏 - WebtoMind 风格 */}
            {!embeddedInCreate && (
              <WorkbenchTopbar
                projectName={currentProjectName}
                projects={projects}
                currentProjectId={effectiveProjectId}
                projectsLoading={projectsLoading}
                onBack={handleBackToBoardsView}
                onSelectProject={handleSelectProjectFromSwitcher}
                onShowPricing={() => setShowPricing(true)}
                onShowSettings={() => navigate(getSettingsBasePath())}
                profile={profile}
                credits={credits}
                subscription={subscription}
              />
            )}

            <section className="xl:hidden shrink-0 border-b border-slate-200 bg-white px-4 pb-3 pt-2 dark:border-slate-800 dark:bg-slate-900">
              <div
                className="mb-3 flex items-center gap-2 overflow-x-auto pb-0.5"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                <button
                  type="button"
                  onClick={() => navigate('/create')}
                  className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-slate-950 px-3.5 text-sm font-semibold text-white shadow-sm active:scale-95 dark:bg-white dark:text-slate-950"
                >
                  <Wand2 className="h-4 w-4" />
                  创意工作台
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileProjectPanel('sources');
                    setShowAddSourceModal(true);
                  }}
                  className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-sm active:scale-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <Plus className="h-4 w-4" />
                  添加来源
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileProjectPanel('sources');
                    setShowSearch(true);
                    setTimeout(() => searchInputRef.current?.focus(), 0);
                  }}
                  className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-sm active:scale-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <Search className="h-4 w-4" />
                  搜索
                </button>
                <button
                  type="button"
                  onClick={() => navigate(getSettingsBasePath())}
                  className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-sm active:scale-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <Settings className="h-4 w-4" />
                  个人中心
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
                {mobileProjectTabs.map((tab) => {
                  const Icon = tab.icon;
                  const active = mobileProjectPanel === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setMobileProjectPanel(tab.id)}
                      className={`flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-semibold transition-all ${
                        active
                          ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-950 dark:text-white'
                          : 'text-slate-500 active:bg-white/60 dark:text-slate-400 dark:active:bg-slate-700'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{tab.label}</span>
                      {typeof tab.count === 'number' && (
                        <span
                          className={`rounded-full px-1.5 text-[10px] leading-4 ${
                            active
                              ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                              : 'bg-white/70 text-slate-500 dark:bg-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {tab.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            <div className="flex-1 flex overflow-hidden relative">
              {/* 左侧: 总结列表 / 详情页 */}
              <aside
                className={`${ENABLE_INFINITE_CANVAS_WORKBENCH && isSourcePanelCollapsed ? 'hidden' : 'hidden xl:flex'} min-h-0 flex-col overflow-hidden bg-white dark:bg-slate-800 h-full flex-shrink-0 border-r border-slate-100 dark:border-slate-700 shadow-sm`}
                style={{ width: sidebarWidth }}
              >
                {viewMode === 'list' ? (
                  <>
                    <header className="px-4 py-3 border-b border-slate-50 dark:border-slate-700 flex-shrink-0 space-y-3">
                      {effectiveProjectId && !showSearch && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600 dark:text-blue-400">
                                Step 1 · Collect
                              </div>
                              <div className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                来源素材
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setShowAddSourceModal(true)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                添加来源
                              </button>
                              <button
                                type="button"
                                onClick={() => setIsSourcePanelCollapsed(true)}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                                title="收起素材栏"
                                aria-label="收起素材栏"
                              >
                                <PanelLeftClose className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {showSearch ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input
                              ref={searchInputRef}
                              type="text"
                              placeholder={
                                effectiveProjectId
                                  ? '搜索当前项目来源'
                                  : t('summaryList.searchPlaceholder')
                              }
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                              className="w-full pl-9 pr-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              autoFocus
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setShowSearch(false);
                              setSearchTerm('');
                            }}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            title={t('chat.close')}
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-3">
                          {/* 类型筛选按钮 */}
                          <div className="relative" ref={typeFilterRef}>
                            <button
                              type="button"
                              onClick={() => setShowTypeFilter(!showTypeFilter)}
                              className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                            >
                              <span>
                                {selectedTypes.length === 0
                                  ? effectiveProjectId
                                    ? '全部来源'
                                    : t('allTypes')
                                  : `${selectedTypes.length} ${t('typesSelected')} `}
                              </span>
                              <ChevronRight
                                className={`w-4 h-4 transition-transform ${showTypeFilter ? '-rotate-90' : 'rotate-90'}`}
                              />
                            </button>

                            {showTypeFilter && (
                              <div className="absolute left-0 top-full mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-2 min-w-[160px] z-50">
                                {CARD_TYPES.map((type) => (
                                  <label
                                    key={type.id}
                                    className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition-colors"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selectedTypes.includes(type.id)}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setSelectedTypes((prev) => [
                                            ...prev,
                                            type.id
                                          ]);
                                        } else {
                                          setSelectedTypes((prev) =>
                                            prev.filter(
                                              (t: string) => t !== type.id
                                            )
                                          );
                                        }
                                      }}
                                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-base">
                                      {type.icon}
                                    </span>
                                    <span className="text-sm text-slate-700 dark:text-slate-300">
                                      {type.label}
                                    </span>
                                  </label>
                                ))}
                                {selectedTypes.length > 0 && (
                                  <>
                                    <div className="my-1.5 border-t border-slate-100 dark:border-slate-700" />
                                    <button
                                      type="button"
                                      onClick={() => setSelectedTypes([])}
                                      className="w-full px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-left transition-colors"
                                    >
                                      {t('clearFilter')}
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setSummaryDisplayMode('cards')}
                              className={`p-1.5 rounded-lg transition-colors ${
                                summaryDisplayMode === 'cards'
                                  ? 'bg-slate-900 text-white'
                                  : 'text-muted-foreground hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                              }`}
                              title="瀑布流展示"
                            >
                              <Grid3X3 className="w-5 h-5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSummaryDisplayMode('list')}
                              className={`p-1.5 rounded-lg transition-colors ${
                                summaryDisplayMode === 'list'
                                  ? 'bg-slate-900 text-white'
                                  : 'text-muted-foreground hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                              }`}
                              title="列表展示"
                            >
                              <List className="w-5 h-5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowSearch(true);
                                setTimeout(
                                  () => searchInputRef.current?.focus(),
                                  0
                                );
                              }}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-white hover:bg-slate-700 transition-colors"
                              title={
                                effectiveProjectId
                                  ? '搜索当前项目来源'
                                  : t('summaryList.searchPlaceholder')
                              }
                            >
                              <Search className="w-5 h-5" />
                            </button>
                            <div className="relative" ref={addMenuRef}>
                              <button
                                type="button"
                                onClick={() => {
                                  if (effectiveProjectId) {
                                    setShowAddSourceModal(true);
                                  } else {
                                    setShowAddMenu(!showAddMenu);
                                  }
                                }}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                title={
                                  effectiveProjectId ? '添加来源' : t('app.add')
                                }
                              >
                                <Plus className="w-5 h-5" />
                              </button>
                              {!effectiveProjectId && showAddMenu && (
                                <div className="absolute right-0 top-full mt-1 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 py-1.5 min-w-[140px] z-20">
                                  <button
                                    type="button"
                                    onClick={handleCreateNote}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors font-medium"
                                  >
                                    <FileText className="w-4 h-4" />
                                    {t('app.createNote')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleUploadImage}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors font-medium"
                                  >
                                    <ImageIcon className="w-4 h-4" />
                                    {t('app.uploadImage')}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </header>

                    <SummaryList
                      summaries={filteredSummaries}
                      loading={loading}
                      onEnterDetail={handleEnterDetail}
                      displayMode={summaryDisplayMode}
                      selectedIds={selectedSummaryIds}
                      onToggleSelect={toggleSummarySelect}
                      onToggleSelectAll={selectAllVisibleSummaries}
                      onRenameSummary={handleRenameSummary}
                      onDeleteSummary={handleDeleteSummary}
                      onRefresh={() => loadSummaries(true, effectiveProjectId)}
                      containerWidth={sidebarWidth}
                      searchTerm={searchTerm}
                      onFilesDrop={handleFilesDropToList}
                      hasMore={hasMoreSummaries}
                      onLoadMore={() => loadMoreSummaries(effectiveProjectId)}
                      loadingMore={loadingMore}
                      dragToCanvasEnabled={
                        ENABLE_INFINITE_CANVAS_WORKBENCH && !!effectiveProjectId
                      }
                    />
                  </>
                ) : (
                  selectedSummary && (
                    <ErrorBoundary fallback={<div />}>
                      <div className="flex h-full flex-col">
                        {effectiveProjectId && (
                          <div className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/50 px-4 py-3">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
                              Preview
                            </div>
                            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                              来源预览
                            </div>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              快速查看当前来源内容；返回后仍可继续在画布编排，或让右侧
                              Agent 基于节点继续创作。
                            </p>
                          </div>
                        )}
                        <SummaryDetail
                          summary={selectedSummary}
                          onBack={handleBackToList}
                          onSelectionChange={handleSelectionChange}
                          onSave={handleSaveSummary}
                          onRename={handleRenameSummary}
                          onDelete={handleDeleteSummary}
                          isLoading={isDetailLoading}
                          subscription={subscription}
                        />
                      </div>
                    </ErrorBoundary>
                  )
                )}
              </aside>

              {/* 可拖拽分割线 - 增强交互热区 */}
              <div
                onMouseDown={handleMouseDown}
                className={`${ENABLE_INFINITE_CANVAS_WORKBENCH && isSourcePanelCollapsed ? 'hidden' : 'hidden xl:flex'} flex-col relative w-3 group/resizer cursor-col-resize flex-shrink-0 z-10`}
              >
                {/* 视觉上的细线 */}
                <div
                  className={`absolute inset-y-0 left-1/2 -translate-x-1/2 w-[1px] bg-slate-200 dark:bg-slate-700 group-hover/resizer:bg-blue-500 transition-colors ${isDragging ? 'bg-blue-500' : ''}`}
                />
                {/* 悬停时的加宽提示 */}
                <div className="absolute inset-y-0 inset-x-0 bg-transparent group-hover/resizer:bg-blue-500/5 transition-colors" />
              </div>

              <section
                className={`${mobileProjectPanel === 'sources' ? 'flex' : 'hidden'} xl:hidden flex-1 min-h-0 flex-col bg-white dark:bg-slate-800`}
              >
                {viewMode === 'list' ? (
                  <>
                    <header className="shrink-0 border-b border-slate-100 px-4 py-3 dark:border-slate-700">
                      {showSearch ? (
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                            <input
                              ref={searchInputRef}
                              type="text"
                              placeholder={
                                effectiveProjectId
                                  ? '搜索当前项目来源'
                                  : t('summaryList.searchPlaceholder')
                              }
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
                              autoFocus
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setShowSearch(false);
                              setSearchTerm('');
                            }}
                            className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                            title={t('chat.close')}
                          >
                            <X className="h-5 w-5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                              Step 1 · Collect
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                              <Grid3X3 className="h-4 w-4 text-slate-500" />
                              来源素材
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                                {filteredSummaries.length}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setSummaryDisplayMode('cards')}
                              className={`rounded-xl p-2 transition-colors ${
                                summaryDisplayMode === 'cards'
                                  ? 'bg-slate-900 text-white'
                                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-700 dark:hover:text-slate-100'
                              }`}
                              title="瀑布流展示"
                            >
                              <Grid3X3 className="h-5 w-5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSummaryDisplayMode('list')}
                              className={`rounded-xl p-2 transition-colors ${
                                summaryDisplayMode === 'list'
                                  ? 'bg-slate-900 text-white'
                                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-700 dark:hover:text-slate-100'
                              }`}
                              title="列表展示"
                            >
                              <List className="h-5 w-5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </header>
                    <SummaryList
                      summaries={filteredSummaries}
                      loading={loading}
                      onEnterDetail={handleEnterDetail}
                      displayMode={summaryDisplayMode}
                      layoutDensity="mobile"
                      selectedIds={selectedSummaryIds}
                      onToggleSelect={toggleSummarySelect}
                      onToggleSelectAll={selectAllVisibleSummaries}
                      onRenameSummary={handleRenameSummary}
                      onDeleteSummary={handleDeleteSummary}
                      onRefresh={() => loadSummaries(true, effectiveProjectId)}
                      searchTerm={searchTerm}
                      onFilesDrop={handleFilesDropToList}
                      hasMore={hasMoreSummaries}
                      onLoadMore={() => loadMoreSummaries(effectiveProjectId)}
                      loadingMore={loadingMore}
                      dragToCanvasEnabled={
                        ENABLE_INFINITE_CANVAS_WORKBENCH && !!effectiveProjectId
                      }
                    />
                  </>
                ) : (
                  selectedSummary && (
                    <ErrorBoundary
                      fallback={
                        <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                          <div className="mb-4 font-medium text-red-500">
                            {t('app.detailError')}
                          </div>
                          <button
                            type="button"
                            onClick={handleBackToList}
                            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                          >
                            {t('app.backToList')}
                          </button>
                        </div>
                      }
                    >
                      <SummaryDetail
                        summary={selectedSummary}
                        onBack={handleBackToList}
                        onSelectionChange={handleSelectionChange}
                        onSave={handleSaveSummary}
                        onRename={handleRenameSummary}
                        onDelete={handleDeleteSummary}
                        isLoading={isDetailLoading}
                        subscription={subscription}
                      />
                    </ErrorBoundary>
                  )
                )}
              </section>

              {ENABLE_INFINITE_CANVAS_WORKBENCH && effectiveProjectId ? (
                <>
                  <main
                    className={`${mobileProjectPanel === 'canvas' ? 'flex' : 'hidden'} xl:flex h-full flex-1 flex-col min-h-0 min-w-0 overflow-hidden`}
                  >
                    <ErrorBoundary fallback={<div />}>
                      <Suspense
                        fallback={
                          <WorkspacePanelFallback className="flex-1 bg-[#f7f4ef] dark:bg-slate-950" />
                        }
                      >
                        <InfiniteCanvasBoard
                          key={effectiveProjectId}
                          projectName={currentProjectName}
                          summaries={currentProjectSourceSummaries}
                          canvasState={canvasProjectState}
                          activeNodeIds={activeCanvasNodeIds}
                          onToggleNodeActive={toggleCanvasNodeActive}
                          onOpenSummary={(summary) => {
                            handleEnterDetail(summary);
                            setMobileProjectPanel('sources');
                          }}
                          onRemoveNode={removeCanvasNode}
                          onImportNodeIds={addCanvasNodeIds}
                          onReplaceNodeIds={replaceCanvasNodeIds}
                          onCanvasStateChange={updateCanvasProjectState}
                          onRequestGenerateImage={requestCanvasImageGeneration}
                          sourcePanelCollapsed={isSourcePanelCollapsed}
                          agentPanelCollapsed={isAgentPanelCollapsed}
                          onOpenSourcePanel={() => {
                            setIsSourcePanelCollapsed(false);
                            setMobileProjectPanel('sources');
                          }}
                          onOpenAgentPanel={() => {
                            setIsAgentPanelCollapsed(false);
                            setMobileProjectPanel('ask');
                          }}
                        />
                      </Suspense>
                    </ErrorBoundary>
                  </main>

                  {!isAgentPanelCollapsed && (
                    <div
                      onMouseDown={handleStudioMouseDown}
                      className="hidden xl:flex flex-col relative w-3 group/studio-resizer cursor-col-resize flex-shrink-0 z-10"
                    >
                      <div
                        className={`absolute inset-y-0 left-1/2 -translate-x-1/2 w-[1px] bg-slate-200 dark:bg-slate-700 group-hover/studio-resizer:bg-blue-500 transition-colors ${
                          isDragging && dragTarget === 'studio'
                            ? 'bg-blue-500'
                            : ''
                        }`}
                      />
                      <div className="absolute inset-y-0 inset-x-0 bg-transparent group-hover/studio-resizer:bg-blue-500/5 transition-colors" />
                    </div>
                  )}

                  <aside
                    className={`${mobileProjectPanel === 'ask' ? 'flex' : 'hidden'} ${isAgentPanelCollapsed ? 'xl:hidden' : 'xl:flex'} w-full flex-col min-h-0 min-w-0 flex-shrink-0 overflow-hidden border-l border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900 xl:min-w-[224px] xl:w-[var(--agent-panel-width)]`}
                    style={
                      {
                        '--agent-panel-width': `${projectAgentPanelWidth}px`
                      } as CSSProperties
                    }
                  >
                    <ErrorBoundary fallback={<div />}>
                      <ChatArea
                        selectedSummary={selectedSummary}
                        references={canvasAgentReferences}
                        summaries={canvasSummaries}
                        shortcuts={shortcuts}
                        variant="projectWorkspace"
                        pendingSkill={pendingProjectSkill}
                        onConsumePendingSkill={() =>
                          setPendingProjectSkill(null)
                        }
                        currentProjectId={effectiveProjectId}
                        onAddReferences={handleAddReferences}
                        onRemoveReference={handleRemoveReference}
                        onReferenceClick={handleReferenceClick}
                        onOpenSkills={(tab) => {
                          setViewMode('skills');
                          setSkillsPlazaTab(tab);
                          navigate(buildBoardsViewUrl('skills'));
                          void loadShortcuts(true);
                        }}
                        onCreateSkill={handleCreateSkillFromPlaza}
                        onRefreshSummaries={loadSummaries}
                        onAddPendingSummary={handleAddPendingSummary}
                        onUpdatePendingSummary={handleUpdatePendingSummary}
                        onRemovePendingSummary={handleRemovePendingSummary}
                        onSaveToStudioNote={handleSaveChatToStudio}
                        onSaveGeneratedImageToCanvas={
                          saveGeneratedImageToCanvas
                        }
                        onShowPricing={() => setShowPricing(true)}
                        onCollapsePanel={() => setIsAgentPanelCollapsed(true)}
                        isAuthReady={isAuthReady}
                      />
                    </ErrorBoundary>
                  </aside>
                </>
              ) : (
                <main
                  className={`${mobileProjectPanel === 'ask' ? 'flex' : 'hidden'} md:flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden`}
                >
                  <ErrorBoundary fallback={<div />}>
                    <ChatArea
                      selectedSummary={selectedSummary}
                      references={allReferences}
                      summaries={summaries}
                      shortcuts={shortcuts}
                      variant={
                        effectiveProjectId ? 'projectWorkspace' : 'default'
                      }
                      pendingSkill={pendingProjectSkill}
                      onConsumePendingSkill={() => setPendingProjectSkill(null)}
                      currentProjectId={effectiveProjectId}
                      onAddReferences={handleAddReferences}
                      onRemoveReference={handleRemoveReference}
                      onReferenceClick={handleReferenceClick}
                      onOpenSkills={(tab) => {
                        setViewMode('skills');
                        setSkillsPlazaTab(tab);
                        navigate(buildBoardsViewUrl('skills'));
                        void loadShortcuts(true);
                      }}
                      onCreateSkill={handleCreateSkillFromPlaza}
                      onRefreshSummaries={loadSummaries}
                      onAddPendingSummary={handleAddPendingSummary}
                      onUpdatePendingSummary={handleUpdatePendingSummary}
                      onRemovePendingSummary={handleRemovePendingSummary}
                      onSaveToStudioNote={handleSaveChatToStudio}
                      onShowPricing={() => setShowPricing(true)}
                      isAuthReady={isAuthReady}
                    />
                  </ErrorBoundary>
                </main>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 设置页面 - z-index 50，低于升级页的 z-100 */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-white dark:bg-slate-900 overflow-auto">
          <ErrorBoundary
            fallback={
              <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center bg-white dark:bg-slate-900">
                <div className="text-red-500 mb-4 font-medium">
                  {t('app.detailError')}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowSettings(false);
                    setPricingReturnTo(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                >
                  {t('settings.back')}
                </button>
              </div>
            }
          >
            <Suspense
              fallback={
                <WorkspacePanelFallback className="min-h-screen bg-white dark:bg-slate-900" />
              }
            >
              <SettingsPage
                onBack={() => {
                  setShowSettings(false);
                  setPricingReturnTo(null);
                }}
                onShowPricing={() => {
                  setPricingReturnTo('settings');
                  setShowPricing(true);
                }}
                profile={profile}
                credits={credits}
                subscription={subscription}
              />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}

      {/* 计费/套餐管理界面 - z-index 100，覆盖在设置页上面 */}
      {showPricing && (
        <Suspense
          fallback={
            <WorkspacePanelFallback className="fixed inset-0 z-[100] bg-white dark:bg-slate-900" />
          }
        >
          <PricingPage
            onClose={() => {
              setShowPricing(false);
              // ?????????????????????????????showSettings ????????
              // ?????? pricingReturnTo ???
              if (pricingReturnTo === 'settings') {
                setPricingReturnTo(null);
              }
            }}
          />
        </Suspense>
      )}

      {/* 侧边栏全局搜索弹窗 */}
      {showSidebarSearch && (
        <Suspense fallback={null}>
          <GlobalSearchModal
            isOpen={showSidebarSearch}
            onClose={() => setShowSidebarSearch(false)}
            onSelectResult={(summary) => {
              setShowSidebarSearch(false);
              handleEnterDetail(summary);
            }}
            summaries={summaries}
            projects={projects}
          />
        </Suspense>
      )}

      {showContactModal && (
        <div
          className="fixed inset-0 z-[120] bg-slate-950/65 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowContactModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label="联系我们"
        >
          <div
            className="w-full max-w-[420px] rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/50 overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-700/80 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  联系我们
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  扫码添加微信，反馈问题或合作咨询
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowContactModal(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-slate-200 hover:bg-slate-800 transition-colors"
                aria-label="关闭联系我们弹窗"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5">
              {!contactQrLoadFailed ? (
                <img
                  src={CONTACT_WECHAT_QR_URL}
                  alt="微信联系二维码"
                  className="w-full rounded-xl border border-slate-700 bg-white"
                  onError={() => setContactQrLoadFailed(true)}
                />
              ) : (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-5 text-sm text-amber-200 leading-relaxed">
                  未找到二维码图片。请将二维码文件放到
                  <code className="mx-1 text-amber-100">
                    public/contact/wechat-qr.jpg
                  </code>
                  后刷新页面。
                </div>
              )}

              <p className="mt-4 text-xs text-muted-foreground leading-relaxed text-center">
                扫一扫上面的二维码图案，加我为朋友。
              </p>
            </div>
          </div>
        </div>
      )}
      {/* 添加来源弹窗 */}
      {showAddSourceModal && effectiveProjectId && (
        <AddSourceModal
          projectId={effectiveProjectId}
          onClose={() => setShowAddSourceModal(false)}
          onImportComplete={() => {
            loadSummaries(true, effectiveProjectId);
          }}
          onUploadFiles={handleUploadImage}
        />
      )}
    </div>
  );
}

export default App;
