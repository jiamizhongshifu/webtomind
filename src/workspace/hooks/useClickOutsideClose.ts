import { useEffect, RefObject } from 'react';

/**
 * 通用 hook：点击元素外部时关闭/隐藏该元素
 *
 * @param ref      - 要监听点击范围的 DOM 元素 ref
 * @param isOpen   - 元素当前是否处于打开状态（仅在打开时注册监听）
 * @param onClose  - 点击外部时的回调（通常是将显示状态设为 false）
 */
export function useClickOutsideClose<T extends HTMLElement>(
  ref: RefObject<T>,
  isOpen: boolean,
  onClose: () => void
): void {
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [ref, isOpen, onClose]);
}
