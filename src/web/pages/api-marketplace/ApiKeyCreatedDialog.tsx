import { useEffect, useRef, useState } from 'react';
import { Check, Copy, ShieldAlert } from 'lucide-react';
import { Button, Dialog } from '@/shared/ui';

type CopyState = 'idle' | 'copied' | 'error';

export interface ApiKeyCreatedDialogProps {
  open: boolean;
  secret: string;
  onClose: () => void;
}

/**
 * Secret reveal is intentionally isolated from the page notice system. A
 * newly-created key is a blocking, one-time action: the user must copy or
 * explicitly close it before continuing.
 */
export function ApiKeyCreatedDialog({
  open,
  secret,
  onClose
}: ApiKeyCreatedDialogProps) {
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setCopyState('idle');
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [open, secret]);

  const copySecret = async () => {
    if (!secret) return;
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(secret);
      setCopyState('copied');
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        onClose();
      }, 850);
    } catch {
      setCopyState('error');
    }
  };

  return (
    <Dialog
      open={open}
      title="API Key 已创建"
      description="请立即复制并妥善保存。出于安全原因，关闭后将无法再次查看完整 Key。"
      closeLabel="关闭 API Key 弹窗"
      className="api-key-created-dialog"
      onClose={onClose}
      footer={
        <div className="api-key-created-dialog-actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            关闭
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => void copySecret()}
            disabled={copyState === 'copied'}
          >
            {copyState === 'copied' ? (
              <>
                <Check size={16} aria-hidden="true" /> 已复制
              </>
            ) : (
              <>
                <Copy size={16} aria-hidden="true" /> 复制 Key
              </>
            )}
          </Button>
        </div>
      }
    >
      <div className="api-key-created-dialog-content">
        <div className="api-key-created-dialog-warning">
          <ShieldAlert size={18} aria-hidden="true" />
          <span>完整 Key 只展示这一次</span>
        </div>
        <code className="api-key-created-dialog-secret">{secret}</code>
        <p
          className={`api-key-created-dialog-status is-${copyState}`}
          role={copyState === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          {copyState === 'copied'
            ? '已复制，弹窗即将关闭。'
            : copyState === 'error'
              ? '复制失败，请手动选择并复制上面的 Key。'
              : '建议立即复制到密码管理器或安全的环境变量中。'}
        </p>
      </div>
    </Dialog>
  );
}
