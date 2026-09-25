import React from 'react';
import { useTranslation } from 'react-i18next';
import { Zap, X } from 'lucide-react';

interface CreditsWarningProps {
  type: 'insufficient' | 'quota';
  required?: number;
  current?: number;
  feature?: string;
  used?: number;
  max?: number;
  onClose: () => void;
  onUpgrade?: () => void;
}

// 功能名称翻译映射
const FEATURE_NAMES: Record<string, { 'zh-CN': string; 'en-US': string }> = {
  image_generation: { 'zh-CN': '图片生成', 'en-US': 'Image Generation' },
  ai_chat_basic: { 'zh-CN': 'AI 对话', 'en-US': 'AI Chat' },
  ai_chat_advanced: {
    'zh-CN': 'AI 对话（高级）',
    'en-US': 'AI Chat (Advanced)'
  },
  nlm_flashcards: { 'zh-CN': '闪卡生成', 'en-US': 'Flashcards' },
  nlm_mindmap: { 'zh-CN': '思维导图', 'en-US': 'Mind Map' },
  nlm_quiz: { 'zh-CN': '测验生成', 'en-US': 'Quiz' },
  nlm_summary: { 'zh-CN': '摘要生成', 'en-US': 'Summary' },
  nlm_audio: { 'zh-CN': '音频生成', 'en-US': 'Audio' },
  nlm_video: { 'zh-CN': '视频生成', 'en-US': 'Video' }
};

export const CreditsWarning: React.FC<CreditsWarningProps> = ({
  type,
  required,
  current,
  feature,
  used,
  max,
  onClose,
  onUpgrade
}) => {
  const { t, i18n } = useTranslation('workspace');
  const lang = i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US';

  const handleUpgrade = () => {
    if (onUpgrade) {
      onUpgrade();
    } else {
      window.open('https://webtomind.com/pricing', '_blank');
    }
    onClose();
  };

  // 获取功能名称
  const featureName = (feature && FEATURE_NAMES[feature]?.[lang]) || '';

  // 根据类型生成描述文案
  const getDescription = () => {
    if (type === 'insufficient') {
      return t('membership.insufficientCreditsDesc', { required, current });
    }

    // quota 类型
    if (used !== undefined && max !== undefined) {
      if (lang === 'zh-CN') {
        return `你已达到${featureName}的上限。升级到 Pro 版以无限创建`;
      }
      return `You've reached the limit for ${featureName}. Upgrade to Pro for unlimited access`;
    }

    if (lang === 'zh-CN') {
      return `你已达到生成图片数量的上限。升级到 Pro 版以无限创建`;
    }
    return `You've reached the image generation limit. Upgrade to Pro for unlimited access`;
  };

  // 根据类型生成标题
  const getTitle = () => {
    if (type === 'insufficient') {
      return t('membership.insufficientCredits');
    }

    if (lang === 'zh-CN') {
      return featureName ? `${featureName}已达上限` : '生图数量已达上限';
    }
    return featureName ? `${featureName} Limit Reached` : 'Image Limit Reached';
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      {/* 遮罩层 */}
      <div
        className="absolute inset-0 bg-slate-900/40 dark:bg-slate-900/70 backdrop-blur-[2px] animate-in fade-in duration-slow"
        onClick={onClose}
      />

      {/* 弹窗主体 - 参考竞品简洁设计 */}
      <div className="relative w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.25)] dark:shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] overflow-hidden animate-in zoom-in-95 duration-base">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 p-2 text-muted-foreground dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-8 pt-10">
          {/* 插图区域 - 简洁的图标 */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              {/* 魔法棒装饰 */}
              <svg
                width="160"
                height="140"
                viewBox="0 0 160 140"
                fill="none"
                className="text-slate-800 dark:text-slate-200"
              >
                <style>{`
                  @keyframes wizardFloat {
                    0%, 100% { transform: translateY(0px) rotate(0deg); }
                    50% { transform: translateY(-8px) rotate(2deg); }
                  }
                  @keyframes starTwinkle {
                    0%, 100% { opacity: 1; transform: scale(1) rotate(0deg); }
                    50% { opacity: 0.3; transform: scale(0.6) rotate(15deg); }
                  }
                  .anim-wizard { animation: wizardFloat 3.5s ease-in-out infinite; transform-origin: 80px 70px; }
                  .anim-star-1 { animation: starTwinkle 2s ease-in-out infinite; transform-origin: 45px 38px; }
                  .anim-star-2 { animation: starTwinkle 3s ease-in-out infinite 0.5s; transform-origin: 120px 30px; }
                  .anim-star-3 { animation: starTwinkle 2.5s ease-in-out infinite 1s; transform-origin: 100px 53px; }
                `}</style>
                {/* 简笔画魔法师骑扫帚 */}
                <g className="anim-wizard">
                  <circle
                    cx="80"
                    cy="35"
                    r="12"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                  />
                  <path
                    d="M68 47 L80 70 L92 47"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                  />
                  <path
                    d="M80 70 L80 95"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M80 80 L65 65"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M80 80 L95 65"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M50 100 L130 90"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                  <path
                    d="M120 90 L140 95 L140 85 L120 90"
                    fill="currentColor"
                  />
                  <path
                    d="M50 100 L30 110 L35 105 L30 100 L50 100"
                    fill="currentColor"
                  />
                </g>
                {/* 星星装饰 */}
                <path
                  className="anim-star-1"
                  d="M45 30 L47 35 L52 35 L48 38 L50 43 L45 40 L40 43 L42 38 L38 35 L43 35 Z"
                  fill="#818CF8"
                />
                <path
                  className="anim-star-2"
                  d="M120 25 L121 28 L124 28 L122 30 L123 33 L120 31 L117 33 L118 30 L116 28 L119 28 Z"
                  fill="#C4B5FD"
                />
                <path
                  className="anim-star-3"
                  d="M100 50 L101 52 L103 52 L101.5 53.5 L102 56 L100 54.5 L98 56 L98.5 53.5 L97 52 L99 52 Z"
                  fill="#A78BFA"
                />
                <circle
                  className="anim-star-2"
                  cx="130"
                  cy="40"
                  r="1.5"
                  fill="#C4B5FD"
                />
                <circle
                  className="anim-star-1"
                  cx="55"
                  cy="55"
                  r="1"
                  fill="#A78BFA"
                />
              </svg>
            </div>
          </div>

          {/* 标题 */}
          <h3 className="text-xl font-bold text-center text-slate-900 dark:text-slate-100 mb-3">
            {getTitle()}
          </h3>

          {/* 描述 */}
          <p className="text-sm text-center text-slate-500 leading-relaxed mb-8">
            {getDescription()}
          </p>

          {/* 升级按钮 */}
          <button
            onClick={handleUpgrade}
            className="w-full py-4 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-slate-200 text-white dark:text-slate-900 rounded-xl font-semibold text-base transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <Zap className="w-4 h-4" />
            {lang === 'zh-CN' ? '升级计划' : 'Upgrade Plan'}
          </button>
        </div>
      </div>
    </div>
  );
};
