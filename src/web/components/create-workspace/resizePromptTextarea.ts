interface PromptTextareaHeightFallbacks {
  minHeight: number;
  maxHeight: number;
}

function parseComputedPixels(value: string, fallback: number) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function resizePromptTextarea(
  textarea: HTMLTextAreaElement,
  fallbacks: PromptTextareaHeightFallbacks
) {
  const computedStyle = window.getComputedStyle(textarea);
  const minHeight = parseComputedPixels(
    computedStyle.minHeight,
    fallbacks.minHeight
  );
  const maxHeight = Math.max(
    minHeight,
    parseComputedPixels(computedStyle.maxHeight, fallbacks.maxHeight)
  );

  textarea.style.height = '0px';
  textarea.style.height = `${Math.min(
    Math.max(textarea.scrollHeight, minHeight),
    maxHeight
  )}px`;
  textarea.style.overflowY =
    textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
}
