/**
 * 视频播放器组件
 *
 * 根据平台使用 iframe 嵌入或提供跳转链接
 * 支持按需检查视频可用性
 */

import { useState, useEffect, useCallback } from 'react';
import { createLogger } from '@/utils/logger';
import {
  ExternalLink,
  Play,
  AlertCircle,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';

const log = createLogger('VideoPlayer');
import type { VideoPlatform } from '@/types/video';
import { getVideoEmbedUrl, VIDEO_PLATFORM_CONFIGS } from '@/types/video';

interface VideoPlayerProps {
  /** 平台标识 */
  platform: VideoPlatform;
  /** 平台视频 ID */
  videoId: string;
  /** 视频页面 URL（用于回退） */
  pageUrl: string;
  /** 缩略图 URL */
  thumbnailUrl?: string;
  /** 视频标题 */
  title?: string;
  /** 是否自动播放 */
  autoplay?: boolean;
  /** 自定义类名 */
  className?: string;
  /** 上次检查时间 (timestamp) */
  lastCheckedAt?: number;
  /** 已知的可用状态 */
  isAvailable?: boolean;
  /** 可用性变更回调 */
  onAvailabilityChange?: (isAvailable: boolean) => void;
}

// 检查间隔：24小时内不重复检查
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * 视频播放器组件
 *
 * 策略：
 * 1. YouTube/Bilibili: 使用 iframe 嵌入播放
 * 2. Twitter/抖音/微博: 显示缩略图，点击跳转到原站
 * 3. 未知平台: 显示跳转链接
 * 4. 按需检查视频可用性
 */
export function VideoPlayer({
  platform,
  videoId,
  pageUrl,
  thumbnailUrl,
  title,
  autoplay = false,
  className = '',
  lastCheckedAt,
  isAvailable: initialAvailable = true,
  onAvailabilityChange
}: VideoPlayerProps): JSX.Element {
  const [isAvailable, setIsAvailable] = useState(initialAvailable);
  const [isChecking, setIsChecking] = useState(false);
  const [iframeError, setIframeError] = useState(false);

  const config = VIDEO_PLATFORM_CONFIGS[platform];
  const embedUrl = getVideoEmbedUrl(platform, videoId);

  // 检查是否需要重新验证可用性
  const shouldCheck = useCallback((): boolean => {
    if (!lastCheckedAt) return true;
    return Date.now() - lastCheckedAt > CHECK_INTERVAL_MS;
  }, [lastCheckedAt]);

  // 检查视频可用性
  const checkAvailability = useCallback(async (): Promise<void> => {
    if (isChecking) return;

    setIsChecking(true);

    try {
      let available = true;

      // 根据平台使用不同的检查策略
      switch (platform) {
        case 'youtube': {
          // YouTube: 检查 oEmbed API
          const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
          try {
            const response = await fetch(oEmbedUrl, { method: 'HEAD' });
            available = response.ok;
          } catch {
            // 网络错误不代表视频不可用
            available = true;
          }
          break;
        }

        case 'bilibili': {
          // Bilibili: 检查视频信息 API
          const apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${videoId}`;
          try {
            const response = await fetch(apiUrl);
            const data = await response.json();
            available = data.code === 0;
          } catch {
            available = true;
          }
          break;
        }

        default:
          // 其他平台暂不检查
          available = true;
      }

      setIsAvailable(available);
      onAvailabilityChange?.(available);
    } catch (error) {
      log.error('[VideoPlayer] Availability check failed:', error);
    } finally {
      setIsChecking(false);
    }
  }, [platform, videoId, isChecking, onAvailabilityChange]);

  // 组件挂载时检查可用性
  useEffect(() => {
    if (shouldCheck()) {
      checkAvailability();
    }
  }, [shouldCheck, checkAvailability]);

  // iframe 加载错误处理
  const handleIframeError = (): void => {
    setIframeError(true);
    setIsAvailable(false);
    onAvailabilityChange?.(false);
  };

  // 视频不可用时的显示
  if (!isAvailable || iframeError) {
    return (
      <div
        className={`relative aspect-video bg-slate-900 rounded-lg overflow-hidden ${className}`}
      >
        {/* 缩略图（如果有） */}
        {thumbnailUrl && (
          <img
            src={thumbnailUrl}
            alt={title || 'Video thumbnail'}
            className="absolute inset-0 w-full h-full object-cover opacity-50"
          />
        )}

        {/* 不可用提示 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white p-4">
          <AlertTriangle className="w-12 h-12 mb-4 text-amber-400" />
          <p className="text-lg font-medium mb-2">视频可能已失效</p>
          <p className="text-sm text-slate-300 mb-4 text-center">
            原视频可能已被删除或设为私密
          </p>

          <div className="flex gap-3">
            <a
              href={pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-white/90 hover:bg-white text-slate-900 rounded-lg font-medium transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              尝试访问原站
            </a>

            <button
              onClick={checkAvailability}
              disabled={isChecking}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`}
              />
              重新检查
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 如果支持嵌入，使用 iframe
  if (config.supportsEmbed && embedUrl) {
    const finalEmbedUrl = autoplay ? `${embedUrl}?autoplay=1` : embedUrl;

    return (
      <div
        className={`relative aspect-video bg-slate-900 rounded-lg overflow-hidden ${className}`}
      >
        {/* 加载指示器 */}
        {isChecking && (
          <div className="absolute top-3 right-3 z-10 px-2 py-1 bg-black/60 text-white text-xs rounded flex items-center gap-1">
            <RefreshCw className="w-3 h-3 animate-spin" />
            检查中...
          </div>
        )}

        <iframe
          src={finalEmbedUrl}
          title={title || 'Video'}
          className="absolute inset-0 w-full h-full"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          onError={handleIframeError}
        />
      </div>
    );
  }

  // 不支持嵌入，显示缩略图 + 跳转按钮
  return (
    <div
      className={`relative aspect-video bg-slate-900 rounded-lg overflow-hidden group ${className}`}
    >
      {/* 缩略图 */}
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={title || 'Video thumbnail'}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
          <Play className="w-16 h-16 text-slate-600" />
        </div>
      )}

      {/* 遮罩层 */}
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <a
          href={pageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-6 py-3 bg-white/90 hover:bg-white text-slate-900 rounded-full font-medium transition-colors"
        >
          <ExternalLink className="w-5 h-5" />在{getPlatformName(platform)}观看
        </a>
      </div>

      {/* 平台标识 */}
      <div className="absolute top-3 left-3 px-2 py-1 bg-black/60 text-white text-xs rounded">
        {getPlatformName(platform)}
      </div>

      {/* 检查状态 */}
      {isChecking && (
        <div className="absolute top-3 right-3 px-2 py-1 bg-black/60 text-white text-xs rounded flex items-center gap-1">
          <RefreshCw className="w-3 h-3 animate-spin" />
          检查中...
        </div>
      )}

      {/* 提示：需要跳转 */}
      {config.requiresAuth && (
        <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2 px-3 py-2 bg-amber-500/90 text-amber-900 text-xs rounded">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>此平台视频需要在原站观看</span>
        </div>
      )}
    </div>
  );
}

/**
 * 获取平台中文名称
 */
function getPlatformName(platform: VideoPlatform): string {
  const names: Record<VideoPlatform, string> = {
    youtube: 'YouTube',
    bilibili: 'Bilibili',
    twitter: 'Twitter/X',
    douyin: '抖音',
    weibo: '微博',
    unknown: '原站'
  };
  return names[platform] || '原站';
}

/**
 * 从 Markdown 中解析视频元数据
 */
export function parseVideoMetadata(markdown: string): {
  platform: VideoPlatform;
  platformVideoId: string;
  pageUrl: string;
  author?: string;
  duration?: number;
  viewCount?: number;
} | null {
  // 查找视频元数据注释
  const metadataMatch = markdown.match(/<!-- video-metadata: (.+) -->/);
  if (!metadataMatch) {
    return null;
  }

  try {
    return JSON.parse(metadataMatch[1]);
  } catch {
    return null;
  }
}

/**
 * 检查 Markdown 是否包含视频内容
 */
export function isVideoContent(markdown: string): boolean {
  return (
    markdown.includes('<!-- video-metadata:') ||
    markdown.includes('data-video-url=') ||
    markdown.includes('video-thumbnail')
  );
}
