import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { installUiAuditMockRoutes } from './lib/ui-audit-fixtures.mjs';

const baseUrl =
  process.env.WEBSITE_UI_AUDIT_BASE_URL ||
  process.env.BASE_URL ||
  'http://127.0.0.1:4173';

const outputDir = path.resolve(
  process.env.WEBSITE_UI_AUDIT_OUT_DIR ||
    path.join(process.cwd(), 'output/website-ui-regression')
);
const useMockData = process.env.WEBSITE_UI_AUDIT_MOCK_DATA !== '0';

const ROUTES = [
  {
    id: 'home',
    path: '/zh-CN/create',
    viewports: ['desktop', 'tablet', 'mobile', 'mobile-small'],
    cards: [
      '.create-home-promptbox',
      '.create-home-continue-card',
      '.create-home-banner-slide',
      '.create-home-quick-grid > a',
      '.create-v2-hero',
      '.create-v2-search',
      '.create-v2-image-card',
      '.create-v2-moodboard-card',
      '.create-v2-tool-card',
      '.discovery-image-tile',
      '.discovery-moodboard-tile'
    ],
    cardRadiusCards: [
      '.create-v2-hero-media',
      '.create-v2-search form',
      '.discovery-moodboard-collage',
      '.create-home-promptbox'
    ],
    minFirstScreenCards: { desktop: 2, mobile: 1 },
    readySelector:
      '.create-home-route .create-home-promptbox, .create-discovery-page .create-v2-search',
    headingSelector:
      '.create-home-promptbox-head strong, .create-v2-hero-title',
    h1Range: {
      desktop: { min: 16, max: 72 },
      tablet: { min: 16, max: 56 },
      mobile: { min: 16, max: 48 },
      'mobile-small': { min: 16, max: 48 }
    }
  },
  {
    id: 'prompts',
    path: '/gpt-image-2-prompts',
    viewports: ['desktop-wide', 'desktop', 'mobile', 'mobile-small'],
    cards: [
      '.prompt-browser-case-image-wrap',
      '.prompt-browser-case-card',
      '.prompt-seo-card'
    ],
    cardRadiusCards: [
      '.prompt-browser-case-card',
      '.prompt-browser-case-image-wrap',
      '.prompt-seo-hero-panel',
      '.prompt-seo-card'
    ],
    minFirstScreenCards: { desktop: 2, mobile: 1 },
    emptyStateSelector: '.prompt-browser-case-state',
    contentWidth: {
      selector: '.prompt-browser-main',
      viewport: 'desktop-wide',
      minAvailableWidthRatio: 0.9
    }
  },
  {
    id: 'pricing',
    path: '/zh-CN/pricing',
    cards: ['.pricing-plan-grid article'],
    minFirstScreenCards: { desktop: 2, mobile: 1 }
  },
  {
    id: 'blog',
    path: '/zh-CN/blog',
    cards: ['.blog-media-card', '.marketing-media-card'],
    minFirstScreenCards: { desktop: 6, mobile: 2 }
  },
  {
    id: 'blog',
    path: '/zh-CN/blog',
    cards: ['.usecases-grid .usecases-card'],
    minFirstScreenCards: { desktop: 6, mobile: 4 },
    categoryRow: '.use-cases-category-row'
  }
];

const VIEWPORTS = [
  { id: 'desktop-wide', width: 2560, height: 1440 },
  { id: 'desktop', width: 1440, height: 900 },
  { id: 'tablet', width: 1024, height: 768 },
  { id: 'mobile', width: 390, height: 844 },
  { id: 'mobile-small', width: 360, height: 780 }
];

function assert(condition, message, details = {}) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

function normalizeColor(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function looksLikeBlueAccent(value) {
  const color = normalizeColor(value);
  if (!color) return false;
  if (color.includes('#006bff') || color.includes('#006efe')) return true;
  const rgb = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!rgb) return false;
  const [, r, g, b] = rgb.map(Number);
  return b > 180 && b > r * 1.8 && b > g * 1.25;
}

