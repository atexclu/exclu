import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
const siteUrl = Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at';

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY environment variables');
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
// This is a best-effort protection: it may reset when the Edge Function is
// re-deployed or scaled, but still helps absorb basic abuse.
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
    const slug = body?.slug as string | undefined;

    if (!slug || typeof slug !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing or invalid slug' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: link, error: linkError } = await supabaseAdmin
      .from('links')
      .select('id, status, click_count, creator_id')
      .eq('slug', slug)
      .maybeSingle();

    if (linkError || !link) {
      console.error('Error loading link for click increment', linkError);
      return new Response(JSON.stringify({ error: 'Link not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Silent no-op if the creator's account has been soft-deleted. We return
    // 200 (not 404/410) so old indexed URLs / cached HTML in the wild don't
    // start surfacing errors — the click just doesn't get counted.
    {
      const { data: isActive } = await supabaseAdmin.rpc('is_user_active', {
        check_user_id: (link as any).creator_id,
      });
      if (!isActive) {
        return new Response(JSON.stringify({ success: true, skipped: 'deleted_creator' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if ((link as any).status !== 'published') {
      return new Response(JSON.stringify({ error: 'Link is not public' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const currentClicks = (link as any).click_count ?? 0;

    const { error: updateError } = await supabaseAdmin
      .from('links')
      .update({ click_count: currentClicks + 1 })
      .eq('id', (link as any).id);

    if (updateError) {
      console.error('Error incrementing click count', updateError);
      return new Response(JSON.stringify({ error: 'Failed to increment click count' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Unexpected error in increment-link-click function', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
