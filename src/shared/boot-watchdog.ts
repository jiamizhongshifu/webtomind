// Pre-mount boot watchdog source. Served from the Cloudflare Worker itself so
// a stale HTML shell that references a replaced hashed entry bundle can
// self-recover instead of leaving the SSR handoff stuck on screen. Also served
// by the Vite dev server so local development does not 404 the same path.
// Kept dependency-free so it runs in every browser, including WebViews.
export const BOOT_WATCHDOG_SOURCE = `/* WebToMind boot watchdog v1 */
(function () {
  try {
    if (!document.getElementById('root')) return;
    if (window.__WEBTOMIND_APP_MOUNTED__) return;

    var STORAGE_KEY = 'webtomind:boot-watchdog-v1';
    var COOLDOWN_MS = 30000;
    var TIMEOUT_MS = 20000;
    var MAX_ATTEMPTS = 3;
    var attempted = false;

    function readMarker() {
      try {
        var raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed.at === 'number') return parsed;
      } catch (err) {}
      return null;
    }

    function clearMarker() {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch (err) {}
    }

    function recover() {
      if (attempted || window.__WEBTOMIND_APP_MOUNTED__) return;
      var marker = readMarker();
      var attempts =
        marker && typeof marker.attempts === 'number' ? marker.attempts : 0;
      if (marker && Date.now() - marker.at < COOLDOWN_MS) return;
      if (attempts >= MAX_ATTEMPTS) return;
      attempted = true;
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ at: Date.now(), attempts: attempts + 1 })
        );
      } catch (err) {}
      try {
        var url = new URL(window.location.href);
        url.searchParams.set('_wtm_recovery', String(Date.now()));
        window.location.replace(url.toString());
      } catch (err) {}
    }

    function isAppAsset(src) {
      if (!src) return false;
      try {
        var url = new URL(src, window.location.href);
        if (url.origin !== window.location.origin) return false;
        return url.pathname.indexOf('/assets/') === 0;
      } catch (err) {
        return false;
      }
    }

    window.addEventListener(
      'error',
      function (event) {
        if (window.__WEBTOMIND_APP_MOUNTED__) return;
        var target = event.target;
        if (
          target &&
          (target.tagName === 'SCRIPT' || target.tagName === 'LINK') &&
          isAppAsset(target.src || target.href)
        ) {
          recover();
        }
      },
      true
    );

    window.setTimeout(function () {
      if (window.__WEBTOMIND_APP_MOUNTED__) {
        clearMarker();
      } else {
        recover();
      }
    }, TIMEOUT_MS);
  } catch (err) {
    // The watchdog must never break the page.
  }
})();
`;
