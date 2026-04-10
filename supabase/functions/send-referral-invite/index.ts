import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Prefer standard Supabase Edge env vars, fall back to legacy names
const supabaseUrl = Deno.env.get('PROJECT_URL') ?? Deno.env.get('VITE_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const supabaseAnonKey = Deno.env.get('VITE_SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
const brevoApiKey = Deno.env.get('BREVO_API_KEY');
const brevoSenderEmail = Deno.env.get('BREVO_SENDER_EMAIL');
const brevoSenderName = Deno.env.get('BREVO_SENDER_NAME') ?? 'Exclu';
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

function buildEmailHtml(params: {
  referrerName: string;
  referralLink: string;
  toEmail: string;
}): string {
  const { referrerName, referralLink } = params;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>You're invited to Exclu 👀</title>
<style>
  body { margin:0; padding:0; background-color:#020617; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; color:#e2e8f0; text-align:left; }
  .container { max-width:600px; margin:0 auto; background:linear-gradient(135deg,#020617 0%,#020617 40%,#0b1120 100%); border-radius:16px; border:1px solid #1e293b; box-shadow:0 12px 30px rgba(0,0,0,0.55); overflow:hidden; }
  .header { padding:28px 28px 18px 28px; border-bottom:1px solid #1e293b; }
  .header h1 { font-size:26px; color:#f9fafb; margin:0; line-height:1.3; font-weight:700; }
  .content { padding:26px 28px 30px 28px; }
  .content p { font-size:15px; line-height:1.7; color:#cbd5e1; margin:0 0 16px 0; }
  .content strong { color:#ffffff; font-weight:600; }
  .button { display:inline-block; background:linear-gradient(135deg,#bef264 0%,#a3e635 40%,#bbf7d0 100%); color:#020617 !important; text-decoration:none; padding:14px 32px; border-radius:999px; font-weight:600; font-size:15px; margin:8px 0 24px 0; box-shadow:0 6px 18px rgba(190,242,100,0.4); }
  .features { background-color:#020617; border-radius:10px; padding:18px; margin:4px 0 24px 0; border:1px solid #1e293b; }
  .features h3 { font-size:16px; color:#f9fafb; margin:0 0 10px 0; font-weight:600; }
  .features ul { margin:0; padding:0; list-style:none; }
  .features li { font-size:14px; color:#cbd5e1; margin-bottom:8px; position:relative; padding-left:20px; }
  .features li:before { content:"✓"; position:absolute; left:0; color:#a3e635; font-weight:bold; }
  .link-box { background-color:#020617; border-radius:10px; padding:14px 18px; border:1px solid #1e293b; word-break:break-all; text-align:center; }
  .link-box a { font-size:12px; color:#a3e635; text-decoration:none; font-family:monospace; }
  .footer { font-size:12px; color:#64748b; text-align:center; padding:18px; border-top:1px solid #1e293b; background-color:#020617; }
  .footer a { color:#a3e635; text-decoration:none; }
  .footer a:hover { text-decoration:underline; }
  @media (max-width:480px) { .container { margin:0 10px; } .content { padding:20px; } .header { padding:20px 20px 16px 20px; } .header h1 { font-size:22px; } .button { padding:12px 24px; font-size:14px; } }
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>You're invited to Exclu 👀</h1>
    </div>
    <div class="content">
      <p>Hey there 👋</p>
      <p><strong>${referrerName}</strong> just sent you a personal invite to join Exclu — the creator platform where you keep <strong>0% commission</strong> on everything you sell.</p>
      <a href="${referralLink}" class="button">Claim your invite →</a>
      <div class="features">
        <h3>With Exclu, you can:</h3>
        <ul>
          <li>Sell exclusive content via simple paid links</li>
          <li>Keep 100% — no platform cut, no hidden fees</li>
          <li>Fans unlock content instantly — no account needed</li>
        </ul>
      </div>
      <p style="font-size:13px; color:#94a3b8; margin-bottom:8px;">Or copy your personal invite link:</p>
      <div class="link-box"><a href="${referralLink}">${referralLink}</a></div>
      <p style="margin-top:20px; font-size:13px; color:#94a3b8;">You received this email because a creator on Exclu shared their referral link with you.</p>
    </div>
    <div class="footer">
      © 2025 Exclu — All rights reserved<br>
      <a href="${siteUrl}">exclu</a> • <a href="${siteUrl}/terms">Terms of Service</a> • <a href="${siteUrl}/privacy">Privacy Policy</a>
    </div>
  </div>
</body>
</html>`;
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

    const emailHtml = buildEmailHtml({ referrerName, referralLink, toEmail: to_email });

    const brevoPayload = {
      sender: { name: brevoSenderName, email: brevoSenderEmail },
      to: [{ email: to_email }],
      subject: `${referrerName} invited you to Exclu 👀`,
      htmlContent: emailHtml,
    };

    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': brevoApiKey! },
      body: JSON.stringify(brevoPayload),
    });

    if (!brevoResponse.ok) {
      const errText = await brevoResponse.text();
      console.error('[send-referral-invite] Brevo error:', brevoResponse.status, errText);
      return new Response(JSON.stringify({ error: 'Failed to send email', detail: errText }), {
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
