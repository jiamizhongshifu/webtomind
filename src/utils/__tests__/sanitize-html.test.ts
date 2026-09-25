import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from '@/utils/sanitize-html';

describe('sanitizeHtml', () => {
  it('strips scripts and inline event handlers', () => {
    const input =
      '<img src="https://example.com/x.png" onerror="alert(1)">' +
      '<script>alert(1)</script>' +
      '<a href="javascript:alert(1)">click</a>';

    const output = sanitizeHtml(input);

    expect(output).not.toContain('<script');
    expect(output).not.toContain('onerror=');
    expect(output).not.toContain('javascript:');
  });
});
