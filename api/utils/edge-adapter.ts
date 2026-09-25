/**
 * 把 Vercel Node.js runtime 的 (VercelRequest, VercelResponse) 适配成
 * Web 标准的 Request / Response，让 handler 用统一签名。
 *
 * 用途：Edge runtime 上有 25s 强制超时，长耗时任务（VLM 反推、上传 +
 * Supabase service-role 文件搬运）只能跑 Node.js runtime；但代码逻辑
 * 想保持 Web 标准更易读。
 */

import type { VercelRequest, VercelResponse } from './vercel-types';

export function toWebRequest(
  request: VercelRequest,
  defaultPath = '/'
): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      value.forEach((item) => headers.append(key, item));
    } else if (typeof value === 'string') {
      headers.set(key, value);
    }
  }

  const protocolHeader = request.headers['x-forwarded-proto'];
  const hostHeader =
    request.headers['x-forwarded-host'] || request.headers.host;
  const protocol = Array.isArray(protocolHeader)
    ? protocolHeader[0]
    : protocolHeader || 'https';
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  const url = `${protocol}://${host || 'webtomind.com'}${request.url || defaultPath}`;
  const method = request.method || 'GET';
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const body =
    hasBody && request.body !== undefined
      ? typeof request.body === 'string'
        ? request.body
        : JSON.stringify(request.body)
      : undefined;

  return new Request(url, { method, headers, body });
}

export async function sendWebResponse(
  response: Response,
  vercelResponse: VercelResponse
): Promise<void> {
  response.headers.forEach((value, key) => {
    vercelResponse.setHeader(key, value);
  });
  const body = await response.text();
  vercelResponse.statusCode = response.status;
  vercelResponse.end(body);
}
