/**
 * Public display rate mirrored by the ZPAY checkout configuration.
 * The server remains authoritative and signs the final CNY amount.
 */
export const ZPAY_USD_TO_CNY_DISPLAY_RATE = 7.2;

export function usdCentsToDisplayedCny(
  usdCents: number,
  rate = ZPAY_USD_TO_CNY_DISPLAY_RATE
): number {
  return Math.round(usdCents * rate) / 100;
}
