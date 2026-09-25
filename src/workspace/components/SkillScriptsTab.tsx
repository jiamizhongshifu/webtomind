/**
 * Skill 脚本管理 Tab
 * Layer 3: 管理 Skill 关联的可执行脚本
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { createLogger } from '@/utils/logger';
import {
  Plus,
  Code,
  Trash2,
  Edit2,
  Save,
  X,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

const log = createLogger('SkillScriptsTab');
import {
  getSkillScripts,
  getSkillScript,
  createSkillScript,
  updateSkillScript,
  deleteSkillScript,
  type SkillScript
} from '@/services/workspace-api';

interface SkillScriptsTabProps {
  skillId: string;
}

const LANGUAGE_OPTIONS = [
  { value: 'python', label: 'Python', ext: '.py' },
  { value: 'javascript', label: 'JavaScript', ext: '.js' },
  { value: 'typescript', label: 'TypeScript', ext: '.ts' }
];

export function SkillScriptsTab({ skillId }: SkillScriptsTabProps) {
  const { t } = useTranslation('workspace');
  const [scripts, setScripts] = useState<SkillScript[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 编辑状态
  const [editingScript, setEditingScript] = useState<SkillScript | null>(null);
  const [expandedScript, setExpandedScript] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // 新建表单
  const [newName, setNewName] = useState('');
  const [newLanguage, setNewLanguage] = useState('python');
  const [newContent, setNewContent] = useState('');
  const [newDescription, setNewDescription] = useState('');

  // 编辑表单
  const [editContent, setEditContent] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // 加载脚本列表
  const loadScripts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getSkillScripts(skillId);
      setScripts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [skillId]);

  useEffect(() => {
    loadScripts();
  }, [loadScripts]);

  // 展开/收起脚本
  const handleToggleExpand = async (script: SkillScript) => {
    if (expandedScript === script.name) {
      setExpandedScript(null);
      return;
    }

    // 如果没有内容，先加载
    if (!script.content) {
      try {
        const fullScript = await getSkillScript(skillId, script.name);
        setScripts((prev) =>
          prev.map((s) =>
            s.name === script.name ? { ...s, content: fullScript.content } : s
          )
        );
      } catch (err) {
        log.error('Failed to load script content:', err);
      }
    }
    setExpandedScript(script.name);
  };

  // 生成脚本文件名
  const generateFileName = (name: string, language: string) => {
    const ext =
      LANGUAGE_OPTIONS.find((l) => l.value === language)?.ext || '.py';
    const baseName = name
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${baseName}${ext}`;
  };

  // 创建脚本
  const handleCreate = async () => {
    if (!newName.trim() || !newContent.trim()) return;

    const fileName = generateFileName(newName, newLanguage);

    try {
      const created = await createSkillScript({
        skillId,
        name: fileName,
        content: newContent,
        language: newLanguage,
        description: newDescription || undefined
      });
      setScripts((prev) => [...prev, created]);
      setShowCreateForm(false);
      setNewName('');
      setNewContent('');
      setNewDescription('');
      setNewLanguage('python');
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    }
  };

  // 开始编辑
  const handleStartEdit = async (script: SkillScript) => {
    // 确保有内容
    if (!script.content) {
      try {
        const fullScript = await getSkillScript(skillId, script.name);
        script = { ...script, content: fullScript.content };
        setScripts((prev) =>
          prev.map((s) => (s.name === script.name ? script : s))
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载脚本失败');
        return;
      }
    }
    setEditingScript(script);
    setEditContent(script.content || '');
    setEditDescription(script.description || '');
  };

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!editingScript) return;

    try {
      await updateSkillScript(skillId, editingScript.name, {
        content: editContent,
        description: editDescription || undefined
      });
      setScripts((prev) =>
        prev.map((s) =>
          s.name === editingScript.name
            ? { ...s, content: editContent, description: editDescription }
            : s
        )
      );
      setEditingScript(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    }
  };

  // 删除脚本
  const handleDelete = async (name: string) => {
    if (!confirm(t('skillScripts.deleteConfirm', '确定要删除这个脚本吗？')))
      return;

    try {
      await deleteSkillScript(skillId, name);
      setScripts((prev) => prev.filter((s) => s.name !== name));
      if (expandedScript === name) setExpandedScript(null);
      if (editingScript?.name === name) setEditingScript(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  };

  // 获取语言图标颜色
  const getLanguageColor = (language: string) => {
    switch (language) {
      case 'python':
        return 'text-yellow-600 bg-yellow-50';
      case 'javascript':
        return 'text-amber-600 bg-amber-50';
      case 'typescript':
        return 'text-blue-600 bg-blue-50';
      default:
        return 'text-slate-600 bg-slate-50';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        {t('skillScripts.loading', '加载中...')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 错误提示 */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">
            {t('common.dismiss', '关闭')}
          </button>
        </div>
      )}

      {/* 安全提示 */}
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
        <strong>{t('skillScripts.securityNote', '安全提示')}:</strong>{' '}
        {t(
          'skillScripts.securityMessage',
          '脚本在安全沙箱中执行，仅允许使用白名单模块，禁止访问文件系统和网络。'
        )}
      </div>

      {/* 新建按钮 */}
      {!showCreateForm && (
        <button
          type="button"
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-2 px-3 py-2 bg-green-50 text-green-700 rounded-lg text-sm hover:bg-green-100 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t('skillScripts.add', '添加脚本')}
        </button>
      )}

      {/* 新建表单 */}
      {showCreateForm && (
        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-slate-700">
              {t('skillScripts.new', '新建脚本')}
            </h4>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="p-1 hover:bg-slate-200 rounded"
            >
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>

          <div className="flex gap-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('skillScripts.namePlaceholder', '脚本名称')}
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 bg-white placeholder:text-slate-400"
            />
            <select
              value={newLanguage}
              onChange={(e) => setNewLanguage(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 bg-white"
            >
              {LANGUAGE_OPTIONS.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>

          <input
            type="text"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder={t(
              'skillScripts.descriptionPlaceholder',
              '脚本描述（可选）'
            )}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 bg-white placeholder:text-slate-400"
          />

          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder={t(
              'skillScripts.contentPlaceholder',
              '# 脚本代码\n# 使用 params 获取参数\n# 使用 result 变量返回结果'
            )}
            rows={10}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono resize-none text-slate-900 bg-white placeholder:text-slate-400"
          />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-200 rounded-lg"
            >
              {t('common.cancel', '取消')}
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newName.trim() || !newContent.trim()}
              className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('common.create', '创建')}
            </button>
          </div>
        </div>
      )}

      {/* 脚本列表 */}
      {scripts.length === 0 && !showCreateForm ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          {t('skillScripts.empty', '暂无脚本，点击上方按钮添加')}
        </div>
      ) : (
        <div className="space-y-2">
          {scripts.map((script) => (
            <div
              key={script.name}
              className="border border-slate-200 rounded-lg overflow-hidden"
            >
              {/* 标题栏 */}
              <div
                className="flex items-center gap-2 px-3 py-2 bg-slate-50 cursor-pointer hover:bg-slate-100"
                onClick={() => handleToggleExpand(script)}
              >
                {expandedScript === script.name ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
                <Code className="w-4 h-4 text-green-500" />
                <span className="flex-1 text-sm font-medium text-slate-700 font-mono">
                  {script.name}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium ${getLanguageColor(script.language)}`}
                >
                  {script.language}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartEdit(script);
                  }}
                  className="p-1 hover:bg-slate-200 rounded"
                >
                  <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(script.name);
                  }}
                  className="p-1 hover:bg-red-100 rounded"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </button>
              </div>

              {/* 展开内容 */}
              {expandedScript === script.name && (
                <div className="p-3 border-t border-slate-200">
                  {script.description && (
                    <p className="text-sm text-slate-500 mb-2">
                      {script.description}
                    </p>
                  )}
                  <pre className="text-xs text-slate-600 bg-slate-900 text-slate-100 p-3 rounded overflow-x-auto">
                    <code>
                      {script.content ||
                        t('skillScripts.loadingContent', '加载中...')}
                    </code>
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 编辑弹窗 */}
      {editingScript && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 max-w-3xl w-full mx-4 shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-green-500" />
                <h3 className="text-lg font-semibold text-slate-800 font-mono">
                  {editingScript.name}
                </h3>
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium ${getLanguageColor(editingScript.language)}`}
                >
                  {editingScript.language}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEditingScript(null)}
                className="p-1 hover:bg-slate-100 rounded"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <input
              type="text"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder={t(
                'skillScripts.descriptionPlaceholder',
                '脚本描述（可选）'
              )}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mb-3 text-slate-900 bg-white placeholder:text-slate-400"
            />

            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="flex-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono resize-none min-h-[400px] bg-slate-900 text-slate-100"
              spellCheck={false}
            />

            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setEditingScript(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                {t('common.cancel', '取消')}
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <Save className="w-4 h-4" />
                {t('common.save', '保存')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
