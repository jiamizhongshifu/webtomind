import catalog from './catalog.json';
import { handleCommerce } from './server/handler.ts';

const ORIGIN = 'https://siskill.dev';
const locales = ['en-US', 'zh-CN'];
const paths = [
  '/overview',
  '/skills',
  '/skills/pricing',
  ...catalog.map((s) => `/skills/${s.slug}`)
];
export function route(input) {
  const url = new URL(input);
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (!local && (url.hostname !== 'siskill.dev' || url.protocol !== 'https:')) {
    return { redirect: `${ORIGIN}${url.pathname}${url.search}` };
  }
  if (url.pathname === '/' || /^\/(en-US|zh-CN)\/?$/.test(url.pathname)) {
    const locale = url.pathname.startsWith('/zh-CN') ? 'zh-CN' : 'en-US';
    return {
      redirect: `${local ? url.origin : ORIGIN}/${locale}/overview${url.search}`
    };
  }
  if ([...paths, '/account'].includes(url.pathname))
    return {
      redirect: `${local ? url.origin : ORIGIN}/en-US${url.pathname}${url.search}`
    };
  const match = url.pathname.match(/^\/(en-US|zh-CN)(\/.*)$/);
  const path = match?.[2].replace(/\/$/, '');
  if (match && [...paths, '/account'].includes(path)) {
    if (url.pathname.endsWith('/'))
      return {
        redirect: `${local ? url.origin : ORIGIN}/${match[1]}${path}${url.search}`
      };
    return {
      locale: match[1],
      path,
      status: 200,
      skill: catalog.find((s) => path === `/skills/${s.slug}`)
    };
  }
  return { locale: match?.[1] || 'en-US', path: url.pathname, status: 404 };
}
export function metadata(page) {
  const zh = page.locale === 'zh-CN';
  const title =
    page.path === '/account'
      ? 'Your library | SiSkill'
      : page.status === 404
        ? 'Page not found | SiSkill'
        : page.skill
          ? `${page.skill.name[page.locale]} | SiSkill`
          : page.path === '/skills/pricing'
            ? 'SiSkill — Membership & pricing'
            : page.path === '/skills'
              ? 'SiSkill — Explore creative Skills'
              : 'SiSkill — Your agent. A creative studio.';
  const description =
    page.skill?.summary[page.locale] ||
    (zh
      ? '为图文、演示、网页和视频打造的可复用 Skill。先看真实演示，再了解可编辑的交付成果。'
      : 'Reusable Skills for visuals, decks, websites and video. Explore real demonstrations and editable outputs.');
  return {
    title,
    description,
    canonical: `${ORIGIN}/${page.locale}${page.path}`,
    image: `${ORIGIN}${page.skill?.coverUrl || '/skill-previews/og-image.png'}`
  };
}
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]
  );
function secure(response, html = false) {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('Strict-Transport-Security', 'max-age=31536000');
  if (html) {
    headers.set('Cache-Control', 'no-cache');
    headers.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; font-src 'self'; connect-src 'self' https://cloudflareinsights.com https://slixamjkvpoijrnbwzxi.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://zpayz.cn"
    );
  }
  return new Response(response.body, { status: response.status, headers });
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Only the independent namespace can reach billing; legacy APIs stay closed.
    if (url.pathname.startsWith('/api/siskill/')) {
      const canonical = route(url);
      if (canonical.redirect)
        return new Response('Use the canonical SiSkill origin', {
          status: 403
        });
      return secure(await handleCommerce(request, env));
    }
    if (!['GET', 'HEAD'].includes(request.method))
      return new Response('Method not allowed', {
        status: 405,
        headers: { Allow: 'GET, HEAD' }
      });
    const page = route(url);
    if (page.redirect) return Response.redirect(page.redirect, 308);
    if (url.pathname === '/robots.txt')
      return new Response(
        `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${ORIGIN}/sitemap.xml\n`,
        { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
      );
    if (url.pathname === '/sitemap.xml')
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locales.flatMap((l) => paths.map((p) => `<url><loc>${ORIGIN}/${l}${p}</loc></url>`)).join('')}</urlset>`,
        { headers: { 'Content-Type': 'application/xml; charset=utf-8' } }
      );
    if (
      /^\/(assets|skill-previews)\//.test(url.pathname) ||
      ['/favicon.svg', '/release-manifest.json'].includes(url.pathname)
    )
      return secure(await env.ASSETS.fetch(request));
    if (url.pathname.startsWith('/api/') || /\.[a-z0-9]+$/i.test(url.pathname))
      return new Response('Not found', { status: 404 });
    const index = new URL('/index.html', request.url);
    const source = await env.ASSETS.fetch(new Request(index));
    if (!source.ok) return new Response('Service unavailable', { status: 503 });
    const meta = metadata(page);
    const head = `<meta name="robots" content="${page.status === 404 || page.path === '/account' ? 'noindex,follow' : 'index,follow'}"><meta property="og:site_name" content="SiSkill"><meta property="og:type" content="website"><meta property="og:title" content="${esc(meta.title)}"><meta property="og:description" content="${esc(meta.description)}"><meta property="og:url" content="${esc(meta.canonical)}"><meta property="og:image" content="${esc(meta.image)}"><meta name="twitter:card" content="summary_large_image">${page.status === 200 ? locales.map((l) => `<link rel="alternate" hreflang="${l}" href="${ORIGIN}/${l}${page.path}">`).join('') : ''}`;
    const fallback = `<noscript><main><h1>${esc(meta.title)}</h1><p>${esc(meta.description)}</p><p>Preview the collection. Skill packages and checkout are coming soon.</p><ul>${catalog.map((s) => `<li><a href="/${page.locale}/skills/${s.slug}">${esc(s.name[page.locale])}</a></li>`).join('')}</ul></main></noscript>`;
    const rewritten = new HTMLRewriter()
      .on('html', { element: (e) => e.setAttribute('lang', page.locale) })
      .on('title', { element: (e) => e.setInnerContent(meta.title) })
      .on('meta[name="description"]', {
        element: (e) => e.setAttribute('content', meta.description)
      })
      .on('link[rel="canonical"]', {
        element: (e) => e.setAttribute('href', meta.canonical)
      })
      .on('head', { element: (e) => e.append(head, { html: true }) })
      .on('body', { element: (e) => e.append(fallback, { html: true }) })
      .transform(source);
    return secure(
      new Response(request.method === 'HEAD' ? null : rewritten.body, {
        status: page.status,
        headers: rewritten.headers
      }),
      true
    );
  }
};