function looksNearBlack(value) {
  const color = normalizeColor(value);
  if (!color) return false;
  if (color.includes('#111111') || color.includes('#000000')) return true;
  const rgb = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!rgb) return false;
  const [, r, g, b] = rgb.map(Number);
  return r <= 28 && g <= 28 && b <= 28;
}

async function gotoRouteForAudit(page, url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await page.waitForTimeout(1000 * attempt);
      }
    }
  }
  throw lastError;
}

async function getFirstScreenCount(page, selectors, viewportHeight) {
  return page.evaluate(
    ({ selectors, viewportHeight }) => {
      const nodes = selectors.flatMap((selector) =>
        Array.from(document.querySelectorAll(selector))
      );
      const unique = Array.from(new Set(nodes));
      return unique.filter((node) => {
        const rect = node.getBoundingClientRect();
        return (
          rect.width > 24 &&
          rect.height > 24 &&
          rect.top < viewportHeight &&
          rect.bottom > 0
        );
      }).length;
    },
    { selectors, viewportHeight }
  );
}

async function collectCardRadius(page, selectors) {
  return page.evaluate((selectors) => {
    const nodes = selectors.flatMap((selector) =>
      Array.from(document.querySelectorAll(selector))
    );
    const candidates = nodes
      .map((item) => {
        const rect = item.getBoundingClientRect();
        const styles = window.getComputedStyle(item);
        return {
          node: item,
          radius: parseFloat(styles.borderTopLeftRadius || '0'),
          width: rect.width,
          height: rect.height
        };
      })
      .filter((item) => item.width > 80 && item.height > 60);
    const candidate =
      candidates.find((item) => item.radius > 0) || candidates[0];
    if (!candidate) return null;
    return {
      selector: selectors.join(', '),
      radius: candidate.radius,
      width: candidate.width,
      height: candidate.height
    };
  }, selectors);
}

function overlapArea(a, b) {
  const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return x * y;
}

async function getRect(page, selector) {
  return page
    .locator(selector)
    .first()
    .evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height
      };
    });
}

async function getRects(page, selector) {
  return page.locator(selector).evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height
      };
    })
  );
}

async function collectSceneStyleLock(page, config) {
  return page.evaluate((config) => {
    const readNode = (node) => {
      const styles = window.getComputedStyle(node);
      const before = window.getComputedStyle(node, '::before');
      const after = window.getComputedStyle(node, '::after');
      const rect = node.getBoundingClientRect();
      return {
        className: node.className || '',
        text: node.textContent?.trim().slice(0, 60) || '',
        width: rect.width,
        height: rect.height,
        color: styles.color,
        backgroundColor: styles.backgroundColor,
        backgroundImage: styles.backgroundImage,
        borderRadius: parseFloat(styles.borderTopLeftRadius || '0'),
        borderColor: styles.borderTopColor,
        boxShadow: styles.boxShadow,
        beforeContent: before.content,
        beforeDisplay: before.display,
        afterContent: after.content,
        afterDisplay: after.display
      };
    };

    return {
      buttons: Array.from(document.querySelectorAll(config.buttons))
        .filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width > 1 && rect.height > 1;
        })
        .slice(0, 8)
        .map(readNode),
      cards: Array.from(document.querySelectorAll(config.cards))
        .filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width > 1 && rect.height > 1;
        })
        .slice(0, 8)
        .map(readNode)
    };
  }, config);
}

async function collectHotCaseLayout(page, config) {
  return page.evaluate((config) => {
    return Array.from(document.querySelectorAll(config.card))
      .slice(0, 8)
      .map((card) => {
        const body = card.querySelector(config.body);
        const description = card.querySelector(config.description);
        const cta = card.querySelector(config.cta);
        const cardRect = card.getBoundingClientRect();
        const bodyRect = body?.getBoundingClientRect();
        const descriptionRect = description?.getBoundingClientRect();
        const ctaRect = cta?.getBoundingClientRect();
        return {
          title: card.querySelector('h3')?.textContent?.trim() || '',
          description: description?.textContent?.trim() || '',
          cardTop: cardRect.top,
          descriptionHeight: descriptionRect?.height || 0,
          descriptionScrollWidth: description?.scrollWidth || 0,
          descriptionClientWidth: description?.clientWidth || 0,
          ctaBottom: ctaRect?.bottom || 0,
          ctaBottomGap:
            bodyRect && ctaRect ? bodyRect.bottom - ctaRect.bottom : null
        };
      });
  }, config);
}

