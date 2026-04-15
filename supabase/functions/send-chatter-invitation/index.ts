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
import { loadTemplate, renderTemplate } from '../_shared/email_templates.ts';
import { sendBrevoEmail } from '../_shared/brevo.ts';

// ── Variables d'environnement ─────────────────────────────────────────────────
const supabaseUrl            = Deno.env.get('PROJECT_URL') ?? Deno.env.get('SUPABASE_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const supabaseAnonKey        = Deno.env.get('VITE_SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
const brevoApiKey            = Deno.env.get('BREVO_API_KEY');
const brevoSenderEmail       = Deno.env.get('BREVO_SENDER_EMAIL');
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

    // ── Récupérer les infos du créateur ───────────────────────────────────────
    const { data: creatorAccount } = await supabaseAdmin
      .from('profiles')
      .select('display_name, handle')
      .eq('id', user.id)
      .single();

    if (!creatorAccount) {
      return new Response(JSON.stringify({ error: 'creator_not_found', message: 'Creator account not found.' }), {
        status: 404,
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
    const creatorName  = creatorAccount.display_name || creatorAccount.handle || 'Un créateur';
    // Note: the DB template `chatter_invitation` does not support `custom_message`
    // or a "view creator profile" link, so those extras from the legacy inline
    // template are dropped in this refactor. If we need them back, add a new
    // template variant rather than reviving inline HTML.
    void custom_message;

    const template = await loadTemplate(supabaseAdmin, 'chatter_invitation');
    const rendered = renderTemplate(template, {
      creator_name:   creatorName,
      invitation_url: acceptUrl,
      invitee_email:  to_email,
      site_url:       normalizedSiteOrigin,
    });

    // ── Envoyer l'email via Brevo ─────────────────────────────────────────────
    const emailSent = await sendBrevoEmail({
      to:          to_email,
      subject:     rendered.subject,
      htmlContent: rendered.html,
    });

    if (!emailSent) {
      console.error('[send-chatter-invitation] Brevo email send failed');
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
