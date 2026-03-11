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

    // Step 1: Find the profile — try profiles.handle first, then creator_profiles.username
    let userId: string | null = null;
    let creatorProfileId: string | null = profileIdParam || null;

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, profile_view_count, is_creator')
      .eq('handle', handle)
      .maybeSingle();

    if (profile) {
      userId = (profile as any).id;

      // Only increment for creator profiles
      if ((profile as any).is_creator === false) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Always increment on profiles table (account-level counter)
      const currentViews = (profile as any).profile_view_count ?? 0;
      await supabaseAdmin
        .from('profiles')
        .update({ profile_view_count: currentViews + 1 })
        .eq('id', userId);

      console.log('[increment-profile-view] profiles.profile_view_count:', currentViews + 1);
    } else {
      // Try creator_profiles.username for additional profiles
      const { data: cpData } = await supabaseAdmin
        .from('creator_profiles')
        .select('id, user_id, profile_view_count')
        .eq('username', handle)
        .maybeSingle();

      if (!cpData) {
        console.error('Error loading profile for view increment', profileError);
        return new Response(JSON.stringify({ error: 'Profile not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      userId = (cpData as any).user_id;
      creatorProfileId = (cpData as any).id;
    }

    // Step 2: Increment on creator_profiles (per-profile counter)
    if (creatorProfileId) {
      const { data: cpRow } = await supabaseAdmin
        .from('creator_profiles')
        .select('profile_view_count')
        .eq('id', creatorProfileId)
        .maybeSingle();

      const cpViews = (cpRow as any)?.profile_view_count ?? 0;
      const { error: cpUpdateError } = await supabaseAdmin
        .from('creator_profiles')
        .update({ profile_view_count: cpViews + 1 })
        .eq('id', creatorProfileId);

      if (cpUpdateError) {
        console.warn('[increment-profile-view] Failed to increment creator_profiles view count:', JSON.stringify(cpUpdateError));
      } else {
        console.log('[increment-profile-view] creator_profiles.profile_view_count:', cpViews + 1);
      }
    }

    // Step 3: Atomically increment daily profile views in profile_analytics
    // Use userId for backward compat (profile_analytics.profile_id = profiles.id)
    if (userId) {
      const { error: analyticsError } = await supabaseAdmin
        .rpc('increment_profile_daily_views', { p_profile_id: userId });

      if (analyticsError) {
        console.warn('[increment-profile-view] Failed to increment profile_analytics:', JSON.stringify(analyticsError));
      }
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