async function auditRoute(page, route, viewport) {
  const url = new URL(route.path, baseUrl).toString();
  const headingSelector = route.headingSelector || 'h1';
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height
  });
  await gotoRouteForAudit(page, url);
  await page.waitForSelector(route.readySelector || 'h1', { timeout: 12000 });
  await page.waitForFunction(
    (selector) => {
      const heading = Array.from(document.querySelectorAll(selector)).find(
        (node) => {
          const rect = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden'
          );
        }
      );
      const h1Text = heading?.textContent?.trim() || '';
      return h1Text.length > 0 && !/正在加载|Loading/i.test(h1Text);
    },
    headingSelector,
    { timeout: 15000 }
  );

  const metrics = await page.evaluate((selector) => {
    const root = getComputedStyle(document.documentElement);
    const h1 = Array.from(document.querySelectorAll(selector)).find((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden'
      );
    });
    const h1Styles = h1 ? getComputedStyle(h1) : null;
    return {
      title: document.title,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      brandAccent: root.getPropertyValue('--web-brand-accent'),
      h1Text: h1?.textContent?.trim() || '',
      h1FontSize: h1Styles ? parseFloat(h1Styles.fontSize) : 0
    };
  }, headingSelector);

  assert(
    metrics.scrollWidth <= metrics.clientWidth + 1,
    `${route.id}/${viewport.id}: horizontal overflow`,
    metrics
  );

  assert(
    metrics.h1FontSize > 0,
    `${route.id}/${viewport.id}: missing h1`,
    metrics
  );

  const h1Range =
    route.h1Range?.[viewport.id] ||
    (viewport.width <= 430 ? { min: 26, max: 48 } : { min: 36, max: 72 });
  assert(
    metrics.h1FontSize >= h1Range.min && metrics.h1FontSize <= h1Range.max,
    `${route.id}/${viewport.id}: h1 font-size out of range`,
    { ...metrics, h1Range }
  );

  assert(
    !looksLikeBlueAccent(metrics.brandAccent),
    `${route.id}/${viewport.id}: website accent still uses blue`,
    metrics
  );

  if (route.contentWidth && viewport.id === route.contentWidth.viewport) {
    const contentWidth = await page
      .locator(route.contentWidth.selector)
      .evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const availableWidth = window.innerWidth - rect.left;
        return {
          left: rect.left,
          right: rect.right,
          width: rect.width,
          availableWidth,
          availableWidthRatio: rect.width / Math.max(availableWidth, 1)
        };
      });
    assert(
      contentWidth.availableWidthRatio >=
        route.contentWidth.minAvailableWidthRatio,
      `${route.id}/${viewport.id}: content does not use the available width`,
      {
        contentWidth,
        minAvailableWidthRatio: route.contentWidth.minAvailableWidthRatio
      }
    );
  }

  const cardRadius = await collectCardRadius(
    page,
    route.cardRadiusCards || route.cards
  );
  assert(
    cardRadius && cardRadius.radius >= 8 && cardRadius.radius <= 24,
    `${route.id}/${viewport.id}: card radius out of system range`,
    { cardRadius }
  );

  const firstScreenCards = await getFirstScreenCount(
    page,
    route.cards,
    viewport.height
  );
  const hasEmptyState = route.emptyStateSelector
    ? await page
        .locator(route.emptyStateSelector)
        .evaluate((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width > 80 && rect.height > 40;
        })
        .catch(() => false)
    : false;
  const minCards = route.minFirstScreenCards[viewport.id];
  const effectiveMinCards =
    minCards ??
    (viewport.width <= 430
      ? route.minFirstScreenCards.mobile
      : route.minFirstScreenCards.desktop);
  if (!hasEmptyState) {
    assert(
      firstScreenCards >= effectiveMinCards,
      `${route.id}/${viewport.id}: first-screen card density too low`,
      { firstScreenCards, minCards: effectiveMinCards }
    );
  }

  if (route.productVisual && viewport.width <= 430) {
    const visualVisible = await page
      .locator(route.productVisual)
      .evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return (
          rect.width > 120 && rect.height > 80 && rect.top < window.innerHeight
        );
      });
    assert(
      visualVisible,
      `${route.id}/${viewport.id}: product visual is below first screen`
    );
  }

  if (route.neonAssetFormatLock) {
    const neonAssets = await page.evaluate((config) => {
      const imageSources = Array.from(
        document.querySelectorAll(config.images)
      ).map((image) => image.getAttribute('src') || '');
      const backgroundImages = Array.from(
        document.querySelectorAll(config.backgroundNodes)
      ).map((node) => window.getComputedStyle(node).backgroundImage || '');
      return { imageSources, backgroundImages };
    }, route.neonAssetFormatLock);
    assert(
      neonAssets.imageSources.every((src) => src.includes('.webp')) &&
        neonAssets.backgroundImages.every(
          (background) => !background.includes('.png')
        ),
      `${route.id}/${viewport.id}: neon homepage artwork must use compressed WebP assets`,
      neonAssets
    );
  }

  if (route.heroVisualCenter && viewport.width >= 1024) {
    const [heroRect, visualRect] = await Promise.all([
      getRect(page, route.heroVisualCenter.hero),
      getRect(page, route.heroVisualCenter.visual)
    ]);
    const heroCenter = heroRect.top + heroRect.height / 2;
    const visualCenter = visualRect.top + visualRect.height / 2;
    const centerDelta = Math.abs(visualCenter - heroCenter);
    assert(
      visualRect.top > heroRect.top + 32 &&
        visualRect.bottom < heroRect.bottom - 24 &&
        centerDelta <= heroRect.height * 0.18,
      `${route.id}/${viewport.id}: hero illustration is not optically centered`,
      { heroRect, visualRect, centerDelta }
    );
  }

  if (route.caseCtas) {
    const caseCtas = await getRects(page, route.caseCtas);
    const visibleCtas = caseCtas.filter(
      (rect) => rect.width >= 80 && rect.height >= 32
    );
    assert(
      visibleCtas.length >= Math.min(4, firstScreenCards),
      `${route.id}/${viewport.id}: featured case cards are missing visible CTAs`,
      { caseCtas, firstScreenCards }
    );
  }

  if (route.collectionCtas) {
    const collectionCtas = await page.$$eval(route.collectionCtas, (links) =>
      links.map((link) => {
        const rect = link.getBoundingClientRect();
        return {
          text: link.textContent?.trim() || '',
          href: link.getAttribute('href') || '',
          width: rect.width,
          height: rect.height
        };
      })
    );
    const minTouchHeight = viewport.width <= 430 ? 44 : 36;
    assert(
      collectionCtas.length >= 5 &&
        collectionCtas.every(
          (item) =>
            item.href.includes('/prompts/category/') &&
            item.width >= 96 &&
            item.height >= minTouchHeight
        ),
      `${route.id}/${viewport.id}: case collection category CTAs are missing, undersized, or misrouted`,
      { collectionCtas, minTouchHeight }
    );
  }

  if (route.hotCaseLayout) {
    const hotCaseLayout = await collectHotCaseLayout(page, route.hotCaseLayout);
    const visibleCases = hotCaseLayout.filter((item) => item.ctaBottom > 0);
    assert(
      visibleCases.length >= Math.min(4, firstScreenCards),
      `${route.id}/${viewport.id}: featured case layout was not measurable`,
      hotCaseLayout
    );
    assert(
      visibleCases.every(
        (item) =>
          item.descriptionHeight <= 24 &&
          item.descriptionScrollWidth <= item.descriptionClientWidth + 2 &&
          !/prompt|提示词[:：]|凌晨|上传|生成|参考图/i.test(item.description)
      ),
      `${route.id}/${viewport.id}: featured case descriptions must be one-line category copy`,
      visibleCases
    );
    assert(
      visibleCases.every(
        (item) =>
          item.ctaBottomGap !== null &&
          item.ctaBottomGap >= 8 &&
          item.ctaBottomGap <= 20
      ),
      `${route.id}/${viewport.id}: featured case CTA is not anchored to card bottom`,
      visibleCases
    );
    const firstRowTop = Math.min(...visibleCases.map((item) => item.cardTop));
    const firstRow = visibleCases.filter(
      (item) => Math.abs(item.cardTop - firstRowTop) <= 4
    );
    const firstRowCtaBottoms = firstRow.map((item) => item.ctaBottom);
    assert(
      firstRowCtaBottoms.length > 1 &&
        Math.max(...firstRowCtaBottoms) - Math.min(...firstRowCtaBottoms) <= 3,
      `${route.id}/${viewport.id}: featured case CTAs are not row-aligned`,
      firstRow
    );
  }

  if (route.lazyCaseImages) {
    const lazyCaseImages = await page.$$eval(route.lazyCaseImages, (images) =>
      images.map((image) => ({
        src: image.getAttribute('src') || '',
        loading: image.getAttribute('loading') || '',
        decoding: image.getAttribute('decoding') || '',
        sizes: image.getAttribute('sizes') || '',
        fetchPriority:
          image.getAttribute('fetchpriority') ||
          image.getAttribute('fetchPriority') ||
          image.fetchPriority ||
          ''
      }))
    );
    assert(
      lazyCaseImages.length >= 6,
      `${route.id}/${viewport.id}: scenario case modules are missing`,
      lazyCaseImages
    );
    assert(
      lazyCaseImages.every(
        (image) =>
          image.loading === 'lazy' &&
          image.decoding === 'async' &&
          image.sizes.length > 0 &&
          image.fetchPriority === 'low'
      ),
      `${route.id}/${viewport.id}: below-fold scenario case thumbnails must be lazy and low priority`,
      lazyCaseImages
    );
  }

  if (route.firstScreenActions) {
    const actionRects = await getRects(page, route.firstScreenActions);
    assert(
      actionRects.length > 0 &&
        actionRects.every(
          (rect) =>
            rect.width > 96 &&
            rect.height >= 44 &&
            rect.top >= 0 &&
            rect.bottom <= viewport.height + 1
        ),
      `${route.id}/${viewport.id}: hero CTA is not fully visible in first screen`,
      { actionRects, viewport }
    );
  }

  if (route.mobileHeroNoOverlap && viewport.width <= 430) {
    for (const [aSelector, bSelector] of route.mobileHeroNoOverlap) {
      const [aRect, bRect] = await Promise.all([
        getRect(page, aSelector),
        getRect(page, bSelector)
      ]);
      const area = overlapArea(aRect, bRect);
      assert(
        area <= 1,
        `${route.id}/${viewport.id}: mobile hero layers overlap`,
        { aSelector, bSelector, aRect, bRect, overlapArea: area }
      );
    }
  }

  if (route.mobileHeroTitleDensity && viewport.width <= 430) {
    const titleDensity = await page.evaluate((config) => {
      const title = document.querySelector(config.selector);
      const container = document.querySelector(config.container);
      const hero = config.hero ? document.querySelector(config.hero) : null;
      const visual = config.visual
        ? document.querySelector(config.visual)
        : null;
      if (!title || !container) return null;
      const titleRect = title.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const heroRect = hero?.getBoundingClientRect();
      const visualRect = visual?.getBoundingClientRect();
      const titleStyles = window.getComputedStyle(title);
      const fontSize = parseFloat(titleStyles.fontSize || '0') || 1;
      const lineHeight =
        parseFloat(titleStyles.lineHeight || '0') || fontSize * 1.1;
      const visualCenterDelta = visualRect
        ? Math.abs(
            visualRect.left + visualRect.width / 2 - window.innerWidth / 2
          )
        : null;
      return {
        titleWidth: titleRect.width,
        titleHeight: titleRect.height,
        containerWidth: containerRect.width,
        widthRatio: titleRect.width / Math.max(containerRect.width, 1),
        estimatedLines: titleRect.height / Math.max(lineHeight, 1),
        heroViewportRatio: heroRect
          ? heroRect.height / window.innerHeight
          : null,
        visualCenterDelta,
        fontSize,
        lineHeight,
        text: title.textContent?.trim() || ''
      };
    }, route.mobileHeroTitleDensity);

    assert(
      titleDensity &&
        titleDensity.widthRatio >= route.mobileHeroTitleDensity.minWidthRatio &&
        titleDensity.estimatedLines <=
          route.mobileHeroTitleDensity.maxEstimatedLines + 0.15 &&
        (route.mobileHeroTitleDensity.maxHeroViewportRatio == null ||
          titleDensity.heroViewportRatio == null ||
          titleDensity.heroViewportRatio <=
            route.mobileHeroTitleDensity.maxHeroViewportRatio) &&
        (route.mobileHeroTitleDensity.maxVisualCenterDeltaPx == null ||
          titleDensity.visualCenterDelta == null ||
          titleDensity.visualCenterDelta <=
            route.mobileHeroTitleDensity.maxVisualCenterDeltaPx),
      `${route.id}/${viewport.id}: mobile hero title wastes horizontal space`,
      {
        ruleId: route.mobileHeroTitleDensity.ruleId,
        titleDensity,
        rule: route.mobileHeroTitleDensity
      }
    );
  }

  if (route.neonStyleLock) {
    const lock = await collectSceneStyleLock(page, route.neonStyleLock);
    assert(
      lock.buttons.length > 0 &&
        lock.buttons.every(
          (item) =>
            item.borderRadius >= 22 &&
            !(
              looksNearBlack(item.backgroundColor) &&
              item.boxShadow.includes('rgb(17, 17, 17)')
            )
        ),
      `${route.id}/${viewport.id}: black CTA shadow blends into black button`,
      lock.buttons
    );
    assert(
      lock.cards.length > 0 &&
        lock.cards.every(
          (item) =>
            item.borderRadius >= 14 &&
            item.borderRadius <= 24 &&
            !looksLikeBlueAccent(item.borderColor)
        ),
      `${route.id}/${viewport.id}: neon homepage card geometry drifted`,
      lock.cards
    );
  }

  if (route.categoryRow && viewport.id === 'mobile') {
    const compactRow = await page
      .locator(route.categoryRow)
      .evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const styles = window.getComputedStyle(node);
        return {
          height: rect.height,
          overflowX: styles.overflowX,
          scrollWidth: node.scrollWidth,
          clientWidth: node.clientWidth
        };
      });
    assert(
      compactRow.height <= 56 &&
        compactRow.scrollWidth >= compactRow.clientWidth,
      `${route.id}/${viewport.id}: category row is not compact horizontal control`,
      compactRow
    );
  }

  return {
    route: route.id,
    path: route.path,
    viewport: viewport.id,
    metrics,
    cardRadius,
    firstScreenCards,
    densitySkipped: hasEmptyState
  };
}

