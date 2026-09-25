import { jsonResponse, preflightResponse } from './runtime';

export const config = { runtime: 'edge' };

export default async function handler(request: Request) {
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
