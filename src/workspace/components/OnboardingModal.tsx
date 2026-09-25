/**
 * 新用户首次进 /boards 的轻量引导 modal。
 *
 * 触发条件:`localStorage['workspace:onboarding-seen']` 不存在(由 App.tsx 决定)。
 * 关闭即写入 localStorage,后续不再触发。
 *
 * 设计:2 步轻量引导
 *   Step 1/2 选场景:视觉创作(推荐) / 通用对话
 *   Step 2/2 行动指引 — 视觉创作直接跳 /create;通用对话提示项目设置
 *
 * 复用:fixed 全屏 backdrop + 居中圆角白卡(参考 ProjectEditModal 样式)。
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Wand2, MessageCircle, ArrowRight, Check } from 'lucide-react';
import { Badge } from '@/shared/ui/radix/badge';
import { Button } from '@/shared/ui/radix/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/shared/ui/radix/dialog';

const ONBOARDING_STORAGE_KEY = 'workspace:onboarding-seen';

export function hasSeenOnboarding(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_STORAGE_KEY) === '1';
  } catch {
    return true; // localStorage 不可用就当已看过,避免反复弹
  }
}

export function markOnboardingSeen(): void {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
  } catch {
    // 不可用就忽略
  }
}

type Scenario = 'visual' | 'chat';

export interface OnboardingModalProps {
  onClose: () => void;
}

export function OnboardingModal({ onClose }: OnboardingModalProps) {
  const { t } = useTranslation('boards');
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [scenario, setScenario] = useState<Scenario | null>(null);

  const handleDismiss = () => {
    markOnboardingSeen();
    onClose();
  };

  const handlePickScenario = (next: Scenario) => {
    setScenario(next);
    setStep(2);
  };

  const handleAction = () => {
    markOnboardingSeen();
    onClose();
    if (scenario === 'visual') {
      navigate('/create');
    }
    // 通用对话场景 — 关弹窗即可,用户已经在 /boards
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) handleDismiss();
      }}
    >
      <DialogContent
        className="max-w-md overflow-hidden p-0 sm:rounded-3xl"
        overlayClassName="bg-slate-900/30 backdrop-blur-sm"
      >
        <div className="px-8 pt-9 pb-7">
          {step === 1 && (
            <>
              <DialogHeader className="mb-6 text-left">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-2xl">👋</span>
                  <DialogTitle className="text-xl font-bold text-slate-900 dark:text-slate-100">
                    {t('onboarding.welcome', '欢迎加入 WebToMind!')}
                  </DialogTitle>
                </div>
                <DialogDescription className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  {t(
                    'onboarding.scenarioPrompt',
                    '你接下来主要想做什么?(可随时切换,不限制)'
                  )}
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-3">
                <Button
                  type="button"
                  onClick={() => handlePickScenario('visual')}
                  variant="outline"
                  className="group h-auto w-full justify-start rounded-2xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-4 text-left hover:border-amber-400 dark:border-amber-800 dark:from-amber-900/20 dark:to-orange-900/20 dark:hover:border-amber-600"
                >
                  <div className="flex w-full items-start gap-3">
                    <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-xl bg-amber-400 text-white shadow-sm dark:bg-amber-600">
                      <Wand2 />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {t('onboarding.visualTitle', '视觉创作')}
                        </span>
                        <Badge className="bg-amber-500 text-[10px] text-white hover:bg-amber-500">
                          {t('onboarding.recommended', '推荐')}
                        </Badge>
                      </div>
                      <p className="mt-1 whitespace-normal text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                        {t(
                          'onboarding.visualDesc',
                          'AI 出图 / 反推参考图 / 看图组合 / 风格复现'
                        )}
                      </p>
                    </div>
                    <ArrowRight className="mt-1 text-slate-400 transition-colors group-hover:text-amber-600" />
                  </div>
                </Button>

                <Button
                  type="button"
                  onClick={() => handlePickScenario('chat')}
                  variant="outline"
                  className="group h-auto w-full justify-start rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 text-left hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900/50 dark:hover:border-slate-500"
                >
                  <div className="flex w-full items-start gap-3">
                    <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-xl bg-slate-700 text-white shadow-sm dark:bg-slate-600">
                      <MessageCircle />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {t('onboarding.chatTitle', '通用对话')}
                      </span>
                      <p className="mt-1 whitespace-normal text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                        {t(
                          'onboarding.chatDesc',
                          '项目素材整理 / Agent 对话助理 / 文档协作'
                        )}
                      </p>
                    </div>
                    <ArrowRight className="mt-1 text-slate-400 transition-colors group-hover:text-slate-700" />
                  </div>
                </Button>
              </div>

              <Button
                type="button"
                onClick={handleDismiss}
                className="mt-5 min-h-11 w-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                variant="ghost"
              >
                {t('onboarding.skip', '跳过引导')}
              </Button>
            </>
          )}

          {step === 2 && (
            <>
              <DialogHeader className="mb-6 text-left">
                <div className="mb-2 flex items-center gap-2">
                  <Check className="text-green-500" />
                  <DialogTitle className="text-xl font-bold text-slate-900 dark:text-slate-100">
                    {scenario === 'visual'
                      ? t('onboarding.visualNextTitle', '准备开始视觉创作')
                      : t('onboarding.chatNextTitle', '工作台已就绪')}
                  </DialogTitle>
                </div>
                <DialogDescription className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  {scenario === 'visual'
                    ? t(
                        'onboarding.visualNextDesc',
                        '我们带你进入视觉提示词工作台 — 看图组合 16 个 slot，一键生成可复现图片。上传一张参考图试试 AI 反推。'
                      )
                    : t(
                        'onboarding.chatNextDesc',
                        '在项目里和 Agent 对话,整理素材;在项目设置里可以写自定义指令,所有对话自动加载。'
                      )}
                </DialogDescription>
              </DialogHeader>

              <div className="flex gap-3">
                <Button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1"
                  variant="secondary"
                >
                  {t('onboarding.back', '返回')}
                </Button>
                <Button
                  type="button"
                  onClick={handleAction}
                  className="flex-[2]"
                >
                  {scenario === 'visual'
                    ? t('onboarding.goToStudio', '进入创作台')
                    : t('onboarding.goToBoards', '开始使用工作台')}
                  <ArrowRight data-icon="inline-end" />
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
