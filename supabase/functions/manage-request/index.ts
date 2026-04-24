/**
 * manage-request — UGPayments version.
 *
 * Handles creator accept (capture) and decline (void) for custom requests.
 * Captures or voids pre-authorized payments via UGPayments REST API.
 *
 * Actions:
 *   'capture' — Creator accepts, content uploaded → capture pre-auth → credit wallet
 *   'cancel'  — Creator declines or request expired → void pre-auth → release hold
 *
 * Request body: { action: 'capture'|'cancel', request_id, delivery_link_id?, creator_response?, reason? }
 * Auth: Required (creator who received the request)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { ugpCapture, ugpVoid, UgpApiError } from '../_shared/ugp-api.ts';
import { sendBrevoEmail, escapeHtml, formatUSD } from '../_shared/brevo.ts';

const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseServiceRoleKey) throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY');

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const siteUrl = Deno.env.get('PUBLIC_SITE_URL');
const normalizedSiteOrigin = (siteUrl || 'https://exclu.at').replace(/\/$/, '');
const allowedOrigins = [
  normalizedSiteOrigin,
  'http://localhost:8080', 'http://localhost:8081', 'http://localhost:8082',
  'http://localhost:8083', 'http://localhost:8084', 'http://localhost:5173',
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  const allowedOrigin = allowedOrigins.includes(origin) ? origin : normalizedSiteOrigin;
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-auth',
  };
}

function jsonError(msg: string, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function jsonOk(data: Record<string, unknown>, cors: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Auth required — only the creator who received the request can manage it
    const authHeader = req.headers.get('authorization') ?? '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return jsonError('Authentication required', 401, corsHeaders);

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return jsonError('Authentication required', 401, corsHeaders);

    const body = await req.json();
    const action = body?.action as string; // 'capture' | 'cancel'
    const requestId = body?.request_id as string;
    const deliveryLinkId = body?.delivery_link_id as string | undefined;
    const creatorResponse = typeof body?.creator_response === 'string' ? body.creator_response.trim().slice(0, 1000) : null;

    if (!requestId) return jsonError('Missing request_id', 400, corsHeaders);
    if (!['capture', 'cancel'].includes(action)) return jsonError('Invalid action (capture or cancel)', 400, corsHeaders);

    // Fetch the request — creator must own it
    const { data: request, error: reqErr } = await supabase
      .from('custom_requests')
      .select('id, creator_id, fan_id, status, ugp_transaction_id, proposed_amount_cents, delivery_link_id, description, profile_id')
      .eq('id', requestId)
      .single();

    if (reqErr || !request) return jsonError('Request not found', 404, corsHeaders);
    if (request.creator_id !== user.id) return jsonError('Unauthorized', 403, corsHeaders);
    if (request.status !== 'pending') return jsonError(`Request is not pending (current: ${request.status})`, 400, corsHeaders);
    if (!request.ugp_transaction_id) return jsonError('No payment transaction found for this request', 400, corsHeaders);

    // ── CAPTURE (creator accepts + delivered content) ────────────────────
    if (action === 'capture') {
      // Verify content was uploaded — delivery_link_id must be set
      const linkId = deliveryLinkId || request.delivery_link_id;
      if (!linkId) return jsonError('You must upload content before accepting the request', 400, corsHeaders);

      // Verify the link exists and has content
      const { data: link } = await supabase
        .from('links')
        .select('id, storage_path')
        .eq('id', linkId)
        .single();

      const { data: linkMedia } = await supabase
        .from('link_media')
        .select('id')
        .eq('link_id', linkId)
        .limit(1);

      const hasContent = !!(link?.storage_path) || (linkMedia && linkMedia.length > 0);
      if (!hasContent) return jsonError('The content link must have at least one photo or video attached', 400, corsHeaders);

      // Capture the pre-authorized payment via UGPayments API
      const amountCents = request.proposed_amount_cents;
      const fanProcessingFeeCents = Math.round(amountCents * 0.15);
      const totalFanPaysCents = amountCents + fanProcessingFeeCents;
      const captureAmountDecimal = totalFanPaysCents / 100;

      // Try to capture the pre-authorized payment via UGPayments API.
      // If the payment was already processed as a Sale (via ConfirmURL or verify-payment fallback),
      // the capture will fail — that's OK, the money is already collected.
      try {
        await ugpCapture(request.ugp_transaction_id, captureAmountDecimal);
        console.log('UGP capture success for request:', requestId);
      } catch (captureErr) {
        const ugpErr = captureErr as UgpApiError;
        console.error('UGP capture error (may be already processed as Sale):', ugpErr.message);

        if (ugpErr.isAlreadyProcessed) {
          console.log('Transaction already captured/processed, continuing...');
        } else if (ugpErr.isExpired) {
          return jsonError('Payment authorization has expired (6-day limit). The hold has been released.', 400, corsHeaders);
        } else {
          // If capture fails for other reasons, the payment may have been processed as a direct Sale.
          // Continue with the wallet credit — the fan has already been charged.
          console.warn('Capture failed but continuing (payment may be a Sale, not Auth):', ugpErr.message);
        }
      }

      // Check if this request was handled by a chatter (via conversation assignment)
      let chatterId: string | null = null;
      if (request.fan_id && request.profile_id) {
        const { data: conv } = await supabase
          .from('conversations')
          .select('assigned_chatter_id')
          .eq('fan_id', request.fan_id)
          .eq('profile_id', request.profile_id)
          .maybeSingle();
        if (conv?.assigned_chatter_id && conv.assigned_chatter_id !== user.id) {
          chatterId = conv.assigned_chatter_id;
        }
      }

      // Calculate commission with chatter split if applicable
      const { data: creatorProfile } = await supabase
        .from('profiles')
        .select('is_creator_subscribed')
        .eq('id', user.id)
        .single();

      let creatorNetCents: number;
      let totalPlatformFee: number;
      let chatterEarningsCents = 0;

      if (chatterId) {
        // 60/25/15 split: creator/chatter/platform
        creatorNetCents = Math.round(amountCents * 0.60);
        chatterEarningsCents = Math.round(amountCents * 0.25);
        totalPlatformFee = Math.round(amountCents * 0.15) + fanProcessingFeeCents;
      } else {
        const commissionRate = creatorProfile?.is_creator_subscribed ? 0 : 0.15;
        const platformCommissionCents = Math.round(amountCents * commissionRate);
        creatorNetCents = amountCents - platformCommissionCents;
        totalPlatformFee = platformCommissionCents + fanProcessingFeeCents;
      }

      // Credit the creator's wallet
      try {
        await supabase.rpc('credit_creator_wallet', {
          p_creator_id: user.id,
          p_amount_cents: creatorNetCents,
        });
        console.log('Creator wallet credited:', user.id, '+', creatorNetCents, 'cents');
      } catch (walletErr) {
        console.error('Error crediting wallet after capture:', walletErr);
      }

      // Credit chatter wallet if applicable
      if (chatterId && chatterEarningsCents > 0) {
        try {
          await supabase.rpc('credit_creator_wallet', {
            p_creator_id: chatterId,
            p_amount_cents: chatterEarningsCents,
          });
          await supabase.rpc('increment_chatter_earnings', {
            p_chatter_id: chatterId,
            p_amount_cents: chatterEarningsCents,
          });
          console.log('Chatter wallet + earnings credited:', chatterId, '+', chatterEarningsCents, 'cents');
        } catch (err) {
          console.error('Error crediting chatter:', err);
        }
      }

      // Update request to delivered
      const { error: updateErr } = await supabase
        .from('custom_requests')
        .update({
          status: 'delivered',
          delivered_at: new Date().toISOString(),
          delivery_link_id: linkId,
          creator_response: creatorResponse,
          platform_fee_cents: totalPlatformFee,
          creator_net_cents: creatorNetCents,
          read_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (updateErr) {
        console.error('Error updating request after capture:', updateErr);
        return jsonError('Payment captured but request update failed', 500, corsHeaders);
      }

      // Create a purchase record for the delivery link so the fan can unlock content
      // This makes custom request deliveries work exactly like paid link purchases
      try {
        await supabase.from('purchases').insert({
          link_id: linkId,
          amount_cents: amountCents + fanProcessingFeeCents,
          currency: 'USD',
          status: 'succeeded',
          access_token: crypto.randomUUID(),
          buyer_email: null, // Fan email not needed — they access via ref
          creator_net_cents: creatorNetCents,
          platform_fee_cents: totalPlatformFee,
          ugp_transaction_id: request.ugp_transaction_id,
          ugp_merchant_reference: `req_delivery_${requestId}`,
        });
        console.log('Delivery purchase record created for request:', requestId);
      } catch (purchaseErr) {
        console.error('Error creating delivery purchase (non-fatal):', purchaseErr);
      }

      // Notify fan via email
      await notifyFanRequestUpdate(request, 'delivered', creatorResponse);

      // Post status update in chat
      await postRequestStatusInChat(request, 'delivered', user.id);

      return jsonOk({ success: true, status: 'delivered', creator_net_cents: creatorNetCents }, corsHeaders);
    }

    // ── CANCEL (creator declines OR expiry) ─────────────────────────────
    if (action === 'cancel') {
      const newStatus = body?.reason === 'expired' ? 'expired' : 'refused';

      // Try to void the pre-authorized payment.
      // If the payment was already processed as a Sale, void will fail — in that case
      // we need to issue a refund instead, or just update status (fan already charged).
      try {
        await ugpVoid(request.ugp_transaction_id);
        console.log('UGP void success for request:', requestId);
      } catch (voidErr) {
        const ugpErr = voidErr as UgpApiError;
        console.error('UGP void error (may be Sale not Auth):', ugpErr.message);

        if (ugpErr.isAlreadyProcessed) {
          console.log('Transaction already voided/captured, continuing...');
        } else {
          // If void fails, try refund (for Sale transactions that can't be voided)
          try {
            const { ugpRefund } = await import('../_shared/ugp-api.ts');
            const refundAmount = (request.proposed_amount_cents + Math.round(request.proposed_amount_cents * 0.15)) / 100;
            await ugpRefund(request.ugp_transaction_id, refundAmount);
            console.log('UGP refund success (Sale → refund) for request:', requestId);
          } catch (refundErr) {
            console.error('Refund also failed:', (refundErr as any)?.message);
            // Continue anyway — update the status so the creator sees it as declined
            // The fan may need manual refund from admin
          }
        }
      }

      const { error: updateErr } = await supabase
        .from('custom_requests')
        .update({
          status: newStatus,
          creator_response: creatorResponse,
          read_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (updateErr) {
        console.error('Error updating request after cancel:', updateErr);
        return jsonError('Payment voided but request update failed', 500, corsHeaders);
      }

      // Notify fan via email
      await notifyFanRequestUpdate(request, newStatus, creatorResponse);

      // Post status update in chat
      await postRequestStatusInChat(request, newStatus, user.id);

      return jsonOk({ success: true, status: newStatus }, corsHeaders);
    }

    return jsonError('Invalid action', 400, corsHeaders);
  } catch (error) {
    console.error('Error in manage-request', error);
    return jsonError('Internal server error', 500, corsHeaders);
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────

async function notifyFanRequestUpdate(
  request: Record<string, any>,
  newStatus: string,
  creatorResponse: string | null,
) {
  if (!request.fan_id) return;
  try {
    const { data: fanAuth } = await supabase.auth.admin.getUserById(request.fan_id);
    const fanEmail = fanAuth?.user?.email;
    if (!fanEmail) return;

    const amount = formatUSD(request.proposed_amount_cents);
    const desc = (request.description || '').slice(0, 100);

    if (newStatus === 'delivered') {
      await sendBrevoEmail({
        to: fanEmail,
        subject: `Your custom request (${amount}) has been delivered!`,
        htmlContent: buildFanRequestEmailHtml(
          'delivered',
          amount,
          desc,
          creatorResponse,
        ),
      });
    } else if (newStatus === 'refused') {
      await sendBrevoEmail({
        to: fanEmail,
        subject: `Your custom request (${amount}) was declined`,
        htmlContent: buildFanRequestEmailHtml(
          'refused',
          amount,
          desc,
          creatorResponse,
        ),
      });
    }
  } catch (err) {
    console.error('Error notifying fan (non-fatal):', err);
  }
}

async function postRequestStatusInChat(
  request: Record<string, any>,
  newStatus: string,
  creatorId: string,
) {
  if (!request.fan_id || !request.profile_id) return;
  try {
    const { data: conv } = await supabase
      .from('conversations')
      .select('id')
      .eq('fan_id', request.fan_id)
      .eq('profile_id', request.profile_id)
      .maybeSingle();

    if (!conv?.id) return;

    const amount = formatUSD(request.proposed_amount_cents);
    const emoji = newStatus === 'delivered' ? '\u2705' : newStatus === 'refused' ? '\u274C' : '\u2139\uFE0F';
    const label = newStatus === 'delivered' ? 'accepted & delivered' : newStatus;
    const preview = `${emoji} Request ${label} (${amount})`;

    await supabase.from('messages').insert({
      conversation_id: conv.id,
      sender_type: 'system',
      sender_id: creatorId,
      content: preview,
      content_type: 'system',
    });

    await supabase.from('conversations').update({
      last_message_at: new Date().toISOString(),
      last_message_preview: preview.slice(0, 100),
    }).eq('id', conv.id);
  } catch (err) {
    console.error('Error posting request status in chat (non-fatal):', err);
  }
}

function buildFanRequestEmailHtml(
  status: 'delivered' | 'refused',
  amount: string,
  description: string,
  creatorResponse: string | null,
): string {
  const isDelivered = status === 'delivered';
  const heading = isDelivered
    ? 'Your request has been delivered \u2705'
    : 'Your request was declined \u274C';
  const bodyText = isDelivered
    ? `Great news! The creator has accepted your custom request for <strong>${amount}</strong> and delivered your content.`
    : `The creator has declined your custom request for <strong>${amount}</strong>. The hold on your payment has been released — you will not be charged.`;
  const responseBlock = creatorResponse
    ? `<p style="background:#020617;border:1px solid #1e293b;border-radius:10px;padding:14px 18px;color:#f1f5f9;font-style:italic;">&ldquo;${escapeHtml(creatorResponse)}&rdquo;</p>`
    : '';
  const ctaText = isDelivered ? 'View in chat' : 'Back to Exclu';
  const normalizedSite = (siteUrl || 'https://exclu.at').replace(/\/$/, '');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>body{margin:0;padding:0;background-color:#020617;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0}.container{max-width:600px;margin:0 auto;background:linear-gradient(135deg,#020617 0%,#020617 40%,#0b1120 100%);border-radius:16px;border:1px solid #1e293b;overflow:hidden}.header{padding:28px 28px 18px;border-bottom:1px solid #1e293b}.header h1{font-size:22px;color:#f9fafb;margin:0;font-weight:700}.content{padding:26px 28px 30px}.content p{font-size:15px;line-height:1.7;color:#cbd5e1;margin:0 0 16px}.content strong{color:#fff;font-weight:600}.button{display:inline-block;background:linear-gradient(135deg,#bef264 0%,#a3e635 40%,#bbf7d0 100%);color:#020617!important;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:600;font-size:15px;margin:8px 0 20px;box-shadow:0 6px 18px rgba(190,242,100,0.4)}.footer{font-size:12px;color:#64748b;text-align:center;padding:18px;border-top:1px solid #1e293b}.footer a{color:#a3e635;text-decoration:none}</style></head>
<body><div class="container"><div class="header"><h1>${heading}</h1></div>
<div class="content"><p>${bodyText}</p>
<p style="font-size:13px;color:#94a3b8;">Request: &ldquo;${escapeHtml(description)}&rdquo;</p>
${responseBlock}
<a href="${normalizedSite}/fan?tab=messages" class="button">${ctaText}</a></div>
<div class="footer">&copy; 2026 Exclu<br><a href="${normalizedSite}">exclu</a></div></div></body></html>`;
}
