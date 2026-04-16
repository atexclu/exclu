-- 140_transactional_templates_newsletter_style.sql
-- Rewrite the 8 transactional templates seeded in migration 132 to use
-- the same visual language as the newsletter campaign template:
--   - White card on a light gray page background
--   - Exclu wordmark at the top
--   - Gray footer with small legal text
-- Previously each template used a dark gradient card which clashed
-- visually with the campaign template. Now a user who receives a
-- welcome email then later a newsletter sees a consistent brand.
--
-- Only `html_body` is updated. `subject`, `variables`, and `sample_data`
-- stay identical so downstream callers keep working.

do $migration$
declare
  shell text := $tpl$<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>%%TITLE%%</title>
  <style>
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; }
      .content { padding: 24px 20px !important; }
      h1 { font-size: 22px !important; line-height: 28px !important; }
      .btn { width: 100% !important; box-sizing: border-box; }
    }
    a { color: #7c3aed; text-decoration: underline; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f5f5f7;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" class="container" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;">
          <tr>
            <td align="center" style="padding:32px 24px 16px 24px;">
              <a href="{{site_url}}" style="text-decoration:none;">
                <span style="font-size:24px;font-weight:700;color:#1a1a1a;letter-spacing:-0.5px;">Exclu</span>
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px;">
              <div style="height:1px;background-color:#eaeaef;line-height:1px;font-size:1px;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td class="content" style="padding:32px 40px;color:#1a1a1a;">
%%BODY%%
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px 28px 40px;background-color:#fafafa;border-top:1px solid #eaeaef;">
              <p style="margin:0 0 8px 0;font-size:10px;line-height:14px;color:#9a9aa3;">
                This is a transactional email from Exclu. FRANCEPRODUCT SAS, France.
              </p>
              <p style="margin:0;font-size:10px;line-height:14px;color:#9a9aa3;">
                <a href="{{site_url}}" style="color:#9a9aa3;text-decoration:underline;">exclu.at</a>
                &nbsp;·&nbsp;
                <a href="{{site_url}}/privacy" style="color:#9a9aa3;text-decoration:underline;">Privacy</a>
                &nbsp;·&nbsp;
                <a href="{{site_url}}/terms" style="color:#9a9aa3;text-decoration:underline;">Terms</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>$tpl$;

  body_signup text := $b$
              <h1 style="margin:0 0 16px 0;font-size:26px;line-height:32px;font-weight:700;color:#1a1a1a;">Welcome to Exclu</h1>
              <p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#333333;">Thanks for joining <strong>Exclu</strong>! Your account is almost ready.</p>
              <p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#333333;">Please confirm your email address to complete your registration:</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td align="center" style="padding:8px 0 24px 0;">
                <a class="btn" href="{{confirmation_url}}" style="display:inline-block;padding:14px 32px;background-color:#7c3aed;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;">Confirm my Exclu account</a>
              </td></tr></table>
              <p style="margin:0;font-size:14px;line-height:22px;color:#6b6b75;">If you didn't initiate this registration, you can safely ignore this email.</p>$b$;

  body_recovery text := $b$
              <h1 style="margin:0 0 16px 0;font-size:26px;line-height:32px;font-weight:700;color:#1a1a1a;">Reset your password</h1>
              <p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#333333;">We received a request to reset the password for your <strong>Exclu</strong> account. Click the button below to choose a new password:</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td align="center" style="padding:8px 0 24px 0;">
                <a class="btn" href="{{recovery_url}}" style="display:inline-block;padding:14px 32px;background-color:#7c3aed;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;">Reset my password</a>
              </td></tr></table>
              <p style="margin:0;font-size:14px;line-height:22px;color:#6b6b75;">If you didn't request a password reset, you can safely ignore this email. Your password will stay unchanged.</p>$b$;

  body_magic text := $b$
              <h1 style="margin:0 0 16px 0;font-size:26px;line-height:32px;font-weight:700;color:#1a1a1a;">Sign in to Exclu</h1>
              <p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#333333;">Click the button below to sign in to your <strong>Exclu</strong> account. This one-time link expires shortly for security.</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td align="center" style="padding:8px 0 24px 0;">
                <a class="btn" href="{{magic_url}}" style="display:inline-block;padding:14px 32px;background-color:#7c3aed;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;">Sign in</a>
              </td></tr></table>
              <p style="margin:0;font-size:14px;line-height:22px;color:#6b6b75;">If you didn't request this link, you can safely ignore this email.</p>$b$;

  body_change text := $b$
              <h1 style="margin:0 0 16px 0;font-size:26px;line-height:32px;font-weight:700;color:#1a1a1a;">Confirm your new email</h1>
              <p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#333333;">We received a request to change the email address on your <strong>Exclu</strong> account. Click the button below to confirm the new address.</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td align="center" style="padding:8px 0 24px 0;">
                <a class="btn" href="{{confirmation_url}}" style="display:inline-block;padding:14px 32px;background-color:#7c3aed;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;">Confirm new email</a>
              </td></tr></table>
              <p style="margin:0;font-size:14px;line-height:22px;color:#6b6b75;">If you didn't request this change, please contact support immediately — your account may be at risk.</p>$b$;

  body_link text := $b$
              <h1 style="margin:0 0 16px 0;font-size:26px;line-height:32px;font-weight:700;color:#1a1a1a;">Your Exclu purchase is ready</h1>
              <p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#333333;">Thanks for your purchase! Your content is available via the secure link(s) below:</p>
              <div style="margin:8px 0 24px 0;">
                {{{download_links_html}}}
              </div>
              <p style="margin:0;font-size:14px;line-height:22px;color:#6b6b75;">Links expire after 30 days for your security. Save your files to your device.</p>$b$;

  body_chatter text := $b$
              <h1 style="margin:0 0 16px 0;font-size:26px;line-height:32px;font-weight:700;color:#1a1a1a;">{{creator_name}} invited you as a chatter</h1>
              <p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#333333;">You've been invited to help manage fan conversations on behalf of <strong>{{creator_name}}</strong> on Exclu.</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td align="center" style="padding:8px 0 24px 0;">
                <a class="btn" href="{{invitation_url}}" style="display:inline-block;padding:14px 32px;background-color:#7c3aed;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;">Accept invitation</a>
              </td></tr></table>
              <p style="margin:0;font-size:14px;line-height:22px;color:#6b6b75;">If you don't want to accept, just ignore this email — it will expire on its own.</p>$b$;

  body_referral text := $b$
              <h1 style="margin:0 0 16px 0;font-size:26px;line-height:32px;font-weight:700;color:#1a1a1a;">{{inviter_name}} thinks you should try Exclu</h1>
              <p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#333333;"><strong>Exclu</strong> is where creators monetize their content — paid links, tips, custom requests, no friction.</p>
              <p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#333333;">Sign up with the link below and {{inviter_name}} gets a small thank-you bonus.</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td align="center" style="padding:8px 0 24px 0;">
                <a class="btn" href="{{referral_url}}" style="display:inline-block;padding:14px 32px;background-color:#7c3aed;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;">Join Exclu</a>
              </td></tr></table>
              <p style="margin:0;font-size:14px;line-height:22px;color:#6b6b75;">No spam, we promise. You can unsubscribe at any time.</p>$b$;

  body_agency text := $b$
              <h1 style="margin:0 0 16px 0;font-size:26px;line-height:32px;font-weight:700;color:#1a1a1a;">{{sender_name}} wants to connect</h1>
              <p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#333333;"><strong>{{sender_name}}</strong> from <strong>{{agency_name}}</strong> sent you a message through Exclu Agencies.</p>
              <div style="margin:8px 0 24px 0;padding:16px 20px;background-color:#f5f5f7;border-radius:8px;border-left:3px solid #7c3aed;">
                <p style="margin:0;font-size:15px;line-height:22px;color:#1a1a1a;font-style:italic;">{{message}}</p>
              </div>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td align="center" style="padding:8px 0 24px 0;">
                <a class="btn" href="mailto:{{sender_email}}" style="display:inline-block;padding:14px 32px;background-color:#7c3aed;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;">Reply to {{sender_name}}</a>
              </td></tr></table>
              <p style="margin:0;font-size:14px;line-height:22px;color:#6b6b75;">This conversation is routed through Exclu — your email address is not shared unless you reply.</p>$b$;

begin
  update public.email_templates set html_body =
    replace(replace(shell, '%%TITLE%%', 'Confirm your Exclu account'), '%%BODY%%', body_signup)
  where slug = 'auth_signup';

  update public.email_templates set html_body =
    replace(replace(shell, '%%TITLE%%', 'Reset your Exclu password'), '%%BODY%%', body_recovery)
  where slug = 'auth_recovery';

  update public.email_templates set html_body =
    replace(replace(shell, '%%TITLE%%', 'Sign in to Exclu'), '%%BODY%%', body_magic)
  where slug = 'auth_magiclink';

  update public.email_templates set html_body =
    replace(replace(shell, '%%TITLE%%', 'Confirm your new email'), '%%BODY%%', body_change)
  where slug = 'auth_email_change';

  update public.email_templates set html_body =
    replace(replace(shell, '%%TITLE%%', 'Your Exclu purchase is ready'), '%%BODY%%', body_link)
  where slug = 'link_content_delivery';

  update public.email_templates set html_body =
    replace(replace(shell, '%%TITLE%%', 'Chatter invitation'), '%%BODY%%', body_chatter)
  where slug = 'chatter_invitation';

  update public.email_templates set html_body =
    replace(replace(shell, '%%TITLE%%', 'Join Exclu'), '%%BODY%%', body_referral)
  where slug = 'referral_invite';

  update public.email_templates set html_body =
    replace(replace(shell, '%%TITLE%%', 'New message via Exclu Agencies'), '%%BODY%%', body_agency)
  where slug = 'agency_contact';
end
$migration$;
