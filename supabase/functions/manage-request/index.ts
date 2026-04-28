/**
 * manage-request — UGPayments Sale model.
 *
 * QuickPay charges the fan upfront (Sale). Custom requests transition
 * pending → delivered (creator accepts) or pending → refused/expired
 * (creator declines or 6-day window elapses).
 *
 * Actions:
 *   'accept'  — Creator delivered content → credit wallet, mark delivered
 *               (legacy alias 'capture' still accepted)
 *   'cancel'  — Creator declines or request expired → REST refund → no
 *               wallet credit ever fires
 *
 * Request body: { action: 'accept'|'capture'|'cancel', request_id, delivery_link_id?, creator_response?, reason? }
 * Auth: Required (creator who received the request, OR service_role for the
 *       expiry sweep cron — gated below).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { ugpRefund, UgpApiError } from '../_shared/ugp-api.ts';
import { sendBrevoEmail, escapeHtml, formatUSD } from '../_shared/brevo.ts';
import { applyWalletTransaction } from '../_shared/ledger.ts';

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
  const allowedOrigin = (allowedOrigins.includes(origin) || /^https:\/\/exclu-[a-z0-9-]+-atexclus-projects\.vercel\.app$/.test(origin)) ? origin : normalizedSiteOrigin;
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
    const rawAction = body?.action as string;
    // Normalise legacy alias: 'capture' === 'accept' under the Sale model.
    const action = rawAction === 'capture' ? 'accept' : rawAction;
    const requestId = body?.request_id as string;
    const deliveryLinkId = body?.delivery_link_id as string | undefined;
    const creatorResponse = typeof body?.creator_response === 'string' ? body.creator_response.trim().slice(0, 1000) : null;

    if (!requestId) return jsonError('Missing request_id', 400, corsHeaders);
    if (!['accept', 'cancel'].includes(action)) return jsonError('Invalid action (accept or cancel)', 400, corsHeaders);

    // Fetch the request — creator must own it
    const { data: request, error: reqErr } = await supabase
      .from('custom_requests')
      .select('id, creator_id, fan_id, status, ugp_transaction_id, ugp_mid, proposed_amount_cents, delivery_link_id, description, profile_id, fan_email')
      .eq('id', requestId)
      .single();

    if (reqErr || !request) return jsonError('Request not found', 404, corsHeaders);
    if (request.creator_id !== user.id) return jsonError('Unauthorized', 403, corsHeaders);
    if (request.status !== 'pending') return jsonError(`Request is not pending (current: ${request.status})`, 400, corsHeaders);
    if (!request.ugp_transaction_id) return jsonError('No payment transaction found for this request', 400, corsHeaders);

    // ── ACCEPT (creator delivers content → credit wallet) ────────────────
    if (action === 'accept') {
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

      // Sale model: the fan was charged at checkout. We just credit the
      // creator's wallet and mark the request delivered. No UGP API call.
      const amountCents = request.proposed_amount_cents;
      const fanProcessingFeeCents = Math.round(amountCents * 0.15);

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

      // LEDGER FIRST — if this throws, we bail before flipping status to 'delivered'.
      // sourceTransactionId = the Sale TID from QuickPay.
      await applyWalletTransaction(supabase, {
        ownerId: request.creator_id,
        ownerKind: 'creator',
        direction: 'credit',
        amountCents: creatorNetCents,
        sourceType: 'custom_request',
        sourceId: request.id,
        sourceTransactionId: request.ugp_transaction_id,
        sourceUgpMid: null,
        metadata: { fan_email: request.fan_email ?? null, kind: 'accept' },
      });
      console.log('Creator wallet ledger credited (request accept):', request.creator_id, '+', creatorNetCents, 'cents');

      // Chatter split if attributed (custom_request is an allowed source for chatter)
      if (chatterId && chatterEarningsCents > 0) {
        await applyWalletTransaction(supabase, {
          ownerId: chatterId,
          ownerKind: 'chatter',
          direction: 'credit',
          amountCents: chatterEarningsCents,
          sourceType: 'chatter_commission',
          sourceId: request.id,
          sourceTransactionId: request.ugp_transaction_id,
          metadata: { creator_id: request.creator_id, kind: 'accept' },
        });
        console.log('Chatter ledger credited (request accept):', chatterId, '+', chatterEarningsCents, 'cents');
      }

      // Update request to delivered — AFTER ledger succeeds
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
        console.error('Error updating request after accept:', updateErr);
        return jsonError('Wallet credited but request update failed', 500, corsHeaders);
      }

      // Create a purchase record for the delivery link so the fan can unlock content
      // (works for guests via ?ref=link_<purchase_id>).
      let deliveryPurchaseId: string | null = null;
      try {
        const { data: purchaseRow, error: purchaseErr } = await supabase.from('purchases').insert({
          link_id: linkId,
          amount_cents: amountCents + fanProcessingFeeCents,
          currency: 'USD',
          status: 'succeeded',
          access_token: crypto.randomUUID(),
          buyer_email: request.fan_email ?? null,
          creator_net_cents: creatorNetCents,
          platform_fee_cents: totalPlatformFee,
          ugp_transaction_id: request.ugp_transaction_id,
          ugp_merchant_reference: `req_delivery_${requestId}`,
        }).select('id').single();
        if (purchaseErr) throw purchaseErr;
        deliveryPurchaseId = purchaseRow?.id ?? null;
        console.log('Delivery purchase record created for request:', requestId);
      } catch (purchaseErr) {
        console.error('Error creating delivery purchase (non-fatal):', purchaseErr);
      }

      const { data: deliveryLink } = await supabase
        .from('links')
        .select('slug')
        .eq('id', linkId)
        .single();

      // Notify fan via email — guest gets ?ref= access + signup CTA;
      // registered fan gets the in-app chat link.
      await notifyFanRequestUpdate(request, 'delivered', creatorResponse, {
        deliveryLinkSlug: deliveryLink?.slug ?? null,
        deliveryPurchaseId,
      });

      // Post status update in chat (no-op for guest — no fan_id)
      await postRequestStatusInChat(request, 'delivered', user.id);

      return jsonOk({ success: true, status: 'delivered', creator_net_cents: creatorNetCents }, corsHeaders);
    }

    // ── CANCEL (creator declines OR expiry) ─────────────────────────────
    if (action === 'cancel') {
      const newStatus = body?.reason === 'expired' ? 'expired' : 'refused';

      // Sale model: refund the fan's card via the REST API. Idempotent on
      // already-refunded transactions.
      const refundAmount = (request.proposed_amount_cents + Math.round(request.proposed_amount_cents * 0.15)) / 100;
      try {
        // Pre-routing rows have ugp_mid = NULL — ugpRefund defaults to intl_3d
        // (the only MID that existed before migration 164).
        await ugpRefund(request.ugp_transaction_id, refundAmount, request.ugp_mid as 'us_2d' | 'intl_3d' | null);
        console.log('UGP refund success for request:', requestId, '$', refundAmount, 'mid:', request.ugp_mid ?? 'intl_3d (legacy)');
      } catch (refundErr) {
        const ugpErr = refundErr as UgpApiError;
        if (ugpErr.isAlreadyProcessed) {
          console.log('Transaction already refunded, continuing...');
        } else {
          // Hard fail — do not flip status. The creator can retry, or admin
          // can intervene. Refunding is the load-bearing guarantee for the
          // fan, so we surface the error rather than silently mark refused.
          console.error('UGP refund failed:', {
            message: ugpErr.message,
            httpStatus: ugpErr.httpStatus,
            ugpResponse: ugpErr.ugpResponse,
            requestId,
            ugpTransactionId: request.ugp_transaction_id,
            ugpMid: request.ugp_mid,
            refundAmount,
          });
          return jsonError('Refund failed; please retry. If this persists, contact support.', 502, corsHeaders);
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
        console.error('Error updating request after refund:', updateErr);
        return jsonError('Payment refunded but request update failed', 500, corsHeaders);
      }

      // Notify fan via email
      await notifyFanRequestUpdate(request, newStatus, creatorResponse);

      // Post status update in chat (no-op for guest — no fan_id)
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
  delivery?: { deliveryLinkSlug: string | null; deliveryPurchaseId: string | null },
) {
  // Guest path: fan_id IS NULL but fan_email is the source of truth.
  let fanEmail: string | null = null;
  let isGuest = false;

  if (request.fan_id) {
    const { data: fanAuth } = await supabase.auth.admin.getUserById(request.fan_id);
    fanEmail = fanAuth?.user?.email ?? null;
  } else {
    fanEmail = request.fan_email ?? null;
    isGuest = true;
  }

  if (!fanEmail) return;

  try {
    const amount = formatUSD(request.proposed_amount_cents);
    const desc = (request.description || '').slice(0, 100);
    const normalizedSite = (siteUrl || 'https://exclu.at').replace(/\/$/, '');

    // Look up the creator handle for the signup CTA deep-link.
    let creatorHandle: string | null = null;
    if (request.creator_id) {
      const { data: creator } = await supabase
        .from('profiles')
        .select('handle')
        .eq('id', request.creator_id)
        .single();
      creatorHandle = creator?.handle ?? null;
    }

    const accessUrl = newStatus === 'delivered' && delivery?.deliveryLinkSlug && delivery?.deliveryPurchaseId
      ? `${normalizedSite}/l/${encodeURIComponent(delivery.deliveryLinkSlug)}?ref=link_${delivery.deliveryPurchaseId}`
      : null;

    // Guest signup CTA — preserves email + creator context so the post-signup
    // RPC (claim_guest_custom_requests) can reattach this very request.
    const signupParams = new URLSearchParams({ email: fanEmail });
    if (creatorHandle) signupParams.set('creator', creatorHandle);
    const signupUrl = isGuest ? `${normalizedSite}/fan/signup?${signupParams.toString()}` : null;

    if (newStatus === 'delivered') {
      await sendBrevoEmail({
        to: fanEmail,
        subject: `Your custom request (${amount}) has been delivered!`,
        htmlContent: buildFanRequestEmailHtml(
          'delivered',
          amount,
          desc,
          creatorResponse,
          { accessUrl, signupUrl, isGuest },
        ),
      });
    } else if (newStatus === 'refused' || newStatus === 'expired') {
      const subject = newStatus === 'expired'
        ? `Your custom request (${amount}) expired — refund issued`
        : `Your custom request (${amount}) was declined — refund issued`;
      await sendBrevoEmail({
        to: fanEmail,
        subject,
        htmlContent: buildFanRequestEmailHtml(
          newStatus,
          amount,
          desc,
          creatorResponse,
          { accessUrl: null, signupUrl, isGuest },
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
  status: 'delivered' | 'refused' | 'expired',
  amount: string,
  description: string,
  creatorResponse: string | null,
  cta: { accessUrl: string | null; signupUrl: string | null; isGuest: boolean },
): string {
  const heading = status === 'delivered'
    ? 'Your request has been delivered ✅'
    : status === 'expired'
      ? 'Your request expired ⏱️'
      : 'Your request was declined ❌';
  const bodyText = status === 'delivered'
    ? `Great news! The creator has accepted your custom request for <strong>${amount}</strong> and delivered your content.`
    : status === 'expired'
      ? `The creator did not respond to your <strong>${amount}</strong> request within 6 days, so we have refunded your card in full. The amount should reappear on your statement within a few business days.`
      : `The creator has declined your custom request for <strong>${amount}</strong>. We have refunded your card in full. The amount should reappear on your statement within a few business days.`;
  const responseBlock = creatorResponse
    ? `<p style="background:#020617;border:1px solid #1e293b;border-radius:10px;padding:14px 18px;color:#f1f5f9;font-style:italic;">&ldquo;${escapeHtml(creatorResponse)}&rdquo;</p>`
    : '';
  const normalizedSite = (siteUrl || 'https://exclu.at').replace(/\/$/, '');

  let primaryHref: string;
  let primaryLabel: string;
  if (cta.accessUrl) {
    primaryHref = cta.accessUrl;
    primaryLabel = 'Unlock your content';
  } else if (cta.isGuest) {
    primaryHref = normalizedSite;
    primaryLabel = 'Back to Exclu';
  } else {
    primaryHref = `${normalizedSite}/fan?tab=messages`;
    primaryLabel = 'View in chat';
  }

  // Guest-only secondary CTA: invite to sign up. Post-signup, the
  // claim_guest_custom_requests RPC reattaches all matching email rows.
  const signupBlock = cta.isGuest && cta.signupUrl
    ? `<div style="margin-top:8px;padding:18px;border-radius:12px;background:#0f172a;border:1px solid #1e293b">
<p style="font-size:14px;color:#cbd5e1;margin:0 0 10px"><strong style="color:#fff">Want to keep chatting with the creator?</strong></p>
<p style="font-size:13px;color:#94a3b8;margin:0 0 14px;line-height:1.6">Create your free Exclu account in 30 seconds. Your past requests will be linked automatically.</p>
<a href="${cta.signupUrl}" style="display:inline-block;background:transparent;color:#a3e635!important;text-decoration:none;padding:10px 22px;border-radius:999px;font-weight:600;font-size:13px;border:1px solid #a3e635">Create my account</a>
</div>`
    : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>body{margin:0;padding:0;background-color:#020617;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0}.container{max-width:600px;margin:0 auto;background:linear-gradient(135deg,#020617 0%,#020617 40%,#0b1120 100%);border-radius:16px;border:1px solid #1e293b;overflow:hidden}.header{padding:28px 28px 18px;border-bottom:1px solid #1e293b}.header h1{font-size:22px;color:#f9fafb;margin:0;font-weight:700}.content{padding:26px 28px 30px}.content p{font-size:15px;line-height:1.7;color:#cbd5e1;margin:0 0 16px}.content strong{color:#fff;font-weight:600}.button{display:inline-block;background:linear-gradient(135deg,#bef264 0%,#a3e635 40%,#bbf7d0 100%);color:#020617!important;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:600;font-size:15px;margin:8px 0 20px;box-shadow:0 6px 18px rgba(190,242,100,0.4)}.footer{font-size:12px;color:#64748b;text-align:center;padding:18px;border-top:1px solid #1e293b}.footer a{color:#a3e635;text-decoration:none}</style></head>
<body><div class="container"><div class="header"><h1>${heading}</h1></div>
<div class="content"><p>${bodyText}</p>
<p style="font-size:13px;color:#94a3b8;">Request: &ldquo;${escapeHtml(description)}&rdquo;</p>
${responseBlock}
<a href="${primaryHref}" class="button">${primaryLabel}</a>
${signupBlock}
</div>
<div class="footer">&copy; 2026 Exclu<br><a href="${normalizedSite}">exclu</a></div></div></body></html>`;
}
