-- 132_seed_email_templates.sql
-- Seed initial templates. HTML bodies are copied from the existing edge functions,
-- with ${var} interpolations replaced by Handlebars-style {{var}} placeholders.
--
-- Judgment calls documented (see task report):
--  * Auth templates: `${STYLES}` and `${footerHtml(siteUrl)}` resolved inline to
--    their literal production values. `${siteUrl}` in footers is now parameterized
--    as `{{site_url}}` so dev/staging renders don't leak the prod hostname.
--  * `link_content_delivery`: source HTML never interpolates creator name or link
--    title today; declared variables include them for forward compatibility and the
--    upcoming Task 1.2 refactor. `${linksListHtml}` → `{{{download_links_html}}}`
--    (triple-brace to preserve pre-rendered safe HTML).
--  * `chatter_invitation`: source has a ternary `${customMessage ? ... : ''}` and
--    references `${profileHandle}` that the task spec does not include in the
--    declared variable set. The ternary is flattened to the empty branch (no
--    custom message block) and profile handle references are removed or collapsed
--    into creator_name. `${siteUrl}` is parameterized as `{{site_url}}`.
--  * `agency_contact`: source wraps all variables in `escapeHtml(...)`; escaping
--    happens in the renderer now, so `${escapeHtml(x)}` → `{{x}}` double-brace.

