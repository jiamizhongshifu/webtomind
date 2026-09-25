import { expect, test } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

interface RunningServer {
  baseUrl: string;
  stop: () => Promise<void>;
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

async function waitForHealth(url: string, timeoutMs = 20_000): Promise<void> {
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

async function startServer(
  overrides: Record<string, string>
): Promise<RunningServer> {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const env = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'development',
    SUPABASE_URL: process.env.SUPABASE_URL || 'https://example.supabase.co',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || 'anon-key-for-e2e',
    ...overrides
  };

  const child = spawn(
    'node',
    ['server/node_modules/tsx/dist/cli.mjs', 'server/src/index.ts'],
    {
      cwd: process.cwd(),
      env,
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

test.describe('API security regression (development mode)', () => {
  let server: RunningServer;

  test.beforeAll(async () => {
    server = await startServer({
      NODE_ENV: 'development',
      ENABLE_DEBUG_AGENT_ROUTES: 'true',
      AUTH_DEV_BYPASS: '0'
    });
  });

  test.afterAll(async () => {
    await server.stop();
  });

  test('health endpoint responds', async () => {
    const response = await fetch(`${server.baseUrl}/health`);
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.status).toBe('ok');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('referrer-policy')).toBe(
      'strict-origin-when-cross-origin'
    );
    expect(response.headers.get('permissions-policy')).toContain('camera=()');
  });

  test('HTML responses include a restrictive content security policy', async () => {
    const response = await fetch(`${server.baseUrl}/`);
    expect(response.status).toBe(200);
    const policy = response.headers.get('content-security-policy');
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain("'unsafe-eval'");
  });

  test('chat endpoint rejects unauthenticated requests', async () => {
    const response = await fetch(`${server.baseUrl}/api/agent/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'ping' })
    });

    expect(response.status).toBe(401);
  });

  test('confirm-tool endpoint rejects unauthenticated requests', async () => {
    const response = await fetch(`${server.baseUrl}/api/agent/confirm-tool`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'e2e-session',
        toolCallId: 'tool-1',
        approved: true
      })
    });

    expect(response.status).toBe(401);
  });

  test('disallowed Origin is not reflected by CORS', async () => {
    const response = await fetch(`${server.baseUrl}/health`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil.example',
        'Access-Control-Request-Method': 'GET'
      }
    });

    expect([200, 204]).toContain(response.status);
    expect(response.headers.get('access-control-allow-origin')).not.toBe(
      'https://evil.example'
    );
  });

  test('debug endpoint is reachable in development mode', async () => {
    const response = await fetch(`${server.baseUrl}/api/debug/agent`);
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload).toHaveProperty('overallStatus');
  });
});

test('explicit development bypass never accepts an invalid token', async () => {
  const server = await startServer({
    NODE_ENV: 'development',
    AUTH_DEV_BYPASS: '1'
  });

  try {
    const response = await fetch(`${server.baseUrl}/api/agent/chat`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer invalid-e2e-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt: 'ping' })
    });
    expect(response.status).toBe(401);
  } finally {
    await server.stop();
  }
});

test.describe('Debug endpoint hardening (production mode)', () => {
  test('does not mount debug routes even when all debug flags are configured', async () => {
    const server = await startServer({
      NODE_ENV: 'production',
      DEBUG_SECRET: 'e2e-debug-secret',
      ENABLE_DEBUG_AGENT_ROUTES: 'true'
    });

    try {
      const response = await fetch(`${server.baseUrl}/api/debug/agent`);
      expect(response.status).toBe(404);
    } finally {
      await server.stop();
    }
  });

  test('stays unavailable when DEBUG_SECRET is absent', async () => {
    const server = await startServer({
      NODE_ENV: 'production',
      DEBUG_SECRET: '',
      ENABLE_DEBUG_AGENT_ROUTES: 'true'
    });

    try {
      const response = await fetch(
        `${server.baseUrl}/api/debug/agent/test-tool`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: '{}'
        }
      );
      expect(response.status).toBe(404);
    } finally {
      await server.stop();
    }
  });
});
