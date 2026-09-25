import { describe, expect, it, vi } from 'vitest';
import {
  STALE_ASSET_RELOAD_COOLDOWN_MS,
  STALE_ASSET_RELOAD_KEY,
  createStaleAssetRecoveryController,
  isStaleAssetError
} from '../stale-asset-recovery';

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) || null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function createHarness({
  storage = new MemoryStorage(),
  assetPath = '/assets/index.old.js',
  now = 1_000
}: {
  storage?: MemoryStorage;
  assetPath?: string;
  now?: number;
} = {}) {
  const showNotice = vi.fn();
  const reload = vi.fn();
  const scheduleReload = vi.fn((callback: () => void) => callback());
  const controller = createStaleAssetRecoveryController({
    storage,
    getCurrentAssetPath: () => assetPath,
    now: () => now,
    showNotice,
    scheduleReload,
    reload
  });

  return {
    controller,
    storage,
    showNotice,
    scheduleReload,
    reload
  };
}

describe('stale asset recovery', () => {
  it.each([
    'Failed to fetch dynamically imported module: /assets/Page.old.js',
    'Error loading dynamically imported module',
    'Importing a module script failed',
    'Unable to preload CSS for /assets/Page.old.css'
  ])('recognizes stale asset failures: %s', (message) => {
    expect(isStaleAssetError(new Error(message))).toBe(true);
  });

  it('ignores unrelated runtime errors', () => {
    expect(isStaleAssetError(new Error('API request returned 500'))).toBe(
      false
    );
  });

  it('shows the neutral notice and schedules one reload', () => {
    const harness = createHarness();
    const error = new Error(
      'Failed to fetch dynamically imported module: /assets/Page.old.js'
    );

    expect(harness.controller.requestRecovery(error)).toBe('scheduled');
    expect(harness.controller.isRecoveryScheduled()).toBe(true);
    expect(harness.showNotice).toHaveBeenCalledTimes(1);
    expect(harness.scheduleReload).toHaveBeenCalledTimes(1);
    expect(harness.reload).toHaveBeenCalledTimes(1);
    expect(harness.controller.requestRecovery(error)).toBe(
      'already-scheduled'
    );
    expect(harness.reload).toHaveBeenCalledTimes(1);
  });

  it('blocks an immediate reload loop for the same entry asset', () => {
    const storage = new MemoryStorage();
    const first = createHarness({ storage });
    const error = new Error('Error loading dynamically imported module');
    expect(first.controller.requestRecovery(error)).toBe('scheduled');

    const reloadedDocument = createHarness({ storage, now: 2_000 });
    reloadedDocument.controller.prepareForCurrentAsset();
    expect(reloadedDocument.controller.requestRecovery(error)).toBe('blocked');
    expect(reloadedDocument.reload).not.toHaveBeenCalled();
  });

  it('clears the loop guard when the entry asset version changes', () => {
    const storage = new MemoryStorage();
    const first = createHarness({ storage });
    const error = new Error('Importing a module script failed');
    expect(first.controller.requestRecovery(error)).toBe('scheduled');

    const newVersion = createHarness({
      storage,
      assetPath: '/assets/index.new.js',
      now: 2_000
    });
    newVersion.controller.prepareForCurrentAsset();

    expect(storage.getItem(STALE_ASSET_RELOAD_KEY)).toBeNull();
    expect(newVersion.controller.requestRecovery(error)).toBe('scheduled');
    expect(newVersion.reload).toHaveBeenCalledTimes(1);
  });

  it('allows retry after the same-version cooldown expires', () => {
    const storage = new MemoryStorage();
    const first = createHarness({ storage });
    const error = new Error('Unable to preload CSS');
    expect(first.controller.requestRecovery(error)).toBe('scheduled');

    const afterCooldown = createHarness({
      storage,
      now: 1_000 + STALE_ASSET_RELOAD_COOLDOWN_MS
    });
    afterCooldown.controller.prepareForCurrentAsset();
    expect(afterCooldown.controller.requestRecovery(error)).toBe('scheduled');
  });
});
