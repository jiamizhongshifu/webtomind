/*
 * Microsoft Clarity bootstrap for project your-clarity-id.
 *
 * The script is loaded from <head> through web.html. Consent is initialized
 * before Clarity's remote script is requested and is synchronized again by
 * AnalyticsConsentGate after the visitor changes the site preference.
 */
(function (c, l, a, r, i, t, y) {
  var isProductionHost =
    l.location.hostname === 'webtomind.com' ||
    l.location.hostname === 'www.webtomind.com';
  if (!isProductionHost) return;

  c[a] =
    c[a] ||
    function () {
      (c[a].q = c[a].q || []).push(arguments);
    };

  var storedConsent = null;
  try {
    storedConsent = l.localStorage.getItem('webtomind:analytics-consent:v1');
  } catch (_error) {
    // If storage is unavailable, stay in the no-consent mode.
  }
  var storage = storedConsent === 'granted' ? 'granted' : 'denied';
  c[a]('consentv2', {
    ad_Storage: storage,
    analytics_Storage: storage
  });

  t = l.createElement(r);
  t.async = 1;
  t.src = 'https://www.clarity.ms/tag/' + i;
  y = l.getElementsByTagName(r)[0];
  y.parentNode.insertBefore(t, y);
})(window, document, 'clarity', 'script', 'your-clarity-id');
