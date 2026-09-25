import { useState } from 'react';
import { ActionSheet, Button } from '@/shared/ui';

export function ActionSheetHarnessPage() {
  const [open, setOpen] = useState(true);
  const [status, setStatus] = useState('ready');

  return (
    <main
      data-harness="action-sheet"
      style={{
        minHeight: '100vh',
        padding: 24,
        background: 'linear-gradient(145deg, #fffdfa, #eee7df)',
        color: '#17110d'
      }}
    >
      <p style={{ margin: 0, fontSize: 12, fontWeight: 800 }}>
        ISOLATED PREVIEW HARNESS
      </p>
      <h1 style={{ margin: '8px 0 4px', fontSize: 22 }}>ActionSheet</h1>
      <p style={{ margin: 0, color: '#66564d', fontSize: 13 }}>
        Status: <span data-testid="harness-status">{status}</span>
      </p>
      <Button
        type="button"
        variant="outline"
        style={{ marginTop: 16 }}
        onClick={() => {
          setOpen(true);
          setStatus('reopened');
        }}
      >
        Reopen sheet
      </Button>

      <ActionSheet
        open={open}
        title="Project actions"
        description="Drag slowly, fling down, or re-grab during the exit animation."
        closeLabel="Close sheet"
        onClose={() => {
          setOpen(false);
          setStatus('closed');
        }}
      >
        <div style={{ display: 'grid', gap: 10 }}>
          <Button type="button">Primary action</Button>
          <Button type="button" variant="outline">
            Secondary action with a long single-line label
          </Button>
          <Button type="button" variant="ghost">
            Move to archive
          </Button>
        </div>
      </ActionSheet>
    </main>
  );
}
