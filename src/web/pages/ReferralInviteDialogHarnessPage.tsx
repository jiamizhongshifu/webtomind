import { useEffect, useState } from 'react';
import { getAuthToken, setAuthToken } from '@/services/agent-api';
import { ReferralInviteDialog } from '../components/image-create/ReferralInviteDialog';
import '../styles/image-create.css';
import '../styles/image-create-mobile.css';

export function ReferralInviteDialogHarnessPage() {
  const [open, setOpen] = useState(true);
  const [dark, setDark] = useState(false);
  const [ready, setReady] = useState(false);
  const isEnglish =
    new URLSearchParams(window.location.search).get('lang') === 'en';

  useEffect(() => {
    const root = document.documentElement;
    const hadDarkTheme = root.classList.contains('dark');
    root.classList.toggle('dark', dark);
    return () => {
      root.classList.toggle('dark', hadDarkTheme);
    };
  }, [dark]);

  useEffect(() => {
    const previousToken = getAuthToken();
    setAuthToken('referral-invite-dialog-harness');
    setReady(true);
    return () => setAuthToken(previousToken);
  }, []);

  return (
    <main
      data-harness="referral-invite-dialog"
      style={{
        minHeight: '100dvh',
        padding: 24,
        background: dark
          ? 'linear-gradient(135deg, #171411, #25201c)'
          : 'linear-gradient(135deg, #fffdfa, #f3ede6)',
        color: dark ? '#fffaf2' : '#241916',
        fontFamily: 'Geist Sans, Inter, ui-sans-serif, system-ui, sans-serif'
      }}
    >
      <p style={{ margin: 0, fontSize: 12, fontWeight: 800 }}>
        ISOLATED PREVIEW HARNESS
      </p>
      <h1 style={{ margin: '8px 0 4px', fontSize: 22 }}>
        Referral Invite Dialog
      </h1>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          type="button"
          style={{
            minHeight: 44,
            padding: '0 14px',
            border: '1px solid currentColor',
            borderRadius: 12,
            background: 'transparent',
            color: 'inherit',
            font: 'inherit',
            fontWeight: 750
          }}
          onClick={() => setOpen(true)}
        >
          Reopen
        </button>
        <button
          type="button"
          style={{
            minHeight: 44,
            padding: '0 14px',
            border: '1px solid currentColor',
            borderRadius: 12,
            background: 'transparent',
            color: 'inherit',
            font: 'inherit',
            fontWeight: 750
          }}
          onClick={() => setDark((value) => !value)}
        >
          {dark ? 'Use light theme' : 'Use dark theme'}
        </button>
      </div>
      {ready ? (
        <ReferralInviteDialog
          open={open}
          isEnglish={isEnglish}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </main>
  );
}
