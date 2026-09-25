import { describe, expect, it } from 'vitest';
import { getClipboardImageFiles } from '../clipboardImagePaste';

function clipboardData({
  items = [],
  files = []
}: {
  items?: Array<Partial<DataTransferItem>>;
  files?: File[];
}) {
  return {
    items: items as unknown as DataTransferItemList,
    files: files as unknown as FileList
  };
}

describe('getClipboardImageFiles', () => {
  it('uses files as the canonical representation when items expose the same image', () => {
    const itemImage = new File(['image'], 'reference.png', {
      type: 'image/png',
      lastModified: 1
    });
    const fileImage = new File(['image'], 'reference.png', {
      type: 'image/png',
      lastModified: 2
    });

    expect(
      getClipboardImageFiles(
        clipboardData({
          items: [
            { kind: 'string', type: 'text/plain' },
            { kind: 'file', type: 'image/png', getAsFile: () => itemImage }
          ],
          files: [fileImage]
        })
      )
    ).toEqual([fileImage]);
  });

  it('falls back to clipboard items when files contains no image', () => {
    const image = new File(['image'], 'reference.png', {
      type: 'image/png'
    });

    expect(
      getClipboardImageFiles(
        clipboardData({
          items: [
            { kind: 'file', type: 'image/png', getAsFile: () => image }
          ]
        })
      )
    ).toEqual([image]);
  });

  it('preserves multiple intentional images from the canonical file list', () => {
    const first = new File(['first'], 'first.png', { type: 'image/png' });
    const second = new File(['second'], 'second.webp', {
      type: 'image/webp'
    });

    expect(
      getClipboardImageFiles(
        clipboardData({
          items: [
            { kind: 'file', type: 'image/png', getAsFile: () => first },
            { kind: 'file', type: 'image/webp', getAsFile: () => second }
          ],
          files: [first, second]
        })
      )
    ).toEqual([first, second]);
  });

  it('ignores text and non-image files so ordinary paste remains untouched', () => {
    const textFile = new File(['notes'], 'notes.txt', { type: 'text/plain' });

    expect(
      getClipboardImageFiles(
        clipboardData({
          items: [
            { kind: 'string', type: 'text/plain' },
            { kind: 'file', type: 'text/plain', getAsFile: () => textFile },
            { kind: 'file', type: 'image/png', getAsFile: () => null }
          ],
          files: [textFile]
        })
      )
    ).toEqual([]);
  });
});
