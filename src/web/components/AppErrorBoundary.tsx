import React from 'react';
import { Button, SupportErrorNotice } from '@/shared/ui';
import { toUserFacingError } from '@/shared/errors/user-facing-error';
import {
  isStaleAssetError,
  isStaleAssetRecoveryPending,
  requestStaleAssetRecovery,
  type StaleAssetRecoveryResult
} from '../lib/stale-asset-recovery';
import { StaleAssetRecoveryNotice } from './StaleAssetRecoveryNotice';

interface AppErrorBoundaryState {
  error: Error | null;
  staleRecoveryBlocked: boolean;
}

interface AppErrorBoundaryProps extends React.PropsWithChildren {
  recoverStaleAsset?: (error: unknown) => StaleAssetRecoveryResult;
  isStaleRecoveryPending?: () => boolean;
}

export class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    error: null,
    staleRecoveryBlocked: false
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error, staleRecoveryBlocked: false };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const recoveryPending = (
      this.props.isStaleRecoveryPending || isStaleAssetRecoveryPending
    )();
    if (recoveryPending || isStaleAssetError(error)) {
      const result = recoveryPending
        ? 'already-scheduled'
        : (this.props.recoverStaleAsset || requestStaleAssetRecovery)(error);
      if (result === 'blocked' || result === 'not-stale') {
        this.setState({ staleRecoveryBlocked: true });
      }
      return;
    }

    console.error('[AppErrorBoundary] Unhandled render error', {
      error,
      componentStack: errorInfo.componentStack
    });
  }

  render() {
    const { error, staleRecoveryBlocked } = this.state;
    if (!error) return this.props.children;

    const isEnglish =
      typeof window !== 'undefined' &&
      window.location.pathname.startsWith('/en-US');
    const locale = isEnglish ? 'en-US' : 'zh-CN';
    const staleAssetError =
      isStaleAssetError(error) ||
      (this.props.isStaleRecoveryPending || isStaleAssetRecoveryPending)();

    if (staleAssetError && !staleRecoveryBlocked) {
      return <StaleAssetRecoveryNotice locale={locale} />;
    }

    const message = staleAssetError
      ? isEnglish
        ? 'Automatic update could not complete. Reload the page to continue.'
        : '自动更新未能完成，请重新加载页面后继续。'
      : toUserFacingError(
          error,
          isEnglish ? 'The page could not be displayed.' : '页面无法正常显示。',
          locale
        );

    return (
      <main className="web-app-error-boundary">
        <div className="web-app-error-boundary__panel">
          <SupportErrorNotice
            locale={locale}
            title={
              staleAssetError
                ? isEnglish
                  ? 'Page update paused'
                  : '页面更新已暂停'
                : isEnglish
                  ? 'Page error'
                  : '页面发生错误'
            }
            message={message}
          />
          <Button type="button" onClick={() => window.location.reload()}>
            {isEnglish ? 'Reload page' : '重新加载页面'}
          </Button>
        </div>
      </main>
    );
  }
}
