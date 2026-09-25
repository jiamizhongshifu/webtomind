/* global process */

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl =
  process.env.LOCAL_AUTH_PREVIEW_BASE_URL || 'http://127.0.0.1:4173';
const outputDir = path.resolve(process.cwd(), 'output/api-marketplace-ui');

function assert(condition, message, details = {}) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

async function installMarketplaceRoutes(context) {
  await context.route('**/api/api-marketplace/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const includeStatus =
      new URL(route.request().url()).searchParams.get('view') === 'status';
    let body;
    if (pathname.endsWith('/catalog')) {
      const model = {
        id: 'deepseek-v3-all',
        name: 'deepseek-v3-all',
        description: 'General model',
        tags: ['文本'],
        pricingMode: 'token',
        provider: 'DeepSeek',
        groups: ['default', '官方优惠'],
        customer: {
          modelRatio: 0.5265,
          completionRatio: 5.2,
          modelPrice: null,
          currency: '¥'
        },
        pricing: {
          inputPerMillion: 1.3689,
          outputPerMillion: 7.1183,
          requestPrice: null,
          unit: 'tokens_1m'
        },
        endpoints: ['openai'],
        status: {
          label: '优秀',
          color: '#22c55e',
          errorRate: 0,
          checkedAt: '2026-08-26T00:00:00.000Z',
          totalCount: 48,
          errorCount: 0,
          avgResponseTimeMs: 84.5
        }
      };
      const models = Array.from({ length: 121 }, (_, index) => {
        const status =
          index === 1
            ? {
                ...model.status,
                label: '波动',
                errorRate: 6,
                errorCount: 6,
                totalCount: 100
              }
            : index === 2
              ? {
                  ...model.status,
                  label: '故障',
                  errorRate: 60,
                  errorCount: 60,
                  totalCount: 100
                }
              : index === 3
                ? {
                    ...model.status,
                    label: '暂无样本',
                    errorRate: null,
                    errorCount: 0,
                    totalCount: 0,
                    checkedAt: null
                  }
                : model.status;
        return {
          ...model,
          status,
          id: index === 0 ? model.id : `${model.id}-${index + 1}`,
          name: index === 0 ? model.name : `${model.name}-${index + 1}`
        };
      });
      body = {
        currency: '¥',
        ...(includeStatus ? { statusMeta: { checkIntervalSeconds: 300 } } : {}),
        total: models.length,
        models: includeStatus
          ? models
          : models.map(({ status: _status, ...catalogModel }) => catalogModel)
      };
    } else if (pathname.endsWith('/wallet')) {
      body = {
        wallet: {
          user_id: 'user-1',
          balance_cents: 500,
          total_deposited_cents: 500,
          updated_at: '2026-08-26T00:00:00.000Z'
        },
        transactions: []
      };
    } else if (pathname.endsWith('/keys')) {
      body = {
        keys: [
          {
            id: 'key-1',
            name: '生产 Key',
            key_prefix: 'sk-wtm_key-1',
            status: 'active',
            balance_cents: 500,
            total_spent_cents: 7,
            created_at: '2026-08-26T00:00:00.000Z',
            last_used_at: null,
            expires_at: null
          }
        ]
      };
    } else if (pathname.endsWith('/packages')) {
      body = {
        packages: [
          {
            id: 'api_cny_10',
            name: '$10 充值',
            price_cents: 7200,
            credit_cents: 1000,
            metadata: { api_credit_usd_cents: 1000 },
            sort_order: 10,
            is_active: true
          },
          {
            id: 'api_usd_20',
            name: '$20 充值',
            price_cents: 14400,
            credit_cents: 2000,
            metadata: { api_credit_usd_cents: 2000 },
            sort_order: 20,
            is_active: true
          },
          {
            id: 'api_cny_50',
            name: '$50 充值',
            price_cents: 36000,
            credit_cents: 5000,
            metadata: { api_credit_usd_cents: 5000 },
            sort_order: 30,
            is_active: true
          },
          {
            id: 'api_cny_100',
            name: '$100 充值',
            price_cents: 72000,
            credit_cents: 10000,
            metadata: { api_credit_usd_cents: 10000 },
            sort_order: 40,
            is_active: true
          }
        ],
        checkoutProviders: ['alipay', 'stripe'],
        pricing: {
          usdToCnyRate: 7.2,
          customAvailable: true,
          customMinUsdCents: 100,
          customMaxUsdCents: 138800
        }
      };
    } else if (pathname.endsWith('/usage')) {
      body = {
        usage: [
          {
            id: 'usage-1',
            key_id: 'key-1',
            request_id: 'request-1',
            status: 'succeeded',
            model: 'deepseek-v3-all',
            endpoint: '/v1/chat/completions',
            reserved_cents: 10,
            actual_customer_cents: 7,
            input_tokens: 1200,
            output_tokens: 340,
            total_tokens: 1540,
            settled_at: '2026-08-26T00:00:00.000Z',
            created_at: '2026-08-26T00:00:00.000Z'
          }
        ],
        totalSpentCents: 7,
        limit: 50,
        keyId: null
      };
    } else {
      body = {};
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body)
    });
  });
}

