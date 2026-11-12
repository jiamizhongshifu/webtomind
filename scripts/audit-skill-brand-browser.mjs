import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const base = 'http://127.0.0.1:4203';
const out = 'output/oil-ui-brand/brand-checks';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const results = [];
try {
  for (const width of [1440, 768, 390, 360])
    for (const locale of ['en-US', 'zh-CN']) {
      console.log('BRAND', width, locale);
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        isMobile: width < 500,
        hasTouch: width < 500
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const media = [];
      page.on('request', (r) => {
        if (r.url().endsWith('.mp4')) media.push(r.url());
      });
      await page.goto(`${base}/${locale}/overview`);
      await page.locator('.skill-card video').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      assert.equal(
        media.length,
        0,
        'Hero and cards load no video before intent'
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth
        ),
        false
      );
      const tabs = page.locator('.skill-proof-tabs button');
      for (let i = 0; i < 4; i++) {
        await tabs.nth(i).click();
        assert.equal(await tabs.nth(i).getAttribute('aria-pressed'), 'true');
        assert.equal(
          await page
            .locator('.skill-proof-tabs button[aria-pressed="true"]')
            .count(),
          1
        );
        await page.waitForFunction(() => {
          const img = document.querySelector('.skill-proof-output img');
          return img?.complete && img.naturalWidth > 0;
        });
        const slug = [
          'case-study-deck',
          'og-image',
          'saas-landing-page',
          'app-feature-demo-video'
        ][i];
        assert.ok(
          (
            await page.locator('.skill-proof-caption a').getAttribute('href')
          ).endsWith(slug)
        );
        await page.locator('.skill-proof-caption button').click();
        await page.waitForFunction(() => {
          const v = document.querySelector('.skill-proof-output video');
          return v && !v.paused && v.currentTime > 0;
        });
        assert.equal(
          await page
            .locator('.skill-proof-output video')
            .evaluate((v) => v.muted && v.playsInline),
          true
        );
        await tabs.nth((i + 1) % 4).click();
        assert.equal(
          await page.locator('.skill-proof-output video').count(),
          0
        );
      }
      await tabs.first().click();
      await page.mouse.move(0, 0);
      await page.evaluate(() => scrollTo(0, 0));
      await page.evaluate(() =>
        Promise.all(
          document.getAnimations().map((a) => a.finished.catch(() => {}))
        )
      );
      await page.screenshot({ path: `${out}/${locale}-${width}-hero.png` });
      // A full read down the page and back checks the scroll-linked composition.
      await page.locator('.marketing-footer').scrollIntoViewIfNeeded();
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({
        path: `${out}/${locale}-${width}-full.png`,
        fullPage: true
      });
      await page.locator('.skill-proof-caption a').click();
      await page.waitForURL(/skills\/case-study-deck/);
      await page.locator('.skill-product-layout').waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth
        ),
        false
      );
      await page.screenshot({ path: `${out}/${locale}-${width}-detail.png` });
      await page.goto(`${base}/${locale}/skills/pricing`);
      await page.locator('.skill-pricing-grid').waitFor();
      await page
        .getByRole('button', {
          name: locale === 'zh-CN' ? '月付' : 'Monthly',
          exact: true
        })
        .click();
      assert.equal(
        await page
          .getByRole('button', {
            name: locale === 'zh-CN' ? '月付' : 'Monthly',
            exact: true
          })
          .getAttribute('aria-pressed'),
        'true'
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth
        ),
        false
      );
      await page.evaluate(() =>
        Promise.all(
          document.getAnimations().map((a) => a.finished.catch(() => {}))
        )
      );
      const selectedColor = await page
        .locator('.skill-pricing .skill-pill[aria-pressed="true"]')
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      assert.equal(selectedColor, 'rgb(148, 60, 39)');
      await page.screenshot({
        path: `${out}/${locale}-${width}-pricing.png`,
        fullPage: true
      });
      assert.deepEqual(errors, []);
      results.push({
        width,
        locale,
        checks: [
          'four-real-outputs',
          'four-user-triggered-silent-videos',
          'switch-unloads-video',
          'detail-navigation',
          'pricing-toggle',
          'no-overflow',
          'no-page-errors',
          'no-video-prefetch'
        ]
      });
      await context.close();
    }
  const reduced = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce'
  });
  const page = await reduced.newPage();
  await page.goto(`${base}/en-US/overview`);
  await page.locator('.skill-proof-output img').waitFor();
  await page.locator('.skill-proof-tabs button').nth(2).focus();
  await page.keyboard.press('Enter');
  assert.equal(
    await page
      .locator('.skill-proof-tabs button')
      .nth(2)
      .getAttribute('aria-pressed'),
    'true'
  );
  assert.equal(
    await page
      .locator('.skill-proof-output')
      .evaluate((el) => getComputedStyle(el).transform),
    'none'
  );
  // Browser zoom reduces the CSS viewport; CSS zoom alone misses media queries.
  await page.setViewportSize({ width: 720, height: 500 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth
    ),
    false
  );
  await page.screenshot({ path: `${out}/zoom-200.png` });
  results.push({
    checks: [
      'reduced-motion-static',
      'keyboard-output-selection',
      '200-percent-equivalent-css-viewport'
    ],
    passed: true
  });
  await reduced.close();
} finally {
  await browser.close();
  await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
}
console.log(`PASS ${results.length} brand scenarios`);
