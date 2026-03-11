import Stripe from 'npm:stripe';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripeSecretKeyLive = Deno.env.get('STRIPE_SECRET_KEY');
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

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
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
    // Auth is optional — authenticated fans are tracked, guests tip anonymously
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

    if (!creatorId || typeof creatorId !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing creator_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Prevent a logged-in creator from tipping themselves
    if (fanUserId && fanUserId === creatorId) {
      return new Response(JSON.stringify({ error: 'You cannot tip yourself' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!amountCents || typeof amountCents !== 'number' || amountCents < 100) {
      return new Response(JSON.stringify({ error: 'Invalid amount (minimum $1.00)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (amountCents > 50000) {
      return new Response(JSON.stringify({ error: 'Maximum tip is $500.00' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch creator profile
    const { data: creator, error: creatorError } = await supabase
      .from('profiles')
      .select('id, handle, stripe_account_id, stripe_connect_status, is_creator_subscribed, tips_enabled, min_tip_amount_cents, display_name')
      .eq('id', creatorId)
      .single();

    if (creatorError || !creator) {
      return new Response(JSON.stringify({ error: 'Creator not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!creator.tips_enabled) {
      return new Response(JSON.stringify({ error: 'This creator does not accept tips' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const minTip = creator.min_tip_amount_cents || 500;
    if (amountCents < minTip) {
      return new Response(JSON.stringify({ error: `Minimum tip is $${(minTip / 100).toFixed(2)}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!creator.stripe_account_id || creator.stripe_connect_status !== 'complete') {
      return new Response(JSON.stringify({ error: 'Creator is not ready to receive payments yet' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Tips always use live Stripe keys — Connect transfers require the live account.
    // Test mode Connect accounts are separate and not stored on profiles.
    const stripe = new Stripe(stripeSecretKeyLive!, { apiVersion: '2023-10-16' });

    // Create tip record in DB (pending) — fan_id is null for guest tippers
    const { data: tipRecord, error: tipInsertError } = await supabase
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

    if (tipInsertError || !tipRecord) {
      console.error('Error inserting tip record', tipInsertError);
      return new Response(JSON.stringify({ error: 'Failed to create tip' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate pricing (same logic as link checkout)
    // Fan pays +5% processing fee
    const fanProcessingFeeCents = Math.round(amountCents * 0.05);
    const totalFanPaysCents = amountCents + fanProcessingFeeCents;

    // Platform commission: 10% free plan, 0% premium
    const isSubscribed = creator.is_creator_subscribed === true;
    const commissionRate = isSubscribed ? 0 : 0.1;
    const platformCommissionCents = Math.round(amountCents * commissionRate);
    const applicationFeeAmount = platformCommissionCents + fanProcessingFeeCents;

    const creatorHandle = creator.handle || creatorId;
    const successParams = new URLSearchParams({
      creator: creatorHandle,
      amount: String(amountCents),
      tip_id: tipRecord.id,
    });
    if (message) successParams.set('message', message);
    if (!fanUserId) successParams.set('guest', '1');
    const successUrl = `${normalizedSiteOrigin}/tip-success?${successParams.toString()}`;
    const cancelUrl = `${normalizedSiteOrigin}/${encodeURIComponent(creatorHandle)}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: totalFanPaysCents,
            product_data: {
              name: `Tip for ${creator.display_name || creatorHandle}`,
              description: 'One-time tip on Exclu (includes 5% processing fee)',
            },
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        type: 'tip',
        tip_id: tipRecord.id,
        fan_id: fanUserId ?? '',
        creator_id: creatorId,
        profile_id: profileId ?? '',
        fan_name: fanName ?? '',
      },
      payment_intent_data: {
        application_fee_amount: applicationFeeAmount,
        transfer_data: {
          destination: creator.stripe_account_id,
        },
      },
    });

    // Store session ID on the tip record
    await supabase
      .from('tips')
      .update({ stripe_session_id: session.id })
      .eq('id', tipRecord.id);

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const stripeError = error as any;
    const raw = stripeError?.raw;
    console.error('Error in create-tip-checkout', {
      message: stripeError?.message,
      type: raw?.type,
      code: raw?.code,
      detail: raw?.message,
    });

    if (raw?.type === 'invalid_request_error') {
      const msg: string = raw?.message ?? '';
      if (
        raw?.param === 'payment_intent_data[transfer_data][destination]' ||
        msg.includes('cannot currently make live charges') ||
        msg.includes('charges_enabled') ||
        msg.includes('completing their') ||
        msg.includes('payout')
      ) {
        return new Response(
          JSON.stringify({ error: 'The creator is still completing their payout setup.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    console.error('Unhandled Stripe error:', stripeError?.message);
    return new Response(JSON.stringify({ error: 'Unable to start tip checkout' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
