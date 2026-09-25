/**
 * 批量图片生成确认对话框
 * 用户确认后开始批量生成图片
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Images, Zap, Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/radix/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/shared/ui/radix/dialog';
import type { BatchPreviewTask } from '@/types/content-blocks';

interface BatchImageConfirmDialogProps {
  /** 待生成的任务列表 */
  tasks: BatchPreviewTask[];
  /** 总任务数 */
  totalCount: number;
  /** 预估消耗积分 */
  estimatedCredits: number;
  /** 是否正在生成 */
  isGenerating?: boolean;
  /** 确认生成 */
  onConfirm: () => void;
  /** 取消 */
  onCancel: () => void;
}

export const BatchImageConfirmDialog: React.FC<
  BatchImageConfirmDialogProps
> = ({
  tasks,
  totalCount,
  estimatedCredits,
  isGenerating = false,
  onConfirm,
  onCancel
}) => {
  const { i18n } = useTranslation('workspace');
  const lang = i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US';
  const title = lang === 'zh-CN' ? '批量生成图片' : 'Batch Image Generation';
  const description =
    lang === 'zh-CN'
      ? `共 ${totalCount} 张图片`
      : `${totalCount} images in total`;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isGenerating) {
          onCancel();
        }
      }}
    >
      <DialogContent
        className="max-w-md overflow-hidden p-0 sm:rounded-2xl"
        overlayClassName="bg-slate-900/40 backdrop-blur-[2px] dark:bg-slate-900/70"
        showCloseButton={!isGenerating}
      >
        <div className="p-6">
          <DialogHeader className="mb-4 flex-row items-center gap-3 space-y-0 text-left">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
              <Images className="size-6" />
            </div>
            <div>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </div>
          </DialogHeader>

          <div className="mb-4 max-h-64 overflow-y-auto rounded-xl bg-muted/60 p-4">
            <div className="flex flex-col gap-3">
              {tasks.map((task, index) => (
                <div key={task.id} className="flex items-start gap-3 text-sm">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-background text-xs font-medium text-foreground">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">
                      {task.title}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {task.prompt}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-5 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
            <Zap className="size-4 shrink-0" />
            <p className="text-sm">
              {lang === 'zh-CN'
                ? `预计消耗 ${estimatedCredits} 积分`
                : `Estimated cost: ${estimatedCredits} credits`}
            </p>
          </div>

          <DialogFooter className="flex-row gap-3 sm:justify-stretch sm:space-x-0">
            <Button
              className="flex-1"
              disabled={isGenerating}
              onClick={onCancel}
              variant="outline"
            >
              {lang === 'zh-CN' ? '取消' : 'Cancel'}
            </Button>
            <Button
              className="flex-1 bg-foreground text-background hover:bg-foreground/90"
              disabled={isGenerating}
              onClick={onConfirm}
            >
              {isGenerating ? (
                <Loader2 data-icon="inline-start" className="animate-spin" />
              ) : (
                <Images data-icon="inline-start" />
              )}
              {isGenerating
                ? lang === 'zh-CN'
                  ? '生成中...'
                  : 'Generating...'
                : lang === 'zh-CN'
                  ? '确认生成'
                  : 'Confirm'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};
