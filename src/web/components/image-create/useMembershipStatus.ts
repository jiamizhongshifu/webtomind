import { useEffect, useState } from 'react';
import { getApiBaseUrl } from '@/utils/env';
import { useAuth } from '../../contexts/AuthContext';

export interface MembershipStatus {
  loading: boolean;
  isMember: boolean;
  isFree: boolean;
  planId: string;
  /**
   * 会员状态是否不可用（接口失败等）。
   * 为 true 时调用方不应把用户当作 free 做升级引导，
   * 避免付费用户因接口抖动被反复推销。
   */
  unavailable: boolean;
}

export function useMembershipStatus(): MembershipStatus {
  const { isAuthenticated, isLoading, getAccessToken } = useAuth();
  const [status, setStatus] = useState<MembershipStatus>({
    loading: true,
    isMember: false,
    isFree: true,
    planId: 'free',
    unavailable: false
  });

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      setStatus({
        loading: false,
        isMember: false,
        isFree: true,
        planId: 'free',
        unavailable: false
      });
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setStatus({
        loading: false,
        isMember: false,
        isFree: true,
        planId: 'free',
        unavailable: false
      });
      return;
    }

    let cancelled = false;
    setStatus((current) => ({ ...current, loading: true }));

    fetch(`${getApiBaseUrl()}/api/membership/subscription`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`subscription request failed: ${response.status}`);
        }
        return response.json();
      })
      .then((payload: { isFree?: boolean; plan?: { id?: string } | null }) => {
        if (cancelled) return;
        const isFree = payload.isFree !== false;
        const planId = payload.plan?.id || (isFree ? 'free' : 'member');
        setStatus({
          loading: false,
          isMember: !isFree,
          isFree,
          planId,
          unavailable: false
        });
      })
      .catch(() => {
        if (!cancelled) {
          setStatus({
            loading: false,
            isMember: false,
            isFree: true,
            planId: 'free',
            unavailable: true
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [getAccessToken, isAuthenticated, isLoading]);

  return status;
}
