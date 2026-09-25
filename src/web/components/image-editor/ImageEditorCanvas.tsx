import { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle, MousePointer2, Scan, Trash2, Wand2 } from 'lucide-react';
import type {
  BrushPoint,
  BrushStroke,
  EditorRegion,
  EditorToolId
} from './editor-tools';
import type { EditorVersion } from './useImageEditor';

interface ImageEditorCanvasProps {
  imageUrl: string;
  sourceLabel: string;
  isEnglish: boolean;
  versions: EditorVersion[];
  activeVersionId: string;
  regions: EditorRegion[];
  regionMode: 'select' | 'draw' | 'auto';
  activeRegionId: string | null;
  onSelectRegion: (id: string | null) => void;
  autoMaskUrl?: string;
  onAutoMaskPoint?: (point: { x: number; y: number }) => void;
  cropExtentRef?: React.MutableRefObject<number | null>;
  strokes: BrushStroke[];
  brushSize: number;
  brushColor: string;
  activeTool: EditorToolId | null;
  cropAspect?: string | null;
  cropResetSignal?: number;
  adjustmentFilter?: string;
  busy: boolean;
  generationLabel: string;
  onSelectVersion: (versionId: string) => void;
  onAddRegion: (
    region: Omit<EditorRegion, 'id'> & { kind?: EditorRegion['kind'] }
  ) => void;
  onRemoveRegion: (id: string) => void;
  onAddStroke: (stroke: BrushStroke) => void;
  onApplyCrop: (region: EditorRegion) => void;
}

