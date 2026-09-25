import type { VercelRequest, VercelResponse } from './utils/vercel-types';
import { readSeoIndexHtml } from './seo-html.js';
import {
  buildCreateAppSeoConfig,
  injectCreateAppSeo,
  renderCreateAppPageHtml
} from './create-app-page-render.js';

export {
  buildCreateAppSeoConfig,
  injectCreateAppSeo,
  renderCreateAppPageHtml
};

export const config = { runtime: 'nodejs', maxDuration: 10 };

function getQueryParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function resolveSlugFromPath(rawPath: string): string {
  const pathOnly = rawPath.split('?')[0] || '';
  const match = pathOnly.match(
    /^\/(?:zh-CN\/|en-US\/)?create\/apps\/([^/?#]+)$/u
  );
  return match ? decodeURIComponent(match[1] || '').trim() : '';
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).send('Method not allowed');
    return;
  }

  const rawPath = getQueryParam(req.query.path);
  const slug = getQueryParam(req.query.slug) || resolveSlugFromPath(rawPath);
  const locale = getQueryParam(req.query.locale) === 'en-US' ? 'en-US' : 'zh-CN';

  try {
    const rendered = renderCreateAppPageHtml({
      html: readSeoIndexHtml(),
      slug,
      locale
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=1800');
    res
      .status(rendered.status)
      .send(req.method === 'HEAD' ? '' : rendered.html);
  } catch (error) {
    console.error('[CreateAppPage] render failed:', error);
    res.status(500).send('Create app page render failed');
  }
}
