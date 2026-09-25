import React from 'react';
import { withTranslation, WithTranslation } from 'react-i18next';
import { createLogger } from '@/utils/logger';
import type { TFunction } from 'i18next';

const log = createLogger('ErrorBoundary');

interface Props extends WithTranslation {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundaryClass extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    log.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    // 使用双重类型断言解决 withTranslation 的类型推断问题
    const t = this.props.t as unknown as TFunction<'workspace'>;

    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center h-full p-4 text-center">
          <div className="text-red-500 mb-2 relative">
            <style>{`
              @keyframes errorShake {
                0%, 100% { transform: translateX(0) scale(1); }
                10%, 30%, 50%, 70%, 90% { transform: translateX(-2px) scale(1.05) rotate(-3deg); }
                20%, 40%, 60%, 80% { transform: translateX(2px) scale(1.05) rotate(3deg); }
              }
              @keyframes errorPulse {
                0%, 100% { filter: drop-shadow(0 0 2px rgba(239,68,68,0.2)); }
                50% { filter: drop-shadow(0 0 10px rgba(239,68,68,0.6)); }
              }
              .anim-error { animation: errorShake 2.5s ease-in-out infinite, errorPulse 2s ease-in-out infinite; }
            `}</style>
            <svg
              className="w-12 h-12 mx-auto anim-error"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-700 mb-1">
            {t('errorBoundary.title')}
          </h3>
          <p className="text-sm text-slate-500 mb-3">
            原因：
            {this.state.error?.message || t('errorBoundary.unknownError')}
          </p>
          <p className="text-xs text-slate-500 mb-3">
            仍无法解决？请联系管理员：微信 your-support-id ·{' '}
            <a
              href="https://x.com/your-support-id"
              target="_blank"
              rel="noreferrer noopener"
              className="font-semibold underline underline-offset-2"
            >
              X @your-support-id
            </a>
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            {t('errorBoundary.retry')}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export const ErrorBoundary = withTranslation('workspace')(ErrorBoundaryClass);
