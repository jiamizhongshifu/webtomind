export type MasonryColumnOptions = {
  minColumnWidth: number;
  gap?: number;
  minColumns?: number;
  maxColumns?: number;
};

export function getResponsiveMasonryColumnCount(
  width: number,
  {
    minColumnWidth,
    gap = 16,
    minColumns = 1,
    maxColumns = 6
  }: MasonryColumnOptions
): number {
  if (!Number.isFinite(width) || width <= 0) return minColumns;
  const estimated = Math.floor((width + gap) / (minColumnWidth + gap));
  return Math.max(minColumns, Math.min(maxColumns, Math.max(1, estimated)));
}

export function cssAspectRatioToHeightWeight(value: string): number {
  const normalized = value.trim();
  const match = normalized.match(
    /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/
  );
  if (!match) return 1;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width <= 0 || height <= 0) return 1;
  return height / width;
}

export function splitMasonryColumns<T>(
  items: T[],
  columnCount: number,
  getItemHeightWeight: (item: T, index: number) => number = () => 1
): T[][] {
  if (items.length === 0) return [];
  const normalizedColumnCount = Math.max(
    1,
    Math.min(items.length, Math.floor(columnCount) || 1)
  );
  const columns = Array.from({ length: normalizedColumnCount }, () => [] as T[]);
  const columnHeights = Array.from({ length: normalizedColumnCount }, () => 0);

  items.forEach((item, index) => {
    let targetColumnIndex = 0;
    for (
      let columnIndex = 1;
      columnIndex < columnHeights.length;
      columnIndex += 1
    ) {
      if (columnHeights[columnIndex] < columnHeights[targetColumnIndex]) {
        targetColumnIndex = columnIndex;
      }
    }

    columns[targetColumnIndex].push(item);
    const itemWeight = getItemHeightWeight(item, index);
    columnHeights[targetColumnIndex] +=
      Number.isFinite(itemWeight) && itemWeight > 0 ? itemWeight : 1;
  });

  return columns;
}
