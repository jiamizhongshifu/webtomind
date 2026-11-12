import { useEffect, useRef, type RefObject } from 'react';

const layers: HTMLElement[] = [];
const handledKeys = new WeakSet<KeyboardEvent>();
let scrollLocks = 0;
let savedOverflow = '';
let savedGutter = '';

function isTopLayer(container: HTMLElement | null) {
  if (!container || layers.at(-1) !== container) return false;
  // Portalled Radix dialogs/popovers may sit above a custom modal.
  const active = document.activeElement;
  return !(
    active instanceof Element &&
    !container.contains(active) &&
    active.closest(
      '[data-radix-popper-content-wrapper], [role="dialog"], [role="alertdialog"]'
    )
  );
}

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
  modal?: boolean;
  activationKey?: string | null;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export function useOverlayBehavior<T extends HTMLElement>({
  open,
  closeDisabled = false,
  onClose,
  modal = true,
  activationKey,
  returnFocusRef
}: OverlayBehaviorOptions) {
  const containerRef = useRef<T | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open || typeof document === 'undefined') {
      return undefined;
    }

    previouslyFocusedRef.current =
      returnFocusRef?.current ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    const container = containerRef.current;
    if (container) layers.push(container);
    if (modal && scrollLocks++ === 0) {
      savedOverflow = document.body.style.overflow;
      savedGutter = document.documentElement.style.scrollbarGutter;
      document.documentElement.style.scrollbarGutter = 'stable';
      document.body.style.overflow = 'hidden';
    }

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
      const index = container ? layers.indexOf(container) : -1;
      const wasTop = index === layers.length - 1;
      if (index >= 0) layers.splice(index, 1);
      if (modal && --scrollLocks === 0) {
        document.body.style.overflow = savedOverflow;
        document.documentElement.style.scrollbarGutter = savedGutter;
      }
      if (wasTop && previouslyFocusedRef.current?.isConnected) {
        previouslyFocusedRef.current.focus({ preventScroll: true });
      }
      previouslyFocusedRef.current = null;
    };
  }, [open, modal, returnFocusRef, activationKey]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (handledKeys.has(event) || !isTopLayer(containerRef.current)) return;
      if (event.defaultPrevented && event.key !== 'Escape') return;
      if (event.key === 'Escape') {
        if (!closeDisabled) {
          handledKeys.add(event);
          event.preventDefault();
          onClose();
        }
        return;
      }

      if (!modal || event.key !== 'Tab') {
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

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [closeDisabled, onClose, open, modal]);

  return containerRef;
}
