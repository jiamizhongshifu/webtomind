import type { Skill } from '@/services/workspace-api';
import {
  Trash2,
  Save,
  Plus,
  X,
  FileText,
  Code,
  Settings,
  Key
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
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
  FieldLabel,
  FieldLegend,
  FieldSet
} from '@/shared/ui/radix/field';
import { Input } from '@/shared/ui/radix/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/shared/ui/radix/popover';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/shared/ui/radix/select';
import { Switch } from '@/shared/ui/radix/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/radix/tabs';
import { Textarea } from '@/shared/ui/radix/textarea';
import { cn } from '@/lib/utils';
import { SkillReferencesTab } from './SkillReferencesTab';
import { SkillScriptsTab } from './SkillScriptsTab';

interface SkillEditorProps {
  skill: Skill;
  onUpdate: (updates: Partial<Skill>) => void;
  onDelete: () => void;
}

type TabType = 'settings' | 'references' | 'scripts';

const CATEGORIES = [
  { value: 'custom', label: '自定义' },
  { value: 'content', label: '内容处理' },
  { value: 'analysis', label: '分析总结' },
  { value: 'search', label: '搜索查询' },
  { value: 'export', label: '导出生成' }
];

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
  '💡'
];

/**
 * Skill 编辑器组件
 */
