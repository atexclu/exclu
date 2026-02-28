const brevoApiKey = Deno.env.get('BREVO_API_KEY');
const brevoSenderEmail = Deno.env.get('BREVO_SENDER_EMAIL');
const brevoSenderName = Deno.env.get('BREVO_SENDER_NAME') ?? 'Exclu';
// PUBLIC_SITE_URL is always https://exclu.at — never trust site_url from payload
// which Supabase sets to its internal GoTrue URL (qexnwezetjlbwltyccks.supabase.co/auth/v1)
const SITE_URL = (Deno.env.get('PUBLIC_SITE_URL') ?? 'https://exclu.at').replace(/\/$/, '');

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

function getSubject(actionType: string): string {
  switch (actionType) {
    case 'signup':
    case 'invite':
      return 'Confirm your Exclu account';
    case 'recovery':
    case 'reset':
      return 'Reset your Exclu password';
    case 'magiclink':
      return 'Your Exclu login link';
    case 'email_change':
      return 'Confirm your new email address';
    default:
      return 'Action required — Exclu';
  }
}

// ─── Shared email styles (dark theme) ────────────────────────────────
const STYLES = `
  body { margin:0; padding:0; background-color:#020617; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; color:#e2e8f0; text-align:left; }
  .container { max-width:600px; margin:0 auto; background:linear-gradient(135deg,#020617 0%,#020617 40%,#0b1120 100%); border-radius:16px; border:1px solid #1e293b; box-shadow:0 12px 30px rgba(0,0,0,0.55); overflow:hidden; }
  .header { padding:28px 28px 18px 28px; text-align:left; border-bottom:1px solid #1e293b; }
  .header h1 { font-size:26px; color:#f9fafb; margin:0; line-height:1.3; font-weight:700; }
  .content { padding:26px 28px 30px 28px; text-align:justify; }
  .content p { font-size:15px; line-height:1.7; color:#cbd5e1; margin:0 0 16px 0; }
  .content strong { color:#ffffff; font-weight:600; }
  .button { display:inline-block; background:linear-gradient(135deg,#bef264 0%,#a3e635 40%,#bbf7d0 100%); color:#020617 !important; text-decoration:none; padding:14px 32px; border-radius:999px; font-weight:600; font-size:15px; margin:20px 0; box-shadow:0 6px 18px rgba(190,242,100,0.4); }
  .features { background-color:#020617; border-radius:10px; padding:18px; margin:20px 0; border:1px solid #1e293b; }
  .features h3 { font-size:16px; color:#f9fafb; margin:0 0 10px 0; font-weight:600; }
  .features ul { margin:0; padding:0; list-style:none; }
  .features li { font-size:14px; color:#cbd5e1; margin-bottom:8px; position:relative; padding-left:20px; }
  .features li:before { content:"✓"; position:absolute; left:0; color:#a3e635; font-weight:bold; }
  .footer { font-size:12px; color:#64748b; text-align:center; padding:18px; border-top:1px solid #1e293b; background-color:#020617; }
  .footer a { color:#a3e635; text-decoration:none; }
  .footer a:hover { text-decoration:underline; }
  @media (max-width:480px) { .container { margin:0 10px; } .content { padding:20px; } .header { padding:20px 20px 16px 20px; } .header h1 { font-size:22px; } .content p { font-size:14px; } .button { padding:12px 24px; font-size:14px; } }
`;

function footerHtml(siteUrl: string): string {
  return `<div class="footer">
    © 2025 Exclu — All rights reserved<br>
    <a href="${siteUrl}">exclu</a> • <a href="${siteUrl}/terms">Terms of Service</a> • <a href="${siteUrl}/privacy">Privacy Policy</a>
  </div>`;
}

// ─── Templates ───────────────────────────────────────────────────────

