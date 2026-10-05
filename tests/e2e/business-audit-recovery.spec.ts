import { test, expect } from '@playwright/test';
import { installUiAuditMockRoutes } from '../../scripts/lib/ui-audit-fixtures.mjs';
import { describeImagePolicyFailure } from '../../api/image/providers/policy-error';

const baseUrl = process.env.AUDIT_FIXES_BASE_URL || 'http://127.0.0.1:4187';
test.use({ channel: 'chrome' });
for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 }
]) {
  test(`owned queues and video session recovery at ${viewport.width}px`, async ({
    page,
    context
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const crashes: string[] = [];
    page.on('pageerror', (error) => crashes.push(error.message));
    await context.route('**/api/**', (route) =>
      route.fulfill({
        json: { items: [], tasks: [], sessions: [], turns: [], models: [] }
      })
    );
    await installUiAuditMockRoutes(context, { baseUrl, seedAuthSession: true });
    // Vite's entry is web.html; serve that transformed entry for SPA navigation.
    await context.route(`${baseUrl}/**`, async (route) => {
      if (route.request().isNavigationRequest())
        return route.fulfill({
          response: await context.request.get(`${baseUrl}/web.html`)
        });
      return route.fallback();
    });
    await context.addInitScript(() => {
      localStorage.setItem(
        'webtomind_image_generation_queue_v1',
        JSON.stringify([
          {
            id: 'old-private',
            status: 'queued',
            createdAt: Date.now(),
            request: { prompt: 'PRIVATE_OTHER_ACCOUNT' }
          }
        ])
      );
      localStorage.setItem(
        'webtomind_image_generation_queue_v2:other-account',
        JSON.stringify([
          {
            id: 'old-private',
            status: 'queued',
            createdAt: Date.now(),
            request: { prompt: 'PRIVATE_OTHER_ACCOUNT' }
          }
        ])
      );
    });
    let generationRequests = 0;
    await context.route('**/api/image/generate', (route) => {
      generationRequests++;
      return route.fulfill({
        json: { error: 'Unexpected generation' },
        status: 400
      });
    });
    const policyMessage = describeImagePolicyFailure('该提示可能违反了我们的内容政策');
    await context.route('**/api/image-sessions/image-session/turns', (route) => route.fulfill({
      json: { turns: [{
        id: 'fictional-policy-task', sessionId: 'image-session',
        prompt: 'A red cube on a table', status: 'failed',
        context: { sessionId: 'image-session', taskId: 'fictional-policy-task', referenceAssetIds: [] },
        generationIds: [], errorMessage: policyMessage,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      }] }
    }));
    await context.route('**/api/image/task?mode=active*', (route) => route.fulfill({
      json: {
        tasks: [{
          taskId: 'fictional-policy-task', status: 'failed',
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          request: { prompt: 'A red cube on a table', model: 'gpt-image-2.5', imageSize: '1024x1024', imageCount: 1, promptMode: 'custom' },
          error: policyMessage, errorCategory: 'provider_policy',
          errorCode: 'OPENAI_COMPAT_POLICY', retryable: false, refunded: 80, refundFailed: false
        }],
        activeCount: 0, failedCount: 1, runningCount: 0, queuedCount: 0
      }
    }));
    await page.goto(`${baseUrl}/zh-CN/image?sessionId=image-session`, {
      waitUntil: 'domcontentloaded'
    });
    await expect(page.locator('textarea:visible').first()).toBeVisible({
      timeout: 30000
    });
    await expect
      .poll(() =>
        page.evaluate(() =>
          localStorage.getItem('webtomind_image_generation_queue_v1')
        )
      )
      .toBeNull();
    await expect(
      page.getByText('PRIVATE_OTHER_ACCOUNT', { exact: false })
    ).toHaveCount(0);
    expect(generationRequests).toBe(0);
    await expect(page.getByText(policyMessage, { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: '重试失败任务', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '重试生成', exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('image-isolation.png') });
    await page.getByRole('button', { name: '编辑后重试', exact: true }).click();
    await expect(page.locator('textarea:visible').first()).toHaveValue('A red cube on a table');
    await page.locator('textarea:visible').first().fill('A blue cube on a table');
    expect(generationRequests).toBe(0);

    let completed = false;
    const timestamp = new Date().toISOString();
    await context.route('**/api/image-sessions/video-session/turns', (route) =>
      route.fulfill({
        json: {
          turns: [
            {
              id: 'video-task-1',
              sessionId: 'video-session',
              prompt: 'A quiet river at sunrise',
              status: completed ? 'failed' : 'running',
              context: {
                sessionId: 'video-session',
                taskId: 'video-task-1',
                referenceAssetIds: []
              },
              generationIds: [],
              ...(completed
                ? { errorMessage: '视频任务超过处理时限，已停止等待并退还积分' }
                : {}),
              createdAt: timestamp,
              updatedAt: timestamp
            }
          ]
        }
      })
    );
    await page.goto(`${baseUrl}/zh-CN/create/video?sessionId=video-session`, {
      waitUntil: 'domcontentloaded'
    });
    await expect(
      page.getByText('A quiet river at sunrise', { exact: true }).first()
    ).toBeVisible({ timeout: 30000 });
    await expect(
      page.getByText('生成中', { exact: true }).first()
    ).toBeVisible();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText('A quiet river at sunrise', { exact: true }).first()
    ).toBeVisible();
    completed = true;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(
      page
        .getByText('视频任务超过处理时限，已停止等待并退还积分', {
          exact: true
        })
        .first()
    ).toBeVisible({ timeout: 15000 });
    await expect(page.locator('textarea:visible').first()).toBeVisible();
    await page.locator('textarea:visible').first().fill('Next shot draft');
    await expect(page.locator('textarea:visible').first()).toHaveValue(
      'Next shot draft'
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('video-session-recovered.png')
    });
    expect(crashes).toEqual([]);
  });
}
