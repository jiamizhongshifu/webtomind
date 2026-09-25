/**
 * 统一聊天错误提示组件
 * 根据错误类型显示不同的提示和操作按钮
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  RefreshCw,
  LogIn,
  ArrowUpCircle,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  WifiOff,
  CreditCard,
  Clock
} from 'lucide-react';
import type { ChatError } from '../hooks/useChatError';

interface ChatErrorToastProps {
  /** 错误对象 */
  error: ChatError | null;
  /** 关闭回调 */
  onClose: () => void;
  /** 重试回调 */
  onRetry?: () => void;
  /** 升级回调 */
  onUpgrade?: () => void;
  /** 登录回调 */
  onLogin?: () => void;
  /** 自动消失时间（毫秒），0 表示不自动消失 */
  autoHideDuration?: number;
  /** 错误信息截断长度 */
  truncateLength?: number;
}

/** 错误类型对应的图标 */
const errorIcons = {
  network: WifiOff,
  auth: LogIn,
  credits: CreditCard,
  quota: Clock,
  unknown: AlertCircle
};

export function ChatErrorToast({
  error,
  onClose,
  onRetry,
  onUpgrade,
  onLogin,
  autoHideDuration = 5000,
  truncateLength = 100
}: ChatErrorToastProps) {
  const { t } = useTranslation('workspace');
  const [showDetails, setShowDetails] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // 显示/隐藏动画
  useEffect(() => {
    if (error) {
      setIsVisible(true);
      setShowDetails(false);
    } else {
      setIsVisible(false);
    }
  }, [error]);

  // 自动消失
  useEffect(() => {
    if (!error || autoHideDuration === 0) return;

    const timer = setTimeout(() => {
      onClose();
    }, autoHideDuration);

    return () => clearTimeout(timer);
  }, [error, autoHideDuration, onClose]);

  if (!error || !isVisible) return null;

  const Icon = errorIcons[error.type] || AlertCircle;
  const isTruncated = error.message.length > truncateLength;
  const displayMessage =
    isTruncated && !showDetails
      ? error.message.slice(0, truncateLength) + '...'
      : error.message;

  // 根据错误类型确定背景色
  const bgColorClass = {
    network:
      'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800',
    auth: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
    credits:
      'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800',
    quota:
      'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    unknown: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
  }[error.type];

  const iconColorClass = {
    network: 'text-orange-600 dark:text-orange-300',
    auth: 'text-yellow-700 dark:text-yellow-300',
    credits: 'text-purple-600 dark:text-purple-300',
    quota: 'text-blue-600 dark:text-blue-300',
    unknown: 'text-red-600 dark:text-red-300'
  }[error.type];

  return (
    <div
      className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md
        rounded-xl border shadow-lg p-4 transition-all duration-slow 
        ${bgColorClass}
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
      role="alert"
      aria-live="assertive"
    >
      <style>{`
        @keyframes toastWiggle {
          0%, 100% { transform: rotate(0deg) scale(1); }
          25% { transform: rotate(-8deg) scale(1.1); }
          75% { transform: rotate(8deg) scale(1.1); }
        }
        .anim-toast-icon { animation: toastWiggle 1.5s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .anim-toast-icon { animation: none; }
        }
      `}</style>
      <div className="flex items-start gap-3">
        {/* 图标 */}
        <div className={`flex-shrink-0 ${iconColorClass} anim-toast-icon`}>
          <Icon className="w-5 h-5" />
        </div>

        {/* 内容 */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-700 dark:text-slate-200">
            {displayMessage}
          </p>

          {/* 详情展开 */}
          {(isTruncated || error.details) && (
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="mt-1 text-xs text-slate-600 hover:text-slate-800
                dark:text-slate-300 dark:hover:text-slate-100 flex items-center gap-1"
            >
              {showDetails ? (
                <>
                  <ChevronUp className="w-3 h-3" />
                  {t('chat.error.hideDetails', '收起详情')}
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" />
                  {t('chat.error.showDetails', '查看详情')}
                </>
              )}
            </button>
          )}

          {/* 详情内容 */}
          {showDetails && error.details && (
            <pre
              className="mt-2 text-xs text-slate-600 dark:text-slate-300
              bg-slate-100 dark:bg-slate-800 rounded p-2 overflow-x-auto max-h-32"
            >
              {error.details}
            </pre>
          )}

          {/* 操作按钮 */}
          <div className="mt-3 flex items-center gap-2">
            {/* 重试按钮 */}
            {error.retryable && onRetry && (
              <button
                onClick={onRetry}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium
                  bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200
                  border border-slate-200 dark:border-slate-600 rounded-lg
                  hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                {t('chat.error.retry', '重试')}
              </button>
            )}

            {/* 升级按钮（积分不足/配额超限） */}
            {(error.type === 'credits' || error.type === 'quota') &&
              onUpgrade && (
                <button
                  onClick={onUpgrade}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium
                  bg-purple-500 text-white rounded-lg
                  hover:bg-purple-600 transition-colors"
                >
                  <ArrowUpCircle className="w-3 h-3" />
                  {t('chat.error.upgrade', '升级套餐')}
                </button>
              )}

            {/* 登录按钮 */}
            {error.type === 'auth' && onLogin && (
              <button
                onClick={onLogin}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium
                  bg-yellow-500 text-white rounded-lg
                  hover:bg-yellow-600 transition-colors"
              >
                <LogIn className="w-3 h-3" />
                {t('chat.error.login', '重新登录')}
              </button>
            )}
          </div>
        </div>

        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="flex-shrink-0 p-1 text-muted-foreground hover:text-slate-600 
            dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
