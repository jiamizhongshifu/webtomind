import type { PromptReferenceMention } from './PromptCompilerPanel';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function removeAndReindexPromptReferenceMention(
  prompt: string,
  mentions: PromptReferenceMention[],
  removed: PromptReferenceMention
) {
  let nextPrompt = prompt;
  const placeholders = new Map<string, string>();
  mentions.forEach((mention, index) => {
    const placeholder = `__WEBTOMIND_REFERENCE_${index}__`;
    const pattern = new RegExp(
      `@${escapeRegExp(mention.token)}(?=$|\\s|[,.!?;:，。！？；：、)])`,
      'gi'
    );
    nextPrompt = nextPrompt.replace(pattern, placeholder);
    placeholders.set(`${mention.kind}:${mention.id}`, placeholder);
  });

  let imageIndex = 0;
  let characterIndex = 0;
  mentions.forEach((mention) => {
    const placeholder = placeholders.get(`${mention.kind}:${mention.id}`);
    if (!placeholder) return;
    if (mention.kind === removed.kind && mention.id === removed.id) {
      nextPrompt = nextPrompt.split(placeholder).join('');
      return;
    }
    const token =
      mention.kind === 'character'
        ? `character${++characterIndex}`
        : `image${++imageIndex}`;
    nextPrompt = nextPrompt.split(placeholder).join(`@${token}`);
  });
  return nextPrompt.replace(/[ \t]{2,}/g, ' ').trim();
}
