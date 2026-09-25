import '@testing-library/jest-dom';
import { vi } from 'vitest';

// jsdom 无 canvas 上下文，canvas-confetti 只应在真实浏览器执行。
vi.mock('canvas-confetti', () => ({
  default: vi.fn()
}));

if (typeof window !== 'undefined' && !window.matchMedia) {
  const noop = () => undefined;
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: noop,
      removeListener: noop,
      addEventListener: noop,
      removeEventListener: noop,
      dispatchEvent: () => false
    })
  });
}

// jsdom 未实现 ResizeObserver / scrollIntoView，assistant-ui 视口会自动滚动，
// 测试环境用 no-op 桩代替即可（真实浏览器行为不受影响）。
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    value: ResizeObserverMock
  });
}

if (
  typeof Element !== 'undefined' &&
  !Element.prototype.scrollIntoView
) {
  Element.prototype.scrollIntoView = () => {};
}

if (typeof Element !== 'undefined' && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}
