export type ApiCreditPaymentProvider = 'stripe' | 'alipay';

export const MIN_CUSTOM_API_RECHARGE_CNY_CENTS = 100;
export const MAX_CUSTOM_API_RECHARGE_CNY_CENTS = 1_000_000;
export const MIN_CUSTOM_API_RECHARGE_USD_CENTS = 100;

export interface ApiCreditPaymentAmount {
  amount: number;
  currency: 'usd' | 'cny';
}

export interface ApiCreditQuote {
  catalogAmountCnyCents: number;
  apiCreditCents: number;
  payment: ApiCreditPaymentAmount;
  usdToCnyRate: number;
}

function isValidRate(value: number): boolean {
  return Number.isFinite(value) && value >= 1 && value <= 20;
}

function assertPositiveSafeInteger(value: number, message: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(message);
  }
}

function assertWholeUsdCents(value: number, message: string): void {
  assertPositiveSafeInteger(value, message);
  if (value % 100 !== 0) throw new Error(message);
}

/**
 * Converts a user-entered CNY amount without going through a floating-point
 * yuan value. The checkout API receives fen, so the final amount is exact.
 */
export function parseCnyAmountToCents(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [wholePart, fractionPart = ''] = normalized.split('.');
  const cents = Number(wholePart) * 100 + Number(fractionPart.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Parses a whole-dollar recharge amount into USD cents. */
export function parseWholeUsdAmountToCents(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return null;
  const dollars = Number(normalized);
  if (!Number.isSafeInteger(dollars) || dollars <= 0) return null;
  const cents = dollars * 100;
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Converts USD cents to the exact CNY fen used by the payment provider. */
export function usdCentsToCnyCents(
  usdCents: number,
  usdToCnyRate: number
): number {
  assertPositiveSafeInteger(usdCents, 'Invalid USD recharge amount');
  if (!isValidRate(usdToCnyRate)) {
    throw new Error('Invalid API credit exchange rate');
  }
  const cnyCents = Math.round(usdCents * usdToCnyRate);
  if (!Number.isSafeInteger(cnyCents) || cnyCents <= 0) {
    throw new Error('Invalid CNY recharge amount');
  }
  return cnyCents;
}

/**
 * Returns whole-dollar custom-recharge bounds that stay inside the existing
 * CNY provider limit. The result is always a multiple of 100 cents.
 */
export function getCustomApiRechargeUsdBounds(usdToCnyRate: number): {
  minUsdCents: number;
  maxUsdCents: number;
} {
  if (!isValidRate(usdToCnyRate)) {
    throw new Error('Invalid API credit exchange rate');
  }
  const maxUsdCentsBeforeWholeDollarFloor = Math.floor(
    MAX_CUSTOM_API_RECHARGE_CNY_CENTS / usdToCnyRate
  );
  const maxUsdCents = Math.floor(maxUsdCentsBeforeWholeDollarFloor / 100) * 100;
  if (maxUsdCents < MIN_CUSTOM_API_RECHARGE_USD_CENTS) {
    throw new Error('API credit exchange rate leaves no valid recharge range');
  }
  return {
    minUsdCents: MIN_CUSTOM_API_RECHARGE_USD_CENTS,
    maxUsdCents
  };
}

/** Reads the immutable, canonical USD amount stored on a package record. */
export function getCanonicalApiCreditCents(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const value = (metadata as Record<string, unknown>).api_credit_usd_cents;
  if (typeof value !== 'number' && typeof value !== 'string') {
    return null;
  }
  const cents = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(cents) && cents > 0 && cents % 100 === 0
    ? cents
    : null;
}

/**
 * The API wallet is denominated in USD cents. Flooring is intentional: a
 * customer must never receive more API credit than the CNY amount supports at
 * the configured settlement rate.
 */
export function cnyCentsToApiCreditCents(
  cnyCents: number,
  usdToCnyRate: number
): number {
  assertPositiveSafeInteger(cnyCents, 'Invalid CNY recharge amount');
  if (!isValidRate(usdToCnyRate)) {
    throw new Error('Invalid API credit exchange rate');
  }
  const creditCents = Math.floor(cnyCents / usdToCnyRate);
  if (!Number.isSafeInteger(creditCents) || creditCents <= 0) {
    throw new Error('CNY recharge amount is too small');
  }
  return creditCents;
}

export function getApiCreditPaymentAmount(input: {
  paymentProvider: ApiCreditPaymentProvider;
  catalogAmountCnyCents: number;
  apiCreditCents: number;
}): ApiCreditPaymentAmount {
  assertPositiveSafeInteger(
    input.catalogAmountCnyCents,
    'Invalid API credit package amount'
  );
  assertPositiveSafeInteger(
    input.apiCreditCents,
    'Invalid API credit package amount'
  );

  return input.paymentProvider === 'alipay'
    ? { amount: input.catalogAmountCnyCents, currency: 'cny' }
    : { amount: input.apiCreditCents, currency: 'usd' };
}

/** Quotes a recharge whose canonical balance is an integer USD amount. */
export function getApiCreditUsdQuote(input: {
  paymentProvider: ApiCreditPaymentProvider;
  apiCreditCents: number;
  usdToCnyRate: number;
}): ApiCreditQuote {
  assertWholeUsdCents(input.apiCreditCents, 'Invalid USD API recharge amount');
  const catalogAmountCnyCents = usdCentsToCnyCents(
    input.apiCreditCents,
    input.usdToCnyRate
  );
  return {
    catalogAmountCnyCents,
    apiCreditCents: input.apiCreditCents,
    payment: getApiCreditPaymentAmount({
      paymentProvider: input.paymentProvider,
      catalogAmountCnyCents,
      apiCreditCents: input.apiCreditCents
    }),
    usdToCnyRate: input.usdToCnyRate
  };
}

/**
 * Quotes a fixed package from its CNY catalog amount. `listedCreditCents` is
 * retained as a backwards-compatible fallback for environments that have not
 * configured an exchange rate yet; production checkout is expected to pass a
 * configured rate.
 */
export function getApiCreditPackageQuote(input: {
  paymentProvider: ApiCreditPaymentProvider;
  catalogAmountCnyCents: number;
  listedCreditCents: number;
  canonicalCreditCents?: number | null;
  usdToCnyRate?: number | null;
}): ApiCreditQuote {
  assertPositiveSafeInteger(
    input.catalogAmountCnyCents,
    'Invalid API credit package amount'
  );
  assertPositiveSafeInteger(
    input.listedCreditCents,
    'Invalid API credit package amount'
  );
  if (input.canonicalCreditCents && input.usdToCnyRate) {
    return getApiCreditUsdQuote({
      paymentProvider: input.paymentProvider,
      apiCreditCents: input.canonicalCreditCents,
      usdToCnyRate: input.usdToCnyRate
    });
  }
  const apiCreditCents = input.usdToCnyRate
    ? cnyCentsToApiCreditCents(input.catalogAmountCnyCents, input.usdToCnyRate)
    : input.listedCreditCents;
  const payment = getApiCreditPaymentAmount({
    paymentProvider: input.paymentProvider,
    catalogAmountCnyCents: input.catalogAmountCnyCents,
    apiCreditCents
  });
  return {
    catalogAmountCnyCents: input.catalogAmountCnyCents,
    apiCreditCents,
    payment,
    usdToCnyRate: input.usdToCnyRate || 0
  };
}

export function getCustomApiCreditQuote(input: {
  paymentProvider: ApiCreditPaymentProvider;
  amountUsdCents: number;
  usdToCnyRate: number;
}): ApiCreditQuote {
  const bounds = getCustomApiRechargeUsdBounds(input.usdToCnyRate);
  if (
    !Number.isSafeInteger(input.amountUsdCents) ||
    input.amountUsdCents < bounds.minUsdCents ||
    input.amountUsdCents > bounds.maxUsdCents ||
    input.amountUsdCents % 100 !== 0
  ) {
    throw new Error('Invalid custom API recharge amount');
  }
  return getApiCreditUsdQuote({
    paymentProvider: input.paymentProvider,
    apiCreditCents: input.amountUsdCents,
    usdToCnyRate: input.usdToCnyRate
  });
}
