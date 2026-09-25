import { useState } from 'react';
import type { Skill } from '@/services/workspace-api';
import type { SavedSummary } from '@/services/database';
import type { Reference } from '@/types';
import type { SkillResolverCandidate } from '@/workspace/types/skill-resolver';
import { Sparkles, X, Compass, Settings2, Check, Plus, ArrowLeft, Link2, FileText } from 'lucide-react';
import { ReferenceSelector } from './ReferenceSelector';

interface SelectedReference {
  id: string;
  summaryId: string;
  summaryTitle: string;
  preview: string;
  thumbnailUrl?: string;
}

interface ChatSkillEntryPopoverProps {
  skills: Skill[];
  visible: boolean;
  selectedSkillCandidate: SkillResolverCandidate | null;
  onSelectSkill: (skill: Skill) => void;
  onClose: () => void;
  onExploreMore: () => void;
  onManageSkills: () => void;
  onCreateSkill?: (skill: {
    name: string;
    prompt: string;
    description?: string;
    referenceIds?: string[];
  }) => Promise<{ id: string }>;
  summaries?: SavedSummary[];
}

export function ChatSkillEntryPopover({
  skills,
  visible,
  selectedSkillCandidate,
  onSelectSkill,
  onClose,
  onExploreMore,
  onManageSkills,
  onCreateSkill,
  summaries = []
}: ChatSkillEntryPopoverProps) {
  const [createMode, setCreateMode] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createPrompt, setCreatePrompt] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createRefs, setCreateRefs] = useState<SelectedReference[]>([]);
  const [showRefSelector, setShowRefSelector] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!visible) return null;

  const selectedSkillId = selectedSkillCandidate?.skill.id;

  const handleCreate = async () => {
    const name = createName.trim();
    const prompt = createPrompt.trim();
    if (!name || !prompt || saving || !onCreateSkill) return;
    try {
      setSaving(true);
      await onCreateSkill({
        name,
        prompt,
        description: createDescription.trim() || undefined,
        referenceIds: createRefs.length > 0
          ? createRefs.map((r) => r.summaryId)
          : undefined
      });
      setCreateMode(false);
      setCreateName('');
      setCreatePrompt('');
      setCreateDescription('');
      setCreateRefs([]);
    } finally {
      setSaving(false);
    }
  };

  const handleAddReferences = (refs: Reference[]) => {
    const newRefs: SelectedReference[] = refs.map((ref) => {
      const summary = summaries.find((s) => s.id === ref.summaryId);
      const content = summary?.markdown || '';
      // 提取缩略图
      const imgMatch = content.match(
        /<img[^>]+src=["'](data:image\/[^;]+;base64,[^"']+)["'][^>]*>/i
      ) || content.match(
        /!\[.*\]\((data:image\/[^;]+;base64,[^)]+)\)/i
      );
      return {
        id: ref.id,
        summaryId: ref.summaryId!,
        summaryTitle: ref.summaryTitle || '未命名',
        preview: ref.preview,
        thumbnailUrl: imgMatch?.[1]
      };
    });
    setCreateRefs((prev) => [...prev, ...newRefs]);
    setShowRefSelector(false);
  };

  const handleRemoveRef = (refId: string) => {
    setCreateRefs((prev) => prev.filter((r) => r.id !== refId));
  };

  const existingRefIds = createRefs.map((r) => r.summaryId);

  // 新建技能表单
  if (createMode) {
    return (
      <>
        <div className="absolute bottom-full left-0 mb-3 w-[380px] rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_20px_60px_rgba(15,23,42,0.16)] backdrop-blur-xl z-20 overflow-hidden">
          {/* 标题栏 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-white to-violet-50/70">
            <button
              type="button"
              onClick={() => setCreateMode(false)}
              className="flex items-center gap-2 text-sm font-medium text-slate-700"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>新建技能</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              title="关闭"
              aria-label="关闭"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 表单 */}
          <div className="px-4 py-4 space-y-4 max-h-[420px] overflow-y-auto">
            {/* 技能名称 */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                技能名称
              </label>
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="给技能起个名字"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-300 transition-shadow"
                autoFocus
              />
            </div>

            {/* 指令 */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                指令
              </label>
              <div className="rounded-xl border border-slate-200 overflow-hidden focus-within:ring-2 focus-within:ring-violet-200 focus-within:border-violet-300 transition-shadow">
                {/* 已添加的引用标签 */}
                {createRefs.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 p-2 border-b border-slate-100 bg-slate-50">
                    {createRefs.map((ref) => (
                      <span
                        key={ref.id}
                        className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs"
                      >
                        {ref.thumbnailUrl ? (
                          <img
                            src={ref.thumbnailUrl}
                            alt=""
                            className="w-4 h-4 rounded object-cover flex-shrink-0"
                          />
                        ) : (
                          <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                        )}
                        <span className="max-w-[100px] truncate">
                          {ref.summaryTitle}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveRef(ref.id)}
                          className="p-0.5 hover:bg-blue-100 rounded transition-colors"
                          title="移除引用"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <textarea
                  value={createPrompt}
                  onChange={(e) => setCreatePrompt(e.target.value)}
                  placeholder="描述这个技能要做什么，例如：&#10;你是一个专业的文案助手，帮我把内容改写为小红书风格..."
                  rows={5}
                  className="w-full px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 resize-none focus:outline-none bg-white"
                />

                {/* 底部工具栏 */}
                <div className="flex items-center px-2 py-1.5 border-t border-slate-100 bg-white">
                  <button
                    type="button"
                    onClick={() => setShowRefSelector(true)}
                    className="p-1.5 rounded-lg transition-all text-slate-400 hover:text-violet-600 hover:bg-violet-50"
                    title="添加引用"
                  >
                    <Link2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* 描述（可选） */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                描述
                <span className="ml-1 text-slate-400 font-normal">（可选）</span>
              </label>
              <input
                type="text"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value.slice(0, 200))}
                placeholder="简要描述技能用途"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-300 transition-shadow"
              />
            </div>
          </div>

          {/* 底部按钮 */}
          <div className="border-t border-slate-100 px-4 py-3 flex items-center justify-end gap-2 bg-white">
            <button
              type="button"
              onClick={() => setCreateMode(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 rounded-full hover:bg-slate-100 transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={!createName.trim() || !createPrompt.trim() || saving}
              className="px-5 py-2 text-sm font-medium text-white bg-slate-900 rounded-full hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? '创建中...' : '创建'}
            </button>
          </div>
        </div>

        {/* 引用选择器弹窗 */}
        {showRefSelector && (
          <ReferenceSelector
            summaries={summaries}
            existingReferenceIds={existingRefIds}
            onConfirm={handleAddReferences}
            onCancel={() => setShowRefSelector(false)}
          />
        )}
      </>
    );
  }

  // 技能列表
  return (
    <div className="absolute bottom-full left-0 mb-3 w-[340px] rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_20px_60px_rgba(15,23,42,0.16)] backdrop-blur-xl z-20 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-white to-violet-50/70">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm">
            <Sparkles className="w-4 h-4" />
          </div>
          <span>已添加技能</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          title="关闭技能列表"
          aria-label="关闭技能列表"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="max-h-[360px] overflow-y-auto px-2 py-2">
        {skills.length > 0 ? (
          skills.map((skill) => {
            const selected = selectedSkillId === skill.id;
            return (
              <button
                key={skill.id}
                type="button"
                onClick={() => onSelectSkill(skill)}
                className={`w-full rounded-2xl px-3 py-3 flex items-start gap-3 text-left transition-all ${
                  selected
                    ? 'bg-gradient-to-r from-violet-50 to-fuchsia-50 text-violet-700 ring-1 ring-violet-200 shadow-sm'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div
                  className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl text-sm shrink-0 ${
                    selected
                      ? 'bg-white text-violet-700 shadow-sm'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {skill.icon || '✨'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {skill.displayName || skill.name}
                    </span>
                    {selected ? (
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-violet-100 text-violet-700 shrink-0">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">
                    {skill.description || '已添加技能'}
                  </p>
                </div>
              </button>
            );
          })
        ) : (
          <div className="px-4 py-12 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-100 to-violet-50 text-violet-500">
              <Sparkles className="w-5 h-5" />
            </div>
            <p className="text-sm font-medium text-slate-700">暂无已添加技能</p>
            <p className="mt-1 text-xs leading-6 text-slate-500">
              去技能中心探索并添加技能，或直接新建自定义技能
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 px-4 py-3 flex items-center justify-between bg-white">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onExploreMore}
            className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
          >
            <Compass className="w-4 h-4" />
            <span>探索更多</span>
          </button>
          {onCreateSkill && (
            <button
              type="button"
              onClick={() => setCreateMode(true)}
              className="inline-flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>新建技能</span>
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onManageSkills}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 hover:border-slate-300 hover:bg-slate-100 transition-colors"
        >
          <Settings2 className="w-4 h-4" />
          <span>管理</span>
        </button>
      </div>
    </div>
  );
}
