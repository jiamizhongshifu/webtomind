import React, { lazy, Suspense, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/geist-sans/latin-400.css';
import '@fontsource/geist-sans/latin-500.css';
import '@fontsource/geist-sans/latin-600.css';
import '@fontsource/geist-sans/latin-700.css';
import '@fontsource/geist-mono/latin-400.css';
import '@fontsource/geist-mono/latin-500.css';

// i18n 初始化（必须在其他组件之前导入）
import '../i18n';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useParams
} from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false
    }
  }
});

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ApiMarketplaceAdminRoute } from './components/ApiMarketplaceAdminRoute';
import { GoogleOneTapLoginPrompt } from './components/GoogleOneTapLoginPrompt';
import { AnalyticsConsentGate } from './components/AnalyticsConsentGate';
import { CreditsUpgradePrompt } from './components/CreditsUpgradePrompt';
import { PageLoadSkeleton } from './components/PageLoadSkeleton';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { LocaleGuard } from './components/LocaleGuard';
import {
  captureFirstTouchAcquisition,
  captureSeoContentCtaAttribution
} from './lib/seo-conversion-attribution';
import {
  AuthModalProvider,
  AuthRouteModalLauncher
} from './components/AuthModal';
import { PROMPT_STYLE_GRID_ALL_PATHS } from '@/shared/prompt-style-grid-seo';
import {
  buildPromptCaseShareRedirectPath,
  getLocaleRoutePrefix,
  isLocalizedAuthCallbackRoute,
  isLocalizedLoginRoute,
  PROMPT_SEO_ALIAS_PATHS,
  stripLocaleRoutePrefix
} from '@/shared/seo-route-paths';
import { getInitialLanguageSync } from '@/i18n/config';
import '../design/shared-tokens.css';
import '../design/web-tokens.css';
import '../design/ui-primitives.css';
import '../design/app-shell.css';
import './styles/mobile-adaptations.css';
import './styles/geist-theme.css';

import { initTheme } from '../utils/theme';
import { isE2EAuthBypassEnabled } from '@/utils/env';
import { getDevHarnessRoutes } from './routes/devHarnessRoutes';
import { isCreateWorkspaceFeatureEnabled } from './lib/create-workspace-flags';
import { hasImageCreateRouteIntent } from './lib/create-route-intent';
import { CREATE_WORKSPACE_FEATURE_FLAGS } from '@/shared/create-workspace-v2';
import { canonicalizeCreatorPathname } from '@/shared/creator-route-paths';
import { installStaleAssetRecovery } from './lib/stale-asset-recovery';

// 首触获客快照必须在首次落地 URL 上捕获（先于任何 SPA 跳转），
// 之后 sessionStorage 已存在时不会被覆盖。
captureFirstTouchAcquisition();
captureSeoContentCtaAttribution();

const DevAgentation = import.meta.env.DEV
  ? lazy(() =>
      import('agentation').then((mod) => ({ default: mod.Agentation }))
    )
  : null;

type LazyRouteModule<T extends React.ComponentType<unknown>> = {
  default: T;
};

function getInitialRoutePathname(): string {
  if (typeof window === 'undefined') return '';
  return window.location.pathname;
}

function isInitialPromptDetailPath(pathname: string): boolean {
  const normalizedPath = stripLocaleRoutePrefix(pathname);
  return (
    /^\/prompts\/[^/]+$/.test(normalizedPath) &&
    !normalizedPath.startsWith('/prompts/admin') &&
    !normalizedPath.startsWith('/prompts/category/') &&
    !normalizedPath.startsWith('/prompts/model/') &&
    !normalizedPath.startsWith('/prompts/package/')
  );
}

function isInitialPromptSeoPath(pathname: string): boolean {
  const normalizedPath = stripLocaleRoutePrefix(pathname);
  return (
    normalizedPath === '/prompts' ||
    normalizedPath.startsWith('/prompts/category/') ||
    normalizedPath.startsWith('/prompts/model/') ||
    normalizedPath.startsWith('/prompts/package/') ||
    (PROMPT_SEO_ALIAS_PATHS as readonly string[]).includes(normalizedPath)
  );
}

function isInitialPromptStyleGridPath(pathname: string): boolean {
  const normalizedPath = stripLocaleRoutePrefix(pathname);
  return (
    (PROMPT_STYLE_GRID_ALL_PATHS as readonly string[]).includes(
      normalizedPath
    ) || normalizedPath.startsWith('/ai-image-style-grid/')
  );
}

function isInitialPindouPatternMakerPath(pathname: string): boolean {
  return stripLocaleRoutePrefix(pathname) === '/tools/pindou-pattern-maker';
}

function lazyRouteWithInitialPreload<T extends React.ComponentType<unknown>>(
  shouldPreload: (pathname: string) => boolean,
  loader: () => Promise<LazyRouteModule<T>>
) {
  const initialRouteModulePromise = shouldPreload(getInitialRoutePathname())
    ? loader()
    : null;
  return lazy(() => initialRouteModulePromise || loader());
}

