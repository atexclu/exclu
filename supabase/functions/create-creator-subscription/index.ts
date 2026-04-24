/**
 * create-creator-subscription — initial checkout for a creator Pro subscription.
 *
 * Issues a QuickPay ONE-SHOT Sale for the total amount (base + extras). The
 * ConfirmURL callback (state=Sale) stores the TransactionID on profiles.
 * From there, rebill-subscriptions cron drives monthly charges via
 * /recurringtransactions — UG no longer manages a subscription plan for us.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { routeMidForCountry, getMidCredentials } from '../_shared/ugRouting.ts';

const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
const siteUrl = (Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at').replace(/\/$/, '');

if (!supabaseUrl || !supabaseServiceRoleKey) throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY');
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const BASE_MONTHLY_CENTS = 3999;   // $39.99
const ADDON_PER_PROFILE_CENTS = 1000; // $10
const INCLUDED_PROFILES = 2;
const ANNUAL_CENTS = 23999;        // $239.99

type Plan = 'monthly' | 'annual';

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  const allowed = ['http://localhost:8080', 'http://localhost:5173', siteUrl];
  return {
    'Access-Control-Allow-Origin': (allowed.includes(origin) || /^https:\/\/exclu-[a-z0-9-]+-atexclus-projects\.vercel\.app$/.test(origin)) ? origin : siteUrl,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return new Response(JSON.stringify({ error: 'Missing authorization header' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });

    const token = auth.replace('Bearer ', '');
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !user) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });

    const body = await req.json().catch(() => ({}));

    // Chatter attribution policy (locked 2026-04-21): chatters earn ONLY on link
    // purchases + custom request captures. Tips, gifts, and subs never split revenue
    // with a chatter. If a legacy client still sends `chtref` on this flow, drop it
    // and log for observability — we do NOT propagate it to the created row.
    const rogueChtref = typeof body?.chtref === 'string' ? body.chtref : null;
    if (rogueChtref) {
      console.warn(`[create-creator-subscription] ignoring chtref=${rogueChtref} — chatters don't earn on this flow`);
    }

    const plan: Plan = body?.plan === 'annual' ? 'annual' : 'monthly';
    const country = typeof body?.country === 'string' ? body.country.toUpperCase() : null;

    // Fetch current profile count for monthly pricing
    const { data: profilesRows } = await supabase
      .from('creator_profiles')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true);
    const profileCount = Math.max(1, profilesRows?.length ?? 1);

    const extraProfiles = Math.max(0, profileCount - INCLUDED_PROFILES);
    const amountCents = plan === 'annual'
      ? ANNUAL_CENTS
      : BASE_MONTHLY_CENTS + extraProfiles * ADDON_PER_PROFILE_CENTS;

    // Prevent duplicate identical plan; allow switching to a different plan.
    // When switching (e.g. monthly → annual) we set cancel_at_period_end on the
    // current sub so the rebill cron stops charging the old TID. The new Sale
    // starts immediately on confirm; the old plan runs out at its period_end
    // with no further billing. Disclosed in the UI switch dialog.
    const { data: profile } = await supabase.from('profiles')
      .select('subscription_plan, subscription_period_end')
      .eq('id', user.id).maybeSingle();
    const currentPlan = (profile?.subscription_plan ?? 'free') as 'free' | 'monthly' | 'annual';
    if (currentPlan === plan) {
      return new Response(
        JSON.stringify({ error: 'Already subscribed to this plan' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
      );
    }
    if (currentPlan !== 'free') {
      await supabase.from('profiles').update({
        subscription_cancel_at_period_end: true,
      }).eq('id', user.id);
      console.log(`[create-creator-subscription] plan switch ${currentPlan} → ${plan} for user=${user.id}; old sub marked cancel_at_period_end`);
    }

    const midKey = routeMidForCountry(country);
    const creds = getMidCredentials(midKey);

    const merchantReference = `sub_${plan}_${user.id}`;
    const amountDecimal = (amountCents / 100).toFixed(2);

    const fields: Record<string, string> = {
      QuickPayToken: creds.quickPayToken,
      SiteID: creds.siteId,
      AmountTotal: amountDecimal,
      CurrencyID: 'USD',
      'ItemName[0]': plan === 'annual' ? 'Exclu Pro Annual' : 'Exclu Pro Monthly',
      'ItemQuantity[0]': '1',
      'ItemAmount[0]': amountDecimal,
      'ItemDesc[0]': plan === 'annual'
        ? 'Pro Annual subscription — 0% commission, unlimited profiles'
        : `Pro Monthly — 0% commission, ${profileCount} profile(s)`,
      AmountShipping: '0.00',
      ShippingRequired: 'false',
      MembershipRequired: 'false',
      // CRITICAL: tags this TID as rebill-eligible at the UG gateway. Without
      // this, future /recurringtransactions calls against this TID may be
      // rejected. Confirmed required per QuickPay doc §QUICKPAY FIELDS and
      // DirectSale doc §SaleTransactions ("isInitialForRecurring mandatory").
      IsInitialForRecurring: 'true',
      ApprovedURL: `${siteUrl}/app?subscription=success`,
      ConfirmURL: `${siteUrl}/api/ugp-confirm`,
      DeclinedURL: `${siteUrl}/app?subscription=failed`,
      MerchantReference: merchantReference,
      Email: user.email ?? '',
    };

    return new Response(JSON.stringify({ fields, amountCents, plan, mid: midKey }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('create-creator-subscription error:', err);
    return new Response(JSON.stringify({ error: 'Unable to start checkout' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
