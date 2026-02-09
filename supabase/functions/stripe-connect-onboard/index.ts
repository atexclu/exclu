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
    // Allow the default Supabase headers plus our custom auth header
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-supabase-auth',
  };
}

// Very lightweight in-memory rate limiting per IP and function instance.
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

    // By default, operate on the authenticated user. For admin requests that
    // include a target_user_id in the body, we can trigger onboarding for
    // another user while keeping the same Stripe + webhook logic.
    let subjectUserId = user.id;
    let subjectEmail = user.email ?? undefined;

    const body = await req.json().catch(() => null);
    const targetUserId = body?.target_user_id as string | undefined;

    if (targetUserId && targetUserId !== user.id) {
      // Ensure the caller is an admin before allowing cross-user onboarding.
      const { data: adminProfile, error: adminProfileError } = await supabaseAdmin
        .from('profiles')
        .select('id, is_admin')
        .eq('id', user.id)
        .maybeSingle();

      if (adminProfileError) {
        console.error('Error loading admin profile in stripe-connect-onboard', adminProfileError);
        return new Response(JSON.stringify({ error: 'Unable to verify admin status' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!adminProfile || adminProfile.is_admin !== true) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: targetUser, error: targetUserError } =
        await supabaseAdmin.auth.admin.getUserById(targetUserId);

      if (targetUserError || !targetUser || !targetUser.user) {
        console.error('Error loading target user in stripe-connect-onboard', targetUserError);
        return new Response(JSON.stringify({ error: 'Target user not found' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      subjectUserId = targetUserId;
      subjectEmail = targetUser.user.email ?? undefined;
    }

    // Fetch the creator's profile, including their country of residence
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, stripe_account_id, stripe_connect_status, country')
      .eq('id', subjectUserId)
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
            email: subjectEmail,
            capabilities: {
              card_payments: { requested: true },
              transfers: { requested: true },
            },
            metadata: {
              supabase_user_id: subjectUserId,
            },
          });

          stripeAccountId = newAccount.id;

          const { error: updateError } = await supabaseAdmin
            .from('profiles')
            .update({
              stripe_account_id: stripeAccountId,
              stripe_connect_status: 'pending',
            })
            .eq('id', subjectUserId);

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
        email: subjectEmail,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: {
          supabase_user_id: subjectUserId,
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
        .eq('id', subjectUserId);

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
