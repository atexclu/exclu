import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { loadTemplate, renderTemplate } from '../_shared/email_templates.ts';
import { sendBrevoEmail } from '../_shared/brevo.ts';

// Prefer standard Supabase Edge env vars, fall back to legacy names
const supabaseUrl = Deno.env.get('PROJECT_URL') ?? Deno.env.get('VITE_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const supabaseAnonKey = Deno.env.get('VITE_SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
const brevoApiKey = Deno.env.get('BREVO_API_KEY');
const brevoSenderEmail = Deno.env.get('BREVO_SENDER_EMAIL');
const siteUrl = Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at';

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY environment variables');
}
if (!supabaseAnonKey) {
  throw new Error('Missing SUPABASE_ANON_KEY environment variable');
}
if (!brevoApiKey || !brevoSenderEmail) {
  throw new Error('Missing Brevo environment variables');
}

// Admin client (service role) for profile reads/writes
const supabaseAdmin = createClient(supabaseUrl!, supabaseServiceRoleKey!);

// Rate limiting
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
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
  return existing.count > RATE_LIMIT_MAX;
}

const normalizedSiteOrigin = siteUrl.replace(/\/$/, '');
const allowedOrigins = [
  normalizedSiteOrigin,
  'http://localhost:8080',
  'http://localhost:8081',
  'http://localhost:5173',
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  const allowedOrigin = allowedOrigins.includes(origin) ? origin : normalizedSiteOrigin;
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-auth',
  };
}

serve(async (req: Request) => {
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
    // --- Auth: token from x-supabase-auth header ---
    // Read token from x-supabase-auth header (avoids Supabase gateway JWT validation
    // conflicting with the user access token in the Authorization header).
    const rawToken =
      req.headers.get('x-supabase-auth') ??
      req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
      '';
    const token = rawToken.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing authorization token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify the token with the anon key client (not service role)
    const supabaseAuthClient = createClient(supabaseUrl!, supabaseAnonKey!);
    const { data: { user }, error: userError } = await supabaseAuthClient.auth.getUser(token);

    if (userError || !user) {
      console.error('[send-referral-invite] Auth error:', userError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { to_email } = body;

    if (!to_email || typeof to_email !== 'string' || !to_email.includes('@')) {
      return new Response(JSON.stringify({ error: 'Invalid or missing to_email' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch sender profile using admin client
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('display_name, handle, referral_code')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Auto-generate referral code if missing (safety net)
    let referralCode = profile.referral_code;
    if (!referralCode) {
      const handlePrefix = (profile.handle || 'exclu').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 6);
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      referralCode = `${handlePrefix}-${randomSuffix}`;
      await supabaseAdmin.from('profiles').update({ referral_code: referralCode }).eq('id', user.id);
    }

    const referralLink = `${siteUrl}/auth?mode=signup&ref=${referralCode}`;
    const referrerName = profile.display_name || profile.handle || 'A creator';

    const template = await loadTemplate(supabaseAdmin, 'referral_invite');
    const rendered = renderTemplate(template, {
      sender_name:  referrerName,
      referral_url: referralLink,
      site_url:     siteUrl,
    });

    const emailSent = await sendBrevoEmail({
      to:          to_email,
      subject:     rendered.subject,
      htmlContent: rendered.html,
    });

    if (!emailSent) {
      console.error('[send-referral-invite] Brevo email send failed');
      return new Response(JSON.stringify({ error: 'Failed to send email' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[send-referral-invite] Unexpected error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
