import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.SKILL_STOREFRONT_URL || 'http://127.0.0.1:4202';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const out =
  process.env.SKILL_BROWSER_OUTPUT || 'output/skill-video-cards/browser';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const results = [];
try {
  for (const width of [1440, 390])
    for (const locale of ['en-US', 'zh-CN']) {
      const touch = width === 390,
        zh = locale === 'zh-CN';
      console.log('CHECK', width, locale);
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        isMobile: touch,
        hasTouch: touch,
        permissions: ['clipboard-read', 'clipboard-write']
      });
      await context.route('**/*', (r) =>
        new URL(r.request().url()).origin === base ? r.continue() : r.abort()
      );
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const mediaRequests = [];
      page.on('request', (r) => {
        if (r.url().includes('.mp4')) mediaRequests.push(r.url());
      });
      await page.goto(`${base}/${locale}/skills`);
      await page.locator('.skill-card video').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator('.skill-video-preview').count(), 10);
      assert.equal(mediaRequests.length, 0);
      const card = page.locator('.skill-card').first(),
        video = card.locator('video');
      if (touch) await card.getByRole('button').tap();
      else await card.locator('h3').hover();
      await page.waitForFunction(() => {
        const v = document.querySelector('.skill-card video');
        return !v.paused && v.currentTime > 0;
      });
      assert.equal(await video.evaluate((v) => v.muted && v.playsInline), true);
      if (!touch) await card.getByRole('button').hover();
      await page.waitForFunction(
        () =>
          document
            .querySelector('.skill-card button')
            .getAttribute('aria-pressed') === 'true'
      );
      if (touch) await card.getByRole('button').tap();
      else {
        // Keep the pointer where hover placed it: locator.click may scroll again,
        // leaving the card and changing Pause back to Play before the click.
        assert.equal(
          await card.getByRole('button').evaluate((el) => el.matches(':hover')),
          true
        );
        await page.mouse.down();
        await page.mouse.up();
      }
      await page.waitForFunction(
        () => document.querySelector('.skill-card video').paused
      );
      await page.waitForFunction(
        () =>
          document
            .querySelector('.skill-card button')
            .getAttribute('aria-pressed') === 'false'
      );
      if (touch) await card.getByRole('button').tap();
      else {
        // Keep the pointer where hover placed it: locator.click may scroll again,
        // leaving the card and changing Pause back to Play before the click.
        assert.equal(
          await card.getByRole('button').evaluate((el) => el.matches(':hover')),
          true
        );
        await page.mouse.down();
        await page.mouse.up();
      }
      await page.waitForFunction(
        () => !document.querySelector('.skill-card video').paused
      );
      if (touch)
        await page.locator('.marketing-footer').scrollIntoViewIfNeeded();
      else await page.mouse.move(1, 1);
      await page.waitForFunction(
        () => document.querySelector('.skill-card video').paused
      );
      await page.screenshot({
        path: `${out}/${locale}-${width}-catalog.png`,
        fullPage: true
      });
      if (!touch && !zh) {
        for (const item of await page.locator('.skill-card').all()) {
          await item.locator('h3').hover();
          await page.waitForFunction(
            (v) => !v.paused && v.currentTime > 0,
            await item.locator('video').elementHandle()
          );
          assert.equal(
            await item
              .locator('video')
              .evaluate((v) => !v.paused && v.readyState >= 2),
            true
          );
          await page.mouse.move(1, 1);
          await page.waitForFunction(() =>
            [...document.querySelectorAll('.skill-card video')].every(
              (v) => v.paused
            )
          );
        }
      }
      for (const slug of [
        'case-study-deck',
        'saas-landing-page',
        'app-feature-demo-video',
        'og-image'
      ]) {
        await page.goto(`${base}/${locale}/skills/${slug}`);
        await page.locator('.skill-gallery-stage video').waitFor();
        await page.waitForFunction(
          () =>
            document.querySelector('.skill-gallery-stage video').readyState >= 1
        );
        assert.equal(
          await page
            .locator('.skill-gallery-stage video')
            .evaluate((v) => v.paused),
          true
        );
        await page
          .locator('.skill-gallery-stage video')
          .evaluate((v) => v.play());
        await page.waitForFunction(
          () =>
            document.querySelector('.skill-gallery-stage video').currentTime > 0
        );
        await page.locator('.skill-gallery-thumbnails button').nth(1).click();
        await page.locator('.skill-gallery-stage img').waitFor();
        assert.equal(
          await page.locator('.skill-gallery-stage video').count(),
          0
        );
        await page.locator('.skill-gallery-thumbnails button').first().click();
        await page.locator('.skill-gallery-stage video').waitFor();
        await page.waitForFunction(
          () =>
            document.querySelector('.skill-gallery-stage video').readyState >= 1
        );
        if (slug === 'og-image') {
          await page.locator('.skill-free-offer a').click();
          assert.equal(
            await page
              .locator('.skill-install-details')
              .evaluate((el) => el.open),
            true
          );
        } else {
          await page.locator('.skill-install-details summary').click();
        }
        await page
          .locator('.skill-agent-tabs button')
          .filter({ hasText: 'Codex' })
          .click();
        assert.ok(
          (await page.locator('.skill-command code').innerText()).includes(
            '--agent codex'
          )
        );
        await page.locator('.skill-command button').click();
        assert.ok(
          (await page.evaluate(() => navigator.clipboard.readText())).includes(
            slug
          )
        );
        await page
          .locator('.skill-agent-tabs button')
          .filter({ hasText: 'Gemini CLI' })
          .click();
        assert.ok(
          (await page.locator('.skill-command code').innerText()).endsWith(
            '--agent gemini'
          )
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth
          ),
          false
        );
        await page.locator('.skill-install-details summary').click();
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({
          path: `${out}/${locale}-${width}-${slug}.png`,
          fullPage: true
        });
        if (slug === 'case-study-deck')
          await page.screenshot({
            path: `${out}/${locale}-${width}-detail-hero.png`
          });
      }
      await page.goto(`${base}/${locale}/skills/not-a-skill`);
      await page
        .getByRole('heading', {
          name: zh
            ? '这个 Skill 不存在或已下架'
            : 'This Skill does not exist or was removed'
        })
        .waitFor();
      assert.deepEqual(errors, []);
      results.push({
        width,
        locale,
        checks: [
          '10-specific-videos',
          'no-video-download-before-intent',
          'hover-or-touch-play',
          'muted-inline',
          'pause-resume',
          'leave-or-offscreen-pause',
          'detail-video',
          'gallery-switch-stops-video',
          'agent-selection',
          'copy-command',
          '404',
          'no-overflow'
        ],
        scope:
          'Real media and local app UI; read-only candidate API, no production payment.'
      });
      await context.close();
    }
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce'
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(`${base}/en-US/skills`);
  await page.locator('.skill-card video').first().waitFor();
  const first = page.locator('.skill-card').first();
  await first.hover();
  assert.equal(await first.locator('video').getAttribute('src'), null);
  await first.getByRole('button').click();
  await page.waitForFunction(
    () => !document.querySelector('.skill-card video').paused
  );
  results.push({
    checks: ['reduced-motion-no-hover-autoplay', 'explicit-play-still-works']
  });
  await context.close();
  const failure = await browser.newContext({
    viewport: { width: 1440, height: 1000 }
  });
  let block = true;
  await failure.route('**/videos/xhs-cover-note.mp4', (r) =>
    block ? r.abort() : r.continue()
  );
  const broken = await failure.newPage();
  broken.setDefaultTimeout(15000);
  await broken.goto(`${base}/en-US/skills`);
  await broken.locator('.skill-card video').first().waitFor();
  await broken.locator('.skill-card').first().hover();
  await broken.locator('.skill-preview-error').waitFor();
  block = false;
  await broken.locator('.skill-card').first().getByRole('button').click();
  await broken.waitForFunction(
    () => !document.querySelector('.skill-card video').paused
  );
  results.push({ checks: ['video-failure-message', 'retry-after-failure'] });
  block = true;
  await broken.goto(`${base}/en-US/skills/xhs-cover-note`);
  await broken.locator('.skill-gallery-error').waitFor();
  block = false;
  await broken.getByRole('button', { name: 'Reload preview' }).click();
  await broken.locator('.skill-gallery-stage video').evaluate((v) => v.play());
  assert.equal(
    await broken
      .locator('.skill-gallery-stage video')
      .evaluate((v) => v.paused),
    false
  );
  results.push({ checks: ['detail-video-failure', 'detail-video-retry'] });
  await failure.close();
} finally {
  await browser.close();
  await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
}
console.log(`PASS ${results.length} video/detail browser scenarios`);