export function SkillEditor({ skill, onUpdate, onDelete }: SkillEditorProps) {
  const { t } = useTranslation('workspace');

  // Tab 状态
  const [activeTab, setActiveTab] = useState<TabType>('settings');

  // 本地编辑状态
  const [displayName, setDisplayName] = useState(skill.displayName);
  const [description, setDescription] = useState(skill.description || '');
  const [icon, setIcon] = useState(skill.icon);
  const [triggers, setTriggers] = useState<string[]>(skill.triggers);
  const [coreInstructions, setCoreInstructions] = useState(
    skill.coreInstructions
  );
  const [category, setCategory] = useState(skill.category);
  const [isActive, setIsActive] = useState(skill.isActive);
  const [defaultOptions, setDefaultOptions] = useState<Record<string, unknown>>(
    skill.defaultOptions || {}
  );
  const [newTrigger, setNewTrigger] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [newEnvKey, setNewEnvKey] = useState('');
  const [newEnvValue, setNewEnvValue] = useState('');

  // 当 skill 变化时重置状态
  useEffect(() => {
    setDisplayName(skill.displayName);
    setDescription(skill.description || '');
    setIcon(skill.icon);
    setTriggers(skill.triggers);
    setCoreInstructions(skill.coreInstructions);
    setCategory(skill.category);
    setIsActive(skill.isActive);
    setDefaultOptions(skill.defaultOptions || {});
    setHasChanges(false);
  }, [
    skill.id,
    skill.displayName,
    skill.description,
    skill.icon,
    skill.triggers,
    skill.coreInstructions,
    skill.category,
    skill.isActive,
    skill.defaultOptions
  ]);

  // 检测变化
  useEffect(() => {
    const changed =
      displayName !== skill.displayName ||
      description !== (skill.description || '') ||
      icon !== skill.icon ||
      JSON.stringify(triggers) !== JSON.stringify(skill.triggers) ||
      coreInstructions !== skill.coreInstructions ||
      category !== skill.category ||
      isActive !== skill.isActive ||
      JSON.stringify(defaultOptions) !==
        JSON.stringify(skill.defaultOptions || {});
    setHasChanges(changed);
  }, [
    displayName,
    description,
    icon,
    triggers,
    coreInstructions,
    category,
    isActive,
    defaultOptions,
    skill
  ]);

  // 保存
  const handleSave = useCallback(() => {
    onUpdate({
      displayName,
      description: description || null,
      icon,
      triggers,
      coreInstructions,
      defaultOptions,
      category,
      isActive
    });
    setHasChanges(false);
  }, [
    displayName,
    description,
    icon,
    triggers,
    coreInstructions,
    defaultOptions,
    category,
    isActive,
    onUpdate
  ]);

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

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as TabType)}
      className="flex min-h-0 flex-1 flex-col"
    >
      {/* 顶部工具栏 */}
      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3">
        <div className="flex min-w-0 flex-1 basis-full items-center gap-3 sm:basis-auto">
          {/* 图标选择 */}
          <Popover open={showIconPicker} onOpenChange={setShowIconPicker}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('skillEditor.iconPicker', '选择图标')}
                className="shrink-0 text-2xl"
              >
                {icon}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-2">
              <div className="grid grid-cols-6 gap-1">
                {ICONS.map((i) => (
                  <Button
                    key={i}
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t('skillEditor.selectIcon', '选择图标 {{icon}}', {
                      icon: i
                    })}
                    onClick={() => {
                      setIcon(i);
                      setShowIconPicker(false);
                    }}
                    className={cn(
                      'text-xl',
                      icon === i && 'bg-accent text-accent-foreground'
                    )}
                  >
                    {i}
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* 名称输入 */}
          <Input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            aria-label={t('skillEditor.name', 'Skill 名称')}
            className="h-10 min-w-0 border-0 bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
            placeholder={t('skillEditor.namePlaceholder', 'Skill 名称')}
          />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {/* 启用/禁用 */}
          <Field orientation="horizontal" className="w-auto gap-2">
            <Switch
              id="skill-editor-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
            <FieldLabel
              htmlFor="skill-editor-active"
              className="text-sm text-muted-foreground"
            >
              {t('skillEditor.enabled', '启用')}
            </FieldLabel>
          </Field>

          {/* 保存按钮 */}
          <Button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges}
            size="sm"
          >
            <Save data-icon="inline-start" />
            {t('skillEditor.save', '保存')}
          </Button>

          {/* 删除按钮 */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title={t('skillEditor.delete', '删除')}
            onClick={() => setShowDeleteConfirm(true)}
            aria-label={t('skillEditor.delete', '删除')}
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="border-b border-border px-6 py-2">
        <TabsList className="h-auto bg-transparent p-0">
          <TabsTrigger value="settings" className="gap-2">
            <Settings data-icon="inline-start" />
          {t('skillEditor.tabSettings', '基本设置')}
          </TabsTrigger>
          <TabsTrigger value="references" className="gap-2">
            <FileText data-icon="inline-start" />
          {t('skillEditor.tabReferences', '参考文档')}
          </TabsTrigger>
          <TabsTrigger value="scripts" className="gap-2">
            <Code data-icon="inline-start" />
          {t('skillEditor.tabScripts', '脚本')}
          </TabsTrigger>
        </TabsList>
      </div>

      {/* Tab 内容 */}
      <TabsContent
        value="settings"
        className="m-0 flex-1 overflow-y-auto p-6 data-[state=inactive]:hidden"
      >
        <FieldGroup className="gap-6">
          {/* 描述 */}
          <Field>
            <FieldLabel htmlFor="skill-editor-description">
              {t('skillEditor.description', '描述')}
            </FieldLabel>
            <Input
              id="skill-editor-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t(
                'skillEditor.descriptionPlaceholder',
                '简短描述这个 Skill 的功能'
              )}
            />
          </Field>

          {/* 触发词 */}
          <Field>
            <FieldLabel>{t('skillEditor.triggers', '触发词')}</FieldLabel>
            {triggers.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {triggers.map((trigger) => (
                  <Badge
                    key={trigger}
                    variant="secondary"
                    className="gap-1 pr-1"
                  >
                    {trigger}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title={t('skillEditor.removeTrigger', '删除触发词')}
                      aria-label={t(
                        'skillEditor.removeTriggerNamed',
                        '删除触发词 {{trigger}}',
                        { trigger }
                      )}
                      onClick={() => handleRemoveTrigger(trigger)}
                      className="size-5"
                    >
                      <X />
                    </Button>
                  </Badge>
                ))}
              </div>
            ) : null}
            <div className="flex gap-2">
              <Input
                type="text"
                value={newTrigger}
                onChange={(e) => setNewTrigger(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTrigger()}
                className="flex-1"
                placeholder={t(
                  'skillEditor.triggerPlaceholder',
                  '输入触发词，按回车添加'
                )}
              />
              <Button
                type="button"
                title={t('skillEditor.addTrigger', '添加触发词')}
                onClick={handleAddTrigger}
                variant="outline"
                size="icon"
              >
                <Plus />
              </Button>
            </div>
            <FieldDescription>
              {t(
                'skillEditor.triggerHint',
                '当用户输入包含这些词时，会自动激活此 Skill'
              )}
            </FieldDescription>
          </Field>

          {/* 分类 */}
          <Field>
            <FieldLabel htmlFor="skill-editor-category">
              {t('skillEditor.category', '分类')}
            </FieldLabel>
            <Select
              value={category}
              onValueChange={setCategory}
            >
              <SelectTrigger id="skill-editor-category">
                <SelectValue placeholder={t('skillEditor.category', '分类')} />
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

          {/* 环境变量配置 */}
          <FieldSet className="gap-3">
            <FieldLegend
              variant="label"
              className="mb-0 flex items-center gap-1.5"
            >
              <Key data-icon="inline-start" />
              {t('skillEditor.envVars', '环境变量')}
            </FieldLegend>
            <FieldDescription>
              {t(
                'skillEditor.envVarsHint',
                '配置此 Skill 运行时所需的密钥或参数，AI 调用工具时会自动注入'
              )}
            </FieldDescription>

            {/* 已有变量列表 */}
            {Object.keys(defaultOptions).length > 0 && (
              <div className="flex flex-col gap-2">
                {Object.entries(defaultOptions).map(([key, value]) => (
                  <div
                    key={key}
                    className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-center"
                  >
                    <Field className="min-w-0">
                      <Input
                        type="text"
                        value={key}
                        readOnly
                        title={key}
                        aria-label={t('skillEditor.envKey', '变量名')}
                        className="font-mono text-muted-foreground"
                      />
                    </Field>
                    <Field className="min-w-0">
                      <Input
                        type={
                          key.toLowerCase().includes('secret') ||
                          key.toLowerCase().includes('password') ||
                          key.toLowerCase().includes('token')
                            ? 'password'
                            : 'text'
                        }
                        value={String(value ?? '')}
                        aria-label={t(
                          'skillEditor.envValueFor',
                          '{{key}} 的值',
                          { key }
                        )}
                        onChange={(e) => {
                          setDefaultOptions({
                            ...defaultOptions,
                            [key]: e.target.value
                          });
                        }}
                        className="font-mono"
                        placeholder={t(
                          'skillEditor.envValuePlaceholder',
                          '输入值'
                        )}
                      />
                    </Field>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title={t('skillEditor.removeEnvVar', '删除变量')}
                      aria-label={t(
                        'skillEditor.removeEnvVarNamed',
                        '删除变量 {{key}}',
                        { key }
                      )}
                      onClick={() => {
                        const updated = { ...defaultOptions };
                        delete updated[key];
                        setDefaultOptions(updated);
                      }}
                      className="justify-self-end sm:justify-self-auto"
                    >
                      <X />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* 添加新变量 */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-center">
              <Input
                type="text"
                value={newEnvKey}
                onChange={(e) => setNewEnvKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newEnvKey.trim()) {
                    setDefaultOptions({
                      ...defaultOptions,
                      [newEnvKey.trim()]: newEnvValue
                    });
                    setNewEnvKey('');
                    setNewEnvValue('');
                  }
                }}
                aria-label={t('skillEditor.envKeyPlaceholder', '变量名')}
                className="font-mono"
                placeholder={t('skillEditor.envKeyPlaceholder', '变量名')}
              />
              <Input
                type="text"
                value={newEnvValue}
                onChange={(e) => setNewEnvValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newEnvKey.trim()) {
                    setDefaultOptions({
                      ...defaultOptions,
                      [newEnvKey.trim()]: newEnvValue
                    });
                    setNewEnvKey('');
                    setNewEnvValue('');
                  }
                }}
                aria-label={t('skillEditor.envValuePlaceholder', '输入值')}
                className="font-mono"
                placeholder={t('skillEditor.envValuePlaceholder', '输入值')}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                title={t('skillEditor.addEnvVar', '添加变量')}
                aria-label={t('skillEditor.addEnvVar', '添加变量')}
                onClick={() => {
                  if (newEnvKey.trim()) {
                    setDefaultOptions({
                      ...defaultOptions,
                      [newEnvKey.trim()]: newEnvValue
                    });
                    setNewEnvKey('');
                    setNewEnvValue('');
                  }
                }}
                className="justify-self-end sm:justify-self-auto"
              >
                <Plus />
              </Button>
            </div>
          </FieldSet>

          {/* 核心指令 */}
          <Field>
            <FieldLabel htmlFor="skill-editor-core-instructions">
              {t('skillEditor.coreInstructions', '核心指令')}
            </FieldLabel>
            <Textarea
              id="skill-editor-core-instructions"
              value={coreInstructions}
              onChange={(e) => setCoreInstructions(e.target.value)}
              rows={15}
              className="resize-none font-mono"
              placeholder={t(
                'skillEditor.instructionsPlaceholder',
                '在这里编写 Skill 的核心指令（支持 Markdown）...'
              )}
            />
            <FieldDescription>
              {t(
                'skillEditor.instructionsHint',
                '这些指令会在 Skill 激活时添加到 AI 的系统提示中'
              )}
            </FieldDescription>
          </Field>
        </FieldGroup>
      </TabsContent>

      {/* 参考文档 Tab */}
      <TabsContent
        value="references"
        className="m-0 flex-1 overflow-y-auto p-6 data-[state=inactive]:hidden"
      >
        <SkillReferencesTab skillId={skill.id} />
      </TabsContent>

      {/* 脚本 Tab */}
      <TabsContent
        value="scripts"
        className="m-0 flex-1 overflow-y-auto p-6 data-[state=inactive]:hidden"
      >
        <SkillScriptsTab skillId={skill.id} />
      </TabsContent>

      {/* 删除确认弹窗 */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('skillEditor.deleteConfirmTitle', '确认删除')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'skillEditor.deleteConfirmMessage',
                '确定要删除这个 Skill 吗？此操作无法撤销。'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t('skillEditor.cancel', '取消')}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                onDelete();
                setShowDeleteConfirm(false);
              }}
            >
              {t('skillEditor.delete', '删除')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Tabs>
  );
}
