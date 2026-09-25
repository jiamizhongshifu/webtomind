import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { installUiAuditMockRoutes } from './lib/ui-audit-fixtures.mjs';
import {
  contrastRatioFromCss,
  parseCssColor,
  relativeLuminance
} from './lib/wcag-contrast.mjs';

const baseUrl = (
  process.env.DARK_THEME_SMOKE_BASE_URL ?? 'https://webtomind.com'
).replace(/\/+$/, '');
const caseId =
  process.env.DARK_THEME_SMOKE_CASE_ID ??
  '18540db9-a283-4ce1-877c-f8e103610627';
const headless = process.env.DARK_THEME_SMOKE_HEADLESS !== '0';
const smokeScope = process.env.DARK_THEME_SMOKE_SCOPE ?? 'all';
const outputDir = path.resolve(process.cwd(), 'output/dark-theme-cta-smoke');

const purchasablePlansFixture = [
  {
    id: 'free',
    name: 'free',
    displayName: { 'zh-CN': '免费版', 'en-US': 'Free' },
    priceMonthly: 0,
    priceYearly: 0,
    monthlyCredits: 100,
    features: { imageGeneration: true },
    limits: { dailyCredits: 100, dailyImageGeneration: 1 },
    sortOrder: 0,
    isActive: true,
    checkoutEnabled: true
  },
  {
    id: 'pro',
    name: 'pro',
    displayName: { 'zh-CN': '专业版', 'en-US': 'Pro' },
    priceMonthly: 2000,
    priceYearly: 16800,
    monthlyCredits: 10000,
    features: { imageGeneration: true },
    limits: { dailyCredits: -1, dailyImageGeneration: -1 },
    sortOrder: 1,
    isActive: true,
    checkoutEnabled: true
  },
  {
    id: 'max',
    name: 'max',
    displayName: { 'zh-CN': '旗舰版', 'en-US': 'Max' },
    priceMonthly: 10000,
    priceYearly: 72000,
    monthlyCredits: 60000,
    features: { imageGeneration: true },
    limits: { dailyCredits: -1, dailyImageGeneration: -1 },
    sortOrder: 2,
    isActive: true,
    checkoutEnabled: true
  }
];

const viewports = [
  {
    name: 'desktop-wide',
    viewport: { width: 1440, height: 960 },
    isMobile: false
  },
  {
    name: 'desktop',
    viewport: { width: 1280, height: 900 },
    isMobile: false
  },
  {
    name: 'mobile',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    deviceScaleFactor: 2
  }
];

function fail(message, details) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

function assertReadable(
  target,
  sample,
  { minimumTextRatio = 4.5, minimumIconRatio = 3, checkBorder = false } = {}
) {
  if (!sample) {
    fail(`${target} was not found`);
  }
  const background = sample.effectiveBackgroundColor || sample.backgroundColor;
  const ratios = {};
  const textRatio = contrastRatioFromCss(sample.color, background);
  if (textRatio === null || textRatio < minimumTextRatio) {
    fail(`${target} text contrast is below ${minimumTextRatio}:1`, {
      ...sample,
      measuredContrast: textRatio
    });
  }
  ratios.text = Number(textRatio.toFixed(2));
  for (const [key, color] of [
    ['iconStroke', sample.svgStroke],
    ['iconFill', sample.svgFill]
  ]) {
    if (!color || color === 'none') continue;
    const ratio = contrastRatioFromCss(color, background);
    if (ratio === null || ratio < minimumIconRatio) {
      fail(`${target} ${key} contrast is below ${minimumIconRatio}:1`, {
        ...sample,
        measuredContrast: ratio
      });
    }
    ratios[key] = Number(ratio.toFixed(2));
  }
  if (checkBorder && sample.borderColor) {
    const ratio = contrastRatioFromCss(sample.borderColor, background);
    if (ratio === null || ratio < minimumIconRatio) {
      fail(`${target} border contrast is below ${minimumIconRatio}:1`, {
        ...sample,
        measuredContrast: ratio
      });
    }
    ratios.border = Number(ratio.toFixed(2));
  }
  sample.contrastRatios = ratios;
}

