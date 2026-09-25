import { createClient } from '@supabase/supabase-js';
import { getCorsHeadersForRequest } from '../utils/auth';

export const config = {
  runtime: 'edge'
};

const DEFAULT_PACKAGES = [
  { id: 'pack_1k', name: '1,000 Media Credits', price: 499, credits: 1000 },
  { id: 'pack_5k', name: '5,000 Media Credits', price: 1999, credits: 5000 },
  { id: 'pack_20k', name: '20,000 Media Credits', price: 6999, credits: 20000 },
  {
    id: 'pack_100k',
    name: '100,000 Media Credits',
    price: 29999,
    credits: 100000
  }
];

function jsonResponse(
  data: unknown,
  corsHeaders: Record<string, string>,
  status = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

interface CreditPackageRow {
  id?: unknown;
  name?: unknown;
  credits?: unknown;
  price?: unknown;
  bonus_credits?: unknown;
  is_active?: unknown;
  sort_order?: unknown;
}

function formatPackage(item: CreditPackageRow, index: number) {
  return {
    id: String(item.id || ''),
    name: String(item.name || ''),
    credits: Number(item.credits || 0),
    price: Number(item.price || 0),
    bonusCredits: Number(item.bonus_credits || 0),
    isActive: item.is_active !== false,
    sortOrder: Number(item.sort_order ?? index)
  };
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse(
      { packages: DEFAULT_PACKAGES.map(formatPackage) },
      corsHeaders
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase
    .from('credit_packages')
    .select('*')
    .eq('is_active', true)
    .order('price', { ascending: true });

  if (error) {
    console.error('[CreditPackages] Fetch error:', error);
    return jsonResponse(
      { packages: DEFAULT_PACKAGES.map(formatPackage) },
      corsHeaders
    );
  }

  return jsonResponse(
    { packages: (data || []).map(formatPackage) },
    corsHeaders
  );
}
