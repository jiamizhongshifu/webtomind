import { useEffect, useRef, useState } from 'react';
import { Button } from '@/shared/ui';
import { chatLocale, loadSupport } from '../lib/supportChatClient';

export function SupportChat({ locale }: { locale: string }) {
  const token = import.meta.env.VITE_CHATWOOT_WEBSITE_TOKEN as
    | string
    | undefined;
  const enabled = !!token && /^[a-zA-Z0-9_-]{16,128}$/.test(token);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const trigger = useRef<HTMLButtonElement>(null);
  const openedFromTrigger = useRef(false);
  const en = locale === 'en-US';
  useEffect(() => {
    window.$chatwoot?.setLocale(chatLocale(locale));
    const closed = () => {
      if (openedFromTrigger.current)
        requestAnimationFrame(() => trigger.current?.focus());
      openedFromTrigger.current = false;
    };
    window.addEventListener('chatwoot:closed', closed);
    return () => window.removeEventListener('chatwoot:closed', closed);
  }, [locale]);
  if (!enabled)
    return (
      <a className="marketing-footer-link" href="mailto:support@webtomind.com">
        {en ? 'Contact us' : '联系我们'}
      </a>
    );
  return (
    <span>
      <Button
        variant="link"
        size="sm"
        ref={trigger}
        isLoading={status === 'loading'}
        onClick={async () => {
          setStatus('loading');
          openedFromTrigger.current = true;
          try {
            const widget = await loadSupport(
              { baseUrl: 'https://app.chatwoot.com', websiteToken: token! },
              locale
            );
            widget.setLocale(chatLocale(locale));
            widget.toggle('open');
            setStatus('idle');
          } catch {
            openedFromTrigger.current = false;
            setStatus('error');
          }
        }}
      >
        {status === 'loading'
          ? en
            ? 'Connecting…'
            : '正在连接…'
          : status === 'error'
            ? en
              ? 'Retry chat'
              : '重试客服连接'
            : en
              ? 'Contact support'
              : '在线客服'}
      </Button>
      {status === 'error' && (
        <span role="alert">
          {en ? 'Chat unavailable. ' : '暂时无法连接。'}
          <a href="mailto:support@webtomind.com">
            {en ? 'Email support' : '邮件联系'}
          </a>
        </span>
      )}
    </span>
  );
}
