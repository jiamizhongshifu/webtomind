import type { VercelRequest, VercelResponse } from './utils/vercel-types';
import { readSeoIndexHtml } from './seo-html.js';
import {
  renderSeoPageHtml,
  renderSeoPageHtmlWithStatus,
  resolveSeoConfigForPath,
  injectSeo
} from './seo-page-render.js';

export {
  renderSeoPageHtml,
  renderSeoPageHtmlWithStatus,
  resolveSeoConfigForPath,
  injectSeo
};

export const config = { runtime: 'nodejs', maxDuration: 10 };

function getQueryParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).send('Method not allowed');
    return;
  }

  try {
    const rawPath = getQueryParam(req.query.path) || '/';
    const rendered = renderSeoPageHtmlWithStatus(readSeoIndexHtml(), rawPath);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=1800');
    res
      .status(rendered.status)
      .send(req.method === 'HEAD' ? '' : rendered.html);
  } catch (error) {
    console.error('[SeoPage] render failed:', error);
    res.status(500).send('SEO page render failed');
  }
}
