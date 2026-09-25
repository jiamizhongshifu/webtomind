import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = (
  process.env.PROMPT_LIBRARY_AUDIT_BASE_URL || 'http://127.0.0.1:4173'
).replace(/\/$/, '');
const proxyApiOrigin = (
  process.env.PROMPT_LIBRARY_AUDIT_API_ORIGIN || 'https://webtomind.com'
).replace(/\/$/, '');
const outputDir = path.resolve(
  process.cwd(),
  process.env.PROMPT_LIBRARY_AUDIT_OUTPUT ||
    'output/prompt-library-apple-audit/current'
);

const scenarios = [
  { name: 'desktop-1440', width: 1440, height: 1000, touch: false },
  {
    name: 'desktop-1440-dark',
    width: 1440,
    height: 1000,
    touch: false,
    dark: true
  },
  { name: 'desktop-1024', width: 1024, height: 900, touch: false },
  { name: 'mobile-390', width: 390, height: 844, touch: true },
  { name: 'mobile-360', width: 360, height: 800, touch: true }
];

function assert(condition, message, details = {}) {
  if (condition) return;
  const error = new Error(message);
  error.details = details;
  throw error;
}

function rectanglesOverlap(a, b) {
  if (!a || !b) return false;
  return !(
    a.right <= b.left ||
    a.left >= b.right ||
    a.bottom <= b.top ||
    a.top >= b.bottom
  );
}

async function configureApiRoutes(page) {
  const localBaseUrl = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(
    baseUrl
  );

  await page.route('**/api/**', async (route) => {
    const method = route.request().method();
    if (method !== 'GET' && method !== 'HEAD') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"ok":true}'
      });
      return;
    }
    if (!localBaseUrl) {
      await route.continue();
      return;
    }

    const requestUrl = new URL(route.request().url());
    const targetUrl = `${proxyApiOrigin}${requestUrl.pathname}${requestUrl.search}`;
    try {
      const response = await route.fetch({ url: targetUrl });
      await route.fulfill({ response });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('page, context or browser has been closed')) {
        return;
      }
      await route.abort('failed');
      console.warn('[prompt-library-apple-audit] API proxy failed', {
        targetUrl,
        error: message
      });
    }
  });
}

async function waitForLibrary(page) {
  await page.locator('.prompt-browser-masonry').waitFor({
    state: 'visible',
    timeout: 20_000
  });
  await page.locator('.prompt-browser-case-card').first().waitFor({
    state: 'visible',
    timeout: 20_000
  });
  await page
    .waitForFunction(
      () =>
        Array.from(
          document.querySelectorAll('.prompt-browser-case-card img')
        ).some((image) => image.complete && image.naturalWidth > 0),
      null,
      { timeout: 15_000 }
    )
    .catch(() => {});
  await page.waitForTimeout(500);
}

async function inspectPage(page, scenario) {
  const pageMetrics = await page.evaluate(() => {
    const masonry = document.querySelector('.prompt-browser-masonry');
    const search = document.querySelector('.prompt-browser-search-form');
    const toolbar = document.querySelector('.prompt-browser-tag-toolbar');
    const favorite = document.querySelector('.prompt-browser-case-favorite');
    const firstCard = document.querySelector('.prompt-browser-case-card');
    const secondCard = document.querySelectorAll(
      '.prompt-browser-case-card'
    )[1];
    const rect = (element) => element?.getBoundingClientRect().toJSON() || null;
    return {
      innerWidth: window.innerWidth,
      bodyScrollWidth: document.body.scrollWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      cards: document.querySelectorAll('.prompt-browser-case-card').length,
      columns: masonry
        ? getComputedStyle(masonry).gridTemplateColumns.split(' ').length
        : 0,
      search: rect(search),
      toolbar: rect(toolbar),
      favorite: rect(favorite),
      firstCard: rect(firstCard),
      secondCard: rect(secondCard),
      loadedImages: Array.from(
        document.querySelectorAll('.prompt-browser-case-card img')
      ).filter((image) => image.complete && image.naturalWidth > 0).length,
      cardRadius: firstCard
        ? getComputedStyle(
            firstCard.querySelector('.prompt-browser-case-image-wrap')
          ).borderRadius
        : '',
      toolbarBackdrop: toolbar
        ? getComputedStyle(toolbar).backdropFilter
        : 'none'
    };
  });

  assert(
    pageMetrics.bodyScrollWidth <= pageMetrics.innerWidth + 1 &&
      pageMetrics.documentScrollWidth <= pageMetrics.innerWidth + 1,
    'Prompt library must not create horizontal page overflow',
    pageMetrics
  );
  assert(pageMetrics.cards >= 4, 'Prompt library should render real cards', {
    scenario,
    pageMetrics
  });
  assert(
    pageMetrics.loadedImages > 0,
    'At least one prompt image should load',
    {
      scenario,
      pageMetrics
    }
  );
  assert(
    scenario.touch ? pageMetrics.columns === 2 : pageMetrics.columns >= 3,
    'Prompt library grid density should match the viewport',
    { scenario, pageMetrics }
  );
  assert(
    pageMetrics.search &&
      pageMetrics.search.left >= 0 &&
      pageMetrics.search.right <= pageMetrics.innerWidth,
    'Search control should remain inside the viewport',
    { scenario, pageMetrics }
  );
  assert(
    pageMetrics.toolbar &&
      pageMetrics.toolbar.left >= 0 &&
      pageMetrics.toolbar.right <= pageMetrics.innerWidth,
    'Filter toolbar should remain inside the viewport',
    { scenario, pageMetrics }
  );
  assert(
    !rectanglesOverlap(pageMetrics.firstCard, pageMetrics.secondCard),
    'Prompt cards should not overlap',
    { scenario, pageMetrics }
  );
  if (scenario.touch) {
    assert(
      pageMetrics.favorite &&
        pageMetrics.favorite.width >= 44 &&
        pageMetrics.favorite.height >= 44,
      'Mobile favorite control should be at least 44px',
      { scenario, pageMetrics }
    );
  }

  return pageMetrics;
}

