type ClipboardImageData = Pick<DataTransfer, 'files' | 'items'>;

function getImageFiles(files: ArrayLike<File>): File[] {
  const images: File[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    if (file?.type.startsWith('image/')) images.push(file);
  }
  return images;
}

/**
 * Extracts image files from clipboard data without affecting ordinary text
 * paste. Browsers may expose one clipboard image through both `files` and
 * `items`, sometimes as separate File objects with different metadata. Treat
 * `files` as the canonical representation and only fall back to `items` when
 * the browser does not expose an image there.
 */
export function getClipboardImageFiles(
  clipboardData: ClipboardImageData
): File[] {
  const fileImages = getImageFiles(clipboardData.files);
  if (fileImages.length > 0) return fileImages;

  const itemImages: File[] = [];
  for (let index = 0; index < clipboardData.items.length; index += 1) {
    const item = clipboardData.items[index];
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file?.type.startsWith('image/')) itemImages.push(file);
  }

  return itemImages;
}
