/*
 * Adapted from basketikun/infinite-canvas:
 * web/src/app/(user)/canvas/components/infinite-canvas.tsx
 * Source: https://github.com/basketikun/infinite-canvas
 * License: GNU Affero General Public License v3.0.
 */

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  type Ref
} from 'react';
import type { ViewportTransform } from '../types';

type BackgroundMode = 'dots' | 'lines' | 'blank';

type WorkspaceInfiniteCanvasProps = {
  containerRef: RefObject<HTMLDivElement | null>;
  viewport: ViewportTransform;
  backgroundMode?: BackgroundMode;
  onViewportChange: (viewport: ViewportTransform) => void;
  onCanvasDeselect?: () => void;
  onPointerMove?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onDoubleClick?: () => void;
  children: ReactNode;
};

export function WorkspaceInfiniteCanvas({
  containerRef,
  viewport,
  backgroundMode = 'dots',
  onViewportChange,
  onCanvasDeselect,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onDoubleClick,
  children
}: WorkspaceInfiniteCanvasProps) {
  const panState = useRef({
    isPanning: false,
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
    hasMoved: false
  });
  const scaleRef = useRef(viewport.k);
  const frameRef = useRef<number | null>(null);
  const nextViewportRef = useRef<ViewportTransform | null>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  useEffect(() => {
    scaleRef.current = viewport.k;
  }, [viewport.k]);

  useEffect(
    () => () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    },
    []
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      setIsSpacePressed(true);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setIsSpacePressed(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-canvas-no-zoom]')) return;

    const delta = -event.deltaY;
    const factor = Math.pow(1.1, delta / 100);
    const newScale = Math.min(Math.max(viewport.k * factor, 0.05), 5);
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const worldX = (mouseX - viewport.x) / viewport.k;
    const worldY = (mouseY - viewport.y) / viewport.k;

    onViewportChange({
      x: mouseX - worldX * newScale,
      y: mouseY - worldY * newScale,
      k: newScale
    });
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-canvas-no-zoom]')) return;

    const isBackgroundClick = !target?.closest(
      '[data-node-id],[data-connection-id]'
    );
    if (
      event.button === 1 ||
      (event.button === 0 && !isSpacePressed && isBackgroundClick)
    ) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      panState.current = {
        isPanning: true,
        startX: event.clientX,
        startY: event.clientY,
        initialX: viewport.x,
        initialY: viewport.y,
        hasMoved: false
      };
      document.body.style.cursor = 'grabbing';
      return;
    }

    if (event.button === 0 && isSpacePressed && isBackgroundClick) {
      event.preventDefault();
    }
  };

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!panState.current.isPanning) return;

      const dx = event.clientX - panState.current.startX;
      const dy = event.clientY - panState.current.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        panState.current.hasMoved = true;
      }

      nextViewportRef.current = {
        x: panState.current.initialX + dx,
        y: panState.current.initialY + dy,
        k: scaleRef.current
      };
      if (frameRef.current) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        if (nextViewportRef.current) onViewportChange(nextViewportRef.current);
      });
    };

    const handlePointerUp = () => {
      if (!panState.current.isPanning) return;

      if (!panState.current.hasMoved) {
        onCanvasDeselect?.();
      }
      panState.current.isPanning = false;
      document.body.style.cursor = 'default';
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [onCanvasDeselect, onViewportChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const preventWheelScroll = (event: WheelEvent) => event.preventDefault();
    container.addEventListener('wheel', preventWheelScroll, { passive: false });
    return () => container.removeEventListener('wheel', preventWheelScroll);
  }, [containerRef]);

  return (
    <div
      ref={containerRef as Ref<HTMLDivElement>}
      className="relative h-full w-full cursor-grab select-none overflow-hidden active:cursor-grabbing"
      onPointerDown={handlePointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onWheel={handleWheel}
      onDoubleClick={onDoubleClick}
    >
      <CanvasGrid viewport={viewport} mode={backgroundMode} />
      <div
        className="absolute origin-top-left"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.k})`
        }}
      >
        {children}
      </div>
    </div>
  );
}

function CanvasGrid({
  viewport,
  mode
}: {
  viewport: ViewportTransform;
  mode: BackgroundMode;
}) {
  if (mode === 'blank') return null;

  const gridSize = 48 * viewport.k;
  const x = viewport.x % gridSize;
  const y = viewport.y % gridSize;
  const dotSize = viewport.k < 0.12 ? 0.8 : 1.15;
  const backgroundImage =
    mode === 'dots'
      ? `radial-gradient(circle, rgba(82, 74, 63, 0.25) ${dotSize}px, transparent ${dotSize + 0.2}px)`
      : 'linear-gradient(rgba(82, 74, 63, 0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(82, 74, 63, 0.12) 1px, transparent 1px)';

  return (
    <div
      className="pointer-events-none absolute inset-0 opacity-60 dark:opacity-25"
      style={{
        backgroundImage,
        backgroundSize: `${gridSize}px ${gridSize}px`,
        backgroundPosition: `${x}px ${y}px`
      }}
    />
  );
}
