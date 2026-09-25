import { md5 } from 'js-md5';

export type ZpayParameters = Record<string, string>;

export interface ZpayConfig {
  pid: string;
  key: string;
  usdToCnyRate: number;
  submitUrl: string;
}

const DEFAULT_SUBMIT_URL = 'https://zpayz.cn/submit.php';
const MONEY_PATTERN = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/;

export function hasZpayCheckoutConfig(): boolean {
  return process.env.ZPAY_CHECKOUT_ENABLED === 'true';
}

export function getZpayConfig(): ZpayConfig | null {
  const pid = (process.env.ZPAY_PID || '').trim();
  const key = process.env.ZPAY_KEY || '';
  const usdToCnyRate = Number(process.env.ZPAY_USD_TO_CNY_RATE);
  const submitUrl = (
    process.env.ZPAY_SUBMIT_URL || DEFAULT_SUBMIT_URL
  ).trim();

  if (
    !pid ||
    !key ||
    !Number.isFinite(usdToCnyRate) ||
    usdToCnyRate < 1 ||
    usdToCnyRate > 20
  ) {
    return null;
  }

  try {
    const parsed = new URL(submitUrl);
    if (
      parsed.origin !== 'https://zpayz.cn' ||
      parsed.pathname !== '/submit.php' ||
      parsed.search ||
      parsed.hash ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }
  } catch {
    return null;
  }

  return { pid, key, usdToCnyRate, submitUrl };
}

export function buildZpaySigningPayload(params: ZpayParameters): string {
  return Object.keys(params)
    .filter(
      (key) =>
        key !== 'sign' && key !== 'sign_type' && params[key] !== ''
    )
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
}

export function signZpayParameters(
  params: ZpayParameters,
  key: string
): string {
  return md5(`${buildZpaySigningPayload(params)}${key}`);
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export function verifyZpayParameters(
  params: ZpayParameters,
  key: string
): boolean {
  const suppliedSign = (params.sign || '').toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(suppliedSign)) return false;
  return constantTimeEqual(signZpayParameters(params, key), suppliedSign);
}

export function parseUniqueZpayParameters(
  searchParams: URLSearchParams
): ZpayParameters | null {
  const result: ZpayParameters = {};
  for (const [key, value] of searchParams.entries()) {
    if (Object.prototype.hasOwnProperty.call(result, key)) return null;
    result[key] = value;
  }
  return result;
}

export function usdCentsToCnyCents(
  usdCents: number,
  usdToCnyRate: number
): number {
  if (
    !Number.isInteger(usdCents) ||
    usdCents <= 0 ||
    !Number.isFinite(usdToCnyRate) ||
    usdToCnyRate <= 0
  ) {
    throw new Error('Invalid ZPAY settlement amount');
  }
  const cnyCents = Math.round(usdCents * usdToCnyRate);
  if (!Number.isSafeInteger(cnyCents) || cnyCents <= 0) {
    throw new Error('Invalid ZPAY settlement amount');
  }
  return cnyCents;
}

export function formatCnyCents(cnyCents: number): string {
  if (!Number.isInteger(cnyCents) || cnyCents <= 0) {
    throw new Error('Invalid CNY amount');
  }
  return (cnyCents / 100).toFixed(2);
}

export function parseCnyMoneyToCents(money: string): number | null {
  const match = MONEY_PATTERN.exec(money);
  if (!match) return null;
  const whole = Number(match[1]);
  const fractional = (match[2] || '').padEnd(2, '0');
  const cents = whole * 100 + Number(fractional || 0);
  return Number.isSafeInteger(cents) ? cents : null;
}

export function buildZpayOutTradeNo(orderId: string): string {
  const compact = orderId.replace(/-/g, '').toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(compact)) {
    throw new Error('Invalid payment order id');
  }
  const numericSpace = 10n ** 32n;
  return (BigInt(`0x${compact}`) % numericSpace)
    .toString()
    .padStart(32, '0');
}

export function buildZpayCheckoutFields(input: {
  config: ZpayConfig;
  orderId: string;
  productName: string;
  cnyCents: number;
  notifyUrl: string;
  returnUrl: string;
}): ZpayParameters {
  const fields: ZpayParameters = {
    name: input.productName.slice(0, 100),
    money: formatCnyCents(input.cnyCents),
    type: 'alipay',
    out_trade_no: buildZpayOutTradeNo(input.orderId),
    notify_url: input.notifyUrl,
    pid: input.config.pid,
    param: input.orderId,
    return_url: input.returnUrl,
    sign_type: 'MD5'
  };
  return {
    ...fields,
    sign: signZpayParameters(fields, input.config.key)
  };
}
