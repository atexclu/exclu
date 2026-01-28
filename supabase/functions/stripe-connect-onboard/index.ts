import Stripe from 'npm:stripe';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');

// Prefer the standard Supabase Edge env vars, but fall back to the legacy names
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

const siteUrl = Deno.env.get('PUBLIC_SITE_URL');

// Countries for which we explicitly support Stripe Connect Express onboarding.
// This list must stay in sync with the STRIPE_SUPPORTED_COUNTRIES constant
// in the frontend Onboarding page.
const SUPPORTED_STRIPE_CONNECT_COUNTRIES = [
  'US', // United States
  'GB', // United Kingdom
  'CA', // Canada
  'AU', // Australia
  'NZ', // New Zealand
  'FR', // France
  'DE', // Germany
  'ES', // Spain
  'IT', // Italy
  'NL', // Netherlands
  'BE', // Belgium
  'CH', // Switzerland
  'AT', // Austria
  'IE', // Ireland
  'PT', // Portugal
  'PL', // Poland
  'CZ', // Czech Republic
  'DK', // Denmark
  'FI', // Finland
  'NO', // Norway
  'SE', // Sweden
  'BR', // Brazil
  'MX', // Mexico
];

if (!stripeSecretKey) {
  throw new Error('Missing STRIPE_SECRET_KEY environment variable');
}

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing SUPABASE_URL/PROJECT_URL or SUPABASE_SERVICE_ROLE_KEY/SERVICE_ROLE_KEY environment variables');
}

if (!supabaseAnonKey) {
  throw new Error('Missing SUPABASE_ANON_KEY environment variable');
}

if (!siteUrl) {
  throw new Error('Missing PUBLIC_SITE_URL environment variable');
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2023-10-16',
});

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  // Allow the default Supabase headers plus our custom auth header
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-auth',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get the user from a dedicated header carrying the Supabase access token.
    // We use a custom header (x-supabase-auth) so that the Functions gateway
    // can continue to use the project key for its own Authorization header.
    const rawToken = req.headers.get('x-supabase-auth') ?? '';
    const token = rawToken.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing or invalid authorization token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create a Supabase client for Auth calls. We don't need to bind
    // global headers; we pass the token directly to auth.getUser(token).
    const supabaseAuthClient = createClient(supabaseUrl, supabaseAnonKey);

    const {
      data: { user },
      error: userError,
    } = await supabaseAuthClient.auth.getUser(token);

    if (userError || !user) {
      console.error('Auth error in stripe-connect-onboard:', userError);
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the creator's profile, including their country of residence
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, stripe_account_id, stripe_connect_status, country')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('Error loading profile for Stripe Connect onboarding', profileError);
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!profile.country) {
      console.error('Profile missing country for Stripe Connect onboarding');
      return new Response(
        JSON.stringify({ error: 'Please set your country in your profile before connecting Stripe.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Extra safety: only allow countries that we explicitly support in our onboarding UI.
    if (!SUPPORTED_STRIPE_CONNECT_COUNTRIES.includes(profile.country)) {
      console.error('Unsupported country for Stripe Connect onboarding:', profile.country);
      return new Response(
        JSON.stringify({
          error:
            'Your country is not yet supported for payouts on Exclu. Please contact support if you think this is a mistake.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    let stripeAccountId = profile.stripe_account_id;

    // If a Stripe account already exists, ensure it matches the creator's current country.
    // Stripe does not allow changing the country of an existing Connect account, so if the
    // profile.country has changed since the first onboarding attempt, we transparently
    // create a new Express account in the correct country and update the profile.
    if (stripeAccountId) {
      try {
        const existingAccount = await stripe.accounts.retrieve(stripeAccountId);
        const accountCountry = (existingAccount as any).country as string | null;

        if (accountCountry && accountCountry !== profile.country) {
          console.warn(
            'Stripe account country mismatch for user',
            user.id,
            'existing account country =',
            accountCountry,
            'profile.country =',
            profile.country,
          );

          const newAccount = await stripe.accounts.create({
            type: 'express',
            country: profile.country,
            email: user.email ?? undefined,
            capabilities: {
              card_payments: { requested: true },
              transfers: { requested: true },
            },
            metadata: {
              supabase_user_id: user.id,
            },
          });

          stripeAccountId = newAccount.id;

          const { error: updateError } = await supabaseAdmin
            .from('profiles')
            .update({
              stripe_account_id: stripeAccountId,
              stripe_connect_status: 'pending',
            })
            .eq('id', user.id);

          if (updateError) {
            console.error('Error updating profile with new Stripe account after country mismatch', updateError);
            return new Response(JSON.stringify({ error: 'Failed to align Stripe account with your country' }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
      } catch (err) {
        console.error('Error retrieving existing Stripe account, will fall back to creating a new one', err);
        // If we cannot safely use the existing account, create a fresh one below.
        stripeAccountId = null;
      }
    }

    // If no Stripe account exists (first time or after mismatch), create one
    if (!stripeAccountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: profile.country,
        email: user.email ?? undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: {
          supabase_user_id: user.id,
        },
      });

      stripeAccountId = account.id;

      // Save the Stripe account ID to the profile
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({
          stripe_account_id: stripeAccountId,
          stripe_connect_status: 'pending',
        })
        .eq('id', user.id);

      if (updateError) {
        console.error('Error saving Stripe account ID to profile', updateError);
        return new Response(JSON.stringify({ error: 'Failed to save Stripe account' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Create an Account Link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${siteUrl.replace(/\/$/, '')}/app?stripe_onboarding=refresh`,
      return_url: `${siteUrl.replace(/\/$/, '')}/app?stripe_onboarding=return`,
      type: 'account_onboarding',
    });

    return new Response(JSON.stringify({ url: accountLink.url }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in stripe-connect-onboard function', error);
    return new Response(JSON.stringify({ error: 'Unable to start Stripe Connect onboarding' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
