import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('PROJECT_URL') ?? Deno.env.get('VITE_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const brevoApiKey = Deno.env.get('BREVO_API_KEY');
const brevoSenderEmail = Deno.env.get('BREVO_SENDER_EMAIL');
const brevoSenderName = Deno.env.get('BREVO_SENDER_NAME') ?? 'Exclu';
const siteUrl = (Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at').replace(/\/$/, '');

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY environment variables');
}
if (!brevoApiKey || !brevoSenderEmail) {
  throw new Error('Missing Brevo environment variables');
}

const supabaseAdmin = createClient(supabaseUrl!, supabaseServiceRoleKey!);

// Rate limiting: max 3 emails per minute per IP
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 3;
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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildContactEmailHtml(params: {
  agencyName: string;
  senderName: string;
  senderEmail: string;
  message: string;
}): string {
  const { agencyName, senderName, senderEmail, message } = params;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>New contact request</title>
<style>
  body { margin:0; padding:0; background-color:#020617; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; color:#e2e8f0; }
  .container { max-width:600px; margin:0 auto; background:linear-gradient(135deg,#020617 0%,#020617 40%,#0b1120 100%); border-radius:16px; border:1px solid #1e293b; box-shadow:0 12px 30px rgba(0,0,0,0.55); overflow:hidden; }
  .header { padding:28px 28px 18px 28px; border-bottom:1px solid #1e293b; }
  .header h1 { font-size:26px; color:#f9fafb; margin:0; line-height:1.3; font-weight:700; }
  .content { padding:26px 28px 30px 28px; }
  .content p { font-size:15px; line-height:1.7; color:#cbd5e1; margin:0 0 16px 0; }
  .content strong { color:#ffffff; font-weight:600; }
  .info-box { background-color:#020617; border-radius:10px; padding:18px; margin:4px 0 24px 0; border:1px solid #1e293b; }
  .info-box h3 { font-size:15px; color:#f9fafb; margin:0 0 10px 0; font-weight:600; }
  .info-box p { font-size:14px; color:#cbd5e1; margin:0 0 8px 0; line-height:1.6; }
  .message-box { background-color:#0b1120; border-radius:10px; padding:18px; margin:4px 0 24px 0; border:1px solid #334155; }
  .message-box p { font-size:14px; line-height:1.7; color:#cbd5e1; margin:0; white-space:pre-wrap; }
  .button { display:inline-block; background:linear-gradient(135deg,#bef264 0%,#a3e635 40%,#bbf7d0 100%); color:#020617 !important; text-decoration:none; padding:14px 32px; border-radius:999px; font-weight:600; font-size:15px; margin:8px 0 24px 0; box-shadow:0 6px 18px rgba(190,242,100,0.4); }
  .footer { font-size:12px; color:#64748b; text-align:center; padding:18px; border-top:1px solid #1e293b; background-color:#020617; }
  .footer a { color:#a3e635; text-decoration:none; }
  .footer a:hover { text-decoration:underline; }
  @media (max-width:480px) { .container { margin:0 10px; } .content { padding:20px; } .header { padding:20px; } .header h1 { font-size:22px; } .button { padding:12px 24px; font-size:14px; } }
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>New contact request for ${escapeHtml(agencyName)}</h1>
    </div>
    <div class="content">
      <p>Someone wants to get in touch with your agency via the <strong>Exclu directory</strong>.</p>
      <div class="info-box">
        <h3>Contact details</h3>
        <p><strong>Name:</strong> ${escapeHtml(senderName)}</p>
        <p><strong>Email:</strong> <a href="mailto:${escapeHtml(senderEmail)}" style="color:#a3e635; text-decoration:none;">${escapeHtml(senderEmail)}</a></p>
      </div>
      <div class="message-box">
        <p>${escapeHtml(message)}</p>
      </div>
      <a href="mailto:${escapeHtml(senderEmail)}" class="button">Reply to ${escapeHtml(senderName)} &rarr;</a>
      <p style="margin-top:20px; font-size:13px; color:#94a3b8;">This message was sent through your Exclu agency directory page.</p>
    </div>
    <div class="footer">
      &copy; 2025 Exclu &mdash; All rights reserved<br>
      <a href="${siteUrl}">exclu</a> &bull; <a href="${siteUrl}/terms">Terms of Service</a> &bull; <a href="${siteUrl}/privacy">Privacy Policy</a>
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
    return new Response(JSON.stringify({ error: 'Too many requests. Please wait a minute before trying again.' }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { agency_slug, sender_name, sender_email, message } = body as {
      agency_slug: string;
      sender_name: string;
      sender_email: string;
      message: string;
    };

    // Validate inputs
    if (!agency_slug || !sender_name?.trim() || !sender_email?.trim() || !message?.trim()) {
      return new Response(JSON.stringify({ error: 'All fields are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!sender_email.includes('@') || sender_email.length > 320) {
      return new Response(JSON.stringify({ error: 'Invalid email address.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (message.trim().length > 2000) {
      return new Response(JSON.stringify({ error: 'Message too long (max 2000 characters).' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Look up agency by slug — first in directory_agencies, then in profile-based agencies
    let agencyEmail: string | null = null;
    let agencyName = '';

    const { data: directoryAgency } = await supabaseAdmin
      .from('directory_agencies')
      .select('name, contact_email, agency_id')
      .eq('slug', agency_slug)
      .eq('is_visible', true)
      .maybeSingle();

    if (directoryAgency) {
      agencyName = directoryAgency.name;
      agencyEmail = directoryAgency.contact_email || null;

      // If no contact_email on directory entry but has linked agency_id, get from profiles
      if (!agencyEmail && directoryAgency.agency_id) {
        const { data: agencyProfile } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('id', directoryAgency.agency_id)
          .single();

        if (agencyProfile) {
          const { data: { user: agencyUser } } = await supabaseAdmin.auth.admin.getUserById(agencyProfile.id);
          agencyEmail = agencyUser?.email || null;
        }
      }
    }

    // Fallback: check profile-based agencies (slug derived from agency_name)
    if (!agencyEmail) {
      const { data: profileAgencies } = await supabaseAdmin
        .from('profiles')
        .select('id, agency_name')
        .not('agency_name', 'is', null);

      if (profileAgencies) {
        for (const p of profileAgencies) {
          const derivedSlug = p.agency_name.toLowerCase().replace(/\s+/g, '-');
          if (derivedSlug === agency_slug) {
            agencyName = p.agency_name;
            const { data: { user: agencyUser } } = await supabaseAdmin.auth.admin.getUserById(p.id);
            agencyEmail = agencyUser?.email || null;
            break;
          }
        }
      }
    }

    if (!agencyEmail) {
      return new Response(JSON.stringify({ error: 'Agency not found or no contact email configured.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build and send email
    const emailHtml = buildContactEmailHtml({
      agencyName,
      senderName: sender_name.trim(),
      senderEmail: sender_email.trim(),
      message: message.trim(),
    });

    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': brevoApiKey! },
      body: JSON.stringify({
        sender: { name: brevoSenderName, email: brevoSenderEmail },
        to: [{ email: agencyEmail }],
        replyTo: { email: sender_email.trim(), name: sender_name.trim() },
        subject: `New contact request from ${sender_name.trim()} — Exclu Directory`,
        htmlContent: emailHtml,
      }),
    });

    if (!brevoResponse.ok) {
      const errText = await brevoResponse.text();
      console.error('[send-agency-contact] Brevo error:', brevoResponse.status, errText);
      return new Response(JSON.stringify({ error: 'Failed to send email. Please try again later.' }), {
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
    console.error('[send-agency-contact] Unexpected error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
