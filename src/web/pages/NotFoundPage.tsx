import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';
import { ButtonLink, EmptyState } from '../../shared/ui';
import { applySeo } from '../lib/seo';

export function NotFoundPage() {
  const location = useLocation();
  const localePrefix = location.pathname.startsWith('/en-US')
    ? '/en-US'
    : '/zh-CN';

  useEffect(() => {
    return applySeo({
      title: '404 | WebToMind',
      description: 'The page you requested could not be found.',
      canonical: `https://webtomind.com${location.pathname}`,
      robots: 'noindex,nofollow'
    });
  }, [location.pathname]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--web-bg-canvas)] px-6 py-16 text-[var(--web-text-primary)]">
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2 select-none text-[30vw] font-black leading-none text-slate-100">
        404
      </div>

      <EmptyState
        className="relative z-10 max-w-xl px-8 py-10 text-center"
        tone="glass"
        icon={<FileQuestion className="h-7 w-7" />}
        title="页面暂时不可用"
        description="这个链接可能已经移动、过期，或还没有对外开放。你可以回到首页继续浏览 WebToMind。"
        action={
          <ButtonLink to={`${localePrefix}/overview`} variant="secondary" size="lg">
            返回首页
          </ButtonLink>
        }
      />
    </div>
  );
}
