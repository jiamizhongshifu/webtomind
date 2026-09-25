/**
 * Skill 创建确认对话框
 * 显示 Agent 提取的 Skill 信息，允许用户预览、编辑和确认创建
 */

import { X, Plus, Check, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/shared/ui/radix/alert';
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
  FieldGroup,
  FieldLabel
} from '@/shared/ui/radix/field';
import { Input } from '@/shared/ui/radix/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/shared/ui/radix/select';
import { Textarea } from '@/shared/ui/radix/textarea';

// Skill 预览数据接口
export interface SkillCreatePreview {
  name: string;
  displayName: string;
  description?: string;
  icon: string;
  triggers: string[];
  coreInstructions: string;
  outputType?: string;
  category: string;
}

interface SkillCreateConfirmDialogProps {
  preview: SkillCreatePreview;
  visible: boolean;
  onConfirm: (skill: SkillCreatePreview) => Promise<void>;
  onCancel: () => void;
}

// 输出类型选项
const OUTPUT_TYPES = [
  { value: '', label: '无' },
  { value: 'flashcards', label: '闪卡' },
  { value: 'mindmap', label: '思维导图' },
  { value: 'quiz', label: '测验' },
  { value: 'report', label: '报告' },
  { value: 'summary', label: '摘要' }
];

// 分类选项
const CATEGORIES = [
  { value: 'custom', label: '自定义' },
  { value: 'content', label: '内容处理' },
  { value: 'analysis', label: '分析总结' },
  { value: 'search', label: '搜索查询' },
  { value: 'export', label: '导出生成' }
];

// 图标选项
const ICONS = [
  '🔧',
  '💻',
  '📚',
  '🎬',
  '📝',
  '📋',
  '🧠',
  '✨',
  '🎯',
  '📊',
  '🔍',
  '💡',
  '🌐',
  '📖',
  '🎨',
  '⚡'
];

/**
 * Skill 创建确认对话框组件
 */
