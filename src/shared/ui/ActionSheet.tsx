import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from 'react';
import { X } from 'lucide-react';
import { clsx } from 'clsx';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion
} from 'motion/react';
import type { AnimationPlaybackControls } from 'motion/react';
import {
  motionPresets,
  projectGestureEndpoint,
  rubberband,
  SHEET_DRAG_THRESHOLD_PX
} from '@/design/motion-presets';
import { IconButton } from './IconButton';
import { useOverlayBehavior } from './useOverlayBehavior';

type PointerSample = {
  position: number;
  timestamp: number;
};

type DragState = {
  pointerId: number;
  startY: number;
  startOffset: number;
  active: boolean;
  samples: PointerSample[];
};

export interface ActionSheetProps {
  open: boolean;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  ariaLabel?: string;
  closeLabel?: string;
  className?: string;
  dragToDismiss?: boolean;
  onClose: () => void;
}

export function ActionSheet({
  open,
  title,
  description,
  children,
  ariaLabel,
  closeLabel = 'Close',
  className,
  dragToDismiss = true,
  onClose
}: ActionSheetProps) {
  const titleId = useId();
  const descriptionId = useId();
  const prefersReducedMotion = useReducedMotion();
  const y = useMotionValue(0);
  const animationRef = useRef<AnimationPlaybackControls | null>(null);
  const closingRef = useRef(false);
  const finishedCloseRef = useRef(false);
  const closeGenerationRef = useRef(0);
  const closeTimerRef = useRef<number | null>(null);
  const requestCloseRef = useRef<(velocity?: number) => void>(() => undefined);
  const dragRef = useRef<DragState | null>(null);
  const [dragReady, setDragReady] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const sheetRef = useOverlayBehavior<HTMLElement>({
    open,
    onClose: () => requestCloseRef.current()
  });

  useEffect(() => {
    animationRef.current?.stop();
    closeGenerationRef.current += 1;
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    dragRef.current = null;
    setIsDragging(false);
    setIsClosing(false);
    setDragReady(false);
    y.set(0);
    if (open) {
      closingRef.current = false;
      finishedCloseRef.current = false;
    }
    return () => {
      animationRef.current?.stop();
      closeGenerationRef.current += 1;
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [open, y]);

  const finishClose = useCallback(
    (generation: number) => {
      if (
        generation !== closeGenerationRef.current ||
        !closingRef.current ||
        finishedCloseRef.current
      ) {
        return;
      }
      finishedCloseRef.current = true;
      closeTimerRef.current = null;
      onClose();
    },
    [onClose]
  );

  const cancelClose = useCallback(() => {
    if (!closingRef.current) return;
    closeGenerationRef.current += 1;
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    closingRef.current = false;
    finishedCloseRef.current = false;
    setIsClosing(false);
  }, []);

  const requestClose = useCallback(
    (velocity = 0) => {
      if (closingRef.current) return;
      const generation = closeGenerationRef.current + 1;
      closeGenerationRef.current = generation;
      closingRef.current = true;
      setIsClosing(true);
      const sheet = sheetRef.current;
      if (!sheet || prefersReducedMotion || !dragReady) {
        closeTimerRef.current = window.setTimeout(
          () => finishClose(generation),
          motionPresets.reduced.duration * 1000
        );
        return;
      }

      const target = Math.max(sheet.getBoundingClientRect().height, 1);
      animationRef.current?.stop();
      const closeAnimation = animate(y, target, {
        ...motionPresets.sheetSpring,
        velocity: Math.max(0, velocity)
      });
      animationRef.current = closeAnimation;
      void closeAnimation.then(() => finishClose(generation));
    },
    [dragReady, finishClose, prefersReducedMotion, sheetRef, y]
  );
  requestCloseRef.current = requestClose;

  const stopDragging = useCallback(
    (event: ReactPointerEvent<HTMLElement>, cancelled = false) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const sheet = sheetRef.current;
      const current = y.get();
      const releasedAt = performance.now();
      const samples = [
        ...drag.samples,
        { position: current, timestamp: releasedAt }
      ]
        .filter((sample) => releasedAt - sample.timestamp <= 80)
        .slice(-5);
      const first = samples[0];
      const last = samples[samples.length - 1];
      const elapsed =
        first && last ? Math.max(last.timestamp - first.timestamp, 1) : 1;
      const velocity =
        first && last ? ((last.position - first.position) / elapsed) * 1000 : 0;
      const height = Math.max(sheet?.getBoundingClientRect().height || 1, 1);
      const projected = projectGestureEndpoint(current, velocity);

      dragRef.current = null;
      setIsDragging(false);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture may already have been released by the browser.
      }

      if (!cancelled && drag.active && projected > height * 0.5) {
        requestClose(velocity);
        return;
      }

      animationRef.current?.stop();
      animationRef.current = animate(y, 0, {
        ...motionPresets.sheetSpring,
        velocity: cancelled ? 0 : velocity
      });
    },
    [requestClose, sheetRef, y]
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (
        !dragToDismiss ||
        !dragReady ||
        event.button !== 0 ||
        event.isPrimary === false ||
        (event.target instanceof Element &&
          event.target.closest('button, a, input, select, textarea'))
      ) {
        return;
      }

      animationRef.current?.stop();
      cancelClose();
      const startOffset = y.get();
      dragRef.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startOffset,
        active: false,
        samples: [{ position: startOffset, timestamp: performance.now() }]
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [cancelClose, dragReady, dragToDismiss, y]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const delta = event.clientY - drag.startY;
      if (!drag.active && Math.abs(delta) < SHEET_DRAG_THRESHOLD_PX) return;
      if (!drag.active) {
        drag.active = true;
        setIsDragging(true);
      }

      event.preventDefault();
      const sheetHeight = Math.max(
        sheetRef.current?.getBoundingClientRect().height || 1,
        1
      );
      const rawPosition = drag.startOffset + delta;
      const position =
        rawPosition < 0 ? rubberband(rawPosition, sheetHeight) : rawPosition;
      y.set(position);

      const now = performance.now();
      drag.samples.push({ position, timestamp: now });
      drag.samples = drag.samples
        .filter((sample) => now - sample.timestamp <= 80)
        .slice(-5);
    },
    [sheetRef, y]
  );

  if (!open) {
    return null;
  }

  const sheet = (
    <div className="ui-action-sheet-layer" role="presentation">
      <motion.button
        type="button"
        className="ui-action-sheet-backdrop"
        aria-label={closeLabel}
        onClick={() => requestClose()}
        initial={{ opacity: 0 }}
        animate={{ opacity: isClosing ? 0 : 1 }}
        transition={{ duration: motionPresets.reduced.duration }}
      />
      <motion.section
        ref={sheetRef}
        className={clsx('ui-action-sheet', className)}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={!ariaLabel && title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        data-dragging={isDragging ? 'true' : 'false'}
        data-closing={isClosing ? 'true' : 'false'}
        data-drag-ready={dragReady ? 'true' : 'false'}
        initial={
          prefersReducedMotion ? { opacity: 0 } : { y: '100%', opacity: 0.96 }
        }
        animate={{ y: 0, opacity: isClosing ? 0 : 1 }}
        transition={
          prefersReducedMotion
            ? { duration: motionPresets.reduced.duration }
            : motionPresets.uiSpring
        }
        style={dragReady ? { y } : undefined}
        onAnimationComplete={() => {
          if (!closingRef.current) {
            y.set(0);
            setDragReady(true);
          }
        }}
      >
        <header
          className="ui-action-sheet__header"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={(event) => stopDragging(event)}
          onPointerCancel={(event) => stopDragging(event, true)}
        >
          {dragToDismiss ? (
            <span className="ui-action-sheet__grabber" aria-hidden="true" />
          ) : null}
          <div>
            {title ? (
              <h2 id={titleId} className="ui-action-sheet__title">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p id={descriptionId} className="ui-action-sheet__description">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton
            type="button"
            variant="ghost"
            label={closeLabel}
            icon={<X />}
            onClick={() => requestClose()}
          />
        </header>
        <div className="ui-action-sheet__body">{children}</div>
      </motion.section>
    </div>
  );

  if (typeof document === 'undefined') {
    return sheet;
  }

  return createPortal(sheet, document.body);
}
