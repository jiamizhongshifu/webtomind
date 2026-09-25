import { createLogger } from '@/utils/logger';
import { X, Download, ZoomIn, ZoomOut, Loader2 } from 'lucide-react';

const log = createLogger('ImagePreview');
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

/**
 * 生成有辨识度的下载文件名
 * @param imageUrl 图片 URL
 * @param mimeType 图片 MIME 类型
 * @returns 格式化的文件名，如 webtomind-2026-01-20-143052.jpeg
 */
function generateDownloadFileName(imageUrl: string, mimeType: string): string {
  // 根据 MIME 类型确定扩展名
  const extMap: Record<string, string> = {
    'image/jpeg': 'jpeg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif'
  };
  const ext = extMap[mimeType] || 'png';

  // 尝试从 Supabase Storage URL 提取原始文件名
  // 新格式: webtomind-2026-01-20-143052-abc123.jpeg
  // 旧格式: 1768887130996-ozxmc2zh.jpeg
  if (imageUrl.includes('supabase.co/storage')) {
    const urlParts = imageUrl.split('/');
    const fileName = urlParts[urlParts.length - 1];

    // 新格式：直接使用（已经是友好格式）
    if (fileName.startsWith('webtomind-')) {
      // 移除随机 ID 部分，保留日期时间
      const match = fileName.match(/^(webtomind-\d{4}-\d{2}-\d{2}-\d{6})/);
      if (match) {
        return `${match[1]}.${ext}`;
      }
      // 如果格式不匹配，直接使用原文件名（去掉扩展名后加上正确的扩展名）
      const nameWithoutExt = fileName.replace(/\.[^.]+$/, '');
      return `${nameWithoutExt}.${ext}`;
    }

    // 旧格式：从时间戳提取
    const timestampMatch = fileName.match(/^(\d+)-/);
    if (timestampMatch) {
      const timestamp = parseInt(timestampMatch[1], 10);
      const date = new Date(timestamp);
      const formatted = date
        .toISOString()
        .replace(/T/, '-')
        .replace(/:/g, '')
        .slice(0, 17);
      return `webtomind-${formatted}.${ext}`;
    }
  }

  // 默认使用当前时间
  const now = new Date();
  const formatted = now
    .toISOString()
    .replace(/T/, '-')
    .replace(/:/g, '')
    .slice(0, 17);
  return `webtomind-${formatted}.${ext}`;
}

interface ImagePreviewProps {
  imageUrl: string;
  thumbnailUrl?: string; // 可选的缩略图 URL，用于渐进式加载
  onClose: () => void;
}

/**
 * 图片预览弹窗组件
 * 支持缩放、下载和渐进式加载
 */
