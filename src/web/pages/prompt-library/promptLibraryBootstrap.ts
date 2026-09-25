import {
  buildPublicPromptLibraryResult,
  type PromptLibraryQuery,
  type PublicPromptLibraryResult
} from '@/services/agent-api';
import { getPromptLibraryQueryKey } from './usePromptLibraryQuery';

export const PROMPT_LIBRARY_BOOTSTRAP_ELEMENT_ID =
  'webtomind-prompt-library-bootstrap';

export function readPromptLibraryBootstrap(
  documentRef: Pick<Document, 'getElementById'>,
  query: PromptLibraryQuery
): PublicPromptLibraryResult | null {
  const element = documentRef.getElementById(
    PROMPT_LIBRARY_BOOTSTRAP_ELEMENT_ID
  );
  const raw = element?.textContent?.trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result = buildPublicPromptLibraryResult(parsed);
    if (result.items.length === 0) return null;
    if (
      getPromptLibraryQueryKey(result.queryEcho) !==
      getPromptLibraryQueryKey(query)
    ) {
      return null;
    }
    return result;
  } catch {
    return null;
  }
}
