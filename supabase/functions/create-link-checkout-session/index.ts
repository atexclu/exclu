import Stripe from 'npm:stripe';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripeSecretKeyLive = Deno.env.get('STRIPE_SECRET_KEY');
const stripeSecretKeyTest = Deno.env.get('STRIPE_SECRET_KEY_TEST');
const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
const siteUrl = Deno.env.get('PUBLIC_SITE_URL');

if (!stripeSecretKeyLive) {
  throw new Error('Missing STRIPE_SECRET_KEY environment variable');
}

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY environment variables');
}

if (!siteUrl) {
  throw new Error('Missing PUBLIC_SITE_URL environment variable');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// CORS: restrict to the main site URL + local dev origins instead of wildcard "*".
const normalizedSiteOrigin = siteUrl.replace(/\/$/, '');
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
  const allowedOrigin = allowedOrigins.includes(origin) ? origin : normalizedSiteOrigin;

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-auth',
  };
}

// Very lightweight in-memory rate limiting per IP and function instance.
// This is a best-effort protection: it may reset when the Edge Function is
// re-deployed or scaled, but still helps absorb basic abuse.
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 20; // per IP per window
const ipHits = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const existing = ipHits.get(ip);

  if (!existing || now - existing.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipHits.set(ip, { count: 1, windowStart: now });
    return false;
  }

  existing.count += 1;
  ipHits.set(ip, existing);
  return existing.count > RATE_LIMIT_MAX_REQUESTS;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('cf-connecting-ip') ??
    'unknown';

  if (isRateLimited(ip)) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const slug = body?.slug as string | undefined;

    // Auto-detect test mode: use test keys when request comes from localhost
    const origin = req.headers.get('origin') ?? '';
    const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');
    const stripeKey = isLocalhost && stripeSecretKeyTest ? stripeSecretKeyTest : stripeSecretKeyLive!;
    const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });
    if (isLocalhost) console.log('Test mode: using test Stripe key for localhost origin', origin);

    // Basic email validation to avoid storing malformed addresses.
    const rawBuyerEmail = typeof body?.buyerEmail === 'string' ? body.buyerEmail.trim() : '';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const buyerEmail = emailRegex.test(rawBuyerEmail) ? rawBuyerEmail : undefined;
    const conversationId = typeof body?.conversation_id === 'string' ? body.conversation_id : null;
    const chatterRef = typeof body?.chtref === 'string' ? body.chtref.trim() : null;

    if (!slug || typeof slug !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing or invalid slug' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch link data (price, currency, creator)
    const { data: link, error: linkError } = await supabase
      .from('links')
      .select('id, title, price_cents, currency, status, creator_id, slug')
      .eq('slug', slug)
      .single();

    if (linkError || !link) {
      console.error('Error loading link for checkout', linkError);
      return new Response(JSON.stringify({ error: 'Link not found or unavailable' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (link.status !== 'published') {
      return new Response(JSON.stringify({ error: 'Link is not available for purchase' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!link.price_cents || link.price_cents <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid price for this link' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch creator profile to determine Stripe Connect account and commission plan
    const { data: creatorProfile, error: creatorProfileError } = await supabase
      .from('profiles')
      .select('stripe_account_id, is_creator_subscribed, stripe_connect_status')
      .eq('id', link.creator_id)
      .single();

    if (creatorProfileError || !creatorProfile) {
      console.error('Error loading creator profile for checkout', creatorProfileError);
      return new Response(JSON.stringify({ error: 'Creator profile not found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!creatorProfile.stripe_account_id) {
      return new Response(JSON.stringify({ error: 'Creator is not ready to receive payouts yet' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Optional extra safety: ensure the Connect account is fully onboarded
    if (creatorProfile.stripe_connect_status !== 'complete') {
      return new Response(JSON.stringify({ error: 'Creator is still finishing payout setup. Please try again later.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // We standardize on USD for the platform
    const currency = 'usd';

    // ── Resolve chatter tracking code (if sale is attributed to a chatter) ──
    let resolvedChatterId: string | null = null;
    if (chatterRef) {
      try {
        const { data: chatterId } = await supabase.rpc('resolve_chatter_ref', {
          p_chatter_ref: chatterRef,
        });
        if (chatterId) {
          resolvedChatterId = chatterId as string;
          console.log('Chatter attribution resolved:', resolvedChatterId, 'from ref:', chatterRef);
        }
      } catch (err) {
        console.error('Error resolving chatter_ref:', err);
      }
    }

    // ── Calculate pricing ────────────────────────────────────────────────
    // Fan always pays base_price + 5% processing fee.
    // Revenue split depends on whether a chatter is attributed:
    //
    // WITH chatter (60/25/15 — regardless of premium status):
    //   Creator: 60% of base_price  →  sent to Stripe Connect
    //   Chatter: 25% of base_price  →  tracked in DB wallet
    //   Exclu:   15% of base_price + 5% processing fee  →  application_fee
    //
    // WITHOUT chatter (standard split):
    //   Premium: Creator 100%, Exclu 5% (processing only)
    //   Free:    Creator 90%, Exclu 10% + 5%
    const creatorPriceCents = link.price_cents;
    const fanProcessingFeeCents = Math.round(creatorPriceCents * 0.05);
    const totalFanPaysCents = creatorPriceCents + fanProcessingFeeCents;

    let applicationFeeAmount: number;
    let chatterEarningsCents = 0;
    let creatorNetCents: number;
    let platformFeeCents: number;

    if (resolvedChatterId) {
      // Chatter-attributed sale: 60/25/15 split
      creatorNetCents = Math.round(creatorPriceCents * 0.60);
      chatterEarningsCents = Math.round(creatorPriceCents * 0.25);
      platformFeeCents = Math.round(creatorPriceCents * 0.15) + fanProcessingFeeCents;
      // Exclu retains chatter's share + platform share + processing fee
      applicationFeeAmount = chatterEarningsCents + platformFeeCents;
    } else {
      // Standard split (no chatter)
      const isSubscribed = creatorProfile.is_creator_subscribed === true;
      const commissionRate = isSubscribed ? 0 : 0.1;
      const platformCommissionCents = Math.round(creatorPriceCents * commissionRate);
      platformFeeCents = platformCommissionCents + fanProcessingFeeCents;
      creatorNetCents = creatorPriceCents - platformCommissionCents;
      applicationFeeAmount = platformFeeCents;
    }

    const successUrl = `${siteUrl.replace(/\/$/, '')}/l/${encodeURIComponent(slug)}?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${siteUrl.replace(/\/$/, '')}/l/${encodeURIComponent(slug)}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency,
            unit_amount: totalFanPaysCents,
            product_data: {
              name: 'Creator drop access',
              description: 'One-time access to exclusive content on Exclu (includes 5% processing fee)',
            },
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        link_id: link.id,
        creator_id: link.creator_id ?? '',
        slug: link.slug ?? slug,
        buyerEmail: buyerEmail ?? '',
        ...(conversationId ? { conversation_id: conversationId } : {}),
        ...(resolvedChatterId ? {
          chatter_id: resolvedChatterId,
          chatter_earnings_cents: String(chatterEarningsCents),
          creator_net_cents: String(creatorNetCents),
          platform_fee_cents: String(platformFeeCents),
        } : {}),
      },
      customer_email: buyerEmail,
      payment_intent_data: {
        application_fee_amount: applicationFeeAmount,
        transfer_data: {
          destination: creatorProfile.stripe_account_id,
        },
      },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const stripeError = error as any;
    const raw = stripeError?.raw;
    console.error('Error in create-link-checkout-session function', {
      message: stripeError?.message,
      type: raw?.type,
      code: raw?.code,
      param: raw?.param,
      detail: raw?.message,
    });

    // If Stripe complains that the destination account is missing capabilities,
    // surface a clearer message to the fan instead of a generic 500.
    if (
      raw?.type === 'invalid_request_error' &&
      raw?.param === 'payment_intent_data[transfer_data][destination]'
    ) {
      return new Response(
        JSON.stringify({
          error:
            'The creator is still completing their payout setup. Please try again once their account is fully verified.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    return new Response(JSON.stringify({ error: 'Unable to start checkout session' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
