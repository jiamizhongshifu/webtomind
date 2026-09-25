const PRODUCTION_ANALYTICS_HOSTS = new Set([
  'webtomind.com',
  'www.webtomind.com'
]);

export function isProductionAnalyticsHost(hostname: string): boolean {
  return PRODUCTION_ANALYTICS_HOSTS.has(hostname.trim().toLowerCase());
}