async function inspectPreview(page, scenario) {
  await page.locator('.prompt-browser-case-card').first().click();
  const dialog = page.locator('.create-gallery-preview-modal');
  await dialog.waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(350);

  const previewMetrics = await page.evaluate(() => {
    const dialogElement = document.querySelector(
      '.create-gallery-preview-modal'
    );
    const closeButton = document.querySelector(
      '.create-gallery-preview-modal .creator-preview-close-button'
    );
    const prompt = document.querySelector(
      '.create-gallery-preview-modal .creator-preview-prompt'
    );
    const createCta = document.querySelector(
      '.create-gallery-preview-modal .creator-preview-create-cta'
    );
    const rect = (element) => element?.getBoundingClientRect().toJSON() || null;
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      dialog: rect(dialogElement),
      closeButton: rect(closeButton),
      prompt: rect(prompt),
      createCta: rect(createCta)
    };
  });

  assert(
    previewMetrics.dialog &&
      previewMetrics.dialog.left >= -1 &&
      previewMetrics.dialog.right <= previewMetrics.innerWidth + 1 &&
      previewMetrics.dialog.top >= -1 &&
      previewMetrics.dialog.bottom <= previewMetrics.innerHeight + 1,
    'Preview dialog should stay inside the viewport',
    { scenario, previewMetrics }
  );
  if (scenario.touch) {
    assert(
      previewMetrics.closeButton &&
        previewMetrics.closeButton.width >= 44 &&
        previewMetrics.closeButton.height >= 44,
      'Mobile preview close control should be at least 44px',
      { scenario, previewMetrics }
    );
  }
  assert(
    !rectanglesOverlap(previewMetrics.prompt, previewMetrics.createCta),
    'Preview create CTA should not cover prompt content',
    { scenario, previewMetrics }
  );

  return previewMetrics;
}

async function runScenario(browser, scenario) {
  const context = await browser.newContext({
    viewport: { width: scenario.width, height: scenario.height },
    deviceScaleFactor: 1,
    locale: 'zh-CN',
    hasTouch: scenario.touch,
    isMobile: scenario.touch
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await configureApiRoutes(page);

  try {
    const response = await page.goto(
      `${baseUrl}/zh-CN/prompts?appleAudit=${scenario.name}`,
      { waitUntil: 'domcontentloaded', timeout: 30_000 }
    );
    assert(response === null || response.status() < 400, 'Page should load', {
      status: response?.status(),
      scenario
    });
    await waitForLibrary(page);
    if (scenario.dark) {
      await page.evaluate(() => document.documentElement.classList.add('dark'));
    }
    const pageMetrics = await inspectPage(page, scenario);
    await page.screenshot({
      path: path.join(outputDir, `${scenario.name}-page.png`),
      fullPage: false
    });

    const previewMetrics = await inspectPreview(page, scenario);
    await page.screenshot({
      path: path.join(outputDir, `${scenario.name}-preview.png`),
      fullPage: false
    });
    await page
      .waitForLoadState('networkidle', { timeout: 3_000 })
      .catch(() => {});

    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reducedMotionAnimation = await page
      .locator('.create-gallery-preview-modal')
      .evaluate((element) => getComputedStyle(element).animationName);
    assert(
      reducedMotionAnimation === 'none',
      'Reduced motion should remove preview spatial animation',
      { scenario, reducedMotionAnimation }
    );

    return {
      ok: true,
      scenario: scenario.name,
      pageMetrics,
      previewMetrics,
      consoleErrors,
      pageErrors
    };
  } catch (error) {
    await page
      .screenshot({
        path: path.join(outputDir, `${scenario.name}-failure.png`),
        fullPage: false
      })
      .catch(() => {});
    error.details = {
      ...(error.details || {}),
      scenario,
      consoleErrors,
      pageErrors
    };
    throw error;
  } finally {
    await context.close().catch(() => {});
  }
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const scenario of scenarios) {
      results.push(await runScenario(browser, scenario));
    }
    console.log(
      JSON.stringify(
        {
          ok: true,
          baseUrl,
          proxyApiOrigin,
          outputDir,
          results
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error('[prompt-library-apple-audit] Failed:', error);
    console.error(
      JSON.stringify(
        {
          ok: false,
          baseUrl,
          outputDir,
          completed: results.length,
          details: error.details || {}
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error('[prompt-library-apple-audit] Unexpected failure:', error);
  process.exit(1);
});