insert into public.email_templates (slug, name, category, subject, html_body, variables, sample_data)
values
  (
    'auth_signup',
    'Auth — Signup confirmation',
    'transactional',
    'Confirm your Exclu account',
    $html$<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Confirm Your Exclu Account</title><style>
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
</style></head><body>
  <div class="container">
    <div class="header"><h1>Welcome to Exclu</h1></div>
    <div class="content">
      <p>Thank you for joining <strong>Exclu</strong>! Your account is almost ready.</p>
      <p>Please confirm your email address by clicking the button below to complete your registration:</p>
      <a href="{{confirmation_url}}" class="button">Confirm my Exclu account</a>
      <p style="margin-top:20px;font-size:13px;color:#94a3b8;">If you did not initiate this registration, you can safely ignore this email.</p>
    </div>
    <div class="footer">
    © 2025 Exclu — All rights reserved<br>
    <a href="{{site_url}}">exclu</a> • <a href="{{site_url}}/terms">Terms of Service</a> • <a href="{{site_url}}/privacy">Privacy Policy</a>
  </div>
  </div>
</body></html>$html$,
    '[{"key":"confirmation_url","required":true},{"key":"site_url","required":true}]'::jsonb,
    '{"confirmation_url":"https://exclu.at/auth/callback?token=demo","site_url":"https://exclu.at"}'::jsonb
  ),
  (
    'auth_recovery',
    'Auth — Password recovery',
    'transactional',
    'Reset your Exclu password',
    $html$<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Reset Your Password</title><style>
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
</style></head><body>
  <div class="container">
    <div class="header"><h1>Reset your password</h1></div>
    <div class="content">
      <p>We received a request to reset the password for your <strong>Exclu</strong> account. Click the button below to choose a new password:</p>
      <a href="{{recovery_url}}" class="button">Reset my password</a>
      <p style="margin-top:20px;font-size:13px;color:#94a3b8;">If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
    </div>
    <div class="footer">
    © 2025 Exclu — All rights reserved<br>
    <a href="{{site_url}}">exclu</a> • <a href="{{site_url}}/terms">Terms of Service</a> • <a href="{{site_url}}/privacy">Privacy Policy</a>
  </div>
  </div>
</body></html>$html$,
    '[{"key":"recovery_url","required":true},{"key":"site_url","required":true}]'::jsonb,
    '{"recovery_url":"https://exclu.at/auth/callback?token=demo&type=recovery","site_url":"https://exclu.at"}'::jsonb
  ),
  (
    'auth_magiclink',
    'Auth — Magic sign-in link',
    'transactional',
    'Your Exclu sign-in link',
    $html$<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Your Login Link</title><style>
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
</style></head><body>
  <div class="container">
    <div class="header"><h1>Your login link</h1></div>
    <div class="content">
      <p>Click the button below to log in to your <strong>Exclu</strong> account:</p>
      <a href="{{magic_link}}" class="button">Log in to Exclu</a>
      <p style="margin-top:20px;font-size:13px;color:#94a3b8;">If you didn't request this link, you can safely ignore this email.</p>
    </div>
    <div class="footer">
    © 2025 Exclu — All rights reserved<br>
    <a href="{{site_url}}">exclu</a> • <a href="{{site_url}}/terms">Terms of Service</a> • <a href="{{site_url}}/privacy">Privacy Policy</a>
  </div>
  </div>
</body></html>$html$,
    '[{"key":"magic_link","required":true},{"key":"site_url","required":true}]'::jsonb,
    '{"magic_link":"https://exclu.at/auth/callback?token=demo&type=magiclink","site_url":"https://exclu.at"}'::jsonb
  ),
  (
    'auth_email_change',
    'Auth — Email change confirmation',
    'transactional',
    'Confirm your new Exclu email',
    $html$<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Confirm Email Change</title><style>
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
</style></head><body>
  <div class="container">
    <div class="header"><h1>Confirm your new email</h1></div>
    <div class="content">
      <p>You requested to change the email address on your <strong>Exclu</strong> account. Please confirm this change by clicking the button below:</p>
      <a href="{{change_url}}" class="button">Confirm email change</a>
      <p style="margin-top:20px;font-size:13px;color:#94a3b8;">If you didn't request this change, please contact support immediately.</p>
    </div>
    <div class="footer">
    © 2025 Exclu — All rights reserved<br>
    <a href="{{site_url}}">exclu</a> • <a href="{{site_url}}/terms">Terms of Service</a> • <a href="{{site_url}}/privacy">Privacy Policy</a>
  </div>
  </div>
</body></html>$html$,
    '[{"key":"change_url","required":true},{"key":"site_url","required":true}]'::jsonb,
    '{"change_url":"https://exclu.at/auth/callback?token=demo&type=email_change","site_url":"https://exclu.at"}'::jsonb
  ),
  (
    'link_content_delivery',
    'Link — Content delivery',
    'transactional',
    'Your content from {{creator_name}}',
    $html$<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Your Exclu content is ready</title>
<style>
  body { margin:0; padding:0; background-color:#020617; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; color:#e2e8f0; text-align:left; }
  .container { max-width:600px; margin:0 auto; background:linear-gradient(135deg,#020617 0%,#020617 40%,#0b1120 100%); border-radius:16px; border:1px solid #1e293b; box-shadow:0 12px 30px rgba(0,0,0,0.55); overflow:hidden; }
  .header { padding:28px 28px 18px 28px; border-bottom:1px solid #1e293b; }
  .header h1 { font-size:26px; color:#f9fafb; margin:0; line-height:1.3; font-weight:700; }
  .content { padding:26px 28px 30px 28px; }
  .content p { font-size:15px; line-height:1.7; color:#cbd5e1; margin:0 0 16px 0; }
  .content strong { color:#ffffff; font-weight:600; }
  .features { background-color:#020617; border-radius:10px; padding:18px; margin:20px 0; border:1px solid #1e293b; }
  .features h3 { font-size:16px; color:#f9fafb; margin:0 0 10px 0; font-weight:600; }
  .features ul { margin:0; padding:0; list-style:none; }
  .features li { font-size:14px; color:#cbd5e1; margin-bottom:8px; position:relative; padding-left:20px; }
  .features li:before { content:"↓"; position:absolute; left:0; color:#a3e635; font-weight:bold; }
  .features li a { color:#a3e635; text-decoration:none; }
  .features li a:hover { text-decoration:underline; }
  .footer { font-size:12px; color:#64748b; text-align:center; padding:18px; border-top:1px solid #1e293b; background-color:#020617; }
  .footer a { color:#a3e635; text-decoration:none; }
  .footer a:hover { text-decoration:underline; }
  @media (max-width:480px) { .container { margin:0 10px; } .content { padding:20px; } .header { padding:20px 20px 16px 20px; } .header h1 { font-size:22px; } .content p { font-size:14px; } }
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Your Exclu content is ready 🎉</h1>
    </div>
    <div class="content">
      <p>Thank you for your purchase of <strong>{{link_title}}</strong> from <strong>{{creator_name}}</strong> on <strong>Exclu</strong>. Your premium content is now unlocked and ready to download.</p>
      <div class="features">
        <h3>Your download links:</h3>
        <ul>
          {{{download_links_html}}}
        </ul>
      </div>
      <p style="margin-top:20px; font-size:13px; color:#94a3b8;">If you did not make this purchase, you can safely ignore this email.</p>
    </div>
    <div class="footer">
      © 2025 Exclu — All rights reserved<br>
      <a href="{{site_url}}">exclu</a> • <a href="{{site_url}}/terms">Terms of Service</a> • <a href="{{site_url}}/privacy">Privacy Policy</a>
    </div>
  </div>
</body>
</html>$html$,
    '[{"key":"creator_name","required":true},{"key":"link_title","required":true},{"key":"download_links_html","required":true},{"key":"site_url","required":true}]'::jsonb,
    '{"creator_name":"Luna","link_title":"Exclusive photo set","download_links_html":"<li><a href=\"https://exclu.at/demo-1\">Download file 1</a></li><li><a href=\"https://exclu.at/demo-2\">Download file 2</a></li>","site_url":"https://exclu.at"}'::jsonb
  ),
  (
    'chatter_invitation',
    'Chatter — Team invitation',
    'transactional',
    '{{creator_name}} invited you to manage their chat',
    $html$<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Invitation chatter Exclu</title>
<style>
  body { margin:0; padding:0; background-color:#020617; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; color:#e2e8f0; }
  .container { max-width:600px; margin:0 auto; background:linear-gradient(135deg,#020617 0%,#020617 40%,#0b1120 100%); border-radius:16px; border:1px solid #1e293b; box-shadow:0 12px 30px rgba(0,0,0,0.55); overflow:hidden; }
  .header { padding:28px 28px 18px 28px; border-bottom:1px solid #1e293b; }
  .header h1 { font-size:26px; color:#f9fafb; margin:0; line-height:1.3; font-weight:700; }
  .content { padding:26px 28px 30px 28px; }
  .content p { font-size:15px; line-height:1.7; color:#cbd5e1; margin:0 0 16px 0; }
  .content strong { color:#ffffff; font-weight:600; }
  .button { display:inline-block; background:linear-gradient(135deg,#bef264 0%,#a3e635 40%,#bbf7d0 100%); color:#020617 !important; text-decoration:none; padding:14px 32px; border-radius:999px; font-weight:600; font-size:15px; margin:8px 0 24px 0; box-shadow:0 6px 18px rgba(190,242,100,0.4); }
  .info-box { background-color:#020617; border-radius:10px; padding:18px; margin:4px 0 24px 0; border:1px solid #1e293b; }
  .info-box h3 { font-size:15px; color:#f9fafb; margin:0 0 10px 0; font-weight:600; }
  .info-box ul { margin:0; padding:0; list-style:none; }
  .info-box li { font-size:14px; color:#cbd5e1; margin-bottom:8px; padding-left:20px; position:relative; }
  .info-box li:before { content:"✓"; position:absolute; left:0; color:#a3e635; font-weight:bold; }
  .link-box { background-color:#020617; border-radius:10px; padding:14px 18px; border:1px solid #1e293b; word-break:break-all; }
  .link-box a { font-size:12px; color:#a3e635; text-decoration:none; font-family:monospace; }
  .footer { font-size:12px; color:#64748b; text-align:center; padding:18px; border-top:1px solid #1e293b; background-color:#020617; }
  .footer a { color:#a3e635; text-decoration:none; }
  @media (max-width:480px) { .container { margin:0 10px; } .content { padding:20px; } .header { padding:20px; } .header h1 { font-size:22px; } .button { padding:12px 24px; font-size:14px; } }
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Invitation à rejoindre l'équipe chat</h1>
    </div>
    <div class="content">
      <p>Bonjour {{invitee_email}},</p>
      <p><strong>{{creator_name}}</strong> vous invite à rejoindre son équipe de chatters sur Exclu pour gérer les conversations de son profil.</p>
      <a href="{{invitation_url}}" class="button">Accepter l'invitation →</a>
      <div class="info-box">
        <h3>En tant que chatter, vous pourrez :</h3>
        <ul>
          <li>Gérer les conversations des fans en temps réel</li>
          <li>Envoyer des liens de contenu exclusif et génerer des ventes</li>
          <li>Taguer et organiser les fans</li>
          <li>Accéder à un dashboard dédié sur Exclu</li>
        </ul>
      </div>
      <p style="font-size:13px; color:#94a3b8; margin-bottom:8px;">Ou copiez ce lien dans votre navigateur :</p>
      <div class="link-box"><a href="{{invitation_url}}">{{invitation_url}}</a></div>
      <p style="margin-top:20px; font-size:13px; color:#94a3b8;">Ce lien expire dans 7 jours. Si vous n'attendiez pas cette invitation, ignorez cet email.</p>
    </div>
    <div class="footer">
      © 2025 Exclu — All rights reserved<br>
      <a href="{{site_url}}">exclu.at</a>
    </div>
  </div>
</body>
</html>$html$,
    '[{"key":"creator_name","required":true},{"key":"invitation_url","required":true},{"key":"invitee_email","required":false},{"key":"site_url","required":true}]'::jsonb,
    '{"creator_name":"Luna","invitation_url":"https://exclu.at/accept-chatter-invite?token=demo","invitee_email":"chatter@example.com","site_url":"https://exclu.at"}'::jsonb
  ),
  (
    'referral_invite',
    'Referral — Creator invite',
    'transactional',
    '{{sender_name}} invited you to Exclu',
    $html$<!DOCTYPE html>
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
      <p><strong>{{sender_name}}</strong> just sent you a personal invite to join Exclu — the creator platform where you keep <strong>0% commission</strong> on everything you sell.</p>
      <a href="{{referral_url}}" class="button">Claim your invite →</a>
      <div class="features">
        <h3>With Exclu, you can:</h3>
        <ul>
          <li>Sell exclusive content via simple paid links</li>
          <li>Keep 100% — no platform cut, no hidden fees</li>
          <li>Fans unlock content instantly — no account needed</li>
        </ul>
      </div>
      <p style="font-size:13px; color:#94a3b8; margin-bottom:8px;">Or copy your personal invite link:</p>
      <div class="link-box"><a href="{{referral_url}}">{{referral_url}}</a></div>
      <p style="margin-top:20px; font-size:13px; color:#94a3b8;">You received this email because a creator on Exclu shared their referral link with you.</p>
    </div>
    <div class="footer">
      © 2025 Exclu — All rights reserved<br>
      <a href="{{site_url}}">exclu</a> • <a href="{{site_url}}/terms">Terms of Service</a> • <a href="{{site_url}}/privacy">Privacy Policy</a>
    </div>
  </div>
</body>
</html>$html$,
    '[{"key":"sender_name","required":true},{"key":"referral_url","required":true},{"key":"site_url","required":true}]'::jsonb,
    '{"sender_name":"Luna","referral_url":"https://exclu.at/auth?mode=signup&ref=luna-abc123","site_url":"https://exclu.at"}'::jsonb
  ),
  (
    'agency_contact',
    'Agency — Directory contact forward',
    'transactional',
    'New contact request for {{agency_name}}',
    $html$<!DOCTYPE html>
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
      <h1>New contact request for {{agency_name}}</h1>
    </div>
    <div class="content">
      <p>Someone wants to get in touch with your agency via the <strong>Exclu directory</strong>.</p>
      <div class="info-box">
        <h3>Contact details</h3>
        <p><strong>Name:</strong> {{sender_name}}</p>
        <p><strong>Email:</strong> <a href="mailto:{{sender_email}}" style="color:#a3e635; text-decoration:none;">{{sender_email}}</a></p>
      </div>
      <div class="message-box">
        <p>{{message}}</p>
      </div>
      <a href="mailto:{{sender_email}}" class="button">Reply to {{sender_name}} &rarr;</a>
      <p style="margin-top:20px; font-size:13px; color:#94a3b8;">This message was sent through your Exclu agency directory page.</p>
    </div>
    <div class="footer">
      &copy; 2025 Exclu &mdash; All rights reserved<br>
      <a href="{{site_url}}">exclu</a> &bull; <a href="{{site_url}}/terms">Terms of Service</a> &bull; <a href="{{site_url}}/privacy">Privacy Policy</a>
    </div>
  </div>
</body>
</html>$html$,
    '[{"key":"agency_name","required":true},{"key":"sender_name","required":true},{"key":"sender_email","required":true},{"key":"message","required":true},{"key":"site_url","required":true}]'::jsonb,
    '{"agency_name":"Moonlight Management","sender_name":"Alex Fan","sender_email":"alex@example.com","message":"Hi, I would love to discuss a potential collaboration with your agency.","site_url":"https://exclu.at"}'::jsonb
  )
on conflict (slug) do nothing;
