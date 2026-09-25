import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from 'react';
import {
  Bot,
  Check,
  Download,
  FileText,
  Image as ImageIcon,
  ImagePlus,
  Maximize2,
  MousePointer2,
  PanelLeftOpen,
  Redo2,
  RotateCcw,
  Search,
  Sparkles,
  StickyNote,
  Trash2,
  Undo2,
  Upload,
  Waypoints,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import type { SavedSummary } from '@/services/database';
import {
  ToolcraftActionButton,
  ToolcraftFloatingToolbar,
  ToolcraftSliderControl
} from '@/shared/ui';
import { WorkspaceConnectionPath } from '../canvas/components/WorkspaceCanvasConnections';
import { WorkspaceInfiniteCanvas } from '../canvas/components/WorkspaceInfiniteCanvas';
import { WorkspaceCanvasMinimap } from '../canvas/components/WorkspaceCanvasMinimap';
import {
  deriveVisualSummaryDisplay,
  extractVisualSummaryFallbackImageUrl
} from '../utils/visual-summary';
import {
  CanvasNodeType,
  type CanvasAnnotationKind,
  type CanvasConnection,
  type CanvasCustomNode,
  type CanvasNodeData,
  type CanvasNodeSize,
  type CanvasProjectState,
  type Position,
  type ViewportTransform
} from '../canvas/types';

interface InfiniteCanvasBoardProps {
  projectName: string;
  summaries: SavedSummary[];
  canvasState: CanvasProjectState;
  activeNodeIds: string[];
  onToggleNodeActive: (id: string) => void;
  onOpenSummary: (summary: SavedSummary) => void;
  onRemoveNode: (id: string) => void;
  onImportNodeIds: (
    ids: string[],
    statePatch?: Partial<CanvasProjectState>
  ) => void;
  onReplaceNodeIds: (
    ids: string[],
    statePatch?: Partial<CanvasProjectState>
  ) => void;
  onCanvasStateChange: (statePatch: Partial<CanvasProjectState>) => void;
  onRequestGenerateImage?: (node: CanvasCustomNode) => void;
  sourcePanelCollapsed: boolean;
  agentPanelCollapsed: boolean;
  onOpenSourcePanel: () => void;
  onOpenAgentPanel: () => void;
}

interface CanvasSnapshot {
  nodeIds: string[];
  activeNodeIds: string[];
  positions: CanvasProjectState['positions'];
  sizes: CanvasProjectState['sizes'];
  connections: CanvasConnection[];
  viewport: ViewportTransform;
  customNodes: Record<string, CanvasCustomNode>;
  selectedNodeId?: string;
}

interface DragState {
  kind: 'node' | 'resize';
  pointerId: number;
  startClientX: number;
  startClientY: number;
  nodeId?: string;
  nodeStartX?: number;
  nodeStartY?: number;
  nodeStartWidth?: number;
  nodeStartHeight?: number;
}

const NODE_WIDTH = 264;
const NODE_HEIGHT = 176;
const MIN_NODE_WIDTH = 220;
const MAX_NODE_WIDTH = 440;
const MIN_NODE_HEIGHT = 156;
const MAX_NODE_HEIGHT = 380;
const NODE_GAP_X = 72;
const NODE_GAP_Y = 62;
const AI_HOLDER_WIDTH = 320;
const AI_HOLDER_HEIGHT = 220;
const AI_HOLDER_TARGET_WIDTH = 1024;
const AI_HOLDER_TARGET_HEIGHT = 1024;
const AI_HOLDER_TARGET_MIN = 16;
const AI_HOLDER_TARGET_MAX = 8192;
const AI_HOLDER_ASPECT_PRESETS = [
  '1:1',
  '3:2',
  '2:3',
  '4:3',
  '3:4',
  '16:9',
  '9:16'
];
const ANNOTATION_WIDTH = 280;
const ANNOTATION_HEIGHT = 164;
const MIN_SCALE = 0.42;
const MAX_SCALE = 1.6;
const CANVAS_SUMMARY_DRAG_TYPE = 'application/x-webtomind-summary-id';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getMetadataString(
  metadata: SavedSummary['metadata'],
  keys: string[]
): string | null {
  if (!metadata) return null;
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function getSummaryImageUrl(summary: SavedSummary): string | null {
  const visualDisplay = deriveVisualSummaryDisplay(summary);
  return (
    visualDisplay.displayUrl ||
    visualDisplay.candidates[0] ||
    getMetadataString(summary.metadata, [
      'displayUrl',
      'display_url',
      'previewUrl',
      'preview_url',
      'thumbnailUrl',
      'thumbnail_url',
      'imageUrl',
      'image_url',
      'originalUrl',
      'original_url',
      'sourceUrl',
      'source_url'
    ]) ||
    extractVisualSummaryFallbackImageUrl(summary.markdown, summary.url)
  );
}

function toPlainText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/\[[^\]]+]\([^)]+\)/g, (match) => match.slice(1).split('](')[0])
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_`~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getSummaryKind(summary: SavedSummary): 'image' | 'text' {
  if (summary.contentType === 'image') return 'image';
  return getSummaryImageUrl(summary) ? 'image' : 'text';
}

function buildInitialPosition(index: number): Position {
  const column = index % 4;
  const row = Math.floor(index / 4);
  return {
    x: column * (NODE_WIDTH + NODE_GAP_X) + (row % 2) * 34,
    y: row * (NODE_HEIGHT + NODE_GAP_Y) + (column % 2) * 22
  };
}

function defaultNodeSize(): CanvasNodeSize {
  return { width: NODE_WIDTH, height: NODE_HEIGHT };
}

function createConnectionId(from: string, to: string): string {
  return `${from}:${to}:${Date.now().toString(36)}`;
}

function createCustomNodeId(type: CanvasCustomNode['type']): string {
  return `${type}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function parseAspectRatioValue(ratio?: string): number {
  const [rawWidth, rawHeight] = (ratio || '1:1').split(':').map(Number);
  if (!Number.isFinite(rawWidth) || !Number.isFinite(rawHeight) || rawHeight <= 0) {
    return 1;
  }
  return rawWidth / rawHeight;
}

function getHolderAspectRatio(node?: CanvasCustomNode): string {
  return node?.aspectRatio || node?.aspectPreset || '1:1';
}

function getHolderTargetWidth(node?: CanvasCustomNode): number {
  return clamp(
    Number.isFinite(node?.targetWidth) ? Number(node?.targetWidth) : AI_HOLDER_TARGET_WIDTH,
    AI_HOLDER_TARGET_MIN,
    AI_HOLDER_TARGET_MAX
  );
}

function getHolderTargetHeight(node?: CanvasCustomNode): number {
  return clamp(
    Number.isFinite(node?.targetHeight)
      ? Number(node?.targetHeight)
      : AI_HOLDER_TARGET_HEIGHT,
    AI_HOLDER_TARGET_MIN,
    AI_HOLDER_TARGET_MAX
  );
}

