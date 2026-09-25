import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const baseUrl = process.env.UPSCALER_SMOKE_BASE_URL || 'http://127.0.0.1:4173';
const outputDir = resolve(
  process.env.UPSCALER_SMOKE_OUTPUT_DIR || '.artifacts/image-upscaler-smoke'
);
const imagePaths = [
  'server/public/create-apps/image-upscaler.webp',
  'server/public/create-apps/object-remover.webp',
  'server/public/create-apps/background-cleanup.webp'
].map((path) => resolve(path));

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || undefined
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

// Keep this smoke deterministic and fast. AI model delivery is verified
// separately; this flow exercises standard enlargement without AI.
await page.addInitScript(() => {
  try {
    delete Navigator.prototype.gpu;
  } catch {
    // A browser without configurable WebGPU already follows the same fallback.
  }
});

const failures = [];
page.on('pageerror', (error) =>
  failures.push(`页面运行错误: ${error.stack || error.message}`)
);
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

const panChecks = [];
async function previewState(frame) {
  return frame.evaluate((element) => {
    const images = [...element.querySelectorAll('img')];
    const rect = element.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      transforms: images.map((image) => {
        const matrix = new DOMMatrix(getComputedStyle(image).transform);
        return { x: matrix.e, y: matrix.f, scale: matrix.a };
      }),
      divider: element
        .querySelector('[role="slider"]')
        ?.getAttribute('aria-valuenow'),
      panning: element.dataset.panning,
      cursor: getComputedStyle(element).cursor
    };
  });
}
async function pan(frame, dx, dy, touch = false, cancel = false) {
  await frame.scrollIntoViewIfNeeded();
  const box = await frame.boundingBox();
  const x = box.x + box.width * 0.2;
  const y = box.y + box.height * 0.35;
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y }]
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + dx, y: y + dy }]
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: cancel ? 'touchCancel' : 'touchEnd',
      touchPoints: []
    });
    await cdp.detach();
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 8 });
    check(
      (await previewState(frame)).cursor === 'grabbing',
      '按住图像时未显示抓手状态'
    );
    await page.mouse.up();
  }
  await page.waitForTimeout(150);
}
async function checkPan(frame, label, touch = false) {
  await page.getByRole('button', { name: '适合窗口' }).click();
  for (let i = 0; i < 4; i++)
    await page.getByRole('button', { name: '放大预览' }).click();
  await page.waitForTimeout(150);
  const before = await previewState(frame);
  await pan(frame, 38, 24, touch);
  const moved = await previewState(frame);
  check(
    moved.transforms.every(
      (t) => Math.abs(t.x - 38) < 2 && Math.abs(t.y - 24) < 2
    ),
    `${label}: 图像未同步跟随横向和纵向拖动`
  );
  check(
    moved.divider === before.divider,
    `${label}: 平移错误地移动了对比分隔线`
  );
  check(moved.panning === 'false', `${label}: 松手后仍处于拖动状态`);
  await pan(frame, 4000, 4000);
  const edge = await previewState(frame);
  check(
    edge.transforms.every(
      (t) =>
        Math.abs(t.x - edge.width / 2) < 1 &&
        Math.abs(t.y - edge.height / 2) < 1
    ),
    `${label}: 拖出预览后没有限制到图像边界`
  );
  await pan(frame, -4000, -4000);
  const opposite = await previewState(frame);
  check(
    opposite.transforms.every(
      (t) =>
        Math.abs(t.x + opposite.width / 2) < 1 &&
        Math.abs(t.y + opposite.height / 2) < 1
    ),
    `${label}: 无法查看另一侧图像边缘`
  );
  await page.getByRole('button', { name: '缩小预览' }).click();
  await page.waitForTimeout(150);
  const smaller = await previewState(frame);
  check(
    smaller.transforms.every(
      (t) =>
        Math.abs(t.x) <= smaller.width * 0.375 + 1 &&
        Math.abs(t.y) <= smaller.height * 0.375 + 1
    ),
    `${label}: 缩小时没有收回越界偏移`
  );
  await page.getByRole('button', { name: '适合窗口' }).click();
  await page.waitForTimeout(150);
  const reset = await previewState(frame);
  check(
    reset.transforms.every((t) => t.x === 0 && t.y === 0 && t.scale === 1),
    `${label}: 适合窗口没有复位`
  );
  panChecks.push({ label, touch, moved, edge, opposite, reset });
}

