/**
 * cancel-fan-subscription — Returns UGPayments QuickPay Cancel form fields for
 * a fan → creator subscription. The browser POSTs the returned fields directly
 * to QuickPay's Cancel endpoint (same pattern as cancel-creator-subscription).
 *
 * We also set cancel_at_period_end=true immediately so the UI can reflect the
 * pending cancellation. Status stays 'active' until UGP fires the Cancel
 * postback (ugp-membership-confirm then flips status → 'cancelled'); access
 * persists until period_end regardless.
 *
 * Auth: required (fan must own the subscription).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
const quickPayToken = Deno.env.get('QUICKPAY_TOKEN');
const siteId = Deno.env.get('QUICKPAY_SITE_ID') || '98845';
const siteUrl = (Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at').replace(/\/$/, '');

if (!supabaseUrl || !supabaseServiceRoleKey) throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY');
if (!quickPayToken) throw new Error('Missing QUICKPAY_TOKEN');

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

const allowedOrigins = [
  siteUrl,
  'http://localhost:8080', 'http://localhost:8081', 'http://localhost:8082',
  'http://localhost:8083', 'http://localhost:8084', 'http://localhost:5173',
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const allowed = allowedOrigins.includes(origin) ? origin : siteUrl;
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

function jsonOk(data: Record<string, unknown>, cors: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function jsonError(msg: string, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonError('Missing authorization header', 401, corsHeaders);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) return jsonError('Invalid or expired token', 401, corsHeaders);

    const body = await req.json().catch(() => ({}));
    const subId = typeof body?.subscription_id === 'string' ? body.subscription_id : null;
    if (!subId) return jsonError('Missing subscription_id', 400, corsHeaders);

    const { data: sub } = await supabaseAdmin
      .from('fan_creator_subscriptions')
      .select('id, fan_id, status, ugp_membership_username, period_end')
      .eq('id', subId)
      .single();

    if (!sub || sub.fan_id !== user.id) return jsonError('Subscription not found', 404, corsHeaders);
    if (sub.status !== 'active') return jsonError('Subscription is not active', 400, corsHeaders);

    // Mark pending cancellation immediately so the UI updates without waiting for UGP.
    await supabaseAdmin
      .from('fan_creator_subscriptions')
      .update({ cancel_at_period_end: true })
      .eq('id', subId);

    return jsonOk({
      action: 'https://quickpay.ugpayments.ch/Cancel',
      fields: {
        QuickpayToken: quickPayToken!,
        username: sub.ugp_membership_username || sub.id,
        SiteID: siteId,
      },
      period_end: sub.period_end,
    }, corsHeaders);
  } catch (err) {
    console.error('Error in cancel-fan-subscription:', err);
    return jsonError('Unable to cancel subscription', 500, corsHeaders);
  }
});
