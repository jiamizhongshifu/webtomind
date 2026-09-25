/**
 * 路由守卫组件
 * 保护需要登录后才能访问的页面
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { isE2EAuthBypassEnabled } from '@/utils/env';
import { useAuth } from '../contexts/AuthContext';
import { PageLoadSkeleton } from './PageLoadSkeleton';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const bypassAuthForE2E = isE2EAuthBypassEnabled();

  if (bypassAuthForE2E) {
    return <>{children}</>;
  }

  if (isLoading) {
    return <PageLoadSkeleton />;
  }

  if (!isAuthenticated) {
    const redirect = encodeURIComponent(
      `${location.pathname}${location.search}${location.hash}`
    );
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }

  return <>{children}</>;
}

export default ProtectedRoute;
