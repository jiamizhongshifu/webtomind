import { useEffect, useMemo, useRef } from 'react';
import PhotoSwipeLightbox from 'photoswipe/lightbox';
import PhotoSwipe from 'photoswipe';
import 'photoswipe/style.css';

export interface PhotoSwipeViewerItem {
  src: string;
  width?: number;
  height?: number;
  alt?: string;
}

interface PhotoSwipeViewerProps {
  items: PhotoSwipeViewerItem[];
  index: number;
  onClose: () => void;
  onIndexChange?: (index: number) => void;
  onDownload?: (index: number) => void;
  onEdit?: (index: number) => void;
}

const DOWNLOAD_ICON =
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

const EDIT_ICON =
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';

/**
 * PhotoSwipe 5 统一全屏图片预览（滑动/捏合缩放/全屏手势）。
 * items 引用应保持稳定：仅通过 index 变化切换当前图。
 */
export function PhotoSwipeViewer({
  items,
  index,
  onClose,
  onIndexChange,
  onDownload,
  onEdit
}: PhotoSwipeViewerProps) {
  const callbacksRef = useRef({ onClose, onIndexChange, onDownload, onEdit });
  callbacksRef.current = { onClose, onIndexChange, onDownload, onEdit };
  const indexRef = useRef(index);
  indexRef.current = index;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  // 父级常以内联 map 传 items（每次渲染新数组），按 src 序列生成稳定键，
  // 避免父级重渲染导致 PhotoSwipe 每次销毁重开。
  const itemsKey = useMemo(
    () => items.map((item) => item.src).join('\u0001'),
    [items]
  );

  useEffect(() => {
    const currentItems = itemsRef.current;
    if (currentItems.length === 0) return;
    const startIndex = Math.min(
      Math.max(0, indexRef.current),
      currentItems.length - 1
    );
    const lightbox = new PhotoSwipeLightbox({
      dataSource: currentItems.map((item) => ({
        src: item.src,
        width: item.width,
        height: item.height,
        alt: item.alt
      })),
      index: startIndex,
      pswpModule: PhotoSwipe,
      loop: false,
      bgOpacity: 0.92,
      showHideAnimationType: 'fade',
      preload: [1, 1]
    });

    lightbox.on('close', () => callbacksRef.current.onClose());
    lightbox.on('change', () => {
      callbacksRef.current.onIndexChange?.(
        lightbox.pswp?.currIndex ?? 0
      );
    });
    lightbox.on('uiRegister', () => {
      const pswp = lightbox.pswp;
      if (pswp?.ui) {
        if (callbacksRef.current.onEdit) {
          pswp.ui.registerElement({
            name: 'edit-button',
            className: 'pswp__button--edit',
            order: 8,
            isButton: true,
            appendTo: 'bar',
            html: { inner: EDIT_ICON, isCustomSVG: true, size: 24 },
            title: '编辑',
            ariaLabel: '编辑',
            onClick: () =>
              callbacksRef.current.onEdit?.(pswp.currIndex)
          });
        }
        if (callbacksRef.current.onDownload) {
          pswp.ui.registerElement({
            name: 'download-button',
            className: 'pswp__button--download',
            order: 9,
            isButton: true,
            appendTo: 'bar',
            html: { inner: DOWNLOAD_ICON, isCustomSVG: true, size: 24 },
            title: '下载',
            ariaLabel: '下载',
            onClick: () =>
              callbacksRef.current.onDownload?.(
                pswp.currIndex
              )
          });
        }
      }
    });

    lightbox.init();
    lightbox.loadAndOpen(startIndex);

    return () => {
      lightbox.destroy();
    };
    // 仅在图片集合（src 序列）变化时重建；index 变化由父级传入并同步
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey]);

  return null;
}
