// Local design review: current source, existing read-only candidate API.
import { createServer } from 'vite';
const server = await createServer({
  configFile: 'vite.config.web.ts',
  publicDir: 'public',
  plugins: [
    {
      name: 'skill-design-review-route',
      transformIndexHtml(html) {
        return html.replace(
          '</head>',
          `<script>localStorage.setItem('webtomind-language-prompt-dismissed','1');sessionStorage.setItem('webtomind:google-login-fallback-dismissed','1');</script></head>`
        );
      },
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (
            req.headers.accept?.includes('text/html') &&
            !req.url?.startsWith('/api/') &&
            !req.url?.includes('.')
          )
            req.url = '/web.html';
          next();
        });
      }
    }
  ],
  server: {
    host: '127.0.0.1',
    port: 4203,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:4202' }
  }
});
await server.listen();
server.printUrls();
