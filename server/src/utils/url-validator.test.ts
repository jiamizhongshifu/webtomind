import { describe, expect, it } from 'vitest';
import { validateURL, validateURLSync } from './url-validator';

describe('URL extractor local address guard', () => {
  it.each([
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://localhost./',
    'http://metadata.google.internal./',
    'http://printer.local/',
    'https://user:password@example.com/'
  ])('rejects %s before resolving or fetching', async (url) => {
    expect(validateURLSync(url).valid).toBe(false);
    expect((await validateURL(url)).valid).toBe(false);
  });

  it('keeps ordinary public HTTP and HTTPS URLs valid', () => {
    expect(validateURLSync('https://example.com/article').valid).toBe(true);
    expect(validateURLSync('http://example.com/article').valid).toBe(true);
  });
});
