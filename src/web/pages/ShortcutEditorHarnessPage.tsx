import { useState } from 'react';
import { ShortcutEditor } from '@/workspace/components/ShortcutEditor';
import type { SavedSummary, Shortcut } from '@/services/database';

const shortcut: Shortcut = {
  id: 'shortcut-harness',
  name: '研究材料整理',
  prompt:
    '请把输入材料整理为：核心观点、关键证据、可执行后续动作。输出要短，先给结论。',
  description: '适合处理长文档和会议纪要。',
  references: [
    {
      id: 'ref-1',
      summaryId: 'summary-1',
      summaryTitle: '增长实验记录',
      preview: '实验假设'
    }
  ],
  createdAt: Date.now() - 3600,
  updatedAt: Date.now(),
  order: 1
};

const summaries: SavedSummary[] = [
  {
    id: 'summary-1',
    title: '增长实验记录',
    url: 'https://example.com/growth',
    markdown: '# 增长实验记录\n\n渠道假设与复盘结论。',
    createdAt: Date.now() - 86400
  },
  {
    id: 'summary-2',
    title: '访谈纪要',
    url: 'note://local',
    markdown: '# 访谈纪要\n\n用户需要更短的摘要。',
    createdAt: Date.now()
  }
];

export function ShortcutEditorHarnessPage() {
  const [status, setStatus] = useState('ready');
  const [visible, setVisible] = useState(true);

  return (
    <main
      data-harness="shortcut-editor"
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
          Shortcut Editor
        </h1>
        <p style={{ margin: 0, color: '#666', fontSize: 13 }}>
          Status: <span data-testid="harness-status">{status}</span>
        </p>
      </div>

      <section
        style={{
          height: 'calc(100vh - 112px)',
          maxWidth: 920,
          margin: '0 auto',
          background: '#fff',
          border: '1px solid #e5e7eb'
        }}
      >
        {visible ? (
          <ShortcutEditor
            shortcut={shortcut}
            summaries={summaries}
            onUpdate={(updates) =>
              setStatus(`updated:${Object.keys(updates).join(',')}`)
            }
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
