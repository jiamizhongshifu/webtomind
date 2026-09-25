import { expect, test, type Page } from '@playwright/test';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';

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
      reject(
        new Error(`Command timed out: ${command} ${args.join(' ')}\n${logs}`)
      );
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
      reject(
        new Error(`Command failed: ${command} ${args.join(' ')}\n${logs}`)
      );
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
        SUPABASE_URL: process.env.SUPABASE_URL || 'https://example.supabase.co',
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || 'anon-key-for-e2e',
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

function sseResponse(toolCallId: string, message: string): string {
  return [
    'event: status',
    'data: {"status":"analyzing","message":"Analyzing"}',
    '',
    'event: tool_call',
    `data: {"id":"${toolCallId}","name":"wechat_publish","input":{"content":"demo"},"requiresConfirmation":true}`,
    '',
    'event: text',
    `data: {"content":"${message}"}`,
    '',
    'event: done',
    'data: {}',
    '',
    'data: [DONE]',
    ''
  ].join('\n');
}

async function setupWorkbenchApiMocks(
  page: Page,
  confirmationPayloads: Array<Record<string, unknown>>
): Promise<void> {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();

    if (pathname === '/api/workspace/projects' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          projects: [
            {
              id: 'proj1',
              name: 'E2E Project',
              description: null,
              icon: '*',
              color: '#3b82f6',
              isDefault: false,
              sortOrder: 0,
              summaryCount: 0,
              conversationCount: 0,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              archivedAt: null,
              favoritedAt: null
            }
          ]
        })
      });
      return;
    }

    if (pathname === '/api/workspace/summaries' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ summaries: [], hasMore: false })
      });
      return;
    }

    if (pathname === '/api/workspace/shortcuts' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ shortcuts: [] })
      });
      return;
    }

    if (pathname === '/api/workspace/conversations' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ conversations: [] })
      });
      return;
    }

    if (pathname === '/api/workspace/conversations' && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'conv-e2e' })
      });
      return;
    }

    if (pathname.startsWith('/api/workspace/conversations/')) {
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: pathname.split('/').pop(),
            title: 'E2E Conversation',
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
          })
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
      return;
    }

    if (
      (pathname === '/api/agent/smart-chat' ||
        pathname === '/api/agent/chat') &&
      method === 'POST'
    ) {
      const raw = request.postData() || '{}';
      let prompt = '';
      try {
        const parsed = JSON.parse(raw) as { prompt?: string };
        prompt = parsed.prompt || '';
      } catch {
        prompt = '';
      }

      const isCancelCase = /cancel/i.test(prompt);
      const body = isCancelCase
        ? sseResponse('tc2', 'cancel path response')
        : sseResponse('tc1', 'confirm path response');

      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: {
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive'
        },
        body
      });
      return;
    }

    if (pathname === '/api/agent/confirm-tool' && method === 'POST') {
      try {
        const payload = JSON.parse(request.postData() || '{}') as Record<
          string,
          unknown
        >;
        confirmationPayloads.push(payload);
      } catch {
        confirmationPayloads.push({ parseError: true });
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, delivered: true })
      });
      return;
    }

    await route.continue();
  });
}

test.setTimeout(240_000);

test.describe('Workbench agent chat interactions', () => {
  let server: RunningServer;
  let baseUrl = '';

  test.beforeAll(async () => {
    // The fixture builds the production bundle before starting its isolated
    // server. Give that setup its own budget; the suite-level test timeout does
    // not automatically extend hook timeouts in Playwright.
    test.setTimeout(240_000);
    const pnpmCmd = getPnpmCommand();
    const port = await getFreePort();
    baseUrl = `http://127.0.0.1:${port}`;

    await runCommand(pnpmCmd, ['run', 'build:web'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        VITE_E2E_BYPASS_AUTH: '1',
        VITE_API_BASE: baseUrl
      },
      timeoutMs: 240_000
    });

    server = await startServer(port);
    expect(server.baseUrl).toBe(baseUrl);
  });

  test.afterAll(async () => {
    if (server) {
      await server.stop();
    }
  });

  test('switches mode, sends prompt and confirms tool call', async ({
    page
  }) => {
    const confirmationPayloads: Array<Record<string, unknown>> = [];
    await setupWorkbenchApiMocks(page, confirmationPayloads);

    await page.goto(`${baseUrl}/boards/proj1`);

    await expect(page.getByTestId('workspace-chat-input-area')).toBeVisible();

    await page.getByTestId('mode-toggle-button').click();
    await page.getByTestId('mode-option-image').click();
    await page.getByTestId('mode-toggle-button').click();
    await page.getByTestId('mode-option-agent').click();

    const input = page.getByTestId('chat-input-textarea');
    await input.fill('publish flow');
    await page.getByTestId('chat-send-button').click();

    await expect(page.getByText('publish flow')).toBeVisible();
    await expect(page.getByTestId('tool-call-block-tc1')).toBeVisible();

    await page.getByTestId('tool-confirm-button-tc1').click();

    await expect
      .poll(() => confirmationPayloads.length, { timeout: 10_000 })
      .toBe(1);

    expect(confirmationPayloads[0]).toMatchObject({
      toolCallId: 'tc1',
      approved: true
    });

    await expect(page.getByText('confirm path response')).toBeVisible();
  });

  test('can cancel a tool call from the chat stream', async ({ page }) => {
    const confirmationPayloads: Array<Record<string, unknown>> = [];
    await setupWorkbenchApiMocks(page, confirmationPayloads);

    await page.goto(`${baseUrl}/boards/proj1`);

    await expect(page.getByTestId('workspace-chat-input-area')).toBeVisible();

    await page.getByTestId('mode-toggle-button').click();
    await page.getByTestId('mode-option-image').click();
    await page.getByTestId('mode-toggle-button').click();
    await page.getByTestId('mode-option-agent').click();

    const input = page.getByTestId('chat-input-textarea');
    await input.fill('cancel this execution');
    await page.getByTestId('chat-send-button').click();

    await expect(page.getByTestId('tool-call-block-tc2')).toBeVisible();
    await page.getByTestId('tool-cancel-button-tc2').click();

    await expect
      .poll(() => confirmationPayloads.length, { timeout: 10_000 })
      .toBe(1);

    expect(confirmationPayloads[0]).toMatchObject({
      toolCallId: 'tc2',
      approved: false
    });

    await expect(page.getByText('cancel path response')).toBeVisible();
  });
});
