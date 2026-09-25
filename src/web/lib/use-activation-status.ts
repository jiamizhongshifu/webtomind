import { useCallback, useEffect, useRef, useState } from 'react';
import { getAccessToken } from '@/services/workspace-api';
import { getApiBaseUrl } from '@/utils/env';

const ACTIVATION_TASK_IDENTIFIER = 'generate_first_commercial_image';

interface ActivationCacheEntry {
  userId: string;
  activated: boolean;
}

let activationCache: ActivationCacheEntry | null = null;

export interface ActivationStatus {
  loading: boolean;
  activated: boolean;
  unavailable: boolean;
  refresh: () => void;
}

function isActivatedByTasks(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const tasks = (payload as { tasks?: unknown }).tasks;
  if (!Array.isArray(tasks)) return false;
  return tasks.some((task) => {
    if (!task || typeof task !== 'object') return false;
    const record = task as { identifier?: unknown; is_completed?: unknown };
    return (
      record.identifier === ACTIVATION_TASK_IDENTIFIER &&
      record.is_completed === true
    );
  });
}

export function useActivationStatus(userId?: string | null): ActivationStatus {
  const requestSeqRef = useRef(0);
  const [state, setState] = useState<{
    loading: boolean;
    activated: boolean;
    unavailable: boolean;
  }>(() => {
    if (userId && activationCache?.userId === userId) {
      return {
        loading: false,
        activated: activationCache.activated,
        unavailable: false
      };
    }
    return { loading: Boolean(userId), activated: false, unavailable: false };
  });

  const load = useCallback(async (userIdValue: string) => {
    const token = getAccessToken();
    const seq = ++requestSeqRef.current;
    setState({ loading: true, activated: false, unavailable: false });
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/membership/tasks`, {
        headers: {
          Authorization: `Bearer ${token || ''}`
        }
      });
      if (!response.ok) {
        throw new Error(`membership tasks returned ${response.status}`);
      }
      const payload: unknown = await response.json();
      const activated = isActivatedByTasks(payload);
      activationCache = { userId: userIdValue, activated };
      if (seq === requestSeqRef.current) {
        setState({ loading: false, activated, unavailable: false });
      }
    } catch {
      if (seq === requestSeqRef.current) {
        setState({ loading: false, activated: false, unavailable: true });
      }
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      requestSeqRef.current += 1;
      setState({ loading: false, activated: false, unavailable: false });
      return;
    }
    if (activationCache?.userId === userId) {
      setState({
        loading: false,
        activated: activationCache.activated,
        unavailable: false
      });
      return;
    }
    void load(userId);
  }, [load, userId]);

  const refresh = useCallback(() => {
    if (!userId) return;
    activationCache = null;
    void load(userId);
  }, [load, userId]);

  return { ...state, refresh };
}