interface DraftRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ViewState {
  scale: number;
  x: number;
  y: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function parseAspect(aspect: string | null): number | null {
  const match = (aspect || '').match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return height > 0 ? width / height : null;
}

// 裁剪/扩展框允许超出图片边界（上限 45%），实际边界按画布可用空间动态计算
const CROP_EXTEND_DEFAULT = 0.3;
const CROP_EXTEND_MAX = 0.45;

function clampCropRect(
  rect: DraftRect,
  extend: number
): DraftRect {
  const min = -extend;
  const max = 1 + extend;
  const x = Math.min(max, Math.max(min, rect.x));
  const y = Math.min(max, Math.max(min, rect.y));
  return {
    x,
    y,
    width: Math.max(0.01, Math.min(max - x, rect.width)),
    height: Math.max(0.01, Math.min(max - y, rect.height))
  };
}

function fitCropToAspect(
  rect: DraftRect,
  aspect: string | null,
  imageAspect: number,
  extend: number
): DraftRect {
  const ratio = parseAspect(aspect);
  if (!ratio || !imageAspect || imageAspect <= 0) return rect;
  // 目标画幅以原图为中心：保持原图完整，按比例向更宽/更高方向扩展
  const target = ratio / imageAspect;
  let width = Math.max(1, target);
  let height = Math.max(1, 1 / target);
  const maxSpan = 1 + 2 * extend;
  if (width > maxSpan || height > maxSpan) {
    const scale = maxSpan / Math.max(width, height);
    width *= scale;
    height *= scale;
  }
  return clampCropRect(
    {
      x: 0.5 - width / 2,
      y: 0.5 - height / 2,
      width,
      height
    },
    extend
  );
}

function resizeCropRect(
  rect: DraftRect,
  handle: string,
  point: { x: number; y: number },
  aspect: string | null,
  imageAspect: number,
  extend: number
): DraftRect {
  const ratio = parseAspect(aspect);
  const target = ratio && imageAspect > 0 ? ratio / imageAspect : null;
  const cornerHandles: Record<string, { fx: number; fy: number }> = {
    nw: { fx: rect.x + rect.width, fy: rect.y + rect.height },
    ne: { fx: rect.x, fy: rect.y + rect.height },
    sw: { fx: rect.x + rect.width, fy: rect.y },
    se: { fx: rect.x, fy: rect.y }
  };
  if (cornerHandles[handle]) {
    const fixed = cornerHandles[handle];
    let width = Math.abs(point.x - fixed.fx);
    let height = Math.abs(point.y - fixed.fy);
    if (target) {
      if (width / height > target) width = height * target;
      else height = width / target;
    }
    const x = handle.includes('w') ? fixed.fx - width : fixed.fx;
    const y = handle.includes('n') ? fixed.fy - height : fixed.fy;
    return clampCropRect({ x, y, width, height }, extend);
  }
  if (handle === 'w' || handle === 'e') {
    const next = { ...rect };
    if (handle === 'w') {
      const right = rect.x + rect.width;
      next.x = Math.min(point.x, right);
      next.width = Math.abs(point.x - right);
    } else {
      next.width = Math.max(0.01, point.x - rect.x);
    }
    if (target) {
      const height = next.width / target;
      if (next.y + height <= 1) {
        next.height = height;
      } else {
        next.height = 1 - next.y;
        next.width = next.height * target;
      }
    }
    return clampCropRect(next, extend);
  }
  if (handle === 'n' || handle === 's') {
    const next = { ...rect };
    if (handle === 'n') {
      const bottom = rect.y + rect.height;
      next.y = Math.min(point.y, bottom);
      next.height = Math.abs(point.y - bottom);
    } else {
      next.height = Math.max(0.01, point.y - rect.y);
    }
    if (target) {
      const width = next.height * target;
      if (next.x + width <= 1) {
        next.width = width;
      } else {
        next.width = 1 - next.x;
        next.height = next.width / target;
      }
    }
    return clampCropRect(next, extend);
  }
  return rect;
}

function hitCropHandle(
  rect: DraftRect,
  imageBox: DOMRect,
  clientX: number,
  clientY: number
): string | null {
  const x = imageBox.left + rect.x * imageBox.width;
  const y = imageBox.top + rect.y * imageBox.height;
  const w = rect.width * imageBox.width;
  const h = rect.height * imageBox.height;
  const handles: Array<[string, number, number]> = [
    ['nw', x, y],
    ['ne', x + w, y],
    ['sw', x, y + h],
    ['se', x + w, y + h],
    ['n', x + w / 2, y],
    ['s', x + w / 2, y + h],
    ['w', x, y + h / 2],
    ['e', x + w, y + h / 2]
  ];
  const hit = handles.find(
    ([, hx, hy]) =>
      Math.hypot(clientX - hx, clientY - hy) <=
      Math.max(14, Math.min(w, h) * 0.16)
  );
  return hit ? hit[0] : null;
}

export function ImageEditorCanvas({
  imageUrl,
  sourceLabel,
  isEnglish,
  versions,
  activeVersionId,
  regions,
  regionMode = 'draw',
  activeRegionId = null,
  onSelectRegion,
  autoMaskUrl,
  onAutoMaskPoint,
  cropExtentRef,
  strokes,
  brushSize,
  brushColor,
  activeTool,
  cropAspect = null,
  cropResetSignal = 0,
  adjustmentFilter = '',
  busy,
  generationLabel,
  onSelectVersion,
  onAddRegion,
  onRemoveRegion,
  onAddStroke,
  onApplyCrop
}: ImageEditorCanvasProps) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointerOriginRef = useRef<{ x: number; y: number } | null>(null);
  // 裁剪/扩展可用边界：按画布四周实际空间动态计算，保证扩展区可交互
  const [cropExtend, setCropExtend] = useState(CROP_EXTEND_DEFAULT);
  // 浏览模式下的图片缩放/平移（无编辑工具激活时）
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const panRef = useRef<{
    startX: number;
    startY: number;
    viewX: number;
    viewY: number;
  } | null>(null);
  const brushPathRef = useRef<BrushPoint[]>([]);
  const [draft, setDraft] = useState<DraftRect | null>(null);
  const [previewStroke, setPreviewStroke] = useState<BrushStroke | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [cropRect, setCropRect] = useState<DraftRect | null>(null);
  const [cropDrag, setCropDrag] = useState<{
    handle: string;
    origin?: { x: number; y: number };
  } | null>(null);
  const [failedVersionIds, setFailedVersionIds] = useState<Set<string>>(
    () => new Set()
  );

