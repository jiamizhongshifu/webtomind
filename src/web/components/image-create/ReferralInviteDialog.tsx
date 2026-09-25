import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Gift, Sparkles, UserPlus } from 'lucide-react';
import { Button, Dialog } from '@/shared/ui';
import {
  getReferralInviteInfo,
  type ReferralInviteInfo
} from '@/services/referral-api';
import {
  REFERRAL_REWARD_CREDITS,
  REFERRAL_SUBSCRIPTION_REWARD_CREDITS,
  REFERRAL_TOTAL_INVITER_REWARD_CREDITS
} from '@/shared/referral-rewards';
import { setReferralShareCode } from '@/web/lib/referral-share';
import './ReferralInviteDialog.css';

interface ReferralInviteDialogProps {
  open: boolean;
  isEnglish: boolean;
  onClose: () => void;
}

export function ReferralInviteDialog({
  open,
  isEnglish,
  onClose
}: ReferralInviteDialogProps) {
  const [info, setInfo] = useState<ReferralInviteInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || info) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    getReferralInviteInfo()
      .then((result) => {
        if (cancelled) return;
        setInfo(result);
        setReferralShareCode(result.referralCode);
      })
      .catch(() => {
        if (!cancelled) {
          setError(
            isEnglish
              ? 'Your referral link is temporarily unavailable.'
              : '专属邀请链接暂时无法加载，请稍后重试。'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [info, isEnglish, open]);

  const inviteUrl = useMemo(() => {
    if (!info) return '';
    const origin =
      typeof window === 'undefined'
        ? 'https://www.webtomind.com'
        : window.location.origin;
    const url = new URL('/', origin);
    url.searchParams.set('ref', info.referralCode);
    return url.toString();
  }, [info]);

  const activationReward =
    info?.activationRewardCredits ?? REFERRAL_REWARD_CREDITS;
  const subscriptionReward =
    info?.subscriptionRewardCredits ?? REFERRAL_SUBSCRIPTION_REWARD_CREDITS;
  const totalInviterReward = activationReward + subscriptionReward;

  const copyInviteUrl = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
      setError(
        isEnglish
          ? 'Copy failed. Please select and copy the link manually.'
          : '复制失败，请手动选择并复制邀请链接。'
      );
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      closeLabel={isEnglish ? 'Close referral invite' : '关闭邀请弹窗'}
      className="referral-invite-dialog"
      title={
        isEnglish
          ? `Earn up to ${(info ? totalInviterReward : REFERRAL_TOTAL_INVITER_REWARD_CREDITS).toLocaleString()} credits`
          : `最高赚取 ${(info ? totalInviterReward : REFERRAL_TOTAL_INVITER_REWARD_CREDITS).toLocaleString()} 积分`
      }
      description={
        isEnglish
          ? 'Invite a friend to create with WebToMind. Rewards unlock after real activation and subscription.'
          : '邀请好友加入 WebToMind，真实激活与订阅后分阶段获得奖励。'
      }
    >
      <div className="referral-invite-layout">
        <div className="referral-invite-art" aria-hidden="true">
          <img src="/referral/creator-invite-collaboration-v1.webp" alt="" />
          <span>
            <Gift />
          </span>
        </div>
        <div className="referral-invite-content">
          <ul>
            <li>
              <UserPlus />
              <span>
                {isEnglish
                  ? `After your friend completes their first valid creation, you both receive ${activationReward.toLocaleString()} credits — enough for a 2K generation.`
                  : `好友完成首次有效创作后，你和好友各得 ${activationReward.toLocaleString()} 积分，可完成 1 次 2K 图片生成。`}
              </span>
            </li>
            <li>
              <Sparkles />
              <span>
                {isEnglish
                  ? `Receive another ${subscriptionReward.toLocaleString()} credits when they first subscribe — 10% of a Pro monthly credit pack.`
                  : `好友首次订阅会员后，你再得 ${subscriptionReward.toLocaleString()} 积分，相当于专业版月度积分的 10%。`}
              </span>
            </li>
          </ul>
          <div className="referral-invite-link-block">
            <label>
              {isEnglish ? 'Your referral link' : '你的专属邀请链接'}
            </label>
            <div className="referral-invite-link-row">
              <output>
                {loading
                  ? isEnglish
                    ? 'Loading…'
                    : '正在加载…'
                  : inviteUrl || '—'}
              </output>
              <Button
                type="button"
                variant="primary"
                disabled={!inviteUrl}
                leadingIcon={copied ? <Check /> : <Copy />}
                onClick={() => void copyInviteUrl()}
              >
                {copied
                  ? isEnglish
                    ? 'Copied'
                    : '已复制'
                  : isEnglish
                    ? 'Copy'
                    : '复制'}
              </Button>
            </div>
            {error && <p role="alert">{error}</p>}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