function assertDarkSurface(target, sample) {
  if (!sample) {
    fail(`${target} was not found`);
  }
  const color = parseCssColor(
    sample.effectiveBackgroundColor || sample.backgroundColor
  );
  if (!color || relativeLuminance(color) > 0.25) {
    fail(`${target} background is still a light-theme surface`, sample);
  }
}

async function forceDarkTheme(page) {
  await page.evaluate(() => {
    window.localStorage.setItem('webtomind_theme', 'dark');
    document.documentElement.classList.add('dark');
    document.documentElement.dataset.theme = 'dark';
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page
    .waitForLoadState('networkidle', { timeout: 15000 })
    .catch(() => {});
}

async function gotoDark(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await forceDarkTheme(page);
}

async function inspectControl(page, query) {
  return page.evaluate(({ selector, text, index = 0 }) => {
    function parseColor(value) {
      const match = String(value || '').match(
        /rgba?\(\s*([\d.]+)(?:\s*,|\s+)\s*([\d.]+)(?:\s*,|\s+)\s*([\d.]+)(?:\s*(?:,|\/)\s*([\d.]+)%?)?\s*\)/i
      );
      if (!match) return null;
      const alphaValue = match[4];
      return {
        r: Number(match[1]),
        g: Number(match[2]),
        b: Number(match[3]),
        a:
          alphaValue === undefined
            ? 1
            : String(value).includes(`${alphaValue}%`)
              ? Number(alphaValue) / 100
              : Number(alphaValue)
      };
    }
    function composite(foreground, background) {
      const alpha = foreground.a + background.a * (1 - foreground.a);
      if (alpha <= 0) return { r: 0, g: 0, b: 0, a: 0 };
      return {
        r:
          (foreground.r * foreground.a +
            background.r * background.a * (1 - foreground.a)) /
          alpha,
        g:
          (foreground.g * foreground.a +
            background.g * background.a * (1 - foreground.a)) /
          alpha,
        b:
          (foreground.b * foreground.a +
            background.b * background.a * (1 - foreground.a)) /
          alpha,
        a: alpha
      };
    }
    function effectiveBackground(node) {
      let result = { r: 0, g: 0, b: 0, a: 0 };
      let current = node;
      while (current instanceof Element) {
        const color = parseColor(getComputedStyle(current).backgroundColor);
        if (color) result = composite(result, color);
        if (result.a >= 0.999) break;
        current = current.parentElement;
      }
      if (result.a < 1) {
        const isDark = document.documentElement.classList.contains('dark');
        result = composite(result, {
          r: isDark ? 0 : 255,
          g: isDark ? 0 : 255,
          b: isDark ? 0 : 255,
          a: 1
        });
      }
      return `rgb(${Math.round(result.r)}, ${Math.round(result.g)}, ${Math.round(result.b)})`;
    }

    const node = selector
      ? document.querySelectorAll(selector)[index]
      : Array.from(document.querySelectorAll('a, button')).find((element) =>
          (element.textContent ?? '').replace(/\s+/g, ' ').includes(text)
        );
    if (!node) {
      return null;
    }
    const style = window.getComputedStyle(node);
    const svg = node.querySelector('svg');
    const svgStyle = svg ? window.getComputedStyle(svg) : null;
    const rect = node.getBoundingClientRect();
    return {
      selector,
      ariaLabel: node.getAttribute('aria-label'),
      text: (node.textContent ?? '').replace(/\s+/g, ' ').trim(),
      className: node.getAttribute('class'),
      color: style.color,
      backgroundColor: style.backgroundColor,
      effectiveBackgroundColor: effectiveBackground(node),
      borderColor: style.borderColor,
      svgStroke: svgStyle?.stroke || svg?.getAttribute('stroke') || null,
      svgFill: svgStyle?.fill || svg?.getAttribute('fill') || null,
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  }, query);
}

async function inspectTextControl(page, text) {
  return inspectControl(page, { text });
}

async function inspectSelector(page, selector, index = 0) {
  return inspectControl(page, { selector, index });
}

async function currentEntryScript(page) {
  return page.evaluate(() => {
    const script = Array.from(document.querySelectorAll('script[src]')).find(
      (node) => node.getAttribute('src')?.includes('/assets/index.')
    );
    return script?.getAttribute('src') ?? null;
  });
}

async function runCreateChecks(page, viewportName) {
  const url = `${baseUrl}/zh-CN/create?darkThemeSmoke=${viewportName}`;
  await gotoDark(page, url);
  await page.locator('.create-v2-hero-title').waitFor({ timeout: 15000 });

  const primaryCta = await inspectSelector(page, '.create-v2-hero-cta');
  const uploadCta = await inspectSelector(
    page,
    'button[aria-label="上传图片搜索"]'
  );
  assertReadable('create primary CTA', primaryCta);
  assertReadable('create upload CTA', uploadCta);

  await page.locator('.discovery-image-masonry').waitFor({ timeout: 15000 });
  const discoveryMasonry = await page.evaluate(() => {
    const masonry = document.querySelector('.discovery-image-masonry');
    if (!masonry) return null;
    const style = getComputedStyle(masonry);
    const visibleTiles = Array.from(
      masonry.querySelectorAll('.discovery-image-tile')
    ).filter((tile) => {
      const rect = tile.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }).length;
    return {
      display: style.display,
      columnCount: Number(style.columnCount),
      visibleTiles
    };
  });
  if (
    !discoveryMasonry ||
    discoveryMasonry.display !== 'block' ||
    discoveryMasonry.columnCount < 2 ||
    discoveryMasonry.visibleTiles < 2
  ) {
    fail('create discovery masonry did not retain its multi-column layout', {
      viewportName,
      discoveryMasonry
    });
  }

  const sideNavBrand =
    viewportName === 'desktop'
      ? await page.evaluate(() => {
          const inspect = (selector) => {
            const node = document.querySelector(selector);
            if (!node) return null;
            const rect = node.getBoundingClientRect();
            return { width: rect.width, height: rect.height };
          };
          return {
            logo: inspect('.create-side-nav-brand svg'),
            social: inspect('.create-side-nav-social-link'),
            announcement: inspect('.create-side-nav-icon-action')
          };
        })
      : null;
  if (
    sideNavBrand &&
    (!sideNavBrand.logo ||
      sideNavBrand.logo.width < 24 ||
      !sideNavBrand.social ||
      !sideNavBrand.announcement ||
      Math.abs(sideNavBrand.social.width - sideNavBrand.announcement.width) >
        2 ||
      sideNavBrand.social.width > 30 ||
      sideNavBrand.announcement.width > 30)
  ) {
    fail('create side navigation brand controls regressed', sideNavBrand);
  }

  await page.screenshot({
    path: path.join(outputDir, `create-${viewportName}.png`),
    fullPage: false
  });

  return {
    url,
    entryScript: await currentEntryScript(page),
    primaryCta,
    uploadCta,
    discoveryMasonry,
    sideNavBrand
  };
}

async function runPromptPreviewChecks(page, viewportName) {
  const url = `${baseUrl}/zh-CN/prompts?caseId=${caseId}&darkThemeSmoke=${viewportName}`;
  await gotoDark(page, url);
  await page.getByText('案例预览').first().waitFor({ timeout: 20000 });
  await page.getByText('按配方创作').first().waitFor({ timeout: 20000 });

  const recipeCta = await inspectTextControl(page, '按配方创作');
  const createCta = await inspectTextControl(page, '去创作');
  const previousNav = await inspectSelector(page, '.creator-preview-nav.prev');
  const nextNav = await inspectSelector(page, '.creator-preview-nav.next');
  assertReadable('prompt preview recipe CTA', recipeCta);
  assertReadable('prompt preview create CTA', createCta);
  assertReadable('prompt preview previous nav', previousNav);
  assertReadable('prompt preview next nav', nextNav);

  await page.screenshot({
    path: path.join(outputDir, `prompt-preview-${viewportName}.png`),
    fullPage: false
  });

  return {
    url,
    entryScript: await currentEntryScript(page),
    recipeCta,
    createCta,
    previousNav,
    nextNav
  };
}

async function runPricingChecks(page, viewportName) {
  const url = `${baseUrl}/zh-CN/create/pricing?darkThemeSmoke=${viewportName}`;
  await gotoDark(page, url);
  await page.getByText('选择您的套餐').first().waitFor({ timeout: 20000 });
  const yearlyChoice = page.getByRole('button', { name: '年付', exact: true });
  const monthlyChoice = page.getByRole('button', { name: '月付', exact: true });
  const defaultBillingState = {
    yearly: await yearlyChoice.getAttribute('aria-pressed'),
    monthly: await monthlyChoice.getAttribute('aria-pressed')
  };
  if (
    defaultBillingState.yearly !== 'true' ||
    defaultBillingState.monthly !== 'false'
  ) {
    fail('pricing did not default to yearly billing', defaultBillingState);
  }
  await page.getByText('省 30%', { exact: true }).waitFor({ timeout: 20000 });
  const proCard = page.locator('[data-plan="pro"]');
  await proCard.getByText('每年支付 $168', { exact: true }).waitFor({
    timeout: 20000
  });
  await monthlyChoice.click();
  if (
    (await monthlyChoice.getAttribute('aria-pressed')) !== 'true' ||
    (await yearlyChoice.getAttribute('aria-pressed')) !== 'false'
  ) {
    fail('pricing could not switch to monthly billing');
  }
  await yearlyChoice.click();
  await proCard.getByText('每年支付 $168', { exact: true }).waitFor({
    timeout: 20000
  });
  const layout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth
  }));
  if (
    layout.documentWidth > layout.viewportWidth + 1 ||
    layout.bodyWidth > layout.viewportWidth + 1
  ) {
    fail('pricing page has horizontal overflow', layout);
  }
  const planMarketingCopy = await page.locator('#creator-plans').innerText();
  if (/\b2K\b/.test(planMarketingCopy)) {
    fail('pricing cards regressed to image-count marketing', {
      planMarketingCopy
    });
  }
  for (const expectedCopy of ['完整工作流', '情绪板', '批量实验']) {
    if (!planMarketingCopy.includes(expectedCopy)) {
      fail('pricing cards are missing workflow value copy', {
        expectedCopy,
        planMarketingCopy
      });
    }
  }
  const purchaseCta = await inspectSelector(page, '.pricing-plan-cta');
  assertReadable('pricing purchase CTA', purchaseCta);
  await page.screenshot({
    path: path.join(outputDir, `pricing-${viewportName}.png`),
    fullPage: false
  });
  return {
    url,
    purchaseCta,
    defaultBillingCycle: 'yearly',
    displayedYearlyDiscount: 40,
    marketsWorkflowValue: true,
    layout
  };
}