function signupHtml(confirmUrl: string, siteUrl: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Confirm Your Exclu Account</title><style>${STYLES}</style></head><body>
  <div class="container">
    <div class="header"><h1>Welcome to Exclu</h1></div>
    <div class="content">
      <p>Thank you for joining <strong>Exclu</strong>! Your account is almost ready.</p>
      <p>Please confirm your email address by clicking the button below to complete your registration:</p>
      <a href="${confirmUrl}" class="button">Confirm my Exclu account</a>
      <p style="margin-top:20px;font-size:13px;color:#94a3b8;">If you did not initiate this registration, you can safely ignore this email.</p>
    </div>
    ${footerHtml(siteUrl)}
  </div>
</body></html>`;
}

function recoveryHtml(confirmUrl: string, siteUrl: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Reset Your Password</title><style>${STYLES}</style></head><body>
  <div class="container">
    <div class="header"><h1>Reset your password</h1></div>
    <div class="content">
      <p>We received a request to reset the password for your <strong>Exclu</strong> account. Click the button below to choose a new password:</p>
      <a href="${confirmUrl}" class="button">Reset my password</a>
      <p style="margin-top:20px;font-size:13px;color:#94a3b8;">If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
    </div>
    ${footerHtml(siteUrl)}
  </div>
</body></html>`;
}

function magiclinkHtml(confirmUrl: string, siteUrl: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Your Login Link</title><style>${STYLES}</style></head><body>
  <div class="container">
    <div class="header"><h1>Your login link</h1></div>
    <div class="content">
      <p>Click the button below to log in to your <strong>Exclu</strong> account:</p>
      <a href="${confirmUrl}" class="button">Log in to Exclu</a>
      <p style="margin-top:20px;font-size:13px;color:#94a3b8;">If you didn't request this link, you can safely ignore this email.</p>
    </div>
    ${footerHtml(siteUrl)}
  </div>
</body></html>`;
}

function emailChangeHtml(confirmUrl: string, siteUrl: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Confirm Email Change</title><style>${STYLES}</style></head><body>
  <div class="container">
    <div class="header"><h1>Confirm your new email</h1></div>
    <div class="content">
      <p>You requested to change the email address on your <strong>Exclu</strong> account. Please confirm this change by clicking the button below:</p>
      <a href="${confirmUrl}" class="button">Confirm email change</a>
      <p style="margin-top:20px;font-size:13px;color:#94a3b8;">If you didn't request this change, please contact support immediately.</p>
    </div>
    ${footerHtml(siteUrl)}
  </div>
</body></html>`;
}

function genericHtml(confirmUrl: string, siteUrl: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Exclu</title><style>${STYLES}</style></head><body>
  <div class="container">
    <div class="header"><h1>Action required</h1></div>
    <div class="content">
      <p>Click the button below to continue:</p>
      <a href="${confirmUrl}" class="button">Continue</a>
      <p style="margin-top:20px;font-size:13px;color:#94a3b8;">If you didn't request this, you can safely ignore this email.</p>
    </div>
    ${footerHtml(siteUrl)}
  </div>
</body></html>`;
}

// ─── Email sending via Brevo ─────────────────────────────────────────

async function sendViaBravo(to: string, subject: string, html: string): Promise<void> {
  if (!brevoApiKey || !brevoSenderEmail) {
    throw new Error('Brevo not configured (BREVO_API_KEY or BREVO_SENDER_EMAIL missing)');
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': brevoApiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { email: brevoSenderEmail, name: brevoSenderName },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Brevo API error ${response.status}: ${body}`);
  }
}

// ─── Main handler ────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);

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
    console.error('Missing required fields in payload:', JSON.stringify({ hasUser: !!parsed.user, hasEmailData: !!parsed.email_data }));
    return new Response(
      JSON.stringify({ error: { http_code: 400, message: 'Missing required fields' } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { user, email_data } = parsed;

  console.log(`[send-auth-email] FULL email_data: ${JSON.stringify(email_data)}`);
  console.log(`Processing auth email: type=${email_data.email_action_type}, to=${user.email}, redirect_to=${email_data.redirect_to}, site_url=${email_data.site_url}`);

  const actionType = email_data.email_action_type;
  const confirmUrl = buildConfirmationUrl(email_data);
  console.log(`[send-auth-email] actionType=${actionType} to=${user.email} confirmUrl=${confirmUrl}`);

  const subject = getSubject(actionType);

  let html: string;
  switch (actionType) {
    case 'signup':
    case 'invite':
      html = signupHtml(confirmUrl, SITE_URL);
      break;
    case 'recovery':
    case 'reset':
      html = recoveryHtml(confirmUrl, SITE_URL);
      break;
    case 'magiclink':
      html = magiclinkHtml(confirmUrl, SITE_URL);
      break;
    case 'email_change':
      html = emailChangeHtml(confirmUrl, SITE_URL);
      break;
    default:
      html = genericHtml(confirmUrl, SITE_URL);
      break;
  }

  try {
    await sendViaBravo(user.email, subject, html);
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
