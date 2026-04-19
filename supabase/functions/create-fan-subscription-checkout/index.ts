/**
 * create-fan-subscription-checkout — Opens a UGPayments QuickPay recurring
 * checkout for a fan subscribing to a specific creator profile.
 *
 * Contract:
 *   POST { creator_profile_id: string }
 *   Auth required (fan session JWT in Authorization: Bearer).
 *
 *   → 200 { fields }                               (POST fields to https://quickpay.ugpayments.ch/)
 *   → 200 { alreadySubscribed: true, subscription_id }
 *   → 4xx { error } for invalid input / disabled sub / self-subscription
 *   → 503 { error } if QUICKPAY_FAN_SUB_PLAN_ID isn't yet provisioned with Derek
 *
 * Variable price: AmountTotal is derived from
 *   creator_profiles.fan_subscription_price_cents (range $5–$100).
 *
 * Idempotency: we look up any non-terminal row for this (fan, creator) pair.
 * If it's active with a future period_end we return { alreadySubscribed }.
 * Otherwise (pending, cancelled, expired, past_due) we reuse the row so
 * duplicate clicks don't create stale pending rows.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
const siteUrl = (Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at').replace(/\/$/, '');
const quickPayToken = Deno.env.get('QUICKPAY_TOKEN');
const siteId = Deno.env.get('QUICKPAY_SITE_ID') || '98845';

if (!supabaseUrl || !supabaseServiceRoleKey) throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY');
if (!quickPayToken) throw new Error('Missing QUICKPAY_TOKEN');

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

const allowedOrigins = [
  siteUrl,
  'http://localhost:8080', 'http://localhost:8081', 'http://localhost:8082',
  'http://localhost:8083', 'http://localhost:8084', 'http://localhost:5173',
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const allowed = allowedOrigins.includes(origin) ? origin : siteUrl;
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

function jsonOk(data: Record<string, unknown>, cors: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function jsonError(msg: string, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Lazy check: don't crash on cold start if Derek's plan id isn't provisioned yet.
  // The function stays deployable so the frontend's error path is stable.
  const fanSubPlanId = Deno.env.get('QUICKPAY_FAN_SUB_PLAN_ID');
  if (!fanSubPlanId) {
    console.error('create-fan-subscription-checkout called but QUICKPAY_FAN_SUB_PLAN_ID is unset');
    return jsonError('Fan subscription plan not configured yet', 503, corsHeaders);
  }

  try {
    // ── Auth ───────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonError('Missing authorization header', 401, corsHeaders);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) return jsonError('Invalid or expired token', 401, corsHeaders);

    // ── Input ──────────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const creatorProfileId = typeof body?.creator_profile_id === 'string' ? body.creator_profile_id : null;
    if (!creatorProfileId) return jsonError('Missing creator_profile_id', 400, corsHeaders);

    // ── Resolve creator profile + validate ─────────────────────────────────
    const { data: creatorProfile, error: cpErr } = await supabaseAdmin
      .from('creator_profiles')
      .select('id, user_id, username, display_name, fan_subscription_enabled, fan_subscription_price_cents')
      .eq('id', creatorProfileId)
      .eq('is_active', true)
      .single();

    if (cpErr || !creatorProfile) return jsonError('Creator profile not found', 404, corsHeaders);
    if (!creatorProfile.fan_subscription_enabled) {
      return jsonError('Subscriptions are disabled for this creator', 400, corsHeaders);
    }
    if (creatorProfile.user_id === user.id) {
      return jsonError('Creators cannot subscribe to themselves', 400, corsHeaders);
    }

    const priceCents: number = creatorProfile.fan_subscription_price_cents || 500;
    if (priceCents < 500 || priceCents > 10000) {
      return jsonError('Invalid subscription price', 400, corsHeaders);
    }

    // ── Short-circuit if fan already has an active, unexpired sub ──────────
    const { data: existing } = await supabaseAdmin
      .from('fan_creator_subscriptions')
      .select('id, status, period_end')
      .eq('fan_id', user.id)
      .eq('creator_profile_id', creatorProfileId)
      .in('status', ['pending', 'active', 'cancelled', 'past_due'])
      .maybeSingle();

    if (
      existing &&
      existing.status === 'active' &&
      existing.period_end &&
      new Date(existing.period_end) > new Date()
    ) {
      return jsonOk({ alreadySubscribed: true, subscription_id: existing.id }, corsHeaders);
    }

    // ── Reuse pending/past row OR create a fresh pending row ───────────────
    let subId = existing?.id ?? null;
    if (!subId) {
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from('fan_creator_subscriptions')
        .insert({
          fan_id: user.id,
          creator_profile_id: creatorProfileId,
          creator_user_id: creatorProfile.user_id,
          status: 'pending',
          price_cents: priceCents,
          currency: 'USD',
        })
        .select('id')
        .single();
      if (insErr || !inserted) {
        console.error('Error creating pending fan subscription', insErr);
        return jsonError('Unable to start subscription checkout', 500, corsHeaders);
      }
      subId = inserted.id;
    } else if (existing && existing.status !== 'pending') {
      // Reset the reused row so the next checkout is clean.
      await supabaseAdmin
        .from('fan_creator_subscriptions')
        .update({ status: 'pending', price_cents: priceCents })
        .eq('id', subId);
    }

    // ── Build QuickPay subscription form fields ────────────────────────────
    const merchantReference = `fsub_${subId}`;
    const amountDecimal = (priceCents / 100).toFixed(2);
    const displayName = creatorProfile.display_name || creatorProfile.username || 'creator';
    const creatorHandle = creatorProfile.username || '';

    const fields: Record<string, string> = {
      QuickPayToken: quickPayToken!,
      SiteID: siteId,
      AmountTotal: amountDecimal,
      CurrencyID: 'USD',
      AmountShipping: '0.00',
      ShippingRequired: 'false',
      MembershipRequired: 'true',
      ShowUserNamePassword: 'false',
      MembershipUsername: subId!,              // uuid, matched on every postback
      SubscriptionPlanId: fanSubPlanId,         // variable-price plan (configured with Derek)
      'ItemName[0]': `Subscribe to ${displayName}`,
      'ItemQuantity[0]': '1',
      'ItemAmount[0]': amountDecimal,
      'ItemDesc[0]': `Monthly subscription to ${displayName}'s exclusive content`,
      ApprovedURL: `${siteUrl}/fan?tab=feed&subscribed=${encodeURIComponent(creatorHandle)}`,
      ConfirmURL: `${siteUrl}/api/ugp-confirm`,
      DeclinedURL: `${siteUrl}/${encodeURIComponent(creatorHandle)}?subscribe_failed=1`,
      MerchantReference: merchantReference,
      Email: user.email || '',
    };

    // Persist the ugp username + merchant ref on the row for later cancel ops / reconciliation.
    await supabaseAdmin
      .from('fan_creator_subscriptions')
      .update({
        ugp_membership_username: subId,
        ugp_merchant_reference: merchantReference,
      })
      .eq('id', subId);

    return jsonOk({ fields, subscription_id: subId }, corsHeaders);
  } catch (err) {
    console.error('Error in create-fan-subscription-checkout:', err);
    return jsonError('Unable to start subscription checkout', 500, corsHeaders);
  }
});
