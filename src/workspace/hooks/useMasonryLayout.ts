import { useMemo } from 'react';

export interface MasonryPosition {
  top: number;
  left: number;
  width: number;
}

export interface MasonryLayoutOptions {
  itemCount: number;
  columnCount: number;
  columnWidth: number;
  columnGap: number;
  rowGap: number;
  itemHeights: number[];
  paddingLeft?: number; // 左侧内边距
  paddingTop?: number; // 顶部内边距
  paddingBottom?: number; // 底部内边距
}

export interface MasonryLayoutResult {
  positions: MasonryPosition[];
  containerHeight: number;
}

/**
 * 瀑布流布局计算 Hook
 * 使用"最短列优先"算法，实现按行优先的视觉排序效果
 */
export function useMasonryLayout(
  options: MasonryLayoutOptions
): MasonryLayoutResult {
  const {
    itemCount,
    columnCount,
    columnWidth,
    columnGap,
    rowGap,
    itemHeights,
    paddingLeft = 0,
    paddingTop = 0,
    paddingBottom = 0
  } = options;

  return useMemo(() => {
    if (itemCount === 0 || columnCount === 0) {
      return { positions: [], containerHeight: 0 };
    }

    // 初始化每列的当前高度
    const columnHeights: number[] = new Array(columnCount).fill(0);
    const positions: MasonryPosition[] = [];

    for (let i = 0; i < itemCount; i++) {
      // 找到当前高度最小的列
      let minColumnIndex = 0;
      let minHeight = columnHeights[0];

      for (let col = 1; col < columnCount; col++) {
        if (columnHeights[col] < minHeight) {
          minHeight = columnHeights[col];
          minColumnIndex = col;
        }
      }

      // 计算卡片位置（加入 padding 偏移）
      const left = paddingLeft + minColumnIndex * (columnWidth + columnGap);
      const top = paddingTop + columnHeights[minColumnIndex];

      positions.push({
        top,
        left,
        width: columnWidth
      });

      // 更新该列的高度
      // 使用实际高度，如果没有则使用默认预估高度
      const itemHeight = itemHeights[i] ?? 150; // 默认预估高度 150px
      columnHeights[minColumnIndex] += itemHeight + rowGap;
    }

    // 容器高度为所有列中的最大高度 + 顶部 padding + 底部 padding
    const containerHeight =
      paddingTop + Math.max(...columnHeights) - rowGap + paddingBottom; // 减去最后一个 rowGap

    return { positions, containerHeight: Math.max(0, containerHeight) };
  }, [
    itemCount,
    columnCount,
    columnWidth,
    columnGap,
    rowGap,
    itemHeights,
    paddingLeft,
    paddingTop,
    paddingBottom
  ]);
}
