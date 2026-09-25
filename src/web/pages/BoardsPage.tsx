import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '@/i18n/hooks/useLanguage';
import WorkspaceApp from '../../workspace/App';
import { applySeo } from '../lib/seo';
import { isE2EAuthBypassEnabled } from '@/utils/env';

const STALE_BOARDS_ASSET_RELOAD_KEY = 'webtomind:boards-asset-reload';

async function reloadIfBoardsAssetIsStale() {
  if (typeof window === 'undefined') return;
  const currentIndexAsset = Array.from(document.scripts)
    .map((script) => script.src)
    .find((src) => /\/assets\/index\.[^/]+\.js(?:\?|$)/.test(src));

  if (!currentIndexAsset) return;

  try {
    const response = await fetch(window.location.href, {
      cache: 'no-store',
      credentials: 'same-origin'
    });
    if (!response.ok) return;

    const html = await response.text();
    const latestIndexAsset = html.match(
      /\/assets\/index\.[A-Za-z0-9_-]+\.js/
    )?.[0];
    if (!latestIndexAsset) return;

    const currentUrl = new URL(currentIndexAsset);
    if (currentUrl.pathname === latestIndexAsset) return;

    const reloadToken = `${latestIndexAsset}:${window.location.pathname}`;
    if (sessionStorage.getItem(STALE_BOARDS_ASSET_RELOAD_KEY) === reloadToken) {
      return;
    }

    sessionStorage.setItem(STALE_BOARDS_ASSET_RELOAD_KEY, reloadToken);
    window.location.reload();
  } catch {
    // Keep the workspace usable if the lightweight freshness check fails.
  }
}

export function BoardsPage() {
  const { language } = useLanguage();
  const { getAccessToken, isLoading: isAuthLoading } = useAuth();
  const { id: routeProjectId } = useParams<{ id?: string }>();
  const isLocalAuthBypass =
    isE2EAuthBypassEnabled() ||
    (import.meta.env.DEV &&
      typeof window !== 'undefined' &&
      window.location.hostname === 'localhost');
  const isWorkspaceAuthReady =
    !isAuthLoading && (isLocalAuthBypass || Boolean(getAccessToken()));

  useEffect(() => {
    return applySeo({
      title: 'WebToMind 工作台',
      description: 'WebToMind AI 工作台。',
      canonical: 'https://webtomind.com/boards',
      robots: 'noindex,nofollow',
      ogImage: 'https://webtomind.com/icons/logo-icon.svg',
      twitterSite: '@webtomind'
    });
  }, []);

  useEffect(() => {
    if (!routeProjectId) return;
    void reloadIfBoardsAssetIsStale();
  }, [routeProjectId]);

  return (
    <div className="w-full h-screen bg-white">
      <WorkspaceApp
        key={`${language}:${routeProjectId || 'home'}`}
        isAuthReady={isWorkspaceAuthReady}
        routeProjectId={routeProjectId || null}
      />
    </div>
  );
}

export default BoardsPage;
