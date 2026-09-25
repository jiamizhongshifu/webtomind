import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { installUiAuditMockRoutes } from './lib/ui-audit-fixtures.mjs';

const baseUrl =
  process.env.MOBILE_UI_AUDIT_BASE_URL ||
  process.env.BASE_URL ||
  'http://127.0.0.1:4173';
const outDir =
  process.env.MOBILE_UI_AUDIT_OUT_DIR ||
  path.join('output', 'mobile-ui-state-audit');
const useMockData = process.env.MOBILE_UI_AUDIT_MOCK_DATA !== '0';
const captureRouteScreenshots =
  process.env.MOBILE_UI_AUDIT_CAPTURE_ROUTES === '1';
const createOnboardingStorageKey = 'webtomind:create-onboarding-seen:v1';
const requestedProfile = (
  process.env.MOBILE_UI_AUDIT_PROFILE ||
  process.env.UI_AUDIT_PROFILE ||
  'mobile'
).toLowerCase();

const scenarioCatalog = {
  desktop: [
    {
      id: 'desktop-1440',
      label: 'desktop 1440x900',
      category: 'desktop',
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false
    },
    {
      id: 'desktop-1280',
      label: 'desktop 1280x800',
      category: 'desktop',
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false
    },
    {
      id: 'desktop-1024',
      label: 'desktop 1024x768',
      category: 'desktop',
      viewport: { width: 1024, height: 768 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false
    }
  ],
  tablet: [
    {
      id: 'tablet-landscape-1024',
      label: 'tablet landscape 1024x768',
      category: 'tablet',
      viewport: { width: 1024, height: 768 },
      deviceScaleFactor: 2,
      isMobile: false,
      hasTouch: true
    },
    {
      id: 'tablet-portrait-768',
      label: 'tablet portrait 768x1024',
      category: 'tablet',
      viewport: { width: 768, height: 1024 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true
    }
  ],
  mobile: [
    {
      id: 'mobile-430',
      label: 'mobile 430x932',
      category: 'mobile',
      viewport: { width: 430, height: 932 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true
    },
    {
      id: 'mobile-390',
      label: 'mobile 390x844',
      category: 'mobile',
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true
    }
  ],
  short: [
    {
      id: 'short-390',
      label: 'short mobile 390x667',
      category: 'mobile',
      viewport: { width: 390, height: 667 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      shortScreen: true
    },
    {
      id: 'short-360',
      label: 'short mobile 360x740',
      category: 'mobile',
      viewport: { width: 360, height: 740 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      shortScreen: true
    }
  ]
};

function parseViewportList(value) {
  if (!value) return null;
  const scenarios = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry, index) => {
      const match = entry.match(/^(\d{3,4})x(\d{3,4})$/i);
      if (!match) {
        throw new Error(
          `Invalid MOBILE_UI_AUDIT_VIEWPORTS entry "${entry}". Use WIDTHxHEIGHT, for example 1440x900.`
        );
      }
      const width = Number(match[1]);
      const height = Number(match[2]);
      const category =
        width >= 1024 ? 'desktop' : width >= 700 ? 'tablet' : 'mobile';
      return {
        id: `custom-${width}x${height}-${index + 1}`,
        label: `custom ${width}x${height}`,
        category,
        viewport: { width, height },
        deviceScaleFactor: category === 'desktop' ? 1 : 2,
        isMobile: category !== 'desktop',
        hasTouch: category !== 'desktop',
        shortScreen: height <= 740
      };
    });
  return scenarios.length ? scenarios : null;
}

function resolveScenarios() {
  const explicitViewports = parseViewportList(
    process.env.MOBILE_UI_AUDIT_VIEWPORTS || process.env.UI_AUDIT_VIEWPORTS
  );
  if (explicitViewports) return explicitViewports;

  const explicitWidth = Number(process.env.MOBILE_UI_AUDIT_WIDTH || 0);
  const explicitHeight = Number(process.env.MOBILE_UI_AUDIT_HEIGHT || 0);
  if (explicitWidth > 0 && explicitHeight > 0) {
    const category =
      explicitWidth >= 1024
        ? 'desktop'
        : explicitWidth >= 700
          ? 'tablet'
          : 'mobile';
    return [
      {
        id: `custom-${explicitWidth}x${explicitHeight}`,
        label: `custom ${explicitWidth}x${explicitHeight}`,
        category,
        viewport: { width: explicitWidth, height: explicitHeight },
        deviceScaleFactor: category === 'desktop' ? 1 : 2,
        isMobile: category !== 'desktop',
        hasTouch: category !== 'desktop',
        shortScreen: explicitHeight <= 740
      }
    ];
  }

  if (requestedProfile === 'all') {
    return [
      ...scenarioCatalog.desktop,
      ...scenarioCatalog.tablet,
      ...scenarioCatalog.mobile,
      ...scenarioCatalog.short
    ];
  }

  if (requestedProfile === 'wide') return scenarioCatalog.desktop;
  if (requestedProfile === 'phones') {
    return [...scenarioCatalog.mobile, ...scenarioCatalog.short];
  }

  const selected = scenarioCatalog[requestedProfile];
  if (!selected) {
    throw new Error(
      `Unknown MOBILE_UI_AUDIT_PROFILE "${requestedProfile}". Use mobile, short, tablet, desktop, phones, wide, all, or MOBILE_UI_AUDIT_VIEWPORTS=1440x900,390x667.`
    );
  }
  return selected;
}

const scenarios = resolveScenarios();
let activeScenario = scenarios[0];

const returningCreateRoutes = [
  {
    name: 'returning user create home',
    routePath: '/zh-CN/create',
    mainSelector:
      '.create-home-route .create-home-hero, .create-home-route .create-home-promptbox, .create-discovery-page .create-v2-hero, .create-discovery-page .create-v2-search'
  },
  {
    name: 'returning user create image',
    routePath: '/zh-CN/create/image',
    mainSelector: '.image-create-shell.creator-image-studio-shell'
  },
  {
    name: 'returning user create gallery',
    routePath: '/zh-CN/create/gallery',
    mainSelector:
      '.create-gallery-route .create-gallery-toolbar, .create-gallery-route .create-gallery-grid, .create-gallery-route .create-empty-state'
  },
  {
    name: 'returning user create video',
    routePath: '/zh-CN/create/video',
    mainSelector: '.create-video-route'
  },
  {
    name: 'returning user create characters',
    routePath: '/zh-CN/create/characters',
    mainSelector: '.create-characters-route'
  },
  {
    name: 'returning user create tasks',
    routePath: '/zh-CN/create/tasks',
    mainSelector: '.create-tasks-route'
  },
  {
    name: 'returning user create apps',
    routePath: '/zh-CN/create/apps',
    mainSelector: '.create-apps-route'
  },
  {
    name: 'returning user moodboard library',
    routePath: '/zh-CN/create/moodboards',
    mainSelector: '.moodboard-library-page'
  },
  {
    name: 'returning user new moodboard',
    routePath: '/zh-CN/create/moodboards/new',
    mainSelector: '.moodboard-new-page'
  },
  {
    name: 'returning user create pricing',
    routePath: '/zh-CN/create/pricing',
    mainSelector: '.create-pricing-page'
  },
  {
    name: 'returning user account',
    routePath: '/zh-CN/account',
    mainSelector: '.create-account-route'
  },
  {
    name: 'public prompt library',
    routePath: '/zh-CN/prompts',
    mainSelector: '.prompt-browser-main'
  },
  {
    name: 'returning user boards overview',
    routePath: '/boards',
    mainSelector:
      '.workspace-project-grid, .workspace-recent-media-card, .workspace-recent-text-card',
    density: {
      minProjectCards: 2,
      minRecentCards: 3
    }
  }
];

const localizedLegalRoutes = [
  {
    name: 'localized legal zh-CN terms',
    routePath: '/zh-CN/terms',
    expectedHeadingPattern: /服务条款|Terms of Service/i
  },
  {
    name: 'localized legal zh-CN privacy',
    routePath: '/zh-CN/privacy',
    expectedHeadingPattern: /隐私政策|Privacy Policy/i
  },
  {
    name: 'localized legal en-US terms',
    routePath: '/en-US/terms',
    expectedHeadingPattern: /Terms of Service|服务条款/i
  },
  {
    name: 'localized legal en-US privacy',
    routePath: '/en-US/privacy',
    expectedHeadingPattern: /Privacy Policy|隐私政策/i
  }
];

const failures = [];
const checks = [];

function urlFor(routePath) {
  return new URL(routePath, baseUrl).toString();
}

function pass(name, details = {}) {
  checks.push({
    scenario: activeScenario?.id || null,
    name: activeScenario ? `${activeScenario.id}: ${name}` : name,
    status: 'pass',
    details
  });
}

function skip(name, details = {}) {
  checks.push({
    scenario: activeScenario?.id || null,
    name: activeScenario ? `${activeScenario.id}: ${name}` : name,
    status: 'skip',
    details
  });
}

function fail(name, details = {}) {
  const item = {
    scenario: activeScenario?.id || null,
    name: activeScenario ? `${activeScenario.id}: ${name}` : name,
    status: 'fail',
    details
  };
  checks.push(item);
  failures.push(item);
}

async function goto(page, routePath) {
  let response = await page.goto(urlFor(routePath), {
    waitUntil: 'domcontentloaded',
    timeout: 45_000
  });
  // Vite preview can briefly answer a deep-link request with an empty 404 while
  // its output directory is being atomically refreshed. Retry once; persistent
  // or real 404s still flow through to the route assertion below.
  if (response?.status() === 404) {
    await page.waitForTimeout(150);
    response = await page.goto(urlFor(routePath), {
      waitUntil: 'domcontentloaded',
      timeout: 45_000
    });
  }
  await page
    .waitForLoadState('networkidle', { timeout: 8_000 })
    .catch(() => {});
  await page.waitForTimeout(700);
  return response?.status() ?? null;
}

async function ensureReturningCreateState(page) {
  await page.addInitScript((storageKey) => {
    try {
      window.localStorage.setItem(storageKey, '1');
      window.localStorage.setItem('workspace:onboarding-seen', '1');
    } catch {
      // The route assertion will report storage failures after navigation.
    }
  }, createOnboardingStorageKey);
}

async function collectRouteVisibility(page, mainSelector) {
  return page.evaluate(
    ({ selector, storageKey }) => {
      const isVisible = (el) => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity || '1') > 0 &&
          rect.width > 0 &&
          rect.height > 0
        );
      };
      const mainCandidates = Array.from(document.querySelectorAll(selector));
      const onboardingCandidates = Array.from(
        document.querySelectorAll(
          '.create-onboarding-backdrop, .create-onboarding-modal'
        )
      );
      const notFoundCandidates = Array.from(
        document.querySelectorAll('h2, h1, [aria-label]')
      );
      const visibleMain = mainCandidates.find(isVisible);
      const visibleOnboarding = onboardingCandidates.find(isVisible);
      const visibleNotFound = notFoundCandidates.find((el) => {
        if (!isVisible(el)) return false;
        const text = (
          el.textContent ||
          el.getAttribute('aria-label') ||
          ''
        ).trim();
        return (
          /^404$/.test(text) || /Oops! 页面走丢了|page not found/i.test(text)
        );
      });
      const rect = visibleMain?.getBoundingClientRect();

      return {
        url: window.location.href,
        title: document.title,
        onboardingStorageValue: window.localStorage.getItem(storageKey),
        mainSelector: selector,
        mainVisible: Boolean(visibleMain),
        mainText: (visibleMain?.textContent || '').trim().slice(0, 160),
        mainRect: rect
          ? {
              left: Math.round(rect.left),
              top: Math.round(rect.top),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              bottom: Math.round(rect.bottom)
            }
          : null,
        onboardingVisible: Boolean(visibleOnboarding),
        notFoundVisible: Boolean(visibleNotFound),
        notFoundText: (visibleNotFound?.textContent || '').trim().slice(0, 120)
      };
    },
    { selector: mainSelector, storageKey: createOnboardingStorageKey }
  );
}

