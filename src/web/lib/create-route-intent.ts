const CREATE_QUERY_INTENT_KEYS = [
  'caseId',
  'prompt',
  'source',
  'model',
  'imageSize',
  'quality',
  'openCharacters',
  'openGalleryReferences'
] as const;

const CREATE_STATE_INTENT_KEYS = [
  'remixSource',
  'visualRecipeSelection',
  'openAssetSlot',
  'workflowPrompt',
  'promptCasePrompt',
  'referenceImageIds',
  'characterCardIds',
  'characterReferenceGroups',
  'imageSize',
  'model',
  'quality',
  'outputFormat',
  'aspectRatio',
  'styleGrid'
] as const;

export function hasImageCreateRouteIntent({
  search,
  state
}: {
  search: string;
  state: unknown;
}): boolean {
  const params = new URLSearchParams(search);
  if (CREATE_QUERY_INTENT_KEYS.some((key) => params.has(key))) return true;
  if (!state || typeof state !== 'object') return false;
  return CREATE_STATE_INTENT_KEYS.some((key) => key in state);
}
