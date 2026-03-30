/**
 * create-gift-checkout — UGPayments QuickPay version.
 *
 * Request body: { wishlist_item_id, profile_id?, message?, is_anonymous? }
 * Auth: Required (fan must be logged in)
 * Returns: { fields } for QuickPay HTML form POST
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

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
             req.headers.get('cf-connecting-ip') ?? 'unknown';
  if (isRateLimited(ip)) return jsonError('Too many requests', 429, corsHeaders);

  try {
    // ── Auth required ─────────────────────────────────────────────────
    const authHeader = req.headers.get('authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    const { data: { user: fanUser }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !fanUser) return jsonError('Authentication required', 401, corsHeaders);

    const body = await req.json();
    const wishlistItemId = body?.wishlist_item_id as string | undefined;
    const profileId = body?.profile_id as string | undefined;
    const message = typeof body?.message === 'string' ? body.message.slice(0, 500) : null;
    const isAnonymous = body?.is_anonymous === true;

    if (!wishlistItemId || typeof wishlistItemId !== 'string') {
      return jsonError('Missing wishlist_item_id', 400, corsHeaders);
    }

    // ── Fetch wishlist item + creator ─────────────────────────────────
    const { data: wishlistItem, error: itemError } = await supabase
      .from('wishlist_items')
      .select(`
        id, name, price_cents, currency, max_quantity, gifted_count, is_visible, creator_id,
        profiles!wishlist_items_creator_id_fkey (
          id, handle, display_name, is_creator_subscribed, payout_setup_complete
        )
      `)
      .eq('id', wishlistItemId)
      .single();

    if (itemError || !wishlistItem) return jsonError('Wishlist item not found', 404, corsHeaders);
    if (!wishlistItem.is_visible) return jsonError('This item is no longer available', 400, corsHeaders);

    if (wishlistItem.max_quantity !== null && wishlistItem.gifted_count >= wishlistItem.max_quantity) {
      return jsonError('This item has already been gifted the maximum number of times', 400, corsHeaders);
    }

    if (wishlistItem.creator_id === fanUser.id) return jsonError('You cannot gift yourself', 400, corsHeaders);

    const creator = wishlistItem.profiles as any;
    if (!creator) return jsonError('Creator not found', 404, corsHeaders);
    // Payout setup NOT required to receive gifts — earnings go to wallet

    const amountCents = wishlistItem.price_cents;

    // ── Create gift_purchases record (pending) ────────────────────────
    const { data: giftRecord, error: giftErr } = await supabase
      .from('gift_purchases')
      .insert({
        fan_id: fanUser.id,
        creator_id: wishlistItem.creator_id,
        profile_id: profileId || null,
        wishlist_item_id: wishlistItemId,
        amount_cents: amountCents,
        currency: 'USD',
        message,
        is_anonymous: isAnonymous,
        status: 'pending',
      })
      .select('id')
      .single();

    if (giftErr || !giftRecord) {
      console.error('Error inserting gift_purchase:', giftErr);
      return jsonError('Failed to create gift record', 500, corsHeaders);
    }

    // ── Calculate total ───────────────────────────────────────────────
    const fanProcessingFeeCents = Math.round(amountCents * 0.05);
    const totalFanPaysCents = amountCents + fanProcessingFeeCents;
    const amountDecimal = (totalFanPaysCents / 100).toFixed(2);

    const merchantReference = `gift_${giftRecord.id}`;
    const creatorHandle = creator.handle || wishlistItem.creator_id;

    // ── Build QuickPay form fields ────────────────────────────────────
    const fields: Record<string, string> = {
      QuickPayToken: quickPayToken!,
      SiteID: siteId,
      AmountTotal: amountDecimal,
      CurrencyID: 'USD',
      'ItemName[0]': `Gift: ${(wishlistItem.name || 'Wishlist item').slice(0, 200)}`,
      'ItemQuantity[0]': '1',
      'ItemAmount[0]': amountDecimal,
      'ItemDesc[0]': `Gift for ${(creator.display_name || creatorHandle).slice(0, 200)} (includes 5% processing fee)`,
      AmountShipping: '0.00',
      ShippingRequired: 'false',
      MembershipRequired: 'false',
      ApprovedURL: `${siteUrl}/gift-success?item=${encodeURIComponent(wishlistItem.name)}&creator=${encodeURIComponent(creatorHandle)}`,
      ConfirmURL: `${supabaseUrl}/functions/v1/ugp-confirm?apikey=${Deno.env.get('SUPABASE_ANON_KEY') || ''}`,
      DeclinedURL: `${siteUrl}/${encodeURIComponent(creatorHandle)}?gift_failed=true`,
      MerchantReference: merchantReference,
      Email: fanUser.email || '',
    };

    // Store merchant ref
    await supabase.from('gift_purchases').update({
      ugp_merchant_reference: merchantReference,
    }).eq('id', giftRecord.id);

    return jsonOk({ fields }, corsHeaders);

  } catch (error) {
    console.error('Error in create-gift-checkout:', error);
    return jsonError('Unable to start gift checkout', 500, corsHeaders);
  }
});
