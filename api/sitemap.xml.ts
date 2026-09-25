/// <reference lib="dom" />

import type { VercelRequest, VercelResponse } from './utils/vercel-types';
import { renderSitemapResponse } from './sitemap-render.js';
export { getStaticSitemapPathsForTest } from './sitemap-render.js';

export const config = { runtime: 'nodejs', maxDuration: 10 };

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  const method = request.method || 'GET';
  const url = new URL(request.url || '/sitemap.xml', 'https://webtomind.com');
  const workerRequest = new Request(url.toString(), { method });
  const sitemapResponse = await renderSitemapResponse(workerRequest);

  sitemapResponse.headers.forEach((value, key) => {
    response.setHeader(key, value);
  });
  response.status(sitemapResponse.status);

  if (method === 'HEAD') {
    response.end();
    return;
  }

  response.send(await sitemapResponse.text());
}
