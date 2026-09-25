export const STALE_ASSET_RELOAD_KEY = 'webtomind:stale-asset-reload-v2';
export const STALE_ASSET_RELOAD_COOLDOWN_MS = 30_000;

const STALE_ASSET_ERROR_PATTERNS = [
  'failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'importing a module script failed',
  'unable to preload css'
] as const;

const UNKNOWN_ASSET_PATH = 'unknown';
const RECOVERY_NOTICE_ID = 'webtomind-stale-asset-recovery';

interface StaleAssetReloadMarker {
  assetPath: string;
  requestedAt: number;
}

type RecoveryStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>;

export type StaleAssetRecoveryResult =
  | 'not-stale'
  | 'scheduled'
  | 'already-scheduled'
  | 'blocked';

export interface StaleAssetRecoveryController {
  prepareForCurrentAsset: () => void;
  requestRecovery: (error: unknown) => StaleAssetRecoveryResult;
  isRecoveryScheduled: () => boolean;
}

export interface StaleAssetRecoveryDependencies {
  storage: RecoveryStorage | null;
  getCurrentAssetPath: () => string | null;
  now: () => number;
  showNotice: () => void;
  scheduleReload: (reload: () => void) => void;
  reload: () => void;
}

export function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return `${error.name} ${error.message}`;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
  }

  return '';
}

export function isStaleAssetError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return STALE_ASSET_ERROR_PATTERNS.some((pattern) =>
    message.includes(pattern)
  );
}

function readReloadMarker(
  storage: RecoveryStorage | null
): StaleAssetReloadMarker | null {
  if (!storage) return null;

  try {
    const raw = storage.getItem(STALE_ASSET_RELOAD_KEY);
    if (!raw) return null;

    const marker = JSON.parse(raw) as Partial<StaleAssetReloadMarker>;
    if (
      typeof marker.assetPath !== 'string' ||
      typeof marker.requestedAt !== 'number' ||
      !Number.isFinite(marker.requestedAt)
    ) {
      return null;
    }

    return {
      assetPath: marker.assetPath,
      requestedAt: marker.requestedAt
    };
  } catch {
    return null;
  }
}

function clearReloadMarker(storage: RecoveryStorage | null): void {
  if (!storage) return;
  try {
    storage.removeItem(STALE_ASSET_RELOAD_KEY);
  } catch {
    // Recovery must still work when browser storage is unavailable.
  }
}

function writeReloadMarker(
  storage: RecoveryStorage | null,
  marker: StaleAssetReloadMarker
): void {
  if (!storage) return;
  try {
    storage.setItem(STALE_ASSET_RELOAD_KEY, JSON.stringify(marker));
  } catch {
    // The in-document guard still prevents duplicate reload scheduling.
  }
}

function normalizeAssetPath(assetPath: string | null): string {
  return assetPath || UNKNOWN_ASSET_PATH;
}

function isFreshMarker(
  marker: StaleAssetReloadMarker,
  assetPath: string,
  now: number
): boolean {
  return (
    marker.assetPath === assetPath &&
    now - marker.requestedAt >= 0 &&
    now - marker.requestedAt < STALE_ASSET_RELOAD_COOLDOWN_MS
  );
}

export function createStaleAssetRecoveryController(
  dependencies: StaleAssetRecoveryDependencies
): StaleAssetRecoveryController {
  let recoveryScheduledInDocument = false;

  const prepareForCurrentAsset = () => {
    const marker = readReloadMarker(dependencies.storage);
    if (!marker) return;

    const assetPath = normalizeAssetPath(dependencies.getCurrentAssetPath());
    if (!isFreshMarker(marker, assetPath, dependencies.now())) {
      clearReloadMarker(dependencies.storage);
    }
  };

  const requestRecovery = (error: unknown): StaleAssetRecoveryResult => {
    if (!isStaleAssetError(error)) {
      return 'not-stale';
    }

    if (recoveryScheduledInDocument) {
      return 'already-scheduled';
    }

    const now = dependencies.now();
    const assetPath = normalizeAssetPath(dependencies.getCurrentAssetPath());
    const marker = readReloadMarker(dependencies.storage);

    if (marker && isFreshMarker(marker, assetPath, now)) {
      return 'blocked';
    }

    recoveryScheduledInDocument = true;
    writeReloadMarker(dependencies.storage, {
      assetPath,
      requestedAt: now
    });
    try {
      dependencies.showNotice();
    } catch {
      // A presentation failure must never block the actual recovery reload.
    }
    dependencies.scheduleReload(dependencies.reload);
    return 'scheduled';
  };

  return {
    prepareForCurrentAsset,
    requestRecovery,
    isRecoveryScheduled: () => recoveryScheduledInDocument
  };
}

