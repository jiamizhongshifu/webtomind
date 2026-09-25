import { describe, expect, it } from 'vitest';
import {
  ZPAY_USD_TO_CNY_DISPLAY_RATE,
  usdCentsToDisplayedCny
} from '../zpay-pricing';

describe('ZPAY public price display', () => {
  it('mirrors the configured 7.20 conversion rate', () => {
    expect(ZPAY_USD_TO_CNY_DISPLAY_RATE).toBe(7.2);
    expect(usdCentsToDisplayedCny(500)).toBe(36);
    expect(usdCentsToDisplayedCny(1234)).toBe(88.85);
  });
});
