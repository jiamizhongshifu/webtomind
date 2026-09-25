import { describe, expect, it } from 'vitest';
import {
  isBlockedRemoteHostname,
  validateHttpsRemoteUrl
} from '../../api/utils/safe-remote-url';

describe('safe remote URL validation', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '192.168.1.1',
    '172.16.0.1',
    'localhost',
    'service.internal',
    '::1'
  ])('blocks private or local host %s', (host) => {
    expect(isBlockedRemoteHostname(host)).toBe(true);
  });

  it('accepts a public HTTPS URL', () => {
    expect(validateHttpsRemoteUrl('https://cdn.example.com/video.mp4').hostname).toBe('cdn.example.com');
  });

  it('rejects credentials and non-HTTPS URLs', () => {
    expect(() => validateHttpsRemoteUrl('http://example.com/a')).toThrow();
    expect(() => validateHttpsRemoteUrl('https://user:pass@example.com/a')).toThrow();
  });
});