async function collectBoardsOverviewDensity(page) {
  return page.evaluate(() => {
    const isVisible = (el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || '1') > 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const rectFor = (el) => {
      const rect = el.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        bottom: Math.round(rect.bottom)
      };
    };
    const projectCards = Array.from(
      document.querySelectorAll('.workspace-project-grid .ui-card')
    ).filter(isVisible);
    const recentCards = Array.from(
      document.querySelectorAll(
        '.workspace-recent-media-card, .workspace-recent-text-card'
      )
    ).filter(isVisible);
    const doc = document.documentElement;
    const body = document.body;
    const scrollWidth = Math.max(doc.scrollWidth, body?.scrollWidth || 0);

    return {
      projectCardCount: projectCards.length,
      recentCardCount: recentCards.length,
      projectRects: projectCards.slice(0, 4).map(rectFor),
      recentRects: recentCards.slice(0, 4).map(rectFor),
      clientWidth: doc.clientWidth,
      scrollWidth,
      horizontalOverflow: scrollWidth - doc.clientWidth
    };
  });
}

async function collectLegalRouteState(page, expectedHeadingPattern) {
  return page.evaluate((patternSource) => {
    const expectedHeadingRegex = new RegExp(patternSource, 'i');
    const isVisible = (el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || '1') > 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const headings = Array.from(document.querySelectorAll('h1, h2'));
    const visibleHeadings = headings
      .filter(isVisible)
      .map((heading) => (heading.textContent || '').trim())
      .filter(Boolean);
    const visible404 = visibleHeadings.some((text) => {
      return (
        /^404$/.test(text) || /Oops! 页面走丢了|page not found/i.test(text)
      );
    });
    const expectedHeadingVisible = visibleHeadings.some((text) =>
      expectedHeadingRegex.test(text)
    );
    const main = Array.from(document.querySelectorAll('main')).find(isVisible);
    const mainRect = main?.getBoundingClientRect();

    return {
      url: window.location.href,
      title: document.title,
      titleIsNotFound: /^404\b/i.test(document.title.trim()),
      visible404,
      expectedHeadingVisible,
      visibleHeadings: visibleHeadings.slice(0, 8),
      mainVisible: Boolean(main),
      mainRect: mainRect
        ? {
            top: Math.round(mainRect.top),
            width: Math.round(mainRect.width),
            height: Math.round(mainRect.height)
          }
        : null,
      bodyTextSample: (document.body?.innerText || '').trim().slice(0, 240)
    };
  }, expectedHeadingPattern.source);
}

async function screenshot(page, name) {
  const scenarioId = activeScenario?.id || 'default';
  const width = activeScenario?.viewport.width || 0;
  await page.screenshot({
    path: path.join(outDir, `${scenarioId}-${name}-${width}.png`),
    fullPage: false
  });
}

async function collectAuthenticatedFixtureState(page, selectors = []) {
  return page
    .evaluate((selectorList) => {
      const isVisible = (el) => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity || '1') > 0 &&
          rect.width > 0 &&
          rect.height > 0
        );
      };
      const visibleText = (document.body?.innerText || '').trim();
      const loginSignals = Array.from(document.querySelectorAll('a, button'))
        .filter(isVisible)
        .filter((el) => {
          const href = el.getAttribute('href') || '';
          const ariaLabel = el.getAttribute('aria-label') || '';
          const text = `${el.textContent || ''} ${ariaLabel}`.trim();
          return (
            /\/login\b|\/sign-in\b|\/auth\b/i.test(href) ||
            /^(登录|注册|sign in|sign up|log in)$/i.test(text)
          );
        })
        .map((el) =>
          (el.textContent || el.getAttribute('aria-label') || '').trim()
        )
        .filter(Boolean)
        .slice(0, 20);
      const expectedVisible = selectorList.some((selector) =>
        Array.from(document.querySelectorAll(selector)).some(isVisible)
      );
      const loginVisible = loginSignals.some((text) =>
        /登录|注册|sign in|sign up|log in/i.test(text)
      );

      return {
        url: window.location.href,
        pathname: window.location.pathname,
        title: document.title,
        expectedVisible,
        loginVisible,
        bodySample: visibleText.slice(0, 220),
        selectors: selectorList
      };
    }, selectors)
    .catch((error) => ({
      url: page.url(),
      expectedVisible: false,
      loginVisible: false,
      selectors,
      evaluateError: error.message
    }));
}

async function ensureAuthenticatedFixture(page, name, selectors) {
  const state = await collectAuthenticatedFixtureState(page, selectors);
  const looksUnauthenticated =
    /\/login\b|\/sign-in\b|\/auth\b/i.test(state.pathname || '') ||
    (state.loginVisible && !state.expectedVisible);

  if (!looksUnauthenticated) return { ok: true, state };

  fail(`${name}: authenticated fixture`, {
    group: 'auth',
    fixtureState: 'unauthenticated',
    ...state
  });
  await screenshot(page, `${name.replace(/\W+/g, '-')}-auth-fixture`).catch(
    () => {}
  );
  return { ok: false, state };
}

async function assertNoHorizontalOverflow(page, name) {
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    return {
      clientWidth: doc.clientWidth,
      scrollWidth: Math.max(doc.scrollWidth, body?.scrollWidth || 0),
      overflow:
        Math.max(doc.scrollWidth, body?.scrollWidth || 0) - doc.clientWidth
    };
  });

  if (metrics.overflow > 1) fail(`${name}: no horizontal overflow`, metrics);
  else pass(`${name}: no horizontal overflow`, metrics);
}

async function assertMobileDialog(page, name, selector) {
  // The dialog opens with a 220 ms scale animation. Measuring mid-animation
  // shrinks otherwise valid 44 px controls to 42–43 px and creates a false
  // touch-target failure, so sample only after the transition settles.
  await page.waitForTimeout(250);
  const metrics = await page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const close = el.querySelector(
        'button[aria-label*="关闭"], button[aria-label*="Close"]'
      );
      const closeRect = close?.getBoundingClientRect();
      const actions = el.querySelector('.creator-preview-actions');
      const prompt = el.querySelector('.creator-preview-prompt');
      const meta = el.querySelector('.creator-preview-meta');
      const actionsRect = actions?.getBoundingClientRect();
      const promptRect = prompt?.getBoundingClientRect();
      const metaRect = meta?.getBoundingClientRect();
      const actionsStyle = actions ? window.getComputedStyle(actions) : null;
      const headerControls = Array.from(
        el.querySelectorAll(
          '.creator-preview-head button, .creator-preview-head a'
        )
      )
        .filter((control) => {
          const style = window.getComputedStyle(control);
          const controlRect = control.getBoundingClientRect();
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            Number(style.opacity || '1') > 0 &&
            controlRect.width > 0 &&
            controlRect.height > 0
          );
        })
        .map((control) => {
          const controlRect = control.getBoundingClientRect();
          return {
            text: (
              control.textContent ||
              control.getAttribute('aria-label') ||
              ''
            )
              .trim()
              .slice(0, 80),
            left: Math.round(controlRect.left),
            right: Math.round(controlRect.right),
            top: Math.round(controlRect.top),
            bottom: Math.round(controlRect.bottom),
            width: Math.round(controlRect.width),
            height: Math.round(controlRect.height)
          };
        });
      const rectOverlaps = (first, second) => {
        if (!first || !second) return false;
        return (
          first.left < second.right - 1 &&
          first.right > second.left + 1 &&
          first.top < second.bottom - 1 &&
          first.bottom > second.top + 1
        );
      };
      return {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        closeWidth: closeRect ? Math.round(closeRect.width) : null,
        closeHeight: closeRect ? Math.round(closeRect.height) : null,
        actionsPosition: actionsStyle?.position || null,
        actionsOverlapPrompt: rectOverlaps(actionsRect, promptRect),
        actionsOverlapMeta: rectOverlaps(actionsRect, metaRect),
        headerControls
      };
    });

  const inViewport =
    metrics.left >= -1 &&
    metrics.top >= -1 &&
    metrics.right <= metrics.viewportWidth + 1 &&
    metrics.bottom <= metrics.viewportHeight + 1;
  const requireTouchTarget = activeScenario?.hasTouch !== false;
  const closeReady =
    metrics.closeWidth === null ||
    !requireTouchTarget ||
    (metrics.closeWidth >= 44 && metrics.closeHeight >= 44);
  const actionsReady =
    metrics.actionsPosition === null ||
    (metrics.actionsPosition !== 'sticky' &&
      metrics.actionsPosition !== 'fixed' &&
      metrics.actionsPosition !== 'absolute' &&
      !metrics.actionsOverlapPrompt &&
      !metrics.actionsOverlapMeta);
  const headerControlsReady = metrics.headerControls.every((control) => {
    const inViewport =
      control.left >= -1 &&
      control.top >= -1 &&
      control.right <= metrics.viewportWidth + 1 &&
      control.bottom <= metrics.viewportHeight + 1;
    if (!requireTouchTarget) return inViewport;
    return inViewport && control.width >= 44 && control.height >= 44;
  });

  if (!inViewport || !closeReady || !actionsReady || !headerControlsReady) {
    fail(`${name}: dialog bounds`, metrics);
  } else pass(`${name}: dialog bounds`, metrics);
}

async function clickFirstVisible(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count();
    for (let index = 0; index < Math.min(count, 8); index += 1) {
      const item = locator.nth(index);
      if (!(await item.isVisible().catch(() => false))) continue;
      await item.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => {});
      await item.click({ timeout: 5_000 }).catch(async (error) => {
        await item.click({ timeout: 2_000, force: true }).catch(() => {
          throw error;
        });
      });
      return selector;
    }
  }
  return null;
}

async function dismissOptionalPreviewGate(page) {
  const continueButtons = [
    page.getByRole('button', { name: /继续预览|Continue preview/i }).first(),
    page.getByRole('button', { name: /关闭|Close/i }).first()
  ];
  for (const button of continueButtons) {
    if (await button.isVisible().catch(() => false)) {
      await button.click({ timeout: 3_000 }).catch(() => {});
      await page.waitForTimeout(120);
      return true;
    }
  }
  return false;
}

async function waitForAnyVisible(page, selectors, timeout = 8_000) {
  return page
    .waitForFunction(
      (selectorList) => {
        const isVisible = (el) => {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            Number(style.opacity || '1') > 0 &&
            rect.width > 0 &&
            rect.height > 0
          );
        };
        return selectorList.some((selector) =>
          Array.from(document.querySelectorAll(selector)).some(isVisible)
        );
      },
      selectors,
      { timeout }
    )
    .then(() => true)
    .catch(() => false);
}

async function installMockRoutes(context) {
  await context.route(
    /(?:google-analytics\.com|googletagmanager\.com|doubleclick\.net)/,
    (route) => route.abort('blockedbyclient')
  );
  await installUiAuditMockRoutes(context, {
    baseUrl,
    enabled: useMockData,
    seedAuthSession: true
  });
}