async function runRechargeChecks(page, viewportName) {
  const url = `${baseUrl}/zh-CN/recharge?darkThemeSmoke=${viewportName}`;
  await gotoDark(page, url);
  await page.getByText('普通充值包').first().waitFor({ timeout: 20000 });
  const purchaseCta = await inspectSelector(
    page,
    '.recharge-pack-card--popular .recharge-pack-button'
  );
  assertReadable('recharge purchase CTA', purchaseCta);
  const standardPurchaseCtas = await page
    .locator(
      '.recharge-pack-card:not(.recharge-pack-card--popular) .recharge-pack-button'
    )
    .evaluateAll((buttons) =>
      buttons.map((button) => {
        const style = getComputedStyle(button);
        const label = button.querySelector('.ui-button__label');
        const labelStyle = label ? getComputedStyle(label) : style;
        return {
          color: labelStyle.color,
          backgroundColor: style.backgroundColor,
          effectiveBackgroundColor: style.backgroundColor,
          borderColor: style.borderColor,
          svgStroke: button.querySelector('svg')
            ? getComputedStyle(button.querySelector('svg')).stroke
            : null,
          svgFill: button.querySelector('svg')
            ? getComputedStyle(button.querySelector('svg')).fill
            : null
        };
      })
    );
  if (standardPurchaseCtas.length === 0) {
    fail('standard recharge purchase CTAs were not found');
  }
  standardPurchaseCtas.forEach((sample, index) => {
    assertReadable(`standard recharge purchase CTA ${index + 1}`, sample);
  });
  await page.screenshot({
    path: path.join(outputDir, `recharge-${viewportName}.png`),
    fullPage: false
  });
  return { url, purchaseCta, standardPurchaseCtas };
}