const HomePage = lazyRouteWithInitialPreload(
  (pathname) =>
    pathname === '/' || stripLocaleRoutePrefix(pathname) === '/overview',
  () => import('./pages/HomePage').then((mod) => ({ default: mod.HomePage }))
);
const AuthCallback = lazy(() =>
  import('./pages/AuthCallback').then((mod) => ({ default: mod.AuthCallback }))
);
const BoardsPage = lazy(() =>
  import('./pages/BoardsPage').then((mod) => ({ default: mod.BoardsPage }))
);
const CreateBoardsPage = lazy(() =>
  import('./pages/CreateBoardsPage').then((mod) => ({
    default: mod.CreateBoardsPage
  }))
);
const SettingsRoutePage = lazy(() =>
  import('./pages/SettingsRoutePage').then((mod) => ({
    default: mod.SettingsRoutePage
  }))
);
const CreateAccountPage = lazy(() =>
  import('./pages/CreateAccountPage').then((mod) => ({
    default: mod.CreateAccountPage
  }))
);
const TermsPage = lazy(() =>
  import('./pages/TermsPage').then((mod) => ({ default: mod.TermsPage }))
);
const PrivacyPage = lazyRouteWithInitialPreload(
  (pathname) => stripLocaleRoutePrefix(pathname) === '/privacy',
  () =>
    import('./pages/PrivacyPage').then((mod) => ({ default: mod.PrivacyPage }))
);
const SharePage = lazy(() =>
  import('./pages/SharePage').then((mod) => ({ default: mod.SharePage }))
);
const UseCasesPage = lazy(() =>
  import('./pages/UseCasesPage').then((mod) => ({ default: mod.UseCasesPage }))
);
const PublicSkillsPage = lazy(() =>
  import('./pages/PublicSkillsPage').then((mod) => ({
    default: mod.PublicSkillsPage
  }))
);
const PublicSkillDetailPage = lazy(() =>
  import('./pages/PublicSkillDetailPage').then((mod) => ({
    default: mod.PublicSkillDetailPage
  }))
);
const ImageCreatePage = lazy(() =>
  import('./pages/ImageCreatePage').then((mod) => ({
    default: mod.ImageCreatePage
  }))
);
const CreateVideoPage = lazy(() =>
  import('./pages/CreateVideoPage').then((mod) => ({
    default: mod.CreateVideoPage
  }))
);
const CreateHomePage = lazy(() =>
  import('./pages/CreateHomePage').then((mod) => ({
    default: mod.CreateHomePage
  }))
);
const CreatePromptLibraryPage = lazy(() =>
  import('./pages/CreatePromptLibraryPage').then((mod) => ({
    default: mod.CreatePromptLibraryPage
  }))
);
const CreateDiscoveryPage = lazy(() =>
  import('./pages/CreateDiscoveryPage').then((mod) => ({
    default: mod.CreateDiscoveryPage
  }))
);
const CreateMoodboardsPage = lazy(() =>
  import('./pages/CreateMoodboardsPage').then((mod) => ({
    default: mod.CreateMoodboardsPage
  }))
);
const CreateMoodboardDetailPage = lazy(() =>
  import('./pages/CreateMoodboardDetailPage').then((mod) => ({
    default: mod.CreateMoodboardDetailPage
  }))
);
const CreateNewMoodboardPage = lazy(() =>
  import('./pages/CreateNewMoodboardPage').then((mod) => ({
    default: mod.CreateNewMoodboardPage
  }))
);
const PublicMoodboardPage = lazy(() =>
  import('./pages/PublicMoodboardPage').then((mod) => ({
    default: mod.PublicMoodboardPage
  }))
);
const CreatePricingPage = lazy(() =>
  import('./pages/CreatePricingPage').then((mod) => ({
    default: mod.CreatePricingPage
  }))
);
const CreateGalleryPage = lazy(() =>
  import('./pages/CreateGalleryPage').then((mod) => ({
    default: mod.CreateGalleryPage
  }))
);
const CreateAppsPage = lazy(() =>
  import('./pages/CreateAppsPage').then((mod) => ({
    default: mod.CreateAppsPage
  }))
);
const ImageUpscalerPage = lazy(() =>
  import('./pages/ImageUpscalerPage').then((mod) => ({
    default: mod.ImageUpscalerPage
  }))
);
const ImageSplitterPage = lazy(() =>
  import('./pages/ImageSplitterPage').then((mod) => ({
    default: mod.ImageSplitterPage
  }))
);
const WatermarkRemoverPage = lazy(() =>
  import('./pages/WatermarkRemoverPage').then((mod) => ({
    default: mod.WatermarkRemoverPage
  }))
);
const BackgroundRemoverPage = lazy(() =>
  import('./pages/BackgroundRemoverPage').then((mod) => ({
    default: mod.BackgroundRemoverPage
  }))
);
const GptImage2DenoiserPage = lazy(() =>
  import('./pages/GptImage2DenoiserPage').then((mod) => ({
    default: mod.GptImage2DenoiserPage
  }))
);
const ImageCompressorPage = lazy(() =>
  import('./pages/ImageCompressorPage').then((mod) => ({
    default: mod.ImageCompressorPage
  }))
);
const ImageEditorPage = lazy(() =>
  import('./pages/ImageEditorPage').then((mod) => ({
    default: mod.ImageEditorPage
  }))
);
const CreateCharactersPage = lazy(() =>
  import('./pages/CreateCharactersPage').then((mod) => ({
    default: mod.CreateCharactersPage
  }))
);
const CreateTasksPage = lazy(() =>
  import('./pages/CreateTasksPage').then((mod) => ({
    default: mod.CreateTasksPage
  }))
);
const CreateRechargePage = lazy(() =>
  import('./pages/CreateRechargePage').then((mod) => ({
    default: mod.CreateRechargePage
  }))
);
const ApiModelsPage = lazy(() =>
  import('./pages/ApiModelsPage').then((mod) => ({
    default: mod.ApiModelsPage
  }))
);
const ApiConsolePage = lazy(() =>
  import('./pages/ApiConsolePage').then((mod) => ({
    default: mod.ApiConsolePage
  }))
);
const ComfyWorkflowCheckerPage = lazy(() =>
  import('./pages/ComfyWorkflowCheckerPage').then((mod) => ({
    default: mod.ComfyWorkflowCheckerPage
  }))
);
const PindouPatternMakerPage = lazyRouteWithInitialPreload(
  isInitialPindouPatternMakerPath,
  () =>
    import('./pages/PindouPatternMakerPage').then((mod) => ({
      default: mod.PindouPatternMakerPage
    }))
);
const PromptDetailPage = lazyRouteWithInitialPreload(
  isInitialPromptDetailPath,
  () =>
    import('./pages/PromptDetailPage').then((mod) => ({
      default: mod.PromptDetailPage
    }))
);
const PromptSeoLandingPage = lazyRouteWithInitialPreload(
  isInitialPromptSeoPath,
  () =>
    import('./pages/PromptSeoLandingPage').then((mod) => ({
      default: () => <mod.PromptSeoLandingPage />
    }))
);
const PromptStyleGridPage = lazyRouteWithInitialPreload(
  isInitialPromptStyleGridPath,
  () =>
    import('./pages/PromptStyleGridPage').then((mod) => ({
      default: mod.PromptStyleGridPage
    }))
);
const PromptCaseAdminPage = lazy(() =>
  import('./pages/PromptCaseAdminPage').then((mod) => ({
    default: mod.PromptCaseAdminPage
  }))
);
const PromptAssetOpsPage = lazy(() =>
  import('./pages/PromptAssetOpsPage').then((mod) => ({
    default: mod.PromptAssetOpsPage
  }))
);
const BlogArticleDetailPage = lazyRouteWithInitialPreload(
  (pathname) => /^\/blog\/[^/]+$/.test(stripLocaleRoutePrefix(pathname)),
  () =>
    import('./pages/BlogArticleDetailPage').then((mod) => ({
      default: mod.BlogArticleDetailPage
    }))
);
const UpdatesPage = lazy(() =>
  import('./pages/UpdatesPage').then((mod) => ({ default: mod.UpdatesPage }))
);
const LinksPage = lazy(() =>
  import('./pages/LinksPage').then((mod) => ({ default: mod.LinksPage }))
);
const PricingRoutePage = lazy(() =>
  import('./pages/PricingRoutePage').then((mod) => ({
    default: mod.PricingRoutePage
  }))
);
const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage').then((mod) => ({ default: mod.NotFoundPage }))
);

