import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { installUiAuditMockRoutes } from './lib/ui-audit-fixtures.mjs';

const baseUrl =
  process.env.LOCAL_AUTH_PREVIEW_BASE_URL ||
  process.env.BASE_URL ||
  'http://127.0.0.1:4173';
const outputDir = path.resolve(process.cwd(), 'output/local-auth-preview-smoke');
const useMockData = process.env.LOCAL_AUTH_PREVIEW_MOCK_DATA !== '0';

function assert(condition, message, details = {}) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

async function isVisible(locator) {
  return locator.isVisible().catch(() => false);
}

async function assertProfileSelectOpensAbovePopover(page, popover, labelPattern) {
  const control = popover
    .locator('.creator-account-preference')
    .filter({ hasText: labelPattern })
    .first();
  await control.waitFor({ state: 'visible', timeout: 5_000 });

  const trigger = control.locator('.creator-account-preference-trigger').first();
  await trigger.click();

  const content = page.locator('.creator-account-preference-content').first();
  await content.waitFor({ state: 'visible', timeout: 5_000 });

  const metrics = await content.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      zIndex: Number(window.getComputedStyle(element).zIndex),
      optionCount: element.querySelectorAll('[role="option"]').length,
      width: rect.width,
      height: rect.height
    };
  });
  const popoverZIndex = await popover.evaluate((element) =>
    Number(window.getComputedStyle(element).zIndex)
  );

  assert(
    metrics.zIndex > popoverZIndex,
    'Account select dropdown should render above its profile popover',
    { metrics, popoverZIndex }
  );
  assert(
    metrics.optionCount >= 2 && metrics.width > 0 && metrics.height > 0,
    'Account select dropdown should expose visible options',
    { metrics }
  );

  await page.keyboard.press('Escape');
  await content.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: 'zh-CN'
  });

  await installUiAuditMockRoutes(context, {
    baseUrl,
    enabled: useMockData,
    seedAuthSession: true
  });

  await context.addInitScript(() => {
    try {
      window.localStorage.setItem('webtomind:create-onboarding-seen:v1', '1');
      window.localStorage.setItem('workspace:onboarding-seen', '1');
      window.localStorage.removeItem(
        'webtomind:create-system-announcements-seen'
      );
    } catch {
      // The smoke assertions below will fail if local storage is unavailable.
    }
  });

  const page = await context.newPage();
  try {
    const response = await page.goto(`${baseUrl}/zh-CN/create`, {
      waitUntil: 'networkidle',
      timeout: 30_000
    });
    assert(
      response === null || response.status() < 400,
      'Authenticated preview route should load',
      { status: response?.status(), url: page.url() }
    );

    const profileButton = page.locator('button.create-side-nav-profile').first();
    await profileButton.waitFor({ state: 'visible', timeout: 10_000 });

    const loginLinkVisible = await isVisible(
      page.locator('a.create-side-nav-profile[href*="/login"]').first()
    );
    assert(!loginLinkVisible, 'Side nav should not render logged-out profile');

    const onboardingVisible = await isVisible(
      page.locator('.create-onboarding-backdrop, .create-onboarding-modal')
    );
    assert(!onboardingVisible, 'Create onboarding should not block preview');

    const standaloneCreditVisible = await isVisible(
      page.locator('.create-side-nav-credit-balance').first()
    );
    assert(
      !standaloneCreditVisible,
      'Side nav should not render the retired standalone credit entry'
    );

    const miniNavLanguageVisible = await isVisible(
      page.locator('.image-create-mininav-language').first()
    );
    assert(
      !miniNavLanguageVisible,
      'Top mini nav should not render the old standalone language toggle'
    );

    const miniNavCreditsVisible = await isVisible(
      page.locator('.image-create-mininav-credits').first()
    );
    assert(
      !miniNavCreditsVisible,
      'Top mini nav should not duplicate credits outside the profile popover'
    );

    const announcementButton = page
      .locator('button.create-side-nav-announcement-trigger')
      .first();
    await announcementButton.waitFor({ state: 'visible', timeout: 5_000 });
    const unreadDotVisible = await isVisible(
      page.locator('.create-side-nav-announcement-unread-dot').first()
    );
    assert(unreadDotVisible, 'System announcement entry should show unread dot');

    await announcementButton.click();
    const announcementModal = page
      .locator('.create-side-nav-announcement-modal')
      .first();
    await announcementModal.waitFor({ state: 'visible', timeout: 5_000 });
    const announcementText = (await announcementModal.innerText()).trim();
    assert(
      /系统公告/.test(announcementText) &&
        /灵感页全面焕新/.test(announcementText) &&
        /情绪板成为可复用的视觉资产/.test(announcementText) &&
        /图像创作升级为连续会话工作流/.test(announcementText),
      'System announcement modal should show timeline updates',
      { announcementText }
    );
    await page.screenshot({
      path: path.join(outputDir, 'system-announcements.png'),
      fullPage: false
    });
    await page
      .getByRole('button', { name: /关闭公告|Close/ })
      .last()
      .click();
    await announcementModal.waitFor({ state: 'hidden', timeout: 5_000 });

    const profileText = (await profileButton.innerText()).trim();
    assert(
      !/登录|注册|sign in|sign up|log in/i.test(profileText),
      'Profile trigger should show authenticated user copy',
      { profileText }
    );

    await profileButton.hover();
    const popover = page.locator('.create-side-nav-profile-popover').first();
    await popover.waitFor({ state: 'visible', timeout: 5_000 });

    const triggerBox = await profileButton.boundingBox();
    const popoverBox = await popover.boundingBox();
    assert(triggerBox && popoverBox, 'Profile trigger and popover should have boxes', {
      triggerBox,
      popoverBox
    });

    await page.mouse.move(
      triggerBox.x + triggerBox.width / 2,
      triggerBox.y + triggerBox.height / 2
    );
    await page.mouse.move(
      popoverBox.x + popoverBox.width / 2,
      triggerBox.y - 8
    );
    await page.mouse.move(
      popoverBox.x + popoverBox.width / 2,
      popoverBox.y + popoverBox.height / 2
    );
    await page.waitForTimeout(300);

    const popoverStillVisible = await isVisible(popover);
    assert(
      popoverStillVisible,
      'Profile popover should remain visible when moving pointer into it'
    );

    const popoverText = (await popover.innerText()).trim();
    assert(/语言|Language/.test(popoverText), 'Profile popover should include language control', {
      popoverText
    });
    assert(/主题|Theme/.test(popoverText), 'Profile popover should include theme control', {
      popoverText
    });
    const rechargeEntryVisible = await isVisible(
      popover.locator('a.create-side-nav-account-recharge').first()
    );
    assert(
      rechargeEntryVisible,
      'Profile popover should include the credit recharge entry'
    );

    await assertProfileSelectOpensAbovePopover(page, popover, /语言|Language/);
    await assertProfileSelectOpensAbovePopover(page, popover, /主题|Theme/);

    await page.screenshot({
      path: path.join(outputDir, 'profile-popover.png'),
      fullPage: false
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          baseUrl,
          checks: [
            'route loaded',
            'authenticated profile button visible',
            'logged-out profile hidden',
            'onboarding hidden',
            'retired standalone credits hidden',
            'retired top mini nav credits hidden',
            'old top language toggle hidden',
            'system announcement entry and timeline modal',
            'profile popover pointer path stable',
            'language and theme controls in popover',
            'profile language and theme selects open above popover'
          ],
          screenshot: path.join(outputDir, 'profile-popover.png')
        },
        null,
        2
      )
    );
  } catch (error) {
    await page
      .screenshot({
        path: path.join(outputDir, 'failure.png'),
        fullPage: true
      })
      .catch(() => {});
    console.error('[auth-preview-smoke] Failed:', error);
    process.exitCode = 1;
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error('[auth-preview-smoke] Unexpected failure:', error);
  process.exit(1);
});
