/**
 * handle-chatter-request — Edge Function
 *
 * Handles the full lifecycle of chatter contract requests:
 *   - action=send   → Chatter sends a request to manage a creator's conversations
 *   - action=accept → Creator accepts a chatter request (creates invitation, emails chatter)
 *   - action=reject → Creator rejects a chatter request (emails chatter)
 *   - action=revoke → Creator revokes an active chatter's access (emails chatter)
 *
 * Uses Brevo for transactional emails (same template as other platform emails).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl            = Deno.env.get('PROJECT_URL') ?? Deno.env.get('SUPABASE_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const supabaseAnonKey        = Deno.env.get('VITE_SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
const brevoApiKey            = Deno.env.get('BREVO_API_KEY');
const brevoSenderEmail       = Deno.env.get('BREVO_SENDER_EMAIL');
const brevoSenderName        = Deno.env.get('BREVO_SENDER_NAME') ?? 'Exclu';
const siteUrl                = Deno.env.get('PUBLIC_SITE_URL') ?? 'https://exclu.at';

if (!supabaseUrl || !supabaseServiceRoleKey || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}
if (!brevoApiKey || !brevoSenderEmail) {
  throw new Error('Missing Brevo environment variables');
}

const supabaseAdmin = createClient(supabaseUrl!, supabaseServiceRoleKey!);
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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-auth',
  };
}

// ── Email Templates ──────────────────────────────────────────────────────────

function buildRequestEmail(params: {
  chatterName: string;
  chatterEmail: string;
  message: string | null;
  chatSettingsUrl: string;
}): string {
  const { chatterName, chatterEmail, message, chatSettingsUrl } = params;
  const messageHtml = message ? `
      <div style="background-color:#0b1120; border-radius:10px; padding:18px; margin:4px 0 24px 0; border:1px solid #1e293b;">
        <h3 style="font-size:15px; color:#f9fafb; margin:0 0 10px 0; font-weight:600;">Message from ${chatterName}:</h3>
        <p style="font-size:14px; line-height:1.6; color:#cbd5e1; margin:0; white-space:pre-wrap;">${message}</p>
      </div>` : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>New chatter request</title>
<style>body{margin:0;padding:0;background-color:#020617;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0}.container{max-width:600px;margin:0 auto;background:linear-gradient(135deg,#020617 0%,#020617 40%,#0b1120 100%);border-radius:16px;border:1px solid #1e293b;box-shadow:0 12px 30px rgba(0,0,0,0.55);overflow:hidden}.header{padding:28px 28px 18px 28px;border-bottom:1px solid #1e293b}.header h1{font-size:26px;color:#f9fafb;margin:0;line-height:1.3;font-weight:700}.content{padding:26px 28px 30px 28px}.content p{font-size:15px;line-height:1.7;color:#cbd5e1;margin:0 0 16px 0}.content strong{color:#ffffff;font-weight:600}.button{display:inline-block;background:linear-gradient(135deg,#bef264 0%,#a3e635 40%,#bbf7d0 100%);color:#020617!important;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:600;font-size:15px;margin:8px 0 24px 0;box-shadow:0 6px 18px rgba(190,242,100,0.4)}.footer{font-size:12px;color:#64748b;text-align:center;padding:18px;border-top:1px solid #1e293b;background-color:#020617}.footer a{color:#a3e635;text-decoration:none}@media(max-width:480px){.container{margin:0 10px}.content{padding:20px}.header{padding:20px}.header h1{font-size:22px}.button{padding:12px 24px;font-size:14px}}</style></head><body>
<div class="container"><div class="header"><h1>New chatter request</h1></div><div class="content">
<p>Hi,</p>
<p><strong>${chatterName}</strong> (${chatterEmail}) wants to manage your fan conversations on Exclu.</p>
${messageHtml}
<p>You can review and accept or reject this request from your Chat settings:</p>
<a href="${chatSettingsUrl}" class="button">Review request →</a>
<p style="margin-top:20px; font-size:13px; color:#94a3b8;">If you didn't expect this, you can safely ignore it.</p>
</div><div class="footer">© 2025 Exclu — All rights reserved<br><a href="${normalizedSiteOrigin}">exclu.at</a></div></div></body></html>`;
}

function buildResponseEmail(params: {
  creatorName: string;
  accepted: boolean;
  dashboardUrl: string;
}): string {
  const { creatorName, accepted, dashboardUrl } = params;
  const title = accepted ? 'Your request has been accepted!' : 'Update on your chatter request';
  const body = accepted
    ? `<p><strong>${creatorName}</strong> has accepted your request to manage their fan conversations on Exclu.</p><p>You can now access their conversations from your chatter dashboard:</p><a href="${dashboardUrl}" class="button">Open chatter dashboard →</a>`
    : `<p><strong>${creatorName}</strong> has declined your request to manage their conversations at this time.</p><p style="font-size:14px; color:#94a3b8;">Don't worry — you can still browse other creators looking for chatters on the Contracts page.</p><a href="${dashboardUrl}" class="button">Browse contracts →</a>`;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title>
<style>body{margin:0;padding:0;background-color:#020617;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0}.container{max-width:600px;margin:0 auto;background:linear-gradient(135deg,#020617 0%,#020617 40%,#0b1120 100%);border-radius:16px;border:1px solid #1e293b;box-shadow:0 12px 30px rgba(0,0,0,0.55);overflow:hidden}.header{padding:28px 28px 18px 28px;border-bottom:1px solid #1e293b}.header h1{font-size:26px;color:#f9fafb;margin:0;line-height:1.3;font-weight:700}.content{padding:26px 28px 30px 28px}.content p{font-size:15px;line-height:1.7;color:#cbd5e1;margin:0 0 16px 0}.content strong{color:#ffffff;font-weight:600}.button{display:inline-block;background:linear-gradient(135deg,#bef264 0%,#a3e635 40%,#bbf7d0 100%);color:#020617!important;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:600;font-size:15px;margin:8px 0 24px 0;box-shadow:0 6px 18px rgba(190,242,100,0.4)}.footer{font-size:12px;color:#64748b;text-align:center;padding:18px;border-top:1px solid #1e293b;background-color:#020617}.footer a{color:#a3e635;text-decoration:none}@media(max-width:480px){.container{margin:0 10px}.content{padding:20px}.header{padding:20px}.header h1{font-size:22px}.button{padding:12px 24px;font-size:14px}}</style></head><body>
<div class="container"><div class="header"><h1>${title}</h1></div><div class="content">
<p>Hi,</p>
${body}
</div><div class="footer">© 2025 Exclu — All rights reserved<br><a href="${normalizedSiteOrigin}">exclu.at</a></div></div></body></html>`;
}

function buildRevokeEmail(params: {
  creatorName: string;
  contractsUrl: string;
}): string {
  const { creatorName, contractsUrl } = params;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Access revoked</title>
<style>body{margin:0;padding:0;background-color:#020617;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0}.container{max-width:600px;margin:0 auto;background:linear-gradient(135deg,#020617 0%,#020617 40%,#0b1120 100%);border-radius:16px;border:1px solid #1e293b;box-shadow:0 12px 30px rgba(0,0,0,0.55);overflow:hidden}.header{padding:28px 28px 18px 28px;border-bottom:1px solid #1e293b}.header h1{font-size:26px;color:#f9fafb;margin:0;line-height:1.3;font-weight:700}.content{padding:26px 28px 30px 28px}.content p{font-size:15px;line-height:1.7;color:#cbd5e1;margin:0 0 16px 0}.content strong{color:#ffffff;font-weight:600}.button{display:inline-block;background:linear-gradient(135deg,#bef264 0%,#a3e635 40%,#bbf7d0 100%);color:#020617!important;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:600;font-size:15px;margin:8px 0 24px 0;box-shadow:0 6px 18px rgba(190,242,100,0.4)}.footer{font-size:12px;color:#64748b;text-align:center;padding:18px;border-top:1px solid #1e293b;background-color:#020617}.footer a{color:#a3e635;text-decoration:none}@media(max-width:480px){.container{margin:0 10px}.content{padding:20px}.header{padding:20px}.header h1{font-size:22px}.button{padding:12px 24px;font-size:14px}}</style></head><body>
<div class="container"><div class="header"><h1>Your chatter access has been revoked</h1></div><div class="content">
<p>Hi,</p>
<p><strong>${creatorName}</strong> has revoked your access to manage their fan conversations on Exclu.</p>
<p>You will no longer be able to view or reply to their conversations from your chatter dashboard.</p>
<p>You can still browse other creators looking for chatters on the Contracts marketplace:</p>
<a href="${contractsUrl}" class="button">Browse contracts \u2192</a>
</div><div class="footer">\u00a9 2025 Exclu \u2014 All rights reserved<br><a href="${normalizedSiteOrigin}">exclu.at</a></div></div></body></html>`;
}

async function sendBrevoEmail(to: string, subject: string, html: string) {
  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': brevoApiKey! },
    body: JSON.stringify({
      sender: { name: brevoSenderName, email: brevoSenderEmail },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
  if (!resp.ok) {
    console.error('[handle-chatter-request] Brevo error:', resp.status, await resp.text());
  }
  return resp.ok;
}

// ── Main Handler ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const rawToken =
      req.headers.get('x-supabase-auth') ??
      req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
      '';
    const token = rawToken.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing authorization token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAuthClient = createClient(supabaseUrl!, supabaseAnonKey!);
    const { data: { user }, error: userError } = await supabaseAuthClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { action } = body as { action: string };

    // ═══════════════════════════════════════════════════════════════════
    // ACTION: send — Chatter sends a request to a creator
    // ═══════════════════════════════════════════════════════════════════
    if (action === 'send') {
      const { creator_id, message } = body as { creator_id: string; message?: string };

      if (!creator_id) {
        return new Response(JSON.stringify({ error: 'Missing creator_id' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check creator exists and is seeking chatters
      const { data: creator } = await supabaseAdmin
        .from('profiles')
        .select('id, display_name, handle, email, seeking_chatters')
        .eq('id', creator_id)
        .single();

      if (!creator || !creator.seeking_chatters) {
        return new Response(JSON.stringify({ error: 'Creator not found or not seeking chatters' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check no duplicate request
      const { data: existing } = await supabaseAdmin
        .from('chatter_requests')
        .select('id, status')
        .eq('creator_id', creator_id)
        .eq('chatter_id', user.id)
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({ error: 'request_exists', message: 'You already have a request for this creator.' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get first profile_id for this creator (for linking)
      const { data: firstProfile } = await supabaseAdmin
        .from('creator_profiles')
        .select('id')
        .eq('user_id', creator_id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      // Insert request
      const { error: insertError } = await supabaseAdmin
        .from('chatter_requests')
        .insert({
          creator_id,
          profile_id: firstProfile?.id ?? null,
          chatter_id: user.id,
          message: message?.trim() || null,
        });

      if (insertError) {
        console.error('[handle-chatter-request] Insert error:', insertError);
        return new Response(JSON.stringify({ error: 'Failed to create request' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get chatter info for the email
      const { data: chatterProfile } = await supabaseAdmin
        .from('profiles')
        .select('display_name, email')
        .eq('id', user.id)
        .single();

      const chatterName = chatterProfile?.display_name || user.email || 'A chatter';
      const chatterEmail = chatterProfile?.email || user.email || '';

      // Get creator email from auth
      const { data: { user: creatorAuth } } = await supabaseAdmin.auth.admin.getUserById(creator_id);
      const creatorEmail = creatorAuth?.email;

      if (creatorEmail) {
        const chatSettingsUrl = `${normalizedSiteOrigin}/app/chat`;
        const emailHtml = buildRequestEmail({
          chatterName,
          chatterEmail,
          message: message?.trim() || null,
          chatSettingsUrl,
        });
        await sendBrevoEmail(
          creatorEmail,
          `${chatterName} wants to manage your conversations on Exclu`,
          emailHtml
        );
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ═══════════════════════════════════════════════════════════════════
    // ACTION: accept — Creator accepts a chatter request
    // ═══════════════════════════════════════════════════════════════════
    if (action === 'accept') {
      const { request_id } = body as { request_id: string };

      if (!request_id) {
        return new Response(JSON.stringify({ error: 'Missing request_id' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Fetch request and verify ownership
      const { data: request } = await supabaseAdmin
        .from('chatter_requests')
        .select('id, creator_id, chatter_id, profile_id, status')
        .eq('id', request_id)
        .single();

      if (!request || request.creator_id !== user.id) {
        return new Response(JSON.stringify({ error: 'Request not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (request.status !== 'pending') {
        return new Response(JSON.stringify({ error: 'Request already handled' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get profile for the invitation
      const profileId = request.profile_id;
      if (!profileId) {
        return new Response(JSON.stringify({ error: 'No profile linked to this request' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get chatter email from auth
      const { data: { user: chatterAuth } } = await supabaseAdmin.auth.admin.getUserById(request.chatter_id);
      const chatterEmail = chatterAuth?.email;

      if (!chatterEmail) {
        return new Response(JSON.stringify({ error: 'Cannot find chatter email' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Create a chatter_invitation (accepted) to grant access
      const { error: invError } = await supabaseAdmin
        .from('chatter_invitations')
        .insert({
          profile_id: profileId,
          invited_by: user.id,
          email: chatterEmail,
          status: 'accepted',
          chatter_id: request.chatter_id,
          accepted_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        });

      if (invError) {
        console.error('[handle-chatter-request] Invitation insert error:', invError);
        return new Response(JSON.stringify({ error: 'Failed to create access' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Update request status
      await supabaseAdmin
        .from('chatter_requests')
        .update({ status: 'accepted', responded_at: new Date().toISOString() })
        .eq('id', request_id);

      // Send acceptance email to chatter
      const { data: creatorProfile } = await supabaseAdmin
        .from('profiles')
        .select('display_name, handle')
        .eq('id', user.id)
        .single();

      const creatorName = creatorProfile?.display_name || creatorProfile?.handle || 'A creator';
      const dashboardUrl = `${normalizedSiteOrigin}/app/chatter`;
      const emailHtml = buildResponseEmail({ creatorName, accepted: true, dashboardUrl });
      await sendBrevoEmail(chatterEmail, `${creatorName} accepted your request on Exclu`, emailHtml);

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ═══════════════════════════════════════════════════════════════════
    // ACTION: reject — Creator rejects a chatter request
    // ═══════════════════════════════════════════════════════════════════
    if (action === 'reject') {
      const { request_id } = body as { request_id: string };

      if (!request_id) {
        return new Response(JSON.stringify({ error: 'Missing request_id' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: request } = await supabaseAdmin
        .from('chatter_requests')
        .select('id, creator_id, chatter_id, status')
        .eq('id', request_id)
        .single();

      if (!request || request.creator_id !== user.id) {
        return new Response(JSON.stringify({ error: 'Request not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (request.status !== 'pending') {
        return new Response(JSON.stringify({ error: 'Request already handled' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Update request status
      await supabaseAdmin
        .from('chatter_requests')
        .update({ status: 'rejected', responded_at: new Date().toISOString() })
        .eq('id', request_id);

      // Send rejection email to chatter
      const { data: { user: chatterAuth } } = await supabaseAdmin.auth.admin.getUserById(request.chatter_id);
      const chatterEmail = chatterAuth?.email;

      if (chatterEmail) {
        const { data: creatorProfile } = await supabaseAdmin
          .from('profiles')
          .select('display_name, handle')
          .eq('id', user.id)
          .single();

        const creatorName = creatorProfile?.display_name || creatorProfile?.handle || 'A creator';
        const dashboardUrl = `${normalizedSiteOrigin}/app/chatter`;
        const emailHtml = buildResponseEmail({ creatorName, accepted: false, dashboardUrl });
        await sendBrevoEmail(chatterEmail, `Update on your chatter request on Exclu`, emailHtml);
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ═══════════════════════════════════════════════════════════════════
    // ACTION: revoke — Creator revokes an active chatter's access
    // ═══════════════════════════════════════════════════════════════════
    if (action === 'revoke') {
      const { chatter_id, invitation_id } = body as { chatter_id?: string; invitation_id?: string };

      if (!chatter_id && !invitation_id) {
        return new Response(JSON.stringify({ error: 'Missing chatter_id or invitation_id' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Resolve chatter email
      let chatterEmail: string | null = null;
      if (chatter_id) {
        const { data: { user: chatterAuth } } = await supabaseAdmin.auth.admin.getUserById(chatter_id);
        chatterEmail = chatterAuth?.email ?? null;
      }
      if (!chatterEmail && invitation_id) {
        const { data: inv } = await supabaseAdmin
          .from('chatter_invitations')
          .select('email')
          .eq('id', invitation_id)
          .single();
        chatterEmail = inv?.email ?? null;
      }

      // Get creator name for the email
      const { data: creatorProfile } = await supabaseAdmin
        .from('profiles')
        .select('display_name, handle')
        .eq('id', user.id)
        .single();

      const creatorName = creatorProfile?.display_name || creatorProfile?.handle || 'A creator';

      if (chatterEmail) {
        const contractsUrl = `${normalizedSiteOrigin}/app/chatter/contracts`;
        const emailHtml = buildRevokeEmail({ creatorName, contractsUrl });
        await sendBrevoEmail(chatterEmail, `${creatorName} has revoked your chatter access on Exclu`, emailHtml);
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[handle-chatter-request] Unexpected error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
