import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

const MAX_OBJECT_BYTES = 80 * 1024 * 1024;
const MAX_CONCURRENT_DOWNLOADS = 4;

function createWranglerR2Env() {
  const env = { ...process.env };
  // The local Worker uses a scoped operations token, but Wrangler's R2 CLI
  // needs the user's authenticated Wrangler session to read historical media.
  delete env.CLOUDFLARE_API_TOKEN;
  delete env.CF_API_TOKEN;
  return env;
}

function cachePathFor(cacheRoot, bucket, key) {
  const digest = createHash('sha256').update(`${bucket}\0${key}`).digest('hex');
  return path.join(cacheRoot, digest.slice(0, 2), digest);
}

function downloadRemoteObject({ root, bucket, key }) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'pnpm',
      [
        'exec',
        'wrangler',
        'r2',
        'object',
        'get',
        `${bucket}/${key}`,
        '--remote',
        '--pipe'
      ],
      {
        cwd: root,
        env: createWranglerR2Env(),
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false
      }
    );
    const chunks = [];
    let total = 0;
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_OBJECT_BYTES) {
        child.kill('SIGTERM');
        reject(new Error('R2 object exceeds the local proxy size limit.'));
        return;
      }
      chunks.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            stderr.trim() || `wrangler r2 object get exited with code ${code}`
          )
        );
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}

export async function startLocalR2MediaProxy({ root }) {
  const token = randomBytes(24).toString('hex');
  const cacheRoot = path.join(tmpdir(), 'webtomind-r2-media-cache-v1');
  const inflight = new Map();
  const waiting = [];
  let activeDownloads = 0;

  async function withDownloadSlot(task) {
    if (activeDownloads >= MAX_CONCURRENT_DOWNLOADS) {
      await new Promise((resolve) => waiting.push(resolve));
    }
    activeDownloads += 1;
    try {
      return await task();
    } finally {
      activeDownloads -= 1;
      waiting.shift()?.();
    }
  }

  async function loadObject(bucket, key) {
    const finalPath = cachePathFor(cacheRoot, bucket, key);
    if (existsSync(finalPath)) return finalPath;
    const inflightKey = `${bucket}\0${key}`;
    if (inflight.has(inflightKey)) return inflight.get(inflightKey);
    const task = (async () => {
      const bytes = await withDownloadSlot(() =>
        downloadRemoteObject({ root, bucket, key })
      );
      await mkdir(path.dirname(finalPath), { recursive: true });
      const temporaryPath = `${finalPath}.${process.pid}.tmp`;
      await writeFile(temporaryPath, bytes, { mode: 0o600 });
      await rename(temporaryPath, finalPath).catch(async (error) => {
        await unlink(temporaryPath).catch(() => {});
        if (!existsSync(finalPath)) throw error;
      });
      return finalPath;
    })().finally(() => inflight.delete(inflightKey));
    inflight.set(inflightKey, task);
    return task;
  }

  const server = createServer(async (request, response) => {
    if (request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(401).end('Unauthorized');
      return;
    }
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (request.method !== 'GET' || url.pathname !== '/r2') {
      response.writeHead(404).end('Not found');
      return;
    }
    const bucket = url.searchParams.get('bucket')?.trim() || '';
    const key = url.searchParams.get('key')?.trim() || '';
    if (!bucket || !key || bucket.length > 128 || key.length > 2048) {
      response.writeHead(400).end('Invalid media locator');
      return;
    }
    try {
      const objectPath = await loadObject(bucket, key);
      const objectStat = await stat(objectPath);
      response.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(objectStat.size),
        'Cache-Control': 'private, max-age=300'
      });
      createReadStream(objectPath).pipe(response);
    } catch (error) {
      console.error(
        `[local-r2-media-proxy] ${bucket}/${key}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      response.writeHead(502).end('Unable to read remote media object');
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Local R2 media proxy did not receive a TCP port.');
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    token,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}
