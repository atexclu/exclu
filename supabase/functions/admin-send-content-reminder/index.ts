/**
 * admin-send-content-reminder — Sends a "no recent content" reminder email
 * to a creator, manually triggered by an admin from /admin/users/:id/overview.
 *
 * Flow:
 *   1. Verify the caller is an admin (manual auth — config.toml has verify_jwt=false).
 *   2. Resolve the target creator + their auth.email.
 *   3. Compute days_since_last_upload from MAX(links.created_at, assets.created_at).
 *   4. Render the `creator_content_reminder` template with full context.
 *   5. Send via Brevo (same provider as the rest of the platform).
 *   6. Insert audit row in content_reminder_log.
 *
 * Per spec: no technical cooldown. Admin chooses when to re-send. The UI
 * surfaces "Last reminder sent on …" so the admin can decide.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendBrevoEmail } from '../_shared/brevo.ts';
import { loadTemplate, renderTemplate } from '../_shared/email_templates.ts';

const supabaseUrl =
  Deno.env.get('PROJECT_URL') ?? Deno.env.get('VITE_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL');
const supabaseServiceRoleKey =
  Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const supabaseAnonKey =
  Deno.env.get('VITE_SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
const siteUrl = Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at';

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing SUPABASE_URL/PROJECT_URL or SUPABASE_SERVICE_ROLE_KEY/SERVICE_ROLE_KEY');
}
if (!supabaseAnonKey) {
  throw new Error('Missing SUPABASE_ANON_KEY environment variable');
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
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
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-supabase-auth',
  };
}

// Lightweight per-IP rate limiting — defends against accidental click-spam by
// the admin (network blip retry, double-tap on the button, etc.). Tighter than
// the read-only 30/min on admin-get-user-overview because each call sends mail.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 6;
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

interface RequestBody {
  creator_id?: string;
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
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

  // ── 1. Auth — caller must be an admin ──
  const rawToken = req.headers.get('x-supabase-auth') ?? '';
  const token = rawToken.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return new Response(JSON.stringify({ error: 'Missing authorization token' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseAuthClient = createClient(supabaseUrl, supabaseAnonKey);
  const {
    data: { user: caller },
    error: callerError,
  } = await supabaseAuthClient.auth.getUser(token);

  if (callerError || !caller) {
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: callerProfile } = await supabaseAdmin
    .from('profiles')
    .select('id, is_admin')
    .eq('id', caller.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!callerProfile || callerProfile.is_admin !== true) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── 2. Resolve target creator ──
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const creatorId = body.creator_id?.trim();
  if (!creatorId) {
    return new Response(JSON.stringify({ error: 'Missing creator_id' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: creatorProfile, error: creatorErr } = await supabaseAdmin
    .from('profiles')
    .select('id, display_name, handle, is_creator, deleted_at')
    .eq('id', creatorId)
    .is('deleted_at', null)
    .maybeSingle();

  if (creatorErr || !creatorProfile) {
    return new Response(JSON.stringify({ error: 'Creator not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (creatorProfile.is_creator !== true) {
    return new Response(JSON.stringify({ error: 'Target user is not a creator' }), {
      status: 422,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Pull email + sign-in state from auth.users (single source of truth).
  const { data: authUserRes, error: authErr } = await supabaseAdmin.auth.admin.getUserById(creatorId);
  if (authErr || !authUserRes?.user?.email) {
    return new Response(JSON.stringify({ error: 'Creator email unavailable' }), {
      status: 422,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const recipientEmail = authUserRes.user.email;

  // ── 3. Compute days_since_last_upload ──
  // MAX over both creator-owned tables (links + assets), regardless of status,
  // because both signal "recent activity" to the platform.
  const [{ data: latestLink }, { data: latestAsset }] = await Promise.all([
    supabaseAdmin
      .from('links')
      .select('created_at')
      .eq('creator_id', creatorId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('assets')
      .select('created_at')
      .eq('creator_id', creatorId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const lastUploadCandidates = [latestLink?.created_at, latestAsset?.created_at]
    .filter((d): d is string => !!d)
    .map((d) => new Date(d).getTime())
    .filter((t) => Number.isFinite(t));

  const lastUploadMs = lastUploadCandidates.length > 0 ? Math.max(...lastUploadCandidates) : null;
  const daysSinceLastUpload =
    lastUploadMs !== null
      ? Math.max(0, Math.floor((Date.now() - lastUploadMs) / (1000 * 60 * 60 * 24)))
      : 9999; // never uploaded → very large number; the template can phrase it however

  // ── 4. Load + render template ──
  let rendered;
  try {
    const template = await loadTemplate(supabaseAdmin, 'creator_content_reminder');
    const handle = creatorProfile.handle ?? 'creator';
    const displayName = creatorProfile.display_name ?? handle;

    rendered = renderTemplate(template, {
      display_name: displayName,
      handle,
      days_since_last_upload: daysSinceLastUpload,
      profile_url: `${normalizedSiteOrigin}/${handle}`,
      login_url: `${normalizedSiteOrigin}/app/links/new`,
    });
  } catch (err) {
    console.error('[admin-send-content-reminder] template render failed', err);
    return new Response(JSON.stringify({ error: 'Template render failed', detail: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── 5. Send via Brevo ──
  const sent = await sendBrevoEmail({
    to: recipientEmail,
    subject: rendered.subject,
    htmlContent: rendered.html,
    tags: ['creator_content_reminder', 'admin_triggered'],
  });

  if (!sent) {
    return new Response(JSON.stringify({ error: 'Email send failed' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── 6. Audit row ──
  const { error: logError } = await supabaseAdmin.from('content_reminder_log').insert({
    creator_id: creatorId,
    sent_by: caller.id,
    template_slug: 'creator_content_reminder',
    rendered_subject: rendered.subject,
    rendered_html: rendered.html,
    rendered_text: rendered.text,
    days_since_last_upload: lastUploadMs !== null ? daysSinceLastUpload : null,
  });

  if (logError) {
    // Log only — the email already went out, no point failing the response.
    console.error('[admin-send-content-reminder] audit insert failed', logError);
  }

  return new Response(
    JSON.stringify({
      success: true,
      sent_at: new Date().toISOString(),
      days_since_last_upload: lastUploadMs !== null ? daysSinceLastUpload : null,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  );
});
