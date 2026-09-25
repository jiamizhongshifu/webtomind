import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const baseUrl = (
  process.env.PROMPT_LIBRARY_SMOKE_BASE_URL || 'https://webtomind.com'
).replace(/\/$/, '');
const rounds = Math.max(
  1,
  Math.min(Number(process.env.PROMPT_LIBRARY_SMOKE_ROUNDS) || 3, 20)
);
const headless = process.env.PROMPT_LIBRARY_SMOKE_HEADLESS !== '0';
const expectedApiSource =
  process.env.PROMPT_LIBRARY_SMOKE_EXPECT_SOURCE || 'rpc';
const outputDir = path.resolve(
  process.cwd(),
  'output/prompt-library-browser-smoke'
);

const scenarios = [
  {
    name: 'root',
    path: '/zh-CN/prompts',
    repeat: rounds,
    requireCases: true,
    requireLabelLinks: true,
    requireSortLinks: true,
    requireApiPriorityMatch: true,
    requireAutoload: true
  },
  {
    name: 'latest',
    path: '/zh-CN/prompts?sort=latest',
    repeat: 1,
    requireCases: true,
    requireApiPriorityMatch: true
  },
  {
    name: 'hot',
    path: '/zh-CN/prompts?sort=hot',
    repeat: 1,
    requireCases: true,
    requireApiPriorityMatch: true
  },
  {
    name: 'model-label',
    path: '/zh-CN/prompts/model/gpt-image-2?label=portrait-photography',
    repeat: 1,
    requireCases: false
  }
];

function assert(condition, message, details = {}) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

function isPromptLibraryApi(url) {
  return (
    url.includes('/api/content/prompt-cases') &&
    (url.includes('library=1') || url.includes('library%3D1'))
  );
}

function summarizePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const items = Array.isArray(payload.items) ? payload.items : [];
  const facets =
    payload.facets && typeof payload.facets === 'object'
      ? payload.facets
      : {};
  const models = Array.isArray(facets.models) ? facets.models : [];
  const labels = Array.isArray(facets.labels) ? facets.labels : [];
  const modelCounts = models
    .map((item) => Number(item?.count) || 0)
    .filter((count) => Number.isFinite(count));

  return {
    version: payload.version || null,
    source: payload.source || null,
    total: Number(payload.total) || 0,
    items: items.length,
    hasMore: Boolean(payload.pageInfo?.hasMore),
    nextCursor: payload.pageInfo?.nextCursor || null,
    modelFacetCount: models.length,
    labelFacetCount: labels.length,
    modelFacetTotal: modelCounts.reduce((sum, count) => sum + count, 0)
  };
}

function normalizeCaseLabel(value) {
  return String(value || '')
    .replace(/^预览 Prompt 案例：/, '')
    .replace(/^Preview prompt case:\s*/i, '')
    .trim();
}

async function safeInnerText(locator) {
  return locator
    .innerText({ timeout: 1_000 })
    .then((text) => text.trim())
    .catch(() => '');
}

async function getPriorityCaseTitles(page) {
  return page
    .locator('.prompt-browser-case-card-priority')
    .evaluateAll((nodes) =>
      nodes
        .map((node) => node.getAttribute('aria-label') || '')
        .filter(Boolean)
    )
    .then((labels) => labels.map(normalizeCaseLabel))
    .catch(() => []);
}

async function getModelFilters(page) {
  return page
    .locator('.create-side-nav-submenu a, .prompt-browser-model-stat')
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const label = node.textContent?.trim() || '';
        const href = node.getAttribute('href') || '';
        const active = node.getAttribute('aria-current') === 'page';
        return { label, href, active };
      })
    );
}

