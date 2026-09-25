export const motionPresets = {
  press: {
    duration: 0.1,
    scale: 0.98
  },
  uiSpring: {
    type: 'spring' as const,
    duration: 0.36,
    bounce: 0
  },
  sheetSpring: {
    type: 'spring' as const,
    duration: 0.34,
    bounce: 0.18
  },
  reduced: {
    duration: 0.16
  }
} as const;

export const SHEET_DECELERATION_RATE = 0.998;
export const SHEET_DRAG_THRESHOLD_PX = 10;
export const SHEET_RUBBERBAND_CONSTANT = 0.55;

export function projectGestureEndpoint(
  current: number,
  velocity: number,
  decelerationRate = SHEET_DECELERATION_RATE
): number {
  return (
    current +
    (velocity / 1000) *
      (decelerationRate / Math.max(0.0001, 1 - decelerationRate))
  );
}

export function rubberband(
  overshoot: number,
  dimension: number,
  constant = SHEET_RUBBERBAND_CONSTANT
): number {
  if (dimension <= 0) return 0;
  if (overshoot >= 0) return overshoot;
  return (
    (overshoot * dimension * constant) /
    (dimension + constant * Math.abs(overshoot))
  );
}
