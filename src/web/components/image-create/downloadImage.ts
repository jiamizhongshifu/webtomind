export function triggerImageDownload(url: string, filename: string): void {
  if (!url) return;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.referrerPolicy = 'no-referrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
