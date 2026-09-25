import { useState } from 'react';
import { Button } from '@/shared/ui/radix/button';
import {
  SkillConfigDialog,
  type SkillConfigSchema,
  type SkillExecutionConfig
} from '@/workspace/components/SkillConfigDialog';
import type { SkillCatalogItem } from '@/workspace/utils/skill-catalog';

const configSchema: SkillConfigSchema = {
  formats: [
    {
      key: 'brief',
      label: '简报',
      description: '输出短而清晰的内容草稿。'
    },
    {
      key: 'detailed',
      label: '详版',
      description: '展开背景、结构和行动建议。'
    }
  ],
  params: [
    {
      key: 'language',
      label: '输出语言',
      type: 'select',
      defaultValue: 'zh-CN',
      options: [
        { value: 'zh-CN', label: '简体中文' },
        { value: 'en-US', label: 'English' }
      ]
    },
    {
      key: 'tone',
      label: '语气',
      type: 'radio',
      defaultValue: 'professional',
      options: [
        { value: 'professional', label: '专业', description: '清晰克制' },
        { value: 'warm', label: '温暖', description: '更有人味' }
      ]
    },
    {
      key: 'depth',
      label: '分析深度',
      type: 'range',
      defaultValue: 3,
      min: 1,
      max: 5,
      step: 1
    },
    {
      key: 'enabled',
      label: '启用参考材料',
      type: 'toggle',
      defaultValue: true,
      description: '关闭后只使用当前输入。'
    },
    {
      key: 'layout',
      label: '视觉布局',
      type: 'visual-picker',
      defaultValue: 'cards',
      options: [
        { value: 'cards', label: '卡片', icon: '▦' },
        { value: 'memo', label: '备忘录', icon: '✦' },
        { value: 'outline', label: '大纲', icon: '☰' }
      ]
    },
    {
      key: 'audience',
      label: '目标读者',
      type: 'text',
      defaultValue: '内容创作者'
    },
    {
      key: 'notes',
      label: '补充说明',
      type: 'textarea',
      defaultValue: '请优先给出可以直接使用的结构。'
    }
  ],
  supportsCustomPrompt: true,
  customPromptPlaceholder: '补充语气、受众、限制或输出偏好...',
  customPromptExamples: [
    '用更适合小红书的表达方式',
    '保留专业术语，但解释得更清楚'
  ]
};

const skill: SkillCatalogItem = {
  id: 'skill-config-harness',
  source: 'user',
  originType: 'user',
  name: 'content_draft',
  displayName: '内容草稿生成',
  description: '配置参数后生成一版可编辑的内容草稿。',
  icon: '✨',
  category: 'writing',
  runtimeCategory: 'writing',
  triggers: [],
  priority: 0,
  isActive: true,
  isInstalled: true,
  skill: {
    defaultOptions: {
      _configSchema: configSchema
    }
  } as unknown as SkillCatalogItem['skill']
};

export function SkillConfigDialogHarnessPage() {
  const [open, setOpen] = useState(true);
  const [status, setStatus] = useState('ready');

  const handleExecute = async (config: SkillExecutionConfig) => {
    setStatus(`executed:${config.format || 'none'}`);
    setOpen(false);
  };

  return (
    <main
      data-harness="skill-config-dialog"
      style={{
        minHeight: '100vh',
        background: '#f8fafc',
        color: '#141414',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
      }}
    >
      <div style={{ padding: 24 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 800 }}>
          ISOLATED PREVIEW HARNESS
        </p>
        <h1 style={{ margin: '8px 0 4px', fontSize: 22 }}>
          Skill Config Dialog
        </h1>
        <p style={{ margin: 0, color: '#666', fontSize: 13 }}>
          Status: <span data-testid="harness-status">{status}</span>
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          onClick={() => {
            setStatus('ready');
            setOpen(true);
          }}
        >
          Reopen dialog
        </Button>
      </div>

      <SkillConfigDialog
        skill={skill}
        isOpen={open}
        onClose={() => {
          setOpen(false);
          setStatus('closed');
        }}
        onExecute={handleExecute}
      />
    </main>
  );
}
