/**
 * pre-delete-check — Account deletion preflight.
 *
 * Returns the set of hard blocks (must be resolved before deletion) and
 * soft warnings (informational, user must acknowledge) for the
 * authenticated user, scoped to their account type (creator / agency /
 * fan / chatter).
 *
 * Hard blocks mirror the sentinels raised by the `soft_delete_account`
 * RPC (migration 178):
 *   - EXCLU_BLOCK_PENDING_REQUESTS  → pending_custom_requests
 *   - EXCLU_BLOCK_PAYOUTS_IN_FLIGHT → in_flight_payouts
 *   - EXCLU_BLOCK_CHATTER_WALLET    → chatter_wallet_nonzero
 *
 * Auth: required. JWT in `Authorization: Bearer <token>`.
 * Verified manually (`verify_jwt = false` in config.toml — Exclu convention).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Block = {
  type: 'pending_custom_requests' | 'in_flight_payouts' | 'chatter_wallet_nonzero';
  count?: number;
  amount_cents?: number;
  cta_label: string;
  cta_url: string;
  message: string;
};

type Warning = {
  type:
    | 'wallet_forfeit'
    | 'active_fan_subs'
    | 'creator_pro_active'
    | 'legal_retention'
    | 'fan_active_subs'
    | 'handle_reservation';
  message: string;
  metadata?: Record<string, unknown>;
};

type AccountType = 'creator' | 'fan' | 'chatter' | 'agency';

type CheckResult = {
  account_type: AccountType;
  email: string;
  handle: string | null;
  can_delete: boolean;
  blocks: Block[];
  warnings: Warning[];
};

function formatDollars(cents: number): string {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Allow': 'POST, OPTIONS' }
    });
  }

  const supabaseUrl =
    Deno.env.get('SUPABASE_URL') ??
    Deno.env.get('PROJECT_URL') ??
    Deno.env.get('VITE_SUPABASE_URL');
  const supabaseAnonKey =
    Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('VITE_SUPABASE_ANON_KEY');
  const supabaseServiceKey =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    console.error('[pre-delete-check] Missing Supabase env vars');
    return jsonResponse({ error: 'Server misconfigured' }, 500);
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) return jsonResponse({ error: 'Missing authorization' }, 401);

    const authClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authErr } = await authClient.auth.getUser(jwt);
    if (authErr || !user) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!user.email) return jsonResponse({ error: 'User has no email on file' }, 400);

    const svc = createClient(supabaseUrl, supabaseServiceKey);

    // --- Profile + role + Pro plan (Pro lives on `profiles`, NOT creator_profiles) ---
    const { data: profile, error: profileErr } = await svc
      .from('profiles')
      .select('role, wallet_balance_cents, deleted_at, subscription_plan')
      .eq('id', user.id)
      .maybeSingle();

    if (profileErr) {
      console.error('[pre-delete-check] profile lookup error', profileErr);
      return jsonResponse({ error: 'Profile lookup failed' }, 500);
    }
    if (!profile) return jsonResponse({ error: 'Profile not found' }, 404);
    if (profile.deleted_at) return jsonResponse({ error: 'Account already deleted' }, 410);

    const accountType = profile.role as AccountType;
    const validRoles: AccountType[] = ['creator', 'agency', 'fan', 'chatter'];
    if (!validRoles.includes(accountType)) {
      return new Response(JSON.stringify({ error: `Unsupported account type: ${profile.role}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const blocks: Block[] = [];
    const warnings: Warning[] = [];

    // --- Canonical handle (oldest creator_profile, ignore soft-deleted) ---
    const { data: cp } = await svc
      .from('creator_profiles')
      .select('username')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    const handle = cp?.username ?? null;

    if (accountType === 'creator' || accountType === 'agency') {
      // BLOCK: pending custom requests (pending or accepted-but-not-delivered)
      const { count: pendingReqs } = await svc
        .from('custom_requests')
        .select('id', { count: 'exact', head: true })
        .eq('creator_id', user.id)
        .in('status', ['pending', 'accepted']);
      const pendingCount = pendingReqs ?? 0;
      if (pendingCount > 0) {
        blocks.push({
          type: 'pending_custom_requests',
          count: pendingCount,
          cta_label: 'Manage requests',
          cta_url: '/app/chat',
          message: `You have ${pendingCount} pending or accepted custom request${pendingCount > 1 ? 's' : ''}. Resolve each (decline pending, deliver accepted) before deleting your account.`,
        });
      }

      // BLOCK: payouts in flight — statuses match migration 178 RPC exactly
      const { count: payoutsInFlight } = await svc
        .from('payouts')
        .select('id', { count: 'exact', head: true })
        .eq('creator_id', user.id)
        .in('status', ['pending', 'approved', 'processing']);
      const payoutCount = payoutsInFlight ?? 0;
      if (payoutCount > 0) {
        blocks.push({
          type: 'in_flight_payouts',
          count: payoutCount,
          cta_label: 'View earnings',
          cta_url: '/app/earnings',
          message: `${payoutCount} payout${payoutCount > 1 ? 's are' : ' is'} currently being processed. Wait until completion before deleting.`,
        });
      }

      // WARNING: wallet > 0 → soft warning (creator forfeits balance on delete)
      const wallet = profile.wallet_balance_cents ?? 0;
      if (wallet > 0) {
        warnings.push({
          type: 'wallet_forfeit',
          message: `Your wallet balance (${formatDollars(wallet)}) will be permanently forfeited. To withdraw it, request a payout first.`,
          metadata: { wallet_cents: wallet },
        });
      }

      // WARNING: active fan subscriptions across all of this user's creator_profiles
      const { data: ownedProfiles } = await svc
        .from('creator_profiles')
        .select('id')
        .eq('user_id', user.id)
        .is('deleted_at', null);
      const cpIds = (ownedProfiles ?? []).map((p) => p.id);
      let activeFanSubs = 0;
      if (cpIds.length > 0) {
        const { count } = await svc
          .from('fan_creator_subscriptions')
          .select('id', { count: 'exact', head: true })
          .in('creator_profile_id', cpIds)
          .eq('status', 'active')
          .eq('cancel_at_period_end', false);
        activeFanSubs = count ?? 0;
      }
      if (activeFanSubs > 0) {
        warnings.push({
          type: 'active_fan_subs',
          message: `${activeFanSubs} fan${activeFanSubs > 1 ? 's are' : ' is'} currently subscribed. Their subscriptions will be canceled (no more rebills); they keep access until the end of their current billing period and will be notified by email.`,
          metadata: { count: activeFanSubs },
        });
      }

      // WARNING: Creator Pro active (lives on `profiles`, not creator_profiles).
      // The 'free' plan must NOT trigger this warning.
      const plan = profile.subscription_plan as string | null;
      if (plan && plan !== 'free') {
        warnings.push({
          type: 'creator_pro_active',
          message: 'Your Creator Pro subscription will be canceled. No prorated refund is issued.',
          metadata: { plan },
        });
      }

      // WARNING: handle is reserved forever (so re-signup with the same handle is blocked)
      warnings.push({
        type: 'handle_reservation',
        message: handle
          ? `Your handle @${handle} will be permanently reserved and cannot be used by anyone, including you.`
          : 'Your handle will be permanently reserved.',
      });
    }

    if (accountType === 'chatter') {
      // BLOCK: chatter wallet must be empty before deletion (commissions earned must be withdrawn)
      const wallet = profile.wallet_balance_cents ?? 0;
      if (wallet > 0) {
        blocks.push({
          type: 'chatter_wallet_nonzero',
          amount_cents: wallet,
          cta_label: 'Request payout',
          cta_url: '/app/chatter',
          message: `Your wallet contains ${formatDollars(wallet)} in earned commissions. You must withdraw it via a payout request before deleting your account.`,
        });
      }

      // BLOCK: chatters use the same `payouts` table, keyed on their user_id
      const { count: payoutsInFlight } = await svc
        .from('payouts')
        .select('id', { count: 'exact', head: true })
        .eq('creator_id', user.id)
        .in('status', ['pending', 'approved', 'processing']);
      const payoutCount = payoutsInFlight ?? 0;
      if (payoutCount > 0) {
        blocks.push({
          type: 'in_flight_payouts',
          count: payoutCount,
          cta_label: 'View payouts',
          cta_url: '/app/chatter',
          message: `${payoutCount} payout${payoutCount > 1 ? 's are' : ' is'} in flight. Wait for completion.`,
        });
      }
    }

    if (accountType === 'fan') {
      // WARNING: fan keeps access until period end, no refunds
      const { count: activeSubs } = await svc
        .from('fan_creator_subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('fan_id', user.id)
        .eq('status', 'active')
        .eq('cancel_at_period_end', false);
      const subCount = activeSubs ?? 0;
      if (subCount > 0) {
        warnings.push({
          type: 'fan_active_subs',
          message: `You have ${subCount} active subscription${subCount > 1 ? 's' : ''}. They will be canceled (no more rebills). You retain access until the end of each current billing period and no refunds are issued.`,
          metadata: { count: subCount },
        });
      }
    }

    // Always show legal retention notice (regardless of account type)
    warnings.push({
      type: 'legal_retention',
      message: 'Transactional data (sales, payouts, tips) is retained for 10 years per French accounting law. Personal data (display name, bio, avatar, conversations) is hidden everywhere on Exclu immediately upon deletion.',
    });

    const result: CheckResult = {
      account_type: accountType,
      email: user.email,
      handle,
      can_delete: blocks.length === 0,
      blocks,
      warnings,
    };

    return jsonResponse(result, 200);
  } catch (e) {
    console.error('[pre-delete-check] unexpected error', e);
    return jsonResponse({ error: 'Internal error' }, 500);
  }
});
