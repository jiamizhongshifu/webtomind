import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImageCreatorUserLibraryPayload } from '@/services/agent-api';
import {
  readOwnedCreatorCache,
  useImageCreatorUserLibrary,
  writeOwnedCreatorCache
} from '../useImageCreatorUserLibrary';

const api = vi.hoisted(() => ({
  token: null as string | null,
  get: vi.fn(),
  save: vi.fn()
}));
vi.mock('@/services/agent-api', () => ({
  getAuthToken: () => api.token,
  getImageCreatorUserLibrary: api.get,
  saveImageCreatorUserLibrary: api.save
}));
const promptKey = 'webtomind:image-creator-prompt-library';
const presetKey = 'webtomind:image-creator-presets';
const empty: ImageCreatorUserLibraryPayload = {
  presets: [],
  promptLibrary: []
};
const adapter = {
  empty,
  read: (owner: string): ImageCreatorUserLibraryPayload => ({
    presets:
      (readOwnedCreatorCache(presetKey, owner) as typeof empty.presets) || [],
    promptLibrary:
      (readOwnedCreatorCache(promptKey, owner) as typeof empty.promptLibrary) ||
      []
  }),
  write: (owner: string, data: ImageCreatorUserLibraryPayload) => {
    writeOwnedCreatorCache(presetKey, owner, data.presets);
    writeOwnedCreatorCache(promptKey, owner, data.promptLibrary);
  },
  merge: (
    local: ImageCreatorUserLibraryPayload,
    remote: ImageCreatorUserLibraryPayload
  ) => ({
    presets: [...local.presets, ...remote.presets],
    promptLibrary: [...local.promptLibrary, ...remote.promptLibrary]
  }),
  toPayload: (data: ImageCreatorUserLibraryPayload) => data
};
function fixture(owner: string): ImageCreatorUserLibraryPayload {
  return {
    presets: [
      {
        id: `${owner}-preset`,
        name: `${owner} preset`,
        selection: {},
        settings: {},
        createdAt: 1
      }
    ],
    promptLibrary: [
      {
        id: `${owner}-prompt`,
        title: `${owner} title`,
        prompt: `${owner} fictional prompt`,
        negativePrompt: '',
        createdAt: 1
      }
    ]
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  localStorage.clear();
  api.token = null;
  api.get.mockReset().mockImplementation(() => new Promise(() => {}));
  api.save.mockReset().mockResolvedValue(empty);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('account-owned creator library', () => {
  it('restores only the current owner after logout, B login and refresh', () => {
    adapter.write('a', fixture('a'));
    adapter.write('b', fixture('b'));
    api.token = 'fictional-a-token';
    const hook = renderHook(
      ({ owner }) => useImageCreatorUserLibrary(owner, adapter),
      { initialProps: { owner: 'a' as string | null } }
    );
    expect(hook.result.current.library).toEqual(fixture('a'));
    const staleSave = hook.result.current.saveLibrary;
    api.token = null;
    hook.rerender({ owner: 'anonymous' });
    expect(hook.result.current.library).toEqual(empty);
    api.token = 'fictional-b-token';
    hook.rerender({ owner: 'b' });
    expect(hook.result.current.library).toEqual(fixture('b'));
    act(() => staleSave(fixture('stale-a')));
    expect(api.save).not.toHaveBeenCalled();
    expect(hook.result.current.library).toEqual(fixture('b'));
    hook.unmount();
    const refreshed = renderHook(() =>
      useImageCreatorUserLibrary('b', adapter)
    );
    expect(refreshed.result.current.library).toEqual(fixture('b'));
  });

  it('keeps anonymous data separate and hides all items until auth resolves', () => {
    adapter.write('anonymous', fixture('guest'));
    const hook = renderHook(
      ({ owner }) => useImageCreatorUserLibrary(owner, adapter),
      { initialProps: { owner: null as string | null } }
    );
    expect(hook.result.current.library).toEqual(empty);
    hook.rerender({ owner: 'anonymous' });
    expect(hook.result.current.library).toEqual(fixture('guest'));
    api.token = 'fictional-a-token';
    hook.rerender({ owner: 'a' });
    expect(hook.result.current.library).toEqual(empty);
    expect(api.save).not.toHaveBeenCalled();
  });

  it('drops legacy unowned caches without copying them into an account', async () => {
    localStorage.setItem(
      promptKey,
      JSON.stringify(fixture('legacy').promptLibrary)
    );
    localStorage.setItem(presetKey, JSON.stringify(fixture('legacy').presets));
    api.token = 'fictional-b-token';
    api.get.mockResolvedValue(fixture('b'));
    const hook = renderHook(() => useImageCreatorUserLibrary('b', adapter));
    expect(hook.result.current.library).toEqual(empty);
    await act(async () => {});
    expect(localStorage.getItem(promptKey)).toBeNull();
    expect(localStorage.getItem(presetKey)).toBeNull();
    expect(api.save).toHaveBeenCalledWith(fixture('b'));
    expect(adapter.read('b')).toEqual(fixture('b'));
  });

  it.each(['anonymous', 'b'])(
    'ignores a late A response after switching to %s',
    async (owner) => {
      const a = deferred<ImageCreatorUserLibraryPayload>();
      api.token = 'fictional-a-token';
      api.get.mockReturnValueOnce(a.promise);
      const hook = renderHook(
        ({ owner }) => useImageCreatorUserLibrary(owner, adapter),
        { initialProps: { owner: 'a' } }
      );
      api.token = owner === 'anonymous' ? null : 'fictional-b-token';
      hook.rerender({ owner });
      await act(async () => a.resolve(fixture('a')));
      expect(hook.result.current.library).toEqual(empty);
      expect(api.save).not.toHaveBeenCalled();
      expect(adapter.read(owner)).toEqual(empty);
    }
  );

  it('ignores a response after the auth client switches, even before React rerenders', async () => {
    const a = deferred<ImageCreatorUserLibraryPayload>();
    api.token = 'fictional-a-token';
    api.get.mockReturnValueOnce(a.promise);
    const hook = renderHook(() => useImageCreatorUserLibrary('a', adapter));
    api.token = 'fictional-b-token';
    await act(async () => a.resolve(fixture('a')));
    expect(hook.result.current.library).toEqual(empty);
    expect(api.save).not.toHaveBeenCalled();
  });

  it('merges only B local and B remote items after a direct A to B switch', async () => {
    adapter.write('a', fixture('a'));
    adapter.write('b', fixture('b-local'));
    api.token = 'fictional-a-token';
    const hook = renderHook(
      ({ owner }) => useImageCreatorUserLibrary(owner, adapter),
      { initialProps: { owner: 'a' } }
    );
    api.token = 'fictional-b-token';
    api.get.mockResolvedValueOnce(fixture('b-remote'));
    hook.rerender({ owner: 'b' });
    await act(async () => {});
    const expected = adapter.merge(fixture('b-local'), fixture('b-remote'));
    expect(hook.result.current.library).toEqual(expected);
    expect(api.save).toHaveBeenCalledWith(expected);
    expect(adapter.read('a')).toEqual(fixture('a'));
  });

  it('persists edits for the current owner and survives a failed remote refresh', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const remote = deferred<ImageCreatorUserLibraryPayload>();
    api.token = 'fictional-a-token';
    api.get.mockReturnValueOnce(remote.promise);
    const hook = renderHook(() => useImageCreatorUserLibrary('a', adapter));
    act(() => hook.result.current.saveLibrary(fixture('a')));
    await act(async () => remote.reject(new Error('mock offline')));
    expect(hook.result.current.library).toEqual(fixture('a'));
    expect(adapter.read('a')).toEqual(fixture('a'));
    expect(api.save).toHaveBeenCalledWith(fixture('a'));
  });

  it('does not apply a late request after unmount', async () => {
    const remote = deferred<ImageCreatorUserLibraryPayload>();
    api.token = 'fictional-a-token';
    api.get.mockReturnValueOnce(remote.promise);
    const hook = renderHook(() => useImageCreatorUserLibrary('a', adapter));
    hook.unmount();
    await act(async () => remote.resolve(fixture('a')));
    expect(api.save).not.toHaveBeenCalled();
  });

  it('treats malformed, mismatched and unavailable storage as an empty cache', () => {
    const key = `${promptKey}:v2:a`;
    localStorage.setItem(key, '{');
    expect(readOwnedCreatorCache(promptKey, 'a')).toBeNull();
    localStorage.setItem(
      key,
      JSON.stringify({ ownerId: 'b', items: fixture('b').promptLibrary })
    );
    expect(readOwnedCreatorCache(promptKey, 'a')).toBeNull();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    expect(readOwnedCreatorCache(promptKey, 'a')).toBeNull();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    expect(() => writeOwnedCreatorCache(promptKey, 'a', [])).not.toThrow();
  });
});
