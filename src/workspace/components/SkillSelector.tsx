/**
 * Skill 选择器组件
 * 显示匹配的 Skills 供用户确认使用
 */

import type { Skill } from '@/services/workspace-api';
import type { SkillResolverCandidate } from '@/workspace/types/skill-resolver';
import { Sparkles, X, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';

function getSkillSourceLabel(source?: Skill['source']): string {
  switch (source) {
    case 'system':
      return 'System';
    case 'market':
      return 'Market';
    case 'user':
    default:
      return 'User';
  }
}

interface SkillSelectorProps {
  /** 匹配的 Skills */
  matchedSkills: Array<{
    skill: Skill;
    score: number;
    matchedTriggers: string[];
  }>;
  /** 是否显示 */
  visible: boolean;
  /** 确认使用 Skill */
  onConfirm: (candidate: SkillResolverCandidate) => void;
  /** 关闭选择器（忽略 Skills） */
  onDismiss: () => void;
}

/**
 * Skill 确认选择器
 * 当检测到触发词时显示，用户需要确认是否使用该 Skill
 */
export function SkillSelector({
  matchedSkills,
  visible,
  onConfirm,
  onDismiss
}: SkillSelectorProps) {
  const { t } = useTranslation('workspace');

  if (!visible || matchedSkills.length === 0) {
    return null;
  }

  // 只显示最匹配的 Skill（分数最高的）
  const topMatch = matchedSkills[0];
  const topCandidate: SkillResolverCandidate = {
    skill: topMatch.skill,
    source: topMatch.skill.source,
    score: topMatch.score,
    matchedTriggers: topMatch.matchedTriggers,
    explicit: false
  };

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-xl shadow-lg border border-purple-200 overflow-hidden z-20 animate-in slide-in-from-bottom-2 duration-base">
      <div className="flex items-center justify-between px-3 py-2 border-b border-purple-100 bg-purple-50">
        <div className="flex items-center gap-2 text-sm text-purple-700">
          <Sparkles className="w-4 h-4" />
          <span>{t('skillSelector.detected', '检测到可用 Skill')}</span>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="p-1 rounded hover:bg-purple-200 text-purple-400 hover:text-purple-600 transition-colors"
          title={t('skillSelector.dismiss', '忽略')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3">
        <div className="flex items-start gap-3">
          {/* Skill 图标 */}
          <span className="text-2xl flex-shrink-0 mt-0.5">
            {topMatch.skill.icon || '🔧'}
          </span>

          {/* Skill 信息 */}
          <div className="flex-1 min-w-0">
            <div className="font-medium text-slate-800 flex items-center gap-2">
              <span>{topMatch.skill.displayName || topMatch.skill.name}</span>
              <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] uppercase">
                {getSkillSourceLabel(topMatch.skill.source)}
              </span>
            </div>
            {topMatch.skill.description && (
              <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">
                {topMatch.skill.description}
              </p>
            )}
            <div className="flex flex-wrap gap-1 mt-1.5">
              {topMatch.matchedTriggers.slice(0, 3).map((trigger) => (
                <span
                  key={trigger}
                  className="px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded text-xs"
                >
                  {trigger}
                </span>
              ))}
            </div>
          </div>

          {/* 确认按钮 */}
          <button
            type="button"
            onClick={() => onConfirm(topCandidate)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors flex-shrink-0"
          >
            <Play className="w-3.5 h-3.5" />
            {t('skillSelector.use', '使用')}
          </button>
        </div>

        {/* 其他匹配的 Skills（如果有多个） */}
        {matchedSkills.length > 1 && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <p className="text-xs text-muted-foreground mb-2">
              {t('skillSelector.otherMatches', '其他匹配的 Skills:')}
            </p>
            <div className="flex flex-wrap gap-2">
              {matchedSkills.slice(1, 4).map(({ skill, score, matchedTriggers }) => (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() =>
                    onConfirm({
                      skill,
                      source: skill.source,
                      score,
                      matchedTriggers,
                      explicit: false
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm text-slate-600 transition-colors"
                >
                  <span>{skill.icon || '🔧'}</span>
                  <span>{skill.displayName || skill.name}</span>
                  <span className="px-1 py-0.5 bg-white rounded text-[10px] text-slate-500 uppercase">
                    {getSkillSourceLabel(skill.source)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 已选中 Skill 的标签显示（确认后显示在输入框上方）
 */
interface SelectedSkillTagProps {
  candidate: SkillResolverCandidate;
  onRemove: () => void;
}

export function SelectedSkillTag({ candidate, onRemove }: SelectedSkillTagProps) {
  const { t } = useTranslation('workspace');
  const skill = candidate.skill;

  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-100 text-purple-700 rounded-lg text-sm border border-purple-200">
      <Sparkles className="w-3.5 h-3.5" />
      <span>{skill.icon || '🔧'}</span>
      <span className="font-medium">{skill.displayName || skill.name}</span>
      <span className="px-1.5 py-0.5 bg-white/70 rounded text-[10px] uppercase text-purple-600">
        {getSkillSourceLabel(candidate.source || skill.source)}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="p-0.5 rounded hover:bg-purple-200 transition-colors ml-1"
        title={t('skillSelector.remove', '移除')}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

/**
 * Skill 执行确认对话框
 * 在发送消息前显示，让用户确认是否使用选中的 Skill
 */
interface SkillConfirmDialogProps {
  candidate: SkillResolverCandidate;
  prompt: string;
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onSendWithoutSkill: () => void;
}

export function SkillConfirmDialog({
  candidate,
  prompt,
  visible,
  onConfirm,
  onCancel,
  onSendWithoutSkill
}: SkillConfirmDialogProps) {
  const { t } = useTranslation('workspace');
  const skill = candidate.skill;

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Sparkles className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-800">
              {t('skillConfirm.title', '使用 Skill')}
            </h3>
            <p className="text-sm text-slate-500">
              {t('skillConfirm.subtitle', '确认使用以下 Skill 处理您的请求')}
            </p>
          </div>
        </div>

        {/* Skill 信息 */}
        <div className="p-3 bg-purple-50 rounded-lg mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">{skill.icon || '🔧'}</span>
            <span className="font-medium text-purple-800">
              {skill.displayName || skill.name}
            </span>
            <span className="px-1.5 py-0.5 bg-white rounded text-[10px] uppercase text-purple-600">
              {getSkillSourceLabel(candidate.source || skill.source)}
            </span>
          </div>
          {skill.description && (
            <p className="text-sm text-purple-600 mt-1">{skill.description}</p>
          )}
        </div>

        {/* 用户输入预览 */}
        <div className="p-3 bg-slate-50 rounded-lg mb-4">
          <p className="text-xs text-muted-foreground mb-1">
            {t('skillConfirm.yourMessage', '您的消息:')}
          </p>
          <p className="text-sm text-slate-700 line-clamp-3">{prompt}</p>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            {t('skillConfirm.cancel', '取消')}
          </button>
          <button
            type="button"
            onClick={onSendWithoutSkill}
            className="flex-1 px-4 py-2 text-sm text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            {t('skillConfirm.sendWithout', '不使用 Skill')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 px-4 py-2 text-sm text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors font-medium"
          >
            {t('skillConfirm.confirm', '确认使用')}
          </button>
        </div>
      </div>
    </div>
  );
}
