import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { createLogger } from '@/utils/logger';
import {
  Sparkles,
  Star,
  MessageCircle,
  Twitter,
  CheckCircle2,
  ArrowRight,
  Image,
  BookOpenText,
  GalleryHorizontalEnd,
  UserRound,
  LayoutDashboard,
  Share2,
  Gift,
  Trophy
} from 'lucide-react';
import { getAccessToken as getWorkspaceAccessToken } from '@/services/workspace-api';
import { getApiBaseUrl } from '@/utils/env';
import { trackEvent } from '@/web/lib/analytics';
import {
  cloneStarterRewardTasks,
  type RewardTaskDisplay
} from '@/shared/reward-tasks';
import { localizeQuestActionLink } from './quest-links';

const log = createLogger('QuestSection');

type Quest = RewardTaskDisplay;

export const QuestSection: React.FC = () => {
  const { t, i18n } = useTranslation('workspace');
  const locale = i18n.language === 'en-US' ? 'en-US' : 'zh-CN';
  const [quests, setQuests] = useState<Quest[]>(() =>
    cloneStarterRewardTasks()
  );
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);

  const fetchQuests = async () => {
    const token = getWorkspaceAccessToken();
    if (!token) {
      setQuests(cloneStarterRewardTasks());
      setUsingFallback(true);
      setLoading(false);
      return;
    }

    try {
      const baseUrl = getApiBaseUrl();
      const response = await fetch(`${baseUrl}/api/membership/tasks`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error(`Task API returned ${response.status}`);
      const data = await response.json();
      const apiTasks = Array.isArray(data.tasks) ? data.tasks : [];
      setQuests(apiTasks.length > 0 ? apiTasks : cloneStarterRewardTasks());
      setUsingFallback(apiTasks.length === 0);
    } catch (err) {
      log.error('[QuestSection] Failed to fetch tasks:', err);
      setQuests(cloneStarterRewardTasks());
      setUsingFallback(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuests();
  }, []);

  const handleComplete = async (quest: Quest) => {
    if (quest.is_completed) return;
    if (quest.action_link) {
      const localizedActionLink = localizeQuestActionLink(
        quest.action_link,
        locale
      );
      const target = getWorkspaceAccessToken()
        ? localizedActionLink
        : `/login?redirect=${encodeURIComponent(
            localizedActionLink
          )}&source=quest_page`;
      trackEvent('quest_cta_click', {
        source: 'quest_page',
        identifier: quest.identifier,
        reward_amount: quest.reward_amount,
        action_link: localizedActionLink,
        auth_required: !getWorkspaceAccessToken()
      });
      window.location.assign(target);
    }
  };

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'star':
        return <Star className="w-5 h-5 text-amber-500" />;
      case 'message-circle':
        return <MessageCircle className="w-5 h-5 text-blue-500" />;
      case 'twitter':
        return <Twitter className="w-5 h-5 text-sky-500" />;
      case 'image':
        return <Image className="w-5 h-5 text-rose-500" />;
      case 'book-open-text':
        return <BookOpenText className="w-5 h-5 text-indigo-500" />;
      case 'gallery-horizontal-end':
        return <GalleryHorizontalEnd className="w-5 h-5 text-emerald-500" />;
      case 'user-round':
        return <UserRound className="w-5 h-5 text-orange-500" />;
      case 'layout-dashboard':
        return <LayoutDashboard className="w-5 h-5 text-slate-600" />;
      case 'share-2':
        return <Share2 className="w-5 h-5 text-pink-500" />;
      default:
        return <Sparkles className="w-5 h-5 text-purple-500" />;
    }
  };

  if (loading)
    return (
      <div className="mt-12 animate-pulse">
        <div className="h-8 w-48 bg-slate-200 dark:bg-slate-700 rounded mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 bg-slate-100 dark:bg-slate-800 rounded-2xl"
            />
          ))}
        </div>
      </div>
    );

  const completedCount = quests.filter((quest) => quest.is_completed).length;
  const totalCount = quests.length;
  const totalReward = quests.reduce(
    (sum, quest) => sum + (Number(quest.reward_amount) || 0),
    0
  );
  const progressPercent =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const hasCompletedAll = totalCount > 0 && completedCount === totalCount;

  return (
    <div className="quest-section mt-12">
      <div className="quest-summary-panel rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 md:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-950 text-white dark:bg-slate-100 dark:text-slate-950">
              <Gift className="h-6 w-6" />
            </div>
            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-rose-600 dark:text-rose-300">
                {t('membership.newUserReward', {
                  defaultValue: 'New user reward'
                })}
              </div>
              <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-slate-50 md:text-3xl">
                {t('membership.questsTitle', {
                  defaultValue: 'Finish the starter path'
                })}
              </h2>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-slate-500 dark:text-slate-400">
                {t('membership.questsDesc', {
                  defaultValue:
                    'Complete first actions across image creation, social follow, and community tasks to collect bonus credits.'
                })}
              </p>
            </div>
          </div>
          <div className="quest-progress-card rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50 lg:min-w-[280px]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-bold text-slate-500">
                  {t('membership.questProgress', {
                    defaultValue: 'Progress'
                  })}
                </div>
                <div className="mt-1 text-2xl font-black text-slate-950 dark:text-slate-50">
                  {completedCount}/{totalCount || 0}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-slate-500">
                  {t('membership.questRewardPool', {
                    defaultValue: 'Reward pool'
                  })}
                </div>
                <div className="mt-1 text-2xl font-black text-rose-600 dark:text-rose-300">
                  +{totalReward.toLocaleString()}
                </div>
              </div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-slate-950 transition-all duration-500 dark:bg-slate-100"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        <div className="quest-milestone-card mt-6 flex items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <Trophy className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-300" />
          <div>
            <div className="text-sm font-black text-slate-950 dark:text-slate-50">
              {hasCompletedAll
                ? t('membership.questMilestoneCompleted', {
                    defaultValue: '新手路径已完成'
                  })
                : t('membership.questMilestoneTitle', {
                    defaultValue: '完成 6 步，掌握图片工作流'
                  })}
            </div>
            <p className="mt-1 text-sm font-medium leading-relaxed text-slate-600 dark:text-slate-300">
              {t('membership.questMilestoneDesc', {
                defaultValue:
                  '奖励只是顺手拿到的结果；真正目标是建立“生成、保存、复用、沉淀”的最小创作闭环。'
              })}
            </p>
          </div>
        </div>
        {usingFallback ? (
          <div className="quest-login-hint mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold leading-relaxed text-rose-700 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-200">
            {t('membership.questLoginHint', {
              defaultValue:
                '登录后会自动同步任务进度，并在完成任务时领取积分奖励。'
            })}
          </div>
        ) : null}
      </div>

      {quests.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800">
          {t('membership.noQuests', {
            defaultValue: 'No starter tasks are available right now.'
          })}
        </div>
      ) : null}

      <div className="quest-card-grid mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {quests.map((quest) => (
          <div
            key={quest.id}
            className={`quest-card group relative flex min-h-[210px] flex-col rounded-3xl border p-5 transition-all duration-slow ${
              quest.is_completed
                ? 'is-completed bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-700'
                : 'is-open bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-500 hover:shadow-xl hover:-translate-y-1'
            }`}
          >
            <div className="flex items-start justify-between mb-4">
              <div
                className={`quest-card-icon p-3 rounded-2xl ${quest.is_completed ? 'bg-slate-200 dark:bg-slate-700' : 'bg-slate-50 dark:bg-slate-700 group-hover:bg-rose-50 dark:group-hover:bg-rose-900/20 transition-colors'}`}
              >
                {quest.is_completed ? (
                  <CheckCircle2 className="w-5 h-5 text-muted-foreground dark:text-slate-500" />
                ) : (
                  getIcon(quest.icon)
                )}
              </div>
              <div className="quest-card-reward rounded-full bg-rose-50 px-2.5 py-1 text-sm font-black text-rose-600 dark:bg-rose-900/20 dark:text-rose-300">
                +{quest.reward_amount}
              </div>
            </div>

            <h3
              className={`quest-card-title mb-1 font-black ${quest.is_completed ? 'text-muted-foreground dark:text-slate-500' : 'text-slate-900 dark:text-slate-100'}`}
            >
              {quest.title['zh-CN'] || Object.values(quest.title)[0]}
            </h3>
            <p
              className={`quest-card-desc mb-6 line-clamp-3 text-sm leading-relaxed ${quest.is_completed ? 'text-slate-300 dark:text-slate-600' : 'text-slate-500'}`}
            >
              {quest.description['zh-CN'] ||
                Object.values(quest.description)[0]}
            </p>

            <button
              onClick={() => handleComplete(quest)}
              disabled={quest.is_completed}
              className={`quest-card-action mt-auto flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-black transition-all ${
                quest.is_completed
                  ? 'bg-slate-100 dark:bg-slate-700 text-muted-foreground dark:text-slate-500 cursor-default'
                  : 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 active:scale-95'
              }`}
            >
              {quest.is_completed ? (
                t('membership.questCompleted', { defaultValue: 'Completed' })
              ) : (
                <>
                  {t('membership.goComplete', { defaultValue: 'Go' })}
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
