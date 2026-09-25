import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  Crown,
  Gift,
  GalleryHorizontalEnd,
  Image,
  LayoutDashboard,
  MessageCircle,
  Share2,
  Sparkles,
  Star,
  Trophy,
  Twitter,
  UserRound,
  X
} from 'lucide-react';
import { getAccessToken as getWorkspaceAccessToken } from '@/services/workspace-api';
import { getApiBaseUrl } from '@/utils/env';
import { createLogger } from '@/utils/logger';
import { trackEvent } from '@/web/lib/analytics';
import {
  cloneStarterRewardTasks,
  type RewardTaskDisplay
} from '@/shared/reward-tasks';
import { localizeQuestActionLink } from './quest-links';

const log = createLogger('QuestRewardModal');

type Quest = RewardTaskDisplay;

interface QuestRewardModalProps {
  open: boolean;
  onClose: () => void;
}

function QuestIcon({
  iconName,
  completed
}: {
  iconName: string;
  completed: boolean;
}) {
  if (completed) {
    return <CheckCircle2 className="h-5 w-5 text-slate-400" />;
  }
  switch (iconName) {
    case 'star':
      return <Star className="h-5 w-5 text-amber-400" />;
    case 'message-circle':
      return <MessageCircle className="h-5 w-5 text-sky-400" />;
    case 'twitter':
      return <Twitter className="h-5 w-5 text-sky-300" />;
    case 'image':
      return <Image className="h-5 w-5 text-rose-300" />;
    case 'book-open-text':
      return <BookOpenText className="h-5 w-5 text-indigo-300" />;
    case 'gallery-horizontal-end':
      return <GalleryHorizontalEnd className="h-5 w-5 text-emerald-300" />;
    case 'user-round':
      return <UserRound className="h-5 w-5 text-orange-300" />;
    case 'layout-dashboard':
      return <LayoutDashboard className="h-5 w-5 text-slate-300" />;
    case 'share-2':
      return <Share2 className="h-5 w-5 text-emerald-300" />;
    default:
      return <Sparkles className="h-5 w-5 text-rose-300" />;
  }
}