// Verify actual stylesheet cascade and keyboard state, beyond source contracts.
async function checkWorkspaceMotion(page) {
  const surfaces = [
    {
      path: '/zh-CN/create',
      image: '.discovery-image-tile img',
      control: '.discovery-tile-primary'
    },
    {
      path: '/zh-CN/create/moodboards',
      image: '.moodboard-library-cover-stack img',
      control: '.moodboard-library-card-primary'
    }
  ];
  for (const surface of surfaces) {
    await goto(page, surface.path);
    const control = page.locator(surface.control).first();
    if (!(await waitForAnyVisible(page, [surface.control]))) {
      if (useMockData) {
        fail('workspace motion: fixture missing', { route: surface.path });
      } else {
        skip('workspace motion: no visible data', { route: surface.path });
      }
      continue;
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const motion = await page.locator(surface.image).evaluateAll((images) =>
      images.map((image) => {
        const style = getComputedStyle(image);
        return {
          transitionDuration: style.transitionDuration,
          animationName: style.animationName
        };
      })
    );
    const reduced = motion.length > 0 && motion.every((style) =>
      style.transitionDuration.split(',').every((duration) => parseFloat(duration) === 0) &&
      style.animationName.split(',').every((name) => name.trim() === 'none')
    );
    (reduced ? pass : fail)('workspace motion: reduced computed styles', {
      route: surface.path, motion
    });

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.mouse.move(0, 0);
    await page.keyboard.press('Tab');
    await control.focus();
    const focus = await control.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        active: document.activeElement === element,
        visible: element.matches(':focus-visible'),
        outlineWidth: parseFloat(style.outlineWidth),
        outlineStyle: style.outlineStyle
      };
    });
    (focus.active && focus.visible && focus.outlineWidth >= 3 && focus.outlineStyle === 'solid'
      ? pass : fail)('workspace motion: keyboard focus ring', {
        route: surface.path, focus
      });
  }
}

async function checkPromptCasePreview(page) {
  await goto(page, '/zh-CN/create');
  await assertNoHorizontalOverflow(page, 'create home');
  if (await waitForAnyVisible(page, ['.create-discovery-page'], 1_000)) {
    const discoveryReady = await waitForAnyVisible(page, [
      '.discovery-image-tile'
    ]);
    if (discoveryReady) {
      const firstCard = page.locator('.discovery-image-tile').first();
      await firstCard.locator('.discovery-tile-primary').click();
      await page.waitForURL(
        (url) => url.pathname === '/zh-CN/create' &&
          url.searchParams.get('gallery') === 'images' &&
          Boolean(url.searchParams.get('preview')),
        { waitUntil: 'domcontentloaded', timeout: 5_000 }
      );
      const previewVisible = await waitForAnyVisible(page, [
        '.discovery-preview-page'
      ]);
      if (!previewVisible) {
        fail('prompt case preview: open state', {
          surface: 'create-discovery-v2',
          reason: 'inspiration image preview did not become visible'
        });
        await screenshot(page, 'prompt-case-detail-missing');
        return;
      }
      pass('prompt case preview: open state', {
        surface: 'create-discovery-v2',
        interaction: 'discovery card opened the in-workspace image preview'
      });
    } else {
      fail('prompt case preview: open state', {
        reason: 'v2 discovery image card did not resolve'
      });
      await screenshot(page, 'prompt-case-card-missing');
    }
    return;
  }
  await page
    .locator('#prompt-cases, .create-case-strip')
    .first()
    .scrollIntoViewIfNeeded({ timeout: 4_000 })
    .catch(() => {});
  await page.waitForTimeout(250);

  const clickedSelector = await clickFirstVisible(page, [
    '.create-case-library-masonry .prompt-browser-case-card',
    '#prompt-cases .create-case-card',
    '.create-case-strip .create-case-card',
    '.creator-prompt-case-card',
    '.prompt-case-card'
  ]);
  if (!clickedSelector) {
    fail('prompt case preview: open state', {
      reason: 'no visible prompt case card'
    });
    await screenshot(page, 'prompt-case-card-missing');
    return;
  }

  try {
    await page
      .locator('.creator-preview-backdrop, .create-gallery-preview-backdrop')
      .first()
      .waitFor({ state: 'visible', timeout: 6_000 });
  } catch (error) {
    fail('prompt case preview: open state', {
      clickedSelector,
      error: error instanceof Error ? error.message : String(error)
    });
    await screenshot(page, 'prompt-case-preview-open-failed');
    return;
  }
  await assertMobileDialog(page, 'prompt case preview', '.creator-preview');
  await assertNoHorizontalOverflow(page, 'prompt case preview open');
  await screenshot(page, 'prompt-case-preview');
}

async function checkPromptBrowserPreview(page) {
  await goto(page, '/zh-CN/prompts');
  await assertNoHorizontalOverflow(page, 'prompt browser');
  await waitForAnyVisible(page, ['.prompt-browser-case-card']);

  const clickedSelector = await clickFirstVisible(page, [
    '.prompt-browser-case-card'
  ]);
  if (!clickedSelector) {
    fail('prompt browser preview: open state', {
      reason: 'no visible prompt browser case card'
    });
    await screenshot(page, 'prompt-browser-card-missing');
    return;
  }

  try {
    await page
      .locator('.creator-preview-backdrop, .create-gallery-preview-backdrop')
      .first()
      .waitFor({ state: 'visible', timeout: 6_000 });
  } catch (error) {
    fail('prompt browser preview: open state', {
      clickedSelector,
      error: error instanceof Error ? error.message : String(error)
    });
    await screenshot(page, 'prompt-browser-preview-open-failed');
    return;
  }

  await assertMobileDialog(page, 'prompt browser preview', '.creator-preview');
  await assertNoHorizontalOverflow(page, 'prompt browser preview open');
  await screenshot(page, 'prompt-browser-preview');
}

async function checkCreditsUpgradePrompt(page, routePath) {
  // 全局右下角升级提示防回归：免费用户可见、套餐页隐藏、视口内、
  // 移动端在底部导航上方且关闭按钮满足 44px 触控尺寸。
  const prompt = page.locator('.credits-upgrade-prompt');

  if (routePath === '/zh-CN/create/pricing') {
    const visible = (await prompt.count()) > 0 ? await prompt.isVisible() : false;
    if (visible) {
      fail('credits upgrade prompt hidden on pricing', { routePath });
    } else {
      pass('credits upgrade prompt hidden on pricing', { routePath });
    }
    return;
  }

  if (routePath !== '/zh-CN/create' && routePath !== '/zh-CN/create/image') {
    return;
  }

  await prompt.waitFor({ state: 'visible', timeout: 4_000 }).catch(() => {});
  const visible = (await prompt.count()) > 0 ? await prompt.isVisible() : false;
  if (!visible) {
    fail('credits upgrade prompt visible for free user', {
      routePath,
      reason: 'prompt did not become visible'
    });
    return;
  }

  const box = await prompt.boundingBox();
  const viewport = page.viewportSize();
  const inViewport =
    box &&
    viewport &&
    box.x >= 0 &&
    box.y >= 0 &&
    box.x + box.width <= viewport.width + 1 &&
    box.y + box.height <= viewport.height + 1;
  if (!inViewport) {
    fail('credits upgrade prompt inside viewport', { routePath, box, viewport });
  } else {
    pass('credits upgrade prompt inside viewport', { routePath, box, viewport });
  }

  const href = await prompt
    .locator('a.credits-upgrade-prompt__link')
    .getAttribute('href');
  if (
    href &&
    href.includes('/create/pricing?') &&
    href.includes('source=credits_upgrade_prompt')
  ) {
    pass('credits upgrade prompt links to pricing', { routePath, href });
  } else {
    fail('credits upgrade prompt links to pricing', { routePath, href });
  }

  const isMobile = !viewport || viewport.width < 768;
  if (isMobile) {
    const closeBox = await prompt
      .locator('button.credits-upgrade-prompt__close')
      .boundingBox();
    const touchReady =
      closeBox && closeBox.width >= 44 && closeBox.height >= 44;
    const aboveNav =
      box && viewport && box.y + box.height <= viewport.height - 56;
    if (touchReady && aboveNav) {
      pass('credits upgrade prompt mobile touch and nav clearance', {
        routePath,
        closeBox,
        box
      });
    } else {
      fail('credits upgrade prompt mobile touch and nav clearance', {
        routePath,
        closeBox,
        box
      });
    }
  }

  if (routePath === '/zh-CN/create/image') {
    const dock = page.locator('.create-studio-composer-dock').first();
    const dockBox = await dock.boundingBox().catch(() => null);
    const overlaps =
      box &&
      dockBox &&
      box.x < dockBox.x + dockBox.width &&
      box.x + box.width > dockBox.x &&
      box.y < dockBox.y + dockBox.height &&
      box.y + box.height > dockBox.y;
    if (overlaps) {
      fail('credits upgrade prompt clears composer dock', {
        routePath,
        box,
        dockBox
      });
    } else {
      pass('credits upgrade prompt clears composer dock', {
        routePath,
        box,
        dockBox
      });
    }
  }
}

async function checkReturningCreateRoutes(page) {
  for (const route of returningCreateRoutes) {
    await ensureReturningCreateState(page);
    const status = await goto(page, route.routePath);
    // Route components are lazy-loaded. A successful navigation can still be
    // showing the application loading shell for a moment, especially after a
    // preceding viewport has evicted chunks from the browser cache. Wait for
    // the route's own content before evaluating visibility; the metrics below
    // still report a real failure when it never becomes visible.
    await page
      .locator(route.mainSelector)
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 })
      .catch(() => undefined);
    await assertNoHorizontalOverflow(page, route.name);
    if (
      route.routePath === '/zh-CN/create' ||
      route.routePath === '/zh-CN/create/pricing' ||
      route.routePath === '/zh-CN/create/image'
    ) {
      await checkCreditsUpgradePrompt(page, route.routePath);
    }
    const metrics = await collectRouteVisibility(page, route.mainSelector);
    const details = { routePath: route.routePath, status, ...metrics };

    if (status !== null && status >= 400) {
      fail(`${route.name}: route reachable`, details);
      continue;
    }

    if (metrics.onboardingStorageValue !== '1') {
      fail(`${route.name}: onboarding storage is set`, details);
      continue;
    }

    if (
      metrics.onboardingVisible ||
      metrics.notFoundVisible ||
      !metrics.mainVisible
    ) {
      fail(`${route.name}: main content visible without onboarding`, details);
      await screenshot(
        page,
        route.name
          .replace(/[^a-z0-9]+/gi, '-')
          .replace(/^-|-$/g, '')
          .toLowerCase()
      );
    } else {
      pass(`${route.name}: main content visible without onboarding`, details);
      if (captureRouteScreenshots) {
        await screenshot(
          page,
          `route-${route.name
            .replace(/[^a-z0-9]+/gi, '-')
            .replace(/^-|-$/g, '')
            .toLowerCase()}`
        );
      }
    }

    if (route.density) {
      const density = await collectBoardsOverviewDensity(page);
      const densityDetails = { routePath: route.routePath, ...density };
      if (
        density.projectCardCount < route.density.minProjectCards ||
        density.recentCardCount < route.density.minRecentCards ||
        density.horizontalOverflow > 1
      ) {
        fail(`${route.name}: card density and overflow`, densityDetails);
        await screenshot(
          page,
          `${route.name
            .replace(/[^a-z0-9]+/gi, '-')
            .replace(/^-|-$/g, '')
            .toLowerCase()}-density`
        );
      } else {
        pass(`${route.name}: card density and overflow`, densityDetails);
      }
    }
  }
}

