/**
 * create-link-checkout — Generate QuickPay form fields for a link purchase.
 *
 * Generates QuickPay form fields for UGPayments checkout. This:
 *   1. Validates the link and creator
 *   2. Resolves chatter attribution (if chtref present)
 *   3. Calculates the commission split
 *   4. Pre-creates a purchase record (status='pending')
 *   5. Returns the QuickPay form fields for the frontend to POST
 *
 * The fan is then redirected to QuickPay's hosted payment page.
 * After payment, QuickPay POSTs to ugp-confirm which finalizes the purchase.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { routeMidForCountry, getMidCredentials } from '../_shared/ugRouting.ts';

const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
const siteUrl = (Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at').replace(/\/$/, '');

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// ── CORS ─────────────────────────────────────────────────────────────────

const normalizedSiteOrigin = siteUrl;
const allowedOrigins = [
  normalizedSiteOrigin,
  'http://localhost:8080',
  'http://localhost:8081',
  'http://localhost:8082',
  'http://localhost:8083',
  'http://localhost:8084',
  'http://localhost:5173',
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  const allowedOrigin = (allowedOrigins.includes(origin) || /^https:\/\/exclu-[a-z0-9-]+-atexclus-projects\.vercel\.app$/.test(origin)) ? origin : normalizedSiteOrigin;
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-auth',
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

// ── Rate limiting ────────────────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const ipHits = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const existing = ipHits.get(ip);
  if (!existing || now - existing.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipHits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  existing.count += 1;
  return existing.count > RATE_LIMIT_MAX_REQUESTS;
}

// ── Main handler ─────────────────────────────────────────────────────────

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
             req.headers.get('cf-connecting-ip') ?? 'unknown';

  if (isRateLimited(ip)) {
    return jsonError('Too many requests', 429, corsHeaders);
  }

  try {
    const body = await req.json();
    const country = typeof body?.country === 'string' ? body.country.toUpperCase() : null;
    const midKey = routeMidForCountry(country);
    const creds = getMidCredentials(midKey);

    const slug = body?.slug as string | undefined;

    const rawBuyerEmail = typeof body?.buyerEmail === 'string' ? body.buyerEmail.trim() : '';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const buyerEmail = emailRegex.test(rawBuyerEmail) ? rawBuyerEmail : undefined;
    const conversationId = typeof body?.conversation_id === 'string' ? body.conversation_id : null;
    const chatterRef = typeof body?.chtref === 'string' ? body.chtref.trim() : null;

    if (!slug || typeof slug !== 'string') {
      return jsonError('Missing or invalid slug', 400, corsHeaders);
    }

    // ── Fetch link ────────────────────────────────────────────────────
    const { data: link, error: linkError } = await supabase
      .from('links')
      .select('id, title, price_cents, currency, status, creator_id, slug, storage_path, is_support_link')
      .eq('slug', slug)
      .single();

    if (linkError || !link) {
      return jsonError('Link not found or unavailable', 404, corsHeaders);
    }

    if (link.status !== 'published') {
      return jsonError('Link is not available for purchase', 400, corsHeaders);
    }

    if (!link.price_cents || link.price_cents <= 0) {
      return jsonError('Invalid price for this link', 400, corsHeaders);
    }

    // Belt-and-braces check against the links_require_content DB trigger:
    // refuse to sell a non-support link that has lost all its content (the
    // trigger blocks new publishes but a legacy row could slip through).
    if (!link.is_support_link && !link.storage_path) {
      const { count: mediaCount, error: mediaCountError } = await supabase
        .from('link_media')
        .select('link_id', { count: 'exact', head: true })
        .eq('link_id', link.id);

      if (mediaCountError) {
        console.error('link_media count check failed', mediaCountError);
        return jsonError('Unable to verify link content', 500, corsHeaders);
      }

      if (!mediaCount || mediaCount === 0) {
        return jsonError('This link has no content attached and cannot be purchased', 400, corsHeaders);
      }
    }

    // ── Fetch creator profile ─────────────────────────────────────────
    const { data: creatorProfile, error: creatorError } = await supabase
      .from('profiles')
      .select('id, is_creator_subscribed, payout_setup_complete')
      .eq('id', link.creator_id)
      .single();

    if (creatorError || !creatorProfile) {
      return jsonError('Creator profile not found', 400, corsHeaders);
    }

    // Payout setup is NOT required to sell — earnings go to the internal wallet.
    // IBAN is only needed when the creator wants to withdraw.

    // ── Resolve chatter tracking ──────────────────────────────────────
    let resolvedChatterId: string | null = null;
    if (chatterRef) {
      try {
        const { data: chatterId } = await supabase.rpc('resolve_chatter_ref', {
          p_chatter_ref: chatterRef,
        });
        if (chatterId) {
          resolvedChatterId = chatterId as string;
          console.log('Chatter attribution resolved:', resolvedChatterId);
        }
      } catch (err) {
        console.error('Error resolving chatter_ref:', err);
      }
    }

    // ── Calculate pricing ─────────────────────────────────────────────
    const baseCents = link.price_cents;
    const fanProcessingFeeCents = Math.round(baseCents * 0.15);
    const totalFanPaysCents = baseCents + fanProcessingFeeCents;

    let chatterEarningsCents = 0;
    let creatorNetCents: number;
    let platformFeeCents: number;

    if (resolvedChatterId) {
      // 60/25/15 split
      creatorNetCents = Math.round(baseCents * 0.60);
      chatterEarningsCents = Math.round(baseCents * 0.25);
      platformFeeCents = Math.round(baseCents * 0.15) + fanProcessingFeeCents;
    } else {
      // Standard split
      const isSubscribed = creatorProfile.is_creator_subscribed === true;
      const commissionRate = isSubscribed ? 0 : 0.15;
      const platformCommissionCents = Math.round(baseCents * commissionRate);
      creatorNetCents = baseCents - platformCommissionCents;
      platformFeeCents = platformCommissionCents + fanProcessingFeeCents;
    }

    // ── Pre-create purchase record ────────────────────────────────────
    const { data: purchase, error: insertError } = await supabase
      .from('purchases')
      .insert({
        link_id: link.id,
        amount_cents: totalFanPaysCents,
        currency: 'USD',
        status: 'pending',
        access_token: crypto.randomUUID(),
        buyer_email: buyerEmail || null,
        creator_net_cents: creatorNetCents,
        platform_fee_cents: platformFeeCents,
        ugp_mid: midKey,
        ...(conversationId ? { chat_conversation_id: conversationId } : {}),
        ...(resolvedChatterId ? {
          chat_chatter_id: resolvedChatterId,
          chatter_earnings_cents: chatterEarningsCents,
        } : {}),
      })
      .select('id')
      .single();

    if (insertError || !purchase) {
      console.error('Error creating purchase record:', insertError);
      return jsonError('Unable to start checkout', 500, corsHeaders);
    }

    const merchantReference = `link_${purchase.id}`;
    const amountDecimal = (totalFanPaysCents / 100).toFixed(2);

    // ── Build QuickPay form fields ────────────────────────────────────
    const fields: Record<string, string> = {
      QuickPayToken: creds.quickPayToken,
      SiteID: creds.siteId,
      AmountTotal: amountDecimal,
      CurrencyID: 'USD',
      'ItemName[0]': `Unlock: ${(link.title || 'Exclusive content').slice(0, 200)}`,
      'ItemQuantity[0]': '1',
      'ItemAmount[0]': amountDecimal,
      'ItemDesc[0]': 'One-time access to exclusive content on Exclu (includes 15% processing fee)',
      AmountShipping: '0.00',
      ShippingRequired: 'false',
      MembershipRequired: 'false',
      ApprovedURL: `${siteUrl}/l/${encodeURIComponent(slug)}?payment_success=true&ref=${merchantReference}`,
      ConfirmURL: `${siteUrl}/api/ugp-confirm`,
      DeclinedURL: `${siteUrl}/l/${encodeURIComponent(slug)}?payment_failed=true`,
      MerchantReference: merchantReference,
    };

    // Pre-fill customer email if available
    if (buyerEmail) {
      fields.Email = buyerEmail;
    }

    // Store the MerchantReference on the purchase for reconciliation
    await supabase.from('purchases').update({
      ugp_merchant_reference: merchantReference,
    }).eq('id', purchase.id);

    return jsonOk({ fields }, corsHeaders);

  } catch (error) {
    console.error('Error in create-link-checkout:', error);
    return jsonError('Unable to start checkout', 500, corsHeaders);
  }
});
