/**
 * create-fan-subscription-checkout — Opens a UGPayments QuickPay one-shot
 * Sale (IsInitialForRecurring=true) for a fan subscribing to a creator profile.
 * The MID is routed per fan country (us_2d for US/CA, intl_3d otherwise).
 *
 * Contract:
 *   POST { creator_profile_id: string, country?: string }
 *   Auth required (fan session JWT in Authorization: Bearer).
 *
 *   → 200 { fields, subscription_id, mid }
 *   → 200 { alreadySubscribed: true, subscription_id }
 *   → 4xx { error } for invalid input / disabled sub / self-subscription
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { routeMidForCountry, getMidCredentials } from '../_shared/ugRouting.ts';

const sbUrl = Deno.env.get('PROJECT_URL')!;
const sbKey = Deno.env.get('SERVICE_ROLE_KEY')!;
const siteUrl = (Deno.env.get('PUBLIC_SITE_URL') ?? 'https://exclu.at').replace(/\/$/, '');

if (!sbUrl || !sbKey) throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY');

const sb = createClient(sbUrl, sbKey);

const allowedOrigins = [
  siteUrl,
  'http://localhost:8080', 'http://localhost:8081', 'http://localhost:8082',
  'http://localhost:8083', 'http://localhost:8084', 'http://localhost:5173',
];

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const allowed = (allowedOrigins.includes(origin) || /^https:\/\/exclu-[a-z0-9-]+-atexclus-projects\.vercel\.app$/.test(origin)) ? origin : siteUrl;
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
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  try {
    // ── Auth ───────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonError('Missing authorization header', 401, cors);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await sb.auth.getUser(token);
    if (userError || !user) return jsonError('Invalid or expired token', 401, cors);

    // ── Input ──────────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));

    // Chatter attribution policy (locked 2026-04-21): chatters earn ONLY on link
    // purchases + custom request captures. Tips, gifts, and subs never split revenue
    // with a chatter. If a legacy client still sends `chtref` on this flow, drop it
    // and log for observability — we do NOT propagate it to the created row.
    const rogueChtref = typeof body?.chtref === 'string' ? body.chtref : null;
    if (rogueChtref) {
      console.warn(`[create-fan-subscription-checkout] ignoring chtref=${rogueChtref} — chatters don't earn on this flow`);
    }

    const creatorProfileId = typeof body?.creator_profile_id === 'string' ? body.creator_profile_id : null;
    if (!creatorProfileId) return jsonError('Missing creator_profile_id', 400, cors);
    const country = typeof body?.country === 'string' ? body.country.toUpperCase() : null;

    // ── Resolve creator profile + validate ─────────────────────────────────
    const { data: creatorProfile, error: cpErr } = await sb
      .from('creator_profiles')
      .select('id, user_id, username, display_name, fan_subscription_enabled, fan_subscription_price_cents, is_active, deleted_at')
      .eq('id', creatorProfileId)
      .maybeSingle();

    if (cpErr || !creatorProfile) return jsonError('Creator profile not found', 404, cors);

    // Block subscription if the creator profile (or its parent account) has
    // been soft-deleted. The soft-delete RPC cascades deleted_at to
    // creator_profiles, so checking either column is sufficient.
    if (creatorProfile.deleted_at) {
      return jsonError('Creator unavailable', 410, cors);
    }

    if (!creatorProfile.is_active) return jsonError('Creator profile not active', 400, cors);
    if (!creatorProfile.fan_subscription_enabled) {
      return jsonError('Subscriptions are disabled for this creator', 400, cors);
    }
    if (creatorProfile.user_id === user.id) {
      return jsonError('Creators cannot subscribe to themselves', 400, cors);
    }

    const priceCents: number = creatorProfile.fan_subscription_price_cents;
    if (!priceCents || priceCents < 500 || priceCents > 10000) {
      return jsonError('Invalid subscription price', 400, cors);
    }

    // ── Short-circuit if fan already has an active, unexpired sub ──────────
    const { data: existing } = await sb
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
      return jsonOk({ alreadySubscribed: true, subscription_id: existing.id }, cors);
    }

    // ── Reuse pending/past row OR create a fresh pending row ───────────────
    let subId = existing?.id ?? null;
    if (!subId) {
      const { data: inserted, error: insErr } = await sb
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
        console.error('[create-fan-subscription-checkout] insert failed', insErr);
        return jsonError('Unable to start subscription checkout', 500, cors);
      }
      subId = inserted.id;
    } else if (existing && existing.status !== 'pending') {
      // Reset the reused row so the next checkout is clean.
      await sb
        .from('fan_creator_subscriptions')
        .update({ status: 'pending', price_cents: priceCents })
        .eq('id', subId);
    }

    // ── Route MID + build QuickPay form fields ─────────────────────────────
    // The fan pays the creator's chosen price + a 15% processing fee — same
    // pattern as link/tip/gift/request checkouts. The fee is platform revenue
    // and is layered on top of any plan-based commission applied at credit time.
    // `price_cents` on fan_creator_subscriptions stays as the creator's chosen
    // price (grandfathered) — `rebillFanSubscription` re-applies the 15%
    // markup on every renewal, and the ledger credit is computed off the base.
    const midKey = routeMidForCountry(country);
    const creds = getMidCredentials(midKey);
    const fanProcessingFeeCents = Math.round(priceCents * 0.15);
    const totalFanPaysCents = priceCents + fanProcessingFeeCents;
    const amountDecimal = (totalFanPaysCents / 100).toFixed(2);
    const displayName = creatorProfile.display_name || creatorProfile.username || 'creator';
    const creatorHandle = creatorProfile.username || '';
    const merchantReference = `fsub_${subId}`;

    const fields: Record<string, string> = {
      QuickPayToken: creds.quickPayToken,
      SiteID: creds.siteId,
      AmountTotal: amountDecimal,
      CurrencyID: 'USD',
      AmountShipping: '0.00',
      ShippingRequired: 'false',
      MembershipRequired: 'false',
      // IsInitialForRecurring tags this TID as rebill-eligible.
      // Our cron calls /recurringtransactions on this TID every 30 days.
      IsInitialForRecurring: 'true',
      'ItemName[0]': `Subscribe to ${displayName}`,
      'ItemQuantity[0]': '1',
      'ItemAmount[0]': amountDecimal,
      'ItemDesc[0]': `Monthly subscription to ${displayName}'s exclusive content (includes 15% processing fee)`,
      ApprovedURL: `${siteUrl}/fan?tab=feed&subscribed=${encodeURIComponent(creatorHandle)}`,
      ConfirmURL: `${siteUrl}/api/ugp-confirm`,
      DeclinedURL: `${siteUrl}/${encodeURIComponent(creatorHandle)}?subscribe_failed=1`,
      MerchantReference: merchantReference,
      Email: user.email ?? '',
    };

    // Persist the merchant reference on the row for reconciliation.
    await sb
      .from('fan_creator_subscriptions')
      .update({ ugp_merchant_reference: merchantReference })
      .eq('id', subId);

    return jsonOk({ fields, subscription_id: subId, mid: midKey }, cors);
  } catch (err) {
    console.error('[create-fan-subscription-checkout] unhandled error:', err);
    return jsonError('Unable to start subscription checkout', 500, cors);
  }
});