export const QuestRewardModal: React.FC<QuestRewardModalProps> = ({
  open,
  onClose
}) => {
  const { t, i18n } = useTranslation('workspace');
  const [quests, setQuests] = useState<Quest[]>(() =>
    cloneStarterRewardTasks()
  );
  const [loading, setLoading] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);

  const locale = i18n.language === 'en-US' ? 'en-US' : 'zh-CN';
  const accessToken = getWorkspaceAccessToken();
  const completedCount = quests.filter((quest) => quest.is_completed).length;
  const totalCount = quests.length;
  const progressPercent =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const totalReward = quests.reduce(
    (sum, quest) => sum + (Number(quest.reward_amount) || 0),
    0
  );
  const hasCompletedAll = totalCount > 0 && completedCount === totalCount;
  const milestoneLabel = useMemo(
    () =>
      hasCompletedAll
        ? t('membership.questMilestoneCompleted', {
            defaultValue: '新手路径已完成'
          })
        : t('membership.questMilestoneTitle', {
            defaultValue: '完成 6 步，掌握图片工作流'
          }),
    [hasCompletedAll, t]
  );

  const fetchQuests = async () => {
    const token = getWorkspaceAccessToken();
    if (!token) {
      setQuests(cloneStarterRewardTasks());
      setUsingFallback(true);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${getApiBaseUrl()}/api/membership/tasks`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error(`Task API returned ${response.status}`);
      const data = await response.json();
      const apiTasks = Array.isArray(data.tasks) ? data.tasks : [];
      setQuests(apiTasks.length > 0 ? apiTasks : cloneStarterRewardTasks());
      setUsingFallback(apiTasks.length === 0);
    } catch (error) {
      log.error('[QuestRewardModal] Failed to fetch tasks:', error);
      setQuests(cloneStarterRewardTasks());
      setUsingFallback(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void fetchQuests();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  const handleComplete = async (quest: Quest) => {
    if (quest.is_completed) return;
    if (quest.action_link) {
      const localizedActionLink = localizeQuestActionLink(
        quest.action_link,
        locale
      );
      const target = accessToken
        ? localizedActionLink
        : `/login?redirect=${encodeURIComponent(
            localizedActionLink
          )}&source=quest_modal`;
      trackEvent('quest_cta_click', {
        source: 'quest_modal',
        identifier: quest.identifier,
        reward_amount: quest.reward_amount,
        action_link: localizedActionLink,
        auth_required: !accessToken
      });
      window.location.assign(target);
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[170] overflow-y-auto bg-slate-950/78 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quest-reward-modal-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="mx-auto flex min-h-full w-full max-w-5xl items-center justify-center">
        <div className="relative w-full overflow-hidden rounded-[22px] border border-white/12 bg-[#101010] text-white shadow-2xl shadow-black/40">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 z-10 inline-grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
            aria-label="关闭新手任务"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="border-b border-white/10 p-5 sm:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-extrabold text-rose-300">
                  <Gift className="h-4 w-4" />
                  {t('membership.newUserReward', {
                    defaultValue: '新人奖励'
                  })}
                </div>
                <h2
                  id="quest-reward-modal-title"
                  className="mt-2 text-2xl font-black tracking-normal text-white sm:text-3xl"
                >
                  {t('membership.questsTitle', {
                    defaultValue: '从目标到复用，完成第一条创作链路'
                  })}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                  {t('membership.questsDesc', {
                    defaultValue:
                      '完成 6 个基础动作，学会从商业目标、Prompt 案例、参考图、图库复用到 Boards 沉淀的完整流程。'
                  })}
                </p>
              </div>
              <div className="min-w-[124px] rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-right">
                <div className="text-xs font-bold text-slate-400">
                  {t('membership.questProgress', {
                    defaultValue: 'Progress'
                  })}
                </div>
                <div className="mt-1 text-2xl font-black text-rose-300">
                  {completedCount}/{totalCount || 0}
                </div>
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-2 rounded-full bg-rose-400 transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            {usingFallback ? (
              <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-500/10 px-4 py-3 text-sm font-semibold leading-6 text-rose-100">
                {t('membership.questLoginHint', {
                  defaultValue:
                    '登录后会自动同步任务进度，并在完成任务时领取积分奖励。'
                })}
              </div>
            ) : null}
          </div>

          <div className="p-5 sm:p-7">
            <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-400 text-slate-950">
                  <Crown className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-black text-white">
                    {milestoneLabel}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-400">
                    {t('membership.questMilestoneDesc', {
                      defaultValue:
                        '奖励只是顺手拿到的结果；真正目标是建立“生成、保存、复用、沉淀”的最小创作闭环。'
                    })}
                  </p>
                </div>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-rose-500/12 px-3 py-1.5 text-sm font-black text-rose-200">
                <Trophy className="h-4 w-4" />+{totalReward.toLocaleString()}
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((item) => (
                  <div
                    key={item}
                    className="h-40 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]"
                  />
                ))}
              </div>
            ) : quests.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-8 text-center text-sm font-semibold text-slate-400">
                {t('membership.noQuests', {
                  defaultValue: 'No starter tasks are available right now.'
                })}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {quests.map((quest) => {
                  const title =
                    quest.title[locale] ||
                    quest.title['zh-CN'] ||
                    Object.values(quest.title)[0] ||
                    'Starter task';
                  const description =
                    quest.description[locale] ||
                    quest.description['zh-CN'] ||
                    Object.values(quest.description)[0] ||
                    '';
                  return (
                    <div
                      key={quest.id}
                      className="flex min-h-[190px] flex-col rounded-2xl border border-white/10 bg-white/[0.035] p-4"
                    >
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.055]">
                          <QuestIcon
                            iconName={quest.icon}
                            completed={quest.is_completed}
                          />
                        </div>
                        <div className="rounded-full bg-rose-500/12 px-2.5 py-1 text-sm font-black text-rose-200">
                          +{quest.reward_amount}
                        </div>
                      </div>
                      <h3 className="text-base font-black text-white">
                        {title}
                      </h3>
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-400">
                        {description}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleComplete(quest)}
                        disabled={quest.is_completed}
                        className="mt-auto inline-flex min-h-[38px] items-center justify-center gap-2 rounded-xl bg-white px-3 text-sm font-black text-slate-950 transition hover:bg-rose-100 disabled:cursor-default disabled:bg-white/10 disabled:text-slate-500"
                      >
                        {quest.is_completed ? (
                          t('membership.questCompleted', {
                            defaultValue: 'Completed'
                          })
                        ) : (
                          <>
                            {t('membership.goComplete', {
                              defaultValue: 'Go'
                            })}
                            <ArrowRight className="h-3.5 w-3.5" />
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
