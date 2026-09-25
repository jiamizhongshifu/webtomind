import { useState } from 'react';
import {
  SkillCreateConfirmDialog,
  type SkillCreatePreview
} from '@/workspace/components/SkillCreateConfirmDialog';

const preview: SkillCreatePreview = {
  name: 'summarize_research_note',
  displayName: '研究笔记总结',
  description: '把长篇资料整理成结构化摘要。',
  icon: '🧠',
  triggers: ['总结笔记', '整理资料'],
  coreInstructions:
    '请提取资料中的核心观点、关键证据和后续行动，输出为清晰的分节摘要。',
  outputType: 'summary',
  category: 'analysis'
};

export function SkillCreateConfirmDialogHarnessPage() {
  const [open, setOpen] = useState(true);
  const [status, setStatus] = useState('ready');

  return (
    <main
      data-harness="skill-create-confirm-dialog"
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
          Skill Create Confirm Dialog
        </h1>
        <p style={{ margin: 0, color: '#666', fontSize: 13 }}>
          Status: <span data-testid="harness-status">{status}</span>
        </p>
        <button
          type="button"
          style={{
            marginTop: 16,
            minHeight: 38,
            border: '1px solid #ddd',
            borderRadius: 8,
            padding: '0 14px',
            background: '#fff'
          }}
          onClick={() => {
            setStatus('ready');
            setOpen(true);
          }}
        >
          Reopen dialog
        </button>
      </div>

      <SkillCreateConfirmDialog
        preview={preview}
        visible={open}
        onCancel={() => {
          setOpen(false);
          setStatus('closed');
        }}
        onConfirm={async (skill) => {
          setStatus(`created:${skill.name}`);
          setOpen(false);
        }}
      />
    </main>
  );
}
