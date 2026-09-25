import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createLogger } from '@/utils/logger';
import { X, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/radix/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/shared/ui/radix/dialog';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel
} from '@/shared/ui/radix/field';
import { Input } from '@/shared/ui/radix/input';
import { Textarea } from '@/shared/ui/radix/textarea';
import { cn } from '@/lib/utils';
import type { Project } from '@/services/workspace-api';

const log = createLogger('ProjectEditModal');

// 预设图标（使用 emoji）
const PRESET_ICONS = [
  '🎯',
  '📦',
  '🖼️',
  '🎙️',
  '📊',
  '🎬',
  '📚',
  '🔗',
  '☁️',
  '⛵',
  '📋',
  '✏️',
  '🏛️',
  '🤖',
  '💬',
  '📝',
  '⏰',
  '📍',
  '🔔',
  '🔧',
  '🔑',
  '🔒',
  '💻',
  '🖥️',
  '⚡',
  '✈️',
  '🚩',
  '📌',
  '💾',
  '💻',
  '▶️',
  '📅',
  '✉️',
  '📁',
  '🎓',
  '🏦',
  '🖊️',
  '🎵',
  '🚌',
  '📍',
  '✖️',
  '🚗',
  '🚢',
  '🏋️',
  '🎁',
  '🎄',
  '🔭',
  '💰',
  '🐴',
  '🧘',
  '🚴',
  '🍴',
  '☕',
  '🍷',
  '🧃',
  '🐾',
  '🔗',
  '📷',
  '⚙️',
  '💡'
];

interface ProjectEditModalProps {
  project: Project;
  onClose: () => void;
  onSave: (data: {
    name: string;
    icon: string;
    instructions: string;
  }) => Promise<void>;
}

const INSTRUCTIONS_MAX_LENGTH = 8000;

export function ProjectEditModal({
  project,
  onClose,
  onSave
}: ProjectEditModalProps) {
  const { t } = useTranslation('boards');
  const [name, setName] = useState(project.name);
  const [icon, setIcon] = useState(project.icon || '📁');
  const [instructions, setInstructions] = useState(project.instructions || '');
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        icon,
        instructions: instructions.trim()
      });
      onClose();
    } catch (error) {
      log.error('[ProjectEditModal] Save failed:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="project-edit-modal flex w-[calc(100%-2rem)] max-w-xl max-h-[90vh] flex-col gap-0 overflow-hidden rounded-3xl p-0"
        overlayClassName="bg-slate-900/20 backdrop-blur-sm dark:bg-slate-900/60"
        showCloseButton={false}
      >
        <DialogHeader className="border-b px-8 pb-4 pt-8 text-left">
          <div className="flex items-center justify-between gap-3">
            <div>
              <DialogTitle className="text-xl font-bold">
                {t('boards.editProject')}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {t(
                  'boards.projectSettings.editProjectDescription',
                  '编辑项目名称、图标、指令和记忆设置。'
                )}
              </DialogDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label={t('boards.close', '关闭')}
            >
              <X data-icon="inline-start" />
            </Button>
          </div>
        </DialogHeader>

        {/* 内容 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
          {/* 项目名称输入 */}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="project-edit-name">
                {t('boards.fields.name', '项目名称')}
              </FieldLabel>
              <Input
                id="project-edit-name"
                type="text"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                placeholder={t('boards.fields.placeholder')}
                className="h-12 rounded-2xl border-slate-500 bg-muted/50 px-5 text-base font-medium placeholder:text-slate-600 placeholder:opacity-100 dark:border-slate-400/90 dark:placeholder:text-slate-400"
              />
            </Field>

            {/* 图标选择区域 */}
            <Field className="relative">
              <FieldLabel>{t('boards.fields.icon')}</FieldLabel>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowIconPicker(!showIconPicker)}
                className="h-auto w-full justify-between rounded-2xl px-5 py-4"
                aria-expanded={showIconPicker}
              >
                <span className="text-sm font-medium">
                  {t('boards.fields.icon')}
                </span>
                <span className="flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-lg">
                    {icon}
                  </span>
                  <ChevronDown
                    data-icon="inline-end"
                    className={cn(
                      'transition-transform',
                      showIconPicker && 'rotate-180'
                    )}
                  />
                </span>
              </Button>

              {/* 图标选择器面板 */}
              {showIconPicker && (
                <div className="absolute left-0 right-0 top-full mt-2 rounded-2xl border bg-background p-4 shadow-xl">
                  {/* 图标选择 */}
                  <div className="grid max-h-64 grid-cols-8 gap-1.5 overflow-y-auto custom-scrollbar">
                    {PRESET_ICONS.map((emoji, idx) => (
                      <Button
                        key={`${emoji}-${idx}`}
                        type="button"
                        variant={icon === emoji ? 'secondary' : 'ghost'}
                        size="icon"
                        onClick={() => setIcon(emoji)}
                        className={cn(
                          'size-9 rounded-lg text-lg',
                          icon === emoji && 'ring-2 ring-ring'
                        )}
                        aria-label={emoji}
                      >
                        {emoji}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </Field>

            {/* 指令 (ChatGPT-style project instructions) */}
            <Field>
              <div className="flex items-baseline justify-between gap-3">
                <FieldLabel htmlFor="project-edit-instructions">
                  {t('boards.projectSettings.instructionsLabel', '指令')}
                </FieldLabel>
                <span className="text-xs text-muted-foreground">
                  {instructions.length} / {INSTRUCTIONS_MAX_LENGTH}
                </span>
              </div>
              <FieldDescription className="text-xs">
                {t(
                  'boards.projectSettings.instructionsHint',
                  '设置此项目的背景信息并自定义 Agent 的回复方式。'
                )}
              </FieldDescription>
              <Textarea
                id="project-edit-instructions"
                value={instructions}
                onChange={(e) =>
                  setInstructions(
                    e.target.value.slice(0, INSTRUCTIONS_MAX_LENGTH)
                  )
                }
                placeholder={
                  '# 项目背景\n# 角色定位\n# 输出风格\n\n例如:你是一名严谨的产品分析师,先给结论再给依据。'
                }
                rows={8}
                className="rounded-2xl border-slate-500 bg-muted/50 font-mono leading-relaxed placeholder:text-slate-600 placeholder:opacity-100 dark:border-slate-400/90 dark:placeholder:text-slate-400"
              />
            </Field>

            {/* 记忆(占位,不可改) */}
            <Field data-disabled>
              <FieldLabel htmlFor="project-edit-memory">
                {t('boards.projectSettings.memoryLabel', '记忆')}
              </FieldLabel>
              <Input
                id="project-edit-memory"
                type="text"
                disabled
                value={
                  t('boards.projectSettings.memoryDefault', '默认') as string
                }
                className="h-12 rounded-2xl border-slate-500 bg-muted/60 dark:border-slate-400/90"
              />
              <FieldDescription className="text-xs">
                {t(
                  'boards.projectSettings.memoryHint',
                  '该项目可以访问外部聊天的记忆,反之亦然。此设置无法更改。'
                )}
              </FieldDescription>
            </Field>
          </FieldGroup>
        </div>

        <DialogFooter className="border-t px-8 py-5 sm:space-x-0">
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            size="lg"
            className="w-full min-w-28 rounded-2xl bg-[var(--product-action-bg)] font-bold text-[var(--product-action-text)] hover:bg-[var(--product-action-hover)] sm:w-auto"
          >
            {saving ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : null}
            {saving ? t('boards.saving', '保存中') : t('boards.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
