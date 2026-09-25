export function shouldAutoLoadPromptCases(params: {
  hasUserScrolled: boolean;
  scrollOffset?: number;
  sentinelTop: number;
  viewportHeight: number;
  margin: number;
}): boolean {
  return (
    (params.hasUserScrolled || Math.max(0, params.scrollOffset || 0) > 0) &&
    params.sentinelTop <= params.viewportHeight + params.margin
  );
}
