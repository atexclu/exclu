-- 133_update_chatter_invitation.sql
--
-- Restore optional custom_message and profile_link blocks to the
-- chatter_invitation email template. These product features were dropped
-- when the template was migrated from inline HTML (send-chatter-invitation
-- edge function) to the DB in migration 132.
--
-- Both fields are now pre-rendered HTML variables
--   - custom_message_html
--   - profile_link_html
-- consumed via triple-brace raw substitution (`{{{…}}}`) so the edge
-- function can inject the appropriate French-language HTML block
-- conditionally, or pass an empty string to render nothing.
--
-- This mirrors the `download_links_html` raw-placeholder pattern already
-- used by `link_content_delivery` and avoids adding conditional logic to
-- the renderer.
--
-- Idempotent: uses UPDATE on the existing row seeded by migration 132.
-- If that row does not exist the statement is a harmless no-op.

update public.email_templates
set
  html_body = $html$<!DOCTYPE html>
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
      <!-- optional "view creator profile" link -->
      {{{profile_link_html}}}
      <!-- optional personal message from creator -->
      {{{custom_message_html}}}
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
  variables = '[
    {"key":"creator_name","required":true},
    {"key":"invitation_url","required":true},
    {"key":"invitee_email","required":false},
    {"key":"site_url","required":true},
    {"key":"custom_message_html","required":false},
    {"key":"profile_link_html","required":false}
  ]'::jsonb,
  sample_data = jsonb_build_object(
    'creator_name',        'Maria',
    'invitation_url',      'https://exclu.at/accept-chatter-invite?token=demo',
    'invitee_email',       'chatter@example.com',
    'site_url',            'https://exclu.at',
    'custom_message_html', '<div class="info-box" style="background-color:#0b1120; border-color:#334155;"><h3>Message de Maria :</h3><p style="font-size:14px; line-height:1.6; color:#cbd5e1; margin:0; white-space:pre-wrap;">Hey ! J''adore ton travail, j''aimerais beaucoup qu''on bosse ensemble sur mon chat.</p></div>',
    'profile_link_html',   '<p style="margin-top:16px; margin-bottom:8px;"><a href="https://exclu.at/maria" style="color:#a3e635; text-decoration:none; font-size:14px;">Voir le profil de Maria →</a></p>'
  ),
  updated_at = now()
where slug = 'chatter_invitation';
