import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { isE2EAuthBypassEnabled } from '@/utils/env';
import { useAuth } from '../contexts/AuthContext';
import { PageLoadSkeleton } from './PageLoadSkeleton';

type ApiMarketplaceAdminRouteProps = {
  children: ReactNode;
};

export function ApiMarketplaceAdminRoute({
  children
}: ApiMarketplaceAdminRouteProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  // The local authenticated preview uses a synthetic E2E user. Keep the
  // existing preview harness usable without weakening production auth.
  if (isE2EAuthBypassEnabled()) return <>{children}</>;
  if (isLoading) return <PageLoadSkeleton />;

  if (!isAuthenticated) {
    const redirect = encodeURIComponent(
      `${location.pathname}${location.search}${location.hash}`
    );
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }

  // Full launch: any authenticated user may manage their own API keys. The
  // component name is kept to minimize route churn; it now guards a plain
  // authenticated surface, not an admin one.
  if (!user) {
    const localePrefix = location.pathname.startsWith('/en-US')
      ? '/en-US'
      : location.pathname.startsWith('/zh-CN')
        ? '/zh-CN'
        : '';
    return <Navigate to={`${localePrefix}/create`} replace />;
  }

  return <>{children}</>;
}

export default ApiMarketplaceAdminRoute;