async function checkResponsiveToolbarAndAccountContainment(page) {
  await ensureReturningCreateState(page);
  await goto(page, '/zh-CN/create/gallery');
  const toolbar = page.locator('.create-gallery-toolbar').first();
  await toolbar.waitFor({ state: 'visible', timeout: 10_000 });

  const toolbarMetrics = await page.evaluate(() => {
    const root = document.querySelector('.create-gallery-toolbar');
    if (!(root instanceof HTMLElement)) return { found: false };
    const rootRect = root.getBoundingClientRect();
    const selectors = [
      '.create-gallery-category-tabs',
      '.create-gallery-search-input',
      '.create-gallery-model-filter',
      '.create-gallery-refresh-button',
      '.create-gallery-mobile-filter-button'
    ];
    const controls = selectors.flatMap((selector) =>
      Array.from(root.querySelectorAll(selector))
        .filter((node) => {
          const style = window.getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            rect.width > 0 &&
            rect.height > 0
          );
        })
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            selector,
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            top: Math.round(rect.top),
            bottom: Math.round(rect.bottom),
            contained:
              rect.left >= rootRect.left - 1 &&
              rect.right <= rootRect.right + 1 &&
              rect.top >= rootRect.top - 1 &&
              rect.bottom <= rootRect.bottom + 1
          };
        })
    );
    return {
      found: true,
      width: Math.round(rootRect.width),
      height: Math.round(rootRect.height),
      viewportWidth: window.innerWidth,
      controls
    };
  });

  const toolbarReady =
    toolbarMetrics.found &&
    toolbarMetrics.controls?.length >= 3 &&
    toolbarMetrics.controls.every((control) => control.contained) &&
    (toolbarMetrics.viewportWidth > 840 ||
      toolbarMetrics.controls.some(
        (control) => control.selector === '.create-gallery-mobile-filter-button'
      ));

  if (toolbarReady) {
    pass('gallery: responsive toolbar containment', toolbarMetrics);
  } else {
    fail('gallery: responsive toolbar containment', toolbarMetrics);
    await screenshot(page, 'gallery-toolbar-containment-failed');
  }

  await goto(page, '/zh-CN/account');
  await page
    .locator('.create-account-main')
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 });
  const accountMetrics = await page.evaluate(() => {
    const main = document.querySelector('.create-account-main');
    const invite = document.querySelector('.create-account-invite-card');
    const preferences = document.querySelector('.create-account-section');
    if (
      !(main instanceof HTMLElement) ||
      !(invite instanceof HTMLElement) ||
      !(preferences instanceof HTMLElement)
    ) {
      return { found: false };
    }
    const mainRect = main.getBoundingClientRect();
    const inviteRect = invite.getBoundingClientRect();
    const preferencesRect = preferences.getBoundingClientRect();
    const overlapWidth = Math.max(
      0,
      Math.min(inviteRect.right, preferencesRect.right) -
        Math.max(inviteRect.left, preferencesRect.left)
    );
    const overlapHeight = Math.max(
      0,
      Math.min(inviteRect.bottom, preferencesRect.bottom) -
        Math.max(inviteRect.top, preferencesRect.top)
    );
    return {
      found: true,
      viewportWidth: window.innerWidth,
      mainDisplay: window.getComputedStyle(main).display,
      mainLeft: Math.round(mainRect.left),
      mainRight: Math.round(mainRect.right),
      mainScrollWidth: main.scrollWidth,
      mainClientWidth: main.clientWidth,
      inviteScrollWidth: invite.scrollWidth,
      inviteClientWidth: invite.clientWidth,
      overlapArea: Math.round(overlapWidth * overlapHeight)
    };
  });

  const accountReady =
    accountMetrics.found &&
    accountMetrics.mainLeft >= -1 &&
    accountMetrics.mainRight <= accountMetrics.viewportWidth + 1 &&
    accountMetrics.mainScrollWidth <= accountMetrics.mainClientWidth + 1 &&
    accountMetrics.inviteScrollWidth <= accountMetrics.inviteClientWidth + 1 &&
    accountMetrics.overlapArea === 0 &&
    (accountMetrics.viewportWidth > 920 ||
      accountMetrics.mainDisplay === 'block');

  if (accountReady) {
    pass('account: responsive card containment', accountMetrics);
  } else {
    fail('account: responsive card containment', accountMetrics);
    await screenshot(page, 'account-card-containment-failed');
  }
}

async function checkMobileAssetPicker(page) {
  await goto(
    page,
    '/__dev/creative-workspace-controls-harness?mode=asset-picker'
  );
  await page.locator('.creator-picker').waitFor({ state: 'visible' });
  const metrics = await page.evaluate(() => {
    const picker = document.querySelector('.creator-picker');
    const grid = document.querySelector('.creator-picker-grid');
    const pickerRect = picker?.getBoundingClientRect();
    const gridRect = grid?.getBoundingClientRect();
    const cards = Array.from(
      document.querySelectorAll('.creator-picker-card')
    ).map((card) => {
      const cardRect = card.getBoundingClientRect();
      const thumb = card.querySelector('.creator-asset-thumb');
      const title = card.querySelector(':scope > span');
      const thumbRect = thumb?.getBoundingClientRect();
      const titleRect = title?.getBoundingClientRect();
      return {
        width: cardRect.width,
        height: cardRect.height,
        thumbWidth: thumbRect?.width || 0,
        thumbHeight: thumbRect?.height || 0,
        thumbFillRatio:
          thumbRect && cardRect.width > 0
            ? Number((thumbRect.width / cardRect.width).toFixed(2))
            : 0,
        thumbContained: Boolean(
          thumbRect &&
          thumbRect.left >= cardRect.left - 0.5 &&
          thumbRect.right <= cardRect.right + 0.5 &&
          thumbRect.top >= cardRect.top - 0.5 &&
          thumbRect.bottom <= cardRect.bottom + 0.5
        ),
        titleClear: Boolean(
          !thumbRect || !titleRect || thumbRect.bottom <= titleRect.top + 0.5
        )
      };
    });
    return {
      viewport: { width: innerWidth, height: innerHeight },
      picker: pickerRect?.toJSON() || null,
      grid: gridRect?.toJSON() || null,
      rootOverflow: Math.max(
        0,
        document.documentElement.scrollWidth - innerWidth
      ),
      cards
    };
  });
  const brokenCards = metrics.cards.filter(
    (card) =>
      !card.thumbContained ||
      !card.titleClear ||
      card.thumbFillRatio < 0.78 ||
      Math.abs(card.thumbWidth - card.thumbHeight) > 1
  );
  const pickerContained = Boolean(
    metrics.picker &&
    metrics.picker.left >= -0.5 &&
    metrics.picker.right <= metrics.viewport.width + 0.5 &&
    metrics.picker.top >= -0.5 &&
    metrics.picker.bottom <= metrics.viewport.height + 0.5
  );
  if (
    pickerContained &&
    metrics.rootOverflow <= 1 &&
    metrics.cards.length > 0 &&
    brokenCards.length === 0
  ) {
    pass('asset picker: mobile thumbnail geometry', metrics);
  } else {
    fail('asset picker: mobile thumbnail geometry', {
      ...metrics,
      brokenCards
    });
    await screenshot(page, 'asset-picker-thumbnail-geometry');
  }
}

async function checkCurrentComboThumbnails(page) {
  await goto(
    page,
    '/__dev/creative-workspace-controls-harness?mode=creator-canvas'
  );
  await page.locator('.creator-slot').first().waitFor({ state: 'visible' });
  const cards = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.creator-slot'))
      .map((card) => {
        const thumb = card.querySelector(':scope > .creator-asset-thumb');
        if (!thumb) return null;
        const title = card.querySelector(':scope > strong');
        const description = card.querySelector(':scope > small');
        const cardRect = card.getBoundingClientRect();
        const thumbRect = thumb.getBoundingClientRect();
        const titleRect = title?.getBoundingClientRect();
        const descriptionRect = description?.getBoundingClientRect();
        return {
          card: cardRect.toJSON(),
          thumb: thumbRect.toJSON(),
          title: titleRect?.toJSON() || null,
          description: descriptionRect?.toJSON() || null,
          contained:
            thumbRect.left >= cardRect.left - 0.5 &&
            thumbRect.right <= cardRect.right + 0.5 &&
            thumbRect.top >= cardRect.top - 0.5 &&
            thumbRect.bottom <= cardRect.bottom + 0.5,
          clearsTitle: !titleRect || thumbRect.bottom <= titleRect.top + 0.5,
          clearsDescription:
            !descriptionRect || thumbRect.bottom <= descriptionRect.top + 0.5
        };
      })
      .filter(Boolean)
  );
  const brokenCards = cards.filter(
    (card) => !card.contained || !card.clearsTitle || !card.clearsDescription
  );
  if (cards.length > 0 && brokenCards.length === 0) {
    pass('current combo: selected thumbnail geometry', { cards });
  } else {
    fail('current combo: selected thumbnail geometry', {
      cards,
      brokenCards
    });
    await screenshot(page, 'current-combo-thumbnail-geometry');
  }
}