installStaleAssetRecovery();

// 初始化主题（在渲染前应用，避免闪烁）
initTheme();

function hasCreateIntent(location: ReturnType<typeof useLocation>) {
  return hasImageCreateRouteIntent({
    search: location.search,
    state: location.state
  });
}

function CreateEntryRoute() {
  const location = useLocation();
  if (hasCreateIntent(location)) {
    const localePrefix = getLocaleRoutePrefix(location.pathname);
    return (
      <Navigate
        to={`${localePrefix}/image${location.search}${location.hash}`}
        replace
        state={location.state}
      />
    );
  }
  return isCreateWorkspaceFeatureEnabled(
    CREATE_WORKSPACE_FEATURE_FLAGS.createShellV2
  ) ? (
    <CreateDiscoveryPage />
  ) : (
    <CreateHomePage />
  );
}

function CreateMoodboardsRoute({
  detail = false,
  newBoard = false
}: {
  detail?: boolean;
  newBoard?: boolean;
}) {
  const location = useLocation();
  if (
    !isCreateWorkspaceFeatureEnabled(
      CREATE_WORKSPACE_FEATURE_FLAGS.moodboardsV1
    )
  ) {
    return (
      <Navigate
        to={`${getLocaleRoutePrefix(location.pathname)}/create`}
        replace
      />
    );
  }
  if (newBoard) return <CreateNewMoodboardPage />;
  return detail ? <CreateMoodboardDetailPage /> : <CreateMoodboardsPage />;
}

function CreateWorkspacePricingRoute() {
  return <CreatePricingPage />;
}

function PublicMoodboardShareRoute() {
  const location = useLocation();
  if (
    !isCreateWorkspaceFeatureEnabled(
      CREATE_WORKSPACE_FEATURE_FLAGS.moodboardsV1
    )
  ) {
    return (
      <Navigate
        to={`${getLocaleRoutePrefix(location.pathname)}/create`}
        replace
      />
    );
  }
  return <PublicMoodboardPage />;
}

const CREATOR_CANONICAL_ROUTE_SUFFIXES = [
  'image',
  'video',
  'gallery',
  'moodboards',
  'moodboards/new',
  'moodboards/:id',
  'apps',
  'characters'
] as const;

type CreatorCanonicalRouteSuffix =
  (typeof CREATOR_CANONICAL_ROUTE_SUFFIXES)[number];

