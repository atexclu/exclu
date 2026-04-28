import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('PROJECT_URL') ?? Deno.env.get('VITE_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL');
const supabaseServiceRoleKey =
  Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const siteUrl = Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at';

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    'Missing SUPABASE_URL/PROJECT_URL or SUPABASE_SERVICE_ROLE_KEY/SERVICE_ROLE_KEY'
  );
}

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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

// Very lightweight in-memory rate limiting per IP and function instance.
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60; // per IP per window
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
    const body = await req.json();
    const handle = body?.handle as string | undefined;
    const profileIdParam = body?.profile_id as string | undefined;

    if (!handle || typeof handle !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing or invalid handle' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Silent no-op if the creator's account has been soft-deleted. We return
    // 200 (not 404/410) so old indexed URLs / cached HTML in the wild don't
    // start erroring — the view simply doesn't get counted.
    {
      const { data: profileRow } = await supabaseAdmin
        .from('profiles')
        .select('id, deleted_at')
        .eq('handle', handle)
        .maybeSingle();
      if (profileRow && profileRow.deleted_at) {
        return new Response(JSON.stringify({ success: true, skipped: 'deleted_creator' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Single atomic RPC (migration 157). Replaces the previous 4-roundtrip
    // read-modify-write pattern that showed up as a CPU hotspot in the
    // 2026-04-21 incident postmortem (27k UPDATEs on profiles, 8k on
    // creator_profiles, with a lost-update race under concurrent views).
    const { error: rpcError } = await supabaseAdmin.rpc('increment_profile_views_atomic', {
      p_handle: handle,
      p_profile_id: profileIdParam ?? null,
    });

    if (rpcError) {
      console.error('[increment-profile-view] increment_profile_views_atomic failed', rpcError);
      return new Response(JSON.stringify({ error: 'increment_failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Unexpected error in increment-profile-view function', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
