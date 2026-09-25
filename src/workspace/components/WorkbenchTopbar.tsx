import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ChevronDown,
  Crown,
  Search,
  Settings,
  Download,
  MessageSquare,
  LogOut
} from 'lucide-react';
import { Project } from '@/services/workspace-api';
import { useAuth } from '@/web/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Badge } from '@/shared/ui/radix/badge';
import { Button } from '@/shared/ui/radix/button';
import { Input } from '@/shared/ui/radix/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/shared/ui/radix/popover';
import { Separator } from '@/shared/ui/radix/separator';
import { Logo } from './Logo';
import { UserAvatar } from '@/shared/components/UserAvatar';
import {
  FREE_DAILY_CREDITS,
  getCreditProgressPercent
} from '@/shared/credit-policy';

interface WorkbenchTopbarProps {
  projectName: string;
  projects: Project[];
  currentProjectId: string | null;
  projectsLoading?: boolean; // 项目是否正在加载
  onBack: () => void;
  onSelectProject: (projectId: string | null) => void;
  onShowPricing?: () => void;
  onShowSettings?: () => void;
  profile?: {
    member_number?: number;
    member_number_formatted?: string;
    days_joined?: number;
  } | null;
  credits?: {
    daily: number;
    dailyMax: number;
    subscription?: number;
    subscriptionMax?: number;
    bonus: number;
    referral: number;
    total: number;
  } | null;
  subscription?: {
    planName: string;
    status: string;
  } | null;
}

interface WorkbenchProjectSwitcherProps {
  projectName: string;
  projects: Project[];
  currentProjectId: string | null;
  projectsLoading?: boolean;
  onBack: () => void;
  onSelectProject: (projectId: string | null) => void;
  showLogo?: boolean;
  showBackButton?: boolean;
  className?: string;
}

export const WorkbenchProjectSwitcher: React.FC<
  WorkbenchProjectSwitcherProps