async function checkMobileBottomNavigation(page) {
  if (!activeScenario?.hasTouch || activeScenario.viewport.width > 1024) {
    pass('mobile bottom navigation: skipped outside touch layout', {
      viewport: activeScenario?.viewport || null
    });
    return;
  }
  await goto(page, '/zh-CN/create');
  await page.evaluate(() => {
    window.localStorage.setItem('webtomind_theme', 'dark');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.create-mobile-nav').waitFor({ state: 'visible' });
  const metrics = await page.evaluate(() => {
    const parse = (value) => {
      const match = String(value).match(
        /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/i
      );
      if (!match) return null;
      return {
        r: Number(match[1]),
        g: Number(match[2]),
        b: Number(match[3]),
        a: match[4] === undefined ? 1 : Number(match[4])
      };
    };
    const luminance = ({ r, g, b }) => {
      const channels = [r, g, b].map((channel) => {
        const value = channel / 255;
        return value <= 0.03928
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const darkSurface = { r: 26, g: 26, b: 26 };
    return Array.from(
      document.querySelectorAll('.create-mobile-nav a:not(.active)')
    ).map((link) => {
      const icon = link.querySelector('svg');
      const foreground = parse(getComputedStyle(icon || link).color);
      const composited = foreground
        ? {
            r: foreground.r * foreground.a + darkSurface.r * (1 - foreground.a),
            g: foreground.g * foreground.a + darkSurface.g * (1 - foreground.a),
            b: foreground.b * foreground.a + darkSurface.b * (1 - foreground.a)
          }
        : darkSurface;
      const lighter = Math.max(luminance(composited), luminance(darkSurface));
      const darker = Math.min(luminance(composited), luminance(darkSurface));
      return {
        label: link.textContent?.trim() || '',
        color: getComputedStyle(icon || link).color,
        contrast: Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2))
      };
    });
  });
  if (metrics.length > 0 && metrics.every((item) => item.contrast >= 3)) {
    pass('mobile bottom navigation: dark inactive icon contrast', metrics);
  } else {
    fail('mobile bottom navigation: dark inactive icon contrast', metrics);
    await screenshot(page, 'mobile-bottom-nav-dark-contrast');
  }
}

async function checkCreateSideNavAuthenticatedState(page) {
  const scenario = activeScenario;
  if (!scenario || scenario.viewport.width < 1024 || scenario.hasTouch) {
    pass('create side nav auth: skipped outside desktop side nav layout', {
      viewport: scenario?.viewport || null
    });
    return;
  }

  await ensureReturningCreateState(page);
  await goto(page, '/zh-CN/create');
  await assertNoHorizontalOverflow(page, 'create side nav auth');

  const authState = await ensureAuthenticatedFixture(page, 'create side nav', [
    'button.create-side-nav-profile',
    '.create-side-nav-credit-balance'
  ]);
  if (!authState.ok) return;

  const profileButton = page.locator('button.create-side-nav-profile').first();
  const loggedOutProfileVisible = await page
    .locator('a.create-side-nav-profile[href*="/login"]')
    .first()
    .isVisible()
    .catch(() => false);

  if (loggedOutProfileVisible) {
    fail('create side nav auth: logged-out entry hidden', {
      group: 'auth'
    });
    await screenshot(page, 'create-side-nav-logged-out-entry');
    return;
  }

  const accountGeometry = await page.evaluate(() => {
    const box = (selector) => {
      const node = document.querySelector(selector);
      const rect = node?.getBoundingClientRect();
      return rect
        ? { width: Math.round(rect.width), height: Math.round(rect.height) }
        : null;
    };
    const sideTrigger = document.querySelector(
      'button.create-side-nav-profile'
    );
    const sideAvatar = sideTrigger?.querySelector('.create-side-nav-avatar');
    const sideImage = sideAvatar?.querySelector('img');
    const avatarRect = sideAvatar?.getBoundingClientRect();
    const imageRect = sideImage?.getBoundingClientRect();
    const topAvatar = document.querySelector('.image-create-mininav-avatar');
    const topImage = topAvatar?.querySelector('img');
    const topAvatarRect = topAvatar?.getBoundingClientRect();
    const topImageRect = topImage?.getBoundingClientRect();
    return {
      social: box('.create-side-nav-social-link'),
      announcement: box('.create-side-nav-announcement-trigger'),
      hasVisibleIdentity: Boolean(
        sideTrigger?.querySelector('.create-side-nav-user strong')
          ?.textContent &&
        sideTrigger?.querySelector('.create-side-nav-user em')?.textContent
      ),
      sideAvatarFilled: Boolean(
        avatarRect &&
        imageRect &&
        Math.abs(avatarRect.width - imageRect.width) <= 1 &&
        Math.abs(avatarRect.height - imageRect.height) <= 1
      ),
      topAvatarFilled: Boolean(
        topAvatarRect &&
        topImageRect &&
        Math.abs(topAvatarRect.width - topImageRect.width) <= 1 &&
        Math.abs(topAvatarRect.height - topImageRect.height) <= 1
      ),
      topAvatarPresent: Boolean(topAvatarRect)
    };
  });
  const iconSizeDelta =
    accountGeometry.social && accountGeometry.announcement
      ? Math.max(
          Math.abs(
            accountGeometry.social.width - accountGeometry.announcement.width
          ),
          Math.abs(
            accountGeometry.social.height - accountGeometry.announcement.height
          )
        )
      : Number.POSITIVE_INFINITY;
  if (
    !accountGeometry.hasVisibleIdentity ||
    !accountGeometry.sideAvatarFilled ||
    (accountGeometry.topAvatarPresent && !accountGeometry.topAvatarFilled) ||
    iconSizeDelta > 2
  ) {
    fail('create side nav auth: identity and icon geometry', {
      group: 'auth',
      iconSizeDelta,
      ...accountGeometry
    });
    await screenshot(page, 'create-side-nav-account-geometry');
    return;
  }
  pass('create side nav auth: identity and icon geometry', {
    group: 'auth',
    iconSizeDelta,
    ...accountGeometry
  });

  await profileButton.hover();
  const popover = page.locator('.create-side-nav-profile-popover').first();
  const popoverOpened = await popover
    .waitFor({ state: 'visible', timeout: 4_000 })
    .then(() => true)
    .catch(() => false);

  if (!popoverOpened) {
    fail('create side nav auth: profile popover opens', {
      group: 'auth'
    });
    await screenshot(page, 'create-side-nav-profile-popover-missing');
    return;
  }

  const triggerSemantics = await profileButton.evaluate((button) => ({
    expanded: button.getAttribute('aria-expanded'),
    hasPopup: button.getAttribute('aria-haspopup'),
    controls: button.getAttribute('aria-controls')
  }));
  if (
    triggerSemantics.expanded !== 'true' ||
    triggerSemantics.hasPopup !== 'dialog' ||
    !triggerSemantics.controls
  ) {
    fail('create side nav auth: profile trigger semantics', {
      group: 'auth',
      triggerSemantics
    });
    return;
  }

  const triggerBox = await profileButton.boundingBox();
  const popoverBox = await popover.boundingBox();
  if (!triggerBox || !popoverBox) {
    fail('create side nav auth: profile popover geometry', {
      group: 'auth',
      triggerBox,
      popoverBox
    });
    return;
  }

  const popoverStillVisible = await popover.isVisible().catch(() => false);
  const popoverText = popoverStillVisible
    ? (await popover.innerText().catch(() => '')).trim()
    : '';
  const hasLanguageControl = await popover
    .getByRole('combobox', { name: /^(语言|Language)$/ })
    .first()
    .isVisible()
    .catch(() => false);
  const hasThemeControl = await popover
    .getByRole('combobox', { name: /^(主题|Theme)$/ })
    .first()
    .isVisible()
    .catch(() => false);
  const hasPrimaryAccountActions =
    /个人设置|Settings/.test(popoverText) &&
    /退出登录|Sign out/.test(popoverText);

  if (
    !popoverStillVisible ||
    !hasPrimaryAccountActions ||
    !hasLanguageControl ||
    !hasThemeControl
  ) {
    fail('create side nav auth: profile popover remains usable', {
      group: 'auth',
      popoverStillVisible,
      hasPrimaryAccountActions,
      hasLanguageControl,
      hasThemeControl,
      popoverText: popoverText.slice(0, 240)
    });
    await screenshot(page, 'create-side-nav-profile-popover-unstable');
    return;
  }

  pass('create side nav auth: profile popover remains usable', {
    group: 'auth',
    preferencesAvailableInPopover: true,
    popoverText: popoverText.slice(0, 160)
  });

  await page.keyboard.press('Escape');
  await popover.waitFor({ state: 'hidden', timeout: 4_000 });
  const focusReturned = await profileButton.evaluate(
    (button) => document.activeElement === button
  );
  if (!focusReturned) {
    fail('create side nav auth: profile popover returns focus on Escape', {
      group: 'auth'
    });
  } else {
    pass('create side nav auth: profile popover returns focus on Escape', {
      group: 'auth'
    });
  }
}

async function checkGenerationRecords(page) {
  await goto(page, '/zh-CN/create/image');
  await assertNoHorizontalOverflow(page, 'image create');
  const authState = await ensureAuthenticatedFixture(
    page,
    'generation records',
    [
      '.creator-generation-media',
      '.creator-generation-empty',
      '.creator-generation-rail'
    ]
  );
  if (!authState.ok) return;
  await waitForAnyVisible(page, [
    '.creator-generation-media',
    '.creator-generation-empty',
    '.creator-generation-rail'
  ]);

  const collectMetrics = () =>
    page.evaluate(() => {
      const isVisible = (el) => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0
        );
      };
      const media = Array.from(
        document.querySelectorAll('.creator-generation-media')
      )
        .filter(isVisible)
        .slice(0, 6);
      const mediaCards = media.map((card) => {
        const cardRect = card.getBoundingClientRect();
        const buttons = Array.from(
          card.querySelectorAll('.creator-generation-media-actions button')
        ).filter(isVisible);
        return {
          cardWidth: Math.round(cardRect.width),
          visibleButtonCount: buttons.length,
          hasDuplicatePreviewAction: buttons.some((button) => {
            const label = (
              button.getAttribute('aria-label') ||
              button.textContent ||
              ''
            ).trim();
            return /(^|\s)(预览|preview)(\s|$)/i.test(label);
          }),
          buttons: buttons.map((button) => {
            const rect = button.getBoundingClientRect();
            return {
              label: (
                button.getAttribute('aria-label') ||
                button.textContent ||
                ''
              ).trim(),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              insideCardX:
                rect.left >= cardRect.left - 1 &&
                rect.right <= cardRect.right + 1
            };
          })
        };
      });
      const cardActionGroups = Array.from(
        document.querySelectorAll('.creator-generation-card-actions')
      )
        .filter(isVisible)
        .map((group) => {
          const buttons = Array.from(group.querySelectorAll('button')).filter(
            isVisible
          );
          return buttons.map((button) =>
            (
              button.getAttribute('aria-label') ||
              button.textContent ||
              ''
            ).trim()
          );
        });
      return {
        mediaCards,
        cardActionGroups
      };
    });
  let result = await collectMetrics();

  if (result.mediaCards.length === 0) {
    const studioEmptyStateVisible = await page
      .locator('.recipe-preset-gallery')
      .first()
      .isVisible()
      .catch(() => false);
    if (studioEmptyStateVisible) {
      await goto(page, '/__dev/generation-records-rail-harness');
      await page
        .locator('.creator-generation-media')
        .first()
        .waitFor({ state: 'visible', timeout: 10_000 })
        .catch(() => undefined);
      result = await collectMetrics();
      if (result.mediaCards.length > 0) {
        pass('generation records: populated fixture available', {
          group: 'data',
          fixtureState: 'generation_records_harness',
          cards: result.mediaCards.length
        });
      }
    }
  }

  if (result.mediaCards.length === 0) {
    fail('generation records: thumbnail actions', {
      group: 'data',
      fixtureState: 'no_generated_media',
      reason: 'no visible generated thumbnails',
      authState: authState.state
    });
    await screenshot(page, 'generation-records-no-media');
    return;
  }

  const requireTouchEconomy = activeScenario?.category !== 'desktop';
  const broken = result.mediaCards.filter((card) => {
    const duplicateOrEscaped =
      card.hasDuplicatePreviewAction ||
      card.buttons.some((button) => !button.insideCardX);
    if (duplicateOrEscaped) return true;
    if (requireTouchEconomy) return card.visibleButtonCount > 0;
    return card.visibleButtonCount > 2;
  });

  const expectedActionOrder = ['同款再生成', '加入收藏', '下载原图'];
  const cardLevelActionsBroken = result.cardActionGroups.some(
    (labels) =>
      labels.length > 3 ||
      labels.some((label, index) => label !== expectedActionOrder[index])
  );

  if (broken.length || cardLevelActionsBroken)
    fail('generation records: thumbnail actions', {
      group: 'actions',
      broken,
      result
    });
  else
    pass('generation records: thumbnail actions', {
      group: 'actions',
      cardsChecked: result.mediaCards.length,
      result
    });
  await page
    .locator('.creator-generation-rail')
    .first()
    .scrollIntoViewIfNeeded();
  await screenshot(page, 'generation-records');
}

async function checkCreatePrimaryActions(page) {
  const routes = [
    {
      path: '/zh-CN/create',
      label: 'create home',
      // Discovery v2 deliberately removes the old hero CTA: search is the
      // primary action and should remain usable in the first mobile viewport.
      action: '.create-v2-search form'
    },
    {
      path: '/zh-CN/create/image',
      label: 'create image',
      action: '.image-studio-generate, .creator-prompt-generate'
    }
  ];

  for (const route of routes) {
    await goto(page, route.path);
    const action = page.locator(route.action).first();
    await action.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
    const metrics = await page.evaluate((selector) => {
      const target = document.querySelector(selector);
      const targetRect = target?.getBoundingClientRect();
      const nav = document.querySelector('.create-mobile-nav');
      const navRect = nav?.getBoundingClientRect();
      const navStyle = nav ? getComputedStyle(nav) : null;
      const navVisible = Boolean(
        navRect &&
        navRect.width > 0 &&
        navRect.height > 0 &&
        navStyle?.display !== 'none' &&
        navStyle?.visibility !== 'hidden'
      );
      const fallback = document.querySelector('.global-google-login-fallback');
      const visibleButtons = Array.from(
        document.querySelectorAll('.ui-button')
      ).filter((button) => {
        const rect = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.top < window.innerHeight &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        );
      });
      const brokenButtonLabels = visibleButtons.flatMap((button) => {
        if (button.matches('.create-side-nav-profile')) return [];
        const label = button.querySelector('.ui-button__label');
        if (!label || !(label.textContent || '').trim()) return [];

        const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
        const textRects = [];
        let textNode = walker.nextNode();
        while (textNode) {
          if ((textNode.textContent || '').trim()) {
            const range = document.createRange();
            range.selectNodeContents(textNode);
            textRects.push(
              ...Array.from(range.getClientRects()).filter(
                (rect) => rect.width > 0 && rect.height > 0
              )
            );
          }
          textNode = walker.nextNode();
        }

        const textLines = [];
        for (const rect of textRects) {
          const overlappingLine = textLines.find(
            (line) => rect.top < line.bottom && rect.bottom > line.top
          );
          if (overlappingLine) {
            overlappingLine.top = Math.min(overlappingLine.top, rect.top);
            overlappingLine.bottom = Math.max(
              overlappingLine.bottom,
              rect.bottom
            );
          } else {
            textLines.push({ top: rect.top, bottom: rect.bottom });
          }
        }
        const icon = button.querySelector('.ui-button__icon svg, svg');
        const iconRect = icon?.getBoundingClientRect();
        const labelRect = label.getBoundingClientRect();
        const iconTextMisaligned = Boolean(
          iconRect &&
          labelRect.height > 0 &&
          Math.abs(
            iconRect.top +
              iconRect.height / 2 -
              (labelRect.top + labelRect.height / 2)
          ) > 4
        );

        if (textLines.length <= 1 && !iconTextMisaligned) return [];
        return [
          {
            label:
              button.getAttribute('aria-label') ||
              (label.textContent || '').trim(),
            lineCount: textLines.length,
            iconTextMisaligned
          }
        ];
      });
      return {
        actionVisible: Boolean(
          targetRect &&
          targetRect.width > 0 &&
          targetRect.height > 0 &&
          getComputedStyle(target).visibility !== 'hidden'
        ),
        actionTop: targetRect?.top ?? null,
        actionBottom: targetRect?.bottom ?? null,
        viewportHeight: window.innerHeight,
        overlapsBottomNav: Boolean(
          targetRect &&
          navRect &&
          navVisible &&
          targetRect.top < navRect.bottom &&
          targetRect.bottom > navRect.top
        ),
        automaticLoginPromptVisible: Boolean(
          fallback &&
          getComputedStyle(fallback).display !== 'none' &&
          fallback.getBoundingClientRect().height > 0
        ),
        visibleButtonCount: visibleButtons.length,
        brokenButtonLabels
      };
    }, route.action);

    const firstScreenRequired =
      activeScenario.viewport.width === 390 &&
      activeScenario.viewport.height === 844;
    const firstScreenVisible =
      !firstScreenRequired ||
      (metrics.actionTop !== null &&
        metrics.actionBottom !== null &&
        metrics.actionTop >= 0 &&
        metrics.actionBottom <= metrics.viewportHeight);
    if (
      metrics.actionVisible &&
      firstScreenVisible &&
      !metrics.overlapsBottomNav &&
      !metrics.automaticLoginPromptVisible &&
      metrics.brokenButtonLabels.length === 0
    ) {
      pass(`${route.label}: primary action and auth gate`, {
        group: 'create-primary-action',
        ...metrics,
        firstScreenRequired
      });
    } else {
      fail(`${route.label}: primary action and auth gate`, {
        group: 'create-primary-action',
        ...metrics,
        firstScreenRequired,
        firstScreenVisible
      });
      await screenshot(
        page,
        `${route.label.replace(/\s+/g, '-')}-primary-action`
      );
    }
  }
}

