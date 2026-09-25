import { useState, useRef, useCallback } from 'react';

export const WORKSPACE_GRID_BASELINE = 8;
export const LEFT_PANEL_MIN_WIDTH = 320;
export const STUDIO_PANEL_MIN_WIDTH = 224;
export const STUDIO_PANEL_MAX_WIDTH = 960;
export const CENTER_PANEL_MIN_WIDTH_TWO_COLUMNS = 620;
export const CENTER_PANEL_MIN_WIDTH_THREE_COLUMNS = 424;
export const LEFT_PANEL_MAX_RATIO = 0.42;
export const LEFT_PANEL_MAX_RATIO_TWO_COLUMNS = 0.34;
export const STUDIO_PANEL_MAX_RATIO = 0.35;
export const XL_BREAKPOINT = 1280;
export const SINGLE_RESIZER_WIDTH = 12;
export const DOUBLE_RESIZER_WIDTH = 24;
export const COLUMN_LAYOUT_STORAGE_KEY = 'workspace:column-layout:v3';
export const DEFAULT_LEFT_RATIO = 0.25;
export const DEFAULT_STUDIO_RATIO = 0.2;

export interface SavedColumnLayout {
  manual: boolean;
  leftRatio: number;
  studioRatio: number;
}

export function clampWidth(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function snapWidthToGrid(
  value: number,
  baseline = WORKSPACE_GRID_BASELINE
): number {
  return Math.round(value / baseline) * baseline;
}

export function clampGridWidth(
  value: number,
  min: number,
  max: number
): number {
  const snappedMin =
    Math.ceil(min / WORKSPACE_GRID_BASELINE) * WORKSPACE_GRID_BASELINE;
  const snappedMax = Math.max(
    snappedMin,
    Math.floor(max / WORKSPACE_GRID_BASELINE) * WORKSPACE_GRID_BASELINE
  );
  return clampWidth(snapWidthToGrid(value), snappedMin, snappedMax);
}

export function readSavedColumnLayout(): SavedColumnLayout | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(COLUMN_LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedColumnLayout>;

    if (
      parsed.manual !== true ||
      typeof parsed.leftRatio !== 'number' ||
      typeof parsed.studioRatio !== 'number'
    ) {
      return null;
    }

    return {
      manual: true,
      leftRatio: clampWidth(parsed.leftRatio, 0.2, 0.45),
      studioRatio: clampWidth(parsed.studioRatio, 0.18, STUDIO_PANEL_MAX_RATIO)
    };
  } catch {
    return null;
  }
}

export function getDefaultTripleColumnWidths(containerWidth: number): {
  left: number;
  studio: number;
} {
  const available = containerWidth - DOUBLE_RESIZER_WIDTH;
  const idealLeftWidth = Math.floor(available * DEFAULT_LEFT_RATIO);
  const idealStudioWidth = Math.floor(available * DEFAULT_STUDIO_RATIO);

  let left = clampGridWidth(
    idealLeftWidth,
    LEFT_PANEL_MIN_WIDTH,
    Math.floor(containerWidth * LEFT_PANEL_MAX_RATIO)
  );
  let studio = clampGridWidth(
    idealStudioWidth,
    STUDIO_PANEL_MIN_WIDTH,
    Math.min(
      STUDIO_PANEL_MAX_WIDTH,
      Math.floor(containerWidth * STUDIO_PANEL_MAX_RATIO)
    )
  );

  const center = containerWidth - left - studio - DOUBLE_RESIZER_WIDTH;
  if (center < CENTER_PANEL_MIN_WIDTH_THREE_COLUMNS) {
    let deficit = CENTER_PANEL_MIN_WIDTH_THREE_COLUMNS - center;

    const leftReducible = Math.max(0, left - LEFT_PANEL_MIN_WIDTH);
    const reduceLeft = Math.min(leftReducible, deficit);
    left -= reduceLeft;
    deficit -= reduceLeft;

    if (deficit > 0) {
      const studioReducible = Math.max(0, studio - STUDIO_PANEL_MIN_WIDTH);
      const reduceStudio = Math.min(studioReducible, deficit);
      studio -= reduceStudio;
      deficit -= reduceStudio;
    }

    if (deficit > 0) {
      left = LEFT_PANEL_MIN_WIDTH;
      studio = STUDIO_PANEL_MIN_WIDTH;
    }
  }

  return { left, studio };
}

export function useColumnLayout() {
  const initialColumnLayout = readSavedColumnLayout();

  const [sidebarWidth, setSidebarWidth] = useState(460);
  const [studioWidth, setStudioWidth] = useState(260);
  const [hasManualColumnResize, setHasManualColumnResize] = useState(
    initialColumnLayout?.manual === true
  );

  const manualLeftRatioRef = useRef(
    initialColumnLayout?.leftRatio ?? DEFAULT_LEFT_RATIO
  );
  const manualStudioRatioRef = useRef(
    initialColumnLayout?.studioRatio ?? DEFAULT_STUDIO_RATIO
  );

  const [isDragging, setIsDragging] = useState(false);
  const [dragTarget, setDragTarget] = useState<'left' | 'studio' | null>(null);

  const saveLayoutState = useCallback(
    (manual: boolean, leftRatio: number, studioRatio: number) => {
      try {
        localStorage.setItem(
          COLUMN_LAYOUT_STORAGE_KEY,
          JSON.stringify({
            manual,
            leftRatio,
            studioRatio
          })
        );
      } catch {
        // Ignore
      }
    },
    []
  );

  return {
    sidebarWidth,
    setSidebarWidth,
    studioWidth,
    setStudioWidth,
    hasManualColumnResize,
    setHasManualColumnResize,
    manualLeftRatioRef,
    manualStudioRatioRef,
    isDragging,
    setIsDragging,
    dragTarget,
    setDragTarget,
    saveLayoutState,
    initialColumnLayout
  };
}
