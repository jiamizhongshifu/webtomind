/**
 * Google Tag Manager bootstrap for container GTM-XXXXXXX.
 *
 * Loaded as an external file instead of Google's inline snippet so the site's
 * strict Content-Security-Policy (script-src without 'unsafe-inline') keeps
 * working. Behavior is identical: it initializes the dataLayer and loads
 * https://www.googletagmanager.com/gtm.js?id=GTM-XXXXXXX asynchronously.
 */
(function (w, d, s, l, i) {
  w[l] = w[l] || [];
  w[l].push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
  var f = d.getElementsByTagName(s)[0];
  var j = d.createElement(s);
  var dl = l !== 'dataLayer' ? '&l=' + l : '';
  j.async = true;
  j.src = 'https://www.googletagmanager.com/gtm.js?id=' + i + dl;
  f.parentNode.insertBefore(j, f);
})(window, document, 'script', 'dataLayer', 'GTM-XXXXXXX');