async function runScenario(context, scenario, iteration) {
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const apiResponsePromises = [];
  const failedRequests = [];
  const url = `${baseUrl}${scenario.path}`;
  const label = `${scenario.name}-${iteration + 1}`;

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });
  page.on('requestfailed', (request) => {
    const requestUrl = request.url();
    if (isPromptLibraryApi(requestUrl)) {
      failedRequests.push({
        url: requestUrl,
        failure: request.failure()?.errorText || 'unknown'
      });
    }
  });
  page.on('response', (response) => {
    const responseUrl = response.url();
    if (!isPromptLibraryApi(responseUrl)) return;
    apiResponsePromises.push(
      response
        .text()
        .then((text) => {
          let payload = null;
          try {
            payload = text ? JSON.parse(text) : null;
          } catch {
            payload = null;
          }
          return {
            url: responseUrl,
            status: response.status(),
            ok: response.ok(),
            payload,
            summary: summarizePayload(payload),
            textPreview: text.slice(0, 500)
          };
        })
        .catch((error) => ({
          url: responseUrl,
          status: response.status(),
          ok: response.ok(),
          payload: null,
          summary: null,
          textPreview: '',
          parseError: error.message
        }))
    );
  });

  try {
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000
    });
    assert(response === null || response.status() < 400, 'Page should load', {
      status: response?.status(),
      url
    });

    await page.locator('h1').waitFor({ state: 'visible', timeout: 15_000 });
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(
      () => {}
    );
    await Promise.allSettled(apiResponsePromises);
    await page.waitForTimeout(400);

    let autoload = null;
    if (scenario.requireAutoload) {
      const initialCount = await page
        .locator('.prompt-browser-case-shell')
        .count();
      await page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
      });
      await page.waitForFunction(
        (count) =>
          document.querySelectorAll('.prompt-browser-case-shell').length >
          count,
        initialCount,
        { timeout: 15_000 }
      );
      await Promise.allSettled(apiResponsePromises);
      await page.waitForTimeout(300);
      const loadedCount = await page
        .locator('.prompt-browser-case-shell')
        .count();
      autoload = {
        initialCount,
        loadedCount
      };
    }

    const apiResponses = (
      await Promise.allSettled(apiResponsePromises)
    )
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value);
    const badApiResponses = apiResponses.filter((item) => !item.ok);
    const payloadResponses = apiResponses.filter((item) => item.payload);
    const cursorResponses = apiResponses.filter((item) =>
      new URL(item.url).searchParams.has('cursor')
    );
    const primaryPayload = payloadResponses[0]?.payload || null;
    const primarySummary = summarizePayload(primaryPayload);

    const unavailableVisible = await page
      .getByText('案例暂时不可用')
      .first()
      .isVisible()
      .catch(() => false);
    const promptCaseLinks = await page
      .locator('.prompt-browser-masonry a[href*="/zh-CN/prompts/"]')
      .count()
      .catch(() => 0);
    const priorityCaseTitles = await getPriorityCaseTitles(page);
    const modelFilters = await getModelFilters(page).catch(() => []);
    const labelLinkCount = await page
      .locator('.prompt-browser-subnav a[href*="label="]')
      .count()
      .catch(() => 0);
    const latestSortLinkCount = await page
      .locator('.prompt-browser-sort-tabs a[href*="sort=latest"]')
      .count()
      .catch(() => 0);
    const hotSortLinkCount = await page
      .locator('.prompt-browser-sort-tabs a[href*="sort=hot"]')
      .count()
      .catch(() => 0);

    assert(failedRequests.length === 0, 'Prompt library API request should not fail', {
      url,
      failedRequests
    });
    if (apiResponses.length > 0) {
      assert(badApiResponses.length === 0, 'Prompt library API should return 2xx', {
        url,
        badApiResponses: badApiResponses.map((item) => ({
          url: item.url,
          status: item.status,
          preview: item.textPreview
        }))
      });
      assert(
        primarySummary?.version === 'prompt-library-v2',
        'Prompt library API should use v2 payload',
        { url, primarySummary }
      );
      if (expectedApiSource && expectedApiSource !== 'any') {
        assert(
          primarySummary?.source === expectedApiSource,
          'Prompt library API should use the expected data path',
          { url, expectedApiSource, primarySummary }
        );
      }
    }
    assert(!unavailableVisible, 'Page should not show temporary unavailable state', {
      url,
      primarySummary,
      modelFilters
    });
    assert(
      modelFilters.some((item) => item.label === 'ALL') &&
        modelFilters.some((item) => item.label === 'GPT Image 2'),
      'Model filters should be available without numeric badges',
      {
        url,
        modelFilters,
        primarySummary
      }
    );
    if (scenario.requireCases) {
      assert(promptCaseLinks > 0, 'Page should render prompt case links', {
        url,
        promptCaseLinks,
        primarySummary
      });
      if (apiResponses.length > 0) {
        assert(
          (primarySummary?.items || 0) > 0,
          'Prompt library API should return items',
          { url, primarySummary }
        );
      }
    }
    if (scenario.requireApiPriorityMatch && primaryPayload?.items?.length) {
      const apiPriorityTitles = primaryPayload.items
        .slice(0, Math.min(priorityCaseTitles.length, 4))
        .map((item) => normalizeCaseLabel(item?.title))
        .filter(Boolean);
      assert(
        apiPriorityTitles.length > 0 &&
          apiPriorityTitles.every((title) => priorityCaseTitles.includes(title)),
        'Priority cards should preserve the API first-page item set',
        { url, apiPriorityTitles, priorityCaseTitles, primarySummary }
      );
    }
    if (scenario.requireLabelLinks) {
      assert(labelLinkCount > 0, 'Prompt tags should use label query links', {
        url,
        labelLinkCount
      });
    }
    if (scenario.requireSortLinks) {
      assert(
        latestSortLinkCount > 0 && hotSortLinkCount > 0,
        'Prompt sort tabs should expose latest and hot query links',
        { url, latestSortLinkCount, hotSortLinkCount }
      );
    }
    if (scenario.requireAutoload) {
      assert(
        autoload && autoload.loadedCount > autoload.initialCount,
        'Scrolling to the sentinel should append prompt cases',
        { url, autoload }
      );
      assert(
        cursorResponses.some((item) => item.ok),
        'Autoload should request the cursor-based next page',
        {
          url,
          autoload,
          cursorResponses: cursorResponses.map((item) => ({
            url: item.url,
            status: item.status
          }))
        }
      );
    }

    return {
      ok: true,
      label,
      url: page.url(),
      title: await safeInnerText(page.locator('h1').first()),
      promptCaseLinks,
      labelLinkCount,
      latestSortLinkCount,
      hotSortLinkCount,
      apiObserved: apiResponses.length > 0,
      autoload,
      primarySummary,
      modelFilters,
      consoleErrors,
      pageErrors
    };
  } catch (error) {
    const screenshot = path.join(outputDir, `${label}-failure.png`);
    await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
    error.details = {
      ...(error.details || {}),
      screenshot,
      consoleErrors,
      pageErrors
    };
    throw error;
  } finally {
    await page.close().catch(() => {});
  }
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 920 },
    deviceScaleFactor: 1,
    locale: 'zh-CN'
  });
  const results = [];

  try {
    for (const scenario of scenarios) {
      for (let iteration = 0; iteration < scenario.repeat; iteration += 1) {
        results.push(await runScenario(context, scenario, iteration));
      }
    }

    const summary = {
      ok: true,
      baseUrl,
      rounds,
      checks: results.length,
      results
    };
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    console.error('[prompt-library-browser-smoke] Failed:', error);
    console.error(
      JSON.stringify(
        {
          ok: false,
          baseUrl,
          rounds,
          completedChecks: results.length,
          details: error.details || {},
          results
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error('[prompt-library-browser-smoke] Unexpected failure:', error);
  process.exit(1);
});
