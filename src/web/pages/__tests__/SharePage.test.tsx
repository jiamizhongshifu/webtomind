import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SharePage } from '../SharePage';

const mockFetch = vi.fn();

describe('SharePage XSS regression', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockReset();
  });

  it('sanitizes content_html from the API', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          title: 'Test',
          content_html:
            '<img src="https://example.com/x.png" width="1" height="1" onerror="alert(1)">' +
            '<script>alert(1)</script>' +
            '<a href="javascript:alert(1)">click</a>',
          created_at: new Date().toISOString()
        }
      })
    });

    const { container } = render(
      <MemoryRouter initialEntries={['/s/ABCDEFGH']}>
        <Routes>
          <Route path="/s/:token" element={<SharePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(container.querySelector('script')).toBeNull();
    });

    const img = container.querySelector('img');
    if (img) {
      expect(img.getAttribute('onerror')).toBeNull();
    }

    const anchor = container.querySelector('a');
    if (anchor) {
      const href = anchor.getAttribute('href') || '';
      expect(href).not.toContain('javascript:');
    }
  });

  it('escapes raw markdown fallback content', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          title: 'Test',
          content: '<img src=x width=1 height=1 onerror=alert(1)>',
          created_at: new Date().toISOString()
        }
      })
    });

    const { container } = render(
      <MemoryRouter initialEntries={['/s/ABCDEFGH']}>
        <Routes>
          <Route path="/s/:token" element={<SharePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(container.querySelector('img')).toBeNull();
    });
  });

  it('escapes markdown list item content', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          title: 'Test',
          content: '- <img src=x width=1 height=1 onerror=alert(1)>',
          created_at: new Date().toISOString()
        }
      })
    });

    const { container } = render(
      <MemoryRouter initialEntries={['/s/ABCDEFGH']}>
        <Routes>
          <Route path="/s/:token" element={<SharePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const renderedParagraph = container.querySelector('article p');
      expect(renderedParagraph?.textContent).toContain(
        '<img src=x width=1 height=1 onerror=alert(1)>'
      );
      expect(container.querySelector('article img')).toBeNull();
    });
  });
});