function getAnnotationKindLabel(kind?: CanvasAnnotationKind): string {
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

function normalizeConnectionsForNodes(
  value: unknown,
  allowedNodeIds: Set<string>
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
        return null;
      }
      const key = `${fromNodeId}->${toNodeId}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        id:
          typeof raw.id === 'string'
            ? raw.id
            : createConnectionId(fromNodeId, toNodeId),
        fromNodeId,
        toNodeId
      };
    })
    .filter((connection): connection is CanvasConnection =>
      Boolean(connection)
    );
}

export function InfiniteCanvasBoard({
  projectName,
  summaries,
  canvasState,
  activeNodeIds,
  onToggleNodeActive,
  onOpenSummary,
  onRemoveNode,
  onImportNodeIds,
  onReplaceNodeIds,
  onCanvasStateChange,
  onRequestGenerateImage,
  sourcePanelCollapsed,
  agentPanelCollapsed,
  onOpenSourcePanel,
  onOpenAgentPanel
}: InfiniteCanvasBoardProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const pendingDragSnapshotRef = useRef<CanvasSnapshot | null>(null);
  const dragHistoryCommittedRef = useRef(false);
  const [scale, setScale] = useState(() =>
    clamp(canvasState.viewport?.k ?? 0.82, MIN_SCALE, MAX_SCALE)
  );
  const [offset, setOffset] = useState(() =>
    canvasState.viewport
      ? { x: canvasState.viewport.x, y: canvasState.viewport.y }
      : { x: 112, y: 72 }
  );
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [positions, setPositions] = useState<CanvasProjectState['positions']>(
    () => canvasState.positions || {}
  );
  const [nodeSizes, setNodeSizes] = useState<CanvasProjectState['sizes']>(
    () => canvasState.sizes || {}
  );
  const [connections, setConnections] = useState<CanvasConnection[]>(
    () => canvasState.connections || []
  );
  const [history, setHistory] = useState<CanvasSnapshot[]>([]);
  const [future, setFuture] = useState<CanvasSnapshot[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [connectionMode, setConnectionMode] = useState(false);
  const [connectionStartId, setConnectionStartId] = useState<string | null>(
    null
  );
  const summaryById = useMemo(
    () => new Map(summaries.map((summary) => [summary.id, summary])),
    [summaries]
  );
  const summaryIds = useMemo(
    () => canvasState.nodeIds.filter((id) => summaryById.has(id)),
    [canvasState.nodeIds, summaryById]
  );
  const customNodes = useMemo(
    () => canvasState.customNodes || {},
    [canvasState.customNodes]
  );
  const customNodeIds = useMemo(() => Object.keys(customNodes), [customNodes]);
  const allNodeIds = useMemo(
    () => [...summaryIds, ...customNodeIds],
    [customNodeIds, summaryIds]
  );
  const canvasNodeCount = allNodeIds.length;
  const selectedCount = activeNodeIds.filter((id) =>
    allNodeIds.includes(id)
  ).length;
  const allNodeIdSet = useMemo(() => new Set(allNodeIds), [allNodeIds]);
  const selectedConnection = useMemo(
    () => connections.find((connection) => connection.id === activeNodeId),
    [activeNodeId, connections]
  );

  const selectNode = useCallback(
    (nodeId: string | null) => {
      setActiveNodeId(nodeId);
      onCanvasStateChange({ selectedNodeId: nodeId || undefined });
    },
    [onCanvasStateChange]
  );

  useEffect(() => {
    if (
      canvasState.selectedNodeId &&
      allNodeIdSet.has(canvasState.selectedNodeId)
    ) {
      setActiveNodeId(canvasState.selectedNodeId);
    }
  }, [allNodeIdSet, canvasState.selectedNodeId]);

  const makeSnapshot = useCallback(
    (): CanvasSnapshot => ({
      nodeIds: summaryIds,
      activeNodeIds: activeNodeIds.filter((id) => allNodeIds.includes(id)),
      positions,
      sizes: nodeSizes,
      connections,
      viewport: { x: offset.x, y: offset.y, k: scale },
      customNodes: canvasState.customNodes || {},
      selectedNodeId: canvasState.selectedNodeId
    }),
    [
      activeNodeIds,
      canvasState.customNodes,
      canvasState.selectedNodeId,
      connections,
      nodeSizes,
      offset.x,
      offset.y,
      positions,
      scale,
      allNodeIds,
      summaryIds
    ]
  );

  const pushSnapshotToHistory = useCallback((snapshot: CanvasSnapshot) => {
    setHistory((prev) => [...prev.slice(-24), snapshot]);
    setFuture([]);
  }, []);

  const pushHistory = useCallback(() => {
    pushSnapshotToHistory(makeSnapshot());
  }, [makeSnapshot, pushSnapshotToHistory]);

  const startDragHistory = useCallback(() => {
    pendingDragSnapshotRef.current = makeSnapshot();
    dragHistoryCommittedRef.current = false;
  }, [makeSnapshot]);

  const commitDragHistoryIfNeeded = useCallback(
    (deltaX: number, deltaY: number) => {
      if (dragHistoryCommittedRef.current) return;
      if (Math.abs(deltaX) < 3 && Math.abs(deltaY) < 3) return;
      const snapshot = pendingDragSnapshotRef.current;
      if (!snapshot) return;
      pushSnapshotToHistory(snapshot);
      dragHistoryCommittedRef.current = true;
    },
    [pushSnapshotToHistory]
  );

  const applySnapshot = useCallback(
    (snapshot: CanvasSnapshot) => {
      onReplaceNodeIds(snapshot.nodeIds || [], {
        activeNodeIds: snapshot.activeNodeIds || snapshot.nodeIds || [],
        positions: snapshot.positions,
        sizes: snapshot.sizes,
        connections: snapshot.connections,
        viewport: snapshot.viewport,
        customNodes: snapshot.customNodes,
        selectedNodeId: snapshot.selectedNodeId
      });
      setPositions(snapshot.positions);
      setNodeSizes(snapshot.sizes);
      setConnections(snapshot.connections);
      setScale(clamp(snapshot.viewport?.k ?? 0.82, MIN_SCALE, MAX_SCALE));
      setOffset(
        snapshot.viewport
          ? { x: snapshot.viewport.x, y: snapshot.viewport.y }
          : { x: 112, y: 72 }
      );
      setConnectionStartId(null);
    },
    [onReplaceNodeIds]
  );

  useEffect(() => {
    setPositions((prev) => {
      const next: Record<string, Position> = {};
      summaryIds.forEach((id, index) => {
        next[id] = prev[id] || buildInitialPosition(index);
      });
      customNodeIds.forEach((id, index) => {
        next[id] =
          prev[id] ||
          canvasState.positions?.[id] ||
          buildInitialPosition(summaries.length + index);
      });
      return next;
    });
    setNodeSizes((prev) => {
      const next: Record<string, CanvasNodeSize> = {};
      summaryIds.forEach((id) => {
        next[id] = prev[id] || defaultNodeSize();
      });
      customNodeIds.forEach((id) => {
        const customNode = customNodes[id];
        next[id] =
          prev[id] ||
          canvasState.sizes?.[id] ||
          (customNode?.type === 'ai_image_holder'
            ? { width: AI_HOLDER_WIDTH, height: AI_HOLDER_HEIGHT }
            : { width: ANNOTATION_WIDTH, height: ANNOTATION_HEIGHT });
      });
      return next;
    });
  }, [
    canvasState.positions,
    canvasState.sizes,
    customNodeIds,
    customNodes,
    summaries.length,
    summaryIds
  ]);

  useEffect(() => {
    setConnections((prev) =>
      prev.filter(
        (connection) =>
          allNodeIdSet.has(connection.fromNodeId) &&
          allNodeIdSet.has(connection.toNodeId)
      )
    );
  }, [allNodeIdSet]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onCanvasStateChange({
        positions,
        sizes: nodeSizes,
        connections: normalizeConnectionsForNodes(connections, allNodeIdSet),
        viewport: { x: offset.x, y: offset.y, k: scale }
      });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [
    allNodeIdSet,
    connections,
    nodeSizes,
    offset.x,
    offset.y,
    onCanvasStateChange,
    positions,
    scale
  ]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const updateSize = () => {
      setViewportSize({
        width: element.clientWidth,
        height: element.clientHeight
      });
    };
    updateSize();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }

    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const viewport = useMemo<ViewportTransform>(
    () => ({ x: offset.x, y: offset.y, k: scale }),
    [offset.x, offset.y, scale]
  );

  const applyViewport = useCallback((nextViewport: ViewportTransform) => {
    setOffset({ x: nextViewport.x, y: nextViewport.y });
    setScale(clamp(nextViewport.k, MIN_SCALE, MAX_SCALE));
  }, []);

  const canvasNodes = useMemo<CanvasNodeData[]>(() => {
    const summaryNodes = summaryIds
      .map((id) => summaryById.get(id))
      .filter((summary): summary is SavedSummary => Boolean(summary))
      .map((summary, index) => {
        const size = nodeSizes[summary.id] || defaultNodeSize();
        return {
          id: summary.id,
          type:
            getSummaryKind(summary) === 'image'
              ? CanvasNodeType.Image
              : CanvasNodeType.Text,
          title: summary.title || '未命名素材',
          position: positions[summary.id] || buildInitialPosition(index),
          width: size.width,
          height: size.height,
          metadata: {
            content: summary.markdown,
            sourceSummaryId: summary.id
          }
        };
      });

    const customNodesList = Object.values(customNodes).map((node, index) => {
      const size =
        nodeSizes[node.id] ||
        (node.type === 'ai_image_holder'
          ? { width: AI_HOLDER_WIDTH, height: AI_HOLDER_HEIGHT }
          : { width: ANNOTATION_WIDTH, height: ANNOTATION_HEIGHT });
      return {
        id: node.id,
        type:
          node.type === 'ai_image_holder'
            ? CanvasNodeType.Config
            : CanvasNodeType.Text,
        title: node.title,
        position:
          positions[node.id] || buildInitialPosition(summaries.length + index),
        width: size.width,
        height: size.height,
        metadata: {
          content: node.content,
          prompt: node.prompt,
          imageUrl: node.output?.imageUrl,
          sourceSummaryId: node.output?.summaryId,
          status: node.output?.imageUrl ? 'success' : 'idle'
        }
      } satisfies CanvasNodeData;
    });

    return [...summaryNodes, ...customNodesList];
  }, [
    customNodes,
    nodeSizes,
    positions,
    summaries.length,
    summaryById,
    summaryIds
  ]);

  const canvasNodeById = useMemo(
    () => new Map(canvasNodes.map((node) => [node.id, node])),
    [canvasNodes]
  );

  const resetView = useCallback(() => {
    setScale(0.82);
    setOffset({ x: 112, y: 72 });
  }, []);

  const zoomBy = useCallback((delta: number) => {
    setScale((current) =>
      clamp(Number((current + delta).toFixed(2)), MIN_SCALE, MAX_SCALE)
    );
  }, []);

  const setZoomPercent = useCallback((percent: number) => {
    setScale(clamp(Number((percent / 100).toFixed(2)), MIN_SCALE, MAX_SCALE));
  }, []);

  const getViewportCenterPosition = useCallback(
    (width: number, height: number): Position => ({
      x: (viewportSize.width / 2 - offset.x) / scale - width / 2,
      y: (viewportSize.height / 2 - offset.y) / scale - height / 2
    }),
    [offset.x, offset.y, scale, viewportSize.height, viewportSize.width]
  );

  const getCanvasPositionFromClient = useCallback(
    (
      clientX: number,
      clientY: number,
      width = NODE_WIDTH,
      height = NODE_HEIGHT
    ) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return getViewportCenterPosition(width, height);
      return {
        x: (clientX - rect.left - offset.x) / scale - width / 2,
        y: (clientY - rect.top - offset.y) / scale - height / 2
      };
    },
    [getViewportCenterPosition, offset.x, offset.y, scale]
  );

  const handleCanvasDragOver = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (
        event.dataTransfer.types.includes(CANVAS_SUMMARY_DRAG_TYPE) ||
        event.dataTransfer.types.includes('text/plain')
      ) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }
    },
    []
  );

  const handleCanvasDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      const summaryId =
        event.dataTransfer.getData(CANVAS_SUMMARY_DRAG_TYPE) ||
        event.dataTransfer.getData('text/plain');
      if (!summaryId || !summaryById.has(summaryId)) return;
      event.preventDefault();
      const position = getCanvasPositionFromClient(
        event.clientX,
        event.clientY,
        NODE_WIDTH,
        NODE_HEIGHT
      );
      pushHistory();
      onImportNodeIds([summaryId], {
        activeNodeIds: Array.from(new Set([...activeNodeIds, summaryId])),
        positions: {
          ...positions,
          [summaryId]: position
        },
        selectedNodeId: summaryId
      });
      setPositions((prev) => ({ ...prev, [summaryId]: position }));
      selectNode(summaryId);
    },
    [
      activeNodeIds,
      getCanvasPositionFromClient,
      onImportNodeIds,
      positions,
      pushHistory,
      selectNode,
      summaryById
    ]
  );

  const updateCustomNode = useCallback(
    (nodeId: string, patch: Partial<CanvasCustomNode>) => {
      const currentNode = customNodes[nodeId];
      if (!currentNode) return;
      onCanvasStateChange({
        customNodes: {
          ...(canvasState.customNodes || {}),
          [nodeId]: {
            ...currentNode,
            ...patch
          }
        },
        selectedNodeId: nodeId
      });
    },
    [canvasState.customNodes, customNodes, onCanvasStateChange]
  );

  const updateHolderTargetSize = useCallback(
    (
      node: CanvasCustomNode,
      patch: {
        targetWidth?: number;
        targetHeight?: number;
        aspectRatio?: string;
        aspectLocked?: boolean;
      }
    ) => {
      if (node.type !== 'ai_image_holder') return;
      const currentRatio = patch.aspectRatio || getHolderAspectRatio(node);
      const ratioValue = parseAspectRatioValue(currentRatio);
      const locked =
        typeof patch.aspectLocked === 'boolean'
          ? patch.aspectLocked
          : node.aspectLocked !== false;
      let targetWidth =
        typeof patch.targetWidth === 'number'
          ? patch.targetWidth
          : getHolderTargetWidth(node);
      let targetHeight =
        typeof patch.targetHeight === 'number'
          ? patch.targetHeight
          : getHolderTargetHeight(node);

      if (locked && typeof patch.targetWidth === 'number') {
        targetHeight = Math.round(targetWidth / ratioValue);
      } else if (locked && typeof patch.targetHeight === 'number') {
        targetWidth = Math.round(targetHeight * ratioValue);
      }

      targetWidth = clamp(
        targetWidth,
        AI_HOLDER_TARGET_MIN,
        AI_HOLDER_TARGET_MAX
      );
      targetHeight = clamp(
        targetHeight,
        AI_HOLDER_TARGET_MIN,
        AI_HOLDER_TARGET_MAX
      );

      updateCustomNode(node.id, {
        targetWidth,
        targetHeight,
        aspectRatio: currentRatio,
        aspectPreset: currentRatio,
        aspectLocked: locked
      });
    },
    [updateCustomNode]
  );

  const addCustomNode = useCallback(
    (
      type: CanvasCustomNode['type'],
      annotationKind: CanvasAnnotationKind = 'note'
    ) => {
      const isHolder = type === 'ai_image_holder';
      const id = createCustomNodeId(type);
      const targetNodeId =
        !isHolder && activeNodeId && allNodeIdSet.has(activeNodeId)
          ? activeNodeId
          : undefined;
      const prompt = isHolder
        ? ''
        : typeof window !== 'undefined'
          ? window.prompt(
              targetNodeId
                ? '写下针对当前选中节点的修改标注：'
                : '写下这条画布批注或修改意图：',
              ''
            )
          : '';
      if (!isHolder && prompt === null) return;

      const width = isHolder ? AI_HOLDER_WIDTH : ANNOTATION_WIDTH;
      const height = isHolder ? AI_HOLDER_HEIGHT : ANNOTATION_HEIGHT;
      const targetPosition = targetNodeId ? positions[targetNodeId] : undefined;
      const targetSize = targetNodeId ? nodeSizes[targetNodeId] : undefined;
      const position =
        !isHolder && targetPosition
          ? {
              x: targetPosition.x - width - 48,
              y:
                targetPosition.y +
                Math.max(0, ((targetSize?.height || NODE_HEIGHT) - height) / 2)
            }
          : getViewportCenterPosition(width, height);
      const node: CanvasCustomNode = {
        id,
        type,
        title: isHolder ? 'AI 图片槽' : getAnnotationKindLabel(annotationKind),
        prompt: isHolder ? prompt?.trim() || undefined : undefined,
        targetWidth: isHolder ? AI_HOLDER_TARGET_WIDTH : undefined,
        targetHeight: isHolder ? AI_HOLDER_TARGET_HEIGHT : undefined,
        aspectRatio: isHolder ? '1:1' : undefined,
        aspectPreset: isHolder ? '1:1' : undefined,
        aspectLocked: isHolder ? true : undefined,
        annotationKind: isHolder ? undefined : annotationKind,
        targetNodeId,
        content: isHolder
          ? '面向后续生图的明确槽位。启用后，Agent 会把它作为生成目标读取。'
          : prompt?.trim() || '待补充批注',
        createdAt: Date.now()
      };
      const nextAllowedNodeIds = new Set([...allNodeIds, id]);
      const nextConnections =
        !isHolder && targetNodeId
          ? normalizeConnectionsForNodes(
              [
                ...connections,
                {
                  id: createConnectionId(id, targetNodeId),
                  fromNodeId: id,
                  toNodeId: targetNodeId
                }
              ],
              nextAllowedNodeIds
            )
          : connections;

      pushHistory();
      setPositions((prev) => ({ ...prev, [id]: position }));
      setNodeSizes((prev) => ({ ...prev, [id]: { width, height } }));
      if (nextConnections !== connections) {
        setConnections(nextConnections);
      }
      setActiveNodeId(id);
      onCanvasStateChange({
        customNodes: {
          ...(canvasState.customNodes || {}),
          [id]: node
        },
        activeNodeIds: Array.from(new Set([...activeNodeIds, id])),
        positions: {
          ...positions,
          [id]: position
        },
        sizes: {
          ...nodeSizes,
          [id]: { width, height }
        },
        connections: nextConnections,
        selectedNodeId: id
      });
    },
    [
      activeNodeIds,
      activeNodeId,
      allNodeIdSet,
      allNodeIds,
      canvasState.customNodes,
      connections,
      getViewportCenterPosition,
      nodeSizes,
      onCanvasStateChange,
      positions,
      pushHistory
    ]
  );

  const requestImageForHolder = useCallback(
    (node: CanvasCustomNode) => {
      if (node.type !== 'ai_image_holder') return;
      const prompt =
        typeof window !== 'undefined'
          ? window.prompt('输入这个图片槽的生成提示词：', node.prompt || '')
          : node.prompt || '';
      if (prompt === null) return;
      const trimmedPrompt = prompt.trim();
      if (!trimmedPrompt) return;

      const nextNode: CanvasCustomNode = {
        ...node,
        prompt: trimmedPrompt,
        targetWidth: getHolderTargetWidth(node),
        targetHeight: getHolderTargetHeight(node),
        aspectRatio: getHolderAspectRatio(node),
        aspectPreset: getHolderAspectRatio(node),
        aspectLocked: node.aspectLocked !== false,
        content: '等待 Agent 按此提示词生成图片。'
      };
      onCanvasStateChange({
        customNodes: {
          ...(canvasState.customNodes || {}),
          [node.id]: nextNode
        },
        activeNodeIds: Array.from(new Set([...activeNodeIds, node.id])),
        selectedNodeId: node.id
      });
      selectNode(node.id);
      onRequestGenerateImage?.(nextNode);
    },
    [
      activeNodeIds,
      canvasState.customNodes,
      onCanvasStateChange,
      onRequestGenerateImage,
      selectNode
    ]
  );

  const undo = useCallback(() => {
    setHistory((prev) => {
      const snapshot = prev[prev.length - 1];
      if (!snapshot) return prev;
      setFuture((items) => [makeSnapshot(), ...items.slice(0, 24)]);
      applySnapshot(snapshot);
      return prev.slice(0, -1);
    });
  }, [applySnapshot, makeSnapshot]);

  const redo = useCallback(() => {
    setFuture((prev) => {
      const snapshot = prev[0];
      if (!snapshot) return prev;
      setHistory((items) => [...items.slice(-24), makeSnapshot()]);
      applySnapshot(snapshot);
      return prev.slice(1);
    });
  }, [applySnapshot, makeSnapshot]);

  const handleConnectionClick = (summaryId: string) => {
    if (!connectionStartId) {
      setConnectionStartId(summaryId);
      selectNode(summaryId);
      return;
    }

    if (connectionStartId === summaryId) {
      setConnectionStartId(null);
      return;
    }

    const exists = connections.some(
      (connection) =>
        (connection.fromNodeId === connectionStartId &&
          connection.toNodeId === summaryId) ||
        (connection.fromNodeId === summaryId &&
          connection.toNodeId === connectionStartId)
    );
    if (!exists) {
      pushHistory();
      setConnections((prev) => [
        ...prev,
        {
          id: createConnectionId(connectionStartId, summaryId),
          fromNodeId: connectionStartId,
          toNodeId: summaryId
        }
      ]);
    }
    setConnectionStartId(null);
    selectNode(summaryId);
  };

  const handleNodePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
    summaryId: string
  ) => {
    if (typeof event.button === 'number' && event.button > 0) return;
    if (connectionMode) {
      event.preventDefault();
      event.stopPropagation();
      handleConnectionClick(summaryId);
      return;
    }

    if (event.metaKey || event.ctrlKey || event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      onToggleNodeActive(summaryId);
      selectNode(summaryId);
      return;
    }

    const position = positions[summaryId];
    if (!position) return;
    startDragHistory();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragStateRef.current = {
      kind: 'node',
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      nodeId: summaryId,
      nodeStartX: position.x,
      nodeStartY: position.y
    };
    selectNode(summaryId);
    onCanvasStateChange({
      activeNodeIds: [summaryId],
      selectedNodeId: summaryId
    });
  };

  const handleNodeResizePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
    summaryId: string
  ) => {
    if (typeof event.button === 'number' && event.button > 0) return;
    const size = nodeSizes[summaryId] || defaultNodeSize();
    startDragHistory();
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragStateRef.current = {
      kind: 'resize',
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      nodeId: summaryId,
      nodeStartWidth: size.width,
      nodeStartHeight: size.height
    };
    selectNode(summaryId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - dragState.startClientX;
    const deltaY = event.clientY - dragState.startClientY;

    if (!dragState.nodeId) return;
    commitDragHistoryIfNeeded(deltaX, deltaY);

    if (dragState.kind === 'resize') {
      setNodeSizes((prev) => ({
        ...prev,
        [dragState.nodeId!]: {
          width: clamp(
            (dragState.nodeStartWidth || NODE_WIDTH) + deltaX / scale,
            MIN_NODE_WIDTH,
            MAX_NODE_WIDTH
          ),
          height: clamp(
            (dragState.nodeStartHeight || NODE_HEIGHT) + deltaY / scale,
            MIN_NODE_HEIGHT,
            MAX_NODE_HEIGHT
          )
        }
      }));
      return;
    }

    setPositions((prev) => ({
      ...prev,
      [dragState.nodeId!]: {
        x: (dragState.nodeStartX || 0) + deltaX / scale,
        y: (dragState.nodeStartY || 0) + deltaY / scale
      }
    }));
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (dragState?.pointerId === event.pointerId) {
      dragStateRef.current = null;
      pendingDragSnapshotRef.current = null;
      dragHistoryCommittedRef.current = false;
    }
  };

  const removeNode = useCallback(
    (summaryId: string) => {
      pushHistory();
      const customNode = customNodes[summaryId];
      if (customNode) {
        const nextCustomNodes = { ...customNodes };
        delete nextCustomNodes[summaryId];
        const nextPositions = { ...positions };
        const nextSizes = { ...nodeSizes };
        delete nextPositions[summaryId];
        delete nextSizes[summaryId];
        const nextConnections = connections.filter(
          (connection) =>
            connection.fromNodeId !== summaryId &&
            connection.toNodeId !== summaryId
        );
        setPositions(nextPositions);
        setNodeSizes(nextSizes);
        setConnections(nextConnections);
        onCanvasStateChange({
          customNodes: nextCustomNodes,
          activeNodeIds: activeNodeIds.filter((id) => id !== summaryId),
          positions: nextPositions,
          sizes: nextSizes,
          connections: nextConnections,
          selectedNodeId:
            canvasState.selectedNodeId === summaryId
              ? undefined
              : canvasState.selectedNodeId
        });
        selectNode(null);
        return;
      }
      onRemoveNode(summaryId);
      selectNode(null);
      setConnections((prev) =>
        prev.filter(
          (connection) =>
            connection.fromNodeId !== summaryId &&
            connection.toNodeId !== summaryId
        )
      );
    },
    [
      activeNodeIds,
      canvasState.selectedNodeId,
      connections,
      customNodes,
      nodeSizes,
      onCanvasStateChange,
      onRemoveNode,
      positions,
      pushHistory,
      selectNode
    ]
  );

  const removeConnection = useCallback(
    (connectionId: string) => {
      pushHistory();
      setConnections((prev) =>
        prev.filter((connection) => connection.id !== connectionId)
      );
      setActiveNodeId((current) => (current === connectionId ? null : current));
    },
    [pushHistory]
  );

  const handleNodeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>, nodeId: string) => {
      if (event.target !== event.currentTarget) return;

      if (event.key === 'Enter') {
        event.preventDefault();
        selectNode(nodeId);
        onCanvasStateChange({
          activeNodeIds: [nodeId],
          selectedNodeId: nodeId
        });
        return;
      }

      if (event.key === ' ') {
        event.preventDefault();
        onToggleNodeActive(nodeId);
        selectNode(nodeId);
        return;
      }

      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        removeNode(nodeId);
      }
    },
    [onCanvasStateChange, onToggleNodeActive, removeNode, selectNode]
  );

  useEffect(() => {
    if (!selectedConnection) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName.toLowerCase();
      if (
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        target?.isContentEditable
      ) {
        return;
      }
      if (event.key !== 'Backspace' && event.key !== 'Delete') return;
      event.preventDefault();
      removeConnection(selectedConnection.id);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [removeConnection, selectedConnection]);

  const exportCanvas = () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      projectName,
      nodeIds: summaryIds,
      customNodes,
      positions,
      sizes: nodeSizes,
      connections,
      activeNodeIds: activeNodeIds.filter((id) => allNodeIdSet.has(id)),
      selectedNodeId: canvasState.selectedNodeId,
      viewport: { x: offset.x, y: offset.y, k: scale }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${projectName || 'webtomind-canvas'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importCanvas = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw);
      const importedIds = Array.isArray(parsed.nodeIds)
        ? parsed.nodeIds.filter(
            (id: unknown): id is string => typeof id === 'string'
          )
        : [];
      const importedCustomNodes =
        parsed.customNodes && typeof parsed.customNodes === 'object'
          ? (parsed.customNodes as Record<string, CanvasCustomNode>)
          : {};
      const allowedImportedNodeIds = new Set([
        ...importedIds,
        ...Object.keys(importedCustomNodes)
      ]);
      const importedConnections = normalizeConnectionsForNodes(
        parsed.connections,
        allowedImportedNodeIds
      );
      pushHistory();
      if (importedIds.length > 0) {
        onImportNodeIds(importedIds, {
          activeNodeIds: Array.isArray(parsed.activeNodeIds)
            ? parsed.activeNodeIds.filter(
                (id: unknown): id is string =>
                  typeof id === 'string' && allowedImportedNodeIds.has(id)
              )
            : importedIds,
          customNodes: importedCustomNodes,
          positions:
            parsed.positions && typeof parsed.positions === 'object'
              ? parsed.positions
              : undefined,
          sizes:
            parsed.sizes && typeof parsed.sizes === 'object'
              ? parsed.sizes
              : undefined,
          connections: importedConnections,
          viewport:
            parsed.viewport && typeof parsed.viewport === 'object'
              ? parsed.viewport
              : undefined,
          selectedNodeId:
            typeof parsed.selectedNodeId === 'string' &&
            allowedImportedNodeIds.has(parsed.selectedNodeId)
              ? parsed.selectedNodeId
              : undefined
        });
      } else if (parsed.customNodes && typeof parsed.customNodes === 'object') {
        onCanvasStateChange({
          customNodes: parsed.customNodes,
          positions:
            parsed.positions && typeof parsed.positions === 'object'
              ? parsed.positions
              : positions,
          sizes:
            parsed.sizes && typeof parsed.sizes === 'object'
              ? parsed.sizes
              : nodeSizes,
          activeNodeIds: Array.isArray(parsed.activeNodeIds)
            ? parsed.activeNodeIds.filter(
                (id: unknown): id is string =>
                  typeof id === 'string' && allowedImportedNodeIds.has(id)
              )
            : Object.keys(parsed.customNodes),
          selectedNodeId:
            typeof parsed.selectedNodeId === 'string' &&
            allowedImportedNodeIds.has(parsed.selectedNodeId)
              ? parsed.selectedNodeId
              : undefined
        });
      }
      if (parsed.positions && typeof parsed.positions === 'object') {
        setPositions(parsed.positions);
      }
      if (parsed.sizes && typeof parsed.sizes === 'object') {
        setNodeSizes(parsed.sizes);
      }
      if (Array.isArray(parsed.connections)) {
        setConnections(importedConnections);
        onCanvasStateChange({ connections: importedConnections });
      }
      const parsedViewport = parsed.viewport;
      const parsedScale =
        typeof parsedViewport?.k === 'number'
          ? parsedViewport.k
          : typeof parsedViewport?.scale === 'number'
            ? parsedViewport.scale
            : null;
      const parsedOffset =
        parsedViewport?.offset &&
        typeof parsedViewport.offset.x === 'number' &&
        typeof parsedViewport.offset.y === 'number'
          ? parsedViewport.offset
          : parsedViewport &&
              typeof parsedViewport.x === 'number' &&
              typeof parsedViewport.y === 'number'
            ? { x: parsedViewport.x, y: parsedViewport.y }
            : null;

      if (parsedScale !== null) {
        const nextScale = clamp(Number(parsedScale), MIN_SCALE, MAX_SCALE);
        setScale(nextScale);
        onCanvasStateChange({
          viewport: {
            x: offset.x,
            y: offset.y,
            k: nextScale
          }
        });
      }
      if (parsedOffset) {
        setOffset(parsedOffset);
        onCanvasStateChange({
          viewport: {
            x: parsedOffset.x,
            y: parsedOffset.y,
            k:
              parsedScale !== null
                ? clamp(Number(parsedScale), MIN_SCALE, MAX_SCALE)
                : scale
          }
        });
      }
    } catch {
      // Ignore invalid files; import/export is an optional canvas utility.
    }
  };

  const activeCanvasNode =
    activeNodeId && allNodeIdSet.has(activeNodeId)
      ? canvasNodeById.get(activeNodeId)
      : null;
  const activeCustomNode = activeCanvasNode
    ? customNodes[activeCanvasNode.id]
    : undefined;
  const activeSummary = activeCanvasNode
    ? summaryById.get(activeCanvasNode.id)
    : undefined;
  const activeNodeSelected = activeCanvasNode
    ? activeNodeIds.includes(activeCanvasNode.id)
    : false;
  const activeNodePosition = activeCanvasNode?.position;

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#f7f4ef] dark:bg-slate-950">
      <header className="relative z-20 flex shrink-0 items-center justify-between gap-3 border-b border-stone-200/80 bg-white/95 px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
            <MousePointer2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-950 dark:text-slate-100">
              {projectName || '项目画布'}
            </div>
            <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {canvasNodeCount} 个画布节点 · {selectedCount} 个已启用
            </div>
          </div>
        </div>

        <div
          className="hidden max-w-full shrink-0 items-center gap-1.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-hidden="true"
        >
          <button
            type="button"
            onClick={() => addCustomNode('ai_image_holder')}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-200 dark:hover:bg-blue-950 lg:w-auto lg:px-3"
            aria-label="添加 AI 图片槽"
          >
            <ImagePlus className="h-4 w-4" />
            <span className="hidden lg:inline">AI 图片槽</span>
          </button>
          <button
            type="button"
            onClick={() => addCustomNode('annotation')}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200 dark:hover:bg-amber-950 lg:w-auto lg:px-3"
            aria-label="添加批注"
          >
            <StickyNote className="h-4 w-4" />
            <span className="hidden lg:inline">批注</span>
          </button>
          <button
            type="button"
            onClick={undo}
            disabled={history.length === 0}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="撤销"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={future.length === 0}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="重做"
          >
            <Redo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setConnectionMode((prev) => !prev);
              setConnectionStartId(null);
            }}
            className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors ${
              connectionMode
                ? 'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Waypoints className="h-4 w-4" />
            连线
          </button>
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="导入画布"
          >
            <Upload className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={exportCanvas}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="导出画布"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => zoomBy(-0.1)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="缩小画布"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <div className="hidden min-w-[52px] shrink-0 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 sm:block">
            {Math.round(scale * 100)}%
          </div>
          <button
            type="button"
            onClick={() => zoomBy(0.1)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="放大画布"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={resetView}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="重置画布视图"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={importCanvas}
          />
        </div>
      </header>

      <div
        data-testid="infinite-canvas-dropzone"
        className="relative flex-1 overflow-hidden"
        onDragOver={handleCanvasDragOver}
        onDrop={handleCanvasDrop}
      >
        <WorkspaceInfiniteCanvas
          containerRef={viewportRef}
          viewport={viewport}
          onViewportChange={applyViewport}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onDoubleClick={resetView}
        >
          <svg
            className="pointer-events-none absolute left-0 top-0 overflow-visible"
            width={5000}
            height={5000}
            aria-hidden="true"
          >
            {connections.map((connection) => {
              const from = canvasNodeById.get(connection.fromNodeId);
              const to = canvasNodeById.get(connection.toNodeId);
              if (!from || !to) return null;
              return (
                <WorkspaceConnectionPath
                  key={connection.id}
                  connection={connection}
                  from={from}
                  to={to}
                  active={activeNodeId === connection.id}
                  onSelect={() => setActiveNodeId(connection.id)}
                  onContextMenu={() => removeConnection(connection.id)}
                />
              );
            })}
          </svg>

          {canvasNodes.map((node, index) => {
            const summary = summaryById.get(node.id);
            const customNode = customNodes[node.id];
            const position = node.position;
            const size = nodeSizes[node.id] || {
              width: node.width,
              height: node.height
            };
            const selected = activeNodeIds.includes(node.id);
            const imageUrl = summary
              ? getSummaryImageUrl(summary)
              : customNode?.output?.imageUrl || node.metadata?.imageUrl || null;
            const kind = summary ? getSummaryKind(summary) : 'text';
            const preview = summary
              ? toPlainText(summary.markdown)
              : customNode?.content || customNode?.prompt || '暂无可预览内容';
            const connecting = connectionStartId === node.id;
            const isHolder = customNode?.type === 'ai_image_holder';
            const isAnnotation = customNode?.type === 'annotation';
            const annotationLabel = isAnnotation
              ? getAnnotationKindLabel(customNode?.annotationKind)
              : null;
            const holderVersion =
              isHolder && customNode?.output?.version
                ? ` · v${customNode.output.version}`
                : '';
            const holderTargetLabel =
              isHolder && customNode
                ? `${getHolderTargetWidth(customNode)}x${getHolderTargetHeight(
                    customNode
                  )} · ${getHolderAspectRatio(customNode)}`
                : '';

            return (
              <div
                key={node.id}
                data-node-id={node.id}
                tabIndex={0}
                role="group"
                aria-label={`画布节点：${node.title || '未命名节点'}。Enter 选中，空格切换引用，Delete 删除。`}
                className={`absolute select-none rounded-2xl border bg-white shadow-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 dark:bg-slate-900 dark:focus:ring-white ${
                  selected || connecting
                    ? 'border-slate-950 shadow-lg shadow-slate-950/10 dark:border-white dark:shadow-black/30'
                    : activeNodeId === node.id
                      ? 'border-orange-300 shadow-md'
                      : 'border-stone-200 dark:border-slate-700'
                }`}
                style={{
                  width: size.width,
                  minHeight: size.height,
                  transform: `translate(${position.x}px, ${position.y}px)`
                }}
                onPointerDown={(event) => handleNodePointerDown(event, node.id)}
                onKeyDown={(event) => handleNodeKeyDown(event, node.id)}
              >
                <div className="flex items-start gap-3 p-3">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      isHolder
                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300'
                        : isAnnotation
                          ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                          : kind === 'image'
                            ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {isHolder ? (
                      <ImagePlus className="h-4 w-4" />
                    ) : isAnnotation ? (
                      <StickyNote className="h-4 w-4" />
                    ) : kind === 'image' ? (
                      <ImageIcon className="h-4 w-4" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-sm font-semibold leading-5 text-slate-950 dark:text-slate-100">
                      {node.title || '未命名节点'}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">
                      {isHolder
                        ? `AI 图片槽${holderVersion}`
                        : isAnnotation
                          ? `${annotationLabel}${customNode?.targetNodeId ? ' · 已关联目标' : ''}`
                          : `Node ${index + 1}`}
                    </div>
                    {holderTargetLabel ? (
                      <div className="mt-1 text-[11px] font-medium text-blue-600 dark:text-blue-300">
                        {holderTargetLabel}
                      </div>
                    ) : null}
                  </div>
                </div>

                {imageUrl ? (
                  <button
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => {
                      if (summary) onOpenSummary(summary);
                      else if (imageUrl)
                        window.open(imageUrl, '_blank', 'noopener,noreferrer');
                    }}
                    className="mx-3 block overflow-hidden rounded-xl border border-stone-100 bg-stone-50 dark:border-slate-800 dark:bg-slate-800"
                    style={{ height: Math.max(76, size.height - 96) }}
                  >
                    <img
                      src={imageUrl}
                      alt={node.title || '素材图片'}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  </button>
                ) : isHolder ? (
                  <div
                    className="mx-3 flex items-center justify-center rounded-xl border border-dashed border-blue-200 bg-blue-50/70 px-3 py-3 text-center text-xs leading-5 text-blue-800 dark:border-blue-900/70 dark:bg-blue-950/25 dark:text-blue-200"
                    style={{ minHeight: Math.max(88, size.height - 96) }}
                  >
                    <div>
                      <ImagePlus className="mx-auto mb-2 h-5 w-5" />
                      <div className="font-semibold">等待生成图片</div>
                      <div className="mt-1 line-clamp-3">
                        {customNode?.prompt || '可作为 Agent 生图目标槽位'}
                      </div>
                      {customNode ? (
                        <button
                          type="button"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={() => requestImageForHolder(customNode)}
                          className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          生成图片
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div
                    className={`mx-3 overflow-hidden rounded-xl px-3 py-2 text-xs leading-5 ${
                      isAnnotation
                        ? 'border border-amber-100 bg-amber-50/70 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100'
                        : 'bg-stone-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                    style={{ maxHeight: Math.max(74, size.height - 96) }}
                  >
                    {isAnnotation ? (
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-300">
                        用作 Agent 修改指令
                      </div>
                    ) : null}
                    <div className="line-clamp-6">
                      {preview || '暂无可预览内容'}
                    </div>
                  </div>
                )}

                <div
                  role="presentation"
                  className="absolute bottom-1 right-1 h-4 w-4 cursor-nwse-resize rounded-sm border-b-2 border-r-2 border-slate-300 opacity-80 dark:border-slate-600"
                  onPointerDown={(event) =>
                    handleNodeResizePointerDown(event, node.id)
                  }
                />
              </div>
            );
          })}
        </WorkspaceInfiniteCanvas>

        {canvasNodes.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center px-6">
            <div className="max-w-sm rounded-3xl border border-dashed border-stone-300 bg-white/85 p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900/85">
              <Search className="mx-auto h-8 w-8 text-slate-400" />
              <div className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                画布还是空的
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                在来源素材面板勾选来源，然后点击“添加选中到画布”。画布不会自动导入全部素材。
              </p>
              {sourcePanelCollapsed ? (
                <button
                  type="button"
                  onClick={onOpenSourcePanel}
                  className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white dark:bg-white dark:text-slate-950"
                >
                  <PanelLeftOpen className="h-4 w-4" />
                  打开素材栏
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {sourcePanelCollapsed ? (
          <button
            type="button"
            onClick={onOpenSourcePanel}
            className="absolute left-4 top-4 z-20 hidden h-10 items-center gap-2 rounded-full border border-stone-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-lg shadow-slate-950/10 transition-colors hover:bg-stone-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 xl:inline-flex"
          >
            <PanelLeftOpen className="h-4 w-4" />
            素材栏
          </button>
        ) : null}

        {canvasState.recoveredRecordCount ? (
          <div className="absolute left-4 top-4 z-20 rounded-2xl border border-amber-200 bg-amber-50/95 px-3 py-2 text-xs font-medium text-amber-900 shadow-lg shadow-slate-950/10 dark:border-amber-900/70 dark:bg-amber-950/80 dark:text-amber-100">
            已跳过 {canvasState.recoveredRecordCount} 条无效画布记录
          </div>
        ) : null}

        {selectedConnection ? (
          <div className="absolute right-4 top-4 z-20 flex items-center gap-2 rounded-full border border-orange-200 bg-white px-3 py-2 text-xs font-semibold text-orange-700 shadow-lg shadow-slate-950/10 dark:border-orange-900/70 dark:bg-slate-900 dark:text-orange-200">
            <span>已选中连线</span>
            <button
              type="button"
              onClick={() => removeConnection(selectedConnection.id)}
              className="inline-flex h-8 items-center gap-1 rounded-full bg-orange-600 px-3 text-white transition-colors hover:bg-orange-700 dark:bg-orange-500 dark:hover:bg-orange-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
              删除
            </button>
          </div>
        ) : null}

        {activeCanvasNode && activeNodePosition ? (
          <div
            data-testid="canvas-context-toolbar"
            className="absolute z-30 flex max-w-[min(92vw,760px)] items-center gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white/95 p-1.5 text-xs font-semibold shadow-xl shadow-slate-950/15 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"
            style={{
              left: clamp(
                activeNodePosition.x * scale + offset.x,
                16,
                Math.max(16, viewportSize.width - 420)
              ),
              top: clamp(
                activeNodePosition.y * scale + offset.y - 54,
                16,
                Math.max(16, viewportSize.height - 96)
              )
            }}
            data-canvas-no-zoom
          >
            <button
              type="button"
              onClick={() => onToggleNodeActive(activeCanvasNode.id)}
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 transition-colors ${
                activeNodeSelected
                  ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Check className="h-3.5 w-3.5" />
              {activeNodeSelected ? '已引用' : '引用'}
            </button>
            {activeCustomNode?.type === 'ai_image_holder' ? (
              <>
                <button
                  type="button"
                  onClick={() => requestImageForHolder(activeCustomNode)}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  生成图片
                </button>
                <div
                  className="flex shrink-0 items-center gap-1 rounded-xl bg-blue-50 px-2 py-1 text-blue-900 dark:bg-blue-950/35 dark:text-blue-100"
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <input
                    aria-label="生成宽度"
                    type="number"
                    min={AI_HOLDER_TARGET_MIN}
                    max={AI_HOLDER_TARGET_MAX}
                    value={getHolderTargetWidth(activeCustomNode)}
                    onChange={(event) => {
                      const nextValue = event.currentTarget.valueAsNumber;
                      if (!Number.isFinite(nextValue)) return;
                      updateHolderTargetSize(activeCustomNode, {
                        targetWidth: nextValue
                      });
                    }}
                    className="h-7 w-16 rounded-lg border border-blue-200 bg-white px-2 text-xs font-semibold text-slate-900 outline-none focus:border-blue-500 dark:border-blue-900 dark:bg-slate-950 dark:text-slate-100"
                  />
                  <span className="text-[11px] font-semibold text-blue-400">
                    x
                  </span>
                  <input
                    aria-label="生成高度"
                    type="number"
                    min={AI_HOLDER_TARGET_MIN}
                    max={AI_HOLDER_TARGET_MAX}
                    value={getHolderTargetHeight(activeCustomNode)}
                    onChange={(event) => {
                      const nextValue = event.currentTarget.valueAsNumber;
                      if (!Number.isFinite(nextValue)) return;
                      updateHolderTargetSize(activeCustomNode, {
                        targetHeight: nextValue
                      });
                    }}
                    className="h-7 w-16 rounded-lg border border-blue-200 bg-white px-2 text-xs font-semibold text-slate-900 outline-none focus:border-blue-500 dark:border-blue-900 dark:bg-slate-950 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      updateHolderTargetSize(activeCustomNode, {
                        aspectLocked: activeCustomNode.aspectLocked === false
                      })
                    }
                    className={`h-7 rounded-lg px-2 text-[11px] font-semibold transition-colors ${
                      activeCustomNode.aspectLocked === false
                        ? 'bg-white text-slate-500 dark:bg-slate-950 dark:text-slate-300'
                        : 'bg-blue-600 text-white dark:bg-blue-500'
                    }`}
                    aria-label="锁定宽高比"
                  >
                    锁定
                  </button>
                </div>
                <div
                  className="flex shrink-0 items-center gap-1"
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  {AI_HOLDER_ASPECT_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        const nextWidth = getHolderTargetWidth(activeCustomNode);
                        updateHolderTargetSize(activeCustomNode, {
                          aspectRatio: preset,
                          targetWidth: nextWidth,
                          aspectLocked: true
                        });
                      }}
                      className={`h-8 rounded-lg px-2 text-[11px] font-semibold transition-colors ${
                        getHolderAspectRatio(activeCustomNode) === preset
                          ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => {
                if (activeSummary) onOpenSummary(activeSummary);
                else if (activeCustomNode?.output?.imageUrl) {
                  window.open(
                    activeCustomNode.output.imageUrl,
                    '_blank',
                    'noopener,noreferrer'
                  );
                }
              }}
              disabled={!activeSummary && !activeCustomNode?.output?.imageUrl}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-slate-100 px-3 text-slate-700 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              查看
            </button>
            <button
              type="button"
              onClick={() => {
                setConnectionMode(true);
                setConnectionStartId(activeCanvasNode.id);
              }}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-slate-100 px-3 text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Waypoints className="h-3.5 w-3.5" />
              连线
            </button>
            <button
              type="button"
              onClick={() => removeNode(activeCanvasNode.id)}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-red-50 px-3 text-red-600 transition-colors hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70"
            >
              <Trash2 className="h-3.5 w-3.5" />
              删除
            </button>
          </div>
        ) : null}

        {agentPanelCollapsed ? (
          <button
            type="button"
            onClick={onOpenAgentPanel}
            className="absolute bottom-4 right-4 z-20 hidden h-11 items-center gap-2 rounded-full bg-slate-950 px-4 text-sm font-semibold text-white shadow-lg shadow-slate-950/20 dark:bg-white dark:text-slate-950 xl:inline-flex"
          >
            <Bot className="h-4 w-4" />
            打开 Agent
          </button>
        ) : null}

        {canvasNodes.length > 0 ? (
          <WorkspaceCanvasMinimap
            nodes={canvasNodes}
            viewport={viewport}
            viewportSize={viewportSize}
            selectedNodeIds={activeNodeIds}
            onViewportChange={applyViewport}
          />
        ) : null}

        <ToolcraftFloatingToolbar
          data-testid="canvas-bottom-toolbar"
          className="absolute bottom-5 left-1/2 z-30 max-w-[calc(100vw-2rem)] -translate-x-1/2 p-2 dark:border-slate-700 dark:bg-slate-900/95"
          data-canvas-no-zoom
        >
          <ToolcraftActionButton
            onClick={() => addCustomNode('ai_image_holder')}
            tone="accent"
            aria-label="添加 AI 图片槽"
            icon={<ImagePlus className="h-4 w-4" />}
          >
            AI 图片槽
          </ToolcraftActionButton>
          <ToolcraftActionButton
            onClick={() => addCustomNode('annotation')}
            tone="warning"
            aria-label="添加批注"
            icon={<StickyNote className="h-4 w-4" />}
          >
            批注
          </ToolcraftActionButton>
          <ToolcraftActionButton
            onClick={undo}
            disabled={history.length === 0}
            aria-label="撤销"
            square
            icon={<Undo2 className="h-4 w-4" />}
          />
          <ToolcraftActionButton
            onClick={redo}
            disabled={future.length === 0}
            aria-label="重做"
            square
            icon={<Redo2 className="h-4 w-4" />}
          />
          <ToolcraftActionButton
            onClick={() => {
              setConnectionMode((prev) => !prev);
              setConnectionStartId(null);
            }}
            tone={connectionMode ? 'selected' : 'neutral'}
            icon={<Waypoints className="h-4 w-4" />}
          >
            连线
          </ToolcraftActionButton>
          <ToolcraftActionButton
            onClick={() => importInputRef.current?.click()}
            aria-label="导入画布"
            square
            icon={<Upload className="h-4 w-4" />}
          />
          <ToolcraftActionButton
            onClick={exportCanvas}
            aria-label="导出画布"
            square
            icon={<Download className="h-4 w-4" />}
          />
          <ToolcraftActionButton
            onClick={() => zoomBy(-0.1)}
            aria-label="缩小画布"
            square
            icon={<ZoomOut className="h-4 w-4" />}
          />
          <ToolcraftSliderControl
            label="缩放"
            min={Math.round(MIN_SCALE * 100)}
            max={Math.round(MAX_SCALE * 100)}
            step={2}
            value={Math.round(scale * 100)}
            unit="%"
            onValueChange={setZoomPercent}
            className="w-[132px] shrink-0 px-1"
          />
          <ToolcraftActionButton
            onClick={() => zoomBy(0.1)}
            aria-label="放大画布"
            square
            icon={<ZoomIn className="h-4 w-4" />}
          />
          <ToolcraftActionButton
            onClick={resetView}
            aria-label="重置画布视图"
            square
            icon={<RotateCcw className="h-4 w-4" />}
          />
        </ToolcraftFloatingToolbar>
      </div>
    </div>
  );
}
