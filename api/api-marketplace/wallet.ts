import {
  jsonResponse,
  preflightResponse,
  requireUserContextPublic
} from './runtime';

export const config = { runtime: 'edge' };

export default async function handler(request: Request) {
  const preflight = preflightResponse(request);
  if (preflight) return preflight;
  if (request.method !== 'GET') return jsonResponse(request, { error: 'Method not allowed' }, 405);
  const context = await requireUserContextPublic(request);
  if (!context) return jsonResponse(request, { error: 'Unauthorized' }, 401);

  const { data: wallet, error: walletError } = await context.supabase
    .from('api_wallets')
    .select('user_id,balance_cents,total_deposited_cents,updated_at')
    .eq('user_id', context.userId)
    .maybeSingle();
  if (walletError) {
    console.error('[ApiMarketplace] Wallet fetch failed:', walletError);
    return jsonResponse(request, { error: 'API 余额暂时不可用' }, 503);
  }
  const { data: transactions, error: transactionError } = await context.supabase
    .from('api_wallet_transactions')
    .select('id,type,amount_cents,balance_after_cents,source,metadata,created_at')
    .eq('user_id', context.userId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (transactionError) {
    console.error('[ApiMarketplace] Wallet transactions fetch failed:', transactionError);
    return jsonResponse(request, { error: 'API 余额流水暂时不可用' }, 503);
  }
  return jsonResponse(request, {
    wallet: wallet || {
      user_id: context.userId,
      balance_cents: 0,
      total_deposited_cents: 0,
      updated_at: null
    },
    transactions: transactions || []
  });
}
