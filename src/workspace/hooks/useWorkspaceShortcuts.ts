import { useState, useRef, useCallback } from 'react';
import { createLogger } from '@/utils/logger';
import { getAllShortcuts } from '@/services/workspace-api';
import { getCachedShortcuts } from '@/services/workspace-cache';
import type { Shortcut } from '@/services/database';

const log = createLogger('useWorkspaceShortcuts');

export function useWorkspaceShortcuts() {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const shortcutsResyncTimerRef = useRef<number | null>(null);
  const loadShortcutsRef = useRef<
    ((forceRefresh?: boolean) => Promise<void>) | null
  >(null);

  const loadShortcuts = useCallback(async (forceRefresh = false) => {
    try {
      const data = await getCachedShortcuts(getAllShortcuts, {
        forceRefresh,
        onCacheHit: (cached) => {
          log.info('[Workspace] Shortcuts from cache:', cached.length);
          setShortcuts(cached);
        },
        onFreshData: (fresh) => {
          // 保护机制：如果服务器返回的数据明显少于本地数据，可能是 token 刷新导致的异常
          setShortcuts((prev) => {
            if (
              !forceRefresh &&
              prev.length > 0 &&
              fresh.length < prev.length * 0.3
            ) {
              log.warn(
                '[Workspace] Server returned significantly fewer shortcuts, skipping update:',
                {
                  local: prev.length,
                  server: fresh.length
                }
              );
              if (shortcutsResyncTimerRef.current !== null) {
                window.clearTimeout(shortcutsResyncTimerRef.current);
              }
              shortcutsResyncTimerRef.current = window.setTimeout(() => {
                if (loadShortcutsRef.current) {
                  loadShortcutsRef.current(true).catch(() => {});
                }
                shortcutsResyncTimerRef.current = null;
              }, 1500);
              return prev;
            }
            log.info('[Workspace] Shortcuts updated silently:', fresh.length);
            return fresh;
          });
        }
      });
      log.info('[Workspace] Loaded shortcuts:', data.length);
      setShortcuts(data);
    } catch (error) {
      log.error('[Workspace] Load shortcuts failed:', error);
    }
  }, []);

  // Update the ref so the timer can access the latest function
  loadShortcutsRef.current = loadShortcuts;

  return {
    shortcuts,
    setShortcuts,
    loadShortcuts
  };
}
