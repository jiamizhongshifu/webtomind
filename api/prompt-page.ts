import type { VercelRequest, VercelResponse } from './utils/vercel-types';
import { readSeoIndexHtml } from './seo-html.js';
import {
  injectPromptSeo,
  loadPromptCase,
  loadPromptCaseAlternates,
  renderPromptPageHtml
} from './prompt-page-render.js';

export {
  injectPromptSeo,
  loadPromptCase,
  loadPromptCaseAlternates,
  renderPromptPageHtml
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

  const localeParam = getQueryParam(req.query.locale);
  const locale = localeParam === 'en-US' ? 'en-US' : 'zh-CN';
  const slug = getQueryParam(req.query.slug).trim();
  const id = getQueryParam(req.query.id).trim();
  const redirectIdToSlug =
    getQueryParam(req.query.redirect).trim() === 'id-to-slug';

  try {
    const rendered = await renderPromptPageHtml({
      html: readSeoIndexHtml(),
      locale,
      slug,
      id,
      redirectIdToSlug
    });
    if (rendered.redirectPath) {
      res.setHeader('Location', rendered.redirectPath);
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600');
      res.status(rendered.status).send('');
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=1800');
    res
      .status(rendered.status)
      .send(req.method === 'HEAD' ? '' : rendered.html);
  } catch (error) {
    console.error('[PromptPage] render failed:', error);
    res.status(500).send('Prompt page render failed');
  }
}