async function checkImageStudioFirstRunHierarchy(page) {
  await page.route('**/api/image/history**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], total: 0 })
    });
  });
  await goto(page, '/zh-CN/create/image');
  const composer = page.locator('.image-studio-composer').first();
  await composer.waitFor({ state: 'visible', timeout: 10_000 });
  await page
    .locator('.creation-generate-button-label')
    .waitFor({ state: 'visible', timeout: 10_000 });

  const metrics = await page.evaluate(() => {
    const isVisible = (node) => {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden'
      );
    };
    const tools = Array.from(
      document.querySelectorAll('.image-studio-tool-trigger')
    )
      .filter(isVisible)
      .map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          label: button.getAttribute('aria-label') || '',
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        };
      });
    const heading = document.querySelector('#recipe-preset-title');
    const description = document.querySelector('#recipe-preset-description');
    const generateButton = document.querySelector('.creation-generate-button');
    const generateButtonRect = generateButton?.getBoundingClientRect();
    const generateLabel = document.querySelector(
      '.creation-generate-button-label'
    );
    const generateEstimate = document.querySelector(
      '.creation-generate-button-estimate'
    );
    const firstCreationGuidance = document.querySelector(
      '.image-studio-composer > small.is-guidance'
    );
    return {
      viewportWidth: window.innerWidth,
      tools,
      heading: heading?.textContent?.trim() || '',
      description: description?.textContent?.trim() || '',
      generateLabel: generateLabel?.textContent?.trim() || '',
      generateEstimate: generateEstimate?.textContent?.trim() || '',
      generateButtonWidth: Math.round(generateButtonRect?.width || 0),
      generateButtonHeight: Math.round(generateButtonRect?.height || 0),
      firstCreationGuidance: firstCreationGuidance?.textContent?.trim() || '',
      onboardingModalCount: document.querySelectorAll(
        '.create-onboarding-backdrop'
      ).length,
      visiblePersistentOutputControls: Array.from(
        document.querySelectorAll('.image-studio-output-controls')
      ).filter(isVisible).length,
      openOutputPanels: document.querySelectorAll(
        '[role="dialog"][aria-label="分辨率设置"], [role="dialog"][aria-label="生成张数设置"]'
      ).length
    };
  });

  const expectedTools =
    metrics.viewportWidth <= 800
      ? ['模型', '引用参考', '比例', '分辨率', '生成张数', '更多']
      : [
          '模型',
          '引用参考',
          '情绪板',
          '可视化配方',
          '比例',
          '分辨率',
          '生成张数',
          '更多'
        ];
  const firstRunReady =
    metrics.heading === '创作你的第一张图' &&
    metrics.description.includes('在下方描述画面') &&
    metrics.generateLabel.startsWith('生成第一张') &&
    metrics.generateEstimate.includes('积分') &&
    metrics.generateButtonWidth >= 44 &&
    metrics.generateButtonHeight >= 44 &&
    metrics.firstCreationGuidance.includes('每日 100 积分') &&
    metrics.firstCreationGuidance.includes('最多生成 1 次') &&
    metrics.onboardingModalCount === 0 &&
    JSON.stringify(metrics.tools.map((tool) => tool.label)) ===
      JSON.stringify(expectedTools) &&
    metrics.visiblePersistentOutputControls === 0 &&
    metrics.openOutputPanels === 0 &&
    (activeScenario?.hasTouch === false ||
      metrics.tools.every((tool) => tool.width >= 44 && tool.height >= 44));

  if (firstRunReady) {
    pass('image studio: first-run hierarchy', metrics);
  } else {
    fail('image studio: first-run hierarchy', {
      ...metrics,
      expectedTools
    });
    await screenshot(page, 'image-studio-first-run-hierarchy-failed');
    return;
  }

  const revealOutputTool = async (tool) => {
    const trigger = page.locator(
      `.image-studio-tool-trigger[data-studio-tool="${tool}"]`
    );
    if (activeScenario?.hasTouch === false) await trigger.hover();
    else await trigger.click();
  };
  await revealOutputTool('resolution');
  const resolutionPanel = page.getByRole('dialog', { name: '分辨率设置' });
  await resolutionPanel.waitFor({ state: 'visible', timeout: 4_000 });
  await page.waitForTimeout(300);
  const resolutionMetrics = await resolutionPanel.evaluate((panel) =>
    Array.from(
      panel.querySelectorAll('[role="group"][aria-label="分辨率"] button')
    ).map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        label: button.getAttribute('aria-label') || '',
        pressed: button.getAttribute('aria-pressed'),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    })
  );

  if (activeScenario?.hasTouch !== false) {
    await resolutionPanel.getByRole('button', { name: '关闭' }).click();
    await resolutionPanel.waitFor({ state: 'hidden', timeout: 4_000 });
  }
  await revealOutputTool('count');
  const countPanel = page.getByRole('dialog', { name: '生成张数设置' });
  await countPanel.waitFor({ state: 'visible', timeout: 4_000 });
  await page.waitForTimeout(300);
  const resolutionClosed = await resolutionPanel.isHidden().catch(() => true);
  const countMetrics = await countPanel.evaluate((panel) =>
    Array.from(
      panel.querySelectorAll('[role="group"][aria-label="生成张数"] button')
    ).map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        label: button.getAttribute('aria-label') || '',
        pressed: button.getAttribute('aria-pressed'),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    })
  );
  const outputPanelsReady =
    resolutionClosed &&
    JSON.stringify(resolutionMetrics.map((button) => button.label)) ===
      JSON.stringify(['分辨率 1K', '分辨率 2K', '分辨率 4K']) &&
    resolutionMetrics.filter((button) => button.pressed === 'true').length ===
      1 &&
    JSON.stringify(countMetrics.map((button) => button.label.replace(/（会员专属）$/, ''))) ===
      JSON.stringify([
        '生成 1 张',
        '生成 2 张',
        '生成 4 张',
        '生成 6 张',
        '生成 8 张',
        '生成 10 张'
      ]) &&
    countMetrics.filter((button) => button.pressed === 'true').length === 1 &&
    (activeScenario?.hasTouch === false ||
      [...resolutionMetrics, ...countMetrics].every(
        (button) => button.width >= 44 && button.height >= 44
      ));
  if (outputPanelsReady) {
    pass('image studio: output controls reveal on demand', {
      resolutionClosed,
      resolutionMetrics,
      countMetrics
    });
  } else {
    fail('image studio: output controls reveal on demand', {
      resolutionClosed,
      resolutionMetrics,
      countMetrics
    });
    await screenshot(page, 'image-studio-output-controls-failed');
    return;
  }

  if (activeScenario?.hasTouch === false) {
    await page.keyboard.press('Escape');
  } else {
    await countPanel.getByRole('button', { name: '关闭' }).click();
  }
  await countPanel.waitFor({ state: 'hidden', timeout: 4_000 });
  if (metrics.viewportWidth > 800) return;
  await page
    .locator('.image-studio-tool-trigger[data-studio-tool="more"]')
    .click();
  const morePanel = page.getByRole('dialog', { name: '更多设置' });
  await morePanel.waitFor({ state: 'visible', timeout: 4_000 });
  const morePanelMetrics = await morePanel.evaluate((panel) => {
    const shortcuts = ['情绪板', '可视化配方'].map((label) => {
      const button = Array.from(panel.querySelectorAll('button')).find(
        (candidate) => candidate.textContent?.trim() === label
      );
      const rect = button?.getBoundingClientRect();
      return {
        label,
        found: Boolean(button && rect && rect.width > 0 && rect.height > 0),
        width: rect ? Math.round(rect.width) : 0,
        height: rect ? Math.round(rect.height) : 0
      };
    });
    return {
      shortcuts,
      containsOutputSettings: Boolean(
        panel.querySelector('[role="group"][aria-label="分辨率"]') ||
        panel.querySelector('[role="group"][aria-label="生成张数"]')
      )
    };
  });
  if (
    !morePanelMetrics.containsOutputSettings &&
    morePanelMetrics.shortcuts.every(
      (shortcut) =>
        shortcut.found && shortcut.width >= 44 && shortcut.height >= 44
    )
  ) {
    pass('image studio: mobile advanced controls', { morePanelMetrics });
  } else {
    fail('image studio: mobile advanced controls', { morePanelMetrics });
    await screenshot(page, 'image-studio-mobile-advanced-controls-failed');
  }
}

