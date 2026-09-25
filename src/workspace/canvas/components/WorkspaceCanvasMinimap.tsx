/*
 * Adapted from basketikun/infinite-canvas:
 * web/src/app/(user)/canvas/components/canvas-mini-map.tsx
 * Source: https://github.com/basketikun/infinite-canvas
 * License: GNU Affero General Public License v3.0.
 */

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from 'react';
import { CanvasNodeType, type CanvasNodeData, type ViewportTransform } from '../types';

export function WorkspaceCanvasMinimap({
  nodes,
  viewport,
  viewportSize,
  selectedNodeIds,
  onViewportChange
}: {
  nodes: CanvasNodeData[];
  viewport: ViewportTransform;
  viewportSize: { width: number; height: number };
  selectedNodeIds: string[];
  onViewportChange: (viewport: ViewportTransform) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const width = 200;
  const height = 132;

  const { worldBounds, scale, offset } = useMemo(() => {
    if (!nodes.length) {
      return {
        worldBounds: { x: -500, y: -500, w: 1000, h: 1000 },
        scale: 0.132,
        offset: { x: 34, y: 0 }
      };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    nodes.forEach((node) => {
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + node.width);
      maxY = Math.max(maxY, node.position.y + node.height);
    });

    minX -= 500;
    minY -= 500;
    maxX += 500;
    maxY += 500;

    const boundsWidth = maxX - minX;
    const boundsHeight = maxY - minY;
    const nextScale = Math.min(width / boundsWidth, height / boundsHeight);
    const mapContentW = boundsWidth * nextScale;
    const mapContentH = boundsHeight * nextScale;

    return {
      worldBounds: { x: minX, y: minY, w: boundsWidth, h: boundsHeight },
      scale: nextScale,
      offset: {
        x: (width - mapContentW) / 2,
        y: (height - mapContentH) / 2
      }
    };
  }, [nodes]);

  const toMinimap = useCallback(
    (worldX: number, worldY: number) => ({
      x: (worldX - worldBounds.x) * scale + offset.x,
      y: (worldY - worldBounds.y) * scale + offset.y
    }),
    [offset.x, offset.y, scale, worldBounds.x, worldBounds.y]
  );

  const toWorld = useCallback(
    (minimapX: number, minimapY: number) => ({
      x: (minimapX - offset.x) / scale + worldBounds.x,
      y: (minimapY - offset.y) / scale + worldBounds.y
    }),
    [offset.x, offset.y, scale, worldBounds.x, worldBounds.y]
  );

  const viewportRect = useMemo(() => {
    const vx = -viewport.x / viewport.k;
    const vy = -viewport.y / viewport.k;
    const vw = viewportSize.width / viewport.k;
    const vh = viewportSize.height / viewport.k;
    const p1 = toMinimap(vx, vy);
    const p2 = toMinimap(vx + vw, vy + vh);

    return {
      x: p1.x,
      y: p1.y,
      w: Math.max(p2.x - p1.x, 4),
      h: Math.max(p2.y - p1.y, 4)
    };
  }, [toMinimap, viewport.k, viewport.x, viewport.y, viewportSize.height, viewportSize.width]);

  const updateViewportFromEvent = (event: ReactPointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const world = toWorld(event.clientX - rect.left, event.clientY - rect.top);
    onViewportChange({
      x: viewportSize.width / 2 - world.x * viewport.k,
      y: viewportSize.height / 2 - world.y * viewport.k,
      k: viewport.k
    });
  };

  return (
    <div
      className="absolute bottom-4 left-4 z-20 hidden overflow-hidden rounded-2xl border border-stone-200 bg-white/92 shadow-lg shadow-slate-950/10 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90 md:block"
      style={{ width, height }}
      data-canvas-no-zoom
    >
      <div
        ref={containerRef}
        className="relative h-full w-full cursor-crosshair bg-[#f3eee7] dark:bg-slate-950"
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          setIsDragging(true);
          updateViewportFromEvent(event);
        }}
        onPointerMove={(event) => {
          if (isDragging) updateViewportFromEvent(event);
        }}
        onPointerUp={() => setIsDragging(false)}
        onPointerLeave={() => setIsDragging(false)}
      >
        {nodes.map((node) => {
          const pos = toMinimap(node.position.x, node.position.y);
          const color =
            node.type === CanvasNodeType.Image
              ? '#f43f5e'
              : node.type === CanvasNodeType.Video
                ? '#f97316'
                : node.type === CanvasNodeType.Audio
                  ? '#a855f7'
                  : node.type === CanvasNodeType.Config
                    ? '#60a5fa'
                    : '#64748b';
          const selected = selectedNodeIds.includes(node.id);
          return (
            <div
              key={node.id}
              className="absolute rounded-[2px]"
              style={{
                left: pos.x,
                top: pos.y,
                width: Math.max(node.width * scale, selected ? 5 : 3),
                height: Math.max(node.height * scale, selected ? 5 : 3),
                backgroundColor: selected ? '#0f172a' : color,
                opacity: selected ? 0.95 : 0.75
              }}
            />
          );
        })}
        <div
          className="pointer-events-none absolute border border-orange-500 bg-orange-500/10"
          style={{
            left: viewportRect.x,
            top: viewportRect.y,
            width: viewportRect.w,
            height: viewportRect.h
          }}
        />
      </div>
    </div>
  );
}