try {
  const url = `${baseUrl.replace(/\/$/, '')}/zh-CN/tools/image-upscaler?smoke=${Date.now()}`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
  check((await page.title()).length > 0, '页面标题为空');
  check(await page.locator('h1').isVisible(), '页面没有显示主标题');
  check(
    (await page.locator('vite-error-overlay').count()) === 0,
    '页面出现开发错误覆盖层'
  );
  await page.locator('input[type="file"]').setInputFiles(imagePaths);
  await page
    .locator('.image-upscale-queue-item')
    .first()
    .waitFor({ timeout: 20_000 });
  check(
    (await page.locator('.image-upscale-queue-item').count()) === 3,
    '批量上传后队列不是 3 张'
  );

  await page.getByRole('button', { name: '放大预览' }).click();
  await checkPan(page.locator('.image-tool-zoom-preview'), 'original-preview');

  await page.locator('.image-upscale-advanced summary').click();
  await page.getByRole('button', { name: '同时处理 2 张图片' }).click();
  await page.locator('.image-upscale-advanced summary').click();
  await page.getByRole('button', { name: /普通放大 3 张/ }).click();
  await page
    .getByRole('button', { name: '下载全部 ZIP' })
    .waitFor({ timeout: 120_000 });

  await page
    .locator('.image-upscale-queue-copy .status.success')
    .nth(2)
    .waitFor({ timeout: 120_000 });

  check(
    (await page
      .locator('.image-upscale-queue-copy .status.success')
      .count()) === 3,
    '批量队列没有全部完成'
  );
  check(
    await page.getByRole('button', { name: '下载全部 ZIP' }).isVisible(),
    '批量 ZIP 下载入口不可见'
  );

  const zoomOutput = page.locator('.image-tool-zoom-controls output');
  check((await zoomOutput.textContent()) === '100%', '初始缩放不是 100%');
  await page.getByRole('button', { name: '放大预览' }).click();
  check((await zoomOutput.textContent()) === '125%', '手动放大没有生效');
  await page.locator('.image-tool-comparison').hover();
  const scrollBeforeWheel = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(100);
  check((await zoomOutput.textContent()) === '150%', '滚轮放大没有生效');
  const scrollAfterWheel = await page.evaluate(() => window.scrollY);
  check(scrollAfterWheel === scrollBeforeWheel, '预览滚轮缩放同时滚动了页面');

  const comparisonFrame = page.locator('.image-tool-comparison');
  const comparison = comparisonFrame.getByRole('slider');
  const comparisonBox = await comparisonFrame.boundingBox();
  if (comparisonBox) {
    await page.mouse.move(
      comparisonBox.x + comparisonBox.width * 0.5,
      comparisonBox.y + comparisonBox.height * 0.5
    );
    await page.mouse.down();
    await page.mouse.move(
      comparisonBox.x + comparisonBox.width * 0.7,
      comparisonBox.y + comparisonBox.height * 0.5
    );
    await page.mouse.up();
  }
  const comparisonPosition = Number(
    await comparison.getAttribute('aria-valuenow')
  );
  check(comparisonPosition >= 65, '前后对比分隔线拖动没有生效');

  await comparison.focus();
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(
    (previous) =>
      Number(
        document
          .querySelector('.image-tool-comparison [role="slider"]')
          ?.getAttribute('aria-valuenow')
      ) < previous,
    comparisonPosition
  );
  const keyboardPosition = Number(
    await comparison.getAttribute('aria-valuenow')
  );
  check(
    Math.abs(keyboardPosition - (comparisonPosition - 5)) < 0.1,
    '键盘左移没有按 5% 调整对比位置'
  );

  const afterDividerDrag = await previewState(comparisonFrame);
  check(
    afterDividerDrag.transforms.every((t) => t.x === 0 && t.y === 0),
    '拖动分隔线错误地平移了图像'
  );
  await checkPan(comparisonFrame, 'desktop-1440');
  await page.getByRole('button', { name: '放大预览' }).click();
  await page.getByRole('button', { name: '放大预览' }).click();
  await pan(comparisonFrame, 35, 25);

  const desktopOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  check(!desktopOverflow, '桌面视口存在横向滚动');
  await page.screenshot({
    path: resolve(outputDir, 'desktop-batch-comparison.png'),
    fullPage: true
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await checkPan(comparisonFrame, 'desktop-1280');
  await page.screenshot({
    path: resolve(outputDir, 'medium-batch-comparison.png'),
    fullPage: true
  });
  const mediumOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  check(!mediumOverflow, '1280px 中等桌面视口存在横向滚动');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '放大预览' }).click();
  await checkPan(comparisonFrame, 'mobile-390', true);
  await page.getByRole('button', { name: '放大预览' }).click();
  await page.getByRole('button', { name: '放大预览' }).click();
  await pan(comparisonFrame, 20, 15, true, true);
  check(
    (await previewState(comparisonFrame)).panning === 'false',
    '触摸取消后抓手状态未释放'
  );
  await pan(comparisonFrame, 10, 8, true);
  check(
    (await previewState(comparisonFrame)).transforms[0].x > 20,
    '触摸取消后无法重新拖动'
  );
  const mobileOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  check(!mobileOverflow, '390px 移动视口存在横向滚动');
  const mobileZoomButtons = await page
    .locator('.image-tool-zoom-controls button')
    .evaluateAll((buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      })
    );
  check(
    mobileZoomButtons.every(({ width, height }) => width >= 44 && height >= 44),
    '移动端缩放按钮小于 44px'
  );
  await page.screenshot({
    path: resolve(outputDir, 'mobile-batch-comparison.png'),
    fullPage: true
  });

  await page
    .locator('.image-upscale-queue-item')
    .nth(1)
    .locator('.image-upscale-queue-select')
    .click();
  await page.waitForTimeout(200);
  check(
    (await previewState(comparisonFrame)).transforms.every(
      (t) => t.x === 0 && t.y === 0 && t.scale === 1
    ),
    '切换队列图片没有重置平移和缩放'
  );

  const result = {
    ok: failures.length === 0,
    url,
    queueItems: await page.locator('.image-upscale-queue-item').count(),
    completed: await page
      .locator('.image-upscale-queue-copy .status.success')
      .count(),
    zoom: await zoomOutput.textContent(),
    comparisonPosition,
    keyboardPosition,
    panChecks,
    desktopOverflow,
    mediumOverflow,
    mobileOverflow,
    scrollBeforeWheel,
    scrollAfterWheel,
    mobileZoomButtons,
    screenshots: [
      resolve(outputDir, 'desktop-batch-comparison.png'),
      resolve(outputDir, 'mobile-batch-comparison.png')
    ],
    failures
  };
  await writeFile(
    resolve(outputDir, 'results.json'),
    JSON.stringify(result, null, 2)
  );
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
} finally {
  await browser.close();
}
