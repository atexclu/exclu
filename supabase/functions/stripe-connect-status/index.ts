import Stripe from 'npm:stripe';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');

if (!stripeSecretKey) {
  throw new Error('Missing STRIPE_SECRET_KEY environment variable');
}

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY environment variables');
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2023-10-16',
});

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function mapRequirementKeyToMessage(key: string): string {
  if (key.startsWith('individual.address')) {
    return 'Add or complete your personal address.';
  }
  if (key.startsWith('individual.verification.document')) {
    return 'Upload a valid identity document (ID, passport, or driver license).';
  }
  if (key.startsWith('individual.email')) {
    return 'Confirm your personal email address in Stripe.';
  }
  if (key.startsWith('individual.phone')) {
    return 'Add or verify your phone number in Stripe.';
  }
  if (key.startsWith('business_profile')) {
    return 'Complete your business profile details in Stripe.';
  }
  if (key.startsWith('external_account')) {
    return 'Add or confirm the bank account where payouts will be sent.';
  }
  return 'Provide additional information requested by Stripe.';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      console.error('Auth error in stripe-connect-status:', userError);
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('stripe_account_id, stripe_connect_status')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('Error loading profile for stripe-connect-status', profileError);
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!profile.stripe_account_id) {
      return new Response(
        JSON.stringify({
          status: profile.stripe_connect_status ?? 'no_account',
          disabled_reason: null,
          currently_due: [],
          past_due: [],
          pending_verification: [],
          friendly_messages: [],
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const account = await stripe.accounts.retrieve(profile.stripe_account_id);

    const requirements = (account as any).requirements || {};
    const currentlyDue: string[] = requirements.currently_due || [];
    const pastDue: string[] = requirements.past_due || [];
    const pendingVerification: string[] = requirements.pending_verification || [];
    const disabledReason: string | null = requirements.disabled_reason || null;

    let status: 'pending' | 'restricted' | 'complete' = 'pending';

    if ((account as any).charges_enabled && (account as any).payouts_enabled) {
      status = 'complete';
    } else if (disabledReason) {
      status = 'restricted';
    }

    const allKeys = new Set<string>();
    [...currentlyDue, ...pastDue, ...pendingVerification].forEach((key) => allKeys.add(key));

    const friendlyMessages = Array.from(allKeys).map(mapRequirementKeyToMessage);

    return new Response(
      JSON.stringify({
        status,
        disabled_reason: disabledReason,
        currently_due: currentlyDue,
        past_due: pastDue,
        pending_verification: pendingVerification,
        friendly_messages: friendlyMessages,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    console.error('Error in stripe-connect-status function', error);
    return new Response(JSON.stringify({ error: 'Unable to load Stripe status' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
