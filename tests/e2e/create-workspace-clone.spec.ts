import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { installUiAuditMockRoutes } from '../../scripts/lib/ui-audit-fixtures.mjs';

const baseUrl =
  process.env.CREATE_WORKSPACE_BASE_URL || 'http://127.0.0.1:4173';
const personalBoardId = '11111111-1111-4111-8111-111111111111';
const officialPresetCount = 16;
const moodboardLibraryCardCount = officialPresetCount + 2;
const screenshotDir = path.resolve(
  process.cwd(),
  'outputs/krea-recon-2026-07-17/verify/automated'
);

const routes = {
  home: '/zh-CN/create',
  moodboards: '/zh-CN/moodboards',
  newMoodboard: '/zh-CN/moodboards/new',
  moodboardDetail: `/zh-CN/moodboards/${personalBoardId}`,
  image: '/zh-CN/image',
  pricing:
    '/zh-CN/create/pricing?source=creator_sidebar&returnTo=%2Fzh-CN%2Fimage'
} as const;

const personalBoardImages = [
  '/moodboards/curated/retro-web-1.webp',
  '/moodboards/curated/retro-web-2.webp',
  '/moodboards/curated/retro-web-3.webp',
  '/moodboards/curated/retro-web-4.webp',
  '/moodboards/curated/futurist-glam-1.webp',
  '/moodboards/curated/futurist-glam-2.webp',
  '/moodboards/curated/futurist-glam-3.webp'
];

const personalBoard = {
  id: personalBoardId,
  name: '霓虹个人情绪板',
  description: '个人情绪板交互测试',
  visibility: 'private',
  isOfficial: false,
  isOwner: true,
  coverImageUrl: personalBoardImages[0],
  itemCount: personalBoardImages.length,
  analysisStatus: 'ready',
  tasteProfile: '霓虹光线与复古网页噪点。',
  keywords: ['霓虹', '复古网页'],
  avoids: ['平淡自然光'],
  guidelines: ['保留颗粒质感'],
  representativeAssetIds: [],
  analysisVersion: 1,
  items: personalBoardImages.map((imageUrl, index) => ({
    id: `e2e-personal-item-${index + 1}`,
    moodboardId: personalBoardId,
    source: 'preset',
    imageUrl,
    title: `个人参考 ${index + 1}`,
    sortOrder: index,
    isRepresentative: true,
    createdAt: '2026-07-17T00:00:00.000Z'
  })),
  createdAt: '2026-07-17T00:00:00.000Z',
  updatedAt: '2026-07-17T00:00:00.000Z'
};

