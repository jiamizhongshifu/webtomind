/**
 * ShareButton Component
 *
 * 分享到互联网功能，参考竞品 YouMind 设计
 * 独立图标按钮，放在"更多"按钮左边
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { createLogger } from '@/utils/logger';
import {
  Globe,
  ExternalLink,
  Copy,
  Check,
  Loader2,
  X,
  Link2
} from 'lucide-react';
import { Button } from '@/shared/ui/radix/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/shared/ui/radix/dialog';
import { Separator } from '@/shared/ui/radix/separator';
import { cn } from '@/lib/utils';

const log = createLogger('ShareButton');

interface ShareButtonProps {
  summaryId: string;
  isShared: boolean;
  shareUrl?: string | null;
  onShareChange: (isShared: boolean, shareUrl?: string) => void;
  authToken?: string;
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
}

export function ShareButton({
  summaryId,
  isShared,
  shareUrl,
  onShareChange,
  authToken
}: ShareButtonProps) {
  const { t } = useTranslation('workspace');
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false); // 链接区域的复制状态
  const [error, setError] = useState<string | null>(null);
  const [currentShareUrl, setCurrentShareUrl] = useState<string | null>(
    shareUrl || null
  );

  // 同步外部 shareUrl
  useEffect(() => {
    if (shareUrl) {
      setCurrentShareUrl(shareUrl);
    }
  }, [shareUrl]);

  // 自动复制到剪贴板
  const copyToClipboard = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      return true;
    } catch (err) {
      log.error('[ShareButton] Copy error:', err);
      return false;
    }
  }, []);

  const closeModal = useCallback(() => {
    setShowModal(false);
    setCopied(false);
    setUrlCopied(false);
  }, []);

  const handleShare = async () => {
    // 如果已经分享，直接显示管理窗口
    if (isShared && currentShareUrl) {
      setShowModal(true);
      copyToClipboard(currentShareUrl);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/share/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({
          summary_id: summaryId
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || '创建分享链接失败');
      }

      const newShareUrl = data.share_url;
      setCurrentShareUrl(newShareUrl);
      onShareChange(true, newShareUrl);
      setShowModal(true);

      // 自动复制到剪贴板
      copyToClipboard(newShareUrl);
    } catch (err: unknown) {
      log.error('[ShareButton] Create share error:', err);
      setError(getErrorMessage(err, '创建分享链接失败'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevoke = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/share/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({
          summary_id: summaryId
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || '停止分享失败');
      }

      setCurrentShareUrl(null);
      onShareChange(false);
      closeModal();
    } catch (err: unknown) {
      log.error('[ShareButton] Revoke share error:', err);
      setError(getErrorMessage(err, '停止分享失败'));
    } finally {
      setIsLoading(false);
    }
  };

  // 链接区域的复制（带自动恢复）
  const handleUrlCopy = () => {
    if (currentShareUrl) {
      copyToClipboard(currentShareUrl);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    }
  };

  const handleCopy = () => {
    if (currentShareUrl) {
      copyToClipboard(currentShareUrl);
    }
  };

  const handleOpenLink = () => {
    if (currentShareUrl) {
      window.open(currentShareUrl, '_blank');
    }
  };

  return (
    <>
      {/* 分享图标按钮 */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={handleShare}
        disabled={isLoading}
        title={t('share.tooltip', '分享')}
        aria-label="分享"
      >
        {isLoading ? (
          <Loader2 data-icon="inline-start" className="animate-spin" />
        ) : (
          <Globe
            data-icon="inline-start"
            className={cn(isShared ? 'text-blue-500' : 'text-slate-500')}
          />
        )}
      </Button>

      <Dialog
        open={showModal}
        onOpenChange={(open) => {
          if (open) {
            setShowModal(true);
          } else {
            closeModal();
          }
        }}
      >
        <DialogContent
          className="w-[90vw] max-w-md gap-0 overflow-hidden rounded-2xl p-0"
          overlayClassName="bg-black/50"
          showCloseButton={false}
        >
          {/* 头部 */}
          <DialogHeader className="flex-row items-center justify-between gap-3 border-b border-slate-100 px-6 py-4 text-left dark:border-slate-700">
            <div className="flex items-center gap-2">
              <Globe
                data-icon="inline-start"
                className="text-slate-600 dark:text-slate-300"
              />
              <DialogTitle className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                {t('share.title', '分享到互联网')}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {t(
                  'share.description',
                  '将此内容分享到互联网，任何人都可以通过链接访问'
                )}
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('preview.close', '关闭') as string}
              >
                <X data-icon="inline-start" />
              </Button>
            </DialogClose>
          </DialogHeader>

          {/* 内容区 */}
          <div className="px-6 py-5">
            {/* 描述文字 */}
            <p className="text-sm text-slate-500 mb-5">
              {t(
                'share.description',
                '将此内容分享到互联网，任何人都可以通过链接访问'
              )}
            </p>

            {/* 插图区域 */}
            <div className="bg-gradient-to-br from-blue-50 to-sky-100 dark:from-slate-700 dark:to-slate-600 rounded-xl p-8 mb-5 flex items-center justify-center relative overflow-hidden h-32">
              <style>{`
                    @keyframes flyPaperPlane {
                      0% { transform: translate(-10px, 10px) rotate(-5deg); }
                      50% { transform: translate(10px, -10px) rotate(5deg); }
                      100% { transform: translate(-10px, 10px) rotate(-5deg); }
                    }
                    @keyframes dashCloud {
                      0% { stroke-dashoffset: 100; opacity: 0; }
                      20% { opacity: 1; }
                      80% { opacity: 1; }
                      100% { stroke-dashoffset: -100; opacity: 0; }
                    }
                    .anim-plane { animation: flyPaperPlane 4s ease-in-out infinite; transform-origin: center; }
                    .anim-dash-1 { stroke-dasharray: 20; stroke-dashoffset: 100; animation: dashCloud 3s linear infinite; }
                    .anim-dash-2 { stroke-dasharray: 15; stroke-dashoffset: 100; animation: dashCloud 4s linear infinite 1s; }
                    .anim-dash-3 { stroke-dasharray: 25; stroke-dashoffset: 100; animation: dashCloud 3.5s linear infinite 0.5s; }
                    @media (prefers-reduced-motion: reduce) {
                      *, *::before, *::after {
                        animation-duration: 0.01ms !important;
                        animation-iteration-count: 1 !important;
                      }
                    }
                  `}</style>
              <svg
                className="w-full h-full absolute inset-0"
                viewBox="0 0 200 100"
                fill="none"
              >
                {/* 风迹动效背景云层/轨迹 */}
                <path
                  className="anim-dash-1"
                  d="M 20 40 Q 50 30 80 40 T 150 20"
                  stroke="#bae6fd"
                  strokeWidth="2"
                  strokeLinecap="round"
                  fill="none"
                />
                <path
                  className="anim-dash-2"
                  d="M 40 70 Q 70 80 100 70 T 180 80"
                  stroke="#bae6fd"
                  strokeWidth="2"
                  strokeLinecap="round"
                  fill="none"
                />
                <path
                  className="anim-dash-3"
                  d="M 10 55 Q 40 65 70 50 T 130 65"
                  stroke="#e0f2fe"
                  strokeWidth="3"
                  strokeLinecap="round"
                  fill="none"
                />

                {/* 纸飞机 */}
                <g className="anim-plane text-blue-500">
                  <path
                    d="M 100 50 L 70 40 L 80 50 L 70 60 Z"
                    fill="currentColor"
                    opacity="0.8"
                  />
                  <path
                    d="M 100 50 L 80 50 L 75 55 Z"
                    fill="currentColor"
                    opacity="0.6"
                  />
                  <path
                    d="M 100 50 L 60 70 L 70 60 L 80 50 Z"
                    fill="currentColor"
                  />
                  <path
                    d="M 100 50 L 60 30 L 70 40 L 80 50 Z"
                    fill="currentColor"
                    opacity="0.9"
                  />
                  {/* 发光核心 */}
                  <circle cx="95" cy="50" r="2" fill="#fff" />
                </g>
              </svg>
            </div>

            {/* 链接展示区 */}
            {currentShareUrl && (
              <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl mb-4 border border-slate-200 dark:border-slate-600">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="在新标签页打开"
                  onClick={handleOpenLink}
                  title="在新标签页打开"
                >
                  <ExternalLink data-icon="inline-start" />
                </Button>
                <span className="text-sm text-slate-600 dark:text-slate-300 truncate flex-1 font-mono">
                  {currentShareUrl}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="复制链接"
                  onClick={handleUrlCopy}
                  title="复制链接"
                >
                  {urlCopied ? (
                    <Check
                      data-icon="inline-start"
                      className="text-green-500"
                    />
                  ) : (
                    <Copy data-icon="inline-start" />
                  )}
                </Button>
              </div>
            )}

            {/* 错误提示 */}
            {error && (
              <p className="text-sm text-red-500 mb-4 text-center">{error}</p>
            )}

            {/* 复制按钮 */}
            <Button
              type="button"
              onClick={handleCopy}
              disabled={!currentShareUrl}
              className="w-full rounded-xl"
            >
              <Link2 data-icon="inline-start" />
              {copied ? t('share.copied', '已复制') : t('share.copy', '复制')}
            </Button>

            {/* 底部操作区 */}
            <Separator className="mt-4" />
            <div className="flex items-center justify-between pt-4">
              {/* 复制成功提示 */}
              <div
                className={`flex items-center gap-1.5 text-sm ${copied ? 'opacity-100' : 'opacity-0'}`}
              >
                <Check data-icon="inline-start" className="text-green-500" />
                <span className="text-green-600 dark:text-green-400">
                  {t('share.copiedMessage', '链接已复制！粘贴即可分享。')}
                </span>
              </div>

              {/* 停止分享按钮 */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRevoke}
                disabled={isLoading}
                className="text-muted-foreground hover:text-red-500"
              >
                {isLoading ? '...' : t('share.stop', '停止分享')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
