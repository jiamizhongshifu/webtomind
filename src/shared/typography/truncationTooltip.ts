const MARKED = '[data-truncate], .type-truncate';
const MAX_ANCESTOR_DEPTH = 3;

function isEllipsisLabel(element: HTMLElement) {
  const style = getComputedStyle(element);
  if (style.textOverflow !== 'ellipsis') return false;
  if (style.overflowX === 'visible' && style.overflowY === 'visible') {
    return false;
  }
  return element.scrollWidth > element.clientWidth + 1;
}

/**
 * 只在文本确实被截断时补一个原生 title，避免未截断的标签也弹提示。
 * 显式标记（data-truncate / .type-truncate）优先；其余元素按
 * text-overflow: ellipsis + 实际溢出自动识别，覆盖已有的截断标签。
 */
export function installTruncationTooltip() {
  if (typeof document === 'undefined') return () => undefined;

  const handlePointerOver = (event: PointerEvent) => {
    let element = event.target as HTMLElement | null;
    for (let depth = 0; element && depth < MAX_ANCESTOR_DEPTH; depth += 1) {
      if (
        !element.title &&
        (element.matches?.(MARKED) || isEllipsisLabel(element)) &&
        element.scrollWidth > element.clientWidth + 1
      ) {
        const text = element.textContent?.trim();
        if (text) {
          element.title = text;
          return;
        }
      }
      element = element.parentElement;
    }
  };

  document.addEventListener('pointerover', handlePointerOver, {
    passive: true
  });
  return () => document.removeEventListener('pointerover', handlePointerOver);
}