async function openStable(page: Page, pathname: string, ready: string) {
  await page.goto(`${baseUrl}${pathname}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000
  });
  await expect(page.locator(ready).first()).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(() => document.fonts?.status === 'loaded');
  await page.waitForTimeout(150);
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function expectNoOverlap(page: Page, first: string, second: string) {
  const overlapArea = await page.evaluate(
    ({ firstSelector, secondSelector }) => {
      const firstElement = document.querySelector(firstSelector);
      const secondElement = document.querySelector(secondSelector);
      if (!firstElement || !secondElement) return 0;
      const firstRect = firstElement.getBoundingClientRect();
      const secondRect = secondElement.getBoundingClientRect();
      const width = Math.max(
        0,
        Math.min(firstRect.right, secondRect.right) -
          Math.max(firstRect.left, secondRect.left)
      );
      const height = Math.max(
        0,
        Math.min(firstRect.bottom, secondRect.bottom) -
          Math.max(firstRect.top, secondRect.top)
      );
      return width * height;
    },
    { firstSelector: first, secondSelector: second }
  );
  expect(overlapArea).toBe(0);
}

async function capture(page: Page, name: string) {
  await page.screenshot({
    path: path.join(screenshotDir, `${name}.png`),
    animations: 'disabled'
  });
}

test.describe('Krea-informed create workspace clone', () => {
  test.describe.configure({ mode: 'serial', timeout: 90_000 });

  test.beforeAll(async () => {
    await mkdir(screenshotDir, { recursive: true });
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('webtomind:analytics-consent:v1', 'denied');
    });

    // The discovery feed intentionally has no bundled image fallback: a
    // backend outage must not silently replace the Krea-derived catalogue
    // with unrelated case-library assets. Reuse the shared deterministic API
    // fixture so this E2E suite exercises the current contract instead of an
    // obsolete "all APIs return 503" preview path.
    await installUiAuditMockRoutes(page.context(), {
      baseUrl,
      seedAuthSession: true
    });
    await page.route('**/api/moodboards', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ moodboards: [personalBoard] })
      });
    });
    await page.route(`**/api/moodboards/${personalBoardId}`, async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ moodboard: personalBoard })
      });
    });
  });

  test('desktop pages preserve the target information hierarchy', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });

    await openStable(page, routes.home, '.create-v2-hero');
    await expect(
      page.getByRole('searchbox', { name: '搜索创作灵感' })
    ).toBeVisible();
    await expect(page.locator('.discovery-image-tile')).toHaveCount(10);
    await expect(page.locator('.discovery-moodboard-tile')).toHaveCount(0);
    await expect(page.getByText('常用工具')).toHaveCount(0);
    const heroTitle = await page.locator('.create-v2-hero-title').textContent();
    await page.waitForTimeout(1_000);
    await expect(page.locator('.create-v2-hero-title')).toHaveText(
      heroTitle || ''
    );
    await expect(page.locator('.create-v2-hero-copy')).toBeVisible();
    await expect(
      page.locator('.create-v2-hero-media .create-v2-hero-title')
    ).toBeVisible();
    await expect(page.locator('.create-v2-hero-description')).toBeVisible();
    await expect(page.locator('.create-v2-hero-cta')).toBeVisible();
    await expect(page.locator('.discovery-gallery-heading')).toHaveCount(0);
    const searchRadius = await page.evaluate(() => {
      const form = document.querySelector<HTMLElement>(
        '.create-v2-search form'
      );
      const field = document.querySelector<HTMLElement>(
        '.create-v2-search .ui-search-field'
      );
      return {
        form: form ? Number.parseFloat(getComputedStyle(form).borderRadius) : 0,
        field: field
          ? Number.parseFloat(getComputedStyle(field).borderRadius)
          : 0
      };
    });
    expect(
      Math.abs(searchRadius.form - searchRadius.field)
    ).toBeLessThanOrEqual(5);
    const firstDiscoveryCard = page.locator('.discovery-image-tile').first();
    await firstDiscoveryCard.hover();
    await expect(
      firstDiscoveryCard.getByRole('button', { name: /^选择情绪板：/ })
    ).toBeVisible();
    await expect(
      firstDiscoveryCard.getByRole('button', { name: /保存到/ })
    ).toBeVisible();
    await expect(
      firstDiscoveryCard.locator('.discovery-image-caption')
    ).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await capture(page, 'home-1440');

    await firstDiscoveryCard.locator('.discovery-tile-primary').click();
    await expect(page.locator('.discovery-preview-page')).toBeVisible();
    await expect(page.locator('.discovery-preview-related')).toBeVisible();
    await expect(page.locator('.discovery-image-tile')).toHaveCount(9);
    await capture(page, 'home-image-preview-1440');

    await page.getByRole('link', { name: '返回灵感' }).click();
    await page.getByRole('tab', { name: '情绪板' }).click();
    await expect(page.locator('.discovery-moodboard-tile')).toHaveCount(
      officialPresetCount
    );
    await expect(page.locator('.discovery-image-tile')).toHaveCount(0);
    await expect(page.locator('.discovery-moodboard-caption span')).toHaveCount(
      0
    );
    const moodboardRatio = await page
      .locator('.discovery-moodboard-collage')
      .first()
      .evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width / rect.height;
      });
    expect(moodboardRatio).toBeGreaterThan(1.6);
    const firstMoodboardCard = page
      .locator('.discovery-moodboard-tile')
      .first();
    await firstMoodboardCard.hover();
    await expect(
      firstMoodboardCard.getByRole('button', { name: /保存/ })
    ).toBeVisible();
    await expect(
      firstMoodboardCard.getByRole('button', { name: /使用情绪板创作/ })
    ).toBeVisible();
    await capture(page, 'home-moodboards-1440');
    await firstMoodboardCard.locator('.discovery-tile-primary').click();
    await expect(
      page.locator('.discovery-preview-page.is-moodboard')
    ).toBeVisible();
    await expect(page.locator('.discovery-preview-aside')).toContainText(
      '风格画像'
    );
    await capture(page, 'home-moodboard-preview-1440');

    await page.getByRole('link', { name: '返回灵感' }).click();
    await page.getByRole('tab', { name: '图像' }).click();
    await expect(page.locator('.discovery-image-tile')).toHaveCount(10);
    await firstDiscoveryCard
      .getByRole('button', { name: /^选择情绪板：/ })
      .click();
    await expect(
      page.locator('.discovery-moodboard-picker-popover')
    ).toBeVisible();
    await expect(page.getByRole('link', { name: '创建情绪板' })).toBeVisible();

    await openStable(page, routes.home, '.create-v2-hero');
    await openStable(page, routes.moodboards, '.moodboard-library-hero');
    await expect(
      page.getByRole('heading', { name: '情绪板', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: '上传参考图' })
    ).toBeVisible();
    await expect(page.locator('.moodboard-library-card')).toHaveCount(
      moodboardLibraryCardCount
    );
    await expect(
      page.locator('.moodboard-library-cover-stack').first()
    ).toBeVisible();
    await page.getByRole('searchbox', { name: '搜索情绪板' }).fill('霓虹');
    await expect(page.locator('.moodboard-library-card')).toHaveCount(2);
    await page.getByRole('searchbox', { name: '搜索情绪板' }).fill('');
    const newCardCover = page.locator(
      '.moodboard-library-new-card .moodboard-library-cover'
    );
    const newCardPlus = page.locator('.moodboard-library-new-icon');
    const centeredPlus = await Promise.all([
      newCardCover.boundingBox(),
      newCardPlus.boundingBox()
    ]).then(([cover, plus]) => ({
      x:
        Math.abs(
          (cover?.x || 0) +
            (cover?.width || 0) / 2 -
            ((plus?.x || 0) + (plus?.width || 0) / 2)
        ) || 0,
      y:
        Math.abs(
          (cover?.y || 0) +
            (cover?.height || 0) / 2 -
            ((plus?.y || 0) + (plus?.height || 0) / 2)
        ) || 0
    }));
    expect(centeredPlus.x).toBeLessThanOrEqual(2);
    expect(centeredPlus.y).toBeLessThanOrEqual(2);

    await page.getByRole('button', { name: '排序个人情绪板' }).click();
    await expect(page.getByRole('radio', { name: '图片数量' })).toBeVisible();
    await page.getByRole('radio', { name: '图片数量' }).click();
    await page.getByRole('radio', { name: '最早优先' }).click();

    const firstPreset = page
      .locator('.moodboard-library-card.is-preset')
      .first();
    const firstPresetName = await firstPreset.locator('strong').innerText();
    await expect(
      firstPreset.locator('.moodboard-library-cover img')
    ).toHaveCount(5);
    await firstPreset.hover();
    const favoritePreset = firstPreset.getByRole('button', {
      name: '收藏并置顶预设情绪板'
    });
    await expect(favoritePreset).toBeVisible();
    const favoritePresetBox = await favoritePreset.boundingBox();
    expect(favoritePresetBox?.width || 0).toBeGreaterThanOrEqual(44);
    expect(favoritePresetBox?.height || 0).toBeGreaterThanOrEqual(44);
    await expect(
      firstPreset.locator('.moodboard-library-image-count')
    ).toHaveCount(0);
    await favoritePreset.click();
    await expect(
      firstPreset.getByRole('button', { name: '取消收藏预设情绪板' })
    ).toBeVisible();
    await expect(
      page.locator('.moodboard-library-card.is-personal')
    ).toHaveCount(1);
    const personalStack = page
      .locator('.moodboard-library-card.is-personal')
      .first();
    const stackedImage = personalStack
      .locator('.moodboard-library-cover-stack img')
      .first();
    const stackedTransform = await stackedImage.evaluate(
      (element) => getComputedStyle(element).transform
    );
    await personalStack.hover();
    await page.waitForTimeout(420);
    await expect(stackedImage).not.toHaveCSS('transform', stackedTransform);
    await expect(
      personalStack.getByRole('button', { name: '更多操作' })
    ).toBeVisible();
    await personalStack.getByRole('button', { name: '更多操作' }).click();
    await expect(page.getByRole('button', { name: '前往创作' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(
      page
        .locator('.moodboard-library-card.is-preset')
        .first()
        .locator('strong')
    ).toHaveText(firstPresetName);
    await page
      .locator('.moodboard-library-cover img')
      .evaluateAll((images) =>
        Promise.all(
          images.map((image) =>
            image instanceof HTMLImageElement
              ? image.decode()
              : Promise.resolve()
          )
        )
      );
    await page.evaluate(() => window.scrollTo(0, 0));
    await expectNoHorizontalOverflow(page);
    await capture(page, 'moodboards-1440');

    await openStable(page, routes.moodboardDetail, '.moodboard-detail-main');
    await expect(page.locator('.moodboard-detail-summary article')).toHaveCount(
      3
    );
    await expect(page.locator('.moodboard-detail-compact-header')).toHaveCount(
      0
    );
    await page.getByRole('button', { name: '编辑情绪板名称' }).click();
    await expect(
      page.getByRole('textbox', { name: '情绪板名称' })
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('textbox', { name: '生成指导' })).toBeVisible();
    await expect(page.locator('.moodboard-item-card')).toHaveCount(7);
    await expect(page.locator('.moodboard-suggestions')).toBeVisible();
    await expect(
      page.locator('.moodboard-suggestions-grid > button').first()
    ).toBeVisible();
    await expect(page.locator('.moodboard-canvas.visual-masonry')).toHaveCount(
      1
    );
    await expect(
      page.locator('.moodboard-suggestions-grid.visual-masonry')
    ).toHaveCount(1);
    const detailMasonryColumns = await page
      .locator('.moodboard-canvas')
      .evaluate((element) => getComputedStyle(element).columnCount);
    expect(Number(detailMasonryColumns)).toBeGreaterThanOrEqual(4);
    const suggestionToolbarLayout = await page.evaluate(() => {
      const title = document
        .querySelector<HTMLElement>('.moodboard-suggestions > header h2')
        ?.getBoundingClientRect();
      const search = document
        .querySelector<HTMLElement>('.moodboard-suggestions-search')
        ?.getBoundingClientRect();
      const refresh = document
        .querySelector<HTMLElement>('.moodboard-suggestions-tools .ui-button')
        ?.getBoundingClientRect();
      return {
        titleCenter: title ? title.top + title.height / 2 : 0,
        searchCenter: search ? search.top + search.height / 2 : 0,
        searchLeft: search?.left || 0,
        refreshRight: refresh?.right || 0
      };
    });
    expect(
      Math.abs(
        suggestionToolbarLayout.titleCenter -
          suggestionToolbarLayout.searchCenter
      )
    ).toBeLessThanOrEqual(4);
    expect(suggestionToolbarLayout.searchLeft).toBeGreaterThanOrEqual(
      suggestionToolbarLayout.refreshRight
    );
    const firstMoodboardImage = page.locator('.moodboard-item-card').first();
    await firstMoodboardImage.hover();
    await expect(
      firstMoodboardImage.getByRole('button', { name: '移除参考图' })
    ).toBeVisible();
    await expect(
      firstMoodboardImage.locator('.moodboard-item-remove')
    ).toHaveCount(1);
    await firstMoodboardImage.locator('.moodboard-item-preview').click();
    await expect(page.locator('.moodboard-image-preview-dialog')).toBeVisible();
    await expect(
      page.locator('.moodboard-image-preview-strip button')
    ).toHaveCount(7);
    await page
      .locator('.moodboard-image-preview-strip img')
      .evaluateAll((images) =>
        Promise.all(
          images.map((image) =>
            image instanceof HTMLImageElement
              ? image.decode()
              : Promise.resolve()
          )
        )
      );
    await capture(page, 'moodboard-detail-preview-1440');
    await page.keyboard.press('Escape');
    await expect(page.locator('.moodboard-image-preview-dialog')).toHaveCount(
      0
    );
    await expectNoHorizontalOverflow(page);
    await capture(page, 'moodboard-detail-1440');
    await page.locator('.moodboard-suggestions').scrollIntoViewIfNeeded();
    await expect(
      page.locator('.moodboard-detail-compact-header')
    ).toBeVisible();
    await expectNoOverlap(
      page,
      '.moodboard-detail-compact-header',
      '.create-side-nav'
    );
    await expectNoOverlap(
      page,
      '.moodboard-detail-compact-header',
      '.moodboard-suggestions-search'
    );
    await expect(page.locator('.moodboard-detail-footer')).toHaveCount(0);
    await page
      .locator('.moodboard-suggestions-grid img')
      .evaluateAll((images) =>
        Promise.all(
          images.map((image) =>
            image instanceof HTMLImageElement
              ? image.decode()
              : Promise.resolve()
          )
        )
      );
    await capture(page, 'moodboard-detail-suggestions-1440');

    await openStable(page, routes.image, '.image-studio-composer');
    await page.locator('[data-studio-tool="model"]').click();
    await expect(
      page.locator('.image-studio-tool-popover.is-model')
    ).toBeVisible();
    await expect(
      page.locator('.image-studio-tool-popover.is-model [role="option"]')
    ).toHaveCount(8);
    await page.keyboard.press('Escape');
    await expect(
      page.locator('.image-studio-tool-popover.is-model')
    ).toHaveCount(0);
    await expect(page.locator('.recipe-preset-card')).toHaveCount(4);
    // V2 derives the empty state from session turns, independently from the
    // account-wide generation history used by the legacy records rail.
    await expect(page.locator('.image-session-conversation')).toHaveCount(0);

    const promptEditor = page.locator('.image-studio-composer textarea');
    const recipe = page.locator('.recipe-preset-card').first();
    const initialPrompt = await promptEditor.inputValue();
    const initialEditorHeight = await promptEditor.evaluate(
      (element) => element.getBoundingClientRect().height
    );
    await recipe.hover();
    const previewPrompt = await promptEditor.inputValue();
    expect(previewPrompt).not.toBe(initialPrompt);
    await expect
      .poll(() =>
        promptEditor.evaluate(
          (element) => element.getBoundingClientRect().height
        )
      )
      .toBe(initialEditorHeight);
    await page.mouse.move(0, 0);
    await expect(promptEditor).toHaveValue(initialPrompt);
    await recipe.click();
    await expect(promptEditor).toHaveValue(previewPrompt);
    await expect(recipe).toHaveAttribute('data-active', 'true');

    const composerLayout = await page.evaluate(() => {
      const editor = document.querySelector<HTMLElement>(
        '.image-studio-composer textarea'
      );
      const composer = document.querySelector<HTMLElement>(
        '.image-studio-composer'
      );
      const bounds = composer?.getBoundingClientRect();
      return {
        editorHeight: editor
          ? Number.parseFloat(getComputedStyle(editor).height)
          : 0,
        composerPosition: composer ? getComputedStyle(composer).position : '',
        composerBottom: bounds?.bottom || 0,
        viewportHeight: window.innerHeight
      };
    });
    expect(composerLayout.editorHeight).toBeGreaterThanOrEqual(
      initialEditorHeight
    );
    expect(composerLayout.editorHeight).toBeLessThanOrEqual(116);
    expect(composerLayout.composerPosition).toBe('fixed');
    expect(composerLayout.composerBottom).toBeLessThanOrEqual(
      composerLayout.viewportHeight
    );
    await expectNoHorizontalOverflow(page);
    await capture(page, 'image-1440');

    await openStable(page, routes.pricing, '.pricing-krea-hero');
    await expect(page.locator('.pricing-krea-plan-card')).toHaveCount(3);
    await expect(
      page.locator('.pricing-krea-plan-card[data-popular="true"]')
    ).toHaveCount(1);
    await expect(
      page.locator('.pricing-cycle-toolbar .pricing-billing-choice')
    ).toHaveCount(2);
    await expect(
      page.locator('.pricing-krea-plan-card[data-current="true"]')
    ).toHaveCount(1);
    await page.locator('.create-side-nav-profile').click();
    const pricingHref = await page
      .locator('.creator-account-upgrade')
      .getAttribute('href');
    expect(pricingHref).toContain('returnTo=%2Fzh-CN%2Fcreate%2Fimage');
    expect(pricingHref).not.toContain('returnTo=%252Fzh-CN');
    const yearlyChoice = page
      .locator('.pricing-cycle-toolbar')
      .getByRole('button', { name: '年付' });
    await yearlyChoice.click();
    await expect(yearlyChoice).toHaveClass(/is-active/);
    await expectNoHorizontalOverflow(page);
    await capture(page, 'pricing-1440');

    await page.setViewportSize({ width: 1223, height: 768 });
    await openStable(page, routes.pricing, '.pricing-krea-hero');
    const constrainedDesktopLayout = await page
      .locator('.pricing-krea-plan-card')
      .evaluateAll((cards) =>
        cards.map((card) => {
          const rect = card.getBoundingClientRect();
          return {
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            width: Math.round(rect.width)
          };
        })
      );
    expect(
      new Set(constrainedDesktopLayout.map((card) => card.left)).size
    ).toBe(3);
    expect(
      Math.min(...constrainedDesktopLayout.map((card) => card.width))
    ).toBeGreaterThanOrEqual(230);
    await expectNoHorizontalOverflow(page);
    await capture(page, 'pricing-1223');

    await page.setViewportSize({ width: 1024, height: 900 });
    await openStable(page, routes.pricing, '.pricing-krea-hero');
    const mediumPlanLayout = await page
      .locator('.pricing-krea-plan-card')
      .evaluateAll((cards) =>
        cards.map((card) => {
          const rect = card.getBoundingClientRect();
          return { left: Math.round(rect.left), top: Math.round(rect.top) };
        })
      );
    expect(new Set(mediumPlanLayout.map((card) => card.left)).size).toBe(3);
    const mediumPlanTops = mediumPlanLayout.map((card) => card.top);
    expect(
      Math.max(...mediumPlanTops) - Math.min(...mediumPlanTops)
    ).toBeLessThan(40);
    await expectNoHorizontalOverflow(page);
    await capture(page, 'pricing-1024');

    await page.setViewportSize({ width: 390, height: 844 });
    await openStable(page, routes.pricing, '.pricing-krea-hero');
    const mobilePlanLayout = await page
      .locator('.pricing-krea-plan-grid')
      .evaluate((grid) => {
        const cards = Array.from(
          grid.querySelectorAll<HTMLElement>('.pricing-krea-plan-card')
        );
        return {
          clientWidth: grid.clientWidth,
          scrollWidth: grid.scrollWidth,
          cards: cards.map((card) => {
            const rect = card.getBoundingClientRect();
            return {
              top: Math.round(rect.top),
              width: Math.round(rect.width)
            };
          })
        };
      });
    expect(mobilePlanLayout.cards).toHaveLength(3);
    expect(new Set(mobilePlanLayout.cards.map((card) => card.top)).size).toBe(
      1
    );
    expect(
      Math.min(...mobilePlanLayout.cards.map((card) => card.width))
    ).toBeGreaterThanOrEqual(280);
    expect(mobilePlanLayout.scrollWidth).toBeGreaterThan(
      mobilePlanLayout.clientWidth
    );
    await expectNoHorizontalOverflow(page);
    await capture(page, 'pricing-390');
  });

  test('personal moodboards can be deleted only after destructive confirmation', async ({
    page
  }) => {
    let deleteCount = 0;
    await page.unroute(`**/api/moodboards/${personalBoardId}`);
    await page.route(`**/api/moodboards/${personalBoardId}`, async (route) => {
      if (route.request().method() === 'DELETE') {
        deleteCount += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ deleted: true })
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ moodboard: personalBoard })
      });
    });

    await openStable(page, routes.moodboards, '.moodboard-library-hero');
    const personalCard = page
      .locator('.moodboard-library-card.is-personal')
      .first();
    await personalCard.hover();
    await personalCard.getByRole('button', { name: '更多操作' }).click();
    await page.getByRole('button', { name: '删除情绪板' }).click();
    await expect(
      page.getByRole('heading', { name: '删除这个情绪板？' })
    ).toBeVisible();
    expect(deleteCount).toBe(0);
    await page.getByRole('button', { name: '确认删除' }).click();
    await expect(
      page.locator('.moodboard-library-card.is-personal')
    ).toHaveCount(0);
    await expect(
      page.getByText('已删除情绪板“霓虹个人情绪板”。')
    ).toBeVisible();
    expect(deleteCount).toBe(1);
    await expectNoHorizontalOverflow(page);
  });

  test('new moodboard stays ephemeral until the first asset and analyzes afterward', async ({
    page
  }) => {
    await page.unroute('**/api/moodboards');
    await page.unroute(`**/api/moodboards/${personalBoardId}`);
    await page.unroute('**/api/**');
    const calls: string[] = [];
    const createdBoardId = '22222222-2222-4222-8222-222222222222';
    const imageUrl =
      'data:image/svg+xml;charset=utf-8,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="760"><rect width="600" height="760" fill="#d85b3e"/><circle cx="300" cy="310" r="150" fill="#f7d46c"/></svg>'
      );
    const now = new Date().toISOString();
    const baseBoard = {
      id: createdBoardId,
      name: '新建情绪板',
      visibility: 'private',
      isOfficial: false,
      isOwner: true,
      coverImageUrl: imageUrl,
      itemCount: 1,
      items: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          moodboardId: createdBoardId,
          source: 'generation',
          imageUrl,
          title: '我的橙色资产',
          imageGenerationId: 'gallery-new-flow',
          sortOrder: 0,
          isRepresentative: true,
          createdAt: now
        }
      ],
      analysisStatus: 'idle',
      tasteProfile: '',
      keywords: [],
      avoids: [],
      guidelines: [],
      representativeAssetIds: [],
      analysisVersion: 0,
      createdAt: now,
      updatedAt: now
    };

    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === '/api/discovery/search') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            query: url.searchParams.get('q') || '',
            moodboards: [],
            images: [
              {
                id: 'gallery-new-flow',
                kind: 'gallery',
                title: '我的橙色资产',
                prompt: 'warm orange editorial geometry',
                imageUrl,
                model: 'test',
                href: '#'
              }
            ]
          })
        });
        return;
      }
      if (url.pathname === '/api/image/references/from-generation') {
        calls.push('import-reference');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            reference: {
              id: 'reference-new-flow',
              thumbnailUrl: imageUrl,
              label: '我的橙色资产'
            }
          })
        });
        return;
      }
      if (url.pathname === '/api/moodboards' && request.method() === 'POST') {
        calls.push('create-board');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            moodboard: { ...baseBoard, itemCount: 0, items: [] }
          })
        });
        return;
      }
      if (
        url.pathname === `/api/moodboards/${createdBoardId}/items` &&
        request.method() === 'POST'
      ) {
        calls.push('add-item');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ moodboard: baseBoard })
        });
        return;
      }
      if (
        url.pathname === `/api/moodboards/${createdBoardId}/analyze` &&
        request.method() === 'POST'
      ) {
        calls.push('analyze');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            moodboard: {
              ...baseBoard,
              analysisStatus: 'ready',
              tasteProfile: '高饱和暖色与简洁几何构成的编辑感。',
              keywords: ['高饱和暖色', '几何构图']
            }
          })
        });
        return;
      }
      if (
        url.pathname === `/api/moodboards/${createdBoardId}` &&
        request.method() === 'GET'
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ moodboard: baseBoard })
        });
        return;
      }
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'unexpected test request' })
      });
    });

    await page.setViewportSize({ width: 1440, height: 1000 });
    await openStable(page, routes.newMoodboard, '.moodboard-new-empty');
    await expect(page).toHaveURL(/\/create\/moodboards\/new$/);
    await expect(page.locator('.moodboard-detail-summary')).toHaveCount(0);
    expect(calls).toEqual([]);
    await capture(page, 'moodboard-new-empty-1440');

    await page.getByRole('button', { name: '从我的资产选择' }).click();
    await expect(page.locator('.moodboard-source-dialog')).toBeVisible();
    await expect(
      page.getByRole('button', { name: '选择 我的橙色资产' })
    ).toBeVisible();
    await capture(page, 'moodboard-new-assets-1440');
    await page.getByRole('button', { name: '选择 我的橙色资产' }).click();

    await expect(page).toHaveURL(
      new RegExp(`/moodboards/${createdBoardId}$`)
    );
    await expect(page.locator('.moodboard-item-card')).toHaveCount(1);
    expect(calls).toEqual(['import-reference', 'create-board', 'add-item']);
    await expect(page.locator('.moodboard-detail-summary')).toHaveCount(0);
    await page.getByRole('button', { name: '分析风格' }).click();
    await expect(page.locator('.moodboard-detail-summary')).toContainText(
      '高饱和暖色与简洁几何构成的编辑感。'
    );
    await expect(page.locator('.moodboard-detail-summary')).toContainText(
      '几何构图'
    );
    expect(calls).toEqual([
      'import-reference',
      'create-board',
      'add-item',
      'analyze'
    ]);
    await expectNoHorizontalOverflow(page);
    await capture(page, 'moodboard-new-analyzed-1440');

    await page.setViewportSize({ width: 390, height: 844 });
    await openStable(page, routes.newMoodboard, '.moodboard-new-empty');
    await expectNoHorizontalOverflow(page);
    const newPageActions = page.locator(
      '.moodboard-new-empty-actions .ui-button'
    );
    await expect(newPageActions).toHaveCount(2);
    for (let index = 0; index < 2; index += 1) {
      const box = await newPageActions.nth(index).boundingBox();
      expect(box?.height || 0).toBeGreaterThanOrEqual(44);
    }
    await capture(page, 'moodboard-new-empty-390');
  });

  test('opening the same preset twice creates only one personal copy', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.unroute('**/api/moodboards');
    await page.unroute(`**/api/moodboards/${personalBoardId}`);
    await page.unroute('**/api/**');

    const now = '2026-07-17T00:00:00.000Z';
    const presetId = 'demo-preset-golden-hour';
    const presetName = 'Coquette 花园';
    const personalCopyId = '44444444-4444-4444-8444-444444444444';
    const preset = {
      id: presetId,
      name: presetName,
      description: 'Preset copy regression fixture',
      visibility: 'public',
      isOfficial: true,
      isOwner: false,
      coverImageUrl:
        'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=900',
      itemCount: 1,
      items: [
        {
          id: 'preset-item-1',
          moodboardId: presetId,
          source: 'preset',
          imageUrl:
            'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=900',
          title: 'Ocean',
          sortOrder: 0,
          isRepresentative: true,
          createdAt: now
        }
      ],
      analysisStatus: 'ready',
      tasteProfile: 'Deep ocean blues and soft atmospheric light.',
      keywords: ['ocean blue'],
      avoids: ['harsh red'],
      guidelines: ['Keep the light diffuse.'],
      representativeAssetIds: [],
      analysisVersion: 1,
      createdAt: now,
      updatedAt: now
    };
    const personalCopy = {
      ...preset,
      id: personalCopyId,
      visibility: 'private',
      isOfficial: false,
      isOwner: true,
      sourcePresetKey: presetId,
      items: preset.items.map((item) => ({
        ...item,
        id: 'copy-item-1',
        moodboardId: personalCopyId
      }))
    };
    let postCount = 0;
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      if (pathname === '/api/moodboards' && request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ moodboards: [] })
        });
        return;
      }
      if (pathname === '/api/moodboards' && request.method() === 'POST') {
        postCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 220));
        await route.fulfill({
          status: postCount === 1 ? 201 : 200,
          contentType: 'application/json',
          body: JSON.stringify({ moodboard: personalCopy })
        });
        return;
      }
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'unused API in isolated test' })
      });
    });

    await openStable(page, routes.moodboards, '.moodboard-library-hero');
    const primary = page
      .locator('.moodboard-library-card.is-preset')
      .getByRole('button', { name: `打开 ${presetName}` });
    await primary.evaluate((element) => {
      element.click();
      element.click();
    });
    await expect(page).toHaveURL(new RegExp(`${personalCopyId}$`));
    expect(postCount).toBe(1);
  });

  test('mobile pages remain dense, touch-safe, and overflow-free', async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await openStable(page, routes.home, '.create-v2-hero');
    await expect(page.locator('.discovery-image-tile')).toHaveCount(10);
    await expect(page.locator('.create-v2-hero-controls')).toHaveCount(0);
    const heroCtaBox = await page.locator('.create-v2-hero-cta').boundingBox();
    expect(heroCtaBox?.height || 0).toBeGreaterThanOrEqual(44);
    const uploadIconBox = await page
      .getByRole('button', { name: '上传图片搜索' })
      .locator('svg')
      .boundingBox();
    expect(uploadIconBox?.width || 0).toBeGreaterThanOrEqual(16);
    expect(uploadIconBox?.height || 0).toBeGreaterThanOrEqual(16);
    const saveActionBox = await page
      .locator('.discovery-image-quick-save')
      .first()
      .boundingBox();
    expect(saveActionBox?.height || 0).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page);
    await capture(page, 'home-390');

    await page.locator('.discovery-tile-primary').first().click();
    await expect(page.locator('.discovery-preview-page')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await capture(page, 'home-image-preview-390');

    await page.getByRole('link', { name: '返回灵感' }).click();
    await page.getByRole('tab', { name: '情绪板' }).click();
    await expect(page.locator('.discovery-moodboard-tile')).toHaveCount(
      officialPresetCount
    );
    await expectNoHorizontalOverflow(page);
    await capture(page, 'home-moodboards-390');

    await openStable(page, routes.moodboards, '.moodboard-library-hero');
    await expect(page.locator('.moodboard-library-card')).toHaveCount(
      moodboardLibraryCardCount
    );
    const mobilePresetFavorite = page
      .locator('.moodboard-library-card.is-preset')
      .first()
      .getByRole('button', { name: '收藏并置顶预设情绪板' });
    const mobileFavoriteBox = await mobilePresetFavorite.boundingBox();
    expect(mobileFavoriteBox?.width || 0).toBeGreaterThanOrEqual(44);
    expect(mobileFavoriteBox?.height || 0).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page);
    await capture(page, 'moodboards-390');

    await openStable(page, routes.moodboardDetail, '.moodboard-detail-main');
    await expect(page.locator('.moodboard-detail-summary article')).toHaveCount(
      3
    );
    await expect(page.locator('.moodboard-item-card')).toHaveCount(7);
    await expect(page.locator('.moodboard-canvas')).toHaveCSS(
      'column-count',
      '2'
    );
    const mobileRemoveButton = page
      .locator('.moodboard-item-card')
      .first()
      .getByRole('button', { name: '移除参考图' });
    const mobileRemoveBox = await mobileRemoveButton.boundingBox();
    expect(mobileRemoveBox?.width || 0).toBeGreaterThanOrEqual(44);
    expect(mobileRemoveBox?.height || 0).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page);
    await capture(page, 'moodboard-detail-390');
    await page.locator('.moodboard-suggestions').scrollIntoViewIfNeeded();
    await expect(
      page.locator('.moodboard-detail-compact-header')
    ).toBeVisible();
    await expectNoOverlap(
      page,
      '.moodboard-detail-compact-header',
      '.moodboard-suggestions-search'
    );
    await page
      .locator('.moodboard-suggestions-grid img')
      .evaluateAll((images) =>
        Promise.all(
          images.map((image) =>
            image instanceof HTMLImageElement
              ? image.decode()
              : Promise.resolve()
          )
        )
      );
    await capture(page, 'moodboard-detail-suggestions-390');

    await openStable(page, routes.image, '.image-studio-composer');
    await expect(page.locator('.recipe-preset-card')).toHaveCount(4);
    await expect(page.locator('.image-studio-composer')).toHaveCSS(
      'position',
      'fixed'
    );
    const mobileFlow = await page.evaluate(() => {
      const composer = document.querySelector<HTMLElement>(
        '.image-studio-composer'
      );
      const primaryAction = document.querySelector<HTMLElement>(
        '.image-studio-generate'
      );
      const composerBounds = composer?.getBoundingClientRect();
      const actionBounds = primaryAction?.getBoundingClientRect();
      return {
        composerTop: composerBounds?.top || 0,
        composerBottom: composerBounds?.bottom || 0,
        actionTop: actionBounds?.top || 0,
        actionBottom: actionBounds?.bottom || 0,
        actionHeight: actionBounds?.height || 0,
        viewportHeight: window.innerHeight
      };
    });
    expect(mobileFlow.composerTop).toBeGreaterThanOrEqual(0);
    expect(mobileFlow.composerBottom).toBeLessThanOrEqual(
      mobileFlow.viewportHeight
    );
    expect(mobileFlow.actionTop).toBeGreaterThanOrEqual(0);
    expect(mobileFlow.actionBottom).toBeLessThanOrEqual(
      mobileFlow.viewportHeight
    );
    expect(mobileFlow.actionHeight).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page);
    await capture(page, 'image-390');

    await openStable(page, routes.pricing, '.pricing-krea-hero');
    await expect(page.locator('.pricing-krea-plan-card')).toHaveCount(3);
    const billingButtons = page.locator(
      '.pricing-cycle-toolbar .pricing-billing-choice'
    );
    await expect(billingButtons).toHaveCount(2);
    for (const button of await billingButtons.all()) {
      const box = await button.boundingBox();
      expect(box?.height || 0).toBeGreaterThanOrEqual(40);
    }
    await expect(page.locator('.pricing-billing-save')).toBeVisible();
    await expectNoOverlap(
      page,
      '.pricing-billing-save',
      '.pricing-krea-plan-badge'
    );
    await expectNoHorizontalOverflow(page);
    await capture(page, 'pricing-390');
  });
});
