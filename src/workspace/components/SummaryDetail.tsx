import { createLogger } from '@/utils/logger';
import type { SavedSummary } from '@/services/database';
import type { Reference } from '@/types';

const log = createLogger('SummaryDetail');
import { useEffect, useCallback, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Undo2,
  RotateCcw,
  Bold,
  Italic,
  Underline,
  Image as ImageIcon,
  Check,
  Loader2,
  MoreHorizontal,
  Edit3,
  ExternalLink,
  Trash2,
  Copy,
  FileText,
  FileImage,
  ChevronRight,
  Download
} from 'lucide-react';
import { Button } from '@/shared/ui/radix/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/shared/ui/radix/dialog';
import { Input } from '@/shared/ui/radix/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/shared/ui/radix/popover';
import { Separator } from '@/shared/ui/radix/separator';
import { getSummaryById, updateSummary } from '@/services/workspace-api';
import {
  refreshVisualImageHistoryItem,
  type VisualImageHistoryItem
} from '@/services/agent-api';
import { sanitizeHtml } from '@/utils/sanitize-html';
import {
  escapeHtmlText,
  renderDetailMarkdown
} from '@/workspace/utils/detail-markdown-renderer';
import {
  extractFirstImageUrl,
  extractFirstVideoUrl,
  normalizeMediaUrl
} from '@/workspace/utils/media-url';
import {
  buildVisualSummaryMetadataFromHistoryItem,
  getVisualSummaryGenerationId,
  getVisualSummaryImageUrl
} from '@/workspace/utils/visual-summary';
import { ExportImageModal } from './ExportImageModal';
import { ConfirmDialog } from './ConfirmDialog';
import { ShareButton } from './ShareButton';
import { useAuth } from '@/web/contexts/AuthContext';
import { PhotoSwipeViewer } from '@/web/components/image-create/PhotoSwipeViewer';

