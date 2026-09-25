import { useState } from 'react';
import { SkillEditor } from '@/workspace/components/SkillEditor';
import type { Skill } from '@/services/workspace-api';

const initialSkill: Skill = {
  id: 'skill-editor-harness',
  source: 'user',
  name: 'research_synthesizer',
  displayName: '研究材料整理',
  description: '把长材料压缩成可执行的洞察备忘录。',
  icon: '🧠',
  triggers: ['研究', '总结', '洞察'],
  coreInstructions:
    '你是一个严谨的研究助手。先给结论，再列证据，最后输出下一步行动。遇到不确定信息时明确标注假设。',
  outputType: 'markdown',
  associatedTools: [],
  defaultOptions: {
    tone: 'concise',
    api_token: 'sk-test-redacted'
  },
  category: 'analysis',
  priority: 10,
  sortOrder: 1,
  isActive: true,
  useCount: 7,
  createdAt: Date.now() - 86400,
  updatedAt: Date.now(),
  metadata: {}
};

export function SkillEditorHarnessPage() {
  const [skill, setSkill] = useState<Skill>(initialSkill);
  const [status, setStatus] = useState('ready');
  const [visible, setVisible] = useState(true);

  return (
    <main
      data-harness="skill-editor"
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
          Skill Editor
        </h1>
        <p style={{ margin: 0, color: '#666', fontSize: 13 }}>
          Status: <span data-testid="harness-status">{status}</span>
        </p>
      </div>

      <section
        style={{
          height: 'calc(100vh - 112px)',
          maxWidth: 980,
          margin: '0 auto',
          background: '#fff',
          border: '1px solid #e5e7eb'
        }}
      >
        {visible ? (
          <SkillEditor
            skill={skill}
            onUpdate={(updates) => {
              setSkill((current) => ({ ...current, ...updates }));
              setStatus(`updated:${Object.keys(updates).join(',')}`);
            }}
            onDelete={() => {
              setVisible(false);
              setStatus('deleted');
            }}
          />
        ) : null}
      </section>
    </main>
  );
}
