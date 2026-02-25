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

// Rate limiting (same pattern as stripe-connect-onboard)
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
</head>
<body style="margin:0;padding:0;background-color:#0a0a0f;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0a0a0f;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#111117;border-radius:20px;border:1px solid #2a2a3a;overflow:hidden;">

          <!-- Header gradient banner -->
          <tr>
            <td style="background:linear-gradient(135deg,#7c3aed 0%,#a855f7 50%,#c084fc 100%);padding:36px 40px 32px;text-align:center;">
              <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 20px;">
                <tr>
                  <td style="background:rgba(0,0,0,0.25);border-radius:12px;padding:8px 18px;">
                    <span style="font-size:18px;font-weight:800;color:#ffffff;letter-spacing:0.04em;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">exclu</span>
                  </td>
                </tr>
              </table>
              <h1 style="margin:0;font-size:26px;font-weight:800;color:#ffffff;line-height:1.2;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
                You're invited 👀
              </h1>
              <p style="margin:10px 0 0;font-size:14px;color:rgba(255,255,255,0.85);font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
                Mystery invite from a creator you know
              </p>
            </td>
          </tr>

          <!-- Main content -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 18px;font-size:16px;color:#e2e2f0;line-height:1.6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
                Hey there 👋
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#b0b0cc;line-height:1.7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
                <strong style="color:#e2e2f0;">${referrerName}</strong> just sent you a personal invite to join Exclu — the creator platform where you get <strong style="color:#c084fc;">0% commission</strong> on everything you sell.
              </p>

              <!-- Feature list -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
                <tr>
                  <td style="padding:8px 0;">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="width:28px;vertical-align:top;padding-top:1px;">
                          <span style="display:inline-block;width:20px;height:20px;background:#1e1e2e;border-radius:50%;text-align:center;line-height:20px;font-size:11px;">✓</span>
                        </td>
                        <td style="font-size:14px;color:#b0b0cc;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Sell exclusive content via simple paid links</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="width:28px;vertical-align:top;padding-top:1px;">
                          <span style="display:inline-block;width:20px;height:20px;background:#1e1e2e;border-radius:50%;text-align:center;line-height:20px;font-size:11px;">✓</span>
                        </td>
                        <td style="font-size:14px;color:#b0b0cc;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Keep 100% — no platform cut, no hidden fees</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="width:28px;vertical-align:top;padding-top:1px;">
                          <span style="display:inline-block;width:20px;height:20px;background:#1e1e2e;border-radius:50%;text-align:center;line-height:20px;font-size:11px;">✓</span>
                        </td>
                        <td style="font-size:14px;color:#b0b0cc;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Fans unlock content instantly — no account needed</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <a href="${referralLink}"
                       style="display:inline-block;padding:15px 36px;background:linear-gradient(135deg,#7c3aed,#c084fc);color:#ffffff;text-decoration:none;border-radius:50px;font-weight:700;font-size:15px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;letter-spacing:0.02em;">
                      Claim your invite →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- or copy link -->
              <p style="margin:0 0 8px;font-size:12px;color:#6b6b88;text-align:center;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
                Or copy your personal invite link:
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#1a1a28;border:1px solid #2a2a3a;border-radius:10px;padding:12px 16px;text-align:center;">
                    <a href="${referralLink}" style="font-size:12px;color:#a78bfa;word-break:break-all;text-decoration:none;font-family:monospace;">
                      ${referralLink}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #1e1e2e;text-align:center;">
              <p style="margin:0;font-size:11px;color:#44445a;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
                You received this email because a creator on Exclu shared their referral link with you.<br>
                <a href="${siteUrl}" style="color:#6b6b88;text-decoration:none;">exclu.at</a> — Creator monetization, zero commission.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
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
    // --- Auth: same pattern as stripe-connect-onboard ---
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
