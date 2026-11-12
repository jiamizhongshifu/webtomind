import { afterEach, expect, it, vi } from 'vitest';
import { ConfigManager } from '../config';

afterEach(() => {
  ConfigManager.invalidateCache();
  vi.unstubAllGlobals();
});

it('immediately reads defaults after resetting a cached configuration', async () => {
  let saved: Record<string, unknown> = {
    'ai-mind-mapper-config': { cacheTTL: 123, gemini: { temperature: 0.1 } }
  };
  vi.stubGlobal('chrome', { storage: { sync: {
    get: vi.fn(async () => saved),
    remove: vi.fn(async () => { saved = {}; })
  } } });
  expect((await ConfigManager.getConfig()).cacheTTL).toBe(123);
  await ConfigManager.resetConfig();
  expect((await ConfigManager.getConfig()).cacheTTL).toBe(7 * 24 * 60 * 60);
  expect((await ConfigManager.getConfig()).gemini?.temperature).toBe(0.7);
});
