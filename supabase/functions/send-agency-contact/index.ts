import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { loadTemplate, renderTemplate } from '../_shared/email_templates.ts';

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

    // Build and send email via shared DB-backed template renderer.
    const template = await loadTemplate(supabaseAdmin, 'agency_contact');
    const rendered = renderTemplate(template, {
      agency_name:  agencyName,
      sender_name:  sender_name.trim(),
      sender_email: sender_email.trim(),
      message:      message.trim(),
      site_url:     siteUrl,
    });

    // Keep the direct Brevo fetch here (instead of the shared sendBrevoEmail
    // helper) to preserve the `replyTo` header — agencies reply directly to the
    // sender from their inbox. The shared helper does not accept replyTo.
    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': brevoApiKey! },
      body: JSON.stringify({
        sender: { name: brevoSenderName, email: brevoSenderEmail },
        to: [{ email: agencyEmail }],
        replyTo: { email: sender_email.trim(), name: sender_name.trim() },
        subject: rendered.subject,
        htmlContent: rendered.html,
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
