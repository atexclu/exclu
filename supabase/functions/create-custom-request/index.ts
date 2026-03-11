import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
const siteUrl = Deno.env.get('PUBLIC_SITE_URL');
const brevoApiKey = Deno.env.get('BREVO_API_KEY');
const brevoSenderEmail = Deno.env.get('BREVO_SENDER_EMAIL');
const brevoSenderName = Deno.env.get('BREVO_SENDER_NAME') ?? 'Exclu';

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const normalizedSiteOrigin = (siteUrl || 'https://exclu.at').replace(/\/$/, '');

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendCreatorRequestNotificationEmail(params: {
  creatorEmail: string;
  creatorName: string;
  requestDescription: string;
  proposedAmountFormatted: string;
  expiresAt: string;
  dashboardUrl: string;
}): Promise<boolean> {
  if (!brevoApiKey || !brevoSenderEmail) {
    console.warn('Brevo not configured; skipping request notification email');
    return false;
  }

  const { creatorEmail, creatorName, requestDescription, proposedAmountFormatted, expiresAt, dashboardUrl } = params;
  const safeCreatorName = escapeHtml(creatorName);
  const trimmedDesc = requestDescription.length > 300 ? requestDescription.slice(0, 300) + '…' : requestDescription;
  const safeDescription = escapeHtml(trimmedDesc);

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>New custom request</title>
<style>
  body { margin:0; padding:0; background-color:#020617; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; color:#e2e8f0; text-align:left; }
  .container { max-width:600px; margin:0 auto; background:linear-gradient(135deg,#020617 0%,#020617 40%,#0b1120 100%); border-radius:16px; border:1px solid #1e293b; box-shadow:0 12px 30px rgba(0,0,0,0.55); overflow:hidden; }
  .header { padding:28px 28px 18px 28px; border-bottom:1px solid #1e293b; }
  .header h1 { font-size:26px; color:#f9fafb; margin:0; line-height:1.3; font-weight:700; }
  .content { padding:26px 28px 30px 28px; }
  .content p { font-size:15px; line-height:1.7; color:#cbd5e1; margin:0 0 16px 0; }
  .content strong { color:#ffffff; font-weight:600; }
  .button { display:inline-block; background:linear-gradient(135deg,#bef264 0%,#a3e635 40%,#bbf7d0 100%); color:#020617 !important; text-decoration:none; padding:14px 32px; border-radius:999px; font-weight:600; font-size:15px; margin:8px 0 20px 0; box-shadow:0 6px 18px rgba(190,242,100,0.4); }
  .details { background-color:#020617; border-radius:10px; border:1px solid #1e293b; overflow:hidden; margin:4px 0 24px 0; }
  .detail-row { padding:14px 18px; border-bottom:1px solid #1e293b; }
  .detail-row:last-child { border-bottom:none; }
  .detail-label { font-size:11px; color:#64748b; text-transform:uppercase; letter-spacing:0.08em; margin:0 0 4px 0; }
  .detail-value { font-size:15px; color:#f1f5f9; font-weight:600; margin:0; }
  .detail-value.amount { font-size:22px; font-weight:800; color:#a3e635; }
  .description-box { background-color:#020617; border-radius:10px; padding:18px; margin:20px 0; border:1px solid #1e293b; }
  .footer { font-size:12px; color:#64748b; text-align:center; padding:18px; border-top:1px solid #1e293b; background-color:#020617; }
  .footer a { color:#a3e635; text-decoration:none; }
  .footer a:hover { text-decoration:underline; }
  @media (max-width:480px) { .container { margin:0 10px; } .content { padding:20px; } .header { padding:20px 20px 16px 20px; } .header h1 { font-size:22px; } .button { padding:12px 24px; font-size:14px; } }
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>New custom request 📩</h1>
    </div>
    <div class="content">
      <p>Hey <strong>${safeCreatorName}</strong>, a fan just submitted a custom content request on <strong>Exclu</strong>.</p>
      <div class="details">
        <div class="detail-row">
          <p class="detail-label">Proposed amount</p>
          <p class="detail-value amount">${proposedAmountFormatted}</p>
        </div>
        <div class="detail-row">
          <p class="detail-label">Expires</p>
          <p class="detail-value">${expiresAt}</p>
        </div>
      </div>
      <div class="description-box">
        <p style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 8px 0;">Request description</p>
        <p style="font-size:15px;color:#f1f5f9;margin:0;line-height:1.6;">${safeDescription}</p>
      </div>
      <p>You can <strong>accept</strong> or <strong>decline</strong> this request from your dashboard. The request will auto-expire in 7 days if you don't respond.</p>
      <a href="${dashboardUrl}" class="button">Review request</a>
      <p style="margin-top:20px; font-size:13px; color:#94a3b8;">You received this email because a fan sent you a custom request on Exclu.</p>
    </div>
    <div class="footer">
      © 2025 Exclu — All rights reserved<br>
      <a href="${normalizedSiteOrigin}">exclu</a> • <a href="${normalizedSiteOrigin}/terms">Terms of Service</a> • <a href="${normalizedSiteOrigin}/privacy">Privacy Policy</a>
    </div>
  </div>
</body>
</html>`;

  const payload = JSON.stringify({
    sender: { email: brevoSenderEmail, name: brevoSenderName },
    to: [{ email: creatorEmail }],
    subject: `📩 New custom request — ${proposedAmountFormatted} proposed`,
    htmlContent,
  });

  const MAX_ATTEMPTS = 2;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': brevoApiKey!, 'Content-Type': 'application/json' },
        body: payload,
      });

      if (response.ok) {
        console.log(`Request notification email sent to ${creatorEmail} (attempt ${attempt})`);
        return true;
      }

      const errorBody = await response.text();
      console.error(`Request notification email failed (attempt ${attempt}/${MAX_ATTEMPTS})`, response.status, errorBody);
    } catch (err) {
      console.error(`Request notification email error (attempt ${attempt}/${MAX_ATTEMPTS})`, err);
    }

    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return false;
}
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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-auth',
  };
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 5;
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
    // Extract fan JWT
    const authHeader = req.headers.get('authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    const { data: { user: fanUser }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !fanUser) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const creatorId = body?.creator_id as string | undefined;
    const profileId = body?.profile_id as string | undefined;
    const description = typeof body?.description === 'string' ? body.description.trim() : '';
    const proposedAmountCents = body?.proposed_amount_cents as number | undefined;

    if (!creatorId || typeof creatorId !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing creator_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (creatorId === fanUser.id) {
      return new Response(JSON.stringify({ error: 'You cannot send a request to yourself' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!description || description.length < 10) {
      return new Response(JSON.stringify({ error: 'Description must be at least 10 characters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (description.length > 2000) {
      return new Response(JSON.stringify({ error: 'Description must be under 2000 characters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!proposedAmountCents || typeof proposedAmountCents !== 'number' || proposedAmountCents < 2000) {
      return new Response(JSON.stringify({ error: 'Minimum amount is $20.00' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch creator profile
    const { data: creator, error: creatorError } = await supabase
      .from('profiles')
      .select('id, custom_requests_enabled, min_custom_request_cents')
      .eq('id', creatorId)
      .single();

    if (creatorError || !creator) {
      return new Response(JSON.stringify({ error: 'Creator not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!creator.custom_requests_enabled) {
      return new Response(JSON.stringify({ error: 'This creator does not accept custom requests' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const minAmount = creator.min_custom_request_cents || 2000;
    if (proposedAmountCents < minAmount) {
      return new Response(JSON.stringify({ error: `Minimum amount is $${(minAmount / 100).toFixed(2)}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Rate limit: max 1 pending request per fan per creator
    const { data: existingPending } = await supabase
      .from('custom_requests')
      .select('id')
      .eq('fan_id', fanUser.id)
      .eq('creator_id', creatorId)
      .eq('status', 'pending')
      .limit(1);

    if (existingPending && existingPending.length > 0) {
      return new Response(JSON.stringify({ error: 'You already have a pending request with this creator' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Insert the custom request
    const { data: requestRecord, error: insertError } = await supabase
      .from('custom_requests')
      .insert({
        fan_id: fanUser.id,
        creator_id: creatorId,
        profile_id: profileId || null,
        description,
        proposed_amount_cents: proposedAmountCents,
        currency: 'USD',
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single();

    if (insertError || !requestRecord) {
      console.error('Error inserting custom request', insertError);
      return new Response(JSON.stringify({ error: 'Failed to create request' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Send creator notification email (best-effort, non-blocking for the response)
    try {
      const { data: { user: creatorUser } } = await supabase.auth.admin.getUserById(creatorId);
      const { data: creatorProfileForEmail } = await supabase
        .from('profiles')
        .select('display_name, handle')
        .eq('id', creatorId)
        .single();

      if (creatorUser?.email) {
        const creatorDisplayName = creatorProfileForEmail?.display_name || creatorProfileForEmail?.handle || 'Creator';
        const expiresDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await sendCreatorRequestNotificationEmail({
          creatorEmail: creatorUser.email,
          creatorName: creatorDisplayName,
          requestDescription: description,
          proposedAmountFormatted: `$${(proposedAmountCents / 100).toFixed(2)}`,
          expiresAt: expiresDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          dashboardUrl: `${normalizedSiteOrigin}/app/tips`,
        });
      }
    } catch (emailErr) {
      console.error('Error sending request notification email (non-fatal):', emailErr);
    }

    return new Response(JSON.stringify({ success: true, request_id: requestRecord.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in create-custom-request', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
