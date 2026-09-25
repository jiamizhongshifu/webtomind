import { Gift, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { Button } from '@/shared/ui';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/shared/ui/radix/dialog';
import rewardCreditsImage from '../../assets/create/reward-credits.webp';
import { useModalScrollLock } from './useModalScrollLock';

interface DailyLoginRewardModalProps {
  open: boolean;
  reward: number;
  localePrefix: '' | '/zh-CN' | '/en-US';
  onClose: () => void;
}

export function DailyLoginRewardNotice({
  open,
  reward,
  localePrefix,
  onClose
}: DailyLoginRewardModalProps) {
  if (!open || reward <= 0) return null;
  const isEnglish = localePrefix === '/en-US';
  const copy = isEnglish ? COPY.en : COPY.zh;

  return (
    <aside
      className="daily-login-reward-notice"
      role="status"
      aria-label={copy.badge}
    >
      <Gift aria-hidden="true" />
      <span>
        <strong>{copy.title}</strong>
        <small>
          +{reward} {copy.credits}
        </small>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={copy.close}
        leadingIcon={<X data-icon="only" />}
        onClick={onClose}
      ></Button>
    </aside>
  );
}

const COPY = {
  zh: {
    close: '关闭每日登录奖励',
    badge: '每日登录奖励',
    title: '今天的积分已经到账',
    body: '继续创作时可以直接用于图片生成、参考图改写和提示词工作流。',
    reward: '本次到账',
    credits: '积分',
    dismiss: '知道了'
  },
  en: {
    close: 'Close daily login reward',
    badge: 'Daily login reward',
    title: 'Today’s credits are ready',
    body: 'Use them for image generation, reference edits, and prompt workflows.',
    reward: 'Reward',
    credits: 'credits',
    dismiss: 'Got it'
  }
} as const;

export function DailyLoginRewardModal({
  open,
  reward,
  localePrefix,
  onClose
}: DailyLoginRewardModalProps) {
  const isVisible = open && reward > 0;
  useModalScrollLock(isVisible);
  const confettiFiredRef = useRef(false);

  useEffect(() => {
    if (!isVisible) {
      confettiFiredRef.current = false;
      return;
    }
    if (confettiFiredRef.current) return;
    confettiFiredRef.current = true;
    const defaults = {
      zIndex: 2000,
      spread: 70,
      ticks: 120,
      gravity: 0.9,
      colors: ['#f59e0b', '#f97316', '#ef4444', '#facc15', '#ffffff']
    };
    confetti({
      ...defaults,
      particleCount: 90,
      origin: { x: 0.5, y: 0.55 }
    });
    const leftTimer = window.setTimeout(() => {
      confetti({
        ...defaults,
        particleCount: 40,
        angle: 60,
        origin: { x: 0.08, y: 0.6 }
      });
    }, 250);
    const rightTimer = window.setTimeout(() => {
      confetti({
        ...defaults,
        particleCount: 40,
        angle: 120,
        origin: { x: 0.92, y: 0.6 }
      });
    }, 420);
    return () => {
      window.clearTimeout(leftTimer);
      window.clearTimeout(rightTimer);
    };
  }, [isVisible]);

  if (!isVisible) return null;

  const isEnglish = localePrefix === '/en-US';
  const copy = isEnglish ? COPY.en : COPY.zh;

  return (
    <Dialog
      open={isVisible}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent
        className="daily-login-reward-modal gap-0 p-0"
        overlayClassName="daily-login-reward-overlay"
        showCloseButton={false}
      >
        <DialogClose asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="daily-login-reward-close"
            aria-label={copy.close}
            leadingIcon={<X data-icon="only" />}
          ></Button>
        </DialogClose>

        <div className="daily-login-reward-visual" aria-hidden="true">
          <img
            src={rewardCreditsImage}
            alt=""
            loading="lazy"
            decoding="async"
          />
        </div>

        <div className="daily-login-reward-copy">
          <span className="daily-login-reward-badge">
            <Gift data-icon="inline-start" />
            {copy.badge}
          </span>
          <DialogHeader className="daily-login-reward-heading">
            <DialogTitle asChild>
              <h2>{copy.title}</h2>
            </DialogTitle>
            <DialogDescription asChild>
              <p>{copy.body}</p>
            </DialogDescription>
          </DialogHeader>

          <div className="daily-login-reward-stats is-reward-only">
            <div>
              <span>{copy.reward}</span>
              <strong>
                +{reward} {copy.credits}
              </strong>
            </div>
          </div>

          <div className="daily-login-reward-actions">
            <Button type="button" className="primary" onClick={onClose}>
              {copy.dismiss}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
