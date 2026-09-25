/**
 * Skill 参考文档管理 Tab
 * Layer 3: 管理 Skill 关联的参考文档
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { createLogger } from '@/utils/logger';
import {
  Plus,
  FileText,
  Trash2,
  Edit2,
  Save,
  X,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

const log = createLogger('SkillReferencesTab');
import {
  getSkillReferences,
  getSkillReference,
  createSkillReference,
  updateSkillReference,
  deleteSkillReference,
  type SkillReference
} from '@/services/workspace-api';

interface SkillReferencesTabProps {
  skillId: string;
}

export function SkillReferencesTab({ skillId }: SkillReferencesTabProps) {
  const { t } = useTranslation('workspace');
  const [references, setReferences] = useState<SkillReference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 编辑状态
  const [editingRef, setEditingRef] = useState<SkillReference | null>(null);
  const [expandedRef, setExpandedRef] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // 新建表单
  const [newName, setNewName] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newDescription, setNewDescription] = useState('');

  // 编辑表单
  const [editContent, setEditContent] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // 加载参考文档列表
  const loadReferences = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getSkillReferences(skillId);
      setReferences(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [skillId]);

  useEffect(() => {
    loadReferences();
  }, [loadReferences]);

  // 展开/收起参考文档
  const handleToggleExpand = async (ref: SkillReference) => {
    if (expandedRef === ref.name) {
      setExpandedRef(null);
      return;
    }

    // 如果没有内容，先加载
    if (!ref.content) {
      try {
        const fullRef = await getSkillReference(skillId, ref.name);
        setReferences((prev) =>
          prev.map((r) =>
            r.name === ref.name ? { ...r, content: fullRef.content } : r
          )
        );
      } catch (err) {
        log.error('Failed to load reference content:', err);
      }
    }
    setExpandedRef(ref.name);
  };

  // 创建参考文档
  const handleCreate = async () => {
    if (!newName.trim() || !newContent.trim()) return;

    try {
      const created = await createSkillReference({
        skillId,
        name: newName.trim(),
        content: newContent,
        description: newDescription || undefined
      });
      setReferences((prev) => [...prev, created]);
      setShowCreateForm(false);
      setNewName('');
      setNewContent('');
      setNewDescription('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    }
  };

  // 开始编辑
  const handleStartEdit = (ref: SkillReference) => {
    setEditingRef(ref);
    setEditContent(ref.content || '');
    setEditDescription(ref.description || '');
  };

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!editingRef) return;

    try {
      await updateSkillReference(skillId, editingRef.name, {
        content: editContent,
        description: editDescription || undefined
      });
      setReferences((prev) =>
        prev.map((r) =>
          r.name === editingRef.name
            ? { ...r, content: editContent, description: editDescription }
            : r
        )
      );
      setEditingRef(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    }
  };

  // 删除参考文档
  const handleDelete = async (name: string) => {
    if (
      !confirm(t('skillReferences.deleteConfirm', '确定要删除这个参考文档吗？'))
    )
      return;

    try {
      await deleteSkillReference(skillId, name);
      setReferences((prev) => prev.filter((r) => r.name !== name));
      if (expandedRef === name) setExpandedRef(null);
      if (editingRef?.name === name) setEditingRef(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        {t('skillReferences.loading', '加载中...')}
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

      {/* 新建按钮 */}
      {!showCreateForm && (
        <button
          type="button"
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm hover:bg-blue-100 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t('skillReferences.add', '添加参考文档')}
        </button>
      )}

      {/* 新建表单 */}
      {showCreateForm && (
        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-slate-700">
              {t('skillReferences.new', '新建参考文档')}
            </h4>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="p-1 hover:bg-slate-200 rounded"
            >
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>

          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t(
              'skillReferences.namePlaceholder',
              '文档名称 (如 api_docs.md)'
            )}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 bg-white placeholder:text-slate-400"
          />

          <input
            type="text"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder={t(
              'skillReferences.descriptionPlaceholder',
              '简短描述（可选）'
            )}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 bg-white placeholder:text-slate-400"
          />

          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder={t(
              'skillReferences.contentPlaceholder',
              '文档内容（支持 Markdown）'
            )}
            rows={8}
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
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('common.create', '创建')}
            </button>
          </div>
        </div>
      )}

      {/* 参考文档列表 */}
      {references.length === 0 && !showCreateForm ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          {t('skillReferences.empty', '暂无参考文档，点击上方按钮添加')}
        </div>
      ) : (
        <div className="space-y-2">
          {references.map((ref) => (
            <div
              key={ref.name}
              className="border border-slate-200 rounded-lg overflow-hidden"
            >
              {/* 标题栏 */}
              <div
                className="flex items-center gap-2 px-3 py-2 bg-slate-50 cursor-pointer hover:bg-slate-100"
                onClick={() => handleToggleExpand(ref)}
              >
                {expandedRef === ref.name ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
                <FileText className="w-4 h-4 text-blue-500" />
                <span className="flex-1 text-sm font-medium text-slate-700">
                  {ref.name}
                </span>
                {ref.wordCount && (
                  <span className="text-xs text-muted-foreground">
                    {ref.wordCount} {t('skillReferences.words', '字')}
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartEdit(ref);
                  }}
                  className="p-1 hover:bg-slate-200 rounded"
                >
                  <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(ref.name);
                  }}
                  className="p-1 hover:bg-red-100 rounded"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </button>
              </div>

              {/* 展开内容 */}
              {expandedRef === ref.name && (
                <div className="p-3 border-t border-slate-200">
                  {ref.description && (
                    <p className="text-sm text-slate-500 mb-2">
                      {ref.description}
                    </p>
                  )}
                  <pre className="text-xs text-slate-600 bg-white p-3 rounded border border-slate-100 overflow-x-auto whitespace-pre-wrap">
                    {ref.content ||
                      t('skillReferences.loadingContent', '加载中...')}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 编辑弹窗 */}
      {editingRef && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 shadow-xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">
                {t('skillReferences.edit', '编辑参考文档')}: {editingRef.name}
              </h3>
              <button
                type="button"
                onClick={() => setEditingRef(null)}
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
                'skillReferences.descriptionPlaceholder',
                '简短描述（可选）'
              )}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mb-3 text-slate-900 bg-white placeholder:text-slate-400"
            />

            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="flex-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono resize-none min-h-[300px] text-slate-900 bg-white placeholder:text-slate-400"
            />

            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setEditingRef(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                {t('common.cancel', '取消')}
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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