> = ({
  projectName,
  projects,
  currentProjectId,
  projectsLoading = false,
  onBack,
  onSelectProject,
  showLogo = true,
  showBackButton = false,
  className = ''
}) => {
  const { t } = useTranslation(['workspace', 'boards']);
  const [showProjectSelector, setShowProjectSelector] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');

  const displayTitle =
    projectName ||
    (currentProjectId && projectsLoading
      ? t('workspace:loading', '加载中...')
      : t('workspace:title', '工作台'));

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(projectSearch.toLowerCase())
  );

  return (
    <div className={cn('relative flex items-center gap-4', className)}>
      {showLogo && (
        <>
          <Button
            aria-label={t('workspace:backToWorkspace', '返回工作台')}
            className="size-8 p-0"
            onClick={onBack}
            size="icon"
            title={t('workspace:backToWorkspace', '返回工作台')}
            type="button"
            variant="ghost"
          >
            <Logo size={32} className="hover:scale-105 transition-transform" />
          </Button>

          <Separator className="mx-1 h-4" orientation="vertical" />
        </>
      )}

      {showBackButton && (
        <Button
          type="button"
          onClick={onBack}
          className="workspace-project-switcher-back flex-shrink-0 rounded-full"
          aria-label="返回工作台主页"
          title="返回工作台主页"
          size="icon"
          variant="outline"
        >
          <ArrowLeft data-icon="inline-start" />
        </Button>
      )}

      <Popover
        open={showProjectSelector}
        onOpenChange={setShowProjectSelector}
      >
        <PopoverTrigger asChild>
          <Button
            className="workspace-project-switcher-trigger min-h-11 gap-1 px-2 py-1.5 text-sm font-bold"
            type="button"
            variant="ghost"
          >
            <span className="workspace-project-switcher-title truncate">
              {displayTitle}
            </span>
            <ChevronDown
              data-icon="inline-end"
              className={cn(
                'text-muted-foreground transition-transform duration-base',
                showProjectSelector && 'rotate-180'
              )}
            />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-64 rounded-2xl p-2.5 shadow-2xl"
          sideOffset={8}
        >
          <div className="mb-2 px-1">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                autoFocus
                placeholder="搜索"
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                className="h-9 rounded-xl pl-9"
              />
            </div>
          </div>

          <div className="max-h-[300px] overflow-y-auto px-1.5 custom-scrollbar">
            {filteredProjects.map((p) => (
              <Button
                key={p.id}
                type="button"
                onClick={() => {
                  onSelectProject(p.id);
                  setShowProjectSelector(false);
                }}
                className={cn(
                  'h-auto w-full justify-start gap-3 rounded-xl px-3 py-2',
                  currentProjectId === p.id && 'bg-accent text-accent-foreground'
                )}
                variant="ghost"
              >
                <div className="flex size-6 items-center justify-center rounded-md border bg-background text-xs shadow-sm">
                  {p.icon || '📁'}
                </div>
                <span className="truncate text-sm font-medium">
                  {p.name}
                </span>
                {currentProjectId === p.id && (
                  <div className="ml-auto size-1.5 rounded-full bg-primary" />
                )}
              </Button>
            ))}

            {filteredProjects.length === 0 && (
              <div className="py-8 text-center text-xs text-muted-foreground">
                未找到匹配项目
              </div>
            )}
          </div>

          <Separator className="my-2" />

          <div className="px-1.5">
            <Button
              className="h-auto w-full justify-start gap-3 rounded-xl px-3 py-2 font-bold text-muted-foreground"
              type="button"
              variant="ghost"
            >
              <div className="flex size-4 items-center justify-center rounded bg-muted text-[10px]">
                +
              </div>
              <span className="text-sm">空白项目</span>
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export const WorkbenchTopbar: React.FC<WorkbenchTopbarProps> = ({
  projectName,
  projects,
  currentProjectId,
  projectsLoading = false,
  onBack,
  onSelectProject,
  onShowPricing,
  onShowSettings,
  profile,
  credits,
  subscription
}) => {
  const { t } = useTranslation(['workspace', 'boards']);
  const { user, signOut } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const dailyCredits = credits?.daily ?? 0;
  const dailyCreditLimit = credits?.dailyMax ?? FREE_DAILY_CREDITS;

  return (
    <header className="h-[56px] border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-between px-4 shrink-0 z-30 shadow-sm">
      {/* Left: Logo & Project Title */}
      <WorkbenchProjectSwitcher
        projectName={projectName}
        projects={projects}
        currentProjectId={currentProjectId}
        projectsLoading={projectsLoading}
        onBack={onBack}
        onSelectProject={onSelectProject}
      />

      {/* Center: Empty Space (Tabs removed) */}
      <div className="flex-1" />

      {/* Right: Functional Buttons */}
      <div className="flex items-center gap-3">
        {/* 只对免费用户显示升级按钮 */}
        {(!subscription?.planName || subscription.planName === 'free') && (
          <Button
            onClick={onShowPricing}
            className="hidden bg-blue-600 text-white shadow-md shadow-blue-500/10 hover:bg-blue-500 sm:inline-flex"
            size="sm"
            type="button"
          >
            <Crown data-icon="inline-start" />
            <span>{t('boards:actions.upgrade', '升级')}</span>
          </Button>
        )}

        <Separator className="mx-1 h-4" orientation="vertical" />

        {/* User Avatar & Menu */}
        <Popover open={showUserMenu} onOpenChange={setShowUserMenu}>
          <PopoverTrigger asChild>
            <Button
              className="ml-2 size-8 overflow-hidden rounded-full border border-white bg-gradient-to-tr from-blue-500 to-indigo-500 p-0 text-[10px] font-bold uppercase text-white shadow-sm hover:ring-2 hover:ring-blue-100"
              title={user?.email || 'User'}
              aria-label="用户菜单"
              size="icon"
              type="button"
              variant="ghost"
            >
              <UserAvatar
                user={user}
                email={user?.email}
                className="flex h-full w-full items-center justify-center rounded-full"
                imageClassName="block h-full w-full rounded-full object-cover"
                loading="eager"
                fetchPriority="high"
                preload
              />
            </Button>
          </PopoverTrigger>

          <PopoverContent
            align="end"
            className="w-72 overflow-hidden rounded-2xl p-0 shadow-2xl"
            sideOffset={8}
          >
              {/* 用户头部 */}
              <div className="border-b bg-gradient-to-br from-slate-50 to-white p-4 dark:from-slate-700 dark:to-slate-800">
                <div className="flex items-center gap-3 mb-3">
                  <UserAvatar
                    user={user}
                    email={user?.email}
                    className="flex size-12 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-gradient-to-tr from-blue-500 to-indigo-500 text-lg font-bold uppercase text-white shadow-md"
                    imageClassName="block size-full rounded-full object-cover"
                  />
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-slate-100 truncate">
                        {user?.user_metadata?.full_name ||
                          user?.email?.split('@')[0] ||
                          'WebtoMind User'}
                      </span>
                      <Badge
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[10px] uppercase',
                          subscription?.planName &&
                            subscription.planName !== 'free'
                            ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white'
                            : 'bg-blue-600 text-white'
                        )}
                      >
                        {subscription?.planName
                          ? subscription.planName === 'free'
                            ? 'Free'
                            : subscription.planName.toUpperCase()
                          : 'Free'}
                      </Badge>
                    </div>
                    <span className="truncate text-xs text-muted-foreground">
                      {user?.email}
                    </span>
                  </div>
                </div>

                {/* 创始成员勋章 */}
                {profile?.member_number_formatted && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-full text-[11px] font-bold text-amber-700 shadow-sm">
                    <Crown className="size-3.5 text-amber-500" />
                    创始成员 {profile.member_number_formatted}
                  </div>
                )}
              </div>

              {/* 积分信息 */}
              <div className="p-3 border-b border-slate-100 dark:border-slate-700">
                <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-3 border border-slate-100 dark:border-slate-600">
                  {subscription?.planName &&
                  subscription.planName !== 'free' ? (
                    <>
                      {/* 付费会员：显示总积分 + 箭头链接 */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold text-slate-500 uppercase">
                          当前积分
                        </span>
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-bold text-blue-600">
                            {credits?.total || 0}
                          </span>
                          <Button
                            type="button"
                            aria-label="查看套餐"
                            onClick={() => {
                              setShowUserMenu(false);
                              onShowPricing?.();
                            }}
                            className="size-6 p-0 text-muted-foreground hover:text-blue-500"
                            title="查看套餐"
                            size="icon"
                            variant="ghost"
                          >
                            <ChevronDown
                              data-icon="inline-start"
                              className="-rotate-90"
                            />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                        <span>邀请奖励: {credits?.referral || 0}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* 免费用户：显示每日免费积分 */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold text-slate-500 uppercase">
                          每日免费积分
                        </span>
                        <span className="text-xs font-bold text-blue-600">
                          {dailyCredits}/{dailyCreditLimit}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{
                            width: `${getCreditProgressPercent(dailyCredits, dailyCreditLimit)}%`
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                        <span>邀请奖励: {credits?.referral || 0}</span>
                        <span>总计: {credits?.total || 0}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* 功能菜单 */}
              <div className="p-2">
                <Button
                  onClick={() => {
                    setShowUserMenu(false);
                    onShowSettings?.();
                  }}
                  className="h-auto w-full justify-start gap-3 px-3 py-2 text-slate-600"
                  type="button"
                  variant="ghost"
                >
                  <Settings data-icon="inline-start" className="text-muted-foreground" />
                  <span>个人设置</span>
                </Button>
                <Button
                  className="h-auto w-full justify-start gap-3 px-3 py-2 text-slate-600"
                  type="button"
                  variant="ghost"
                >
                  <Download data-icon="inline-start" className="text-muted-foreground" />
                  <span>下载应用</span>
                </Button>
                <Button
                  className="h-auto w-full justify-start gap-3 px-3 py-2 text-slate-600"
                  type="button"
                  variant="ghost"
                >
                  <MessageSquare
                    data-icon="inline-start"
                    className="text-muted-foreground"
                  />
                  <span>Discord</span>
                </Button>
              </div>

              {/* 退出登录 */}
              <div className="border-t p-2">
                <Button
                  onClick={() => signOut()}
                  className="h-auto w-full justify-start gap-3 px-3 py-2 text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                  type="button"
                  variant="ghost"
                >
                  <LogOut data-icon="inline-start" />
                  <span>退出登录</span>
                </Button>
              </div>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
};
