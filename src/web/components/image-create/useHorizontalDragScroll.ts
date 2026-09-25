import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
} from 'react';
import {
  projectGestureEndpoint,
  SHEET_DRAG_THRESHOLD_PX
} from '@/design/motion-presets';

type PointerSample = {
  position: number;
  timestamp: number;
};

type DragState = {
  active: boolean;
  pointerId: number;
  startX: number;
  startY: number;
  scrollLeft: number;
  samples: PointerSample[];
};

function createIdleDragState(): DragState {
  return {
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    samples: []
  };
}

export function useHorizontalDragScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const dragStateRef = useRef<DragState>(createIdleDragState());
  const momentumFrameRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);

  const stopMomentum = useCallback(() => {
    if (momentumFrameRef.current !== null) {
      window.cancelAnimationFrame(momentumFrameRef.current);
      momentumFrameRef.current = null;
    }
  }, []);

  useEffect(() => stopMomentum, [stopMomentum]);

  const animateTo = useCallback(
    (element: T, target: number) => {
      stopMomentum();
      if (
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
        Math.abs(target - element.scrollLeft) < 1
      ) {
        return;
      }

      const start = element.scrollLeft;
      const distance = target - start;
      const startedAt = performance.now();
      const duration = Math.min(360, Math.max(180, Math.abs(distance) * 0.32));
      const tick = (timestamp: number) => {
        const progress = Math.min(1, (timestamp - startedAt) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        element.scrollLeft = start + distance * eased;
        if (progress < 1) {
          momentumFrameRef.current = window.requestAnimationFrame(tick);
        } else {
          momentumFrameRef.current = null;
        }
      };
      momentumFrameRef.current = window.requestAnimationFrame(tick);
    },
    [stopMomentum]
  );

  const stopDragging = useCallback(
    (event: ReactPointerEvent<T>, cancelled = false) => {
      const state = dragStateRef.current;
      const element = ref.current;
      if (state.pointerId !== event.pointerId) return;

      const releasedAt = performance.now();
      const samples = [
        ...state.samples,
        ...(element
          ? [{ position: element.scrollLeft, timestamp: releasedAt }]
          : [])
      ]
        .filter((sample) => releasedAt - sample.timestamp <= 80)
        .slice(-5);
      const first = samples[0];
      const last = samples[samples.length - 1];
      const elapsed =
        first && last ? Math.max(last.timestamp - first.timestamp, 1) : 1;
      const velocity =
        first && last
          ? Math.max(
              -4000,
              Math.min(
                4000,
                ((last.position - first.position) / elapsed) * 1000
              )
            )
          : 0;

      dragStateRef.current = createIdleDragState();
      if (element) {
        element.dataset.dragging = 'false';
        element.dataset.dragIntent = 'idle';
        try {
          element.releasePointerCapture(event.pointerId);
        } catch {
          // The pointer may already have been released by the browser.
        }
        if (state.active) {
          suppressClickRef.current = true;
          if (!cancelled) {
            const maxScrollLeft = Math.max(
              0,
              element.scrollWidth - element.clientWidth
            );
            const projected = Math.max(
              0,
              Math.min(
                maxScrollLeft,
                projectGestureEndpoint(element.scrollLeft, velocity)
              )
            );
            animateTo(element, projected);
          }
        }
      }
    },
    [animateTo]
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<T>) => {
      if (event.button !== 0 || event.isPrimary === false) return;
      const element = ref.current;
      if (!element || element.scrollWidth <= element.clientWidth) return;

      stopMomentum();
      suppressClickRef.current = false;
      dragStateRef.current = {
        active: false,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: element.scrollLeft,
        samples: []
      };
      element.dataset.dragging = 'false';
      element.dataset.dragIntent = 'pending';
      element.setPointerCapture?.(event.pointerId);
    },
    [stopMomentum]
  );

  const onPointerMove = useCallback((event: ReactPointerEvent<T>) => {
    const state = dragStateRef.current;
    const element = ref.current;
    if (!element || state.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - state.startX;
    const deltaY = event.clientY - state.startY;
    if (
      !state.active &&
      Math.max(Math.abs(deltaX), Math.abs(deltaY)) < SHEET_DRAG_THRESHOLD_PX
    ) {
      return;
    }
    if (!state.active && Math.abs(deltaY) > Math.abs(deltaX)) {
      dragStateRef.current = createIdleDragState();
      suppressClickRef.current = true;
      element.dataset.dragging = 'false';
      element.dataset.dragIntent = 'vertical';
      try {
        element.releasePointerCapture(event.pointerId);
      } catch {
        // Touch scrolling may have already transferred control to the browser.
      }
      return;
    }
    if (!state.active) {
      state.active = true;
      state.samples = [
        { position: state.scrollLeft, timestamp: performance.now() }
      ];
      element.dataset.dragging = 'true';
      element.dataset.dragIntent = 'active';
    }

    event.preventDefault();
    element.scrollLeft = state.scrollLeft - deltaX;
    const now = performance.now();
    state.samples.push({ position: element.scrollLeft, timestamp: now });
    state.samples = state.samples
      .filter((sample) => now - sample.timestamp <= 80)
      .slice(-5);
  }, []);

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<T>) => {
      stopDragging(event);
    },
    [stopDragging]
  );

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<T>) => {
      stopDragging(event, true);
    },
    [stopDragging]
  );

  const onClickCapture = useCallback((event: ReactMouseEvent<T>) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return {
    ref,
    dragScrollProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onClickCapture
    }
  };
}
