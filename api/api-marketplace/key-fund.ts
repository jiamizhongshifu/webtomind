export { apiMarketplaceRetiredResponse as default } from '../utils/api-marketplace-retired';
import { jsonResponse, preflightResponse } from './runtime';

export const config = { runtime: 'edge' };

// Retained for historical settlement diagnostics; no public route invokes it.
export async function legacyHandler(request: Request) {
  const preflight = preflightResponse(request);
  if (preflight) return preflight;
  return jsonResponse(
    request,
    {
      error:
        'API Key 不再单独分配余额，所有 Key 共享账户 API 可用额度。'
    },
    410
  );
}
