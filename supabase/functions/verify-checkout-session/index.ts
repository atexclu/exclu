import Stripe from 'npm:stripe';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
const siteUrl = Deno.env.get('PUBLIC_SITE_URL');

if (!stripeSecretKey) throw new Error('Missing STRIPE_SECRET_KEY');
if (!supabaseUrl || !supabaseServiceRoleKey) throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY');

const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' });
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const normalizedSiteOrigin = (siteUrl ?? '').replace(/\/$/, '');
const allowedOrigins = [
  normalizedSiteOrigin,
  'http://localhost:8080',
  'http://localhost:8081',
  'http://localhost:8082',
  'http://localhost:5173',
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  const allowedOrigin = allowedOrigins.includes(origin) ? origin : normalizedSiteOrigin;
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { session_id, link_id } = await req.json();

    if (!session_id || !link_id) {
      return new Response(JSON.stringify({ error: 'Missing session_id or link_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Check if purchase already exists in DB (webhook may have already processed it)
    const { data: existing } = await supabase
      .from('purchases')
      .select('id, access_expires_at, amount_cents, currency, created_at, email_sent, download_count')
      .eq('stripe_session_id', session_id)
      .eq('link_id', link_id)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ purchase: existing }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Not in DB yet — verify directly with Stripe
    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.retrieve(session_id, {
        expand: ['customer_details'],
      });
    } catch (err) {
      console.error('Stripe session retrieval failed:', err);
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Validate the session belongs to this link and is paid
    if (
      session.payment_status !== 'paid' ||
      session.status !== 'complete' ||
      session.metadata?.link_id !== link_id
    ) {
      return new Response(JSON.stringify({ error: 'Payment not completed or session mismatch' }), {
        status: 402,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Insert the purchase (idempotent — double-check race with webhook)
    const { data: raceCheck } = await supabase
      .from('purchases')
      .select('id, access_expires_at, amount_cents, currency, created_at, email_sent, download_count')
      .eq('stripe_session_id', session_id)
      .maybeSingle();

    if (raceCheck) {
      return new Response(JSON.stringify({ purchase: raceCheck }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const customerEmail = session.customer_details?.email ?? null;
    const { data: inserted, error: insertError } = await supabase
      .from('purchases')
      .insert({
        link_id,
        amount_cents: session.amount_total ?? 0,
        currency: session.currency?.toUpperCase() ?? 'USD',
        stripe_session_id: session_id,
        status: 'succeeded',
        buyer_email: customerEmail,
        access_token: crypto.randomUUID(),
      })
      .select('id, access_expires_at, amount_cents, currency, created_at, email_sent, download_count')
      .single();

    if (insertError) {
      console.error('Insert purchase error:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to record purchase' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Purchase recorded via verify-checkout-session for link:', link_id);

    return new Response(JSON.stringify({ purchase: inserted }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('verify-checkout-session error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
