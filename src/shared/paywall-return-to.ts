/**
 * Paywall returnTo contract.
 *
 * Pricing and recharge pages are "paywall" pages. A returnTo value must always
 * point at the creator's original destination (for example /create/image), never
 * at another paywall page. Links built while the user is already on a paywall
 * page collapse the chain so URLs stay short and the post-payment redirect
 * lands exactly where the user started.
 */

const PAYWALL_PATH_PATTERN =
  /^\/(?:(?:zh-CN|en-US)\/)?(?:create\/)?(?:pricing|recharge)\/?$/;

export function isPaywallPath(pathname: string): boolean {
  return PAYWALL_PATH_PATTERN.test(String(pathname || '').split(/[?#]/, 1)[0]);
}

export function isSafeRelativePath(value: string): boolean {
  return value.startsWith('/') && !value.startsWith('//');
}

/**
 * Unwraps nested paywall returnTo chains (pricing -> recharge -> create)
 * up to a bounded depth. Returns the deepest non-paywall path, or null when
 * the value is missing, unsafe, cross-origin, or endlessly self-referencing.
 */
export function unwrapPaywallReturnTo(
  value?: string | null,
  origin = 'https://webtomind.com'
): string | null {
  if (!value) return null;

  let candidate = value;
  for (let depth = 0; depth < 6; depth += 1) {
    let url: URL;
    try {
      url = new URL(candidate, origin);
    } catch {
      return null;
    }
    if (url.origin !== origin) return null;

    if (!isPaywallPath(url.pathname)) {
      const path = `${url.pathname}${url.search}${url.hash}`;
      return isSafeRelativePath(path) ? path : null;
    }

    const nestedReturnTo = url.searchParams.get('returnTo');
    if (!nestedReturnTo || nestedReturnTo === candidate) return null;
    candidate = nestedReturnTo;
  }

  return null;
}

/**
 * Builds the returnTo to attach to paywall links while the user is on any
 * page. On non-paywall pages the current URL is preserved; on paywall pages
 * the existing returnTo chain is collapsed to the original destination, with
 * a locale-aware create fallback.
 */
export function collapsePaywallReturnTo(
  pathname: string,
  search = '',
  hash = '',
  fallbackPath?: string
): string {
  const localePrefix =
    pathname.startsWith('/en-US')
      ? '/en-US'
      : pathname.startsWith('/zh-CN')
        ? '/zh-CN'
        : '';

  if (!isPaywallPath(pathname)) {
    return `${pathname}${search}${hash}`;
  }

  const candidate = new URLSearchParams(search).get('returnTo');
  const unwrapped = unwrapPaywallReturnTo(candidate);
  if (unwrapped) return unwrapped;

  return fallbackPath || `${localePrefix}/create`;
}