export function ImagePreview({
  imageUrl,
  thumbnailUrl,
  onClose
}: ImagePreviewProps) {
  const { t } = useTranslation('workspace');
  const [scale, setScale] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [sideNavInset, setSideNavInset] = useState(0);

  // 键盘事件：ESC 关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    setIsLoading(true);
    setImageLoaded(false);
    setImageError(false);
  }, [imageUrl]);

  useEffect(() => {
    const updateInset = () => {
      const nav = document.querySelector('.create-side-nav');
      if (!nav) {
        setSideNavInset(0);
        return;
      }
      const rect = nav.getBoundingClientRect();
      const isVisible =
        rect.width > 0 &&
        rect.height > 0 &&
        window.getComputedStyle(nav).display !== 'none';
      setSideNavInset(
        isVisible && window.innerWidth > 880 ? Math.ceil(rect.right) : 0
      );
    };
    updateInset();
    window.addEventListener('resize', updateInset);
    return () => window.removeEventListener('resize', updateInset);
  }, []);

  // 缩放控制
  const zoomIn = useCallback(() => {
    setScale((prev) => Math.min(prev + 0.25, 3));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((prev) => Math.max(prev - 0.25, 0.5));
  }, []);

  // 下载图片（支持外部 URL 和 data URL）
  const handleDownload = useCallback(async () => {
    try {
      let blob: Blob;

      if (imageUrl.startsWith('data:')) {
        // data URL: 直接转换为 blob
        const response = await fetch(imageUrl);
        blob = await response.blob();
      } else {
        // 外部 URL (如 Supabase Storage): 使用 fetch 获取 blob 强制下载
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error('Failed to fetch image');
        blob = await response.blob();
      }

      // 生成有辨识度的文件名
      const fileName = generateDownloadFileName(imageUrl, blob.type);

      // 创建临时 blob URL 并下载
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // 清理 blob URL
      setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
    } catch (error) {
      log.error('[ImagePreview] Failed to download image:', error);
      // 降级方案：直接打开链接
      window.open(imageUrl, '_blank');
    }
  }, [imageUrl]);

  // 点击背景关闭
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  // 弹窗内容
  const content = (
    <div
      className="workspace-image-preview-backdrop fixed inset-y-0 right-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      style={{ left: sideNavInset }}
      onClick={handleBackdropClick}
    >
      {/* 工具栏 */}
      <div className="workspace-image-preview-toolbar absolute top-4 right-4 flex items-center gap-2">
        <button
          type="button"
          onClick={zoomOut}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
          title={t('imagePreview.zoomOut')}
          aria-label={t('imagePreview.zoomOut') as string}
        >
          <ZoomOut className="w-5 h-5" />
        </button>
        <span className="px-3 py-1 rounded-lg bg-white/10 text-white text-sm min-w-[60px] text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          onClick={zoomIn}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
          title={t('imagePreview.zoomIn')}
          aria-label={t('imagePreview.zoomIn') as string}
        >
          <ZoomIn className="w-5 h-5" />
        </button>
        <div className="w-px h-6 bg-white/20 mx-1" />
        <button
          type="button"
          onClick={handleDownload}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
          title={t('imagePreview.download')}
          aria-label={t('imagePreview.download') as string}
        >
          <Download className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
          title={t('imagePreview.close')}
          aria-label={t('imagePreview.close') as string}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 图片容器 */}
      <div
        className="workspace-image-preview-stage relative max-h-[90vh] overflow-auto"
        style={{
          maxWidth: `min(90vw, calc(100vw - ${sideNavInset}px - 48px))`
        }}
      >
        {/* 加载状态：显示缩略图（模糊）+ 加载进度 */}
        {isLoading && !imageError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
            {/* 模糊的缩略图背景 */}
            {thumbnailUrl && (
              <img
                src={thumbnailUrl}
                alt="Loading..."
                className="absolute inset-0 w-full h-full object-contain blur-lg opacity-50"
                style={{
                  transform: `scale(${scale})`,
                  transformOrigin: 'center center'
                }}
              />
            )}
            {/* 加载指示器 */}
            <div className="relative z-10 flex flex-col items-center gap-3 p-4 bg-black/50 rounded-xl">
              <Loader2 className="w-8 h-8 text-white animate-spin" />
              <div className="text-white text-sm">
                {t('imagePreview.loadingOriginal')}
              </div>
            </div>
          </div>
        )}

        {/* 原图 */}
        <img
          src={imageUrl}
          alt="Preview"
          className={`workspace-image-preview-image cursor-zoom-in transition-all duration-500 ${
            imageLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'center center'
          }}
          onLoad={() => {
            setImageLoaded(true);
            setIsLoading(false);
          }}
          onError={() => {
            setImageError(true);
            setImageLoaded(false);
            setIsLoading(false);
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (scale < 2) {
              zoomIn();
            } else {
              setScale(1);
            }
          }}
        />
        {imageError && thumbnailUrl && (
          <img
            src={thumbnailUrl}
            alt="Preview"
            className="transition-all duration-500"
            style={{
              transform: `scale(${scale})`,
              transformOrigin: 'center center'
            }}
          />
        )}
      </div>

      {/* 提示文字 */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
        {isLoading ? t('imagePreview.loadingHD') : t('imagePreview.hint')}
      </div>
    </div>
  );

  // 使用 Portal 渲染到 body，确保全屏显示（不受父容器 overflow 限制）
  return createPortal(content, document.body);
}
