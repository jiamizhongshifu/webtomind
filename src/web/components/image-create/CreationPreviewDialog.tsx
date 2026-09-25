import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button, useOverlayBehavior } from '@/shared/ui';
import { cn } from '@/lib/utils';

interface CreationPreviewDialogProps {
  title: ReactNode;
  ariaLabel: string;
  closeLabel: string;
  actions?: ReactNode;
  favoriteAction?: ReactNode;
  media: ReactNode;
  details: ReactNode;
  className?: string;
  onClose: () => void;
}

/**
 * 图像和视频共用的创作结果预览框架。
 *
 * 只负责弹窗 chrome、焦点/滚动行为和双栏布局；媒体渲染与业务动作由调用方注入。
 */
export function CreationPreviewDialog({
  title,
  ariaLabel,
  closeLabel,
  actions,
  favoriteAction,
  media,
  details,
  className,
  onClose
}: CreationPreviewDialogProps) {
  const previewModalRef = useOverlayBehavior<HTMLElement>({
    open: true,
    onClose
  });

  return (
    <div
      className="creator-preview-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        ref={previewModalRef}
        className={cn(
          'creator-preview creator-history-preview-modal',
          className
        )}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="creator-preview-head">
          <span>{title}</span>
          <div className="creator-preview-head-actions">
            {actions}
            {favoriteAction}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="creator-preview-close-button"
              aria-label={closeLabel}
              onClick={onClose}
            >
              <X data-icon="inline-start" />
            </Button>
          </div>
        </header>
        <div className="creator-preview-body">
          {media}
          {details}
        </div>
      </section>
    </div>
  );
}
