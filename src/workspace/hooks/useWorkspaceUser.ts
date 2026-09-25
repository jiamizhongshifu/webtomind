import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/web/contexts/AuthContext';
import { getApiBaseUrl } from '@/utils/env';
import { createLogger } from '@/utils/logger';

const log = createLogger('useWorkspaceUser');

export interface UserProfile {
  member_number?: number;
  member_number_formatted?: string;
  days_joined?: number;
}

export interface UserCredits {
  daily: number;
  dailyMax: number;
  subscription: number;
  subscriptionMax: number;
  bonus: number;
  referral: number;
  total: number;
}

export interface UserSubscription {
  planName: string;
  status: string;
}

export function useWorkspaceUser(isAuthReady: boolean = true) {
  const { user, signOut, getAccessToken } = useAuth();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [credits, setCredits] = useState<UserCredits | null>(null);
  const [subscription, setSubscription] = useState<UserSubscription | null>(
    null
  );
  const [isFetchingUser, setIsFetchingUser] = useState(false);

  // 获取用户数据
  const fetchUserData = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !user) return;

    setIsFetchingUser(true);
    try {
      const API_BASE = getApiBaseUrl();
      const response = await fetch(`${API_BASE}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setProfile({
          member_number: data.user?.member_number,
          member_number_formatted: data.user?.member_number_formatted,
          days_joined: data.user?.days_joined
        });

        if (data.credits) {
          setCredits({
            daily: data.credits.daily,
            dailyMax: data.credits.dailyMax,
            subscription: data.credits.subscription || 0,
            subscriptionMax: data.credits.subscriptionMax || 0,
            bonus: data.credits.bonus,
            referral: data.credits.referral || 0,
            total: data.credits.total
          });
        }

        if (data.subscription) {
          setSubscription({
            planName: data.subscription.planName,
            status: data.subscription.status
          });
        }
      }
    } catch (error) {
      log.error('[Workspace] Failed to fetch user data:', error);
    } finally {
      setIsFetchingUser(false);
    }
  }, [user, getAccessToken]);

  useEffect(() => {
    if (user && isAuthReady) {
      fetchUserData();
    }
  }, [user, isAuthReady, fetchUserData]);

  // 监听积分变化事件，刷新积分显示
  useEffect(() => {
    const handleCreditsChanged = () => {
      log.info(
        '[Workspace] Received credits-changed event, refreshing user data...'
      );
      fetchUserData();
    };

    window.addEventListener('credits-changed', handleCreditsChanged);
    return () => {
      window.removeEventListener('credits-changed', handleCreditsChanged);
    };
  }, [fetchUserData]);

  return {
    user,
    profile,
    credits,
    subscription,
    isFetchingUser,
    fetchUserData,
    signOut,
    getAccessToken
  };
}
