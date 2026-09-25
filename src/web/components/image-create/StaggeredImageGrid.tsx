import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type HTMLAttributes
} from 'react';
import { animate, stagger } from 'motion';
import { useReducedMotion } from 'motion/react';

const REVEALED_ATTRIBUTE = 'data-grid-revealed';
const MAX_STAGGER_WINDOW_SECONDS = 0.28;
const DEFAULT_MAX_ANIMATED_ITEMS = 18;

interface StaggeredImageGridProps extends HTMLAttributes<HTMLDivElement> {
  observeAdditions?: boolean;
  maxAnimatedItems?: number;
}

function clearMotionStyles(item: HTMLElement) {
  item.style.removeProperty('opacity');
  item.style.removeProperty('transform');
}

export const StaggeredImageGrid = forwardRef<
  HTMLDivElement,
  StaggeredImageGridProps
>(function StaggeredImageGrid(
  {
    children,
    observeAdditions = false,
    maxAnimatedItems = DEFAULT_MAX_ANIMATED_ITEMS,
    ...props
  },
  forwardedRef
) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = useReducedMotion();

  useImperativeHandle(forwardedRef, () => gridRef.current as HTMLDivElement, []);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return undefined;

    const runningAnimations = new Set<{ stop: () => void }>();
    const revealedItems = new Set<HTMLElement>();
    const pendingItems = new Set<HTMLElement>();
    const isCompactMotion = window.matchMedia(
      '(max-width: 800px), (pointer: coarse)'
    ).matches;
    const verticalOffset = isCompactMotion ? 8 : 10;
    let frameId: number | null = null;

    const showImmediately = (items: HTMLElement[]) => {
      items.forEach(clearMotionStyles);
    };

    const flushPendingItems = () => {
      frameId = null;
      const connectedItems = Array.from(pendingItems).filter((item) =>
        grid.contains(item)
      );
      pendingItems.clear();
      if (connectedItems.length === 0) return;

      const animatedItems = connectedItems.slice(0, maxAnimatedItems);
      showImmediately(connectedItems.slice(maxAnimatedItems));
      if (animatedItems.length === 0) return;

      const staggerStep = Math.min(
        0.05,
        MAX_STAGGER_WINDOW_SECONDS /
          Math.max(animatedItems.length - 1, 1)
      );
      const controls = animate(
        animatedItems,
        {
          opacity: [0, 1],
          y: [verticalOffset, 0],
          ...(isCompactMotion ? {} : { rotate: [-1.25, 0] })
        },
        {
          duration: 0.32,
          delay: stagger(staggerStep, { from: 'center' }),
          ease: [0.22, 1, 0.36, 1]
        }
      );
      runningAnimations.add(controls);
      const finish = () => {
        runningAnimations.delete(controls);
        showImmediately(animatedItems);
      };
      void controls.then(finish, finish);
    };

    const queueItems = (items: HTMLElement[]) => {
      items.forEach((item) => pendingItems.add(item));
      if (frameId === null) {
        frameId = window.requestAnimationFrame(flushPendingItems);
      }
    };

    const intersectionObserver =
      !prefersReducedMotion &&
      typeof window.IntersectionObserver === 'function'
        ? new IntersectionObserver(
            (entries) => {
              const visibleItems = entries.flatMap((entry) => {
                if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) {
                  return [];
                }
                intersectionObserver?.unobserve(entry.target);
                return [entry.target];
              });
              queueItems(visibleItems);
            },
            { threshold: 0.08 }
          )
        : null;

    const registerNewItems = () => {
      const items = Array.from(grid.children).filter(
        (item): item is HTMLElement =>
          item instanceof HTMLElement &&
          !item.hasAttribute(REVEALED_ATTRIBUTE)
      );
      if (items.length === 0) return;

      items.forEach((item) => {
        item.setAttribute(REVEALED_ATTRIBUTE, 'true');
        revealedItems.add(item);
      });

      if (prefersReducedMotion) {
        showImmediately(items);
        return;
      }

      items.forEach((item) => {
        item.style.opacity = '0';
        item.style.transform = isCompactMotion
          ? `translateY(${verticalOffset}px)`
          : `translateY(${verticalOffset}px) rotate(-1.25deg)`;
      });

      if (intersectionObserver) {
        items.forEach((item) => intersectionObserver.observe(item));
      } else {
        queueItems(items);
      }
    };

    registerNewItems();
    const mutationObserver = observeAdditions
      ? new MutationObserver(registerNewItems)
      : null;
    mutationObserver?.observe(grid, { childList: true });

    return () => {
      mutationObserver?.disconnect();
      intersectionObserver?.disconnect();
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      runningAnimations.forEach((controls) => controls.stop());
      revealedItems.forEach((item) => {
        item.removeAttribute(REVEALED_ATTRIBUTE);
        clearMotionStyles(item);
      });
    };
  }, [maxAnimatedItems, observeAdditions, prefersReducedMotion]);

  return (
    <div ref={gridRef} {...props}>
      {children}
    </div>
  );
});

StaggeredImageGrid.displayName = 'StaggeredImageGrid';
