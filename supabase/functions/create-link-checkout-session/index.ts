import Stripe from 'npm:stripe';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
const siteUrl = Deno.env.get('PUBLIC_SITE_URL');

if (!stripeSecretKey) {
  throw new Error('Missing STRIPE_SECRET_KEY environment variable');
}

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY environment variables');
}

if (!siteUrl) {
  throw new Error('Missing PUBLIC_SITE_URL environment variable');
}
const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2023-10-16',
});

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// CORS: restrict to the main site URL + local dev origins instead of wildcard "*".
const normalizedSiteOrigin = siteUrl.replace(/\/$/, '');
const allowedOrigins = [
  normalizedSiteOrigin,
  'http://localhost:8080',
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

    // Basic email validation to avoid storing malformed addresses.
    const rawBuyerEmail = typeof body?.buyerEmail === 'string' ? body.buyerEmail.trim() : '';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const buyerEmail = emailRegex.test(rawBuyerEmail) ? rawBuyerEmail : undefined;

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

    // Calculate pricing:
    // - Creator sets their price (link.price_cents)
    // - Fan pays +5% processing fee on top
    // - Platform takes 10% commission from creator price (Free plan) or 0% (Premium plan)
    const creatorPriceCents = link.price_cents;
    const fanProcessingFeeCents = Math.round(creatorPriceCents * 0.05);
    const totalFanPaysCents = creatorPriceCents + fanProcessingFeeCents;

    // Determine platform commission based on creator plan
    // Free plan: 10% commission; subscribed plan ($39/mo): 0% commission
    const isSubscribed = creatorProfile.is_creator_subscribed === true;
    const commissionRate = isSubscribed ? 0 : 0.1;
    // Platform fee = commission on creator price + the 5% fan processing fee (goes to platform)
    const platformCommissionCents = Math.round(creatorPriceCents * commissionRate);
    const applicationFeeAmount = platformCommissionCents + fanProcessingFeeCents;

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
    console.error('Error in create-link-checkout-session function', error);

    const stripeError = error as any;
    const raw = stripeError?.raw;

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
