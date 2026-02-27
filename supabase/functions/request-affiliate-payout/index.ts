import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('PROJECT_URL') ?? Deno.env.get('SUPABASE_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const supabaseAnonKey = Deno.env.get('VITE_SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
const brevoApiKey = Deno.env.get('BREVO_API_KEY');
const brevoSenderEmail = Deno.env.get('BREVO_SENDER_EMAIL');
const brevoSenderName = Deno.env.get('BREVO_SENDER_NAME') ?? 'Exclu';
const siteUrl = Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at';

const ADMIN_EMAIL = 'atexclu@gmail.com';

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY environment variables');
}
if (!supabaseAnonKey) {
  throw new Error('Missing SUPABASE_ANON_KEY environment variable');
}
if (!brevoApiKey || !brevoSenderEmail) {
  throw new Error('Missing Brevo environment variables');
}

const supabaseAdmin = createClient(supabaseUrl!, supabaseServiceRoleKey!);

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

function buildAdminEmailHtml(params: {
  displayName: string;
  handle: string;
  email: string;
  amountFormatted: string;
  userId: string;
}): string {
  const { displayName, handle, email, amountFormatted, userId } = params;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Affiliate Payout Request</title>
<style>
  body { margin:0; padding:0; background-color:#020617; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; color:#e2e8f0; text-align:left; }
  .container { max-width:600px; margin:0 auto; background:linear-gradient(135deg,#020617 0%,#020617 40%,#0b1120 100%); border-radius:16px; border:1px solid #1e293b; box-shadow:0 12px 30px rgba(0,0,0,0.55); overflow:hidden; }
  .header { padding:28px 28px 18px 28px; border-bottom:1px solid #1e293b; }
  .header h1 { font-size:26px; color:#f9fafb; margin:0; line-height:1.3; font-weight:700; }
  .header p { font-size:14px; color:#64748b; margin:6px 0 0 0; }
  .content { padding:26px 28px 30px 28px; }
  .content p { font-size:15px; line-height:1.7; color:#cbd5e1; margin:0 0 16px 0; }
  .details { background-color:#020617; border-radius:10px; border:1px solid #1e293b; overflow:hidden; margin:4px 0 24px 0; }
  .detail-row { padding:14px 18px; border-bottom:1px solid #1e293b; }
  .detail-row:last-child { border-bottom:none; }
  .detail-label { font-size:11px; color:#64748b; text-transform:uppercase; letter-spacing:0.08em; margin:0 0 4px 0; }
  .detail-value { font-size:15px; color:#f1f5f9; font-weight:600; margin:0; }
  .detail-value.amount { font-size:22px; font-weight:800; color:#a3e635; }
  .detail-value.handle { color:#a3e635; }
  .detail-value.mono { font-family:monospace; font-size:12px; color:#64748b; font-weight:400; }
  .footer { font-size:12px; color:#64748b; text-align:center; padding:18px; border-top:1px solid #1e293b; background-color:#020617; }
  .footer a { color:#a3e635; text-decoration:none; }
  .footer a:hover { text-decoration:underline; }
  @media (max-width:480px) { .container { margin:0 10px; } .content { padding:20px; } .header { padding:20px 20px 16px 20px; } .header h1 { font-size:22px; } }
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>💸 Affiliate Payout Request</h1>
      <p>A creator has requested to withdraw their affiliate earnings</p>
    </div>
    <div class="content">
      <p>The following creator has submitted a payout request. Please process the transfer at your earliest convenience.</p>
      <div class="details">
        <div class="detail-row">
          <p class="detail-label">Creator name</p>
          <p class="detail-value">${displayName}</p>
        </div>
        <div class="detail-row">
          <p class="detail-label">Handle</p>
          <p class="detail-value handle">@${handle}</p>
        </div>
        <div class="detail-row">
          <p class="detail-label">Email</p>
          <p class="detail-value">${email}</p>
        </div>
        <div class="detail-row">
          <p class="detail-label">Amount to transfer</p>
          <p class="detail-value amount">${amountFormatted}</p>
        </div>
        <div class="detail-row">
          <p class="detail-label">User ID (Supabase)</p>
          <p class="detail-value mono">${userId}</p>
        </div>
      </div>
    </div>
    <div class="footer">
      Exclu internal notification — affiliate payout system<br>
      <a href="${siteUrl}">exclu.at</a>
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

  try {
    // Auth: same pattern as send-referral-invite
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

    const supabaseAuthClient = createClient(supabaseUrl!, supabaseAnonKey!);
    const { data: { user }, error: userError } = await supabaseAuthClient.auth.getUser(token);

    if (userError || !user) {
      console.error('[request-affiliate-payout] Auth error:', userError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('display_name, handle, affiliate_earnings_cents')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const MIN_PAYOUT_CENTS = 10000;
    if ((profile.affiliate_earnings_cents ?? 0) < MIN_PAYOUT_CENTS) {
      return new Response(JSON.stringify({ error: 'Earnings below minimum payout threshold' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const amountFormatted = `$${((profile.affiliate_earnings_cents ?? 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const displayName = profile.display_name || profile.handle || 'Unknown creator';
    const handle = profile.handle || 'unknown';

    const emailHtml = buildAdminEmailHtml({
      displayName,
      handle,
      email: user.email ?? 'N/A',
      amountFormatted,
      userId: user.id,
    });

    const brevoPayload = {
      sender: { name: brevoSenderName, email: brevoSenderEmail },
      to: [{ email: ADMIN_EMAIL }],
      subject: `💸 Payout request — ${displayName} (@${handle}) · ${amountFormatted}`,
      htmlContent: emailHtml,
    };

    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': brevoApiKey! },
      body: JSON.stringify(brevoPayload),
    });

    if (!brevoResponse.ok) {
      const errText = await brevoResponse.text();
      console.error('[request-affiliate-payout] Brevo error:', brevoResponse.status, errText);
      return new Response(JSON.stringify({ error: 'Failed to send notification email', detail: errText }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Persist the pending state so it survives page reloads
    await supabaseAdmin
      .from('profiles')
      .update({ affiliate_payout_requested_at: new Date().toISOString() })
      .eq('id', user.id);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[request-affiliate-payout] Unexpected error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