const CREATOR_CANONICAL_ROUTE_ELEMENTS: Record<
  CreatorCanonicalRouteSuffix,
  React.ReactNode
> = {
  // 图像/视频创作页开放给访客浏览，关键交互（生成、保存等）由页面内
  // requestLogin / openAuthModal 门控，不再用路由级登录墙。
  image: <ImageCreatePage />,
  video: <CreateVideoPage />,
  gallery: (
    <ProtectedRoute>
      <CreateGalleryPage />
    </ProtectedRoute>
  ),
  moodboards: <CreateMoodboardsRoute />,
  'moodboards/new': (
    <ProtectedRoute>
      <CreateMoodboardsRoute newBoard />
    </ProtectedRoute>
  ),
  'moodboards/:id': (
    <ProtectedRoute>
      <CreateMoodboardsRoute detail />
    </ProtectedRoute>
  ),
  apps: <CreateAppsPage />,
  characters: (
    <ProtectedRoute>
      <CreateCharactersPage />
    </ProtectedRoute>
  )
};

function buildCreatorCanonicalRouteElements(
  localePrefix: '' | '/zh-CN' | '/en-US'
): Array<React.ReactElement> {
  // 返回 Route 元素数组，作为 <Routes> 的直接子节点（不允许自定义组件）。
  return CREATOR_CANONICAL_ROUTE_SUFFIXES.map((suffix) => (
    <Route
      key={`${localePrefix}/${suffix}`}
      path={`${localePrefix}/${suffix}`}
      element={CREATOR_CANONICAL_ROUTE_ELEMENTS[suffix]}
    />
  ));
}

function PromptCaseShareRedirect() {
  const location = useLocation();
  const { caseId = '' } = useParams();
  return (
    <Navigate
      to={buildPromptCaseShareRedirectPath({
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
        caseId
      })}
      replace
    />
  );
}

function PromptAdminRedirect() {
  const location = useLocation();
  const { adminTab = '' } = useParams();
  const suffix = adminTab ? `/${adminTab}` : '';
  const localePrefix =
    getLocaleRoutePrefix(location.pathname) || `/${getInitialLanguageSync()}`;
  return (
    <Navigate
      to={`${localePrefix}/prompts/admin${suffix}${location.search}${location.hash}`}
      replace
      state={location.state}
    />
  );
}

function LocaleRedirect({ to }: { to: string }) {
  const location = useLocation();
  const locale = getInitialLanguageSync();
  return (
    <Navigate
      to={`/${locale}${to}${location.search}${location.hash}`}
      replace
    />
  );
}

function LegacyMarketingHubRedirect() {
  const location = useLocation();
  const localePrefix =
    getLocaleRoutePrefix(location.pathname) || `/${getInitialLanguageSync()}`;
  return (
    <Navigate
      to={`${localePrefix}/blog${location.search}${location.hash}`}
      replace
      state={location.state}
    />
  );
}

function LegacyUseCaseDetailRedirect() {
  const location = useLocation();
  const { locale: routeLocale, slug } = useParams<{
    locale?: string;
    slug?: string;
  }>();
  const locale = routeLocale === 'en-US' ? 'en-US' : 'zh-CN';
  const target = slug ? `/${locale}/blog/${slug}` : `/${locale}/blog`;
  return (
    <Navigate
      to={`${target}${location.search}${location.hash}`}
      replace
      state={location.state}
    />
  );
}

function LocalizedPathRedirect() {
  const location = useLocation();
  const locale = getInitialLanguageSync();
  return (
    <Navigate
      to={`/${locale}${location.pathname}${location.search}${location.hash}`}
      replace
      state={location.state}
    />
  );
}

/**
 * 旧 /create/* 创作页面 URL -> 新顶层 URL 的客户端重定向，
 * 保留查询参数与 hash，状态（如参考图）原样透传。
 */
function CreatorRouteRedirect() {
  const location = useLocation();
  const canonical = canonicalizeCreatorPathname(location.pathname);
  if (!canonical) return null;
  const localePrefix = getLocaleRoutePrefix(location.pathname);
  return (
    <Navigate
      to={`${localePrefix}${canonical}${location.search}${location.hash}`}
      replace
      state={location.state}
    />
  );
}

function resolveOneTapRedirect(location: ReturnType<typeof useLocation>) {
  const currentPath = `${location.pathname}${location.search}${location.hash}`;
  if (isLocalizedLoginRoute(location.pathname)) {
    const redirect = new URLSearchParams(location.search).get('redirect');
    if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
      return redirect;
    }
  }
  return currentPath;
}

const GLOBAL_GOOGLE_ONE_TAP_BLOCKERS = [
  '.create-onboarding-backdrop',
  '.deep-feature-paywall-backdrop',
  '.daily-login-reward-modal'
].join(',');

function isRechargeRoute(pathname: string) {
  const routePath = stripLocaleRoutePrefix(pathname);
  return routePath === '/recharge' || routePath.startsWith('/recharge/');
}

function isDevHarnessRoute(pathname: string) {
  return stripLocaleRoutePrefix(pathname).startsWith('/__dev/');
}

