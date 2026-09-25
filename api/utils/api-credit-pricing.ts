export {
  cnyCentsToApiCreditCents,
  getCanonicalApiCreditCents,
  getApiCreditPackageQuote,
  getApiCreditPaymentAmount,
  getApiCreditUsdQuote,
  getCustomApiRechargeUsdBounds,
  getCustomApiCreditQuote,
  MAX_CUSTOM_API_RECHARGE_CNY_CENTS,
  MIN_CUSTOM_API_RECHARGE_CNY_CENTS,
  MIN_CUSTOM_API_RECHARGE_USD_CENTS,
  parseCnyAmountToCents,
  parseWholeUsdAmountToCents,
  usdCentsToCnyCents
} from '../../src/shared/api-credit-pricing';
export type {
  ApiCreditPaymentAmount,
  ApiCreditPaymentProvider,
  ApiCreditQuote
} from '../../src/shared/api-credit-pricing';

/**
 * The payment-side rate is server configuration, never a client-supplied
 * value. Keep the legacy ZPAY variable as the single source of truth for now.
 */
export function getConfiguredApiCreditUsdToCnyRate(): number | null {
  const rate = Number(process.env.ZPAY_USD_TO_CNY_RATE);
  return Number.isFinite(rate) && rate >= 1 && rate <= 20 ? rate : null;
}
