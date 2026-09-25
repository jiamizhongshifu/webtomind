import { describe, expect, it, vi } from 'vitest';
import {
  fetchModelWithTimeout,
  ModelRequestTimeoutError,
  readResponseArrayBufferWithLimit
} from '../../api/utils/model-fetch';

describe('model fetch hardening', () => {
  it('aborts a stalled provider request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_input, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError'))
          );
        })
      )
    );
    await expect(
      fetchModelWithTimeout('https://provider.test', {}, { timeoutMs: 100, label: 'provider' })
    ).rejects.toBeInstanceOf(ModelRequestTimeoutError);
  });

  it('rejects oversized streamed downloads', async () => {
    const response = new Response(new Uint8Array(12), {
      headers: { 'content-type': 'video/mp4' }
    });
    await expect(readResponseArrayBufferWithLimit(response, 8)).rejects.toThrow(
      'exceeds 8 bytes'
    );
  });
});
