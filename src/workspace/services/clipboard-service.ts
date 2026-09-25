export async function writeClipboardHtml(html: string, plainText: string) {
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    'write' in navigator.clipboard &&
    typeof ClipboardItem !== 'undefined'
  ) {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plainText], { type: 'text/plain' })
      })
    ]);
    return;
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(plainText);
    return;
  }

  throw new Error('Clipboard API 不可用');
}
