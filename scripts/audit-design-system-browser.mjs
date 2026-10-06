#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { installUiAuditMockRoutes } from './lib/ui-audit-fixtures.mjs';

const baseUrl = process.env.DESIGN_SYSTEM_BASE_URL || 'http://127.0.0.1:4196';
assert.ok(
  ['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseUrl).hostname),
  'This fixture audit only targets a local server'
);
const out = path.resolve(
  process.env.DESIGN_SYSTEM_OUTPUT || 'output/design-system-browser'
);
await mkdir(out, { recursive: true });
const browser = await chromium.launch(
  process.env.CI ? {} : { channel: 'chrome' }
);
const results = [];
try {
  for (const width of [1440, 430, 390, 360]) {
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        hasTouch: width < 500,
        isMobile: width < 500,
        reducedMotion: 'reduce'
      });
      // All account/model/history data is simulated; no provider or billing writes.
      await context.route('**/api/**', (route) =>
        route.fulfill({
          json: { items: [], sessions: [], models: [], tasks: [] }
        })
      );
      await installUiAuditMockRoutes(context, {
        baseUrl,
        seedAuthSession: false
      });
      await context.route('**/api/auth/me', (route) =>
        route.fulfill({ status: 401, json: { error: 'Unauthenticated' } })
      );
      // Vite dev serves web.html; built previews already serve these deep links.
      await context.route(`${baseUrl}/zh-CN/**`, async (route) => {
        if (!route.request().isNavigationRequest()) return route.continue();
        const response = await route.fetch();
        if (response.status() === 404) {
          return route.fulfill({
            response: await route.fetch({ url: `${baseUrl}/web.html` })
          });
        }
        return route.fulfill({ response });
      });
      await context.addInitScript((theme) => {
        localStorage.setItem('webtomind_theme', theme);
        localStorage.setItem('webtomind-language-prompt-dismissed', '1');
        sessionStorage.setItem(
          'webtomind:google-login-fallback-dismissed',
          '1'
        );
      }, theme);
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      try {
        await page.goto(`${baseUrl}/zh-CN/overview`, {
          waitUntil: 'domcontentloaded'
        });
        const labels = page.locator('.hero-actions .ui-button__label');
        await labels.first().waitFor();
        await page.evaluate(() => document.fonts.ready);
        await page.waitForFunction(() => {
          const element = document.querySelector('.hero-content');
          return element && Number(getComputedStyle(element).opacity) >= 0.99;
        });
        const labelSizes = await labels.evaluateAll((items) =>
          items.map((item) => ({
            text: item.textContent,
            available: item.clientWidth,
            required: item.scrollWidth
          }))
        );
        assert.equal(labelSizes.length, 2);
        assert.ok(
          labelSizes.every((item) => item.available + 1 >= item.required),
          JSON.stringify(labelSizes)
        );
        await page.screenshot({
          path: path.join(out, `home-${width}-${theme}.png`)
        });

        await context.unroute('**/api/auth/me');
        await installUiAuditMockRoutes(context, {
          baseUrl,
          seedAuthSession: true
        });
        await page.goto(`${baseUrl}/zh-CN/prompts`, {
          waitUntil: 'domcontentloaded'
        });
        const trigger = page.getByPlaceholder('搜索案例、模型、提示词');
        await trigger.waitFor();
        await trigger.focus();
        await page.keyboard.press('Control+k');
        const dialog = page.getByRole('dialog', { name: '命令面板' });
        const input = dialog.getByRole('combobox');
        await input.waitFor();
        await page.waitForFunction(
          () => document.activeElement?.getAttribute('role') === 'combobox'
        );
        await input.fill('图像');
        await page.keyboard.press('Tab');
        assert.ok(
          await input.evaluate((element) => element === document.activeElement)
        );
        await page.keyboard.press('Shift+Tab');
        assert.ok(
          await input.evaluate((element) => element === document.activeElement)
        );
        await page.screenshot({
          path: path.join(out, `commands-${width}-${theme}.png`)
        });
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        assert.ok(
          await trigger.evaluate(
            (element) => element === document.activeElement
          )
        );
        assert.notEqual(
          await page.evaluate(() => document.body.style.overflow),
          'hidden'
        );
        // Reopen with the lazy module cached: focus must still return correctly.
        await page.keyboard.press('Control+k');
        await input.waitFor();
        await page.waitForFunction(
          () => document.activeElement?.getAttribute('role') === 'combobox'
        );
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        assert.ok(
          await trigger.evaluate(
            (element) => element === document.activeElement
          )
        );

        const tokenContract = await page.evaluate(() => {
          const button = document.createElement('button');
          button.className = 'ui-button ui-button--primary ui-button--md';
          button.textContent = 'Control contract';
          const alias = document.createElement('span');
          alias.style.backgroundColor = 'hsl(var(--primary))';
          alias.style.color = 'hsl(var(--primary-foreground))';
          document.body.append(button, alias);
          const a = getComputedStyle(button),
            b = getComputedStyle(alias);
          const result = {
            color: a.color,
            aliasColor: b.color,
            background: a.backgroundColor,
            aliasBackground: b.backgroundColor,
            height: button.getBoundingClientRect().height
          };
          button.remove();
          alias.remove();
          return result;
        });
        assert.equal(tokenContract.color, tokenContract.aliasColor);
        assert.equal(tokenContract.background, tokenContract.aliasBackground);
        assert.ok(tokenContract.height >= 44);
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1
          )
        );
        await page.screenshot({
          path: path.join(out, `prompts-${width}-${theme}.png`)
        });
        if (width === 1440 || width === 390) {
          for (const route of [
            'create/image',
            'create/video',
            'create/apps',
            'create/characters',
            'use-cases',
            'pricing',
            'tools/image-editor'
          ]) {
            await page.goto(`${baseUrl}/zh-CN/${route}`, {
              waitUntil: 'domcontentloaded'
            });
            await page.waitForTimeout(1200);
            assert.ok(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth + 1
              ),
              `${route}: horizontal overflow`
            );
            if (route === 'create/characters') {
              await page
                .getByText('从文字设定创建角色。', { exact: true })
                .click();
              const name = page.getByPlaceholder('例如：Cyber Courier');
              await name.fill('Design audit character');
              assert.equal(await name.inputValue(), 'Design audit character');
              assert.ok(
                await name.evaluate(
                  (element) => element.getBoundingClientRect().height >= 44
                )
              );
              assert.ok(
                await name.evaluate(
                  (element) => element === document.activeElement
                )
              );
              await page.getByRole('button', { name: '关闭创建面板' }).click();
              await name.waitFor({ state: 'hidden' });
            }
            if (route === 'use-cases') {
              const group = page.getByRole('group', { name: '按分类筛选' });
              const filter = group.getByRole('button', {
                name: '教程',
                exact: true
              });
              await filter.click();
              assert.equal(await filter.getAttribute('aria-pressed'), 'true');
              await group
                .getByRole('button', { name: '全部', exact: true })
                .click();
            }
            if (route === 'tools/image-editor') {
              await page
                .getByRole('button', { name: '选择资产', exact: true })
                .click();
              const overlay = page.locator('.image-editor-asset-backdrop');
              await overlay.waitFor();
              assert.equal(
                await overlay.evaluate(
                  (element) => getComputedStyle(element).zIndex
                ),
                '200'
              );
            }
            await page.screenshot({
              path: path.join(
                out,
                `${route.replaceAll('/', '-')}-${width}-${theme}.png`
              )
            });
          }
        }
        assert.deepEqual(errors, []);
        results.push({
          width,
          theme,
          labelSizes,
          tokenContract,
          focus: 'passed',
          errors
        });
        console.log(
          `PASS ${width} ${theme}: labels, modal keyboard, theme, layout`
        );
      } catch (error) {
        await page.screenshot({
          path: path.join(out, `failure-${width}-${theme}.png`)
        });
        throw error;
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await writeFile(
    path.join(out, 'results.json'),
    JSON.stringify(results, null, 2)
  );
  await browser.close();
}
