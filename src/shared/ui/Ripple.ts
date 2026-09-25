import type { KeyboardEventHandler, PointerEventHandler } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

interface RippleHandlers<T extends HTMLElement> {
  disabled?: boolean;
  onKeyDown?: KeyboardEventHandler<T>;
  onPointerDown?: PointerEventHandler<T>;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(REDUCED_MOTION_QUERY).matches
  );
}

function isDisabled(target: HTMLElement): boolean {
  return (
    target.hasAttribute('disabled') ||
    target.getAttribute('aria-disabled') === 'true'
  );
}

function addRipple(
  target: HTMLElement,
  clientPoint?: { clientX: number; clientY: number }
): void {
  if (prefersReducedMotion() || isDisabled(target)) return;

  const bounds = target.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return;

  const x = clientPoint
    ? Math.min(Math.max(clientPoint.clientX - bounds.left, 0), bounds.width)
    : bounds.width / 2;
  const y = clientPoint
    ? Math.min(Math.max(clientPoint.clientY - bounds.top, 0), bounds.height)
    : bounds.height / 2;
  const radius = Math.hypot(
    Math.max(x, bounds.width - x),
    Math.max(y, bounds.height - y)
  );

  const container = document.createElement('span');
  container.className = 'ui-ripple-container';
  container.setAttribute('aria-hidden', 'true');

  const ripple = document.createElement('span');
  ripple.className = 'ui-ripple';
  ripple.style.setProperty('--ui-ripple-x', `${x}px`);
  ripple.style.setProperty('--ui-ripple-y', `${y}px`);
  ripple.style.setProperty('--ui-ripple-size', `${radius * 2}px`);
  ripple.addEventListener('animationend', () => container.remove(), {
    once: true
  });
  container.append(ripple);
  target.append(container);
}

export function createRippleHandlers<T extends HTMLElement>({
  disabled = false,
  onKeyDown,
  onPointerDown
}: RippleHandlers<T>) {
  return {
    onPointerDown: ((event) => {
      onPointerDown?.(event);
      if (disabled || event.defaultPrevented || event.button !== 0) return;
      addRipple(event.currentTarget, event);
    }) satisfies PointerEventHandler<T>,
    onKeyDown: ((event) => {
      onKeyDown?.(event);
      if (
        disabled ||
        event.defaultPrevented ||
        event.repeat ||
        (event.key !== 'Enter' && event.key !== ' ')
      ) {
        return;
      }
      addRipple(event.currentTarget);
    }) satisfies KeyboardEventHandler<T>
  };
}
