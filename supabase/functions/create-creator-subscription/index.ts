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

    // Fetch the creator's profile (including test customer ID for local dev)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, stripe_customer_id, stripe_customer_id_test, is_creator_subscribed')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('Error loading profile for subscription', profileError);
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Base redirect URL: use request origin in localhost so Stripe redirects back to local dev
    const baseUrl = (isLocalhost && origin) ? origin.replace(/\/$/, '') : siteUrl!.replace(/\/$/, '');

    // If already subscribed, open the Stripe Customer Portal
    if (profile.is_creator_subscribed) {
      // Pick the right customer ID for the current mode
      const portalCustomerId = isLocalhost
        ? profile.stripe_customer_id_test
        : profile.stripe_customer_id;

      if (portalCustomerId) {
        const portalSession = await stripe.billingPortal.sessions.create({
          customer: portalCustomerId,
          return_url: `${baseUrl}/app`,
        });
        return new Response(JSON.stringify({ url: portalSession.url }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // No customer ID available for this mode — fall through to create a new checkout
    }

    // In test mode, use the dedicated test customer ID column — never reuse the live ID
    // since customer IDs are scoped to a single Stripe account (live vs test).
    let customerId = isLocalhost
      ? (profile.stripe_customer_id_test ?? null)
      : (profile.stripe_customer_id ?? null);

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      // Persist to the appropriate column so the Customer Portal works on next visit
      const customerField = isLocalhost ? 'stripe_customer_id_test' : 'stripe_customer_id';
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({ [customerField]: customerId })
        .eq('id', user.id);
      if (updateError) {
        console.error(`Error saving ${customerField} to profile`, updateError);
      }
    }

    // Create a Checkout session for the subscription
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: creatorPriceId, quantity: 1 }],
      success_url: `${baseUrl}/app?subscription=success`,
      cancel_url: `${baseUrl}/app?subscription=cancelled`,
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
