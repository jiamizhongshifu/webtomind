import { useEffect, useMemo, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/shared/ui';
import { stripLocaleRoutePrefix } from '@/shared/seo-route-paths';
import {
  initializeAnalyticsPageView,
  loadGoogleAnalytics,
  setAnalyticsCollectionEnabled,
  updateAnalyticsConsent
} from '../lib/analytics';
import { isProductionAnalyticsHost } from '../lib/analytics-host';
import { isInternalAnalyticsTestRun } from '../lib/analytics-test-context';
import '../styles/analytics-consent.css';

const ANALYTICS_CONSENT_STORAGE_KEY = 'webtomind:analytics-consent:v1';

type AnalyticsConsent = 'granted' | 'denied' | null;

type ClarityConsentStorage = 'granted' | 'denied';

declare global {
  interface Window {
    clarity?: (
      command: 'consentv2',
      params: {
        ad_Storage: ClarityConsentStorage;
        analytics_Storage: ClarityConsentStorage;
      }
    ) => void;
  }
}

function syncClarityConsent(consent: AnalyticsConsent): void {
  if (typeof window.clarity !== 'function') return;
  const storage: ClarityConsentStorage =
    consent === 'granted' ? 'granted' : 'denied';
  window.clarity('consentv2', {
    ad_Storage: storage,
    analytics_Storage: storage
  });
}

export function isPublicAnalyticsRoute(pathname: string): boolean {
  const routePath = stripLocaleRoutePrefix(pathname);
  if (
    routePath === '/account' ||
    routePath.startsWith('/boards') ||
    routePath.startsWith('/settings') ||
    routePath.startsWith('/recharge') ||
    routePath.startsWith('/auth/') ||
    routePath === '/login'
  ) {
    return false;
  }

  return (
    routePath === '/' ||
    routePath === '/overview' ||
    routePath === '/create' ||
    routePath.startsWith('/create/') ||
    routePath === '/image/create' ||
    routePath === '/ai-image-generator' ||
    routePath.startsWith('/ai-image-style-grid') ||
    routePath.startsWith('/use-cases') ||
    routePath.startsWith('/blog') ||
    routePath.startsWith('/updates') ||
    routePath.startsWith('/links') ||
    routePath.startsWith('/prompts') ||
    routePath.startsWith('/skills') ||
    routePath.startsWith('/pricing') ||
    routePath.startsWith('/tools/') ||
    routePath === '/terms' ||
    routePath === '/privacy'
  );
}

function readAnalyticsConsent(): AnalyticsConsent {
  if (typeof window === 'undefined') return null;
  if (window.navigator.doNotTrack === '1') return 'denied';
  try {
    const stored = window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY);
    return stored === 'granted' || stored === 'denied' ? stored : null;
  } catch {
    return null;
  }
}

export function AnalyticsConsentGate() {
  const location = useLocation();
  const lastTrackedPathRef = useRef<string | null>(null);
  const [consent, setConsent] = useState<AnalyticsConsent>(() =>
    readAnalyticsConsent()
  );
  const isPublicRoute = useMemo(
    () => isPublicAnalyticsRoute(location.pathname),
    [location.pathname]
  );
  const isProductionHost = isProductionAnalyticsHost(window.location.hostname);
  const isEnglish = location.pathname.startsWith('/en-US');
  const hasMobilePromptNavigation = stripLocaleRoutePrefix(
    location.pathname
  ).startsWith('/prompts');
  const [revealed, setRevealed] = useState(false);

  // Insert the banner in its final fixed geometry but invisible, then reveal
  // on the next frame. Visibility/opacity changes do not create layout-shift
  // entries, so the late mount no longer shifts the page (CLS).
  useEffect(() => {
    const raf = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    syncClarityConsent(consent);
    const enabled =
      isPublicRoute &&
      consent !== 'denied' &&
      isProductionHost &&
      !isInternalAnalyticsTestRun();
    updateAnalyticsConsent(enabled ? 'granted' : 'denied');
    if (!enabled) {
      setAnalyticsCollectionEnabled(false);
      lastTrackedPathRef.current = null;
      return;
    }

    if (lastTrackedPathRef.current === location.pathname) {
      setAnalyticsCollectionEnabled(true);
      loadGoogleAnalytics();
      return;
    }
    lastTrackedPathRef.current = location.pathname;
    initializeAnalyticsPageView({
      // Search/hash values already live in page_location. Keep page_path
      // canonical so one product route does not fragment into many GA rows.
      path: location.pathname,
      location: window.location.href,
      title: document.title
    });
  }, [consent, isProductionHost, isPublicRoute, location.pathname]);

  const decide = (nextConsent: Exclude<AnalyticsConsent, null>) => {
    try {
      window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, nextConsent);
    } catch {
      // The in-memory choice still applies for this session.
    }
    setConsent(nextConsent);
  };

  if (!isProductionHost || !isPublicRoute || consent !== null) return null;

  const privacyPath = isEnglish ? '/en-US/privacy' : '/zh-CN/privacy';
  const titleId = 'analytics-consent-title';
  const descriptionId = 'analytics-consent-description';
  return (
    <aside
      className={`analytics-consent analytics-consent--deferred${revealed ? ' analytics-consent--visible' : ''}${hasMobilePromptNavigation ? ' analytics-consent--with-mobile-nav' : ''}`}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <span className="analytics-consent__mark" aria-hidden="true">
        <ShieldCheck size={17} strokeWidth={1.8} />
      </span>
      <div className="analytics-consent__content">
        <strong id={titleId}>
          {isEnglish ? 'Anonymous analytics' : '匿名统计'}
        </strong>
        <p id={descriptionId}>
          <span>
            {isEnglish
              ? 'Helps us improve. You can turn it off anytime without affecting access.'
              : '用于改进体验，可随时停用，不影响使用。'}
          </span>{' '}
          <Link to={privacyPath}>
            {isEnglish ? 'Privacy details' : '了解详情'}
          </Link>
        </p>
      </div>
      <div className="analytics-consent__actions">
        <Button
          type="button"
          variant="ghost"
          size="md"
          onClick={() => decide('denied')}
        >
          {isEnglish ? 'Turn off' : '停用'}
        </Button>
        <Button
          className="analytics-consent__accept"
          type="button"
          variant="primary"
          size="md"
          onClick={() => decide('granted')}
        >
          {isEnglish ? 'Got it' : '知道了'}
        </Button>
      </div>
    </aside>
  );
}
