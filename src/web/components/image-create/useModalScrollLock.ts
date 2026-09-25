import { useEffect } from 'react';

export function useModalScrollLock(open: boolean) {
  useEffect(() => {
    if (!open || typeof document === 'undefined') {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const previousScrollbarGutter =
      document.documentElement.style.scrollbarGutter;
    document.documentElement.style.scrollbarGutter = 'auto';
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.scrollbarGutter =
        previousScrollbarGutter;
    };
  }, [open]);
}
