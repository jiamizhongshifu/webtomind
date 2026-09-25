/**
 * 视频采集类型定义
 *
 * 设计原则：
 * 1. 不存储视频文件，只存储 URL + 缩略图
 * 2. 缩略图上传到 Supabase Storage
 * 3. 视频播放使用 iframe 嵌入或跳转到原站
 */

/**
 * 支持的视频平台
 */
export type VideoPlatform =
  | 'youtube'
  | 'bilibili'
  | 'twitter'
  | 'douyin'
  | 'weibo'
  | 'unknown';

/**
 * 视频元数据 - 从页面提取的信息
 */
export interface VideoMetadata {
  /** 平台标识 */
  platform: VideoPlatform;

  /** 平台视频 ID (BV号/video_id 等) */
  platformVideoId: string;

  /** 视频页面 URL (永久保存) */
  pageUrl: string;

  /** 视频标题 */
  title: string;

  /** 作者/频道名称 */
  author?: string;

  /** 视频时长（秒） */
  duration?: number;

  /** 发布时间 */
  publishedAt?: string;

  /** 观看次数 */
  viewCount?: number;

  /** 原始缩略图 URL (用于下载后上传到 Supabase) */
  originalThumbnailUrl?: string;

  /** 视频描述 */
  description?: string;

  /** 完整文本（带 URL 链接）- 用于 Twitter 等平台保留可点击链接 */
  fullTextWithLinks?: string;
}

/**
 * 视频卡片 - 保存到数据库的结构
 * 扩展 SavedSummary，复用现有基础设施
 */
export interface VideoCard {
  /** 唯一 ID */
  id: string;

  /** 视频标题 */
  title: string;

  /** 视频页面 URL (永久，用于播放回退) */
  url: string;

  /** Markdown 内容 (视频描述 + 元数据格式化) */
  markdown: string;

  /** 创建时间 */
  createdAt: number;

  /** 关联项目 ID */
  projectId?: string;

  /** 标签 */
  tags?: string[];

  /** 是否收藏 */
  starred?: boolean;

  /** 视频专属字段 */
  videoMetadata?: {
    platform: VideoPlatform;
    platformVideoId: string;
    /** 缩略图 URL (Supabase Storage 地址) */
    thumbnailUrl?: string;
    author?: string;
    duration?: number;
    publishedAt?: string;
    viewCount?: number;
    /** 视频是否可用 (定期检查更新) */
    isAvailable?: boolean;
    /** 上次检查时间 */
    lastCheckedAt?: number;
  };
}

/**
 * 视频嵌入配置 - 各平台的 iframe 参数
 */
export interface VideoEmbedConfig {
  /** 是否支持 iframe 嵌入 */
  supportsEmbed: boolean;

  /** 嵌入 URL 模板 */
  embedUrlTemplate?: string;

  /** 是否需要 Cookie/Token */
  requiresAuth?: boolean;

  /** 推荐的处理方式 */
  recommendedAction: 'embed' | 'redirect' | 'thumbnail_only';
}

/**
 * 各平台的嵌入配置
 */
export const VIDEO_PLATFORM_CONFIGS: Record<VideoPlatform, VideoEmbedConfig> = {
  youtube: {
    supportsEmbed: true,
    embedUrlTemplate: 'https://www.youtube.com/embed/{videoId}',
    requiresAuth: false,
    recommendedAction: 'embed'
  },
  bilibili: {
    supportsEmbed: true,
    embedUrlTemplate: 'https://player.bilibili.com/player.html?bvid={videoId}',
    requiresAuth: false,
    recommendedAction: 'embed'
  },
  twitter: {
    supportsEmbed: false,
    requiresAuth: true,
    recommendedAction: 'redirect'
  },
  douyin: {
    supportsEmbed: false,
    requiresAuth: true,
    recommendedAction: 'redirect'
  },
  weibo: {
    supportsEmbed: false,
    requiresAuth: true,
    recommendedAction: 'redirect'
  },
  unknown: {
    supportsEmbed: false,
    recommendedAction: 'redirect'
  }
};

/**
 * 生成视频嵌入 URL
 */
export function getVideoEmbedUrl(
  platform: VideoPlatform,
  videoId: string
): string | null {
  const config = VIDEO_PLATFORM_CONFIGS[platform];
  if (!config.supportsEmbed || !config.embedUrlTemplate) {
    return null;
  }
  return config.embedUrlTemplate.replace('{videoId}', videoId);
}

/**
 * 格式化视频时长
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * 格式化观看次数
 */
export function formatViewCount(count: number): string {
  if (count >= 100000000) {
    return `${(count / 100000000).toFixed(1)}亿`;
  }
  if (count >= 10000) {
    return `${(count / 10000).toFixed(1)}万`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}
