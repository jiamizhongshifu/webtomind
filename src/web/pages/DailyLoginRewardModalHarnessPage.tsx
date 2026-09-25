import { useState } from 'react';
import {
  DailyLoginRewardModal,
  DailyLoginRewardNotice
} from '../components/image-create/DailyLoginRewardModal';
import '../styles/image-create.css';
import '../styles/image-create-mobile.css';

export function DailyLoginRewardModalHarnessPage() {
  const noticeMode = new URLSearchParams(window.location.search).has('notice');
  const [open, setOpen] = useState(true);
  const [status, setStatus] = useState('ready');

  return (
    <main
      className="image-create-page"
      data-harness="daily-login-reward-modal"
      style={{
        minHeight: '100vh',
        background:
          'linear-gradient(135deg, #fffdfa 0%, #f6efe7 45%, #edf4f2 100%)'
      }}
    >
      <div
        style={{
          padding: 24,
          color: '#17110d',
          fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
        }}
      >
        <p style={{ margin: 0, fontSize: 12, fontWeight: 800 }}>
          ISOLATED PREVIEW HARNESS
        </p>
        <h1 style={{ margin: '8px 0 4px', fontSize: 22 }}>
          Daily Login Reward {noticeMode ? 'Notice' : 'Modal'}
        </h1>
        <p style={{ margin: 0, color: '#66564d', fontSize: 13 }}>
          Status: <span data-testid="harness-status">{status}</span>
        </p>
        <button
          type="button"
          style={{
            marginTop: 16,
            minHeight: 38,
            border: '1px solid rgba(23, 17, 13, 0.16)',
            borderRadius: 8,
            padding: '0 14px',
            background: '#fffdfa',
            color: '#17110d',
            fontWeight: 800
          }}
          onClick={() => {
            setOpen(true);
            setStatus('reopened');
          }}
        >
          Reopen {noticeMode ? 'notice' : 'modal'}
        </button>
      </div>
      {noticeMode ? (
        <DailyLoginRewardNotice
          open={open}
          reward={120}
          localePrefix="/zh-CN"
          onClose={() => {
            setOpen(false);
            setStatus('closed');
          }}
        />
      ) : (
        <DailyLoginRewardModal
          open={open}
          reward={120}
          localePrefix="/zh-CN"
          onClose={() => {
            setOpen(false);
            setStatus('closed');
          }}
        />
      )}
    </main>
  );
}
