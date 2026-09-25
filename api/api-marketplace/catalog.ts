import {
  getApiMarketplaceCatalog,
  jsonResponse,
  preflightResponse
} from './runtime';

export const config = { runtime: 'edge' };

export default async function handler(request: Request) {
  const preflight = preflightResponse(request);
  if (preflight) return preflight;
  if (request.method !== 'GET') {
    return jsonResponse(request, { error: 'Method not allowed' }, 405);
  }

  try {
    const url = new URL(request.url);
    const query = url.searchParams.get('search')?.trim().toLowerCase() || '';
    const tag = url.searchParams.get('tag')?.trim();
    const includeStatus = url.searchParams.get('view') === 'status';
    const catalog = await getApiMarketplaceCatalog();
    const models = catalog.models.filter((model) => {
      if (
        query &&
        !`${model.name} ${model.description} ${model.tags.join(' ')}`
          .toLowerCase()
          .includes(query)
      ) {
        return false;
      }
      return !tag || model.tags.includes(tag);
    });
    const publicModels = models.map((model) => ({
      id: model.id,
      name: model.name,
      createdAt: model.createdAt,
      description: model.description,
      tags: model.tags,
      pricingMode: model.pricingMode,
      customer: {
        modelRatio: model.customer.modelRatio,
        completionRatio: model.customer.completionRatio,
        modelPrice: model.customer.modelPrice,
        currency: model.customer.currency
      },
      provider: model.provider,
      groups: model.groups,
      pricing: model.pricing,
      endpoints: model.endpoints,
      ...(includeStatus ? { status: model.status } : {})
    }));
    return jsonResponse(
      request,
      {
        currency: catalog.currency,
        fetchedAt: catalog.fetchedAt,
        ...(includeStatus ? { statusMeta: catalog.statusMeta } : {}),
        total: publicModels.length,
        models: publicModels
      },
      200,
      // Public read-only pricing metadata. The 60s edge cache absorbs anonymous
      // browsing/crawler load; the upstream provider feed already has its own
      // in-isolate 5 minute cache underneath.
      { 'Cache-Control': 'public, max-age=60' }
    );
  } catch (error) {
    console.error('[ApiMarketplace] Catalog fetch failed:', error);
    return jsonResponse(
      request,
      { error: '模型价格暂时不可用，请稍后重试' },
      503
    );
  }
}
