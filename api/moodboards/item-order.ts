export function isCompleteMoodboardItemOrder(
  submittedIds: string[],
  currentIds: string[]
): boolean {
  const uniqueSubmittedIds = new Set(submittedIds);
  return (
    uniqueSubmittedIds.size === submittedIds.length &&
    submittedIds.length === currentIds.length &&
    currentIds.every((itemId) => uniqueSubmittedIds.has(itemId))
  );
}