async function assertNoHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth
  }));
  assert(
    metrics.scrollWidth <= metrics.viewport + 1 &&
      metrics.bodyWidth <= metrics.viewport + 1,
    `${label} should not horizontally overflow`,
    metrics
  );
}

async function assertMarketplaceCanvas(page, label) {
  const metrics = await page.evaluate(() => {
    const shell = document.querySelector('.api-marketplace-page-shell');
    const content = document.querySelector('main.api-marketplace-page');
    if (!shell || !content) return null;
    const shellRect = shell.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const workspace = document.querySelector('.create-workspace-page');
    const workspaceRect = workspace?.getBoundingClientRect();
    const workspaceMarginLeft = workspace
      ? parseFloat(getComputedStyle(workspace).marginLeft) || 0
      : 0;
    return {
      documentHeight: document.documentElement.scrollHeight,
      shellBottom: shellRect.bottom + window.scrollY,
      contentBottom: contentRect.bottom + window.scrollY,
      shellBackground: getComputedStyle(shell).backgroundColor,
      contentWidth: contentRect.width,
      workspaceWidth: workspaceRect?.width || 0,
      contentRight: contentRect.right,
      workspaceRight: workspaceRect?.right || 0,
      viewportWidth: window.innerWidth,
      workspaceExpectedWidth: window.innerWidth - workspaceMarginLeft
    };
  });
  assert(metrics, `${label} should expose its page canvas`);
  assert(
    metrics.shellBottom >= metrics.documentHeight - 1 &&
      metrics.shellBottom >= metrics.contentBottom - 1 &&
      metrics.shellBackground !== 'rgba(0, 0, 0, 0)',
    `${label} should keep its background behind the full scrollable content`,
    metrics
  );
  if (metrics.viewportWidth > 1100) {
    assert(
      metrics.workspaceWidth >= metrics.workspaceExpectedWidth - 2 &&
        metrics.contentWidth >= metrics.workspaceWidth - 52 &&
        metrics.contentRight >= metrics.workspaceRight - 26,
      `${label} should fill the available workspace width`,
      metrics
    );
  }
}

async function assertMobileNavDoesNotCover(page, targetSelector, label) {
  if (page.viewportSize().width > 720) return;
  const nav = page.locator('.create-mobile-nav').first();
  if (!(await nav.isVisible().catch(() => false))) return;
  const target = page.locator(targetSelector).first();
  if (!(await target.isVisible().catch(() => false))) return;
  await target.evaluate((element) => {
    element.scrollIntoView({ block: 'center', inline: 'nearest' });
  });
  const metrics = await page.evaluate((selector) => {
    const nav = document.querySelector('.create-mobile-nav');
    const target = document.querySelector(selector);
    if (!nav || !target) return null;
    const navRect = nav.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    return {
      navTop: navRect.top,
      targetTop: targetRect.top,
      targetBottom: targetRect.bottom
    };
  }, targetSelector);
  assert(
    !metrics || metrics.targetBottom <= metrics.navTop,
    `${label} should not be covered by the fixed mobile nav`,
    metrics || {}
  );
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
}

