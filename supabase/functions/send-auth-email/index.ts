import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { loadTemplate, renderTemplate } from '../_shared/email_templates.ts';
import { sendBrevoEmail } from '../_shared/brevo.ts';

// PUBLIC_SITE_URL is always https://exclu.at — never trust site_url from payload
// which Supabase sets to its internal GoTrue URL (qexnwezetjlbwltyccks.supabase.co/auth/v1)
const SITE_URL = (Deno.env.get('PUBLIC_SITE_URL') ?? 'https://exclu.at').replace(/\/$/, '');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('PROJECT_URL');
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Map each Supabase auth action type to a DB template slug.
const SLUG_BY_TYPE: Record<string, string> = {
  signup: 'auth_signup',
  invite: 'auth_signup',
  recovery: 'auth_recovery',
  reset: 'auth_recovery',
  magiclink: 'auth_magiclink',
  email_change: 'auth_email_change',
};

interface HookPayload {
  user: {
    email: string;
    user_metadata?: Record<string, unknown>;
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
    token_new: string;
    token_hash_new: string;
  };
}

function buildConfirmationUrl(emailData: HookPayload['email_data']): string {
  // Always use SITE_URL (https://exclu.at) — never site_url from payload
  // which Supabase sets to its internal GoTrue URL.
  const params = new URLSearchParams({
    token_hash: emailData.token_hash,
    type: emailData.email_action_type,
  });
  return `${SITE_URL}/auth/callback?${params.toString()}`;
}

// ─── Main handler ────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const payload = await req.text();

  let parsed: HookPayload;
  try {
    parsed = JSON.parse(payload) as HookPayload;
  } catch (parseErr) {
    console.error('Failed to parse payload:', parseErr);
    return new Response(
      JSON.stringify({ error: { http_code: 400, message: 'Invalid payload' } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Validate required fields
  if (!parsed.user?.email || !parsed.email_data?.email_action_type) {
    console.error(
      'Missing required fields in payload:',
      JSON.stringify({ hasUser: !!parsed.user, hasEmailData: !!parsed.email_data }),
    );
    return new Response(
      JSON.stringify({ error: { http_code: 400, message: 'Missing required fields' } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { user, email_data } = parsed;

  console.log(`[send-auth-email] FULL email_data: ${JSON.stringify(email_data)}`);
  console.log(
    `Processing auth email: type=${email_data.email_action_type}, to=${user.email}, redirect_to=${email_data.redirect_to}, site_url=${email_data.site_url}`,
  );

  const actionType = email_data.email_action_type;
  const confirmationUrl = buildConfirmationUrl(email_data);
  console.log(`[send-auth-email] actionType=${actionType} to=${user.email} confirmUrl=${confirmationUrl}`);

  const slug = SLUG_BY_TYPE[actionType] ?? 'auth_signup';

  try {
    const template = await loadTemplate(supabaseAdmin, slug);

    const renderData: Record<string, string> = {
      site_url: SITE_URL,
    };
    if (slug === 'auth_signup') renderData.confirmation_url = confirmationUrl;
    if (slug === 'auth_recovery') renderData.recovery_url = confirmationUrl;
    if (slug === 'auth_magiclink') renderData.magic_link = confirmationUrl;
    if (slug === 'auth_email_change') renderData.change_url = confirmationUrl;

    const rendered = renderTemplate(template, renderData);

    const ok = await sendBrevoEmail({
      to: user.email,
      subject: rendered.subject,
      htmlContent: rendered.html,
    });

    if (!ok) {
      throw new Error('Brevo email send failed');
    }

    console.log(`Auth email sent: type=${actionType}, to=${user.email}`);
  } catch (err) {
    console.error(`Failed to send auth email: type=${actionType}, to=${user.email}`, err);
    return new Response(
      JSON.stringify({ error: { http_code: 500, message: (err as Error).message } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
