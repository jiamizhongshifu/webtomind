import { expect, test, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const shouldRunVisualBaseline = process.env.E2E_VISUAL_BASELINE === 'true';

interface RunningServer {
  baseUrl: string;
  stop: () => Promise<void>;
}

function getPnpmCommand(): string {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to allocate an ephemeral port'));
        return;
      }

      const port = address.port;
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(port);
      });
    });
    server.on('error', reject);
  });
}

async function runCommand(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; timeoutMs?: number }
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 180_000;

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let logs = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Command timed out: ${command} ${args.join(' ')}\n${logs}`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      logs += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      logs += chunk.toString();
    });

    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed: ${command} ${args.join(' ')}\n${logs}`));
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function waitForHealth(url: string, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  let lastError = '';

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) return;
      lastError = `Unexpected status: ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    `Server did not become healthy in ${timeoutMs}ms. Last error: ${lastError}`
  );
}

async function startServer(port: number): Promise<RunningServer> {
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(
    'node',
    ['server/node_modules/tsx/dist/cli.mjs', 'server/src/index.ts'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: 'development',
        SUPABASE_URL:
          process.env.SUPABASE_URL || 'https://example.supabase.co',
        SUPABASE_ANON_KEY:
          process.env.SUPABASE_ANON_KEY || 'anon-key-for-e2e',
        ALLOWED_ORIGINS: `${baseUrl},http://localhost:5173`
      },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  let logs = '';
  child.stdout.on('data', (chunk) => {
    logs += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    logs += chunk.toString();
  });

  try {
    await waitForHealth(baseUrl);
  } catch (error) {
    child.kill();
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${reason}\nStartup logs:\n${logs}`);
  }

  return {
    baseUrl,
    stop: async () => {
      child.kill();
      await new Promise((resolve) => child.once('exit', resolve));
    }
  };
}

function svgDataUri(label: string, start: string, end: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${start}"/><stop offset="1" stop-color="${end}"/></linearGradient><radialGradient id="r" cx=".52" cy=".32" r=".55"><stop offset="0" stop-color="rgba(255,255,255,.88)"/><stop offset=".55" stop-color="rgba(255,255,255,.18)"/><stop offset="1" stop-color="rgba(255,255,255,0)"/></radialGradient></defs><rect width="900" height="1200" fill="url(#g)"/><circle cx="450" cy="390" r="245" fill="url(#r)"/><path d="M174 888c126-198 272-286 438-264 81 11 148 45 201 102v242H174Z" fill="rgba(20,20,20,.28)"/><path d="M164 220c66-38 128-58 187-60 125-5 222 65 290 210 36 77 80 124 132 141" fill="none" stroke="rgba(255,255,255,.64)" stroke-width="28" stroke-linecap="round"/><text x="70" y="1080" font-family="Arial, sans-serif" font-size="58" font-weight="700" fill="rgba(255,255,255,.92)">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const generatedImages = [
  svgDataUri('Visual 01', '#7c6cff', '#f0c879'),
  svgDataUri('Visual 02', '#1d2735', '#e7b978'),
  svgDataUri('Visual 03', '#684f36', '#f4d3a0'),
  svgDataUri('Visual 04', '#356471', '#f7d6b8'),
  svgDataUri('Visual 05', '#413056', '#debbb0'),
  svgDataUri('Visual 06', '#293946', '#eed9aa'),
  svgDataUri('Visual 07', '#5a4337', '#e9b46b'),
  svgDataUri('Visual 08', '#263a4a', '#c5d8de'),
  svgDataUri('Visual 09', '#6b3f53', '#f0b484'),
  svgDataUri('Visual 10', '#1f2a34', '#d0a05b'),
  svgDataUri('Visual 11', '#5c5f7a', '#f4cfb4'),
  svgDataUri('Visual 12', '#334744', '#ddbf77')
];

const prompt =
  '9:16 cinematic creator workflow portrait, transparent PVC prop, golden edge light, controlled composition, stable visual system.';
const negativePrompt =
  'low quality, blurry, malformed hands, watermark, extra fingers, cluttered background';
const visualSummaryAssetPath = '/e2e-assets/visual-summary.svg';

const historyItems = generatedImages.map((imageUrl, index) => ({
  id: `history-${index + 1}`,
  imageUrl,
  previewUrl: imageUrl,
  thumbnailUrl: imageUrl,
  width: 900,
  height: 1200,
  prompt: `${prompt} Variant ${index + 1}.`,
  negativePrompt,
  provider: 'e2e',
  model: 'gpt-image-2',
  modelLabel: 'GPT Image 2',
  aspectRatio: '9:16',
  imageSize: '2160x3840',
  quality: 'medium',
  outputFormat: 'png',
  assetIds: [],
  referenceImageIds: [],
  createdAt: '2026-06-07T09:00:00.000Z'
}));

const visualSummary = {
  id: 'summary-visual',
  projectId: 'proj-visual',
  project_id: 'proj-visual',
  title: 'Visual workflow sample',
  url: visualSummaryAssetPath,
  markdown: [
    `![Visual workflow sample](${visualSummaryAssetPath})`,
    '',
    'Model: GPT Image 2',
    'Ratio: 9:16',
    '',
    prompt
  ].join('\n'),
  summary: 'Stable visual summary card for regression coverage.',
  tags: ['ai-image', 'prompt'],
  contentType: 'image',
  content_type: 'image',
  createdAt: Date.parse('2026-06-07T09:00:00.000Z'),
  updatedAt: Date.parse('2026-06-07T09:00:00.000Z'),
  metadata: {
    generationId: 'history-1',
    thumbnailUrl: generatedImages[0],
    previewUrl: generatedImages[0],
    imageUrl: generatedImages[0],
    model: 'GPT Image 2',
    imageSize: '9:16',
    quality: 'medium',
    prompt,
    negativePrompt
  }
};

const visualProject = {
  id: 'proj-visual',
  name: 'Mind',
  description: 'Visual generation workspace',
  icon: 'sparkles',
  color: '#f3c757',
  isDefault: false,
  sortOrder: 0,
  summaryCount: 1,
  conversationCount: 0,
  createdAt: Date.parse('2026-06-07T09:00:00.000Z'),
  updatedAt: Date.parse('2026-06-07T09:00:00.000Z'),
  archivedAt: null,
  favoritedAt: null
};

function taskSnapshot() {
  return {
    success: true,
    activeCount: 3,
    runningCount: 1,
    queuedCount: 1,
    failedCount: 1,
    maxConcurrency: 1,
    pollAfterMs: 5000,
    tasks: [
      {
        taskId: 'task-running',
        status: 'running',
        queuePosition: 0,
        createdAt: '2026-06-07T09:01:00.000Z',
        startedAt: '2026-06-07T09:01:20.000Z',
        updatedAt: '2026-06-07T09:01:20.000Z',
        request: {
          prompt,
          negativePrompt,
          model: 'gpt-image-2',
          modelLabel: 'GPT Image 2',
          aspectRatio: '9:16',
          imageSize: '2160x3840',
          quality: 'medium',
          outputFormat: 'png',
          imageCount: 1
        }
      },
      {
        taskId: 'task-queued',
        status: 'queued',
        queuePosition: 1,
        createdAt: '2026-06-07T09:02:00.000Z',
        updatedAt: '2026-06-07T09:02:00.000Z',
        request: {
          prompt: `${prompt} queued.`,
          negativePrompt,
          model: 'gpt-image-2',
          modelLabel: 'GPT Image 2',
          aspectRatio: '9:16',
          imageSize: '2160x3840',
          quality: 'medium',
          outputFormat: 'png',
          imageCount: 1
        }
      },
      {
        taskId: 'task-failed',
        status: 'failed',
        queuePosition: null,
        createdAt: '2026-06-07T08:58:00.000Z',
        updatedAt: '2026-06-07T08:59:00.000Z',
        completedAt: '2026-06-07T08:59:00.000Z',
        error: 'E2E failed task for persisted cross-device state.',
        retryable: true,
        request: {
          prompt: `${prompt} failed.`,
          negativePrompt,
          model: 'gpt-image-2',
          modelLabel: 'GPT Image 2',
          aspectRatio: '9:16',
          imageSize: '2160x3840',
          quality: 'medium',
          outputFormat: 'png',
          imageCount: 1
        }
      }
    ]
  };
}

async function setupVisualApiMocks(page: Page): Promise<void> {
  await page.route('**/e2e-assets/visual-summary.svg', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: decodeURIComponent(
        generatedImages[0].replace('data:image/svg+xml;charset=utf-8,', '')
      )
    });
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();

    if (pathname === '/api/image/history' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: historyItems, total: historyItems.length })
      });
      return;
    }

    if (pathname === '/api/image/task' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(taskSnapshot())
      });
      return;
    }

    if (pathname === '/api/image/task' && method !== 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
      return;
    }

    if (pathname === '/api/image/models') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          models: [{ id: 'gpt-image-2', label: 'GPT Image 2' }]
        })
      });
      return;
    }

    if (pathname === '/api/image/references') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ references: [] })
      });
      return;
    }

    if (pathname === '/api/image/characters') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ characters: [] })
      });
      return;
    }

    if (pathname === '/api/credits/image-cost') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ cost: 100 })
      });
      return;
    }

    if (pathname === '/api/credits/balance') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          credits: {
            total: 52000,
            daily: 0,
            bonus: 52000,
            purchased: 0,
            subscription: 0
          }
        })
      });
      return;
    }

    if (pathname === '/api/content/prompt-assets') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ assets: [], total: 0 })
      });
      return;
    }

    if (pathname === '/api/prompt-assets/user') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ assets: [] })
      });
      return;
    }

    if (pathname === '/api/workspace/projects' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects: [visualProject] })
      });
      return;
    }

    if (pathname === '/api/workspace/projects/proj-visual' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ project: visualProject })
      });
      return;
    }

    if (pathname === '/api/workspace/summaries' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ summaries: [visualSummary], hasMore: false })
      });
      return;
    }

    if (pathname === '/api/workspace/summaries/summary-visual' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ summary: visualSummary })
      });
      return;
    }

    if (
      pathname === '/api/workspace/cards' ||
      pathname === '/api/workspace/shortcuts' ||
      pathname === '/api/workspace/conversations' ||
      pathname === '/api/workspace/skills' ||
      pathname === '/api/workspace/trash'
    ) {
      const key =
        pathname === '/api/workspace/cards'
          ? 'cards'
          : pathname === '/api/workspace/shortcuts'
            ? 'shortcuts'
            : pathname === '/api/workspace/conversations'
              ? 'conversations'
              : pathname === '/api/workspace/skills'
                ? 'skills'
                : 'items';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ [key]: [] })
      });
      return;
    }

    if (pathname === '/api/credits/weaving-quota') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, quota: { remaining: 10 } })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true })
    });
  });
}

async function stabilizePage(page: Page): Promise<void> {
  await page.addStyleTag({
    content: [
      '*, *::before, *::after {',
      '  animation-duration: 0s !important;',
      '  animation-delay: 0s !important;',
      '  transition-duration: 0s !important;',
      '  scroll-behavior: auto !important;',
      '}',
      '.creator-toast, .global-google-login-fallback { display: none !important; }',
      '.creator-prompt-case-lightbox img, .visual-image-tile img { image-rendering: auto; }'
    ].join('\n')
  });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
}

async function gotoStable(page: Page, url: string): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('workspace:onboarding-seen', '1');
    window.localStorage.setItem('webtomind_creator_prompt_panel_collapsed', '0');
  });
  await setupVisualApiMocks(page);
  await page.goto(url);
  await stabilizePage(page);
}

test.setTimeout(240_000);
test.skip(
  !shouldRunVisualBaseline,
  'Set E2E_VISUAL_BASELINE=true to run visual baseline screenshots.'
);

test.describe('visual regression baselines', () => {
  let server: RunningServer | undefined;
  let baseUrl = '';

  test.beforeAll(async () => {
    const pnpmCmd = getPnpmCommand();

    await runCommand(pnpmCmd, ['run', 'build:web'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        VITE_E2E_BYPASS_AUTH: '1',
        VITE_API_BASE: ''
      },
      timeoutMs: 240_000
    });

    const port = await getFreePort();
    server = await startServer(port);
    baseUrl = server.baseUrl;
  });

  test.afterAll(async () => {
    if (server) await server.stop();
  });

  test('home desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoStable(page, `${baseUrl}/`);
    await expect(page).toHaveScreenshot('home-desktop.png', {
      animations: 'disabled',
      fullPage: false,
      maxDiffPixelRatio: 0.03
    });
  });

  test('create desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoStable(page, `${baseUrl}/create`);
    await expect(page.locator('.creator-workbench')).toBeVisible();
    await expect(page).toHaveScreenshot('create-desktop.png', {
      animations: 'disabled',
      fullPage: false,
      maxDiffPixelRatio: 0.03
    });
  });

  test('create mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoStable(page, `${baseUrl}/create`);
    await expect(page.locator('.image-create-page')).toBeVisible();
    await expect(page.locator('.creator-prompt-mini-button')).toContainText('3');
    await page.locator('.creator-stage').scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -12));
    await stabilizePage(page);
    await expect(page).toHaveScreenshot('create-mobile.png', {
      animations: 'disabled',
      fullPage: false,
      maxDiffPixelRatio: 0.03
    });
  });

  test('pricing desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoStable(page, `${baseUrl}/pricing`);
    await expect(page).toHaveScreenshot('pricing-desktop.png', {
      animations: 'disabled',
      fullPage: false,
      maxDiffPixelRatio: 0.03
    });
  });

  test('use cases desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoStable(page, `${baseUrl}/zh-CN/use-cases`);
    await expect(page).toHaveScreenshot('use-cases-desktop.png', {
      animations: 'disabled',
      fullPage: false,
      maxDiffPixelRatio: 0.03
    });
  });

  test('boards overview desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoStable(page, `${baseUrl}/boards`);
    await expect(page.getByText('Mind').first()).toBeVisible();
    await expect(page).toHaveScreenshot('boards-overview-desktop.png', {
      animations: 'disabled',
      fullPage: false,
      maxDiffPixelRatio: 0.03
    });
  });

  test('board visual detail desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoStable(
      page,
      `${baseUrl}/boards/proj-visual?summary-id=summary-visual`
    );
    await expect(
      page.getByRole('button', { name: 'Visual workflow sample' })
    ).toBeVisible();
    await expect(page).toHaveScreenshot('board-visual-detail-desktop.png', {
      animations: 'disabled',
      fullPage: false,
      maxDiffPixelRatio: 0.03
    });
  });
});