export function SkillCreateConfirmDialog({
  preview,
  visible,
  onConfirm,
  onCancel
}: SkillCreateConfirmDialogProps) {
  const { t } = useTranslation('workspace');

  // 本地编辑状态
  const [name, setName] = useState(preview.name);
  const [displayName, setDisplayName] = useState(preview.displayName);
  const [description, setDescription] = useState(preview.description || '');
  const [icon, setIcon] = useState(preview.icon);
  const [triggers, setTriggers] = useState<string[]>(preview.triggers);
  const [coreInstructions, setCoreInstructions] = useState(
    preview.coreInstructions
  );
  const [outputType, setOutputType] = useState(preview.outputType || '');
  const [category, setCategory] = useState(preview.category);

  // UI 状态
  const [newTrigger, setNewTrigger] = useState('');
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 当 preview 变化时重置状态
  useEffect(() => {
    setName(preview.name);
    setDisplayName(preview.displayName);
    setDescription(preview.description || '');
    setIcon(preview.icon);
    setTriggers(preview.triggers);
    setCoreInstructions(preview.coreInstructions);
    setOutputType(preview.outputType || '');
    setCategory(preview.category);
    setError(null);
  }, [preview]);

  // 添加触发词
  const handleAddTrigger = () => {
    const trimmed = newTrigger.trim();
    if (trimmed && !triggers.includes(trimmed)) {
      setTriggers([...triggers, trimmed]);
      setNewTrigger('');
    }
  };

  // 删除触发词
  const handleRemoveTrigger = (trigger: string) => {
    setTriggers(triggers.filter((t) => t !== trigger));
  };

  // 确认创建
  const handleConfirm = async () => {
    // 验证必填字段
    if (!name.trim()) {
      setError('请输入 Skill 标识符');
      return;
    }
    if (!displayName.trim()) {
      setError('请输入 Skill 名称');
      return;
    }
    if (triggers.length === 0) {
      setError('请至少添加一个触发词');
      return;
    }
    if (!coreInstructions.trim()) {
      setError('请输入核心指令');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await onConfirm({
        name: name.trim(),
        displayName: displayName.trim(),
        description: description.trim() || undefined,
        icon,
        triggers,
        coreInstructions: coreInstructions.trim(),
        outputType: outputType || undefined,
        category
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setIsLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <Dialog open={visible} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent
        className="w-[calc(100%-2rem)] max-w-2xl max-h-[90vh] gap-0 overflow-hidden rounded-xl p-0"
        overlayClassName="bg-black/50"
        showCloseButton={false}
      >
        <DialogHeader className="border-b px-6 py-4 text-left">
          <div className="flex items-center justify-between gap-3">
            <div>
              <DialogTitle>
                {t('skillCreate.title', '确认创建 Skill')}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {t(
                  'skillCreate.descriptionDialog',
                  '预览、编辑并确认创建新的 Skill。'
                )}
              </DialogDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onCancel}
              aria-label={t('skillCreate.close', '关闭')}
            >
              <X />
            </Button>
          </div>
        </DialogHeader>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* 错误提示 */}
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <FieldGroup>
            {/* 图标和名称 */}
            <div className="flex items-start gap-4">
              {/* 图标选择 */}
              <div className="relative">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowIconPicker(!showIconPicker)}
                  className="size-14 text-3xl"
                  aria-label={t('skillCreate.icon', '图标')}
                >
                  {icon}
                </Button>
                {showIconPicker && (
                  <div className="absolute left-0 top-full z-10 mt-1 grid grid-cols-8 gap-1 rounded-xl border bg-background p-2 shadow-lg">
                    {ICONS.map((i) => (
                      <Button
                        key={i}
                        type="button"
                        variant={icon === i ? 'secondary' : 'ghost'}
                        size="icon"
                        onClick={() => {
                          setIcon(i);
                          setShowIconPicker(false);
                        }}
                        className="size-8 text-xl"
                        aria-label={i}
                      >
                        {i}
                      </Button>
                    ))}
                  </div>
                )}
              </div>

              {/* 名称输入 */}
              <div className="flex-1">
                <FieldGroup className="gap-3">
                  <Field>
                    <FieldLabel htmlFor="skill-create-display-name">
                      {t('skillCreate.displayName', '显示名称')} *
                    </FieldLabel>
                    <Input
                      id="skill-create-display-name"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={t(
                        'skillCreate.displayNamePlaceholder',
                        '如：翻译成英文'
                      )}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="skill-create-name">
                      {t('skillCreate.name', '标识符')} *
                    </FieldLabel>
                    <Input
                      id="skill-create-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="font-mono"
                      placeholder={t(
                        'skillCreate.namePlaceholder',
                        '如：translate_to_english'
                      )}
                    />
                  </Field>
                </FieldGroup>
              </div>
            </div>

            {/* 描述 */}
            <Field>
              <FieldLabel htmlFor="skill-create-description">
                {t('skillCreate.description', '描述')}
              </FieldLabel>
              <Input
                id="skill-create-description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t(
                  'skillCreate.descriptionPlaceholder',
                  '简短描述这个 Skill 的功能'
                )}
              />
            </Field>

            {/* 触发词 */}
            <Field>
              <FieldLabel htmlFor="skill-create-trigger">
                {t('skillCreate.triggers', '触发词')} *
              </FieldLabel>
              <div className="flex flex-wrap gap-2">
                {triggers.map((trigger) => (
                  <span
                    key={trigger}
                    className="inline-flex items-center gap-1 rounded-lg bg-secondary px-2 py-1 text-sm text-secondary-foreground"
                  >
                    {trigger}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveTrigger(trigger)}
                      className="size-5"
                      aria-label={t('skillCreate.removeTrigger', '删除触发词')}
                    >
                      <X />
                    </Button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  id="skill-create-trigger"
                  type="text"
                  value={newTrigger}
                  onChange={(e) => setNewTrigger(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTrigger()}
                  placeholder={t(
                    'skillCreate.triggerPlaceholder',
                    '输入触发词，按回车添加'
                  )}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={handleAddTrigger}
                  aria-label={t('skillCreate.addTrigger', '添加触发词')}
                >
                  <Plus />
                </Button>
              </div>
            </Field>

            {/* 分类和输出类型 */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>{t('skillCreate.category', '分类')}</FieldLabel>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>{t('skillCreate.outputType', '输出类型')}</FieldLabel>
                <Select
                  value={outputType || 'none'}
                  onValueChange={(value) =>
                    setOutputType(value === 'none' ? '' : value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {OUTPUT_TYPES.map((type) => (
                        <SelectItem
                          key={type.value || 'none'}
                          value={type.value || 'none'}
                        >
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {/* 核心指令 */}
            <Field>
              <FieldLabel htmlFor="skill-create-core-instructions">
                {t('skillCreate.coreInstructions', '核心指令')} *
              </FieldLabel>
              <Textarea
                id="skill-create-core-instructions"
                value={coreInstructions}
                onChange={(e) => setCoreInstructions(e.target.value)}
                rows={6}
                className="resize-none"
                placeholder={t(
                  'skillCreate.instructionsPlaceholder',
                  '描述 AI 应该如何执行这个任务...'
                )}
              />
            </Field>
          </FieldGroup>
        </div>

        {/* 底部按钮 */}
        <DialogFooter className="border-t px-6 py-4 sm:gap-3 sm:space-x-0">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={isLoading}
          >
            {t('skillCreate.cancel', '取消')}
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="animate-spin" data-icon="inline-start" />
                {t('skillCreate.creating', '创建中...')}
              </>
            ) : (
              <>
                <Check data-icon="inline-start" />
                {t('skillCreate.confirm', '确认创建')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
