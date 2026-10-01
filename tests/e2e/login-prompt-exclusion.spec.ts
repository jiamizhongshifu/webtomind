import { test, expect } from '@playwright/test';

const baseURL = process.env.LOGIN_TEST_BASE_URL || 'http://127.0.0.1:4175';
const baseline = process.env.LOGIN_TEST_BASELINE === '1';
test.use({ channel: 'chrome' });

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 }
]) {
  test(`login prompts stay exclusive at ${viewport.width}px`, async ({
    page
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto(`${baseURL}/zh-CN/prompts`);
    const suggestion = page.locator('.global-google-login-fallback');
    const modal = page.locator('.auth-modal-backdrop');
    await expect(suggestion).toBeVisible({ timeout: 20_000 });
    const login = page.locator('a[href*="login"]:visible').first();
    await expect(login).toBeVisible();
    if (!baseline) {
      expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
        'hidden'
      );
      expect(
        await suggestion.evaluate((el) => el.contains(document.activeElement))
      ).toBe(false);
    }
    await page.screenshot({ path: testInfo.outputPath('first-visit.png') });
    await login.click();
    await expect(modal).toBeVisible();
    if (baseline && viewport.width > 640) {
      await expect(suggestion).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath('before-overlap.png')
      });
      return;
    }
    await expect(suggestion).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(modal.getByRole('button', { name: /Google/ })).toBeVisible();
    await expect(
      modal.getByRole('button', { name: /Microsoft/ })
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('main-login-only.png') });
    for (let i = 0; i < 3; i++) {
      await modal.locator('button.auth-modal-close').click();
      await expect(modal).toHaveCount(0);
      await expect(suggestion).toHaveCount(0);
      expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
        'hidden'
      );
      await login.click();
      await expect(modal).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(1);
    }
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
    await page.goto(`${baseURL}/en-US/prompts`);
    await expect(
      page.locator('a[href*="login"]:visible').first()
    ).toBeVisible();
    await expect(suggestion).toHaveCount(0);
    await page.goBack();
    await expect(login).toBeVisible();
    await expect(suggestion).toHaveCount(0);
    await page.reload();
    await expect(login).toBeVisible();
    await expect(suggestion).toHaveCount(0);
    await page.goto(`${baseURL}/zh-CN/login?redirect=/account`);
    await expect(modal).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(suggestion).toHaveCount(0);
    const emailButton = modal.locator('.auth-modal-email-toggle');
    await emailButton.click();
    await expect(modal.locator('input[type="email"]')).toBeVisible();
    await modal.locator('button.auth-modal-close').click();
    await expect(modal).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
      'hidden'
    );
    await page.screenshot({ path: testInfo.outputPath('closed-clean.png') });
  });
}
