import { useState } from 'react';
import type { Project } from '@/services/workspace-api';
import { HistoryAddToProjectModal } from '../components/image-create/HistoryAddToProjectModal';
import '../styles/image-create.css';

const projects: Project[] = [
  {
    id: 'project-campaign',
    name: 'Summer launch campaign',
    description: null,
    icon: 'S',
    color: '#f7f7f7',
    isDefault: false,
    sortOrder: 1,
    summaryCount: 18,
    conversationCount: 0,
    createdAt: 1,
    updatedAt: 1,
    archivedAt: null,
    favoritedAt: null
  },
  {
    id: 'project-brand',
    name: 'Brand key visual archive',
    description: null,
    icon: '',
    color: '#f7f7f7',
    isDefault: false,
    sortOrder: 2,
    summaryCount: 6,
    conversationCount: 0,
    createdAt: 1,
    updatedAt: 1,
    archivedAt: null,
    favoritedAt: null
  }
];

export function HistoryAddToProjectModalHarnessPage() {
  const [open, setOpen] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [status, setStatus] = useState('ready');

  const saveProject = (project: Project) => {
    setSavingId(project.id);
    setStatus(`saving:${project.id}`);
    window.setTimeout(() => {
      setSavingId(null);
      setStatus(`saved:${project.id}`);
    }, 700);
  };

  return (
    <main data-harness="history-add-to-project-modal" style={{ minHeight: '100vh' }}>
      <div
        style={{
          padding: 24,
          color: '#141414',
          fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
        }}
      >
        <p style={{ margin: 0, fontSize: 12, fontWeight: 800 }}>
          ISOLATED PREVIEW HARNESS
        </p>
        <h1 style={{ margin: '8px 0 4px', fontSize: 22 }}>
          History Add To Project Modal
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
          onClick={() => setOpen(true)}
        >
          Reopen modal
        </button>
      </div>
      <HistoryAddToProjectModal
        open={open}
        projects={projects}
        loading={false}
        savingId={savingId}
        error=""
        onClose={() => {
          setOpen(false);
          setStatus('closed');
        }}
        onSave={saveProject}
      />
    </main>
  );
}
