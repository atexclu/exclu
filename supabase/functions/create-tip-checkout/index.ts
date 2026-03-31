/**
 * create-tip-checkout — UGPayments QuickPay version.
 *
 * Same request body and validations as the previous Stripe version.
 * Returns { fields } for the QuickPay HTML form POST instead of { url }.
 *
 * Request body: { creator_id, profile_id?, amount_cents, message?, is_anonymous?, fan_name? }
 * Auth: Optional (guests can tip)
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

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// ── CORS (same pattern as all existing functions) ────────────────────────

const normalizedSiteOrigin = siteUrl;
const allowedOrigins = [
  normalizedSiteOrigin,
  'http://localhost:8080', 'http://localhost:8081', 'http://localhost:8082',
  'http://localhost:8083', 'http://localhost:8084', 'http://localhost:5173',
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  const allowed = allowedOrigins.includes(origin) ? origin : normalizedSiteOrigin;
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-auth',
  };
}

function jsonOk(data: Record<string, unknown>, cors: Record<string, string>) {
  return new Response(JSON.stringify(data), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function jsonError(msg: string, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

// ── Rate limiting (10 req/min/IP) ────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const ipHits = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const e = ipHits.get(ip);
  if (!e || now - e.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipHits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  e.count++;
  return e.count > RATE_LIMIT_MAX;
}

// ── Main handler ─────────────────────────────────────────────────────────

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
             req.headers.get('cf-connecting-ip') ?? 'unknown';
  if (isRateLimited(ip)) return jsonError('Too many requests', 429, corsHeaders);

  try {
    // Auth optional — guests can tip
    const authHeader = req.headers.get('authorization') ?? '';
    const token = authHeader.replace('Bearer ', '').trim();
    let fanUserId: string | null = null;
    if (token) {
      const { data: { user: fanUser } } = await supabase.auth.getUser(token);
      if (fanUser) fanUserId = fanUser.id;
    }

    const body = await req.json();
    const creatorId = body?.creator_id as string | undefined;
    const profileId = body?.profile_id as string | undefined;
    const amountCents = body?.amount_cents as number | undefined;
    const message = typeof body?.message === 'string' ? body.message.slice(0, 500) : null;
    const isAnonymous = body?.is_anonymous === true;
    const fanName = typeof body?.fan_name === 'string' ? body.fan_name.trim().slice(0, 100) : null;

    // ── Validation ────────────────────────────────────────────────────
    if (!creatorId || typeof creatorId !== 'string') return jsonError('Missing creator_id', 400, corsHeaders);
    if (fanUserId && fanUserId === creatorId) return jsonError('You cannot tip yourself', 400, corsHeaders);
    if (!amountCents || typeof amountCents !== 'number' || amountCents < 100) return jsonError('Invalid amount (minimum $1.00)', 400, corsHeaders);
    if (amountCents > 50000) return jsonError('Maximum tip is $500.00', 400, corsHeaders);

    // ── Fetch creator ─────────────────────────────────────────────────
    const { data: creator, error: creatorError } = await supabase
      .from('profiles')
      .select('id, handle, is_creator_subscribed, payout_setup_complete, tips_enabled, min_tip_amount_cents, display_name')
      .eq('id', creatorId)
      .single();

    if (creatorError || !creator) return jsonError('Creator not found', 404, corsHeaders);
    if (!creator.tips_enabled) return jsonError('This creator does not accept tips', 400, corsHeaders);

    const minTip = creator.min_tip_amount_cents || 500;
    if (amountCents < minTip) return jsonError(`Minimum tip is $${(minTip / 100).toFixed(2)}`, 400, corsHeaders);
    // Payout setup NOT required to receive tips — earnings go to wallet

    // ── Create tip record (pending) ───────────────────────────────────
    const { data: tipRecord, error: tipErr } = await supabase
      .from('tips')
      .insert({
        fan_id: fanUserId ?? null,
        creator_id: creatorId,
        profile_id: profileId || null,
        amount_cents: amountCents,
        currency: 'USD',
        message,
        is_anonymous: isAnonymous,
        fan_name: fanName,
        status: 'pending',
      })
      .select('id')
      .single();

    if (tipErr || !tipRecord) {
      console.error('Error inserting tip:', tipErr);
      return jsonError('Failed to create tip', 500, corsHeaders);
    }

    // ── Calculate total (base + 5% processing fee) ────────────────────
    const fanProcessingFeeCents = Math.round(amountCents * 0.05);
    const totalFanPaysCents = amountCents + fanProcessingFeeCents;
    const amountDecimal = (totalFanPaysCents / 100).toFixed(2);

    const merchantReference = `tip_${tipRecord.id}`;
    const creatorHandle = creator.handle || creatorId;

    // Build success URL (same params format for frontend compatibility)
    const successParams = new URLSearchParams({
      creator: creatorHandle,
      amount: String(amountCents),
      tip_id: tipRecord.id,
    });
    if (message) successParams.set('message', message);
    if (!fanUserId) successParams.set('guest', '1');

    // ── Build QuickPay form fields ────────────────────────────────────
    const fields: Record<string, string> = {
      QuickPayToken: quickPayToken!,
      SiteID: siteId,
      AmountTotal: amountDecimal,
      CurrencyID: 'USD',
      'ItemName[0]': `Tip for ${(creator.display_name || creatorHandle).slice(0, 200)}`,
      'ItemQuantity[0]': '1',
      'ItemAmount[0]': amountDecimal,
      'ItemDesc[0]': 'One-time tip on Exclu (includes 5% processing fee)',
      AmountShipping: '0.00',
      ShippingRequired: 'false',
      MembershipRequired: 'false',
      ApprovedURL: `${siteUrl}/tip-success?${successParams.toString()}`,
      ConfirmURL: `${supabaseUrl}/functions/v1/ugp-confirm?apikey=${Deno.env.get('ANON_KEY') || ''}`,
      DeclinedURL: `${siteUrl}/${encodeURIComponent(creatorHandle)}?tip_failed=true`,
      MerchantReference: merchantReference,
    };

    // Store merchant ref on tip record for reconciliation
    await supabase.from('tips').update({
      ugp_merchant_reference: merchantReference,
    }).eq('id', tipRecord.id);

    return jsonOk({ fields }, corsHeaders);

  } catch (error) {
    console.error('Error in create-tip-checkout:', error);
    return jsonError('Unable to start checkout', 500, corsHeaders);
  }
});