interface SummaryDetailProps {
  summary: SavedSummary;
  onBack: () => void;
  onSelectionChange: (ref: Reference | null) => void;
  onSave?: (id: string, content: string) => Promise<void>;
  onRename?: (id: string, newTitle: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  isLoading?: boolean;
  subscription?: {
    planName: string;
    status: string;
  } | null;
}

const LOW_CONTRAST_INLINE_COLORS = new Set([
  '#0f172a',
  '#111827',
  '#1f2937',
  '#334155',
  '#374151',
  '#475569',
  '#4b5563',
  '#64748b',
  '#6b7280',
  'rgb(15,23,42)',
  'rgb(17,24,39)',
  'rgb(31,41,55)',
  'rgb(51,65,85)',
  'rgb(55,65,81)',
  'rgb(71,85,105)',
  'rgb(75,85,99)',
  'rgb(100,116,139)',
  'rgb(107,114,128)'
]);

function normalizeDetailHtmlForTheme(html: string): string {
  if (!html || !html.includes('style=')) {
    return html;
  }

  const container = document.createElement('div');
  container.innerHTML = html;

  const styledElements = container.querySelectorAll<HTMLElement>('[style]');
  for (const element of styledElements) {
    let styleText = element.getAttribute('style') || '';

    styleText = styleText
      .replace(
        /border-top\s*:\s*1px\s+solid\s+#e5e7eb\s*;?/gi,
        'border-top: 1px solid rgba(148, 163, 184, 0.35);'
      )
      .replace(
        /border\s*:\s*1px\s+solid\s+#e5e7eb\s*;?/gi,
        'border: 1px solid rgba(148, 163, 184, 0.35);'
      )
      .replace(
        /background\s*:\s*#f3f4f6\s*;?/gi,
        'background: rgba(148, 163, 184, 0.12);'
      );

    element.setAttribute('style', styleText);

    const inlineColor = element.style.color.toLowerCase().replace(/\s+/g, '');
    if (LOW_CONTRAST_INLINE_COLORS.has(inlineColor)) {
      element.style.color = 'inherit';
    }

    if (element.classList.contains('video-meta')) {
      const opacity = Number.parseFloat(element.style.opacity || '1');
      if (Number.isFinite(opacity) && opacity < 0.9) {
        element.style.opacity = '0.9';
      }
    }
  }

  return container.innerHTML;
}

function normalizeDetailOverflowHtml(html: string): string {
  if (
    !html ||
    (!html.includes('<pre') &&
      !html.includes('ai-image-summary') &&
      !html.includes('href='))
  ) {
    return html;
  }

  const container = document.createElement('div');
  container.innerHTML = html;

  const summaryCards = container.querySelectorAll<HTMLElement>(
    '.ai-image-summary-card'
  );
  for (const card of summaryCards) {
    card.style.maxWidth = '100%';
    card.style.overflowWrap = 'anywhere';
    card.style.wordBreak = 'break-word';
  }

  const preBlocks = container.querySelectorAll<HTMLElement>('pre');
  for (const pre of preBlocks) {
    if (pre.closest('.code-block-wrapper')) {
      continue;
    }

    pre.classList.add('whitespace-pre-wrap', 'break-words');
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.overflowWrap = 'anywhere';
    pre.style.wordBreak = 'break-word';
    pre.style.maxWidth = '100%';
    pre.style.overflowX = 'hidden';
  }

  const links = container.querySelectorAll<HTMLElement>('a');
  for (const link of links) {
    link.style.overflowWrap = 'anywhere';
    link.style.wordBreak = 'break-word';
  }

  return container.innerHTML;
}

function parseHtmlBody(html: string): HTMLElement {
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html').body;
}

function setElementToSingleBreak(el: HTMLElement): void {
  el.replaceChildren(document.createElement('br'));
}

function createEditableEmptyLine(): HTMLDivElement {
  const line = document.createElement('div');
  line.className = 'text-sm text-slate-800 dark:text-slate-200 mb-0';
  setElementToSingleBreak(line);
  return line;
}

function writeSanitizedHtml(el: HTMLElement, html: string): void {
  el.innerHTML = sanitizeHtml(normalizeDetailOverflowHtml(sanitizeHtml(html)));
}

function getGenerationIdFromContent(content: string): string | null {
  const match = content.match(/\bdata-generation-id=["']([^"']+)["']/i);
  return match?.[1]?.trim() || null;
}

function isRefreshableImageHistoryUrl(imageUrl: string | null): boolean {
  if (!imageUrl) return false;
  return (
    imageUrl.includes('/storage/v1/object/sign/') ||
    imageUrl.includes('/storage/v1/object/public/')
  );
}

function replaceAllImageUrlVariants(
  content: string,
  oldImageUrl: string,
  newImageUrl: string
): string {
  const escapedOldImageUrl = escapeHtmlText(oldImageUrl);
  const escapedNewImageUrl = escapeHtmlText(newImageUrl);
  return content
    .split(oldImageUrl)
    .join(newImageUrl)
    .split(escapedOldImageUrl)
    .join(escapedNewImageUrl);
}

function needsVisualSummaryMetadataUpdate(
  summary: SavedSummary,
  refreshed: VisualImageHistoryItem
): boolean {
  const metadata = summary.metadata || {};
  const visualMetadata = buildVisualSummaryMetadataFromHistoryItem(refreshed);
  return Object.entries(visualMetadata).some(([key, value]) => {
    if (value === undefined || value === null || value === '') return false;
    return metadata[key] !== value;
  });
}

async function refreshGeneratedImageUrlsInContent(
  content: string,
  fallbackImageUrl?: string
): Promise<string> {
  const generationId = getGenerationIdFromContent(content);
  const contentImageUrl = extractFirstImageUrl(content);
  const imageUrl =
    contentImageUrl && isRefreshableImageHistoryUrl(contentImageUrl)
      ? contentImageUrl
      : fallbackImageUrl && isRefreshableImageHistoryUrl(fallbackImageUrl)
        ? normalizeMediaUrl(fallbackImageUrl)
        : null;

  if (!generationId && !imageUrl) {
    return content;
  }

  try {
    const refreshed = await refreshVisualImageHistoryItem({
      generationId,
      imageUrl
    });
    if (!refreshed?.imageUrl || !imageUrl) {
      return content;
    }
    return replaceAllImageUrlVariants(content, imageUrl, refreshed.imageUrl);
  } catch (error) {
    log.warn('[SummaryDetail] Failed to refresh generated image URL:', error);
    return content;
  }
}

export function SummaryDetail({
  summary,
  onBack,
  onSelectionChange,
  onSave,
  onRename,
  onDelete,
  isLoading = false,
  subscription
}: SummaryDetailProps) {
  const { t } = useTranslation('workspace');
  const { getAccessToken } = useAuth();
  // 编辑相关状态
  const [historyStack, setHistoryStack] = useState<string[]>([]);
  const [originalHtml, setOriginalHtml] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>(
    'idle'
  );
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const statusResetTimeoutRef = useRef<NodeJS.Timeout | null>(null); // 状态重置定时器
  const normalizeRafRef = useRef<number | null>(null);
  const lastSavedContentRef = useRef<string>('');

  // 更多菜单和重命名相关状态
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showCopySubmenu, setShowCopySubmenu] = useState(false);
  const [showExportSubmenu, setShowExportSubmenu] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showExportImageModal, setShowExportImageModal] = useState(false);
  const [exportContent, setExportContent] = useState(''); // 导出图片时的内容

  // 分享状态
  const [isShared, setIsShared] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  // 图片渐进式加载状态
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [displayImageUrl, setDisplayImageUrl] = useState<string | null>(null);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const [, setImageLoadProgress] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isLoadingOriginal, setIsLoadingOriginal] = useState(false);
  const loadAbortRef = useRef<AbortController | null>(null);

  const persistVisualSummaryMetadata = useCallback(
    async (refreshed: VisualImageHistoryItem) => {
      if (!needsVisualSummaryMetadataUpdate(summary, refreshed)) return;
      try {
        await updateSummary(summary.id, {
          metadata: {
            ...(summary.metadata || {}),
            ...buildVisualSummaryMetadataFromHistoryItem(refreshed)
          }
        });
      } catch (error) {
        log.warn('[SummaryDetail] Failed to persist visual metadata:', error);
      }
    },
    [summary]
  );

  // 检测内容是否是"纯媒体卡片"（通过上传图片/视频按钮创建的）
  // 区分"纯媒体卡片"和"带媒体的文章"：
  // - 纯媒体卡片：内容主要是图片/视频，文字很少（如只有图片+描述占位符）
  // - 带媒体的文章：普通文章中插入了图片/视频，但主要内容是文字
  const isImageContent = useCallback(
    (
      content: string | undefined,
      contentType?: 'article' | 'image' | 'video'
    ): boolean => {
      if (contentType === 'image' || contentType === 'video') {
        return true;
      }
      if (contentType === 'article') {
        return false;
      }
      if (!content) return false;

      const markdownHasMedia = /!\[[^\]]*\]\(([^)]+)\)/.test(content);
      const markdownWithoutMedia = content
        .replace(/!\[[^\]]*\]\(([^)]+)\)/g, '')
        .trim();
      if (markdownHasMedia && !content.trim().startsWith('<')) {
        if (/^\s*#{1,6}\s+\S/m.test(content)) {
          return false;
        }
        const nonEmptyLines = markdownWithoutMedia
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
        if (nonEmptyLines.length > 1) {
          return false;
        }
        return markdownWithoutMedia.length < 30;
      }

      // 检查是否包含图片或视频
      const hasImage =
        content.includes('<img ') ||
        content.includes('<img>') ||
        markdownHasMedia;
      const hasVideo =
        content.includes('<video ') || content.includes('<video>');
      if (!hasImage && !hasVideo) {
        return false;
      }

      // 提取所有纯文本内容（排除图片 alt 和 data-placeholder 占位符）
      const tempDiv = parseHtmlBody(content);

      // 移除图片和视频元素
      const imgs = tempDiv.querySelectorAll('img');
      imgs.forEach((img) => img.remove());
      const videos = tempDiv.querySelectorAll('video');
      videos.forEach((video) => video.remove());

      // 移除占位符元素
      const placeholders = tempDiv.querySelectorAll(
        '[data-placeholder="true"]'
      );
      placeholders.forEach((el) => el.remove());

      // 获取剩余的纯文本
      const remainingText = tempDiv.textContent?.trim() || '';

      // 如果剩余文本很少（少于 30 个字符），认为是纯媒体卡片
      return remainingText.length < 30;
    },
    []
  );

  // 从HTML中提取第一张图片或视频的src
  const getImageSrc = (content: string | undefined): string | null => {
    const imageUrl = extractFirstImageUrl(content);
    if (imageUrl) return imageUrl;

    const videoUrl = extractFirstVideoUrl(content);
    return videoUrl ? normalizeMediaUrl(videoUrl) : null;
  };

  // 检测内容是否是视频类型
  const isVideoContent = (content: string | undefined): boolean => {
    if (!content) return false;
    return content.includes('<video ') || content.includes('<video>');
  };

  // 从HTML中提取视频的src
  const getVideoSrc = (content: string | undefined): string | null => {
    const videoUrl = extractFirstVideoUrl(content);
    return videoUrl ? normalizeMediaUrl(videoUrl) : null;
  };

  // 图片渐进式加载：获取原图
  useEffect(() => {
    let cancelled = false;
    const isImage = isImageContent(summary.markdown, summary.contentType);
    if (!isImage) {
      // 不是图片类型，重置状态
      setOriginalImageUrl(null);
      setDisplayImageUrl(null);
      setImageLoaded(false);
      setImageLoadProgress(0);
      setIsLoadingOriginal(false);
      return;
    }

    // 取消之前的请求
    if (loadAbortRef.current) {
      loadAbortRef.current.abort();
    }
    loadAbortRef.current = new AbortController();

    // 从 API 获取原图
    const loadOriginalImage = async () => {
      try {
        let metadataDisplayUrl = getVisualSummaryImageUrl(summary, 'preview');
        let metadataOriginalUrl = getVisualSummaryImageUrl(summary, 'original');
        const metadataGenerationId = getVisualSummaryGenerationId(summary);

        if (metadataGenerationId) {
          try {
            const refreshed = await refreshVisualImageHistoryItem({
              generationId: metadataGenerationId,
              imageUrl: metadataOriginalUrl || metadataDisplayUrl
            });
            if (refreshed) {
              void persistVisualSummaryMetadata(refreshed);
            }
            metadataDisplayUrl =
              refreshed?.previewUrl ||
              refreshed?.thumbnailUrl ||
              refreshed?.imageUrl ||
              metadataDisplayUrl;
            metadataOriginalUrl = refreshed?.imageUrl || metadataOriginalUrl;
          } catch (refreshError) {
            log.warn(
              '[SummaryDetail] Failed to refresh visual summary metadata URL:',
              refreshError
            );
          }
        }

        if (metadataDisplayUrl) {
          setDisplayImageUrl(metadataDisplayUrl);
          setOriginalImageUrl(metadataOriginalUrl || metadataDisplayUrl);
          setImageLoaded(true);
          setImageLoadProgress(100);
          setIsLoadingOriginal(false);
          return;
        }

        const contentGenerationId = getGenerationIdFromContent(
          summary.markdown
        );
        const contentImageUrl = getImageSrc(summary.markdown);
        if (
          contentGenerationId ||
          isRefreshableImageHistoryUrl(contentImageUrl)
        ) {
          try {
            const refreshed = await refreshVisualImageHistoryItem({
              generationId: contentGenerationId,
              imageUrl: contentImageUrl
            });
            if (cancelled) return;
            if (refreshed?.imageUrl) {
              void persistVisualSummaryMetadata(refreshed);
              const refreshedDisplayUrl =
                refreshed.previewUrl ||
                refreshed.thumbnailUrl ||
                refreshed.imageUrl;
              setDisplayImageUrl(refreshedDisplayUrl);
              setOriginalImageUrl(refreshed.imageUrl || refreshedDisplayUrl);
              setImageLoaded(true);
              setImageLoadProgress(100);
              setIsLoadingOriginal(false);
              return;
            }
          } catch (refreshError) {
            log.warn(
              '[SummaryDetail] Failed to refresh visual summary content URL:',
              refreshError
            );
          }
        }

        const refreshedMarkdown = await refreshGeneratedImageUrlsInContent(
          summary.markdown,
          summary.url
        );
        if (cancelled) return;

        // 获取缩略图 URL（当前显示的）
        const thumbnailUrl = getImageSrc(refreshedMarkdown);
        if (!thumbnailUrl) {
          setOriginalImageUrl(null);
          setDisplayImageUrl(null);
          setImageLoaded(false);
          setImageLoadProgress(0);
          setIsLoadingOriginal(false);
          return;
        }
        setDisplayImageUrl(thumbnailUrl);

        // 检查是否是 base64 图片
        const isBase64 = thumbnailUrl.startsWith('data:image');
        if (!isBase64) {
          // 如果不是 base64，可能已经是原图 URL，直接显示
          setOriginalImageUrl(thumbnailUrl);
          setImageLoaded(true);
          setImageLoadProgress(100);
          setIsLoadingOriginal(false);
          return;
        }

        // 重置状态，准备加载原图
        setOriginalImageUrl(null);
        setImageLoaded(false);
        setImageLoadProgress(0);
        setIsLoadingOriginal(true);

        log.info('[SummaryDetail] Loading original image for:', summary.id);
        const originalSummary = await getSummaryById(summary.id);
        if (cancelled) return;

        if (!originalSummary) {
          log.warn('[SummaryDetail] Original summary not found');
          setIsLoadingOriginal(false);
          return;
        }

        const refreshedOriginalMarkdown =
          await refreshGeneratedImageUrlsInContent(
            originalSummary.markdown,
            originalSummary.url
          );
        if (cancelled) return;

        const originalUrl = getImageSrc(refreshedOriginalMarkdown);
        if (!originalUrl) {
          log.warn('[SummaryDetail] No image found in original summary');
          setIsLoadingOriginal(false);
          return;
        }

        // 如果原图和缩略图相同（没有压缩），直接显示
        if (originalUrl === thumbnailUrl) {
          log.info('[SummaryDetail] Original same as thumbnail, skip loading');
          setDisplayImageUrl(originalUrl);
          setOriginalImageUrl(originalUrl);
          setImageLoaded(true);
          setIsLoadingOriginal(false);
          return;
        }

        // 预加载原图（使用 Image 对象）
        log.info('[SummaryDetail] Preloading original image...');
        setImageLoadProgress(10); // 开始加载

        // 如果是 base64，直接设置
        if (originalUrl.startsWith('data:image')) {
          // 模拟加载进度
          setImageLoadProgress(50);

          // 创建 Image 对象预加载
          const img = new Image();
          img.onload = () => {
            if (cancelled) return;
            log.info('[SummaryDetail] Original image loaded');
            setImageLoadProgress(100);
            // 使用 requestAnimationFrame 代替 setTimeout 避免内存泄漏
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                if (cancelled) return;
                setDisplayImageUrl(originalUrl);
                setOriginalImageUrl(originalUrl);
                setImageLoaded(true);
                setIsLoadingOriginal(false);
              });
            });
          };
          img.onerror = () => {
            if (cancelled) return;
            log.error('[SummaryDetail] Failed to load original image');
            setIsLoadingOriginal(false);
          };
          img.src = originalUrl;
        } else {
          // 外部 URL，使用 XHR 获取加载进度
          const xhr = new XMLHttpRequest();
          xhr.open('GET', originalUrl, true);
          xhr.responseType = 'blob';

          xhr.onprogress = (e) => {
            if (e.lengthComputable) {
              const progress = Math.round((e.loaded / e.total) * 100);
              setImageLoadProgress(progress);
            }
          };

          xhr.onload = () => {
            if (cancelled) return;
            if (xhr.status === 200) {
              const blob = xhr.response;
              const objectUrl = URL.createObjectURL(blob);
              setDisplayImageUrl(objectUrl);
              setOriginalImageUrl(objectUrl);
              setImageLoaded(true);
              setIsLoadingOriginal(false);
            }
          };

          xhr.onerror = () => {
            if (cancelled) return;
            log.error('[SummaryDetail] XHR failed to load image');
            setIsLoadingOriginal(false);
          };

          xhr.send();
        }
      } catch (error) {
        if (cancelled) return;
        log.error('[SummaryDetail] Failed to load original:', error);
        setIsLoadingOriginal(false);
      }
    };

    loadOriginalImage();

    // 清理函数
    return () => {
      cancelled = true;
      if (loadAbortRef.current) {
        loadAbortRef.current.abort();
      }
    };
  }, [
    isImageContent,
    persistVisualSummaryMetadata,
    summary
  ]);

  // 清理标题中的 markdown 图片语法
  const cleanTitle = (title: string): string => {
    if (!title) return '';
    // 移除 markdown 图片语法 ![...] 或 ![
    let cleaned = title.replace(/!\[[^\]]*\]?(\([^)]*\))?/g, '').trim();
    // 移除开头的 ![ 如果没有闭合
    cleaned = cleaned.replace(/^!\[?/, '').trim();
    return cleaned || title;
  };

  // 打开重命名弹窗
  const handleOpenRename = () => {
    setRenameValue(getCurrentTitle());
    setShowMoreMenu(false);
    setShowRenameModal(true);
  };

  // 确认重命名
  const handleConfirmRename = async () => {
    if (!onRename || !renameValue.trim()) return;
    setRenaming(true);
    try {
      await onRename(summary.id, renameValue.trim());
      setShowRenameModal(false);
    } catch (error) {
      log.error('[SummaryDetail] Rename failed:', error);
    } finally {
      setRenaming(false);
    }
  };

  // 打开源文件
  const handleOpenSource = () => {
    setShowMoreMenu(false);
    if (summary.url && summary.url !== 'note://local') {
      window.open(summary.url, '_blank');
    }
  };

  const handleDeleteSummary = useCallback(async () => {
    if (!onDelete) return;
    setShowMoreMenu(false);
    setShowDeleteModal(true);
  }, [onDelete]);

  const handleConfirmDelete = useCallback(async () => {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete(summary.id);
      setShowDeleteModal(false);
      onBack();
    } catch (error) {
      log.error('[SummaryDetail] Delete summary failed:', error);
    } finally {
      setDeleting(false);
    }
  }, [onBack, onDelete, summary.id]);

  // 复制为 Markdown
  const handleCopyMarkdown = async () => {
    setShowMoreMenu(false);
    setShowCopySubmenu(false);
    try {
      // 从 summary.markdown 获取原始 markdown 内容
      let content = summary.markdown || '';

      // 如果是 HTML 格式，转换为纯文本（保留换行）
      if (content.trim().startsWith('<')) {
        const tempDiv = parseHtmlBody(content);
        // 将 <br> 和 div 结尾转为换行
        content = tempDiv.innerHTML
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/div>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .trim();
      }

      await navigator.clipboard.writeText(content);
      // 复制成功（可选：添加 toast 提示）
    } catch (error) {
      log.error('[SummaryDetail] Copy markdown failed:', error);
    }
  };

  // 复制为纯文本
  const handleCopyText = async () => {
    setShowMoreMenu(false);
    setShowCopySubmenu(false);
    try {
      // 获取编辑器当前内容的纯文本
      let content = '';
      if (editorRef.current) {
        content = editorRef.current.textContent || '';
      } else {
        // 从 markdown 提取
        const tempDiv = parseHtmlBody(summary.markdown || '');
        content = tempDiv.textContent || '';
      }

      await navigator.clipboard.writeText(content.trim());
      // 复制成功（可选：添加 toast 提示）
    } catch (error) {
      log.error('[SummaryDetail] Copy text failed:', error);
    }
  };

  // 导出为 PDF（使用打印功能）- 修复版本
  const handleExportPDF = () => {
    setShowMoreMenu(false);
    setShowExportSubmenu(false);

    if (!editorRef.current) return;

    // 创建一个新窗口用于打印
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      log.error('[SummaryDetail] Failed to open print window');
      return;
    }

    // 获取当前内容
    const content = editorRef.current.innerHTML;
    const title = getCurrentTitle();
    const safeTitle = escapeHtmlText(title);
    const safeContent = sanitizeHtml(content);

    // 构建打印页面 HTML
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${safeTitle} - WebToMind</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #1e293b;
            padding: 40px;
            max-width: 800px;
            margin: 0 auto;
          }
          .header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 1px solid #e2e8f0;
            opacity: 0.7;
          }
          .header svg {
            width: 24px;
            height: 24px;
          }
          .header span {
            font-size: 14px;
            font-weight: 600;
            color: #64748b;
          }
          .content img {
            max-width: 100%;
            height: auto;
            border-radius: 8px;
            margin: 12px 0;
          }
          .content div {
            margin-bottom: 8px;
          }
          @media print {
            body { padding: 20px; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="2" width="24" height="24" rx="6" fill="url(#grad)"/>
            <path d="M10 10L14 14L10 18M16 18H22" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <defs>
              <linearGradient id="grad" x1="2" y1="2" x2="26" y2="26" gradientUnits="userSpaceOnUse">
                <stop stop-color="#3b82f6"/>
                <stop offset="1" stop-color="#8b5cf6"/>
              </linearGradient>
            </defs>
          </svg>
          <span>WebToMind</span>
        </div>
        <div class="content">${safeContent}</div>
      </body>
      </html>
    `);

    printWindow.document.close();

    // 等待内容加载完成后打印
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  };

  // 导出为图片 - 打开预览弹窗
  const handleExportImage = () => {
    setShowMoreMenu(false);
    setShowExportSubmenu(false);
    // 在打开弹窗前获取当前编辑器内容
    const content = editorRef.current?.innerHTML || summary.markdown;
    log.info('[SummaryDetail] Export image content length:', content.length);
    setExportContent(content);
    setShowExportImageModal(true);
  };

  const handleDownloadLightboxImage = useCallback(() => {
    if (!lightboxImageUrl) return;
    const link = document.createElement('a');
    link.href = lightboxImageUrl;
    link.download = `${cleanTitle(summary.title) || 'webtomind-image'}.png`;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, [lightboxImageUrl, summary.title]);

  // 导航到升级页面
  const handleNavigateToUpgrade = () => {
    window.open('https://webtomind.com/pricing', '_blank');
  };

  // 检查是否可以打开源文件（不是本地笔记且有有效URL）
  const canOpenSource =
    summary.url &&
    summary.url !== 'note://local' &&
    summary.url.startsWith('http');

  // 移除标题前的序号前缀，如 (1)、1.、1、、[1] 等
  const removeNumberPrefix = useCallback((text: string): string => {
    return text
      .replace(/^\s*\(\d+\)\s*/, '') // (1) 格式
      .replace(/^\s*\[\d+\]\s*/, '') // [1] 格式
      .replace(/^\s*\d+[.、:：]\s*/, '') // 1. 或 1、 或 1: 格式
      .trim();
  }, []);

  // 从markdown或HTML中提取标题
  const getTitle = useCallback(
    (content: string | undefined): string => {
      if (!content) return t('detail.untitled');
      // 检测是否是 HTML 格式（编辑后的内容）
      if (content.trim().startsWith('<')) {
        // 从 HTML 中提取第一个 div 的文本内容（标题）
        const match = content.match(
          /<div[^>]*class="[^"]*text-xl[^"]*"[^>]*>([^<]+)<\/div>/
        );
        if (match) return removeNumberPrefix(match[1].trim());

        // 如果没找到标题样式的 div，提取第一个 div 的文本
        const firstDiv = content.match(/<div[^>]*>([^<]+)<\/div>/);
        if (firstDiv) {
          const text = removeNumberPrefix(firstDiv[1].trim());
          return text.slice(0, 20) + (text.length > 20 ? '...' : '');
        }
        return t('detail.untitled');
      }

      // Markdown 格式
      const match = content.match(/^#\s+(.+)$/m);
      if (match) {
        return removeNumberPrefix(match[1]);
      }
      // 如果没有找到标题，返回前20个字符
      const text = content
        .replace(/#{1,6}\s/g, '')
        .replace(/[*_`~]/g, '')
        .trim();
      const cleanText = removeNumberPrefix(text);
      return cleanText.slice(0, 20) + (cleanText.length > 20 ? '...' : '');
    },
    [removeNumberPrefix, t]
  );

  // 获取当前标题（图片用 title，其他用从 markdown 提取）
  const getCurrentTitle = useCallback((): string => {
    if (isImageContent(summary.markdown, summary.contentType)) {
      return cleanTitle(summary.title) || t('detail.image');
    }
    return cleanTitle(getTitle(summary.markdown));
  }, [
    getTitle,
    isImageContent,
    summary.contentType,
    summary.markdown,
    summary.title,
    t
  ]);

  const renderMarkdown = renderDetailMarkdown;

  // 处理选中变化
  const handleSelectionChange = useCallback(() => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();

    // 检查选中/光标是否在编辑器内部
    const anchorInEditor =
      selection?.anchorNode &&
      editorRef.current?.contains(selection.anchorNode);
    const focusInEditor =
      selection?.focusNode && editorRef.current?.contains(selection.focusNode);
    const isSelectionInEditor = anchorInEditor || focusInEditor;

    if (selectedText && selectedText.length > 0 && isSelectionInEditor) {
      // 有选中文字且在编辑器内 → 创建引用
      const ref: Reference = {
        id: `sel-${Date.now()}`,
        type: 'selection',
        summaryId: summary.id,
        summaryTitle: getTitle(summary.markdown),
        content: selectedText,
        preview:
          selectedText.slice(0, 8) + (selectedText.length > 8 ? '...' : '')
      };
      onSelectionChange(ref);
    }
    // 注意：不在这里清除引用。引用只能通过以下方式清除：
    // 1. 用户点击关闭按钮
    // 2. 用户在编辑器内部点击（通过 onEditorClick 处理）
  }, [getTitle, onSelectionChange, summary.id, summary.markdown]);

  // 处理编辑器内部点击（用于清除选中引用、处理占位符、处理链接点击）
  const handleEditorClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;

      // 处理链接点击（contentEditable 会阻止链接默认行为）
      // 检查点击目标或其父元素是否是链接
      const link = target.closest('a');
      if (link && link.href) {
        e.preventDefault();
        e.stopPropagation();
        // 在新标签页打开链接
        window.open(link.href, '_blank', 'noopener,noreferrer');
        return;
      }

      // 处理带有 data-video-url 的元素点击（视频缩略图播放按钮）
      const videoWrapper = target.closest(
        '.play-overlay, .video-thumbnail-wrapper'
      );
      if (videoWrapper) {
        const videoUrl =
          videoWrapper.closest('.video-thumbnail-wrapper')?.querySelector('img')
            ?.dataset?.videoUrl || videoWrapper.getAttribute('href');
        if (videoUrl) {
          e.preventDefault();
          e.stopPropagation();
          window.open(videoUrl, '_blank', 'noopener,noreferrer');
          return;
        }
      }

      // 检查是否点击了占位符
      if (target.dataset.placeholder === 'true') {
        // 清除占位符属性和样式
        target.removeAttribute('data-placeholder');
        target.className = 'text-sm text-slate-800 dark:text-slate-200 mb-0';
        // 添加 <br> 以保持高度并使光标可见
        setElementToSingleBreak(target);

        // 确保编辑器获得焦点
        editorRef.current?.focus();

        // 将光标放在 <br> 之前
        setTimeout(() => {
          const selection = window.getSelection();
          const range = document.createRange();
          const br = target.querySelector('br');
          if (br) {
            range.setStartBefore(br);
          } else {
            range.setStart(target, 0);
          }
          range.collapse(true);
          selection?.removeAllRanges();
          selection?.addRange(range);
        }, 0);
        return;
      }

      // 如果点击后没有选中文字，清除引用
      // 使用 setTimeout 确保在 selectionchange 之后执行
      setTimeout(() => {
        const currentSelection = window.getSelection();
        const currentText = currentSelection?.toString().trim();
        if (!currentText || currentText.length === 0) {
          onSelectionChange(null);
        }
      }, 0);
    },
    [onSelectionChange]
  );

  // 监听选中事件
  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [handleSelectionChange]);

  // 获取hostname（支持本地笔记）
  const getHostname = (url: string): string => {
    if (url === 'note://local') {
      return t('detail.localNote');
    }
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  };

  // 初始化编辑器内容
  useEffect(() => {
    let cancelled = false;

    const initializeEditor = async () => {
      if (!editorRef.current) return;
      // 检测内容是否已经是 HTML 格式（编辑后保存的内容）
      const content = (
        await refreshGeneratedImageUrlsInContent(summary.markdown, summary.url)
      ).trim();

      if (cancelled || !editorRef.current) return;

      // 检测是否是纯 HTML 格式（编辑后保存的内容，通常以 <div 开头且不包含 markdown 语法）
      // 混合格式（HTML + Markdown）需要特殊处理
      const isPureHtml =
        content.startsWith('<') &&
        !content.includes('![') &&
        !content.includes('](');
      const isMixedFormat =
        content.startsWith('<div class="flex') &&
        (content.includes('![') || content.includes(']('));

      let html: string;
      if (isPureHtml) {
        // 纯 HTML 格式，直接使用
        html = content;
      } else if (isMixedFormat) {
        // 混合格式（Twitter 书签等）：HTML 作者信息 + Markdown 正文
        // 找到第一个 </div> 后的内容，对其进行 markdown 转换
        const firstDivEnd = content.indexOf('</div>');
        if (firstDivEnd !== -1) {
          const htmlPart = content.substring(0, firstDivEnd + 6);
          const markdownPart = content.substring(firstDivEnd + 6).trim();
          html = htmlPart + '\n' + renderMarkdown(markdownPart);
        } else {
          html = renderMarkdown(content);
        }
      } else {
        // 纯 Markdown 格式
        html = renderMarkdown(content);
      }

      // 清理旧数据中的固定缩进和固定高度（兼容旧格式）
      if (isPureHtml) {
        html = html
          .replace(/\bpl-4\b/g, '') // 移除固定左缩进
          .replace(
            /class="h-4">/g,
            'class="text-sm text-slate-800 dark:text-slate-200 mb-0"><br'
          ); // 转换固定高度空行
      }

      html = sanitizeHtml(html);
      html = normalizeDetailHtmlForTheme(html);
      html = normalizeDetailOverflowHtml(html);
      html = sanitizeHtml(html);

      writeSanitizedHtml(editorRef.current, html);

      // 规范化内容：修复裸露的图片/视频等结构问题
      // 使用 setTimeout 确保 DOM 更新完成后再执行
      setTimeout(() => {
        if (editorRef.current) {
          // 处理直接暴露在编辑器根级别的图片
          const directImages =
            editorRef.current.querySelectorAll(':scope > img');
          for (const img of directImages) {
            const wrapper = document.createElement('div');
            wrapper.className =
              'text-sm text-slate-800 dark:text-slate-200 mb-0 image-block';
            img.replaceWith(wrapper);
            wrapper.appendChild(img);
            (img as HTMLElement).className =
              'max-w-full rounded-lg my-2 cursor-pointer';
            (img as HTMLElement).style.display = 'block';
          }

          // 处理直接暴露在编辑器根级别的视频
          const directVideos =
            editorRef.current.querySelectorAll(':scope > video');
          for (const video of directVideos) {
            const wrapper = document.createElement('div');
            wrapper.className =
              'text-sm text-slate-800 dark:text-slate-200 mb-0 video-block';
            video.replaceWith(wrapper);
            wrapper.appendChild(video);
            (video as HTMLVideoElement).className =
              'max-w-full rounded-lg my-2';
            (video as HTMLVideoElement).style.display = 'block';
            // 确保视频自动播放和循环
            (video as HTMLVideoElement).autoplay = true;
            (video as HTMLVideoElement).loop = true;
            (video as HTMLVideoElement).muted = true;
            (video as HTMLVideoElement).playsInline = true;
          }

          // 确保所有图片都有正确的样式
          const allImages = editorRef.current.querySelectorAll('img');
          for (const img of allImages) {
            const el = img as HTMLElement;
            if (!el.className.includes('cursor-pointer')) {
              el.className = 'max-w-full rounded-lg my-2 cursor-pointer';
              el.style.display = 'block';
            }
          }

          // 更新保存的原始内容
          const normalizedHtml = editorRef.current.innerHTML;
          setOriginalHtml(normalizedHtml);
          lastSavedContentRef.current = normalizedHtml;
        }
      }, 0);

      setOriginalHtml(html);
      setHistoryStack([]);
      lastSavedContentRef.current = html;
      setSaveStatus('idle');

      // 新笔记：将光标放在正文开头（标题后的第一个段落）
      // 判断是否是新笔记：本地笔记且内容以 # New note 开头
      const isNewNote =
        summary.url === 'note://local' && content.startsWith('# New note');
      if (isNewNote) {
        // 延迟执行以确保 DOM 已更新
        setTimeout(() => {
          if (editorRef.current) {
            editorRef.current.focus();
            const divs = editorRef.current.querySelectorAll(':scope > div');

            // 找到第二个 div（正文区域），如果只有一个则创建一个新的正文 div
            let targetDiv = divs[1];
            if (!targetDiv && divs.length === 1) {
              // 只有标题，需要创建正文行
              const newDiv = createEditableEmptyLine();
              editorRef.current.appendChild(newDiv);
              targetDiv = newDiv;
            }

            if (targetDiv) {
              const selection = window.getSelection();
              const range = document.createRange();

              // 如果 div 内有 <br>，需要特殊处理
              const br = targetDiv.querySelector('br');
              if (br) {
                range.setStartBefore(br);
              } else if (targetDiv.firstChild) {
                range.setStart(targetDiv.firstChild, 0);
              } else {
                range.setStart(targetDiv, 0);
              }
              range.collapse(true);
              selection?.removeAllRanges();
              selection?.addRange(range);
            }
          }
        }, 100);
      }
    };

    void initializeEditor();

    return () => {
      cancelled = true;
    };
  }, [renderMarkdown, summary.id, summary.markdown, summary.url]);

  // 自动保存函数（防抖）
  const autoSave = useCallback(() => {
    if (!editorRef.current || !onSave) return;

    const currentContent = editorRef.current.innerHTML;

    // 如果内容没有变化，不保存
    if (currentContent === lastSavedContentRef.current) return;

    // 清除之前的定时器
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // 设置新的定时器，1秒后保存
    saveTimeoutRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await onSave(summary.id, currentContent);
        lastSavedContentRef.current = currentContent;
        setSaveStatus('saved');

        // 3秒后恢复idle状态（使用 ref 跟踪以便清理）
        if (statusResetTimeoutRef.current) {
          clearTimeout(statusResetTimeoutRef.current);
        }
        statusResetTimeoutRef.current = setTimeout(() => {
          setSaveStatus('idle');
        }, 3000);
      } catch (error) {
        log.error('[SummaryDetail] Auto-save failed:', error);
        setSaveStatus('idle');
      }
    }, 1000);
  }, [onSave, summary.id]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (statusResetTimeoutRef.current) {
        clearTimeout(statusResetTimeoutRef.current);
      }
      if (normalizeRafRef.current !== null) {
        cancelAnimationFrame(normalizeRafRef.current);
      }
    };
  }, []);

  // 保存到历史记录（用于撤销）
  const saveToHistory = useCallback(() => {
    if (editorRef.current) {
      const currentHtml = editorRef.current.innerHTML;
      setHistoryStack((prev) => {
        // 避免重复保存相同内容
        if (prev[prev.length - 1] === currentHtml) return prev;
        return [...prev.slice(-19), currentHtml];
      });
    }
  }, []);

  // 规范化编辑器内容 - 修复 DOM 结构问题
  const normalizeEditorContent = useCallback(() => {
    if (!editorRef.current) return;

    const editor = editorRef.current;
    let needsCleanup = false;

    // 0. 处理直接暴露在编辑器根级别的图片（将它们包裹在 div 中）
    const directImages = editor.querySelectorAll(':scope > img');
    for (const img of directImages) {
      const wrapper = document.createElement('div');
      wrapper.className =
        'text-sm text-slate-800 dark:text-slate-200 mb-0 image-block';
      img.replaceWith(wrapper);
      wrapper.appendChild(img);
      // 确保图片有正确的样式
      (img as HTMLElement).className =
        'max-w-full rounded-lg my-2 cursor-pointer';
      (img as HTMLElement).style.display = 'block';
      needsCleanup = true;
    }

    // 0.1 处理直接暴露在编辑器根级别的视频（将它们包裹在 div 中）
    const directVideos = editor.querySelectorAll(':scope > video');
    for (const video of directVideos) {
      const wrapper = document.createElement('div');
      wrapper.className =
        'text-sm text-slate-800 dark:text-slate-200 mb-0 video-block';
      video.replaceWith(wrapper);
      wrapper.appendChild(video);
      // 确保视频有正确的样式和属性
      (video as HTMLVideoElement).className = 'max-w-full rounded-lg my-2';
      (video as HTMLVideoElement).style.display = 'block';
      (video as HTMLVideoElement).autoplay = true;
      (video as HTMLVideoElement).loop = true;
      (video as HTMLVideoElement).muted = true;
      (video as HTMLVideoElement).playsInline = true;
      needsCleanup = true;
    }

    // 1. 处理直接暴露在编辑器根级别的文本节点
    const childNodes = Array.from(editor.childNodes);
    for (const node of childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
        // 将裸露的文本节点包装成 div
        const wrapper = document.createElement('div');
        wrapper.className = 'text-sm text-slate-800 dark:text-slate-200 mb-0';
        wrapper.textContent = node.textContent;
        node.replaceWith(wrapper);
        needsCleanup = true;
      }
    }

    // 2. 移除嵌套的 div（将内层 div 提升到外层）- 但保留包含图片或视频的 div
    const nestedDivs = editor.querySelectorAll('div > div');
    for (const nested of nestedDivs) {
      const parent = nested.parentElement;
      // 确保父元素是编辑器的直接子元素，且不是编辑器本身
      if (parent && parent !== editor && parent.parentElement === editor) {
        // 如果父元素包含图片或视频，不要提升（保持容器结构）
        if (parent.querySelector('img') || parent.querySelector('video')) {
          continue;
        }
        // 如果父元素只包含这个嵌套的 div，直接替换
        if (parent.childNodes.length === 1) {
          // 继承父元素的样式
          if (!nested.className) {
            (nested as HTMLElement).className =
              parent.className ||
              'text-sm text-slate-800 dark:text-slate-200 mb-0';
          }
          parent.replaceWith(nested);
          needsCleanup = true;
        }
      }
    }

    // 3. 处理空的 div - 不删除，而是确保有 <br> 保持高度（但不处理包含图片或视频的 div）
    const allDivs = editor.querySelectorAll('div');
    for (const div of allDivs) {
      const content = div.innerHTML.trim();
      // 如果 div 完全为空且不包含图片或视频，添加 <br> 保持高度
      if (
        content === '' &&
        div.parentElement === editor &&
        !div.querySelector('img') &&
        !div.querySelector('video')
      ) {
        setElementToSingleBreak(div as HTMLElement);
        needsCleanup = true;
      }
    }

    // 4. 清理固定缩进和固定高度（兼容旧数据）
    const divsWithPadding = editor.querySelectorAll(':scope > div');
    for (const div of divsWithPadding) {
      const el = div as HTMLElement;
      const classList = el.className;

      // 移除固定左缩进 pl-4
      if (classList.includes('pl-4')) {
        el.className = classList.replace(/\bpl-4\b/g, '').trim();
        needsCleanup = true;
      }

      // 将固定高度的空行 (h-4) 转换为正常的空行
      if (classList.includes('h-4') && el.innerHTML.trim() === '') {
        el.className = 'text-sm text-slate-800 dark:text-slate-200 mb-0';
        setElementToSingleBreak(el);
        needsCleanup = true;
      }
    }

    // 5. 确保每个 div 都有正确的样式类
    const directDivs = editor.querySelectorAll(':scope > div');
    for (const div of directDivs) {
      if (!(div as HTMLElement).className) {
        (div as HTMLElement).className =
          'text-sm text-slate-800 dark:text-slate-200 mb-0';
        needsCleanup = true;
      }
    }

    // 6. 确保所有图片都可以被选中和删除
    const allImages = editor.querySelectorAll('img');
    for (const img of allImages) {
      const el = img as HTMLElement;
      if (!el.className.includes('cursor-pointer')) {
        el.className = 'max-w-full rounded-lg my-2 cursor-pointer';
        el.style.display = 'block';
        needsCleanup = true;
      }
    }

    // 7. 确保所有视频都有正确的属性
    const allVideos = editor.querySelectorAll('video');
    for (const video of allVideos) {
      const el = video as HTMLVideoElement;
      if (!el.className.includes('rounded-lg')) {
        el.className = 'max-w-full rounded-lg my-2';
        el.style.display = 'block';
        needsCleanup = true;
      }
      // 确保视频自动播放和循环
      if (!el.autoplay) {
        el.autoplay = true;
        el.loop = true;
        el.muted = true;
        el.playsInline = true;
        needsCleanup = true;
      }
    }

    return needsCleanup;
  }, []);

  const scheduleNormalizeEditorContent = useCallback(() => {
    if (normalizeRafRef.current !== null) {
      cancelAnimationFrame(normalizeRafRef.current);
    }

    normalizeRafRef.current = requestAnimationFrame(() => {
      normalizeRafRef.current = null;
      normalizeEditorContent();
    });
  }, [normalizeEditorContent]);

  // 撤销
  const handleUndo = () => {
    if (historyStack.length > 0 && editorRef.current) {
      const lastState = historyStack[historyStack.length - 1];
      setHistoryStack((prev) => prev.slice(0, -1));
      writeSanitizedHtml(editorRef.current, lastState);
    }
  };

  // 重置到原始内容
  const handleReset = () => {
    if (confirm(t('detail.confirmReset'))) {
      if (editorRef.current) {
        writeSanitizedHtml(editorRef.current, originalHtml);
        setHistoryStack([]);
      }
    }
  };

  // 格式化文本
  const formatText = (command: 'bold' | 'italic' | 'underline') => {
    saveToHistory();
    document.execCommand(command, false);
    editorRef.current?.focus();
  };

  // 上传图片
  const handleImageUpload = () => {
    fileInputRef.current?.click();
  };

  // 处理文件选择
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    saveToHistory();

    const reader = new FileReader();
    reader.onload = () => {
      // 创建图片容器 div（与其他内容块结构一致）
      const wrapper = document.createElement('div');
      wrapper.className =
        'text-sm text-slate-800 dark:text-slate-200 mb-0 image-block';
      wrapper.contentEditable = 'true';

      const img = document.createElement('img');
      img.src = reader.result as string;
      img.className = 'max-w-full rounded-lg my-2 cursor-pointer';
      img.style.display = 'block'; // 确保图片是块级元素

      wrapper.appendChild(img);

      const selection = window.getSelection();
      if (
        selection &&
        selection.rangeCount > 0 &&
        editorRef.current?.contains(selection.anchorNode)
      ) {
        const range = selection.getRangeAt(0);
        // 找到当前行的顶层 div
        let currentNode = range.startContainer as Node | null;
        let topLevelDiv: HTMLElement | null = null;
        while (currentNode && currentNode !== editorRef.current) {
          if (
            currentNode.parentNode === editorRef.current &&
            currentNode.nodeType === Node.ELEMENT_NODE
          ) {
            topLevelDiv = currentNode as HTMLElement;
            break;
          }
          currentNode = currentNode.parentNode;
        }

        if (topLevelDiv) {
          // 在当前 div 之后插入图片容器
          topLevelDiv.insertAdjacentElement('afterend', wrapper);
        } else {
          editorRef.current?.appendChild(wrapper);
        }
      } else if (editorRef.current) {
        editorRef.current.appendChild(wrapper);
      }

      // 移动光标到图片后面，并创建新的空行
      const newLine = createEditableEmptyLine();
      wrapper.insertAdjacentElement('afterend', newLine);

      // 移动光标到新行
      const newRange = document.createRange();
      newRange.setStart(newLine, 0);
      newRange.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(newRange);

      scheduleNormalizeEditorContent();
      autoSave();
    };
    reader.readAsDataURL(file);

    // 清空input，允许重复上传同一文件
    e.target.value = '';
  };

  // 删除顶部图片（仅对纯图片卡片有效）
  const handleDeleteTopImage = useCallback(async () => {
    if (!editorRef.current || !onSave) return;

    // 确认删除
    if (!confirm(t('detail.confirmDeleteImage'))) return;

    saveToHistory();

    // 从编辑器内容中移除图片
    const imgs = editorRef.current.querySelectorAll('img');
    imgs.forEach((img) => {
      // 找到包含图片的父 div 并移除
      const parent = img.parentElement;
      if (parent && parent.tagName === 'DIV') {
        parent.remove();
      } else {
        img.remove();
      }
    });

    // 如果编辑器变空了，添加一个空行
    if (
      !editorRef.current.textContent?.trim() &&
      !editorRef.current.querySelector('img')
    ) {
      editorRef.current.replaceChildren(createEditableEmptyLine());
    }

    // 保存修改后的内容
    const newContent = editorRef.current.innerHTML;
    lastSavedContentRef.current = newContent;

    setSaveStatus('saving');
    try {
      await onSave(summary.id, newContent);
      setSaveStatus('saved');

      if (statusResetTimeoutRef.current) {
        clearTimeout(statusResetTimeoutRef.current);
      }
      statusResetTimeoutRef.current = setTimeout(() => {
        setSaveStatus('idle');
      }, 3000);
    } catch (error) {
      log.error('[SummaryDetail] Delete image failed:', error);
      setSaveStatus('idle');
    }
  }, [onSave, saveToHistory, summary.id, t]);

  // 处理粘贴事件 - 清理粘贴的 HTML
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      saveToHistory();

      // 获取纯文本或 HTML
      const html = e.clipboardData.getData('text/html');
      const text = e.clipboardData.getData('text/plain');

      let content: string;

      if (html) {
        // 清理粘贴的 HTML，移除危险标签和样式
        const temp = parseHtmlBody(html);

        // 移除 script、style 等标签
        temp
          .querySelectorAll('script, style, link, meta')
          .forEach((el) => el.remove());

        // 简化：只保留基本格式
        const allowedTags = [
          'B',
          'I',
          'U',
          'STRONG',
          'EM',
          'BR',
          'DIV',
          'P',
          'SPAN',
          'IMG'
        ];
        const cleanElement = (el: Element) => {
          Array.from(el.children).forEach((child) => {
            if (!allowedTags.includes(child.tagName)) {
              // 保留文本内容，移除标签
              const textNode = document.createTextNode(child.textContent || '');
              child.replaceWith(textNode);
            } else {
              // 移除危险属性
              if (child.tagName === 'IMG') {
                const src = child.getAttribute('src');
                const alt = child.getAttribute('alt');
                const title = child.getAttribute('title');
                Array.from(child.attributes).forEach((attr) => {
                  child.removeAttribute(attr.name);
                });
                if (src) child.setAttribute('src', src);
                if (alt) child.setAttribute('alt', alt);
                if (title) child.setAttribute('title', title);
              } else {
                const className = child.getAttribute('class');
                Array.from(child.attributes).forEach((attr) => {
                  child.removeAttribute(attr.name);
                });
                if (className) child.setAttribute('class', className);
              }
              cleanElement(child);
            }
          });
        };
        cleanElement(temp);

        content = sanitizeHtml(temp.innerHTML);
      } else {
        // 纯文本：将换行转为 div
        content = text
          .split('\n')
          .map(
            (line) =>
              `<div class="text-sm text-slate-800 dark:text-slate-200 mb-0">${line || '<br>'}</div>`
          )
          .join('');
      }

      // 插入清理后的内容
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();

        const fragment = document
          .createRange()
          .createContextualFragment(content);
        range.insertNode(fragment);

        // 移动光标到插入内容后
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }

      scheduleNormalizeEditorContent();
      autoSave();
    },
    [saveToHistory, autoSave, scheduleNormalizeEditorContent]
  );

  // 处理键盘事件 - 统一 Enter 键行为
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        saveToHistory();

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || !editorRef.current)
          return;

        const range = selection.getRangeAt(0);

        // 找到当前光标所在的顶层 div（编辑器的直接子元素）
        let currentNode = range.startContainer as Node | null;
        let topLevelDiv: HTMLElement | null = null;

        while (currentNode && currentNode !== editorRef.current) {
          if (
            currentNode.parentNode === editorRef.current &&
            currentNode.nodeType === Node.ELEMENT_NODE
          ) {
            topLevelDiv = currentNode as HTMLElement;
            break;
          }
          currentNode = currentNode.parentNode;
        }

        // 如果没找到顶层 div，尝试从文本节点的父元素开始查找
        if (!topLevelDiv && range.startContainer.nodeType === Node.TEXT_NODE) {
          let parent = range.startContainer.parentNode as Node | null;
          while (parent && parent !== editorRef.current) {
            if (
              parent.parentNode === editorRef.current &&
              parent.nodeType === Node.ELEMENT_NODE
            ) {
              topLevelDiv = parent as HTMLElement;
              break;
            }
            parent = parent.parentNode;
          }
        }

        // 创建新的段落 div，始终使用正文样式
        const newDiv = document.createElement('div');
        newDiv.className = 'text-sm text-slate-800 dark:text-slate-200 mb-0';

        if (topLevelDiv) {
          // 获取光标后面的内容
          const afterRange = document.createRange();
          afterRange.setStart(range.endContainer, range.endOffset);
          afterRange.setEndAfter(topLevelDiv.lastChild || topLevelDiv);

          // 提取光标后面的内容到新行
          const afterContent = afterRange.extractContents();

          // 如果提取的内容不为空，添加到新 div
          if (
            afterContent.textContent?.trim() ||
            afterContent.childNodes.length > 0
          ) {
            newDiv.appendChild(afterContent);
          } else {
            setElementToSingleBreak(newDiv);
          }

          // 如果当前行变空了，添加 <br> 保持高度
          if (
            !topLevelDiv.textContent?.trim() &&
            !topLevelDiv.querySelector('img')
          ) {
            setElementToSingleBreak(topLevelDiv);
          }

          // 在当前 div 之后插入新 div（作为兄弟元素）
          topLevelDiv.insertAdjacentElement('afterend', newDiv);
        } else {
          // 如果没找到顶层 div，创建一个空的新行并追加到编辑器末尾
          setElementToSingleBreak(newDiv);
          editorRef.current.appendChild(newDiv);
        }

        // 移动光标到新行的开头
        const newRange = document.createRange();
        if (newDiv.firstChild) {
          if (newDiv.firstChild.nodeType === Node.TEXT_NODE) {
            newRange.setStart(newDiv.firstChild, 0);
          } else {
            newRange.setStart(newDiv, 0);
          }
        } else {
          newRange.setStart(newDiv, 0);
        }
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);

        scheduleNormalizeEditorContent();
        autoSave();
      }
    },
    [saveToHistory, autoSave, scheduleNormalizeEditorContent]
  );

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 relative">
      {/* 加载中覆盖层 */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 flex items-center justify-center z-50">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            <span className="text-sm text-slate-600">
              {t('detail.loading')}
            </span>
          </div>
        </div>
      )}
      {/* 头部：返回按钮 + 标题 + 工具栏 */}
      <header className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
        {/* 第一行：返回按钮 + 标题 + 更多菜单 */}
        <div className="flex items-center gap-3 mb-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="size-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            title={t('detail.backToList')}
            aria-label={t('detail.backToList')}
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </Button>
          <h2 className="font-medium text-slate-900 dark:text-slate-100 truncate flex-1">
            {t('detail.material')}
          </h2>

          {/* 分享按钮 - 独立图标 */}
          <ShareButton
            summaryId={summary.id}
            isShared={isShared}
            shareUrl={shareUrl}
            authToken={getAccessToken() || undefined}
            onShareChange={(shared, url) => {
              setIsShared(shared);
              setShareUrl(url || null);
            }}
          />

          {/* 更多菜单 */}
          <Popover
            open={showMoreMenu}
            onOpenChange={(open) => {
              setShowMoreMenu(open);
              if (!open) {
                setShowCopySubmenu(false);
                setShowExportSubmenu(false);
              }
            }}
          >
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                title={t('detail.more')}
                aria-label={t('detail.more')}
              >
                <MoreHorizontal className="w-5 h-5 text-slate-600" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={6} className="w-44 p-1">
              {canOpenSource && (
                <Button
                  type="button"
                  onClick={handleOpenSource}
                  variant="ghost"
                  className="h-9 w-full justify-start gap-2 px-3 text-slate-700 dark:text-slate-300"
                >
                  <ExternalLink className="w-4 h-4" />
                  {t('detail.openSource')}
                </Button>
              )}
              <Button
                type="button"
                onClick={handleOpenRename}
                variant="ghost"
                className="h-9 w-full justify-start gap-2 px-3 text-slate-700 dark:text-slate-300"
              >
                <Edit3 className="w-4 h-4" />
                {t('detail.rename')}
              </Button>

              {onDelete && (
                <Button
                  type="button"
                  onClick={() => void handleDeleteSummary()}
                  variant="ghost"
                  className="h-9 w-full justify-start gap-2 px-3 text-red-600 dark:text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                  {t('board.delete')}
                </Button>
              )}

              <Separator className="my-1" />

              {/* 复制子菜单 */}
              <div
                className="relative"
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    setShowCopySubmenu(false);
                  }
                }}
                onFocus={() => {
                  setShowCopySubmenu(true);
                  setShowExportSubmenu(false);
                }}
                onMouseEnter={() => {
                  setShowCopySubmenu(true);
                  setShowExportSubmenu(false);
                }}
                onMouseLeave={() => setShowCopySubmenu(false)}
              >
                <Button
                  type="button"
                  variant="ghost"
                  aria-expanded={showCopySubmenu}
                  aria-haspopup="menu"
                  onClick={() => {
                    setShowCopySubmenu(true);
                    setShowExportSubmenu(false);
                  }}
                  className="h-9 w-full justify-between gap-2 px-3 text-slate-700 dark:text-slate-300"
                >
                  <span className="flex items-center gap-2">
                    <Copy className="w-4 h-4" />
                    {t('detail.copy')}
                  </span>
                  <ChevronRight className="w-4 h-4" />
                </Button>
                {showCopySubmenu && (
                  <div className="absolute left-full top-0 -ml-1 pl-2 max-sm:left-0 max-sm:top-full max-sm:ml-0 max-sm:mt-1 max-sm:pl-0">
                    <div className="min-w-[150px] rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                      <Button
                        type="button"
                        onClick={handleCopyMarkdown}
                        variant="ghost"
                        className="h-9 w-full justify-start gap-2 px-3 text-slate-700 dark:text-slate-300"
                      >
                        <FileText className="w-4 h-4" />
                        {t('detail.copyMarkdown')}
                      </Button>
                      <Button
                        type="button"
                        onClick={handleCopyText}
                        variant="ghost"
                        className="h-9 w-full justify-start gap-2 px-3 text-slate-700 dark:text-slate-300"
                      >
                        <FileText className="w-4 h-4" />
                        {t('detail.copyText')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* 导出子菜单 */}
              <div
                className="relative"
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    setShowExportSubmenu(false);
                  }
                }}
                onFocus={() => {
                  setShowExportSubmenu(true);
                  setShowCopySubmenu(false);
                }}
                onMouseEnter={() => {
                  setShowExportSubmenu(true);
                  setShowCopySubmenu(false);
                }}
                onMouseLeave={() => setShowExportSubmenu(false)}
              >
                <Button
                  type="button"
                  variant="ghost"
                  aria-expanded={showExportSubmenu}
                  aria-haspopup="menu"
                  onClick={() => {
                    setShowExportSubmenu(true);
                    setShowCopySubmenu(false);
                  }}
                  className="h-9 w-full justify-between gap-2 px-3 text-slate-700 dark:text-slate-300"
                >
                  <span className="flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    {t('detail.export')}
                  </span>
                  <ChevronRight className="w-4 h-4" />
                </Button>
                {showExportSubmenu && (
                  <div className="absolute left-full top-0 -ml-1 pl-2 max-sm:left-0 max-sm:top-full max-sm:ml-0 max-sm:mt-1 max-sm:pl-0">
                    <div className="min-w-[150px] rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                      <Button
                        type="button"
                        onClick={handleExportPDF}
                        variant="ghost"
                        className="h-9 w-full justify-start gap-2 px-3 text-slate-700 dark:text-slate-300"
                      >
                        <FileText className="w-4 h-4" />
                        {t('detail.exportPDF')}
                      </Button>
                      <Button
                        type="button"
                        onClick={handleExportImage}
                        variant="ghost"
                        className="h-9 w-full justify-start gap-2 px-3 text-slate-700 dark:text-slate-300"
                      >
                        <FileImage className="w-4 h-4" />
                        {t('detail.exportImage')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* 第二行：编辑工具栏 */}
        <div className="flex items-center gap-1 flex-wrap">
          {/* 撤销按钮 */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleUndo}
            disabled={historyStack.length === 0}
            className="relative size-7 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:cursor-not-allowed after:absolute after:-inset-1.5 after:rounded after:content-['']"
            title={t('detail.undo')}
            aria-label={t('detail.undo')}
          >
            <Undo2 className="w-4 h-4 text-slate-500" />
          </Button>

          {/* 重置按钮 */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleReset}
            className="relative size-7 rounded hover:bg-slate-100 dark:hover:bg-slate-800 after:absolute after:-inset-1.5 after:rounded after:content-['']"
            title={t('detail.reset')}
            aria-label={t('detail.reset')}
          >
            <RotateCcw className="w-4 h-4 text-slate-500" />
          </Button>

          <Separator orientation="vertical" className="mx-1 h-5" />

          {/* 加粗 */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => formatText('bold')}
            className="relative size-7 rounded hover:bg-slate-100 dark:hover:bg-slate-800 after:absolute after:-inset-1.5 after:rounded after:content-['']"
            title={t('detail.bold')}
            aria-label={t('detail.bold')}
          >
            <Bold className="w-4 h-4 text-slate-500" />
          </Button>

          {/* 斜体 */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => formatText('italic')}
            className="relative size-7 rounded hover:bg-slate-100 dark:hover:bg-slate-800 after:absolute after:-inset-1.5 after:rounded after:content-['']"
            title={t('detail.italic')}
            aria-label={t('detail.italic')}
          >
            <Italic className="w-4 h-4 text-slate-500" />
          </Button>

          {/* 下划线 */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => formatText('underline')}
            className="relative size-7 rounded hover:bg-slate-100 dark:hover:bg-slate-800 after:absolute after:-inset-1.5 after:rounded after:content-['']"
            title={t('detail.underline')}
            aria-label={t('detail.underline')}
          >
            <Underline className="w-4 h-4 text-slate-500" />
          </Button>

          <Separator orientation="vertical" className="mx-1 h-5" />

          {/* 上传图片 */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleImageUpload}
            className="relative size-7 rounded hover:bg-slate-100 dark:hover:bg-slate-800 after:absolute after:-inset-1.5 after:rounded after:content-['']"
            title={t('detail.insertImage')}
            aria-label={t('detail.insertImage')}
          >
            <ImageIcon className="w-4 h-4 text-slate-500" />
          </Button>
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
            aria-label={t('detail.uploadImage')}
          />

          {/* 自动保存状态指示器（右侧） */}
          {onSave && (
            <div className="ml-auto flex items-center gap-1.5 text-xs">
              {saveStatus === 'saving' && (
                <>
                  <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                  <span className="text-muted-foreground dark:text-slate-500">
                    {t('detail.saving')}
                  </span>
                </>
              )}
              {saveStatus === 'saved' && (
                <>
                  <Check className="w-3.5 h-3.5 text-green-400" />
                  <span className="text-green-400">{t('detail.saved')}</span>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      {/* 内容：可编辑区域 */}
      <div className="flex-1 overflow-y-auto px-4 py-5 md:px-6 md:py-6 select-text bg-white dark:bg-slate-900">
        {/* 图片类型：等待加载完成后显示 */}
        {isImageContent(summary.markdown, summary.contentType) &&
          !isVideoContent(summary.markdown) && (
            <div className="mb-4 relative group">
              {/* 删除按钮 - 悬停时显示 */}
              {onSave && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleDeleteTopImage}
                  className="absolute right-2 top-2 z-10 size-9 rounded-lg bg-slate-700/80 text-white opacity-0 transition-all hover:bg-red-600 hover:text-white group-hover:opacity-100"
                  title={t('detail.deleteImage')}
                  aria-label={t('detail.deleteImage')}
                >
                  <Trash2 />
                </Button>
              )}

              {/* 加载中：显示简单的 loading 动画 */}
              {isLoadingOriginal && !imageLoaded && (
                <div className="relative rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 aspect-video flex flex-col items-center justify-center">
                  <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
                  <div className="text-slate-500 text-sm mt-4">
                    {t('detail.loading')}
                  </div>
                </div>
              )}

              {/* 加载完成：显示原图 */}
              {originalImageUrl && imageLoaded && (
                <button
                  type="button"
                  className="block w-full cursor-zoom-in rounded-xl text-left focus:outline-none focus:ring-2 focus:ring-slate-900/20 dark:focus:ring-white/30"
                  title={t('imagePreview.hint') as string}
                  onClick={() => setLightboxImageUrl(originalImageUrl)}
                >
                  <img
                    src={originalImageUrl}
                    alt={cleanTitle(summary.title) || t('detail.image')}
                    className="w-full h-auto rounded-xl animate-fadeIn"
                  />
                </button>
              )}

              {/* 加载失败或不需要加载（非 base64 图片）：显示缩略图 */}
              {!isLoadingOriginal && !imageLoaded && displayImageUrl && (
                <button
                  type="button"
                  className="block w-full cursor-zoom-in rounded-xl text-left focus:outline-none focus:ring-2 focus:ring-slate-900/20 dark:focus:ring-white/30"
                  title={t('imagePreview.hint') as string}
                  onClick={() => setLightboxImageUrl(displayImageUrl)}
                >
                  <img
                    src={displayImageUrl}
                    alt={cleanTitle(summary.title) || t('detail.image')}
                    className="w-full h-auto rounded-xl"
                  />
                </button>
              )}
            </div>
          )}

        {/* 视频类型：直接显示视频 */}
        {isImageContent(summary.markdown, summary.contentType) &&
          isVideoContent(summary.markdown) && (
            <div className="mb-4 relative group">
              {/* 删除按钮 - 悬停时显示 */}
              {onSave && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleDeleteTopImage}
                  className="absolute right-2 top-2 z-10 size-9 rounded-lg bg-slate-700/80 text-white opacity-0 transition-all hover:bg-red-600 hover:text-white group-hover:opacity-100"
                  title={t('detail.deleteImage')}
                  aria-label={t('detail.deleteImage')}
                >
                  <Trash2 />
                </Button>
              )}

              {/* 视频播放器 */}
              <video
                src={getVideoSrc(summary.markdown) || ''}
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-auto rounded-xl"
              />
            </div>
          )}

        {/* 编辑器区域（图片类型时隐藏图片，只显示描述文字） */}
        <div className="mx-auto w-full max-w-4xl">
          <div
            ref={editorRef}
            contentEditable
            onBlur={saveToHistory}
            onInput={() => {
              scheduleNormalizeEditorContent();
              autoSave();
            }}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            onClick={handleEditorClick}
            className="max-w-none outline-none min-h-[200px] text-[15px] leading-6 tracking-[0.01em] text-slate-800 dark:text-slate-200 caret-slate-800 dark:caret-slate-200 editor-content"
            style={{
              fontFamily:
                'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif'
            }}
            suppressContentEditableWarning
          />
        </div>
        {/* 纯图片/视频卡片时，隐藏编辑器中的媒体（顶部已有专门的展示区域） */}
        <style>{`
          .editor-content {
            overflow-wrap: anywhere;
            word-break: break-word;
          }
          .editor-content > div.text-sm { margin-bottom: 0 !important; }
          .editor-content > div.mb-2 { margin-bottom: 0 !important; }
          .editor-content pre {
            max-width: 100%;
            overflow-x: hidden;
            white-space: pre-wrap !important;
            overflow-wrap: anywhere;
            word-break: break-word;
          }
          .editor-content .code-block-wrapper pre {
            overflow-x: auto;
            white-space: pre !important;
            overflow-wrap: normal;
            word-break: normal;
          }
          .editor-content a {
            overflow-wrap: anywhere;
            word-break: break-word;
          }
          .editor-content .ai-image-summary-card,
          .editor-content .ai-image-summary-prompt {
            max-width: 100%;
            overflow-wrap: anywhere;
            word-break: break-word;
          }
        `}</style>
        {isImageContent(summary.markdown, summary.contentType) && (
          <style>{`
            .editor-content img { display: none !important; }
            .editor-content video { display: none !important; }
          `}</style>
        )}
      </div>

      {/* 底部信息：来源URL、日期 */}
      <footer className="px-4 py-2 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500 flex-shrink-0">
        <div className="flex items-center justify-between">
          <span className="truncate" title={summary.url}>
            {t('detail.source')}: {getHostname(summary.url)}
          </span>
          <span className="flex-shrink-0 ml-2">
            {new Date(summary.createdAt).toLocaleDateString()}
          </span>
        </div>
      </footer>

      <Dialog open={showRenameModal} onOpenChange={setShowRenameModal}>
        <DialogContent
          className="w-[320px] max-w-[calc(100vw-2rem)] gap-0 overflow-hidden rounded-xl border-slate-200 p-0 shadow-xl dark:border-slate-700"
          overlayClassName="bg-black/30"
        >
          <DialogHeader className="border-b border-slate-200 px-4 py-3 text-left dark:border-slate-700">
            <DialogTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t('detail.rename')}
            </DialogTitle>
          </DialogHeader>
          <div className="p-4">
            <Input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder={t('detail.enterNewTitle')}
              autoFocus
              className="bg-slate-50 text-slate-900 placeholder-slate-400 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !renaming) {
                  handleConfirmRename();
                }
              }}
            />
          </div>
          <DialogFooter className="border-t border-slate-200 px-4 py-3 dark:border-slate-700">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowRenameModal(false)}
            >
              {t('detail.cancel')}
            </Button>
            <Button
              type="button"
              onClick={handleConfirmRename}
              disabled={renaming || !renameValue.trim()}
              className="bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-300"
            >
              {renaming ? t('detail.saving') : t('detail.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={showDeleteModal}
        title={t('board.delete')}
        description={t('detail.confirmDeleteSummary', '确定要删除这条资料吗？')}
        confirmText={deleting ? t('detail.saving') : t('board.delete')}
        cancelText={t('detail.cancel')}
        danger
        loading={deleting}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setShowDeleteModal(false)}
      />

      {lightboxImageUrl && (
        <PhotoSwipeViewer
          items={[
            {
              src: lightboxImageUrl,
              alt: cleanTitle(summary.title) || (t('detail.image') as string)
            }
          ]}
          index={0}
          onClose={() => setLightboxImageUrl(null)}
          onDownload={() => handleDownloadLightboxImage()}
        />
      )}

      {/* 导出为图片预览弹窗 */}
      <ExportImageModal
        isOpen={showExportImageModal}
        onClose={() => setShowExportImageModal(false)}
        title={getCurrentTitle()}
        contentHtml={exportContent}
        isPremiumUser={
          subscription?.planName !== undefined &&
          subscription.planName !== 'free'
        }
        onUpgrade={handleNavigateToUpgrade}
      />
    </div>
  );
}
