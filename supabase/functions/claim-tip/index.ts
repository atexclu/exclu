import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
const siteUrl = Deno.env.get('PUBLIC_SITE_URL');

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const normalizedSiteOrigin = (siteUrl || 'https://exclu.at').replace(/\/$/, '');
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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
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
    // Auth required — the user claiming the tip must be logged in
    const authHeader = req.headers.get('authorization') ?? '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return jsonError('Authentication required', 401, corsHeaders);

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return jsonError('Authentication required', 401, corsHeaders);

    const body = await req.json();
    const tipId = body?.tip_id as string;

    if (!tipId) return jsonError('Missing tip_id', 400, corsHeaders);

    // Fetch the tip — must be unclaimed (fan_id is null)
    const { data: tip, error: tipErr } = await supabase
      .from('tips')
      .select('id, fan_id, creator_id, is_anonymous, status')
      .eq('id', tipId)
      .single();

    if (tipErr || !tip) return jsonError('Tip not found', 404, corsHeaders);

    if (tip.fan_id) {
      // Already claimed — not an error, just a no-op
      return new Response(JSON.stringify({ success: true, already_claimed: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (tip.status !== 'succeeded') {
      return jsonError('Tip has not been completed yet', 400, corsHeaders);
    }

    // Claim the tip: set fan_id to current user
    const { error: updateErr } = await supabase
      .from('tips')
      .update({ fan_id: user.id })
      .eq('id', tipId)
      .is('fan_id', null);

    if (updateErr) {
      console.error('Error claiming tip:', updateErr);
      return jsonError('Failed to claim tip', 500, corsHeaders);
    }

    // Add creator to fan's favorites (upsert to avoid duplicates)
    const { error: favErr } = await supabase
      .from('fan_favorites')
      .upsert(
        { fan_id: user.id, creator_id: tip.creator_id },
        { onConflict: 'fan_id,creator_id' }
      );

    if (favErr) {
      console.error('Error adding favorite (non-fatal):', favErr);
    }

    return new Response(JSON.stringify({ success: true, claimed: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in claim-tip', error);
    return jsonError('Internal server error', 500, corsHeaders);
  }
});
