import Stripe from 'npm:stripe';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripeSecretKeyLive = Deno.env.get('STRIPE_SECRET_KEY');
const stripeSecretKeyTest = Deno.env.get('STRIPE_SECRET_KEY_TEST');
const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
const siteUrl = Deno.env.get('PUBLIC_SITE_URL');
// Price ID for the $39/month creator subscription (live and test variants)
const creatorPriceIdLive = Deno.env.get('STRIPE_CREATOR_PRICE_ID');
const creatorPriceIdTest = Deno.env.get('STRIPE_CREATOR_PRICE_ID_TEST');

if (!stripeSecretKeyLive) {
  throw new Error('Missing STRIPE_SECRET_KEY environment variable');
}

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY environment variables');
}

if (!siteUrl) {
  throw new Error('Missing PUBLIC_SITE_URL environment variable');
}

if (!creatorPriceIdLive) {
  throw new Error('Missing STRIPE_CREATOR_PRICE_ID environment variable');
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Auto-detect test mode: use test keys when request comes from localhost
    const origin = req.headers.get('origin') ?? '';
    const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');
    const stripeKey = isLocalhost && stripeSecretKeyTest ? stripeSecretKeyTest : stripeSecretKeyLive!;
    const creatorPriceId = isLocalhost && creatorPriceIdTest ? creatorPriceIdTest : creatorPriceIdLive!;
    const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });
    if (isLocalhost) console.log('Test mode: using test Stripe key for localhost origin', origin);

    // Get the user from the Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');

    // Validate the user's JWT token using the admin client
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the creator's profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, stripe_customer_id, is_creator_subscribed')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('Error loading profile for subscription', profileError);
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If already subscribed, redirect to billing portal
    if (profile.is_creator_subscribed) {
      if (profile.stripe_customer_id) {
        const portalSession = await stripe.billingPortal.sessions.create({
          customer: profile.stripe_customer_id,
          return_url: `${siteUrl!.replace(/\/$/, '')}/app`,
        });
        return new Response(JSON.stringify({ url: portalSession.url }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    let customerId = profile.stripe_customer_id;

    // Create a Stripe customer if one doesn't exist
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
      if (updateError) {
        console.error('Error saving Stripe customer ID to profile', updateError);
      }
    }

    // Create a Checkout session for the subscription
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: creatorPriceId, quantity: 1 }],
      success_url: `${siteUrl!.replace(/\/$/, '')}/app?subscription=success`,
      cancel_url: `${siteUrl!.replace(/\/$/, '')}/app?subscription=cancelled`,
      metadata: { supabase_user_id: user.id },
      subscription_data: { metadata: { supabase_user_id: user.id } },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in create-creator-subscription function', error);
    return new Response(JSON.stringify({ error: 'Unable to start subscription checkout' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
