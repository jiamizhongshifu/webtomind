import { useEffect, useRef } from 'react';

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) {
    return [];
  }

  return Array.from(
    container.querySelectorAll<HTMLElement>(focusableSelector)
  ).filter((element) => {
    const style = window.getComputedStyle(element);
    return (
      element.tabIndex >= 0 &&
      style.visibility !== 'hidden' &&
      style.display !== 'none'
    );
  });
}

export interface OverlayBehaviorOptions {
  open: boolean;
  closeDisabled?: boolean;
  onClose: () => void;
}

export function useOverlayBehavior<T extends HTMLElement>({
  open,
  closeDisabled = false,
  onClose
}: OverlayBehaviorOptions) {
  const containerRef = useRef<T | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open || typeof document === 'undefined') {
      return undefined;
    }

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    const previousScrollbarGutter =
      document.documentElement.style.scrollbarGutter;
    document.documentElement.style.scrollbarGutter = 'stable';
    document.body.style.overflow = 'hidden';

    // Suspense may mount the shell before its input. Keep the shell focused
    // until a focusable child arrives, without stealing subsequent user focus.
    const observer = new MutationObserver(focusInitialElement);
    function focusInitialElement() {
      const container = containerRef.current;
      if (!container) return;

      const [firstFocusable] = getFocusableElements(container);
      if (
        document.activeElement === container ||
        !container.contains(document.activeElement)
      ) {
        (firstFocusable ?? container).focus({ preventScroll: true });
      }
      if (firstFocusable) observer.disconnect();
    }
    if (containerRef.current) {
      observer.observe(containerRef.current, {
        childList: true,
        subtree: true
      });
    }
    const frame = window.requestAnimationFrame(focusInitialElement);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.scrollbarGutter = previousScrollbarGutter;
      previouslyFocusedRef.current?.focus({ preventScroll: true });
      previouslyFocusedRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (!closeDisabled) {
          event.preventDefault();
          onClose();
        }
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusableElements = getFocusableElements(containerRef.current);
      if (focusableElements.length === 0) {
        event.preventDefault();
        containerRef.current?.focus({ preventScroll: true });
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (
        !containerRef.current?.contains(activeElement) ||
        activeElement === containerRef.current
      ) {
        event.preventDefault();
        (event.shiftKey ? lastElement : firstElement).focus();
      } else if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeDisabled, onClose, open]);

  return containerRef;
}
