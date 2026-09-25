import { afterEach, expect, it, vi } from 'vitest';
import { loadEditorImageBlob } from '../editor-image-input';

const original = vi.hoisted(() => vi.fn());
vi.mock('@/services/agent-api', () => ({ loadVisualImageHistoryBlob: original }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('decodes local data URLs without a CSP-blocked fetch', async () => {
  const fetch = vi.fn(() => { throw new Error('Blocked by connect-src'); });
  vi.stubGlobal('fetch', fetch);
  const blob = await loadEditorImageBlob('data:image/png;base64,aW1hZ2U=');
  expect(blob.type).toBe('image/png');
  expect(blob.size).toBe(5);
  expect(fetch).not.toHaveBeenCalled();
});

it('returns original bytes without fetching an intermediate blob URL', async () => {
  const blob = new Blob(['original'], { type: 'image/png' });
  original.mockResolvedValue(blob);
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  expect(await loadEditorImageBlob('https://example.test/thumbnail.png', 'generation-id')).toBe(blob);
  expect(original).toHaveBeenCalledWith('generation-id', 'original');
  expect(fetch).not.toHaveBeenCalled();
});

it('does not substitute a thumbnail when the original fails', async () => {
  original.mockRejectedValue(new Error('Original expired'));
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  await expect(loadEditorImageBlob('https://example.test/thumbnail.png', 'generation-id')).rejects.toThrow('Original expired');
  expect(fetch).not.toHaveBeenCalled();
});
