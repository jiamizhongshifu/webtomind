import type { SavedSummary } from '@/services/database';
import type { Reference } from '@/types';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, X } from 'lucide-react';
import { Button } from '@/shared/ui/radix/button';
import { Checkbox } from '@/shared/ui/radix/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/shared/ui/radix/dialog';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/shared/ui/radix/empty';
import { cn } from '@/lib/utils';

interface ReferenceSelectorProps {
  summaries: SavedSummary[];
  existingReferenceIds: string[]; // 已存在的引用summaryId列表
  onConfirm: (refs: Reference[]) => void;
  onCancel: () => void;
}

export function ReferenceSelector({
  summaries,
  existingReferenceIds,
  onConfirm,
  onCancel
}: ReferenceSelectorProps) {
  const { t, i18n } = useTranslation('workspace');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // 检测内容是否是图片类型
  const isImageContent = (content: string | undefined): boolean => {
    if (!content) return false;
    // 同时检查 HTML img 标签和 Markdown 图片语法
    return content.includes('<img') || /!\[.*\]\(.*\)/.test(content);
  };

  // 提取内容中的第一张图片作为缩略图
  const getFirstImage = (content: string | undefined): string | null => {
    if (!content) return null;

    // 1. 尝试从 HTML 中提取
    const htmlMatch = content.match(
      /<img[^>]+src=["'](data:image\/[^;]+;base64,[^"']+)["'][^>]*>/i
    );
    if (htmlMatch) return htmlMatch[1];

    // 2. 尝试从 Markdown 中提取
    const mdMatch = content.match(
      /!\[.*\]\((data:image\/[^;]+;base64,[^)]+)\)/i
    );
    if (mdMatch) return mdMatch[1];

    return null;
  };

  // 从内容中提取摘要（支持 HTML 和 Markdown）
  const getExcerpt = (
    content: string | undefined,
    maxLength: number = 80
  ): string => {
    if (!content) return '';
    const trimmed = content.trim();

    // 检测是否是 HTML 格式
    if (trimmed.startsWith('<')) {
      // HTML 格式：移除所有标签，保留文本
      const text = trimmed
        .replace(/<[^>]+>/g, ' ') // 移除所有 HTML 标签
        .replace(/\s+/g, ' ') // 合并多个空格
        .trim();
      return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
    }

    // Markdown 格式
    const text = trimmed
      .replace(/#{1,6}\s/g, '')
      .replace(/[*_`~]/g, '')
      .replace(/\n+/g, ' ')
      .trim();
    return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
  };

  // 从内容中提取标题（支持 HTML 和 Markdown）
  const getTitle = (content: string | undefined): string => {
    if (!content) return t('referenceSelector.noTitle');
    const trimmed = content.trim();

    // 检测是否是 HTML 格式
    if (trimmed.startsWith('<')) {
      // 从 HTML 中提取第一个 div 的文本内容（标题）
      const titleMatch = trimmed.match(
        /<div[^>]*class="[^"]*text-xl[^"]*"[^>]*>([^<]+)<\/div>/
      );
      if (titleMatch) return titleMatch[1].trim();

      // 如果没找到标题样式的 div，提取第一个 div 的文本
      const firstDiv = trimmed.match(/<div[^>]*>([^<]+)<\/div>/);
      if (firstDiv) {
        const text = firstDiv[1].trim();
        return text.slice(0, 20) + (text.length > 20 ? '...' : '');
      }
      return t('referenceSelector.noTitle');
    }

    // Markdown 格式
    const match = trimmed.match(/^#\s+(.+)$/m);
    if (match) return match[1];
    const text = trimmed
      .replace(/#{1,6}\s/g, '')
      .replace(/[*_`~]/g, '')
      .trim();
    return text.slice(0, 20) + (text.length > 20 ? '...' : '');
  };

  // 获取hostname
  const getHostname = (url: string): string => {
    try {
      if (url === 'note://local') return 'local';
      return new URL(url).hostname;
    } catch {
      return url;
    }
  };

  // 切换选中
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // 确认添加
  const handleConfirm = () => {
    const refs: Reference[] = selectedIds.map((id) => {
      const summary = summaries.find((s) => s.id === id)!;
      const isImage = isImageContent(summary.markdown);
      return {
        id: `sum-${id}-${Date.now()}`,
        type: 'summary' as const,
        summaryId: id,
        summaryTitle: isImage
          ? summary.title || t('referenceSelector.image')
          : getTitle(summary.markdown),
        content: summary.markdown,
        preview: isImage
          ? (summary.title || t('referenceSelector.image')).slice(0, 8)
          : getExcerpt(summary.markdown, 8)
      };
    });
    onConfirm(refs);
  };

  // 过滤掉已经添加的引用
  const availableSummaries = summaries.filter(
    (s) => !existingReferenceIds.includes(s.id)
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent
        className="flex max-h-[min(560px,90vh)] w-[calc(100vw-2rem)] max-w-[460px] flex-col gap-0 overflow-hidden rounded-xl p-0 shadow-xl sm:rounded-xl"
        overlayClassName="bg-black/50 dark:bg-black/70"
        showCloseButton={false}
      >
        <DialogHeader className="flex-shrink-0 border-b border-border px-4 py-3 text-left">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-base">
              {t('referenceSelector.title')}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t('referenceSelector.title')}
            </DialogDescription>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onCancel}
              aria-label={t('referenceSelector.cancel')}
              className="h-8 w-8"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {availableSummaries.length === 0 ? (
            <Empty className="min-h-32 border-0 p-4">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileText className="h-5 w-5" />
                </EmptyMedia>
                <EmptyTitle className="text-sm">
                  {t('referenceSelector.noContent')}
                </EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            availableSummaries.map((summary) => {
              const isSelected = selectedIds.includes(summary.id);
              const firstImage = getFirstImage(summary.markdown);
              const title = isImageContent(summary.markdown)
                ? summary.title || t('referenceSelector.image')
                : getTitle(summary.markdown);
              const checkboxId = `reference-selector-${summary.id}`;
              const titleId = `${checkboxId}-title`;

              return (
                <label
                  key={summary.id}
                  htmlFor={checkboxId}
                  className={cn(
                    'group mb-1 flex cursor-pointer items-center gap-3 rounded-lg p-2.5 transition-colors',
                    isSelected
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/70'
                  )}
                >
                  <Checkbox
                    id={checkboxId}
                    checked={isSelected}
                    onCheckedChange={() => toggleSelect(summary.id)}
                    aria-labelledby={titleId}
                    className="h-5 w-5 border-border data-[state=checked]:border-[var(--product-action-bg)] data-[state=checked]:bg-[var(--product-action-bg)] data-[state=checked]:text-[var(--product-action-text)]"
                  />

                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                    {firstImage ? (
                      <img
                        src={firstImage}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p
                      id={titleId}
                      className="mb-0.5 truncate text-sm font-medium text-foreground"
                    >
                      {title}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="truncate">
                        {getHostname(summary.url)}
                      </span>
                      <span>•</span>
                      <span className="flex-shrink-0">
                        {new Date(summary.createdAt).toLocaleDateString(
                          i18n.language === 'zh-CN' ? 'zh-CN' : 'en-US'
                        )}
                      </span>
                    </div>
                  </div>
                </label>
              );
            })
          )}
        </div>

        <DialogFooter className="flex-shrink-0 gap-2 border-t border-border px-4 py-3 sm:space-x-0">
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('referenceSelector.cancel')}
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={selectedIds.length === 0}
            className="bg-[var(--product-action-bg)] text-[var(--product-action-text)] hover:bg-[var(--product-action-hover)]"
          >
            {t('referenceSelector.confirm')}
            {selectedIds.length > 0 && ` (${selectedIds.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
