export type PricingLocalePrefix = '' | '/zh-CN' | '/en-US';

export function getPricingLocalePrefix(pathname: string): PricingLocalePrefix {
  if (pathname.startsWith('/en-US')) return '/en-US';
  if (pathname.startsWith('/zh-CN')) return '/zh-CN';
  return '';
}

/**
 * Makes the creator workspace the single pricing destination while preserving
 * payment-return and acquisition parameters from legacy pricing URLs.
 */
export function getWorkspacePricingHref(
  localePrefix: PricingLocalePrefix,
  search = ''
): string {
  const params = new URLSearchParams(search);
  if (!params.has('source')) params.set('source', 'creator_sidebar');
  if (!params.has('returnTo')) {
    params.set('returnTo', `${localePrefix}/create`);
  }
  return `${localePrefix}/create/pricing?${params.toString()}`;
}