function getCurrentIndexAssetPath(documentRef: Document): string | null {
  const script = Array.from(documentRef.scripts).find((candidate) =>
    /\/assets\/index\.[^/]+\.js(?:\?|$)/.test(candidate.src)
  );
  if (!script?.src) return null;

  try {
    return new URL(script.src, documentRef.baseURI).pathname;
  } catch {
    return script.src;
  }
}

function appendRecoveryNotice(documentRef: Document): void {
  if (documentRef.getElementById(RECOVERY_NOTICE_ID)) return;

  const isEnglish = window.location.pathname.startsWith('/en-US');
  const notice = documentRef.createElement('main');
  notice.id = RECOVERY_NOTICE_ID;
  notice.className = 'web-app-stale-recovery';
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  notice.setAttribute('aria-busy', 'true');

  const panel = documentRef.createElement('div');
  panel.className = 'web-app-stale-recovery__panel';

  const spinner = documentRef.createElement('span');
  spinner.className = 'web-app-stale-recovery__spinner';
  spinner.setAttribute('aria-hidden', 'true');

  const title = documentRef.createElement('strong');
  title.textContent = isEnglish ? 'Updating WebToMind' : '正在更新 WebToMind';

  const description = documentRef.createElement('p');
  description.textContent = isEnglish
    ? 'A new version is ready. The page will continue automatically.'
    : '新版本已就绪，页面将自动继续。';

  panel.append(spinner, title, description);
  notice.append(panel);
  documentRef.body.append(notice);
  documentRef.documentElement.dataset.staleAssetRecovery = 'true';
}

let browserController: StaleAssetRecoveryController | null = null;
let removeBrowserListeners: (() => void) | null = null;

function getBrowserController(): StaleAssetRecoveryController | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }
  if (browserController) return browserController;

  let storage: RecoveryStorage | null = null;
  try {
    storage = window.sessionStorage;
  } catch {
    // Storage can be denied in private or restricted browsing contexts.
  }

  browserController = createStaleAssetRecoveryController({
    storage,
    getCurrentAssetPath: () => getCurrentIndexAssetPath(document),
    now: () => Date.now(),
    showNotice: () => appendRecoveryNotice(document),
    scheduleReload: (reload) => {
      window.setTimeout(reload, 0);
    },
    reload: () => window.location.reload()
  });
  return browserController;
}

export function requestStaleAssetRecovery(
  error: unknown
): StaleAssetRecoveryResult {
  return getBrowserController()?.requestRecovery(error) || 'not-stale';
}

export function isStaleAssetRecoveryPending(): boolean {
  return getBrowserController()?.isRecoveryScheduled() === true;
}

function shouldPreventDefault(result: StaleAssetRecoveryResult): boolean {
  return result === 'scheduled' || result === 'already-scheduled';
}

export function installStaleAssetRecovery(): () => void {
  if (removeBrowserListeners) return removeBrowserListeners;
  const controller = getBrowserController();
  if (!controller || typeof window === 'undefined') {
    return () => undefined;
  }

  controller.prepareForCurrentAsset();

  const handlePreloadError = (event: Event) => {
    const preloadEvent = event as Event & { payload?: unknown };
    const result = controller.requestRecovery(preloadEvent.payload);
    if (shouldPreventDefault(result)) {
      event.preventDefault();
    }
  };

  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const result = controller.requestRecovery(event.reason);
    if (shouldPreventDefault(result)) {
      event.preventDefault();
    }
  };

  window.addEventListener('vite:preloadError', handlePreloadError);
  window.addEventListener('unhandledrejection', handleUnhandledRejection);

  removeBrowserListeners = () => {
    window.removeEventListener('vite:preloadError', handlePreloadError);
    window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    removeBrowserListeners = null;
  };
  return removeBrowserListeners;
}
