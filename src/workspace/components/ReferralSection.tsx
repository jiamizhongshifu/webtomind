import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { createLogger } from '@/utils/logger';
import { Users, Copy, Check, Gift, ArrowRight, Info } from 'lucide-react';
import { REFERRAL_REWARD_CREDITS } from '@/shared/referral-rewards';

const log = createLogger('ReferralSection');
import { getApiBaseUrl } from '@/utils/env';
import { useAuth } from '@/web/contexts/AuthContext';

interface ReferralInfo {
  referral_code?: string;
  reward_amount?: number;
  total_reward_credits?: number;
  invited_count?: number;
  completed_invited_count?: number;
  pending_invited_count?: number;
  has_referrer?: boolean;
  referrer_status?: string | null;
  referrer_fraud_reason?: string | null;
  invited_users?: Array<{
    reward_amount?: number;
    status?: string;
    qualified_at?: string | null;
    reward_granted_at?: string | null;
    risk_reason?: string | null;
    fraud_reason?: string | null;
    profiles?: {
      avatar_url?: string;
      username?: string;
    };
  }>;
}

interface ReferralBindResponse {
  status?: string;
  error?: string;
}

export const ReferralSection: React.FC = () => {
  const { t } = useTranslation('workspace');
  const { getAccessToken, isAuthenticated } = useAuth();
  const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [binding, setBinding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReferralStatus = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const baseUrl = getApiBaseUrl();
      const response = await fetch(`${baseUrl}/api/membership/referral`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        if (response.status === 401) {
          log.warn(
            '[ReferralSection] Unauthorized access, maybe token expired'
          );
        }
        throw new Error(`Failed to fetch: ${response.status}`);
      }

      const data = await response.json();
      setReferralInfo(data);
    } catch (err) {
      log.error('[ReferralSection] Failed to fetch status:', err);
    } finally {
      setIsLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchReferralStatus();
    } else {
      setIsLoading(false);
    }
  }, [fetchReferralStatus, isAuthenticated]);

  const handleCopy = () => {
    const code = referralInfo?.referral_code;
    if (!code) return;

    const url = `https://www.webtomind.com?ref=${code}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleBind = async () => {
    const token = getAccessToken();
    if (!inviteCode || !token) return;
    try {
      setBinding(true);
      setError(null);
      const baseUrl = getApiBaseUrl();
      const response = await fetch(`${baseUrl}/api/membership/referral`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ code: inviteCode })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to bind code');
      }
      const bindResult = data as ReferralBindResponse;
      if (bindResult.status === 'fraud') {
        await fetchReferralStatus();
        throw new Error(
          t('membership.referralBlocked', {
            defaultValue:
              'This invite cannot be applied. Please contact support if this looks wrong.'
          })
        );
      }

      setSuccess(true);
      fetchReferralStatus();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to bind code');
    } finally {
      setBinding(false);
    }
  };

  const recentInvitedUsers = referralInfo?.invited_users ?? [];
  const rewardAmount = Math.max(
    1,
    Number(referralInfo?.reward_amount || REFERRAL_REWARD_CREDITS)
  );
  const completedInvitedCount =
    typeof referralInfo?.completed_invited_count === 'number'
      ? referralInfo.completed_invited_count
      : recentInvitedUsers.filter((ref) => ref.status === 'completed').length;
  const pendingInvitedCount =
    typeof referralInfo?.pending_invited_count === 'number'
      ? referralInfo.pending_invited_count
      : recentInvitedUsers.filter((ref) => ref.status === 'pending').length;
  const totalRewardCredits =
    typeof referralInfo?.total_reward_credits === 'number'
      ? referralInfo.total_reward_credits
      : completedInvitedCount * rewardAmount;
  const formattedRewardAmount = rewardAmount.toLocaleString();
  const referrerStatus = referralInfo?.referrer_status || null;
  const alreadyReferredDescription =
    referrerStatus === 'completed'
      ? t('membership.alreadyReferredDescCompleted', {
          defaultValue: 'Your invite reward has been granted.'
        })
      : referrerStatus === 'fraud'
        ? t('membership.alreadyReferredDescFraud', {
            defaultValue:
              'This invite is under review and no reward has been granted.'
          })
        : t('membership.alreadyReferredDescPending', {
            defaultValue:
              'Your invite code is saved. Rewards unlock after a valid image generation.'
          });

  if (isLoading && !referralInfo) {
    return (
      <div className="mt-16 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 p-10 animate-pulse">
        <div className="flex gap-4 mb-8">
          <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-xl" />
          <div className="space-y-2">
            <div className="w-48 h-6 bg-slate-100 dark:bg-slate-700 rounded" />
            <div className="w-64 h-4 bg-slate-100 dark:bg-slate-700 rounded" />
          </div>
        </div>
        <div className="w-full h-16 bg-slate-50 dark:bg-slate-700 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="mt-16 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="md:flex">
        {/* 左侧：分享区域 */}
        <div className="flex-1 p-8 md:p-10 border-b md:border-b-0 md:border-r border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <Gift className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {t('membership.referTitle', {
                defaultValue: 'Refer & Earn Rewards'
              })}
            </h2>
          </div>

          <p className="text-slate-600 mb-8 leading-relaxed">
            {t('membership.referDesc', {
              credits: formattedRewardAmount,
              defaultValue:
                'Invite your friends to WebToMind. Both sides receive {{credits}} Bonus Credits after the new user completes a valid image generation.'
            })}
          </p>

          <div className="space-y-4">
            <label className="text-xs font-bold text-muted-foreground dark:text-slate-500 uppercase tracking-widest">
              {t('membership.referLink')}
            </label>
            <div className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-700 rounded-2xl border border-slate-100 dark:border-slate-600">
              <div className="flex-1 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 font-mono truncate">
                {referralInfo?.referral_code
                  ? `https://www.webtomind.com?ref=${referralInfo.referral_code}`
                  : '......'}
              </div>
              <button
                onClick={handleCopy}
                className="px-4 py-2 bg-white dark:bg-slate-600 text-slate-900 dark:text-slate-100 font-bold rounded-xl border border-slate-200 dark:border-slate-500 hover:border-blue-500 dark:hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-all flex items-center gap-2"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                {copied ? t('messageBlocks.copied') : t('messageBlocks.copy')}
              </button>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {referralInfo?.invited_count || 0}
              </div>
              <div className="text-xs text-slate-500">
                {t('membership.friendsJoined', {
                  defaultValue: 'Friends Joined'
                })}
              </div>
            </div>
            {pendingInvitedCount > 0 && (
              <>
                <div className="w-px h-10 bg-slate-100 dark:bg-slate-700" />
                <div className="text-center">
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                    {pendingInvitedCount}
                  </div>
                  <div className="text-xs text-slate-500">
                    {t('membership.pendingActivation', {
                      defaultValue: 'Pending Activation'
                    })}
                  </div>
                </div>
              </>
            )}
            {completedInvitedCount > 0 && (
              <>
                <div className="w-px h-10 bg-slate-100 dark:bg-slate-700" />
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {completedInvitedCount}
                  </div>
                  <div className="text-xs text-slate-500">
                    {t('membership.rewardedReferrals', {
                      defaultValue: 'Rewarded'
                    })}
                  </div>
                </div>
              </>
            )}
            <div className="w-px h-10 bg-slate-100 dark:bg-slate-700" />
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {totalRewardCredits.toLocaleString()}
              </div>
              <div className="text-xs text-slate-500">
                {t('membership.creditsEarned', {
                  defaultValue: 'Credits Earned'
                })}
              </div>
            </div>
          </div>
        </div>

        {/* 右侧：绑定区域 */}
        <div className="w-full md:w-80 bg-slate-50/50 dark:bg-slate-900/50 p-8 md:p-10">
          {!referralInfo?.has_referrer ? (
            <>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                <Info className="w-4 h-4 text-muted-foreground dark:text-slate-500" />
                {t('membership.haveInviteCode', {
                  defaultValue: 'Have an Invite Code?'
                })}
              </h3>
              <p className="text-sm text-slate-500 mb-6">
                {t('membership.inviteCodeDesc', {
                  credits: formattedRewardAmount,
                  defaultValue:
                    "Enter your friend's code. Rewards are granted after one valid image generation."
                })}
              </p>
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder={t('membership.enterCode', {
                    defaultValue: 'Enter Code'
                  })}
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all uppercase font-mono text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                />
                {error && (
                  <p className="text-xs text-red-500 font-medium">{error}</p>
                )}
                {success && (
                  <p className="text-xs text-green-500 font-medium">
                    {t('membership.rewardGranted', {
                      defaultValue:
                        'Invite saved. Rewards unlock after one valid image generation.'
                    })}
                  </p>
                )}
                <button
                  onClick={handleBind}
                  disabled={binding || !inviteCode || success}
                  className="w-full py-3 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold rounded-xl hover:bg-slate-800 dark:hover:bg-slate-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {binding ? (
                    <div className="w-4 h-4 border-2 border-white/30 dark:border-slate-900/30 border-t-white dark:border-t-slate-900 rounded-full animate-spin" />
                  ) : (
                    <>
                      {t('membership.redeemCode', {
                        defaultValue: 'Redeem Code'
                      })}{' '}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
                <Check className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-2">
                {t('membership.alreadyReferred', {
                  defaultValue: 'Already Referred'
                })}
              </h3>
              <p className="text-sm text-slate-500">
                {alreadyReferredDescription}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 最近邀请列表 */}
      {recentInvitedUsers.length > 0 && (
        <div className="px-8 py-6 bg-white dark:bg-slate-800 border-t border-slate-50 dark:border-slate-700">
          <h3 className="text-xs font-bold text-muted-foreground dark:text-slate-500 uppercase tracking-widest mb-4">
            {t('membership.recentReferrals', {
              defaultValue: 'Recent Referrals'
            })}
          </h3>
          <div className="flex flex-wrap gap-4">
            {recentInvitedUsers.map((ref, idx: number) => {
              const status = ref.status || 'pending';
              const isCompleted = status === 'completed';
              const isFraud = status === 'fraud';
              const statusLabel = isCompleted
                ? `+${Number(ref.reward_amount || rewardAmount).toLocaleString()}`
                : isFraud
                  ? t('membership.referralStatusFraud', {
                      defaultValue: 'Review'
                    })
                  : t('membership.referralStatusPending', {
                      defaultValue: 'Pending'
                    });
              return (
                <div
                  key={idx}
                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-700 rounded-full border border-slate-100 dark:border-slate-600"
                >
                  <div className="w-5 h-5 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center overflow-hidden">
                    {ref.profiles?.avatar_url ? (
                      <img
                        src={ref.profiles.avatar_url}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Users className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                    )}
                  </div>
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    {ref.profiles?.username || t('detail.untitled')}
                  </span>
                  <span
                    className={`text-[10px] font-bold ${
                      isCompleted
                        ? 'text-green-600 dark:text-green-400'
                        : isFraud
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {statusLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
