import type { PromptCase } from '@/services/agent-api';

type PromptDetailBootstrapDocument = Pick<Document, 'getElementById'>;

export function parsePromptDetailBootstrap(
  value: string,
  slug: string,
  locale: 'zh-CN' | 'en-US'
): PromptCase | null {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const id = typeof parsed.id === 'string' ? parsed.id.trim() : '';
    const parsedSlug =
      typeof parsed.slug === 'string' ? parsed.slug.trim() : '';
    if (!id || !parsedSlug || parsedSlug !== slug) return null;

    const imageUrls = Array.isArray(parsed.imageUrls)
      ? parsed.imageUrls.filter(
          (item): item is string => typeof item === 'string' && Boolean(item)
        )
      : [];
    const imageUrl =
      typeof parsed.imageUrl === 'string'
        ? parsed.imageUrl
        : imageUrls[0] || '';

    return {
      id,
      imageUrl,
      imageUrls,
      title: typeof parsed.title === 'string' ? parsed.title : undefined,
      slug: parsedSlug,
      category:
        typeof parsed.category === 'string' ? parsed.category : undefined,
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.filter((item): item is string => typeof item === 'string')
        : [],
      model: typeof parsed.model === 'string' ? parsed.model : undefined,
      locale,
      sourceCaseId:
        typeof parsed.sourceCaseId === 'string'
          ? parsed.sourceCaseId
          : undefined,
      packageSlug:
        typeof parsed.packageSlug === 'string' ? parsed.packageSlug : undefined,
      commercialIntent:
        typeof parsed.commercialIntent === 'string'
          ? parsed.commercialIntent
          : undefined,
      promptPreview:
        typeof parsed.promptPreview === 'string'
          ? parsed.promptPreview
          : undefined,
      memberOnly: parsed.memberOnly === true,
      promptLocked: parsed.promptLocked === true,
      prompt: typeof parsed.prompt === 'string' ? parsed.prompt : ''
    };
  } catch {
    return null;
  }
}

export function readPromptDetailBootstrap(
  documentRef: PromptDetailBootstrapDocument,
  slug: string,
  locale: 'zh-CN' | 'en-US'
): PromptCase | null {
  const value = documentRef.getElementById(
    'webtomind-prompt-bootstrap'
  )?.textContent;
  return value ? parsePromptDetailBootstrap(value, slug, locale) : null;
}
