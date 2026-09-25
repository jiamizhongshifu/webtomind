import type {
  Shortcut,
  SavedSummary,
  ShortcutReference
} from '@/services/database';
import type { Reference } from '@/types';
import { Settings2, Trash2, Plus, X } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/shared/ui/radix/alert-dialog';
import { Badge } from '@/shared/ui/radix/badge';
import { Button } from '@/shared/ui/radix/button';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel
} from '@/shared/ui/radix/field';
import { Input } from '@/shared/ui/radix/input';
import { Textarea } from '@/shared/ui/radix/textarea';
import { ReferenceSelector } from './ReferenceSelector';

interface ShortcutEditorProps {
  shortcut: Shortcut;
  summaries: SavedSummary[];
  onUpdate: (updates: Partial<Shortcut>) => void;
  onDelete: () => void;
}

/**
 * 快捷指令编辑器
 * 支持编辑名称、指令、描述，添加引用
 * 自动保存
 */
export function ShortcutEditor({
  shortcut,
  summaries,
  onUpdate,
  onDelete
}: ShortcutEditorProps) {
  const { t } = useTranslation('workspace');
  const [name, setName] = useState(shortcut.name);
  const [prompt, setPrompt] = useState(shortcut.prompt);
  const [description, setDescription] = useState(shortcut.description || '');
  const [references, setReferences] = useState<ShortcutReference[]>(
    shortcut.references || []
  );
  const [showRefSelector, setShowRefSelector] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // 防抖定时器
  const saveTimerRef = useRef<number | null>(null);

  // 当 shortcut 变化时更新本地状态
  useEffect(() => {
    setName(shortcut.name);
    setPrompt(shortcut.prompt);
    setDescription(shortcut.description || '');
    setReferences(shortcut.references || []);
  }, [
    shortcut.id,
    shortcut.name,
    shortcut.prompt,
    shortcut.description,
    shortcut.references
  ]);

  // 自动保存
  const saveChanges = useCallback(
    (updates: Partial<Shortcut>) => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      saveTimerRef.current = window.setTimeout(() => {
        onUpdate(updates);
        saveTimerRef.current = null;
      }, 500);
    },
    [onUpdate]
  );

  // 清理定时器
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  // 名称变化
  const handleNameChange = (value: string) => {
    setName(value);
    saveChanges({ name: value });
  };

  // 指令变化
  const handlePromptChange = (value: string) => {
    setPrompt(value);
    saveChanges({ prompt: value });
  };

  // 描述变化
  const handleDescriptionChange = (value: string) => {
    setDescription(value);
    saveChanges({ description: value });
  };

  // 添加引用
  const handleAddReferences = (refs: Reference[]) => {
    // 转换为 ShortcutReference 格式
    const newRefs: ShortcutReference[] = refs.map((ref) => ({
      id: ref.id,
      summaryId: ref.summaryId!,
      summaryTitle: ref.summaryTitle || t('shortcutEditor.noTitle'),
      preview: ref.preview
    }));

    const updated = [...references, ...newRefs];
    setReferences(updated);
    saveChanges({ references: updated });
    setShowRefSelector(false);
  };

  // 移除引用
  const handleRemoveReference = (refId: string) => {
    const updated = references.filter((r) => r.id !== refId);
    setReferences(updated);
    saveChanges({ references: updated });
  };

  // 确认删除
  const handleConfirmDelete = () => {
    onDelete();
    setShowDeleteConfirm(false);
  };

  // 已有引用的 summaryId 列表
  const existingRefIds = references.map((r) => r.summaryId);

  return (
    <div className="flex flex-col h-full">
      {/* 顶部工具栏 */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-muted-foreground dark:text-slate-500" />
          <span className="text-base font-medium text-slate-700 dark:text-slate-200">
            {name || t('shortcutEditor.newShortcut')}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setShowDeleteConfirm(true)}
          title={t('shortcutEditor.deleteShortcut')}
          aria-label={t('shortcutEditor.deleteShortcut')}
        >
          <Trash2 data-icon="inline-start" />
        </Button>
      </header>

      {/* 编辑区域 */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* 名称 */}
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="shortcut-editor-name">
              {t('shortcutEditor.name')}
            </FieldLabel>
            <Input
              id="shortcut-editor-name"
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder={t('shortcutEditor.namePlaceholder')}
            />
          </Field>

          {/* 指令 */}
          <Field>
            <FieldLabel htmlFor="shortcut-editor-prompt">
              {t('shortcutEditor.prompt')}
            </FieldLabel>
            <div className="overflow-hidden rounded-lg border bg-background shadow-sm focus-within:ring-1 focus-within:ring-ring">
              {/* 已添加的引用 */}
              {references.length > 0 && (
                <div className="flex flex-wrap gap-1.5 border-b bg-muted/50 p-2">
                  {references.map((ref) => (
                    <Badge
                      key={ref.id}
                      variant="secondary"
                      className="gap-1 py-1 pr-1"
                    >
                      <span className="max-w-[120px] truncate">
                        {ref.summaryTitle}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveReference(ref.id)}
                        className="size-5 rounded-sm"
                        title={t('shortcutEditor.removeReference')}
                        aria-label={t('shortcutEditor.removeReference')}
                      >
                        <X data-icon="inline-start" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              )}

              {/* 输入框 */}
              <Textarea
                id="shortcut-editor-prompt"
                value={prompt}
                onChange={(e) => handlePromptChange(e.target.value)}
                placeholder={t('shortcutEditor.promptPlaceholder')}
                rows={30}
                className="min-h-[520px] resize-none rounded-none border-0 shadow-none focus-visible:ring-0"
              />

              {/* 底部工具栏 */}
              <div className="flex items-center border-t bg-background px-3 py-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowRefSelector(true)}
                  title={t('shortcutEditor.addReference')}
                  aria-label={t('shortcutEditor.addReference')}
                >
                  <Plus data-icon="inline-start" />
                </Button>
              </div>
            </div>
          </Field>

          {/* 描述 */}
          <Field>
            <div className="flex items-baseline justify-between gap-3">
              <FieldLabel htmlFor="shortcut-editor-description">
                {t('shortcutEditor.description')}
              </FieldLabel>
              <span className="text-xs text-muted-foreground">
                {description.length}/300
              </span>
            </div>
            <FieldDescription>
              {t('shortcutEditor.descriptionHint')}
            </FieldDescription>
            <Textarea
              id="shortcut-editor-description"
              value={description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              placeholder={t('shortcutEditor.descriptionPlaceholder')}
              rows={3}
              maxLength={300}
              className="resize-none"
            />
          </Field>
        </FieldGroup>
      </div>

      {/* 引用选择器 */}
      {showRefSelector && (
        <ReferenceSelector
          summaries={summaries}
          existingReferenceIds={existingRefIds}
          onConfirm={handleAddReferences}
          onCancel={() => setShowRefSelector(false)}
        />
      )}

      {/* 删除确认对话框 */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent
          className="w-[calc(100%-2rem)] max-w-sm rounded-xl"
          overlayClassName="bg-black/50"
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('shortcutEditor.confirmDelete')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('shortcutEditor.confirmDeleteMessage', { name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('shortcutEditor.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('shortcutEditor.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
