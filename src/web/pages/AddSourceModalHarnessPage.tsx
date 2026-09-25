import { useState } from 'react';
import { AddSourceModal } from '@/workspace/components/AddSourceModal';

export function AddSourceModalHarnessPage() {
  const [open, setOpen] = useState(true);
  const [status, setStatus] = useState('ready');

  return (
    <main
      data-harness="add-source-modal"
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
          Add Source Modal
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
        <AddSourceModal
          projectId="harness-project"
          onClose={() => {
            setOpen(false);
            setStatus('closed');
          }}
          onImportComplete={() => setStatus('imported')}
          onUploadFiles={() => setStatus('upload-files')}
        />
      ) : null}
    </main>
  );
}
