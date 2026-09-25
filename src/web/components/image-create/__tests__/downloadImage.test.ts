import { describe, expect, it, vi } from 'vitest';
import { triggerImageDownload } from '../downloadImage';

describe('triggerImageDownload', () => {
  it('keeps cross-origin download fallbacks out of the current tab', () => {
    const click = vi.fn();
    const remove = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const createdAnchors: HTMLAnchorElement[] = [];

    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tagName) => {
        const element = originalCreateElement(tagName);
        if (tagName === 'a') {
          createdAnchors.push(element as HTMLAnchorElement);
          element.click = click;
          element.remove = remove;
        }
        return element;
      });

    triggerImageDownload('https://cdn.example.com/original.png', 'image-file');

    const [link] = createdAnchors;
    if (!link) throw new Error('Expected a download link to be created');
    expect(link.href).toBe('https://cdn.example.com/original.png');
    expect(link.download).toBe('image-file');
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');
    expect(link.referrerPolicy).toBe('no-referrer');
    expect(click).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);

    createElementSpy.mockRestore();
  });
});