async function checkGalleryDensity(page) {
  await goto(page, '/zh-CN/create/gallery');
  await assertNoHorizontalOverflow(page, 'gallery');
  const authState = await ensureAuthenticatedFixture(page, 'gallery', [
    '.create-gallery-card',
    '.create-empty-state',
    '.create-gallery-route'
  ]);
  if (!authState.ok) return;
  await waitForAnyVisible(page, [
    '.create-gallery-card',
    '.create-empty-state'
  ]);
  // The empty-state shell can paint before the mocked gallery request settles.
  // Give populated fixtures a short data window so the density assertion does
  // not sample the transient shell; a genuinely empty gallery still proceeds.
  if (
    !(await page
      .locator('.create-gallery-card')
      .first()
      .isVisible()
      .catch(() => false))
  ) {
    await page
      .locator('.create-gallery-card')
      .first()
      .waitFor({ state: 'visible', timeout: 4_000 })
      .catch(() => undefined);
  }

  const metrics = await page.evaluate(() => {
    const viewportHeight = window.innerHeight;
    const toolbar = document.querySelector('.create-gallery-toolbar');
    const toolbarRect = toolbar?.getBoundingClientRect();
    const titleHead = document.querySelector('.create-gallery-title-head');
    const titleHeadRect = titleHead?.getBoundingClientRect();
    const cards = Array.from(
      document.querySelectorAll('.create-gallery-card')
    ).map((card) => {
      const rect = card.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        visibleInFirstScreen: rect.top < viewportHeight && rect.bottom > 0
      };
    });
    const firstRowTop = cards.length
      ? Math.min(...cards.map((card) => card.top))
      : null;
    const firstRow =
      firstRowTop === null
        ? []
        : cards.filter((card) => Math.abs(card.top - firstRowTop) <= 2);
    const actionButtons = Array.from(
      document.querySelectorAll(
        '.create-gallery-card .create-gallery-actions button'
      )
    ).map((button) => {
      const rect = button.getBoundingClientRect();
      const style = window.getComputedStyle(button);
      return {
        label: button.getAttribute('aria-label') || button.textContent || '',
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        radius: style.borderRadius
      };
    });
    const previewActionCount = actionButtons.filter((button) =>
      /预览|preview/i.test(button.label)
    ).length;
    const visibleActionButtonCount = actionButtons.filter(
      (button) => button.width > 0 && button.height > 0
    ).length;
    const moreButtons = Array.from(
      document.querySelectorAll(
        '.create-gallery-card .create-gallery-more-button'
      )
    ).map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        label: button.getAttribute('aria-label') || button.textContent || '',
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    });
    const searchInput = document.querySelector(
      '.create-gallery-search-input'
    );
    const searchRect = searchInput?.getBoundingClientRect();
    return {
      toolbarHeight: toolbarRect ? Math.round(toolbarRect.height) : null,
      toolbarWidth: toolbarRect ? Math.round(toolbarRect.width) : null,
      toolbarTitleAligned:
        toolbarRect && titleHeadRect
          ? Math.abs(
              Math.round(toolbarRect.bottom) - Math.round(titleHeadRect.bottom)
            ) <= 6
          : false,
      cardCount: cards.length,
      firstScreenCards: cards.filter((card) => card.visibleInFirstScreen)
        .length,
      firstRowColumns: firstRow.length,
      firstCard: cards[0] || null,
      searchInputWidth: searchRect
        ? Math.round(searchRect.width)
        : null,
      searchInputUsable:
        searchRect !== null &&
        searchRect !== undefined &&
        searchRect.width >= 96,
      previewActionCount,
      actionButtonCount: actionButtons.length,
      visibleActionButtonCount,
      moreButtonCount: moreButtons.filter(
        (button) => button.width > 0 && button.height > 0
      ).length,
      nonCircularActions: actionButtons.filter(
        (button) =>
          button.width > 0 &&
          button.height > 0 &&
          (Math.abs(button.width - button.height) > 2 ||
            button.width > 50 ||
            button.height > 50)
      ),
      nonCompactDesktopActions: actionButtons.filter(
        (button) =>
          button.width > 0 &&
          button.height > 0 &&
          (Math.abs(button.width - 36) > 1 || Math.abs(button.height - 36) > 1)
      ),
      nonCircularMoreButtons: moreButtons.filter(
        (button) =>
          Math.abs(button.width - button.height) > 2 ||
          button.width > 50 ||
          button.height > 50
      )
    };
  });

  if (metrics.cardCount === 0) {
    fail('gallery: responsive density', {
      group: 'data',
      fixtureState: 'no_gallery_cards',
      reason: 'no visible gallery cards',
      metrics,
      authState: authState.state
    });
    await screenshot(page, 'gallery-density-no-cards');
    return;
  }

  const scenario = activeScenario;
  const viewport = scenario?.viewport || { width: 390, height: 844 };
  const minColumns =
    scenario?.category === 'desktop'
      ? viewport.width >= 1280
        ? 4
        : 3
      : scenario?.category === 'tablet'
        ? 3
        : 2;
  const maxToolbarHeight =
    scenario?.category === 'desktop'
      ? 112
      : scenario?.category === 'tablet'
        ? 88
        : 128;
  const compactToolbar =
    metrics.toolbarHeight !== null &&
    metrics.toolbarHeight <= maxToolbarHeight &&
    (scenario?.category === 'mobile' ? metrics.toolbarTitleAligned : true);
  const searchStaysUsable =
    scenario?.category !== 'mobile' ||
    metrics.searchInputUsable === true;
  const denseGrid =
    metrics.firstRowColumns >= minColumns &&
    metrics.firstScreenCards >= minColumns;
  const cardNotFullScreen =
    !metrics.firstCard || metrics.firstCard.height <= viewport.height * 0.72;
  const requireMobileActionEconomy = scenario?.category === 'mobile';
  const directActionLimit = metrics.cardCount * 3;
  const cardActionsAreCompact = requireMobileActionEconomy
    ? metrics.previewActionCount === 0 &&
      metrics.visibleActionButtonCount === 0 &&
      metrics.moreButtonCount === metrics.cardCount &&
      metrics.nonCircularActions.length === 0 &&
      metrics.nonCircularMoreButtons.length === 0
    : metrics.previewActionCount === 0 &&
      metrics.visibleActionButtonCount <= directActionLimit &&
      (metrics.moreButtonCount === 0 ||
        metrics.moreButtonCount === metrics.cardCount) &&
      metrics.nonCircularActions.length === 0 &&
      (scenario?.hasTouch !== false ||
        metrics.nonCompactDesktopActions.length === 0) &&
      (scenario?.hasTouch === false ||
        metrics.nonCircularMoreButtons.length === 0);

  if (
    !compactToolbar ||
    !searchStaysUsable ||
    !denseGrid ||
    (scenario?.shortScreen && !cardNotFullScreen) ||
    !cardActionsAreCompact
  ) {
    fail('gallery: responsive density', {
      group: 'render',
      expected: {
        minColumns,
        maxToolbarHeight,
        searchMinWidth: 96,
        requireMobileActionEconomy,
        directActionLimit,
        shortScreen: Boolean(scenario?.shortScreen)
      },
      ...metrics
    });
  } else {
    pass('gallery: responsive density', {
      group: 'render',
      expected: {
        minColumns,
        maxToolbarHeight,
        searchMinWidth: 96,
        requireMobileActionEconomy,
        directActionLimit,
        shortScreen: Boolean(scenario?.shortScreen)
      },
      ...metrics
    });
  }
  await dismissOptionalPreviewGate(page);
  await screenshot(page, 'gallery-density');

  if (metrics.moreButtonCount === 0) {
    pass('gallery: direct actions visible', {
      actionButtonCount: metrics.actionButtonCount,
      visibleActionButtonCount: metrics.visibleActionButtonCount,
      previewActionCount: metrics.previewActionCount,
      directActionLimit
    });
    return;
  }

  const moreClicked = await clickFirstVisible(page, [
    '.create-gallery-more-button'
  ]);
  if (!moreClicked) {
    fail('gallery: mobile action sheet trigger', metrics);
    return;
  }

  const menuSelector =
    '.create-gallery-action-sheet, .create-gallery-action-popover';
  const sheetVisible = await page
    .locator(menuSelector)
    .first()
    .waitFor({ state: 'visible', timeout: 4_000 })
    .then(() => true)
    .catch(() => false);

  if (!sheetVisible) {
    fail('gallery: action menu visible', {
      group: 'actions',
      moreClicked,
      menuSelector
    });
    await screenshot(page, 'gallery-action-sheet-open-failed');
    return;
  }

  // `visible` becomes true at the start of the entry spring. Measure only after
  // the shared 360ms UI transition has settled so transformed geometry is not
  // mistaken for viewport overflow.
  await page.waitForTimeout(450);

  const sheetMetrics = await page.evaluate(() => {
    const sheet = document.querySelector(
      '.create-gallery-action-sheet, .create-gallery-action-popover'
    );
    const rect = sheet?.getBoundingClientRect();
    const labels = Array.from(sheet?.querySelectorAll('button') || []).map(
      (button) => {
        const buttonRect = button.getBoundingClientRect();
        return {
          label: button.textContent?.trim() || '',
          width: Math.round(buttonRect.width),
          height: Math.round(buttonRect.height)
        };
      }
    );
    return {
      labels,
      left: rect ? Math.round(rect.left) : null,
      right: rect ? Math.round(rect.right) : null,
      top: rect ? Math.round(rect.top) : null,
      bottom: rect ? Math.round(rect.bottom) : null,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    };
  });

  const hasExpectedSheetActions = [
    ['作为参考图', '继续编辑', '加入收藏'],
    ['预览视频', '再次创作', '取消收藏', '下载视频']
  ].some((expectedLabels) =>
    expectedLabels.every((label) =>
      sheetMetrics.labels.some((value) => value.label.includes(label))
    )
  );
  const menuInViewport =
    sheetMetrics.left !== null &&
    sheetMetrics.right !== null &&
    sheetMetrics.top !== null &&
    sheetMetrics.bottom !== null &&
    sheetMetrics.left >= -1 &&
    sheetMetrics.top >= -1 &&
    sheetMetrics.right <= sheetMetrics.viewportWidth + 1 &&
    sheetMetrics.bottom <= sheetMetrics.viewportHeight + 1;
  const menuTargetsReady =
    activeScenario?.hasTouch === false ||
    sheetMetrics.labels.every(
      (button) => button.width >= 44 && button.height >= 44
    );

  if (!hasExpectedSheetActions || !menuInViewport || !menuTargetsReady) {
    fail('gallery: action menu actions', {
      group: 'actions',
      hasExpectedSheetActions,
      menuInViewport,
      menuTargetsReady,
      ...sheetMetrics
    });
    return;
  }

  pass('gallery: action menu actions', { group: 'actions', ...sheetMetrics });
  await screenshot(page, 'gallery-action-sheet');
  if (activeScenario?.category === 'mobile') {
    const sheet = page.locator('.create-gallery-action-sheet').first();
    const dragHandle = sheet.locator('.ui-action-sheet__header').first();
    await page.waitForTimeout(500);
    const handleBox = await dragHandle.boundingBox();
    if (!handleBox) {
      fail('gallery: action sheet drag handle', { group: 'actions' });
      return;
    }

    const dragX = handleBox.x + handleBox.width / 2;
    const dragY = handleBox.y + Math.min(handleBox.height / 2, 28);
    await page.mouse.move(dragX, dragY);
    await page.mouse.down();
    await page.mouse.move(dragX, dragY + 60, { steps: 6 });
    await page.waitForTimeout(140);
    await page.mouse.up();
    await page.waitForTimeout(500);
    const remainedAfterSlowDrag = await sheet.isVisible().catch(() => false);
    if (remainedAfterSlowDrag) {
      pass('gallery: action sheet slow drag rebounds', {
        group: 'actions'
      });
    } else {
      fail('gallery: action sheet slow drag rebounds', {
        group: 'actions'
      });
      return;
    }

    const reboundHandleBox = await dragHandle.boundingBox();
    if (!reboundHandleBox) {
      fail('gallery: action sheet fast fling handle', { group: 'actions' });
      return;
    }
    const flingX = reboundHandleBox.x + reboundHandleBox.width / 2;
    const flingY =
      reboundHandleBox.y + Math.min(reboundHandleBox.height / 2, 28);
    await page.mouse.move(flingX, flingY);
    await page.mouse.down();
    await page.waitForTimeout(12);
    await page.mouse.move(flingX, flingY + 28);
    await page.mouse.up();
    await page.waitForTimeout(600);
    const closedAfterFastFling = !(await sheet.isVisible().catch(() => false));
    if (closedAfterFastFling) {
      pass('gallery: action sheet fast fling closes', {
        group: 'actions'
      });
    } else {
      fail('gallery: action sheet fast fling closes', {
        group: 'actions'
      });
      return;
    }
  } else {
    await page
      .locator('.create-gallery-action-sheet-head button, body')
      .first()
      .click({ position: { x: 1, y: 1 } })
      .catch(() => {});
  }

  let clickedSelector = await clickFirstVisible(page, ['.create-gallery-card']);
  if (!clickedSelector) {
    fail('gallery preview: open state', {
      reason: 'no clickable gallery card'
    });
    return;
  }

  const galleryPreviewSelector =
    '.create-gallery-preview-modal, .create-video-preview-modal';
  let previewOpened = await page
    .locator(galleryPreviewSelector)
    .first()
    .waitFor({ state: 'visible', timeout: 4_000 })
    .then(() => true)
    .catch(() => false);

  if (!previewOpened && (await dismissOptionalPreviewGate(page))) {
    clickedSelector = await clickFirstVisible(page, ['.create-gallery-card']);
    previewOpened = await page
      .locator(galleryPreviewSelector)
      .first()
      .waitFor({ state: 'visible', timeout: 4_000 })
      .then(() => true)
      .catch(() => false);
  }

  if (!previewOpened) {
    fail('gallery preview: open state', {
      group: 'preview',
      clickedSelector
    });
    await screenshot(page, 'gallery-preview-open-failed');
    return;
  }

  await assertMobileDialog(page, 'gallery preview', galleryPreviewSelector);
  await assertNoHorizontalOverflow(page, 'gallery preview open');
  await screenshot(page, 'gallery-preview');
}

