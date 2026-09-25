import { CheckCheck, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button as ShadcnButton } from '@/shared/ui/radix/button';
import { Dialog } from '@/shared/ui';

interface PromptCaseDraftPublishAllDialogProps {
  open: boolean;
  busy: boolean;
  publishableCount: number;
  incompleteCount: number;
  totalCount: number;
  progress: {
    completed: number;
    total: number;
  };
  onClose: () => void;
  onConfirm: () => void;
}

export function PromptCaseDraftPublishAllDialog({
  open,
  busy,
  publishableCount,
  incompleteCount,
  totalCount,
  progress,
  onClose,
  onConfirm
}: PromptCaseDraftPublishAllDialogProps) {
  const { t } = useTranslation('imageCreate');
  const td = t as (
    key: string,
    options?: Record<string, unknown> & { defaultValue?: string }
  ) => string;

  return (
    <Dialog
      open={open}
      title={td('promptCases.publishAllDraftsConfirmTitle', {
        defaultValue: '确认发布全部草稿'
      })}
      closeLabel={t('preview.close') as string}
      closeDisabled={busy}
      className="creator-prompt-case-admin-modal creator-prompt-case-status-modal"
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <div className="creator-prompt-case-admin-modal-actions">
          <ShadcnButton
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={busy}
          >
            {t('common.cancel', { defaultValue: '取消' })}
          </ShadcnButton>
          <ShadcnButton
            type="button"
            className="creator-library-upload"
            disabled={busy || publishableCount === 0}
            onClick={onConfirm}
          >
            {busy ? (
              <Loader2 data-icon="inline-start" className="creator-spin-icon" />
            ) : (
              <CheckCheck data-icon="inline-start" />
            )}
            {busy
              ? td('promptCases.publishAllDraftsProgress', {
                  completed: progress.completed,
                  total: progress.total,
                  defaultValue: `发布中 ${progress.completed}/${progress.total}`
                })
              : td('promptCases.confirmPublishAllDraftsWithCount', {
                  count: publishableCount,
                  defaultValue: `发布全部 ${publishableCount} 条`
                })}
          </ShadcnButton>
        </div>
      }
    >
      <div className="creator-prompt-case-admin-modal-body">
        <div className="creator-prompt-case-form creator-prompt-case-form-compact">
          <section className="creator-prompt-case-form-section creator-prompt-case-form-basics">
            <div className="creator-prompt-case-form-section-head">
              <strong>
                {td('promptCases.publishAllDraftsConfirmHeading', {
                  count: publishableCount,
                  defaultValue: `即将发布 ${publishableCount} 条案例`
                })}
              </strong>
              <span>
                {td('promptCases.publishAllDraftsConfirmDesc', {
                  defaultValue:
                    '每条草稿发布成功后都会进入正式案例库，并从草稿箱移除；失败或信息不完整的草稿会保留。'
                })}
              </span>
            </div>
            <div className="creator-prompt-case-admin-row-metrics">
              <span>
                <small>
                  {td('promptCases.publishableDrafts', {
                    defaultValue: '可发布'
                  })}
                </small>
                <strong>{publishableCount}</strong>
              </span>
              <span>
                <small>
                  {td('promptCases.incompleteDrafts', {
                    defaultValue: '信息不完整'
                  })}
                </small>
                <strong>{incompleteCount}</strong>
              </span>
              <span>
                <small>
                  {td('promptCases.totalDrafts', {
                    defaultValue: '草稿总数'
                  })}
                </small>
                <strong>{totalCount}</strong>
              </span>
            </div>
          </section>
        </div>
      </div>
    </Dialog>
  );
}