await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];
const failures = [];

async function saveFailureScreenshot(page, route, viewport) {
  const fileName = `${route.id}-${viewport.id}-failure.png`;
  const filePath = path.join(outputDir, fileName);
  await page.screenshot({ path: filePath, fullPage: false }).catch(() => {});
  return filePath;
}

try {
  for (const viewport of VIEWPORTS) {
    for (const route of ROUTES) {
      if (route.viewports && !route.viewports.includes(viewport.id)) {
        continue;
      }
      if (
        !route.viewports &&
        viewport.id !== 'desktop' &&
        viewport.id !== 'mobile'
      ) {
        continue;
      }
      const context = await browser.newContext();
      await installUiAuditMockRoutes(context, {
        baseUrl,
        enabled: useMockData && route.id === 'home'
      });
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      try {
        const result = await auditRoute(page, route, viewport);
        results.push(result);
      } catch (error) {
        const screenshotPath = await saveFailureScreenshot(
          page,
          route,
          viewport
        );
        failures.push({
          route: route.id,
          path: route.path,
          viewport: viewport.id,
          message: error.message,
          details: error.details || null,
          screenshot: screenshotPath
        });
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}

const report = {
  baseUrl,
  generatedAt: new Date().toISOString(),
  results,
  failures
};

await fs.writeFile(
  path.join(outputDir, 'report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8'
);

if (failures.length > 0) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(
  `Website UI regression passed: ${results.length} checks. Report: ${path.join(
    outputDir,
    'report.json'
  )}`
);