async function checkPage(page, pathName, label) {
  await page.goto(`${baseUrl}${pathName}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000
  });
  await page
    .locator('main.api-marketplace-page, main.api-console-page')
    .waitFor({ state: 'visible', timeout: 10_000 });
  await page.waitForTimeout(500);
  await assertNoHorizontalOverflow(page, label);
  if (new URL(pathName, baseUrl).pathname.endsWith('/models')) {
    await assertMarketplaceCanvas(page, label);
  }
  const visibleText = (await page.locator('body').innerText()).toLowerCase();
  assert(
    !visibleText.includes('tuzi'),
    `${label} should not expose provider branding`
  );
  assert(
    !visibleText.includes('30%'),
    `${label} should not expose internal markup wording`
  );
}

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN'
  });
  await context.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => undefined }
    });
  });
  await installMarketplaceRoutes(context);
  const page = await context.newPage();

  await checkPage(page, '/zh-CN/models', 'model plaza desktop');
  await page
    .locator('.api-model-price-lines')
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 });
  await page
    .getByText(/输入 ¥/)
    .first()
    .waitFor({ state: 'visible' });
  await page
    .getByText(/输出 ¥/)
    .first()
    .waitFor({ state: 'visible' });
  await page
    .getByRole('button', { name: /复制模型名称 deepseek-v3-all/ })
    .first()
    .waitFor({ state: 'visible' });
  await page
    .getByRole('button', { name: /复制模型名称 deepseek-v3-all/ })
    .first()
    .click();
  await page
    .getByRole('status', { name: '模型名称已复制' })
    .waitFor({ state: 'visible' });
  await page.getByRole('heading', { name: '供应商' }).waitFor({
    state: 'visible'
  });
  await page.getByRole('heading', { name: '可用令牌分组' }).waitFor({
    state: 'visible'
  });
  await page.getByRole('heading', { name: '端点类型' }).waitFor({
    state: 'visible'
  });
  await page.getByRole('heading', { name: '计费类型' }).waitFor({
    state: 'visible'
  });
  const firstCardText = await page
    .locator('.api-model-card')
    .first()
    .innerText();
  assert(
    !/优秀|波动|故障|暂无样本|状态/.test(firstCardText),
    'model directory cards should not render monitoring status data',
    { firstCardText }
  );
  await page.locator('.api-model-card').nth(59).waitFor({
    state: 'visible',
    timeout: 10_000
  });
  await page.screenshot({
    path: path.join(outputDir, 'models-desktop-viewport.png'),
    fullPage: false
  });
  await page.getByRole('tab', { name: /文本/ }).click();
  await page.locator('.api-model-card').nth(59).waitFor({
    state: 'visible',
    timeout: 10_000
  });
  await page.getByRole('button', { name: '加载更多' }).click();
  await page.waitForTimeout(400);
  assert(
    (await page.locator('.api-model-card').count()) === 120,
    'model plaza should reveal the next page without rendering the entire catalog at once'
  );
  await page.screenshot({
    path: path.join(outputDir, 'models-desktop.png'),
    fullPage: true
  });

  await checkPage(page, '/zh-CN/models?tab=status', 'model status desktop');
  await page
    .getByRole('tab', { name: '状态监控' })
    .waitFor({ state: 'visible' });
  await page.locator('.api-status-monitor').waitFor({ state: 'visible' });
  await page.locator('.api-status-row').first().waitFor({ state: 'visible' });
  await page
    .getByRole('button', { name: /复制模型名称 deepseek-v3-all/ })
    .first()
    .click();
  await page
    .getByRole('status', { name: '模型名称已复制' })
    .waitFor({ state: 'visible' });
  await page
    .getByRole('button', { name: /展开 .*状态详情/ })
    .first()
    .click();
  await page.getByText(/完整的 24 小时分时记录/).waitFor({ state: 'visible' });
  await page.screenshot({
    path: path.join(outputDir, 'status-desktop.png'),
    fullPage: true
  });

  await page.setViewportSize({ width: 1920, height: 1000 });
  await checkPage(page, '/zh-CN/models', 'model plaza wide desktop');
  await page.locator('.api-model-card').first().waitFor({ state: 'visible' });

  await checkPage(page, '/zh-CN/api-console', 'API console desktop');
  await page.getByLabel('API Key 名称').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '复制 Base URL' }).waitFor({
    state: 'visible'
  });
  const packageTexts = await page
    .locator('.api-package-card')
    .allTextContents();
  const packageText = packageTexts.join(' ');
  assert(
    packageTexts.length === 4,
    'API console should expose all four integer-USD recharge packages',
    { packageTexts }
  );
  assert(
    ['$10', '$20', '$50', '$100'].every((amount) =>
      packageText.includes(amount)
    ),
    'API recharge packages should use the expected whole-dollar amounts',
    { packageTexts }
  );
  assert(
    !packageTexts.some((value) => /\$\d+\.\d+/.test(value)),
    'API recharge package cards should not display decimal USD amounts',
    { packageTexts }
  );
  const customRechargeInput = page.getByLabel('充值美元金额');
  await customRechargeInput.fill('5');
  await page.getByText('预计到账 $5 API 额度').waitFor({
    state: 'visible',
    timeout: 10_000
  });
  await page.screenshot({
    path: path.join(outputDir, 'console-desktop.png'),
    fullPage: true
  });

  for (const { width, height } of [
    { width: 1024, height: 900 },
    { width: 768, height: 900 },
    { width: 430, height: 844 },
    { width: 390, height: 844 },
    { width: 360, height: 800 }
  ]) {
    await page.setViewportSize({ width, height });
    const label = `model plaza ${width}px`;
    await checkPage(page, '/zh-CN/models', label);
    await assertMobileNavDoesNotCover(
      page,
      '.api-model-card',
      'First model card'
    );
    await checkPage(page, '/zh-CN/api-console', `API console ${width}px`);
    await assertMobileNavDoesNotCover(
      page,
      '.api-console-key-form',
      'API Key form'
    );
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await checkPage(page, '/zh-CN/models', 'model plaza mobile');
  await assertMobileNavDoesNotCover(
    page,
    '.api-model-card',
    'First model card'
  );
  await page.screenshot({
    path: path.join(outputDir, 'models-mobile.png'),
    fullPage: true
  });
  await page.screenshot({
    path: path.join(outputDir, 'models-mobile-viewport.png'),
    fullPage: false
  });
  await checkPage(page, '/zh-CN/models?tab=status', 'model status mobile');
  await page.locator('.api-status-monitor').waitFor({ state: 'visible' });
  await page.locator('.api-status-row').first().waitFor({ state: 'visible' });
  await page.screenshot({
    path: path.join(outputDir, 'status-mobile.png'),
    fullPage: true
  });
  await page.screenshot({
    path: path.join(outputDir, 'status-mobile-viewport.png'),
    fullPage: false
  });
  await checkPage(page, '/zh-CN/api-console', 'API console mobile');
  await assertMobileNavDoesNotCover(
    page,
    '.api-console-key-form',
    'API Key form'
  );
  await page.getByLabel('API Key 名称').waitFor({ state: 'visible' });
  await page.screenshot({
    path: path.join(outputDir, 'console-mobile.png'),
    fullPage: true
  });

  console.log(JSON.stringify({ ok: true, outputDir }));
} finally {
  await browser.close();
}
