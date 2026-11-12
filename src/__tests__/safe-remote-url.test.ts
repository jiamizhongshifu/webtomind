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

  it.each([
    'https://localhost./private',
    'https://service.internal./private',
    'https://[::ffff:127.0.0.1]/private',
    'https://[::ffff:a00:1]/private',
    'https://[fe90::1]/private',
    'https://[febf::1]/private'
  ])('rejects alternate local-address spelling %s', (url) => {
    expect(() => validateHttpsRemoteUrl(url)).toThrow('Untrusted remote URL');
  });

  it('continues to allow public IPv6 addresses', () => {
    expect(validateHttpsRemoteUrl('https://[2606:4700:4700::1111]/').hostname)
      .toBe('[2606:4700:4700::1111]');
  });
});
