/**
 * Vercel Serverless Function - /api/membership/referral
 * 处理邀请码绑定与奖励查询
 */

import { createClient } from '@supabase/supabase-js';
import { getCorsHeadersForRequest } from '../utils/auth';
import { REFERRAL_REWARD_CREDITS, REFERRAL_SUBSCRIPTION_REWARD_CREDITS } from '../../src/shared/referral-rewards';

export const config = {
    runtime: 'edge',
};

function jsonResponse(data: unknown, corsHeaders: Record<string, string>, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
        },
    });
}

function getFirstHeaderValue(request: Request, names: string[]): string {
    for (const name of names) {
        const value = request.headers.get(name);
        if (value?.trim()) {
            return value.split(',')[0].trim();
        }
    }
    return '';
}

async function sha256Hex(value: string): Promise<string | null> {
    const normalized = value.trim();
    if (!normalized) return null;

    const salt = process.env.REFERRAL_RISK_HASH_SALT || 'webtomind-referral-risk-v1';
    const input = new TextEncoder().encode(`${salt}:${normalized}`);
    const digest = await crypto.subtle.digest('SHA-256', input);
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

async function getReferralRiskEvidence(request: Request): Promise<{
    ipHash: string | null;
    userAgentHash: string | null;
}> {
    const clientIp = getFirstHeaderValue(request, [
        'x-forwarded-for',
        'x-real-ip',
        'cf-connecting-ip'
    ]);
    const userAgent = request.headers.get('user-agent') || '';
    const [ipHash, userAgentHash] = await Promise.all([
        sha256Hex(clientIp),
        sha256Hex(userAgent)
    ]);
    return { ipHash, userAgentHash };
}

export default async function handler(request: Request) {
    const corsHeaders = getCorsHeadersForRequest(request);

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, corsHeaders, 401);

    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. 验证用户
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return jsonResponse({ error: 'Unauthorized' }, corsHeaders, 401);

    const userId = user.id;

    // GET: 获取邀请统计
    if (request.method === 'GET') {
        // A. 我的邀请码
        const { data: profile } = await supabase
            .from('profiles')
            .select('referral_code')
            .eq('id', userId)
            .single();

        // 兼容性逻辑：如果 referral_code 为空或者列不存在（由 rpc 提供默认逻辑）
        // 如果数据库没有此列或者报错了，profile 会是 null
        let referralCode = profile?.referral_code || '';
        if (!referralCode) {
            const { data: ensuredCode, error: ensureError } = await supabase.rpc(
                'ensure_referral_code',
                { p_user_id: userId }
            );
            if (!ensureError && typeof ensuredCode === 'string' && ensuredCode.trim()) {
                referralCode = ensuredCode.trim();
            }
        }
        if (!referralCode) {
            referralCode = userId.split('-')[0].toUpperCase();
        }

        // B. 我邀请的人列表
        const { data: referees } = await supabase
            .from('referrals')
            .select('referee_id, status, reward_amount, created_at, qualified_at, reward_granted_at, risk_reason, fraud_reason, metadata, profiles!referrals_referee_id_fkey(username, avatar_url)')
            .eq('referrer_id', userId)
            .order('created_at', { ascending: false });

        // C. 谁邀请了我
        const { data: referrerRecord } = await supabase
            .from('referrals')
            .select('referrer_id, status, reward_amount, qualified_at, reward_granted_at, risk_reason, fraud_reason')
            .eq('referee_id', userId)
            .maybeSingle();

        const totalRewardCredits = (referees || []).reduce((sum, referral) => {
            if ((referral as { status?: string }).status !== 'completed') {
                return sum;
            }
            const rewardAmount = Number(
                (referral as { reward_amount?: unknown }).reward_amount || 0
            );
            const subscriptionRewardAmount = Number(
                (referral as { metadata?: { subscription_reward_amount?: unknown } }).metadata
                    ?.subscription_reward_amount || 0
            );
            return sum + (Number.isFinite(rewardAmount) && rewardAmount > 0
                ? rewardAmount
                : REFERRAL_REWARD_CREDITS) + (Number.isFinite(subscriptionRewardAmount)
                ? subscriptionRewardAmount
                : 0);
        }, 0);
        const completedInvitedCount = (referees || []).filter(
            (referral) => (referral as { status?: string }).status === 'completed'
        ).length;
        const pendingInvitedCount = (referees || []).filter(
            (referral) => (referral as { status?: string }).status === 'pending'
        ).length;
        const visibleInvitedCount = (referees || []).filter(
            (referral) => (referral as { status?: string }).status !== 'fraud'
        ).length;

        return jsonResponse({
            referral_code: referralCode,
            reward_amount: REFERRAL_REWARD_CREDITS,
            subscription_reward_amount: REFERRAL_SUBSCRIPTION_REWARD_CREDITS,
            total_reward_credits: totalRewardCredits,
            invited_count: visibleInvitedCount,
            completed_invited_count: completedInvitedCount,
            pending_invited_count: pendingInvitedCount,
            invited_users: referees || [],
            has_referrer: !!referrerRecord,
            referrer_status: referrerRecord?.status || null,
            referrer_reward_amount: referrerRecord?.reward_amount || null,
            referrer_qualified_at: referrerRecord?.qualified_at || null,
            referrer_reward_granted_at: referrerRecord?.reward_granted_at || null,
            referrer_risk_reason: referrerRecord?.risk_reason || null,
            referrer_fraud_reason: referrerRecord?.fraud_reason || null
        }, corsHeaders);
    }

    // POST: 绑定邀请码
    if (request.method === 'POST') {
        try {
            const { code } = await request.json() as { code: string };
            if (!code) return jsonResponse({ error: 'Code is required' }, corsHeaders, 400);

            // A. 检查是否已经被邀请过
            const { data: existing } = await supabase
                .from('referrals')
                .select('id')
                .eq('referee_id', userId)
                .maybeSingle();

            if (existing) return jsonResponse({ error: 'Already referred' }, corsHeaders, 400);

            // B. 查找邀请人
            const { data: referrerProfile } = await supabase
                .from('profiles')
                .select('id')
                .eq('referral_code', code.toUpperCase())
                .single();

            if (!referrerProfile) return jsonResponse({ error: 'Invalid referral code' }, corsHeaders, 404);
            if (referrerProfile.id === userId) return jsonResponse({ error: 'Cannot refer yourself' }, corsHeaders, 400);

            const referrerId = referrerProfile.id;

            const riskEvidence = await getReferralRiskEvidence(request);

            // C. 记录邀请，先进入 pending；奖励由 qualify_pending_referral 在真实激活后发放。
            const { data: rewardResult, error: rpcError } = await supabase.rpc('create_referral_claim', {
                p_referrer_id: referrerId,
                p_referee_id: userId,
                p_referee_email: user.email || null,
                p_referee_ip_hash: riskEvidence.ipHash,
                p_referee_user_agent_hash: riskEvidence.userAgentHash,
                p_metadata: { source: 'membership_referral_api' }
            });

            if (rpcError) throw rpcError;

            const rewardRecord =
                typeof rewardResult === 'object' && rewardResult !== null
                    ? (rewardResult as {
                        reward_amount?: unknown;
                        status?: unknown;
                        requires_activation?: unknown;
                        risk_reason?: unknown;
                    })
                    : {};
            const rewardAmount =
                'reward_amount' in rewardRecord
                    ? Number(rewardRecord.reward_amount)
                    : REFERRAL_REWARD_CREDITS;

            return jsonResponse({
                success: true,
                reward_amount:
                    Number.isFinite(rewardAmount) && rewardAmount > 0
                        ? rewardAmount
                        : REFERRAL_REWARD_CREDITS,
                status:
                    typeof rewardRecord.status === 'string'
                        ? rewardRecord.status
                        : 'pending',
                requires_activation: rewardRecord.requires_activation !== false,
                risk_reason:
                    typeof rewardRecord.risk_reason === 'string'
                        ? rewardRecord.risk_reason
                        : null
            }, corsHeaders);

        } catch (err: unknown) {
            // 安全修复：不暴露内部错误详情
            console.error('[Referral] Error:', err);
            return jsonResponse({ error: 'Internal server error' }, corsHeaders, 500);
        }
    }

    return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
}
