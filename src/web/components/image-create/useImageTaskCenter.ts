import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getVisualImageTaskSnapshot,
  type VisualImageTaskListItem,
  type VisualImageTaskSnapshot
} from '@/services/agent-api';

const EMPTY_SNAPSHOT: VisualImageTaskSnapshot = {
  tasks: [],
  activeCount: 0,
  runningCount: 0,
  queuedCount: 0,
  failedCount: 0,
  maxConcurrency: 1
};
const DISMISSED_TASKS_STORAGE_KEY = 'webtomind:image-task-center-dismissed';
const MAX_DISMISSED_TASK_IDS = 100;
const IDLE_POLL_INTERVAL_MS = 30_000;
const MAX_IDLE_POLL_INTERVAL_MS = 60_000;

function readDismissedTaskIds(): Set<string> {
  try {
    const raw = window.localStorage.getItem(DISMISSED_TASKS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((item): item is string => typeof item === 'string')
    );
  } catch {
    return new Set();
  }
}

function persistDismissedTaskIds(taskIds: Set<string>): void {
  try {
    window.localStorage.setItem(
      DISMISSED_TASKS_STORAGE_KEY,
      JSON.stringify(Array.from(taskIds).slice(-MAX_DISMISSED_TASK_IDS))
    );
  } catch {
    // 忽略不可用的 localStorage,不影响关闭当前 UI 卡片
  }
}

function countTasksByStatus(
  tasks: VisualImageTaskListItem[],
  status: VisualImageTaskListItem['status']
): number {
  return tasks.filter((task) => task.status === status).length;
}

function getSnapshotWithTasks(
  snapshot: VisualImageTaskSnapshot,
  tasks: VisualImageTaskListItem[]
): VisualImageTaskSnapshot {
  return {
    ...snapshot,
    tasks,
    activeCount: tasks.length,
    runningCount: countTasksByStatus(tasks, 'running'),
    queuedCount: countTasksByStatus(tasks, 'queued'),
    failedCount: countTasksByStatus(tasks, 'failed')
  };
}

export function useImageTaskCenter({
  enabled,
  intervalMs = 6000,
  limit = 20
}: {
  enabled: boolean;
  intervalMs?: number;
  limit?: number;
}): VisualImageTaskSnapshot & {
  refresh: () => Promise<void>;
  removeTask: (taskId: string) => void;
  dismissTask: (taskId: string) => void;
  isLoading: boolean;
  error: string;
} {
  const [snapshot, setSnapshot] =
    useState<VisualImageTaskSnapshot>(EMPTY_SNAPSHOT);
  const [dismissedTaskIds, setDismissedTaskIds] =
    useState<Set<string>>(readDismissedTaskIds);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const emptyRefreshCountRef = useRef(0);

  const filterDismissedTasks = useCallback(
    (tasks: VisualImageTaskListItem[]) =>
      tasks.filter((task) => !dismissedTaskIds.has(task.taskId)),
    [dismissedTaskIds]
  );

  const refresh = useCallback(async () => {
    if (!enabled) {
      setSnapshot(EMPTY_SNAPSHOT);
      setError('');
      return;
    }
    setIsLoading(true);
    try {
      const next = await getVisualImageTaskSnapshot(limit);
      const visibleTasks = filterDismissedTasks(next.tasks);
      emptyRefreshCountRef.current =
        visibleTasks.length === 0
          ? Math.min(emptyRefreshCountRef.current + 1, 3)
          : 0;
      setSnapshot(getSnapshotWithTasks(next, visibleTasks));
      setError('');
    } catch (taskError) {
      emptyRefreshCountRef.current = Math.min(emptyRefreshCountRef.current + 1, 3);
      setError(taskError instanceof Error ? taskError.message : '任务同步失败');
    } finally {
      setIsLoading(false);
    }
  }, [enabled, filterDismissedTasks, limit]);

  const removeTask = useCallback((taskId: string) => {
    setSnapshot((current) =>
      getSnapshotWithTasks(
        current,
        current.tasks.filter((task) => task.taskId !== taskId)
      )
    );
  }, []);

  const dismissTask = useCallback(
    (taskId: string) => {
      setDismissedTaskIds((current) => {
        if (current.has(taskId)) return current;
        const next = new Set(current);
        next.add(taskId);
        persistDismissedTaskIds(next);
        return next;
      });
      removeTask(taskId);
    },
    [removeTask]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;
    let cancelled = false;
    let timer: number | undefined;

    const schedule = () => {
      if (cancelled) return;
      const hasVisibleTasks = snapshot.activeCount > 0;
      const idleDelay =
        emptyRefreshCountRef.current >= 2
          ? MAX_IDLE_POLL_INTERVAL_MS
          : IDLE_POLL_INTERVAL_MS;
      const delay = hasVisibleTasks ? intervalMs : idleDelay;
      timer = window.setTimeout(async () => {
        if (!document.hidden) {
          await refresh();
        }
        schedule();
      }, delay);
    };

    schedule();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [enabled, intervalMs, refresh, snapshot.activeCount]);

  useEffect(() => {
    if (!enabled) return;
    const handleVisibility = () => {
      if (!document.hidden) void refresh();
    };
    window.addEventListener('focus', handleVisibility);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', handleVisibility);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [enabled, refresh]);

  return useMemo(
    () => ({
      ...snapshot,
      tasks: snapshot.tasks as VisualImageTaskListItem[],
      refresh,
      removeTask,
      dismissTask,
      isLoading,
      error
    }),
    [dismissTask, error, isLoading, refresh, removeTask, snapshot]
  );
}
