/**
 * cancel-creator-subscription — Returns QuickPay Cancel form fields.
 *
 * The actual cancel is a browser-side form POST to QuickPay (required by UGP).
 * This function securely provides the form fields including the QUICKPAY_TOKEN
 * so the secret is never exposed in the client bundle.
 *
 * Auth: Required (creator must be logged in and subscribed)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
const quickPayToken = Deno.env.get('QUICKPAY_TOKEN');
const siteId = Deno.env.get('QUICKPAY_SITE_ID') || '98845';

if (!supabaseUrl || !supabaseServiceRoleKey) throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY');
if (!quickPayToken) throw new Error('Missing QUICKPAY_TOKEN');

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

const siteUrl = (Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at').replace(/\/$/, '');
const allowedOrigins = [
  siteUrl,
  'http://localhost:8080', 'http://localhost:8081', 'http://localhost:8082',
  'http://localhost:8083', 'http://localhost:8084', 'http://localhost:5173',
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  const allowed = allowedOrigins.includes(origin) ? origin : siteUrl;
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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonError('Missing authorization header', 401, corsHeaders);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) return jsonError('Invalid or expired token', 401, corsHeaders);

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, is_creator_subscribed, subscription_ugp_username')
      .eq('id', user.id)
      .single();

    if (!profile?.is_creator_subscribed) {
      return jsonError('No active subscription', 400, corsHeaders);
    }

    return jsonOk({
      action: 'https://quickpay.ugpayments.ch/Cancel',
      fields: {
        QuickpayToken: quickPayToken!,
        username: profile.subscription_ugp_username || user.id,
        SiteID: siteId,
      },
    }, corsHeaders);

  } catch (error) {
    console.error('Error in cancel-creator-subscription:', error);
    return jsonError('Unable to cancel subscription', 500, corsHeaders);
  }
});