async function checkAccountAvatar(page) {
  await goto(page, '/zh-CN/account');
  await assertNoHorizontalOverflow(page, 'account');
  const authState = await ensureAuthenticatedFixture(page, 'account', [
    '.create-account-avatar',
    '[data-avatar-loaded]',
    '.account-page',
    '.create-account-page'
  ]);
  if (!authState.ok) return;
  await waitForAnyVisible(page, [
    '.create-account-avatar',
    '[data-avatar-loaded]'
  ]);

  const metrics = await page.evaluate(() => {
    const candidates = Array.from(
      document.querySelectorAll('.create-account-avatar, [data-avatar-loaded]')
    );
    const avatar = candidates.find((item) => {
      const rect = item.getBoundingClientRect();
      const style = window.getComputedStyle(item);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden'
      );
    });
    const image = avatar?.querySelector('img');
    const rect = avatar?.getBoundingClientRect();
    return {
      found: Boolean(avatar),
      width: rect ? Math.round(rect.width) : null,
      height: rect ? Math.round(rect.height) : null,
      hasImage: Boolean(image),
      loading: image?.getAttribute('loading') || null,
      decoding: image?.getAttribute('decoding') || null,
      fetchPriority:
        image?.getAttribute('fetchpriority') || image?.fetchPriority || null,
      referrerPolicy: image?.getAttribute('referrerpolicy') || null
    };
  });

  if (!metrics.found) {
    fail('account: avatar cache attributes', {
      group: 'avatar',
      fixtureState: 'avatar_missing',
      reason: 'avatar not visible',
      metrics,
      authState: authState.state
    });
    await screenshot(page, 'account-avatar-missing');
    return;
  }

  const minAvatarSize = activeScenario?.hasTouch === false ? 30 : 44;
  const stableSize =
    (metrics.width || 0) >= minAvatarSize &&
    (metrics.height || 0) >= minAvatarSize;
  const cacheFriendly =
    !metrics.hasImage ||
    (metrics.decoding === 'async' &&
      metrics.referrerPolicy === 'no-referrer' &&
      ['eager', 'lazy'].includes(metrics.loading || ''));

  if (!stableSize || !cacheFriendly)
    fail('account: avatar cache attributes', {
      group: 'avatar',
      minAvatarSize,
      ...metrics
    });
  else
    pass('account: avatar cache attributes', {
      group: 'avatar',
      minAvatarSize,
      ...metrics
    });
  await screenshot(page, 'account-avatar');
}

async function checkLocalizedLegalRoutes(page) {
  for (const route of localizedLegalRoutes) {
    const status = await goto(page, route.routePath);
    const metrics = await collectLegalRouteState(
      page,
      route.expectedHeadingPattern
    );
    const details = { routePath: route.routePath, status, ...metrics };
    const routeLooksHealthy =
      status !== 404 &&
      !metrics.titleIsNotFound &&
      !metrics.visible404 &&
      metrics.expectedHeadingVisible &&
      metrics.mainVisible;

    if (routeLooksHealthy) {
      pass(`${route.name}: not NotFound`, details);
    } else {
      fail(`${route.name}: not NotFound`, details);
      await screenshot(
        page,
        route.name
          .replace(/[^a-z0-9]+/gi, '-')
          .replace(/^-|-$/g, '')
          .toLowerCase()
      );
    }
  }
}

await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || undefined
});

try {
  const runCheck = async (name, fn) => {
    let page = null;
    try {
      page = await activeScenario.context.newPage();
      await fn(page);
    } catch (error) {
      fail(`${name}: unexpected audit error`, {
        error:
          error instanceof Error ? error.stack || error.message : String(error)
      });
      if (page) {
        await screenshot(page, `${name}-unexpected-error`).catch(() => {});
      }
    } finally {
      await page?.close().catch(() => {});
    }
  };

  for (const scenario of scenarios) {
    activeScenario = scenario;
    const context = await browser.newContext({
      viewport: scenario.viewport,
      deviceScaleFactor: scenario.deviceScaleFactor,
      isMobile: scenario.isMobile,
      hasTouch: scenario.hasTouch,
      locale: 'zh-CN'
    });
    scenario.context = context;
    await installMockRoutes(context);

    await context.addInitScript(() => {
      try {
        window.localStorage.setItem('webtomind:create-onboarding-seen:v1', '1');
        window.localStorage.setItem('workspace:onboarding-seen', '1');
        window.localStorage.setItem(
          'webtomind:test-run:v1',
          'mobile-ui-state-audit'
        );
        // Consent itself has a dedicated component test. Keep it from covering
        // the responsive surfaces this audit is intended to measure.
        window.localStorage.setItem('webtomind:analytics-consent:v1', 'denied');
      } catch {
        // Ignore storage restrictions in private contexts.
      }
    });

    try {
      await runCheck('workspace-motion', checkWorkspaceMotion);
      await runCheck('prompt-case-preview', checkPromptCasePreview);
      await runCheck('prompt-browser-preview', checkPromptBrowserPreview);
      await runCheck('returning-create-routes', checkReturningCreateRoutes);
      await runCheck(
        'responsive-toolbar-account-containment',
        checkResponsiveToolbarAndAccountContainment
      );
      await runCheck('create-primary-actions', checkCreatePrimaryActions);
      await runCheck(
        'image-studio-first-run-hierarchy',
        checkImageStudioFirstRunHierarchy
      );
      await runCheck(
        'create-side-nav-auth',
        checkCreateSideNavAuthenticatedState
      );
      await runCheck('generation-records', checkGenerationRecords);
      await runCheck('asset-picker', checkMobileAssetPicker);
      await runCheck('current-combo', checkCurrentComboThumbnails);
      await runCheck('mobile-bottom-navigation', checkMobileBottomNavigation);
      await runCheck('gallery-density', checkGalleryDensity);
      await runCheck('account-avatar', checkAccountAvatar);
      await runCheck('localized-legal-routes', checkLocalizedLegalRoutes);
    } finally {
      await context.close();
      delete scenario.context;
    }
  }
} finally {
  await browser.close();
}

const report = {
  baseUrl,
  profile: requestedProfile,
  scenarios: scenarios.map(({ id, label, category, viewport }) => ({
    id,
    label,
    category,
    viewport
  })),
  generatedAt: new Date().toISOString(),
  checks
};
const reportSlug =
  process.env.MOBILE_UI_AUDIT_VIEWPORTS || process.env.UI_AUDIT_VIEWPORTS
    ? 'custom'
    : requestedProfile;
const reportPath = path.join(
  outDir,
  reportSlug === 'mobile' ? 'report.json' : `report-${reportSlug}.json`
);
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (path.basename(reportPath) !== 'report.json') {
  await fs.writeFile(
    path.join(outDir, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`
  );
}

const failedCount = failures.length;
const skippedCount = checks.filter((item) => item.status === 'skip').length;
console.log(
  `UI state audit (${requestedProfile}, ${scenarios.length} viewport${scenarios.length === 1 ? '' : 's'}): ${
    checks.length - failedCount - skippedCount
  } passed, ${skippedCount} skipped, ${failedCount} failed.`
);
console.log(`Report: ${reportPath}`);

if (failedCount > 0) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