async function runCharacterChecks(page, viewportName) {
  const url = `${baseUrl}/zh-CN/create/characters?darkThemeSmoke=${viewportName}`;
  await gotoDark(page, url);
  await page.getByText('角色一致性').first().waitFor({ timeout: 20000 });
  const hero = await inspectSelector(page, '.create-character-hero');
  const methodTitle = await inspectSelector(
    page,
    '.create-character-methods button strong'
  );
  const filter = await inspectSelector(
    page,
    '.create-character-filter-trigger'
  );
  assertDarkSurface('character hero', hero);
  assertReadable('character method title', methodTitle);
  assertReadable('character filter', filter);
  await page.screenshot({
    path: path.join(outputDir, `characters-${viewportName}.png`),
    fullPage: false
  });
  return { url, hero, methodTitle, filter };
}

async function runLightboxChecks(page, viewportName) {
  const url = `${baseUrl}/__dev/creative-workspace-controls-harness?mode=image-lightbox`;
  await gotoDark(page, url);
  await page
    .getByRole('dialog', { name: 'Image lightbox harness' })
    .waitFor({ timeout: 15000 });
  const controlSelector =
    '.creator-prompt-case-lightbox-actions button, .creator-prompt-case-lightbox-nav, .creator-prompt-case-lightbox-zoom button';
  const controlCount = await page.locator(controlSelector).count();
  const controls = [];
  for (let index = 0; index < controlCount; index += 1) {
    controls.push(await inspectSelector(page, controlSelector, index));
  }
  if (controls.length < 6)
    fail('lightbox controls were not all rendered', controls);
  for (const control of controls) {
    assertReadable(`lightbox ${control.ariaLabel || 'control'}`, control);
  }
  await page.screenshot({
    path: path.join(outputDir, `lightbox-${viewportName}.png`),
    fullPage: false
  });
  return { url, controls };
}

