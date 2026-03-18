/**
 * send-chatter-invitation — Edge Function
 *
 * Crée une invitation chatter pour un profil créateur et envoie l'email
 * via Brevo avec un lien d'acceptation unique.
 *
 * Pré-requis :
 *   - L'appelant doit être propriétaire du profil cible.
 *   - L'appelant doit avoir is_creator_subscribed = true (mode team = premium only).
 *
 * Sécurité :
 *   - Token JWT vérifié via supabase.auth.getUser().
 *   - Vérification ownership profil avant tout INSERT.
 *   - Rate limiting par IP (10 req/min).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

// ── Variables d'environnement ─────────────────────────────────────────────────
const supabaseUrl            = Deno.env.get('PROJECT_URL') ?? Deno.env.get('SUPABASE_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const supabaseAnonKey        = Deno.env.get('VITE_SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
const brevoApiKey            = Deno.env.get('BREVO_API_KEY');
const brevoSenderEmail       = Deno.env.get('BREVO_SENDER_EMAIL');
const brevoSenderName        = Deno.env.get('BREVO_SENDER_NAME') ?? 'Exclu';
const siteUrl                = Deno.env.get('PUBLIC_SITE_URL') ?? 'https://exclu.at';

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY environment variables');
}
if (!supabaseAnonKey) {
  throw new Error('Missing SUPABASE_ANON_KEY environment variable');
}
if (!brevoApiKey || !brevoSenderEmail) {
  throw new Error('Missing Brevo environment variables (BREVO_API_KEY, BREVO_SENDER_EMAIL)');
}

// ── Clients Supabase ──────────────────────────────────────────────────────────
const supabaseAdmin = createClient(supabaseUrl!, supabaseServiceRoleKey!);

// ── Rate Limiting ─────────────────────────────────────────────────────────────
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX       = 10;
const ipHits = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(ip: string): boolean {
  const now      = Date.now();
  const existing = ipHits.get(ip);
  if (!existing || now - existing.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipHits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  existing.count += 1;
  ipHits.set(ip, existing);
  return existing.count > RATE_LIMIT_MAX;
}

// ── CORS ──────────────────────────────────────────────────────────────────────
const normalizedSiteOrigin = siteUrl.replace(/\/$/, '');
const allowedOrigins = [
  normalizedSiteOrigin,
  'http://localhost:8080',
  'http://localhost:8081',
  'http://localhost:5173',
];

function getCorsHeaders(req: Request) {
  const origin        = req.headers.get('origin') ?? '';
  const allowedOrigin = allowedOrigins.includes(origin) ? origin : normalizedSiteOrigin;
  return {
    'Access-Control-Allow-Origin':  allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-auth',
  };
}

// ── Email HTML Builder ────────────────────────────────────────────────────────
function buildInvitationEmail(params: {
  creatorName:  string;
  profileHandle: string;
  acceptUrl:    string;
  customMessage?: string | null;
}): string {
  const { creatorName, profileHandle, acceptUrl, customMessage } = params;

  const customMessageHtml = customMessage ? `
      <div class="info-box" style="background-color:#0b1120; border-color:#334155;">
        <h3>Message de ${creatorName} :</h3>
        <p style="font-size:14px; line-height:1.6; color:#cbd5e1; margin:0; white-space:pre-wrap;">${customMessage}</p>
      </div>` : '';

  return `<!DOCTYPE html>
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
      <p>Bonjour,</p>
      <p><strong>${creatorName}</strong> vous invite à rejoindre son équipe de chatters sur Exclu pour gérer les conversations du profil <strong>@${profileHandle}</strong>.</p>
      <a href="${acceptUrl}" class="button">Accepter l'invitation →</a>
      ${customMessageHtml}
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
      <div class="link-box"><a href="${acceptUrl}">${acceptUrl}</a></div>
      <p style="margin-top:20px; font-size:13px; color:#94a3b8;">Ce lien expire dans 7 jours. Si vous n'attendiez pas cette invitation, ignorez cet email.</p>
    </div>
    <div class="footer">
      © 2025 Exclu — All rights reserved<br>
      <a href="${siteUrl}">exclu.at</a>
    </div>
  </div>
</body>
</html>`;
}

// ── Handler Principal ─────────────────────────────────────────────────────────
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
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // ── Vérification du token JWT ─────────────────────────────────────────────
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
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Validation du body ────────────────────────────────────────────────────
    const body = await req.json();
    const { profile_id, to_email, permissions, custom_message } = body as {
      profile_id:  string;
      to_email:    string;
      permissions: Record<string, boolean>;
      custom_message?: string | null;
    };

    if (!profile_id || !to_email || !to_email.includes('@')) {
      return new Response(JSON.stringify({ error: 'Missing or invalid profile_id / to_email' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Vérifier ownership du profil ──────────────────────────────────────────
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('creator_profiles')
      .select('id, username, display_name, user_id')
      .eq('id', profile_id)
      .eq('user_id', user.id) // L'appelant doit être propriétaire
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'Profile not found or not authorized' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Vérifier que le créateur est Premium (mode team = premium only) ───────
    const { data: creatorAccount } = await supabaseAdmin
      .from('profiles')
      .select('is_creator_subscribed, display_name')
      .eq('id', user.id)
      .single();

    if (!creatorAccount?.is_creator_subscribed) {
      return new Response(JSON.stringify({ error: 'premium_required', message: 'Team mode requires a Premium subscription.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Vérifier le max de chatters actifs (limite à 10 par profil) ──────────
    const { count: activeChatterCount } = await supabaseAdmin
      .from('chatter_invitations')
      .select('*', { count: 'exact', head: true })
      .eq('profile_id', profile_id)
      .eq('status', 'accepted');

    if ((activeChatterCount ?? 0) >= 10) {
      return new Response(JSON.stringify({ error: 'max_chatters_reached', message: 'Maximum of 10 active chatters per profile.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Vérifier qu'une invitation active n'existe pas déjà pour cet email ───
    const { data: existingInvitation } = await supabaseAdmin
      .from('chatter_invitations')
      .select('id, status')
      .eq('profile_id', profile_id)
      .eq('email', to_email.toLowerCase().trim())
      .in('status', ['pending', 'accepted'])
      .maybeSingle();

    if (existingInvitation) {
      const msg = existingInvitation.status === 'accepted'
        ? 'This person is already an active chatter for this profile.'
        : 'A pending invitation already exists for this email.';
      return new Response(JSON.stringify({ error: 'invitation_already_exists', message: msg }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Permissions par défaut si non fournies ───────────────────────────────
    const invitationPermissions = {
      can_send_paid_content: true,
      can_send_tip_links:    true,
      can_mass_message:      false, // Désactivé par défaut — à activer explicitement
      can_tag_fans:          true,
      ...permissions,              // Override avec les permissions fournies
    };

    // ── Créer l'invitation en DB ──────────────────────────────────────────────
    // Le token est généré automatiquement par le DEFAULT de la colonne (migration 073)
    const { data: invitation, error: insertError } = await supabaseAdmin
      .from('chatter_invitations')
      .insert({
        profile_id:  profile_id,
        invited_by:  user.id,
        email:       to_email.toLowerCase().trim(),
        permissions: invitationPermissions,
      })
      .select('id, token, email, permissions, expires_at')
      .single();

    if (insertError || !invitation) {
      console.error('[send-chatter-invitation] DB insert error:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to create invitation' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Construire le lien d'acceptation ─────────────────────────────────────
    const acceptUrl    = `${normalizedSiteOrigin}/accept-chatter-invite?token=${invitation.token}`;
    const creatorName  = creatorAccount.display_name || profile.username || 'Un créateur';
    const profileHandle = profile.username || profile_id;

    const emailHtml = buildInvitationEmail({ 
      creatorName, 
      profileHandle, 
      acceptUrl,
      customMessage: custom_message,
    });

    // ── Envoyer l'email via Brevo ─────────────────────────────────────────────
    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': brevoApiKey! },
      body: JSON.stringify({
        sender:      { name: brevoSenderName, email: brevoSenderEmail },
        to:          [{ email: to_email }],
        subject:     `${creatorName} vous invite à rejoindre son équipe sur Exclu`,
        htmlContent: emailHtml,
      }),
    });

    if (!brevoResponse.ok) {
      const errText = await brevoResponse.text();
      console.error('[send-chatter-invitation] Brevo error:', brevoResponse.status, errText);
      // Ne pas bloquer : l'invitation est créée en DB, l'email est best-effort
      // Le créateur peut re-envoyer depuis l'interface
      return new Response(JSON.stringify({
        success:    true,
        warning:    'Invitation created but email delivery failed. The creator can resend from settings.',
        invitation: { id: invitation.id, email: invitation.email, expires_at: invitation.expires_at },
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success:    true,
      invitation: { id: invitation.id, email: invitation.email, expires_at: invitation.expires_at },
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[send-chatter-invitation] Unexpected error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
