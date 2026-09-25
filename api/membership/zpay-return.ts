import { processZpayNotification } from './zpay-notify';

export const config = {
  runtime: 'edge'
};

function getPaymentReturnUrl(
  request: Request,
  result: Awaited<ReturnType<typeof processZpayNotification>>
): string {
  const appUrl = process.env.APP_URL || new URL(request.url).origin;
  const fallbackPath =
    result.checkoutType === 'api_credit_package' ? '/api-console' : '/pricing';
  const url = new URL(fallbackPath, appUrl);
  const returnTo = new URL(request.url).searchParams.get('returnTo');
  if (returnTo) {
    try {
      const candidate = new URL(returnTo, appUrl);
      const isSameOrigin = candidate.origin === new URL(appUrl).origin;
      const isSupportedPath =
        /^\/(?:zh-CN\/|en-US\/)?(?:api-console|pricing)$/.test(
          candidate.pathname
        );
      if (isSameOrigin && isSupportedPath) {
        url.pathname = candidate.pathname;
        candidate.searchParams.forEach((value, key) =>
          url.searchParams.set(key, value)
        );
      }
    } catch {
      // Keep the safe fallback path.
    }
  }
  // A pending result is a verified payment still being fulfilled; the return
  // page polls order-status for the final outcome.
  url.searchParams.set(
    'payment',
    result.ok || result.pending ? 'success' : 'cancel'
  );
  if (result.orderId) url.searchParams.set('orderId', result.orderId);
  if (result.checkoutType) {
    url.searchParams.set('checkoutType', result.checkoutType);
  }
  if (result.productId) url.searchParams.set('productId', result.productId);
  return url.toString();
}

export default async function handler(request: Request) {
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }
  // `returnTo` is an internal routing hint, not a signed ZPAY callback field.
  // Remove it while verifying the callback, then use the original request for
  // the final same-origin redirect.
  const callbackUrl = new URL(request.url);
  callbackUrl.searchParams.delete('returnTo');
  const callbackRequest = new Request(callbackUrl.toString(), {
    method: 'GET',
    headers: request.headers
  });
  const result = await processZpayNotification(callbackRequest);
  return Response.redirect(getPaymentReturnUrl(request, result), 302);
}
