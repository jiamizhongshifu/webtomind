import { useEffect, useRef } from 'react';
import { Lightbulb, X } from 'lucide-react';
import { Button } from '@/shared/ui';
import type { ActivationTeachingHintId } from '../../lib/activation-teaching-hints';

const AUTO_DISMISS_MS = 6000;

const COPY: Record<
  ActivationTeachingHintId,
  { title: string; body: string; close: string }
> = {
  reference: {
    title: '保持一致',
    body: '想让主体和风格前后一致？添加参考图或角色卡。',
    close: '关闭一致性提示'
  },
  moodboard: {
    title: '把素材收进情绪板',
    body: '多张相关图片可以放进同一情绪板，下次直接复用整套风格。',
    close: '关闭情绪板提示'
  },
  history: {
    title: '上次的成果还在',
    body: '历史记录里可以继续修改或再次生成，无需从零开始。',
    close: '关闭历史复用提示'
  }
};

interface ActivationTeachingHintProps {
  hint: ActivationTeachingHintId;
  onClose: () => void;
  onDismiss?: () => void;
}

export function ActivationTeachingHint({
  hint,
  onClose,
  onDismiss
}: ActivationTeachingHintProps) {
  const copy = COPY[hint];
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const dismiss = onDismiss || onClose;
    timerRef.current = window.setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [onClose, onDismiss]);

  return (
    <div
      className="activation-teaching-hint"
      role="status"
      aria-label={copy.title}
    >
      <span className="activation-teaching-hint__icon" aria-hidden="true">
        <Lightbulb />
      </span>
      <span className="activation-teaching-hint__body">
        <strong>{copy.title}</strong>
        <small>{copy.body}</small>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={copy.close}
        leadingIcon={<X data-icon="only" />}
        onClick={onClose}
      />
    </div>
  );
}