  const getImageAspect = useCallback((): number => {
    const bounds = imageRef.current?.getBoundingClientRect();
    return bounds && bounds.height > 0 ? bounds.width / bounds.height : 1;
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- 动态边界只在画布尺寸变化时重算
  useEffect(() => {
    const update = () => {
      const canvas = canvasRef.current;
      const image = imageRef.current;
      if (!canvas || !image) return;
      const canvasBox = canvas.getBoundingClientRect();
      const imageBox = image.getBoundingClientRect();
      if (imageBox.height <= 0) return;
      // 扩展边界按上下可用空间计算（图片通常占满宽度，左右扩展依靠生成指令）
      const topSpace = (imageBox.top - canvasBox.top) / imageBox.height;
      const bottomSpace = (canvasBox.bottom - imageBox.bottom) / imageBox.height;
      const next = Math.max(
        0.1,
        Math.min(CROP_EXTEND_MAX, topSpace, bottomSpace)
      );
      setCropExtend((current) =>
        Math.abs(current - next) > 0.004 ? next : current
      );
    };
    update();
    const observer = new ResizeObserver(update);
    if (canvasRef.current) observer.observe(canvasRef.current);
    if (imageRef.current) observer.observe(imageRef.current);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  const drawingEnabled =
    activeTool === 'region' || activeTool === 'annotate' || activeTool === 'crop' || activeTool === 'draw';

  useEffect(() => {
    if (!drawingEnabled) {
      setDraft(null);
      brushPathRef.current = [];
      pointerOriginRef.current = null;
    }
  }, [drawingEnabled]);

  useEffect(() => {
    setImageFailed(false);
    setCropRect(null);
    setCropDrag(null);
  }, [imageUrl]);

  // 进入任意编辑工具时复位图片缩放/平移，保证工具坐标一致
  useEffect(() => {
    if (activeTool !== null) {
      setView({ scale: 1, x: 0, y: 0 });
      panRef.current = null;
    }
  }, [activeTool]);

  useEffect(() => {
    setCropRect((current) =>
      current
        ? fitCropToAspect(current, cropAspect, getImageAspect(), cropExtend)
        : current
    );
  }, [cropAspect, cropExtend, getImageAspect]);

  // 激活裁剪工具或选择比例后，自动在画布上展示默认裁剪框，
  // 用户无需再手动划出选框，可直接拖拽手柄微调。
  useEffect(() => {
    if (
      activeTool === 'crop' &&
      !cropRect &&
      !draft &&
      !cropDrag &&
      !busy
    ) {
      setCropRect(
        fitCropToAspect(
          { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
          cropAspect,
          getImageAspect(),
          cropExtend
        )
      );
    }
  }, [activeTool, busy, cropAspect, cropDrag, cropRect, cropExtend, draft, getImageAspect]);

  useEffect(() => {
    setCropRect(null);
    setCropDrag(null);
  }, [cropResetSignal]);

  // 同步实际扩展框宽高比给生成指令（ref，不触发渲染）
  useEffect(() => {
    if (cropRect) {
      const imageAspect = getImageAspect();
      const actual =
        imageAspect > 0 ? (cropRect.width / cropRect.height) * imageAspect : null;
      if (cropExtentRef) cropExtentRef.current = actual;
    }
  }, [cropRect, cropExtentRef, getImageAspect]);

  // 裁剪/扩展拖拽需要允许指针坐标超出图片边界（负值/大于 1）
  const toNormalizedRaw = useCallback(
    (event: PointerEvent | React.PointerEvent) => {
      const image = imageRef.current;
      if (!image) return { x: 0, y: 0 };
      const bounds = image.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return { x: 0, y: 0 };
      return {
        x: (event.clientX - bounds.left) / bounds.width,
        y: (event.clientY - bounds.top) / bounds.height
      };
    },
    []
  );

  const toNormalized = useCallback((event: PointerEvent | React.PointerEvent) => {
    const image = imageRef.current;
    if (!image) return { x: 0, y: 0 };
    const bounds = image.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return { x: 0, y: 0 };
    return {
      x: clamp01((event.clientX - bounds.left) / bounds.width),
      y: clamp01((event.clientY - bounds.top) / bounds.height)
    };
  }, []);

  // 浏览模式平移/缩放钳制：图片变换后的包围盒始终留在舞台内，
  // 因此默认拖拽/滚轮不会触发内层蒙版裁剪（蒙版只在裁剪与扩图模式出现）。
  const clampViewToStage = useCallback(
    (current: ViewState, next: ViewState): ViewState => {
      const stage = stageRef.current;
      const img = imageRef.current;
      if (!stage || !img) return next;
      const stageRect = stage.getBoundingClientRect();
      const imgRect = img.getBoundingClientRect();
      if (imgRect.width <= 0 || imgRect.height <= 0) return next;
      const unzoomedW = imgRect.width / current.scale;
      const unzoomedH = imgRect.height / current.scale;
      const baseLeft = imgRect.left - current.x;
      const baseTop = imgRect.top - current.y;
      const nextW = unzoomedW * next.scale;
      const nextH = unzoomedH * next.scale;
      const loX = stageRect.left - baseLeft;
      const hiX = stageRect.right - (baseLeft + nextW);
      const loY = stageRect.top - baseTop;
      const hiY = stageRect.bottom - (baseTop + nextH);
      return {
        ...next,
        x: Math.min(Math.max(next.x, Math.min(loX, hiX)), Math.max(loX, hiX)),
        y: Math.min(Math.max(next.y, Math.min(loY, hiY)), Math.max(loY, hiY))
      };
    },
    []
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLImageElement>) => {
      if (busy) return;
      if (!drawingEnabled) {
        // 浏览模式：拖拽平移图片（蒙版区域内自由移动）
        event.preventDefault();
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        panRef.current = {
          startX: event.clientX,
          startY: event.clientY,
          viewX: view.x,
          viewY: view.y
        };
        return;
      }
      event.preventDefault();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      const point = toNormalized(event);
      pointerOriginRef.current = point;
      if (activeTool === 'region' && regionMode === 'select') {
        // Select 模式：点击已有区域 = 选中；点击空白 = 开始拖出新的矩形选区
        const hit = regions.find(
          (region) =>
            point.x >= region.x &&
            point.x <= region.x + region.width &&
            point.y >= region.y &&
            point.y <= region.y + region.height
        );
        if (hit) {
          onSelectRegion(hit.id);
          return;
        }
        onSelectRegion(null);
      }
      if (activeTool === 'region' && regionMode === 'auto') {
        onAutoMaskPoint?.(point);
        return;
      }
      if (activeTool === 'crop') {
        // 裁剪/扩展拖拽由容器级 handleCropPointerDown 统一处理（含扩展区）
        return;
      }
      if (activeTool === 'draw' || (activeTool === 'region' && regionMode === 'draw')) {
        // Draw Region（绘制区域）：自由画笔涂抹，笔迹实时显示，松手提交为 brush 区域
        const isRegionBrush = activeTool === 'region';
        brushPathRef.current = [point];
        setPreviewStroke({
          id: `preview-${Date.now()}`,
          points: [point],
          size: isRegionBrush ? 16 : brushSize,
          color: isRegionBrush ? '#2997ff' : brushColor,
          region: isRegionBrush
        });
      } else {
        setDraft({ x: point.x, y: point.y, width: 0, height: 0 });
      }
    },
    [
      activeTool,
      brushColor,
      brushSize,
      busy,
      drawingEnabled,
      onAutoMaskPoint,
      onSelectRegion,
      regionMode,
      regions,
      toNormalized,
      view
    ]
  );

  // 浏览模式：滚轮以鼠标为中心缩放图片
  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (activeTool !== null || busy) return;
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      setView((current) => {
        const nextScale = Math.min(
          3,
          Math.max(0.5, current.scale * (event.deltaY < 0 ? 1.12 : 0.89))
        );
        const ratio = nextScale / current.scale;
        return clampViewToStage(current, {
          scale: nextScale,
          x: mx - (mx - current.x) * ratio,
          y: my - (my - current.y) * ratio
        });
      });
    },
    [activeTool, busy, clampViewToStage]
  );

  // 容器级裁剪/扩展事件：允许点击超出图片的扩展区域拖动手柄/移动框
  const handleCropPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (activeTool !== 'crop' || !cropRect || busy) return;
      // 只在图片及四周扩展画布区域内响应，避免拦截版本条/面板等
      const target = event.target as HTMLElement;
      if (
        target.closest(
          '.image-editor-versions, .image-editor-canvas-footer, .image-editor-canvas-toolbar'
        )
      ) {
        return;
      }
      const image = imageRef.current;
      if (!image) return;
      const imageBox = image.getBoundingClientRect();
      const extendW = imageBox.width * cropExtend;
      const extendH = imageBox.height * cropExtend;
      const px = event.clientX;
      const py = event.clientY;
      const inExtendCanvas =
        px >= imageBox.left - extendW &&
        px <= imageBox.right + extendW &&
        py >= imageBox.top - extendH &&
        py <= imageBox.bottom + extendH;
      // 手柄命中优先（扩展边界上的手柄可拖），非手柄点击才要求落在扩展画布内
      const handle = hitCropHandle(
        cropRect,
        imageBox,
        event.clientX,
        event.clientY
      );
      if (handle) {
        event.preventDefault();
        image.setPointerCapture(event.pointerId);
        const handlePoint = toNormalizedRaw(event);
        pointerOriginRef.current = handlePoint;
        setCropDrag({ handle });
        return;
      }
      if (!inExtendCanvas) return;
      event.preventDefault();
      image.setPointerCapture(event.pointerId);
      const point = toNormalizedRaw(event);
      pointerOriginRef.current = point;
      const inside =
        point.x >= cropRect.x &&
        point.x <= cropRect.x + cropRect.width &&
        point.y >= cropRect.y &&
        point.y <= cropRect.y + cropRect.height;
      if (inside) {
        setCropDrag({
          handle: 'move',
          origin: {
            x: point.x - cropRect.x,
            y: point.y - cropRect.y
          }
        });
        return;
      }
      setDraft({ x: point.x, y: point.y, width: 0, height: 0 });
    },
    [activeTool, busy, cropExtend, cropRect, toNormalizedRaw]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLImageElement>) => {
      if (panRef.current) {
        const pan = panRef.current;
        setView((current) =>
          clampViewToStage(current, {
            ...current,
            x: pan.viewX + (event.clientX - pan.startX),
            y: pan.viewY + (event.clientY - pan.startY)
          })
        );
        return;
      }
      if (!pointerOriginRef.current) return;
      if (busy) return;
      const point =
        activeTool === 'crop'
          ? toNormalizedRaw(event)
          : toNormalized(event);
      if (activeTool === 'draw' || (activeTool === 'region' && regionMode === 'draw')) {
        const current = brushPathRef.current;
        const last = current[current.length - 1];
        if (
          !last ||
          Math.abs(last.x - point.x) + Math.abs(last.y - point.y) >= 0.008
        ) {
          brushPathRef.current = [...current, point];
        }
        setPreviewStroke((current) =>
          current
            ? { ...current, points: [...current.points, point] }
            : {
                id: `preview-${Date.now()}`,
                points: [point],
                size: brushSize,
                color: brushColor
              }
        );
        return;
      }
      if (activeTool === 'crop' && cropRect && cropDrag) {
        if (cropDrag.handle === 'move' && cropDrag.origin) {
          const nextX = clamp01(point.x - cropDrag.origin.x);
          const nextY = clamp01(point.y - cropDrag.origin.y);
          setCropRect(
            clampCropRect(
              {
                x: nextX,
                y: nextY,
                width: cropRect.width,
                height: cropRect.height
              },
              cropExtend
            )
          );
        } else {
          setCropRect((current) =>
            current
              ? resizeCropRect(
                  current,
                  cropDrag.handle,
                  point,
                  cropAspect,
                  getImageAspect(),
                  cropExtend
                )
              : current
          );
        }
        return;
      }
      const origin = pointerOriginRef.current;
      const nextDraft = {
        x: Math.min(origin.x, point.x),
        y: Math.min(origin.y, point.y),
        width: Math.abs(point.x - origin.x),
        height: Math.abs(point.y - origin.y)
      };
      setDraft(
        activeTool === 'crop' && cropAspect
          ? fitCropToAspect(nextDraft, cropAspect, getImageAspect(), cropExtend)
          : nextDraft
      );
    },
    [
      activeTool,
      brushColor,
      brushSize,
      busy,
      clampViewToStage,
      cropAspect,
      cropDrag,
      cropExtend,
      cropRect,
      getImageAspect,
      regionMode,
      toNormalized,
      toNormalizedRaw
    ]
  );

  const commitPointer = useCallback(() => {
    if (panRef.current) {
      panRef.current = null;
      return;
    }
    if (!pointerOriginRef.current) return;
    pointerOriginRef.current = null;
    if (activeTool === 'draw') {
      const points = brushPathRef.current;
      brushPathRef.current = [];
      setPreviewStroke(null);
      if (points.length < 2) return;
      onAddStroke({
        id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        points,
        size: brushSize,
        color: brushColor
      });
      return;
    }
    if (activeTool === 'region' && regionMode === 'draw') {
      const points = brushPathRef.current;
      brushPathRef.current = [];
      setPreviewStroke(null);
      if (points.length < 2) return;
      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      onAddRegion({
        x,
        y,
        width: Math.max(0.01, Math.max(...xs) - x),
        height: Math.max(0.01, Math.max(...ys) - y),
        kind: 'brush',
        points
      });
      return;
    }
    if (!draft || draft.width < 0.01 || draft.height < 0.01) {
      setDraft(null);
      return;
    }
    if (activeTool === 'crop') {
      setCropRect(fitCropToAspect(draft, cropAspect, getImageAspect(), cropExtend));
      setDraft(null);
      return;
    }
    onAddRegion({ ...draft, kind: 'rect' });
    setDraft(null);
  }, [
    activeTool,
    brushColor,
    brushSize,
    cropAspect,
    cropExtend,
    draft,
    getImageAspect,
    onAddRegion,
    onAddStroke,
    regionMode
  ]);

  useEffect(() => {
    if (!cropDrag) return;
    const clear = () => setCropDrag(null);
    window.addEventListener('pointerup', clear);
    window.addEventListener('pointercancel', clear);
    return () => {
      window.removeEventListener('pointerup', clear);
      window.removeEventListener('pointercancel', clear);
    };
  }, [cropDrag]);

  const toolCaption = (() => {
    if (!activeTool || !drawingEnabled) return null;
    if (activeTool === 'crop') {
      return cropRect
        ? isEnglish
          ? 'Drag the border or handles to adjust, then Apply crop'
          : '拖动边框或手柄微调，点击「应用裁剪」完成'
        : isEnglish
          ? 'Box the area you want to keep'
          : '在画布上框选要保留的区域';
    }
    if (activeTool === 'draw')
      return isEnglish
        ? 'Paint over the area you want to change'
        : '在画布上涂抹要修改的区域';
    if (activeTool === 'region')
      return regionMode === 'draw'
        ? isEnglish
          ? 'Paint over the area to include in the region'
          : '在画布上涂抹要包含进区域的区域'
        : regionMode === 'auto'
          ? isEnglish
            ? 'Click the subject to auto-generate a mask'
            : '点击主体，AI 自动生成蒙版'
        : isEnglish
          ? 'Drag to box the region you want to change'
          : '拖拽框选要修改的区域';
    if (activeTool === 'annotate')
      return isEnglish
        ? 'Box a region, then type what should change below'
        : '框选区域后，在下方为每个区域填写指令';
    return isEnglish
      ? 'Box the region you want to change'
      : '在画布上框选要修改的区域';
  })();

  const draftStyle =
    draft && draft.width > 0 && draft.height > 0
      ? {
          left: `${draft.x * 100}%`,
          top: `${draft.y * 100}%`,
          width: `${draft.width * 100}%`,
          height: `${draft.height * 100}%`
        }
      : null;
  const activeVersionLabel =
    versions.find((version) => version.id === activeVersionId)?.label ||
    (isEnglish ? 'Source' : '源图');

  return (
    <div
      ref={canvasRef}
      className="image-editor-canvas"
      aria-label="图片编辑画布"
      onPointerDown={handleCropPointerDown}
    >
      {versions.length > 1 ? (
        <div className="image-editor-versions" aria-label={isEnglish ? 'Edit versions' : '编辑版本'}>
          <span className="image-editor-versions-label">
            {isEnglish ? 'Versions' : '版本'} · {activeVersionLabel}
          </span>
          <div className="image-editor-versions-strip">
            {versions.map((version) => (
              <button
                key={version.id}
                type="button"
                className={version.id === activeVersionId ? 'is-active' : undefined}
                title={`${version.label}${version.id === activeVersionId ? ` · ${isEnglish ? 'current' : '当前'}` : ` · ${isEnglish ? 'view' : '查看'}`}`}
                aria-label={`${version.label}${version.id === activeVersionId ? (isEnglish ? ' · current version' : ' · 当前版本') : (isEnglish ? ' · switch to this version' : ' · 切换到该版本')}`}
                aria-pressed={version.id === activeVersionId}
                onClick={() => onSelectVersion(version.id)}
                disabled={busy}
              >
                <img
                  src={version.url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className={
                    failedVersionIds.has(version.id) ? 'is-broken' : undefined
                  }
                  onError={() =>
                    setFailedVersionIds((current) => {
                      if (current.has(version.id)) return current;
                      return new Set(current).add(version.id);
                    })
                  }
                />
                {failedVersionIds.has(version.id) ? (
                  <span className="is-broken">
                    {isEnglish ? 'Expired' : '已过期'}
                  </span>
                ) : (
                  <span>
                    {version.id === 'source'
                      ? isEnglish
                        ? 'Source'
                        : '源图'
                      : version.label}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div ref={stageRef} className="image-editor-canvas-stage">
        <div
          className={`image-editor-canvas-image${
            activeTool === null ? ' is-browsing' : ''
          }`}
          onWheel={handleWheel}
        >
          {activeTool === 'crop' ? (
            <div
              className="image-editor-crop-extend-bg"
              aria-hidden="true"
              style={
                { '--crop-extend': `${cropExtend * 100}%` } as React.CSSProperties
              }
            />
          ) : null}
          <div
            className="image-editor-canvas-zoom"
            style={{
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`
            }}
          >
          <img
            ref={imageRef}
            src={imageUrl}
            alt={sourceLabel || '正在编辑的图片'}
            draggable={false}
            decoding="async"
            style={adjustmentFilter ? { filter: adjustmentFilter } : undefined}
            className={`image-editor-source-image${drawingEnabled && !busy ? ' is-drawing' : ''}`}
            onError={() => setImageFailed(true)}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={commitPointer}
            onPointerCancel={() => {
              pointerOriginRef.current = null;
              panRef.current = null;
              brushPathRef.current = [];
              setDraft(null);
            }}
          />
          {autoMaskUrl ? (
            <img
              className="image-editor-auto-mask-overlay"
              src={autoMaskUrl}
              alt=""
              aria-hidden="true"
              decoding="async"
            />
          ) : null}
          {regions.map((region, index) => (
            <div
              key={region.id}
              className={`image-editor-region is-${region.kind}${
                region.id === activeRegionId ? ' is-active' : ''
              }`}
              style={{
                left: `${region.x * 100}%`,
                top: `${region.y * 100}%`,
                width: `${region.width * 100}%`,
                height: `${region.height * 100}%`
              }}
            >
              <button
                type="button"
                className="image-editor-region-remove"
                aria-label={isEnglish ? 'Remove region' : '删除该区域'}
                title={isEnglish ? 'Remove region' : '删除该区域'}
                onClick={() => onRemoveRegion(region.id)}
              >
                <Trash2 aria-hidden="true" />
              </button>
              {region.kind === 'rect' ? (
                <span className="image-editor-region-tag">
                  {index + 1}
                </span>
              ) : null}
            </div>
          ))}
          {draftStyle ? (
            <div className="image-editor-region is-draft" style={draftStyle} />
          ) : null}
          {activeTool === 'crop' && cropRect ? (
            <div className="image-editor-crop-mask" aria-hidden="true">
              <div
                style={{
                  top: 0,
                  left: 0,
                  right: 0,
                  height: `${Math.max(0, cropRect.y * 100)}%`
                }}
              />
              <div
                style={{
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: `${Math.max(
                    0,
                    (1 - cropRect.y - cropRect.height) * 100
                  )}%`
                }}
              />
              <div
                style={{
                  top: `${Math.max(0, cropRect.y * 100)}%`,
                  left: 0,
                  width: `${Math.max(0, cropRect.x * 100)}%`,
                  height: `${Math.min(100, cropRect.height * 100)}%`
                }}
              />
              <div
                style={{
                  top: `${Math.max(0, cropRect.y * 100)}%`,
                  right: 0,
                  width: `${Math.max(
                    0,
                    (1 - cropRect.x - cropRect.width) * 100
                  )}%`,
                  height: `${Math.min(100, cropRect.height * 100)}%`
                }}
              />
            </div>
          ) : null}
          {activeTool === 'crop' && cropRect ? (
            <div
              className="image-editor-crop-box"
              style={{
                left: `${cropRect.x * 100}%`,
                top: `${cropRect.y * 100}%`,
                width: `${cropRect.width * 100}%`,
                height: `${cropRect.height * 100}%`
              }}
            >
              <i className="is-nw" />
              <i className="is-n" />
              <i className="is-ne" />
              <i className="is-e" />
              <i className="is-se" />
              <i className="is-s" />
              <i className="is-sw" />
              <i className="is-w" />
            </div>
          ) : null}
          {(activeTool === 'draw' ||
            activeTool === 'region' ||
            regions.some((region) => region.kind === 'brush')) &&
          (strokes.length > 0 ||
            previewStroke ||
            regions.some(
              (region) => region.kind === 'brush' && region.points
            )) ? (
            <svg
              className="image-editor-brush-layer"
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {strokes.map((stroke) => (
                <polyline
                  key={stroke.id}
                  className={stroke.region ? 'is-region-brush' : undefined}
                  points={stroke.points
                    .map((p) => `${p.x},${p.y}`)
                    .join(' ')}
                  stroke={stroke.color}
                  strokeWidth={stroke.size / 100 / 8}
                />
              ))}
              {regions
                .filter(
                  (region) => region.kind === 'brush' && region.points
                )
                .map((region) => (
                  <polyline
                    key={region.id}
                    className="is-region-brush"
                    points={region.points!
                      .map((p) => `${p.x},${p.y}`)
                      .join(' ')}
                  />
                ))}
              {previewStroke ? (
                <polyline
                  className={
                    previewStroke.region ? 'is-region-brush' : undefined
                  }
                  points={previewStroke.points
                    .map((p) => `${p.x},${p.y}`)
                    .join(' ')}
                  stroke={previewStroke.color}
                  strokeWidth={previewStroke.size / 100 / 8}
                />
              ) : null}
            </svg>
          ) : null}
          </div>
          {imageFailed && !busy ? (
            <div className="image-editor-canvas-expired" role="status">
              {isEnglish
                ? 'The image link may have expired. Go back to the source or upload the image again.'
                : '图片链接可能已过期，请回到源图或重新上传图片。'}
            </div>
          ) : null}
        </div>
        {busy ? (
          <div className="image-editor-canvas-busy" role="status">
            <LoaderCircle className="spin" aria-hidden="true" />
            <span>{generationLabel || '正在生成…'}</span>
          </div>
        ) : null}
      </div>
      <div className="image-editor-canvas-footer">
        <span>
          {drawingEnabled ? (
            <>
              {activeTool === 'draw' ? <Wand2 aria-hidden="true" /> : activeTool === 'crop' ? <Scan aria-hidden="true" /> : <MousePointer2 aria-hidden="true" />}
              {toolCaption}
            </>
          ) : (
            <>
              {isEnglish
                ? 'Pick Change Region, Annotate, Draw, or Crop & Expand to mark areas on the canvas.'
                : '点击「更改区域」「标注」「绘画」或「裁剪与扩展」可在画布上框选修改范围'}
            </>
          )}
        </span>
        {activeTool === 'crop' && cropRect ? (
          <button
            type="button"
            className="image-editor-canvas-crop-confirm"
            onClick={() =>
              onApplyCrop({
                id: 'crop-region',
                kind: 'rect',
                ...cropRect
              })
            }
            disabled={busy}
          >
            {isEnglish ? 'Apply crop' : '应用裁剪'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