function useHasGlobalOneTapBlocker() {
  const [hasBlocker, setHasBlocker] = React.useState(false);

  React.useEffect(() => {
    if (typeof document === 'undefined') return;

    const syncBlockerState = () => {
      const nextHasBlocker = Boolean(
        document.querySelector(GLOBAL_GOOGLE_ONE_TAP_BLOCKERS)
      );
      setHasBlocker((current) =>
        current === nextHasBlocker ? current : nextHasBlocker
      );
    };

    syncBlockerState();

    const observer = new MutationObserver(syncBlockerState);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['aria-hidden', 'class', 'hidden', 'style'],
      childList: true,
      subtree: true
    });

    return () => observer.disconnect();
  }, []);

  return hasBlocker;
}

function GlobalGoogleOneTapGate() {
  const location = useLocation();
  const {
    isAuthenticated,
    isLoading,
    signInWithGoogle,
    signInWithGoogleIdToken
  } = useAuth();
  const hasBlockingOverlay = useHasGlobalOneTapBlocker();
  const isAuthCallback = isLocalizedAuthCallbackRoute(location.pathname);
  const isLoginPage = isLocalizedLoginRoute(location.pathname);
  const isRechargePage = isRechargeRoute(location.pathname);
  const isDevHarnessPage = isDevHarnessRoute(location.pathname);
  const bypassAuthForE2E = isE2EAuthBypassEnabled();
  // 未登录访客在任意页面（除登录/回调/充值/开发壳外）都展示左下角
  // 谷歌快捷登录浮窗；卡片可关闭且不阻塞页面交互。
  const enabled =
    !isLoading &&
    !isAuthenticated &&
    !isAuthCallback &&
    !isLoginPage &&
    !isRechargePage &&
    !isDevHarnessPage &&
    !/\/tools\/(image-upscaler|image-editor)(?:\/|$)/.test(location.pathname) &&
    !hasBlockingOverlay &&
    !bypassAuthForE2E;

  return (
    <GoogleOneTapLoginPrompt
      enabled={enabled}
      redirectPath={resolveOneTapRedirect(location)}
      variant="default"
      preferInlineCard
      onCredentialLogin={signInWithGoogleIdToken}
      onFallbackLogin={signInWithGoogle}
    />
  );
}

function isLocalComponentHarnessEnabled() {
  if (import.meta.env.VITE_ENABLE_COMPONENT_HARNESS === '1') return true;
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}

function SeoContentAttributionObserver() {
  const location = useLocation();

  useEffect(() => {
    captureSeoContentCtaAttribution();
  }, [location.pathname, location.search]);

  return null;
}

