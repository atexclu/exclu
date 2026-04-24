/**
 * create-creator-subscription — UGPayments QuickPay version.
 *
 * For non-subscribers: returns { fields } for QuickPay subscription form.
 * For existing subscribers: returns { manage: true } (frontend shows manage UI).
 *
 * Auth: Required (creator must be logged in)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
const siteUrl = (Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at').replace(/\/$/, '');
const quickPayToken = Deno.env.get('QUICKPAY_TOKEN');
const siteId = Deno.env.get('QUICKPAY_SITE_ID') || '98845';
const subscriptionPlanId = Deno.env.get('QUICKPAY_SUB_PLAN_ID') || '11027';

if (!supabaseUrl || !supabaseServiceRoleKey) throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY');
if (!quickPayToken) throw new Error('Missing QUICKPAY_TOKEN');

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

const normalizedSiteOrigin = siteUrl;
const allowedOrigins = [
  normalizedSiteOrigin,
  'http://localhost:8080', 'http://localhost:8081', 'http://localhost:8082',
  'http://localhost:8083', 'http://localhost:8084', 'http://localhost:5173',
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  const allowed = allowedOrigins.includes(origin) ? origin : normalizedSiteOrigin;
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

function jsonOk(data: Record<string, unknown>, cors: Record<string, string>) {
  return new Response(JSON.stringify(data), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function jsonError(msg: string, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // ── Auth required ─────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonError('Missing authorization header', 401, corsHeaders);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) return jsonError('Invalid or expired token', 401, corsHeaders);

    // ── Fetch profile ─────────────────────────────────────────────────
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, is_creator_subscribed, subscription_ugp_username')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) return jsonError('Profile not found', 400, corsHeaders);

    // ── Already subscribed → return manage flag ───────────────────────
    // The frontend will show the manage UI (cancel button, pricing info)
    // instead of a new checkout form. Cancellation is done via HTML form
    // posted directly to QuickPay Cancel endpoint (see Profile.tsx).
    if (profile.is_creator_subscribed) {
      return jsonOk({
        manage: true,
        subscription_username: profile.subscription_ugp_username || user.id,
      }, corsHeaders);
    }

    // ── Build QuickPay subscription form fields ───────────────────────
    const merchantReference = `sub_${user.id}`;

    const fields: Record<string, string> = {
      QuickPayToken: quickPayToken!,
      SiteID: siteId,
      AmountTotal: '0.00', // Subscription amount is managed by the plan
      CurrencyID: 'USD',
      AmountShipping: '0.00',
      ShippingRequired: 'false',
      MembershipRequired: 'true',
      ShowUserNamePassword: 'false',
      MembershipUsername: user.id, // UUID as membership username (used for cancel)
      SubscriptionPlanId: subscriptionPlanId,
      'ItemName[0]': 'Exclu Premium Creator Plan',
      'ItemQuantity[0]': '1',
      'ItemAmount[0]': '0.00',
      'ItemDesc[0]': 'Monthly subscription — 0% commission on all sales ($39.99/month)',
      ApprovedURL: `${siteUrl}/app?subscription=success`,
      ConfirmURL: `${siteUrl}/api/ugp-confirm`,
      DeclinedURL: `${siteUrl}/app?subscription=failed`,
      MerchantReference: merchantReference,
      Email: user.email || '',
    };

    // Store the username we're using for later cancel operations
    await supabaseAdmin.from('profiles').update({
      subscription_ugp_username: user.id,
    }).eq('id', user.id);

    return jsonOk({ fields }, corsHeaders);

  } catch (error) {
    console.error('Error in create-creator-subscription:', error);
    return jsonError('Unable to start subscription checkout', 500, corsHeaders);
  }
});
