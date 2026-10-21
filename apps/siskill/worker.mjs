import { freeDownload } from './server/free-download.ts';
import catalog from './catalog.json';
import { handleCommerce } from './server/handler.ts';

import {
  origin as ORIGIN,
  locales,
  publicPaths as paths,
  pageMetadata,
  structuredData,
  available
} from './discovery.ts';
import {
  publicContent,
  escapeHtml as esc,
  serializeJsonLd
} from './seo-content.ts';
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
    if (path === '/skills' && url.searchParams.get('tier') === 'free') {
      url.searchParams.delete('tier');
      return {
        redirect: `${local ? url.origin : ORIGIN}/${match[1]}/skills/free${url.search}`
      };
    }
    return {
      search: url.search,
      locale: match[1],
      path,
      status: 200,
      skill: catalog.find((s) => path === `/skills/${s.slug}`)
    };
  }
  return { locale: match?.[1] || 'en-US', path: url.pathname, status: 404 };
}
export const metadata = pageMetadata;
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
      if (url.pathname.startsWith('/api/siskill/free/'))
        return secure(await freeDownload(request, env));
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
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${locales
          .flatMap((l) =>
            paths
              .filter(
                (p) =>
                  !catalog.some(
                    (s) => p === `/skills/${s.slug}` && !available(s)
                  )
              )
              .map(
                (p) =>
                  `<url><loc>${ORIGIN}/${l}${p}</loc>${metadata({
                    locale: l,
                    path: p,
                    status: 200
                  })
                    .alternates.map(
                      (a) =>
                        `<xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${a.href}"/>`
                    )
                    .join('')}</url>`
              )
          )
          .join('')}</urlset>`,
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
    let offers = [];
    // Anonymous public catalog only. Never use incoming cookies or auth for SEO.
    if (page.skill?.tier === 'premium' && available(page.skill)) {
      let timer;
      try {
        const response = await Promise.race([
          handleCommerce(
            new Request(new URL('/api/siskill/products', url)),
            env
          ),
          new Promise((resolve) => {
            timer = setTimeout(() => resolve(null), 2500);
          })
        ]);
        if (response?.ok) {
          const data = await response.json();
          if (data.checkoutOpen)
            offers = (data.products || []).filter(
              (p) =>
                Number.isSafeInteger(p.usd_cents) &&
                p.usd_cents > 0 &&
                p.siskill_releases?.status === 'published'
            );
        }
      } catch {
        /* Keep public content useful when commerce is unavailable. */
      } finally {
        clearTimeout(timer);
      }
    }
    const head = `<meta name="robots" content="${meta.robots}"><meta property="og:site_name" content="SiSkill"><meta property="og:type" content="website"><meta property="og:title" content="${esc(meta.title)}"><meta property="og:description" content="${esc(meta.description)}"><meta property="og:url" content="${esc(meta.canonical)}"><meta property="og:image" content="${esc(meta.image)}"><meta property="og:locale" content="${page.locale.replace('-', '_')}"><meta name="twitter:card" content="summary_large_image">${meta.alternates.map((a) => `<link rel="alternate" hreflang="${a.hreflang}" href="${esc(a.href)}">`).join('')}<script type="application/ld+json" id="webtomind-seo-jsonld">${serializeJsonLd(structuredData(page, offers))}</script>`;
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
      .on('#root', {
        element: (e) =>
          e.setInnerContent(publicContent(page, offers), { html: true })
      })
      .transform(source);
    return secure(
      new Response(request.method === 'HEAD' ? null : rewritten.body, {
        status: page.status,
        headers: new Headers([
          ...rewritten.headers,
          ['X-Robots-Tag', meta.robots]
        ])
      }),
      true
    );
  }
};