function App() {
  const showComponentHarness = isLocalComponentHarnessEnabled();

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Service worker support is progressive; a failed registration is
        // non-blocking for the app.
      });
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SeoContentAttributionObserver />
        <AuthProvider>
          <AuthModalProvider>
            <GlobalGoogleOneTapGate />
            <AnalyticsConsentGate />
            <CreditsUpgradePrompt />
            {/* Dev-only Agentation tools. */}
            {DevAgentation && (
              <Suspense fallback={null}>
                <DevAgentation />
              </Suspense>
            )}
            <Suspense fallback={<PageLoadSkeleton />}>
              <LocaleGuard>
                <Routes>
                  {/* 公开路由 */}
                  <Route path="/" element={<HomePage />} />
                  <Route
                    path="/zh-CN"
                    element={<Navigate to="/zh-CN/overview" replace />}
                  />
                  <Route
                    path="/en-US"
                    element={<Navigate to="/en-US/overview" replace />}
                  />
                  <Route
                    path="/overview"
                    element={<LocaleRedirect to="/overview" />}
                  />
                  <Route path="/zh-CN/overview" element={<HomePage />} />
                  <Route path="/en-US/overview" element={<HomePage />} />
                  <Route
                    path="/use-cases"
                    element={<LocaleRedirect to="/blog" />}
                  />
                  <Route
                    path="/zh-CN/use-cases"
                    element={<LegacyMarketingHubRedirect />}
                  />
                  <Route
                    path="/en-US/use-cases"
                    element={<LegacyMarketingHubRedirect />}
                  />
                  <Route
                    path="/zh-CN/use-cases/:slug"
                    element={<LegacyUseCaseDetailRedirect />}
                  />
                  <Route
                    path="/en-US/use-cases/:slug"
                    element={<LegacyUseCaseDetailRedirect />}
                  />
                  <Route path="/zh-CN/skills" element={<PublicSkillsPage />} />
                  <Route path="/en-US/skills" element={<PublicSkillsPage />} />
                  <Route
                    path="/zh-CN/skills/:id"
                    element={<PublicSkillDetailPage />}
                  />
                  <Route
                    path="/en-US/skills/:id"
                    element={<PublicSkillDetailPage />}
                  />
                  <Route path="/create" element={<CreateEntryRoute />} />
                  {[
                    '/create/image',
                    '/create/video',
                    '/create/gallery',
                    '/create/moodboards',
                    '/create/moodboards/new',
                    '/create/moodboards/:id',
                    '/create/apps',
                    '/create/characters',
                    '/create/prompts'
                  ].map((path) => (
                    <Route
                      key={path}
                      path={path}
                      element={<CreatorRouteRedirect />}
                    />
                  ))}
                  <Route
                    path="/ai-image-generator"
                    element={<ImageCreatePage />}
                  />
                  <Route
                    path="/create/prompts/share/:caseId"
                    element={<PromptCaseShareRedirect />}
                  />
                  <Route
                    path="/create/pricing"
                    element={<CreateWorkspacePricingRoute />}
                  />
                  <Route
                    path="/create/tasks"
                    element={
                      <ProtectedRoute>
                        <CreateTasksPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/create/boards"
                    element={
                      <ProtectedRoute>
                        <CreateBoardsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/create/boards/:id"
                    element={
                      <ProtectedRoute>
                        <CreateBoardsPage />
                      </ProtectedRoute>
                    }
                  />
                  {[
                    '/image',
                    '/video',
                    '/gallery',
                    '/moodboards',
                    '/moodboards/new',
                    '/moodboards/:id',
                    '/characters',
                    '/apps',
                    '/prompts'
                  ].map((path) => (
                    <Route
                      key={path}
                      path={path}
                      element={<LocalizedPathRedirect />}
                    />
                  ))}
                  <Route
                    path="/settings"
                    element={
                      <ProtectedRoute>
                        <SettingsRoutePage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/account"
                    element={
                      <ProtectedRoute>
                        <CreateAccountPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/models" element={<ApiModelsPage />} />
                  <Route
                    path="/api-console"
                    element={
                      <ApiMarketplaceAdminRoute>
                        <ApiConsolePage />
                      </ApiMarketplaceAdminRoute>
                    }
                  />
                  <Route path="/zh-CN/create" element={<CreateEntryRoute />} />
                  {[
                    '/zh-CN/create/image',
                    '/zh-CN/create/video',
                    '/zh-CN/create/gallery',
                    '/zh-CN/create/moodboards',
                    '/zh-CN/create/moodboards/new',
                    '/zh-CN/create/moodboards/:id',
                    '/zh-CN/create/apps',
                    '/zh-CN/create/characters',
                    '/zh-CN/create/prompts'
                  ].map((path) => (
                    <Route
                      key={path}
                      path={path}
                      element={<CreatorRouteRedirect />}
                    />
                  ))}
                  <Route
                    path="/zh-CN/create/prompts/share/:caseId"
                    element={<PromptCaseShareRedirect />}
                  />
                  <Route
                    path="/zh-CN/create/pricing"
                    element={<CreateWorkspacePricingRoute />}
                  />
                  <Route
                    path="/zh-CN/create/tasks"
                    element={
                      <ProtectedRoute>
                        <CreateTasksPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/zh-CN/create/boards"
                    element={
                      <ProtectedRoute>
                        <CreateBoardsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/zh-CN/create/boards/:id"
                    element={
                      <ProtectedRoute>
                        <CreateBoardsPage />
                      </ProtectedRoute>
                    }
                  />
                  {buildCreatorCanonicalRouteElements('/zh-CN')}
                  <Route
                    path="/zh-CN/prompts"
                    element={<CreatePromptLibraryPage />}
                  />
                  <Route
                    path="/zh-CN/settings"
                    element={
                      <ProtectedRoute>
                        <SettingsRoutePage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/zh-CN/account"
                    element={
                      <ProtectedRoute>
                        <CreateAccountPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/zh-CN/models" element={<ApiModelsPage />} />
                  <Route
                    path="/zh-CN/api-console"
                    element={
                      <ApiMarketplaceAdminRoute>
                        <ApiConsolePage />
                      </ApiMarketplaceAdminRoute>
                    }
                  />
                  <Route
                    path="/prompts"
                    element={<LocaleRedirect to="/prompts" />}
                  />
                  <Route
                    path="/prompts/admin"
                    element={<PromptAdminRedirect />}
                  />
                  <Route
                    path="/prompts/admin/:adminTab"
                    element={<PromptAdminRedirect />}
                  />
                  <Route path="/prompts/:slug" element={<PromptDetailPage />} />
                  <Route
                    path="/zh-CN/video-prompts"
                    element={<PromptSeoLandingPage />}
                  />
                  {showComponentHarness ? getDevHarnessRoutes() : null}
                  <Route
                    path="/zh-CN/prompts/admin"
                    element={<PromptCaseAdminPage />}
                  />
                  <Route
                    path="/zh-CN/prompts/admin/:adminTab"
                    element={<PromptCaseAdminPage />}
                  />
                  <Route
                    path="/en-US/prompts/admin"
                    element={<PromptCaseAdminPage />}
                  />
                  <Route
                    path="/en-US/prompts/admin/:adminTab"
                    element={<PromptCaseAdminPage />}
                  />
                  {PROMPT_SEO_ALIAS_PATHS.map((path) => (
                    <Route
                      key={path}
                      path={path}
                      element={<PromptSeoLandingPage />}
                    />
                  ))}
                  {PROMPT_STYLE_GRID_ALL_PATHS.map((path) => (
                    <Route
                      key={path}
                      path={path}
                      element={<PromptStyleGridPage />}
                    />
                  ))}
                  {PROMPT_STYLE_GRID_ALL_PATHS.map((path) => (
                    <Route
                      key={`/zh-CN${path}`}
                      path={`/zh-CN${path}`}
                      element={<PromptStyleGridPage />}
                    />
                  ))}
                  {PROMPT_STYLE_GRID_ALL_PATHS.map((path) => (
                    <Route
                      key={`/en-US${path}`}
                      path={`/en-US${path}`}
                      element={<PromptStyleGridPage />}
                    />
                  ))}
                  <Route
                    path="/ai-image-style-grid/:templateSlug"
                    element={<PromptStyleGridPage />}
                  />
                  <Route
                    path="/zh-CN/ai-image-style-grid/:templateSlug"
                    element={<PromptStyleGridPage />}
                  />
                  <Route
                    path="/en-US/ai-image-style-grid/:templateSlug"
                    element={<PromptStyleGridPage />}
                  />
                  <Route
                    path="/zh-CN/prompts/category/:slug"
                    element={<PromptSeoLandingPage />}
                  />
                  <Route
                    path="/en-US/prompts/category/:slug"
                    element={<PromptSeoLandingPage />}
                  />
                  <Route
                    path="/zh-CN/prompts/model/:slug"
                    element={<PromptSeoLandingPage />}
                  />
                  <Route
                    path="/en-US/prompts/model/:slug"
                    element={<PromptSeoLandingPage />}
                  />
                  <Route
                    path="/zh-CN/prompts/package/:slug"
                    element={<PromptSeoLandingPage />}
                  />
                  <Route
                    path="/en-US/prompts/package/:slug"
                    element={<PromptSeoLandingPage />}
                  />
                  <Route
                    path="/zh-CN/prompts/:slug"
                    element={<PromptDetailPage />}
                  />
                  <Route path="/en-US/create" element={<CreateEntryRoute />} />
                  {[
                    '/en-US/create/image',
                    '/en-US/create/video',
                    '/en-US/create/gallery',
                    '/en-US/create/moodboards',
                    '/en-US/create/moodboards/new',
                    '/en-US/create/moodboards/:id',
                    '/en-US/create/apps',
                    '/en-US/create/characters',
                    '/en-US/create/prompts'
                  ].map((path) => (
                    <Route
                      key={path}
                      path={path}
                      element={<CreatorRouteRedirect />}
                    />
                  ))}
                  <Route
                    path="/en-US/create/prompts/share/:caseId"
                    element={<PromptCaseShareRedirect />}
                  />
                  <Route
                    path="/en-US/create/pricing"
                    element={<CreateWorkspacePricingRoute />}
                  />
                  <Route
                    path="/en-US/create/tasks"
                    element={
                      <ProtectedRoute>
                        <CreateTasksPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/en-US/create/boards"
                    element={
                      <ProtectedRoute>
                        <CreateBoardsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/en-US/create/boards/:id"
                    element={
                      <ProtectedRoute>
                        <CreateBoardsPage />
                      </ProtectedRoute>
                    }
                  />
                  {buildCreatorCanonicalRouteElements('/en-US')}
                  <Route
                    path="/en-US/prompts"
                    element={<CreatePromptLibraryPage />}
                  />
                  <Route
                    path="/en-US/settings"
                    element={
                      <ProtectedRoute>
                        <SettingsRoutePage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/en-US/account"
                    element={
                      <ProtectedRoute>
                        <CreateAccountPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/en-US/models" element={<ApiModelsPage />} />
                  <Route
                    path="/en-US/api-console"
                    element={
                      <ApiMarketplaceAdminRoute>
                        <ApiConsolePage />
                      </ApiMarketplaceAdminRoute>
                    }
                  />
                  <Route
                    path="/tools/comfyui-workflow-checker"
                    element={<ComfyWorkflowCheckerPage />}
                  />
                  <Route
                    path="/zh-CN/tools/comfyui-workflow-checker"
                    element={<ComfyWorkflowCheckerPage />}
                  />
                  <Route
                    path="/en-US/tools/comfyui-workflow-checker"
                    element={<ComfyWorkflowCheckerPage />}
                  />
                  <Route
                    path="/tools/pindou-pattern-maker"
                    element={<PindouPatternMakerPage />}
                  />
                  <Route
                    path="/zh-CN/tools/pindou-pattern-maker"
                    element={<PindouPatternMakerPage />}
                  />
                  <Route
                    path="/en-US/tools/pindou-pattern-maker"
                    element={<PindouPatternMakerPage />}
                  />
                  {[
                    '/tools/image-upscaler',
                    '/zh-CN/tools/image-upscaler',
                    '/en-US/tools/image-upscaler'
                  ].map((path) => (
                    <Route
                      key={path}
                      path={path}
                      element={<ImageUpscalerPage />}
                    />
                  ))}
                  {[
                    '/tools/image-splitter',
                    '/zh-CN/tools/image-splitter',
                    '/en-US/tools/image-splitter'
                  ].map((path) => (
                    <Route
                      key={path}
                      path={path}
                      element={<ImageSplitterPage />}
                    />
                  ))}
                  {[
                    '/tools/watermark-remover',
                    '/zh-CN/tools/watermark-remover',
                    '/en-US/tools/watermark-remover'
                  ].map((path) => (
                    <Route
                      key={path}
                      path={path}
                      element={<WatermarkRemoverPage />}
                    />
                  ))}
                  {[
                    '/tools/background-remover',
                    '/zh-CN/tools/background-remover',
                    '/en-US/tools/background-remover'
                  ].map((path) => (
                    <Route
                      key={path}
                      path={path}
                      element={<BackgroundRemoverPage />}
                    />
                  ))}
                  {[
                    '/tools/gpt-image-2-denoiser',
                    '/zh-CN/tools/gpt-image-2-denoiser',
                    '/en-US/tools/gpt-image-2-denoiser'
                  ].map((path) => (
                    <Route
                      key={path}
                      path={path}
                      element={<GptImage2DenoiserPage />}
                    />
                  ))}
                  {[
                    '/tools/image-compressor',
                    '/zh-CN/tools/image-compressor',
                    '/en-US/tools/image-compressor'
                  ].map((path) => (
                    <Route
                      key={path}
                      path={path}
                      element={<ImageCompressorPage />}
                    />
                  ))}
                  {[
                    '/tools/image-editor',
                    '/zh-CN/tools/image-editor',
                    '/en-US/tools/image-editor'
                  ].map((path) => (
                    <Route
                      key={path}
                      path={path}
                      element={<ImageEditorPage />}
                    />
                  ))}
                  <Route
                    path="/en-US/prompts/:slug"
                    element={<PromptDetailPage />}
                  />
                  <Route
                    path="/image/create"
                    element={<CreatorRouteRedirect />}
                  />
                  <Route
                    path="/zh-CN/image/create"
                    element={<CreatorRouteRedirect />}
                  />
                  <Route
                    path="/en-US/image/create"
                    element={<CreatorRouteRedirect />}
                  />
                  <Route
                    path="/zh-CN/create/assets"
                    element={
                      <ProtectedRoute>
                        <PromptAssetOpsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/en-US/create/assets"
                    element={
                      <ProtectedRoute>
                        <PromptAssetOpsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/blog" element={<LocaleRedirect to="/blog" />} />
                  <Route path="/zh-CN/blog" element={<UseCasesPage />} />
                  <Route path="/en-US/blog" element={<UseCasesPage />} />
                  <Route
                    path="/zh-CN/blog/:slug"
                    element={<BlogArticleDetailPage />}
                  />
                  <Route
                    path="/en-US/blog/:slug"
                    element={<BlogArticleDetailPage />}
                  />
                  <Route
                    path="/updates"
                    element={<LocaleRedirect to="/updates" />}
                  />
                  <Route path="/zh-CN/updates" element={<UpdatesPage />} />
                  <Route path="/en-US/updates" element={<UpdatesPage />} />
                  <Route
                    path="/links"
                    element={<LocaleRedirect to="/links" />}
                  />
                  <Route path="/zh-CN/links" element={<LinksPage />} />
                  <Route path="/en-US/links" element={<LinksPage />} />
                  <Route path="/pricing" element={<PricingRoutePage />} />
                  <Route path="/zh-CN/pricing" element={<PricingRoutePage />} />
                  <Route path="/en-US/pricing" element={<PricingRoutePage />} />
                  <Route
                    path="/moodboards/s/:token"
                    element={<PublicMoodboardShareRoute />}
                  />
                  <Route
                    path="/zh-CN/moodboards/s/:token"
                    element={<PublicMoodboardShareRoute />}
                  />
                  <Route
                    path="/en-US/moodboards/s/:token"
                    element={<PublicMoodboardShareRoute />}
                  />
                  <Route path="/recharge" element={<CreateRechargePage />} />
                  <Route
                    path="/zh-CN/recharge"
                    element={<CreateRechargePage />}
                  />
                  <Route
                    path="/en-US/recharge"
                    element={<CreateRechargePage />}
                  />
                  <Route
                    path="/workspace"
                    element={<LocaleRedirect to="/pricing" />}
                  />
                  <Route
                    path="/workspace/pricing"
                    element={<LocaleRedirect to="/pricing" />}
                  />
                  {/* 法律页面 */}
                  <Route path="/terms" element={<TermsPage />} />
                  <Route path="/zh-CN/terms" element={<TermsPage />} />
                  <Route path="/en-US/terms" element={<TermsPage />} />
                  <Route path="/privacy" element={<PrivacyPage />} />
                  <Route path="/zh-CN/privacy" element={<PrivacyPage />} />
                  <Route path="/en-US/privacy" element={<PrivacyPage />} />

                  {/* 公开分享页面 - 无需登录 */}
                  <Route path="/s/:token" element={<SharePage />} />

                  <Route path="/login" element={<AuthRouteModalLauncher />} />
                  <Route
                    path="/zh-CN/login"
                    element={<AuthRouteModalLauncher />}
                  />
                  <Route
                    path="/en-US/login"
                    element={<AuthRouteModalLauncher />}
                  />
                  <Route path="/auth/callback" element={<AuthCallback />} />
                  <Route
                    path="/zh-CN/auth/callback"
                    element={<AuthCallback />}
                  />
                  <Route
                    path="/en-US/auth/callback"
                    element={<AuthCallback />}
                  />

                  {/* Protected routes. */}
                  <Route
                    path="/boards"
                    element={
                      <ProtectedRoute>
                        <BoardsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/boards/:id"
                    element={
                      <ProtectedRoute>
                        <BoardsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/skills"
                    element={
                      <ProtectedRoute>
                        <BoardsPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* 404 页面 */}
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </LocaleGuard>
            </Suspense>
          </AuthModalProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  // Signal the pre-mount boot watchdog that the app bundle executed and the
  // React tree is being mounted, so a stale SSR handoff shell is not mistaken
  // for a stuck load.
  (
    window as Window & { __WEBTOMIND_APP_MOUNTED__?: boolean }
  ).__WEBTOMIND_APP_MOUNTED__ = true;
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </React.StrictMode>
  );
}
