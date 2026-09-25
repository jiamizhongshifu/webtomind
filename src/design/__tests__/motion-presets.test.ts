import { describe, expect, it } from 'vitest';
import {
  projectGestureEndpoint,
  rubberband
} from '../motion-presets';

describe('sheet motion helpers', () => {
  it('projects a release using the shared deceleration curve', () => {
    expect(projectGestureEndpoint(100, 500)).toBeCloseTo(349.5, 4);
    expect(projectGestureEndpoint(100, -500)).toBeCloseTo(-149.5, 4);
  });

  it('uses a soft boundary for upward overscroll', () => {
    expect(rubberband(-100, 500)).toBeLessThan(0);
    expect(rubberband(-100, 500)).toBeGreaterThan(-100);
    expect(rubberband(100, 500)).toBe(100);
  });
});
