import { getApiBaseUrl } from '@/utils/env';
import { getAccessToken } from './workspace-api';

const API_BASE = getApiBaseUrl();

export type ApiMarketplaceModel = {
  id: string;
  name: string;
  /** Upstream release timestamp (ISO). Null when the feed omits it. */
  createdAt?: string | null;
  description: string;
  tags: string[];
  pricingMode: 'token' | 'request';
  customer: {
    modelRatio: number | null;
    completionRatio: number | null;
    modelPrice: number | null;
    currency: string;
  };
  provider?: string | null;
  groups?: string[];
  pricing?: {
    inputPerMillion: number | null;
    outputPerMillion: number | null;
    requestPrice: number | null;
    unit: 'tokens_1m' | 'request';
  };
  endpoints: string[];
  status?: {
    label: string;
    color: string | null;
    errorRate: number | null;
    checkedAt: string | null;
    totalCount?: number | null;
    errorCount?: number | null;
    avgResponseTimeMs?: number | null;
  };
};

export type ApiKey = {
  id: string;
  name: string;
  key_prefix: string;
  status: 'active' | 'disabled' | 'revoked';
  /** @deprecated Keys share the account wallet; retained for old API payloads. */
  balance_cents?: number;
  total_spent_cents: number;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
};

export type ApiWallet = {
  user_id: string;
  balance_cents: number;
  total_deposited_cents: number;
  updated_at: string | null;
};

export type ApiWalletTransaction = {
  id: string;
  type: string;
  amount_cents: number;
  balance_after_cents: number;
  source: string;
  metadata?: Record<string, unknown>;
  created_at: string;
};

export type ApiCreditPackage = {
  id: string;
  name: string;
  price_cents: number;
  credit_cents: number;
  metadata?: Record<string, unknown>;
  sort_order: number;
  is_active: boolean;
};

export type ApiCreditPricing = {
  usdToCnyRate: number | null;
  customAvailable: boolean;
  customMinUsdCents: number;
  customMaxUsdCents: number;
};

export type ApiUsageLog = {
  id: string;
  key_id: string | null;
  request_id: string;
  status: 'reserved' | 'succeeded' | 'failed';
  model: string;
  endpoint: string;
  reserved_cents: number;
  actual_customer_cents: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  settled_at: string | null;
  created_at: string;
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!response.ok) {
    let message = 'API request failed';
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === 'string') message = body.error;
    } catch {
      // Keep the stable fallback message.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function getApiMarketplaceModels(params?: {
  search?: string;
  tag?: string;
  includeStatus?: boolean;
}): Promise<{
  models: ApiMarketplaceModel[];
  total: number;
  currency: string;
  statusMeta?: {
    checkIntervalSeconds: number | null;
  } | null;
}> {
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  if (params?.tag) query.set('tag', params.tag);
  if (params?.includeStatus) query.set('view', 'status');
  return request(
    `/api/api-marketplace/catalog${query.toString() ? `?${query}` : ''}`
  );
}

export async function getApiKeys(): Promise<{ keys: ApiKey[] }> {
  return request('/api/api-marketplace/keys');
}

export async function createApiKey(
  name: string
): Promise<{ key: ApiKey; secret: string }> {
  return request('/api/api-marketplace/keys', {
    method: 'POST',
    body: JSON.stringify({ name })
  });
}

export async function revokeApiKey(id: string): Promise<{ key: ApiKey }> {
  return request(`/api/api-marketplace/keys?id=${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

export async function getApiWallet(): Promise<{
  wallet: ApiWallet;
  transactions: ApiWalletTransaction[];
}> {
  return request('/api/api-marketplace/wallet');
}

export async function getApiUsage(params?: {
  keyId?: string;
  limit?: number;
}): Promise<{
  usage: ApiUsageLog[];
  totalSpentCents: number;
  limit: number;
  keyId: string | null;
}> {
  const query = new URLSearchParams();
  if (params?.keyId) query.set('keyId', params.keyId);
  if (params?.limit) query.set('limit', String(params.limit));
  const queryString = query.toString();
  return request(
    `/api/api-marketplace/usage${queryString ? `?${queryString}` : ''}`
  );
}

export async function getApiCreditPackages(): Promise<{
  packages: ApiCreditPackage[];
  checkoutProviders?: Array<'stripe' | 'alipay'>;
  pricing?: ApiCreditPricing;
}> {
  return request('/api/api-marketplace/packages');
}
