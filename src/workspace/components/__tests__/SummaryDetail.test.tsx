import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, fireEvent, screen } from '@testing-library/react';
import { SummaryDetail } from '../SummaryDetail';
import type { SavedSummary } from '@/services/database';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}));

vi.mock('@/web/contexts/AuthContext', () => ({
  useAuth: () => ({
    getAccessToken: () => ''
  })
}));

vi.mock('@/services/workspace-api', () => ({
  getSummaryById: vi.fn().mockResolvedValue(null)
}));

vi.mock('../ExportImageModal', () => ({
  ExportImageModal: () => null
}));

vi.mock('../ConfirmDialog', () => ({
  ConfirmDialog: () => null
}));

vi.mock('../ShareButton', () => ({
  ShareButton: () => null
}));

function createSummary(markdown: string): SavedSummary {
  return {
    id: 'sum-1',
    title: 'Summary Title',
    url: 'https://example.com/article',
    markdown,
    createdAt: Date.now()
  };
}

describe('SummaryDetail security regression', () => {
  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sanitizes malicious HTML during editor initialization', async () => {
    const summary = createSummary(
      '<div class="text-xl font-bold">Title</div>' +
        '<img src="x" onerror="alert(1)">' +
        '<script>alert(1)</script>' +
        '<a href="javascript:alert(1)">link</a>'
    );

    const { container } = render(
      <SummaryDetail
        summary={summary}
        onBack={() => {}}
        onSelectionChange={() => {}}
      />
    );

    await waitFor(() => {
      const editor = container.querySelector('.editor-content');
      expect(editor).not.toBeNull();
      expect(editor?.querySelector('script')).toBeNull();
    });

    const editor = container.querySelector('.editor-content');
    const img = editor?.querySelector('img');
    if (img) {
      expect(img.getAttribute('onerror')).toBeNull();
    }

    const link = editor?.querySelector('a');
    if (link) {
      expect((link.getAttribute('href') || '').toLowerCase()).not.toContain(
        'javascript:'
      );
    }
  });

  it('sanitizes pasted HTML before inserting into editor', async () => {
    const summary = createSummary('# note\n\ncontent');
    const { container } = render(
      <SummaryDetail
        summary={summary}
        onBack={() => {}}
        onSelectionChange={() => {}}
      />
    );

    const editor = await waitFor(() => {
      const el = container.querySelector(
        '.editor-content'
      ) as HTMLDivElement | null;
      expect(el).not.toBeNull();
      return el as HTMLDivElement;
    });

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);

    fireEvent.paste(editor, {
      clipboardData: {
        getData: (type: string) => {
          if (type === 'text/html') {
            return '<img src="x" onerror="alert(1)"><script>alert(1)</script>';
          }
          if (type === 'text/plain') {
            return '';
          }
          return '';
        }
      }
    });

    expect(editor.querySelector('script')).toBeNull();
    const pastedImg = editor.querySelector('img');
    if (pastedImg) {
      expect(pastedImg.getAttribute('onerror')).toBeNull();
    }
  });

  it('sanitizes title/content before writing export PDF document', async () => {
    const summary = createSummary(
      '# <img src=x onerror=alert(1)>\n\n<script>alert(1)</script>'
    );

    const writeMock = vi.fn();
    const closeMock = vi.fn();
    const focusMock = vi.fn();
    const printMock = vi.fn();

    vi.spyOn(window, 'open').mockReturnValue({
      document: {
        write: writeMock,
        close: closeMock
      },
      focus: focusMock,
      print: printMock,
      onload: null
    } as unknown as Window);

    render(
      <SummaryDetail
        summary={summary}
        onBack={() => {}}
        onSelectionChange={() => {}}
      />
    );

    fireEvent.click(screen.getByTitle('detail.more'));
    fireEvent.mouseEnter(
      screen.getByText('detail.export').closest('div') as Element
    );
    fireEvent.click(await screen.findByText('detail.exportPDF'));

    expect(writeMock).toHaveBeenCalledTimes(1);
    const html = String(writeMock.mock.calls[0][0] || '');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('opens nested copy/export actions by click for touch and keyboard users', async () => {
    const summary = createSummary('# note\n\ncontent');
    render(
      <SummaryDetail
        summary={summary}
        onBack={() => {}}
        onSelectionChange={() => {}}
      />
    );

    fireEvent.click(screen.getByTitle('detail.more'));
    fireEvent.click(screen.getByText('detail.copy'));
    expect(await screen.findByText('detail.copyMarkdown')).toBeInTheDocument();
    expect(screen.getByText('detail.copyText')).toBeInTheDocument();

    fireEvent.click(screen.getByText('detail.export'));
    expect(await screen.findByText('detail.exportPDF')).toBeInTheDocument();
    expect(screen.getByText('detail.exportImage')).toBeInTheDocument();
  });

  it('exposes the top image delete action as an accessible button', async () => {
    const summary = {
      ...createSummary('![generated image](https://example.com/image.png)'),
      contentType: 'image' as const
    };
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <SummaryDetail
        summary={summary}
        onBack={() => {}}
        onSelectionChange={() => {}}
        onSave={onSave}
      />
    );

    fireEvent.click(await screen.findByLabelText('detail.deleteImage'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('sum-1', expect.any(String));
    });
    expect(onSave.mock.calls[0][1]).not.toContain('<img');
  });
});
