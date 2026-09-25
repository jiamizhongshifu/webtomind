import { useState } from 'react';
import { ProjectEditModal } from '@/workspace/components/ProjectEditModal';
import type { Project } from '@/services/workspace-api';

const project: Project = {
  id: 'project-edit-harness',
  name: '季度增长复盘',
  description: null,
  icon: '📊',
  color: '#0f172a',
  isDefault: false,
  sortOrder: 1,
  summaryCount: 12,
  conversationCount: 4,
  createdAt: Date.now() - 86400,
  updatedAt: Date.now(),
  archivedAt: null,
  favoritedAt: null,
  instructions:
    '# 项目背景\n追踪增长实验、渠道假设和复盘结论。\n\n# 输出风格\n先给结论，再列证据和后续动作。'
};

export function ProjectEditModalHarnessPage() {
  const [open, setOpen] = useState(true);
  const [status, setStatus] = useState('ready');

  return (
    <main
      data-harness="project-edit-modal"
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
          Project Edit Modal
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
          Reopen modal
        </button>
      </div>

      {open ? (
        <ProjectEditModal
          project={project}
          onClose={() => {
            setOpen(false);
          }}
          onSave={async (data) => {
            setStatus(`saved:${data.name}:${data.icon}`);
          }}
        />
      ) : null}
    </main>
  );
}
