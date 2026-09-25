import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  consumeDiscoveryRecreatePayload,
  createDiscoveryRecreateUrl
} from '../discovery-recreate';

describe('discovery recreate handoff', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('stores the prompt outside the URL and consumes it only once', () => {
    const url = createDiscoveryRecreateUrl('/zh-CN', '  cinematic horse  ');
    const parsed = new URL(url, 'https://webtomind.com');
    const key = parsed.searchParams.get('recreateKey');

    expect(key).toBeTruthy();
    expect(parsed.searchParams.get('prompt')).toBeNull();
    expect(parsed.searchParams.get('newSession')).toBe('1');
    expect(parsed.searchParams.get('autoGenerate')).toBeNull();
    expect(consumeDiscoveryRecreatePayload(key!)).toMatchObject({
      prompt: 'cinematic horse'
    });
    expect(consumeDiscoveryRecreatePayload(key!)).toBeNull();
  });

  it('falls back to a prompt query when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    const url = createDiscoveryRecreateUrl('/en-US', 'editorial portrait');
    const parsed = new URL(url, 'https://webtomind.com');

    expect(parsed.pathname).toBe('/en-US/image');
    expect(parsed.searchParams.get('prompt')).toBe('editorial portrait');
    expect(parsed.searchParams.get('autoGenerate')).toBeNull();
  });
});
