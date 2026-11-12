// Local read-only review server. Never deploy this API fixture as production data.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
const root = path.resolve(
  process.env.SKILL_PREVIEW_BUILD || 'output/storefront-build'
);
const fixture = JSON.parse(
  await readFile('output/skill-video-cards/catalog-preview.json', 'utf8')
);
const port = Number(process.env.SKILL_PREVIEW_PORT || 4202);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.json': 'application/json'
};
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const json = (status, data) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      });
      res.end(JSON.stringify(data));
    };
    if (req.method !== 'GET' && req.method !== 'HEAD')
      return json(405, {
        error: 'Read-only local preview; writes and checkout disabled'
      });
    if (url.pathname === '/api/skill-catalog') {
      const q = url.searchParams;
      const matches = fixture.filter(
        (i) =>
          (!q.get('tier') || i.tier === q.get('tier')) &&
          (!q.get('output_type') ||
            i.outputTypes.includes(q.get('output_type'))) &&
          (!q.get('q') ||
            JSON.stringify([i.name, i.summary])
              .toLowerCase()
              .includes(q.get('q').toLowerCase()))
      );
      return json(200, {
        items: matches.slice(0, Number(q.get('limit') || 48)),
        total: matches.length
      });
    }
    if (url.pathname.startsWith('/api/skill-catalog/skills/')) {
      const item = fixture.find(
        (i) => i.slug === url.pathname.split('/').at(-1)
      );
      return json(item ? 200 : 404, item || { error: 'SKILL_NOT_FOUND' });
    }
    if (url.pathname === '/api/auth/me')
      return json(401, { error: 'Unauthorized' });
    if (url.pathname.startsWith('/api/'))
      return json(200, {
        items: [],
        tasks: [],
        products: [],
        subscriptions: [],
        access: null
      });
    const filename = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (filename !== root && !filename.startsWith(root + path.sep))
      return json(403, { error: 'Forbidden' });
    let file = filename;
    try {
      if (!(await stat(file)).isFile()) throw Error();
    } catch {
      if (path.extname(file)) return json(404, { error: 'Not found' });
      file = path.join(root, 'index.html');
    }
    let bytes = await readFile(file);
    const type = mime[path.extname(file)] || 'application/octet-stream';
    if (file.endsWith('.html'))
      bytes = Buffer.from(
        bytes
          .toString()
          .replace(
            '</body>',
            `<aside style="position:fixed;bottom:10px;left:10px;z-index:9999;padding:8px 12px;border:1px solid #dbd8ce;border-radius:8px;background:#fff9dc;color:#343126;font:12px system-ui">Local review · candidate catalog · checkout disabled</aside><script>sessionStorage.setItem('webtomind:google-login-fallback-dismissed','1');localStorage.setItem('webtomind-language-prompt-dismissed','1');</script></body>`
          )
      );
    // Native media controls need byte ranges for seeking.
    const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if (range) {
      const start = Number(range[1]),
        end = Math.min(
          range[2] ? Number(range[2]) : bytes.length - 1,
          bytes.length - 1
        );
      if (start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${bytes.length}` });
        return res.end();
      }
      res.writeHead(206, {
        'Content-Type': type,
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${end}/${bytes.length}`,
        'Content-Length': end - start + 1
      });
      return res.end(
        req.method === 'HEAD' ? undefined : bytes.subarray(start, end + 1)
      );
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Accept-Ranges': 'bytes',
      'Content-Length': bytes.length,
      'Cache-Control': 'no-store'
    });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch {
    res.writeHead(500);
    res.end('Preview error');
  }
}).listen(port, '127.0.0.1', () =>
  console.log(`Local Skill review: http://127.0.0.1:${port}/en-US/skills`)
);
