import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const host = process.env.UI_AUTH_PREVIEW_HOST || '127.0.0.1';
const requestedPort = Number(process.env.UI_AUTH_PREVIEW_PORT || 4173);
const previewOutDir = 'output/local-auth-preview-dist';
const viteBin = path.join(
  rootDir,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vite.cmd' : 'vite'
);

function findOpenPort(startPort) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      const server = net.createServer();
      server.unref();
      server.on('error', (error) => {
        if (error.code === 'EADDRINUSE' || error.code === 'EACCES') {
          tryPort(port + 1);
          return;
        }
        reject(error);
      });
      server.listen(port, host, () => {
        server.close(() => resolve(port));
      });
    };
    tryPort(startPort);
  });
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: options.stdio || 'inherit',
      env: {
        ...process.env,
        VITE_E2E_BYPASS_AUTH: '1',
        WEBTOMIND_LOCAL_AUTH_PREVIEW: '1',
        WEBTOMIND_BUILD_OUT_DIR: previewOutDir,
        ...options.env
      }
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(' ')} exited with ${
            signal ? `signal ${signal}` : `code ${code}`
          }`
        )
      );
    });
  });
}

async function main() {
  const port = await findOpenPort(requestedPort);
  if (port !== requestedPort) {
    console.log(
      `[auth-preview] Port ${requestedPort} is busy, using ${port} instead.`
    );
  }

  console.log('[auth-preview] Building web bundle with E2E auth bypass...');
  await run(viteBin, ['build', '--config', 'vite.config.web.ts']);

  console.log('');
  console.log('[auth-preview] Local authenticated preview is starting.');
  console.log(`[auth-preview] URL: http://${host}:${port}/zh-CN/create`);
  console.log(
    '[auth-preview] This bundle is for local UI validation only. A normal build disables the bypass.'
  );
  console.log(
    `[auth-preview] Smoke command: LOCAL_AUTH_PREVIEW_BASE_URL=http://${host}:${port} node scripts/smoke-auth-preview.mjs`
  );

  const preview = spawn(
    viteBin,
    [
      'preview',
      '--config',
      'vite.config.web.ts',
      '--host',
      host,
      '--port',
      String(port),
      '--strictPort'
    ],
    {
      cwd: rootDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        VITE_E2E_BYPASS_AUTH: '1',
        WEBTOMIND_LOCAL_AUTH_PREVIEW: '1',
        WEBTOMIND_BUILD_OUT_DIR: previewOutDir
      }
    }
  );

  const stop = () => {
    preview.kill('SIGTERM');
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  preview.on('exit', (code) => {
    process.exit(code || 0);
  });
}

main().catch((error) => {
  console.error('[auth-preview] Failed:', error);
  process.exit(1);
});