await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless });
const summary = {
  baseUrl,
  caseId,
  checkedAt: new Date().toISOString(),
  results: []
};

try {
  for (const profile of viewports) {
    const context = await browser.newContext({
      viewport: profile.viewport,
      isMobile: profile.isMobile,
      deviceScaleFactor: profile.deviceScaleFactor ?? 1,
      colorScheme: 'dark'
    });
    await installUiAuditMockRoutes(context, {
      baseUrl,
      seedAuthSession: true
    });
    await context.route('**/api/membership/plans**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ plans: purchasablePlansFixture })
      });
    });
    const page = await context.newPage();
    const pricing = await runPricingChecks(page, profile.name);
    const create =
      smokeScope === 'pricing'
        ? null
        : await runCreateChecks(page, profile.name);
    const promptPreview =
      smokeScope === 'pricing'
        ? null
        : await runPromptPreviewChecks(page, profile.name);
    const recharge =
      smokeScope === 'pricing'
        ? null
        : await runRechargeChecks(page, profile.name);
    const characters =
      smokeScope === 'pricing'
        ? null
        : await runCharacterChecks(page, profile.name);
    const lightbox =
      smokeScope !== 'pricing' &&
      /^https?:\/\/(?:127\.0\.0\.1|localhost)/.test(baseUrl)
        ? await runLightboxChecks(page, profile.name)
        : null;
    summary.results.push({
      viewport: profile.name,
      create,
      promptPreview,
      pricing,
      recharge,
      characters,
      lightbox
    });
    await context.close();
  }
} catch (error) {
  summary.error = {
    message: error instanceof Error ? error.message : String(error),
    details: error?.details
  };
  console.error(JSON.stringify(summary, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}

if (!process.exitCode) {
  console.log(JSON.stringify(summary, null, 2));
}
