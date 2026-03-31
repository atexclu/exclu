/**
 * verify-payment — Universal fallback payment verification.
 *
 * Called by the frontend when the ConfirmURL callback hasn't fired
 * but the fan has been redirected back with TransactionID in the URL.
 *
 * Supports all transaction types:
 *   - link_<uuid>  → purchases
 *   - tip_<uuid>   → tips
 *   - gift_<uuid>  → gift_purchases
 *   - req_<uuid>   → custom_requests
 *   - sub_<uuid>   → subscription activation
 *
 * Request body: { merchant_reference, transaction_id }
 * Auth: Not required
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendBrevoEmail, escapeHtml, formatUSD } from '../_shared/brevo.ts';

const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
const siteUrl = (Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at').replace(/\/$/, '');

if (!supabaseUrl || !supabaseServiceRoleKey) throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY');

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const normalizedSiteOrigin = siteUrl;
const allowedOrigins = [normalizedSiteOrigin, 'http://localhost:8080', 'http://localhost:8081', 'http://localhost:8082', 'http://localhost:8083', 'http://localhost:8084', 'http://localhost:5173'];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : normalizedSiteOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

function jsonOk(data: Record<string, unknown>, cors: Record<string, string>) {
  return new Response(JSON.stringify(data), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function jsonError(msg: string, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    // Support both old format (purchase_id) and new format (merchant_reference)
    const merchantReference = body?.merchant_reference as string || '';
    const purchaseId = body?.purchase_id as string || '';
    const transactionId = body?.transaction_id as string;

    if (!transactionId) return jsonError('Missing transaction_id', 400, corsHeaders);

    // Parse the type and record ID from merchant_reference or purchase_id
    let type: string;
    let recordId: string;

    if (merchantReference && merchantReference.includes('_')) {
      const idx = merchantReference.indexOf('_');
      type = merchantReference.slice(0, idx);
      recordId = merchantReference.slice(idx + 1);
    } else if (purchaseId) {
      type = 'link';
      recordId = purchaseId;
    } else {
      return jsonError('Missing merchant_reference or purchase_id', 400, corsHeaders);
    }

    switch (type) {
      case 'link':
        return await verifyLinkPurchase(recordId, transactionId, corsHeaders);
      case 'tip':
        return await verifyTip(recordId, transactionId, corsHeaders);
      case 'gift':
        return await verifyGift(recordId, transactionId, corsHeaders);
      case 'req':
        return await verifyRequest(recordId, transactionId, corsHeaders);
      case 'sub':
        return await verifySubscription(recordId, transactionId, corsHeaders);
      default:
        return jsonError(`Unknown type: ${type}`, 400, corsHeaders);
    }
  } catch (error) {
    console.error('Error in verify-payment:', error);
    return jsonError('Internal error', 500, getCorsHeaders(req));
  }
});

// ── LINK PURCHASE ────────────────────────────────────────────────────────

async function verifyLinkPurchase(recordId: string, transactionId: string, cors: Record<string, string>) {
  const { data: purchase } = await supabase
    .from('purchases')
    .select('id, link_id, amount_cents, status, buyer_email, creator_net_cents, platform_fee_cents, chat_chatter_id, chatter_earnings_cents, chat_conversation_id')
    .eq('id', recordId)
    .single();

  if (!purchase) return jsonError('Purchase not found', 404, cors);
  if (purchase.status === 'succeeded') return jsonOk({ verified: true, status: 'succeeded' }, cors);
  if (purchase.status !== 'pending') return jsonError('Purchase is not pending', 400, cors);

  await supabase.from('purchases').update({
    status: 'succeeded',
    ugp_transaction_id: transactionId,
    access_token: crypto.randomUUID(),
  }).eq('id', recordId);

  const { data: link } = await supabase.from('links').select('creator_id, title, slug').eq('id', purchase.link_id).single();

  if (link && purchase.creator_net_cents > 0) {
    try { await supabase.rpc('credit_creator_wallet', { p_creator_id: link.creator_id, p_amount_cents: purchase.creator_net_cents }); } catch (e) { console.error('Wallet credit error:', e); }
  }
  if (purchase.chat_chatter_id && purchase.chatter_earnings_cents > 0) {
    try { await supabase.rpc('increment_chatter_earnings', { p_chatter_id: purchase.chat_chatter_id, p_amount_cents: purchase.chatter_earnings_cents }); } catch (e) { console.error('Chatter error:', e); }
  }
  if (purchase.chat_conversation_id && purchase.amount_cents > 0) {
    try { await supabase.rpc('increment_conversation_revenue', { p_conversation_id: purchase.chat_conversation_id, p_amount_cents: purchase.amount_cents }); } catch (e) { console.error('Conv revenue error:', e); }
  }

  if (purchase.buyer_email && link?.slug) {
    const accessUrl = `${siteUrl}/l/${encodeURIComponent(link.slug)}?payment_success=true&ref=link_${recordId}`;
    const linkTitle = link.title || 'exclusive content';
    await sendBrevoEmail({
      to: purchase.buyer_email,
      subject: `Your access to "${linkTitle}" on Exclu`,
      htmlContent: buildContentAccessEmailHtml(linkTitle, accessUrl),
    });
    await supabase.from('purchases').update({ email_sent: true }).eq('id', recordId);
  }

  console.log('verify-payment: link purchase confirmed:', recordId);
  return jsonOk({ verified: true, status: 'succeeded' }, cors);
}

// ── TIP ──────────────────────────────────────────────────────────────────

async function verifyTip(recordId: string, transactionId: string, cors: Record<string, string>) {
  const { data: tip } = await supabase
    .from('tips')
    .select('id, fan_id, creator_id, profile_id, amount_cents, status, message, is_anonymous')
    .eq('id', recordId)
    .single();

  if (!tip) return jsonError('Tip not found', 404, cors);
  if (tip.status === 'succeeded') return jsonOk({ verified: true, status: 'succeeded' }, cors);
  if (tip.status !== 'pending') return jsonError('Tip is not pending', 400, cors);

  const { data: creator } = await supabase.from('profiles').select('id, is_creator_subscribed, display_name').eq('id', tip.creator_id).single();

  const commissionRate = creator?.is_creator_subscribed ? 0 : 0.10;
  const platformCommission = Math.round(tip.amount_cents * commissionRate);
  const fanFee = Math.round(tip.amount_cents * 0.05);
  const creatorNet = tip.amount_cents - platformCommission;

  await supabase.from('tips').update({
    status: 'succeeded',
    paid_at: new Date().toISOString(),
    ugp_transaction_id: transactionId,
    platform_fee_cents: platformCommission + fanFee,
    creator_net_cents: creatorNet,
  }).eq('id', recordId);

  if (creatorNet > 0) {
    try { await supabase.rpc('credit_creator_wallet', { p_creator_id: tip.creator_id, p_amount_cents: creatorNet }); } catch (e) { console.error('Wallet error:', e); }
  }

  console.log('verify-payment: tip confirmed:', recordId);
  return jsonOk({ verified: true, status: 'succeeded' }, cors);
}

// ── GIFT ─────────────────────────────────────────────────────────────────

async function verifyGift(recordId: string, transactionId: string, cors: Record<string, string>) {
  const { data: gift } = await supabase
    .from('gift_purchases')
    .select('id, creator_id, wishlist_item_id, amount_cents, status')
    .eq('id', recordId)
    .single();

  if (!gift) return jsonError('Gift not found', 404, cors);
  if (gift.status === 'succeeded') return jsonOk({ verified: true, status: 'succeeded' }, cors);
  if (gift.status !== 'pending') return jsonError('Gift is not pending', 400, cors);

  const { data: creator } = await supabase.from('profiles').select('id, is_creator_subscribed').eq('id', gift.creator_id).single();

  const commissionRate = creator?.is_creator_subscribed ? 0 : 0.10;
  const platformCommission = Math.round(gift.amount_cents * commissionRate);
  const fanFee = Math.round(gift.amount_cents * 0.05);
  const creatorNet = gift.amount_cents - platformCommission;

  await supabase.from('gift_purchases').update({
    status: 'succeeded',
    paid_at: new Date().toISOString(),
    ugp_transaction_id: transactionId,
    platform_fee_cents: platformCommission + fanFee,
    creator_net_cents: creatorNet,
  }).eq('id', recordId);

  // Increment gifted_count
  const { data: item } = await supabase.from('wishlist_items').select('gifted_count').eq('id', gift.wishlist_item_id).single();
  if (item) {
    await supabase.from('wishlist_items').update({ gifted_count: (item.gifted_count || 0) + 1 }).eq('id', gift.wishlist_item_id);
  }

  if (creatorNet > 0) {
    try { await supabase.rpc('credit_creator_wallet', { p_creator_id: gift.creator_id, p_amount_cents: creatorNet }); } catch (e) { console.error('Wallet error:', e); }
  }

  console.log('verify-payment: gift confirmed:', recordId);
  return jsonOk({ verified: true, status: 'succeeded' }, cors);
}

// ── CUSTOM REQUEST (pre-auth → pending) ──────────────────────────────────

async function verifyRequest(recordId: string, transactionId: string, cors: Record<string, string>) {
  const { data: request } = await supabase
    .from('custom_requests')
    .select('id, status')
    .eq('id', recordId)
    .single();

  if (!request) return jsonError('Request not found', 404, cors);
  if (request.status === 'pending') return jsonOk({ verified: true, status: 'pending' }, cors);
  if (request.status !== 'pending_payment') return jsonError('Request is not pending_payment', 400, cors);

  await supabase.from('custom_requests').update({
    status: 'pending',
    ugp_transaction_id: transactionId,
  }).eq('id', recordId);

  console.log('verify-payment: request pre-auth confirmed:', recordId);
  return jsonOk({ verified: true, status: 'pending' }, cors);
}

// ── SUBSCRIPTION ─────────────────────────────────────────────────────────

async function verifySubscription(recordId: string, transactionId: string, cors: Record<string, string>) {
  const { data: profile } = await supabase.from('profiles').select('id, is_creator_subscribed').eq('id', recordId).single();
  if (!profile) return jsonError('Profile not found', 404, cors);
  if (profile.is_creator_subscribed) return jsonOk({ verified: true, status: 'subscribed' }, cors);

  await supabase.from('profiles').update({
    is_creator_subscribed: true,
    show_join_banner: false,
    show_certification: true,
    show_deeplinks: true,
    show_available_now: true,
  }).eq('id', recordId);

  console.log('verify-payment: subscription confirmed:', recordId);
  return jsonOk({ verified: true, status: 'subscribed' }, cors);
}

// ── EMAIL TEMPLATE ───────────────────────────────────────────────────────

function buildContentAccessEmailHtml(title: string, accessUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>body{margin:0;padding:0;background-color:#020617;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0}.container{max-width:600px;margin:0 auto;background:linear-gradient(135deg,#020617 0%,#0b1120 100%);border-radius:16px;border:1px solid #1e293b;overflow:hidden}.header{padding:28px;border-bottom:1px solid #1e293b}.header h1{font-size:26px;color:#f9fafb;margin:0;font-weight:700}.content{padding:26px 28px 30px}.content p{font-size:15px;line-height:1.7;color:#cbd5e1;margin:0 0 16px}.content strong{color:#fff}.button{display:inline-block;background:linear-gradient(135deg,#bef264,#a3e635,#bbf7d0);color:#020617!important;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:600;font-size:15px;margin:8px 0 20px;box-shadow:0 6px 18px rgba(190,242,100,0.4)}.link-box{background-color:#020617;border-radius:10px;padding:14px 18px;margin:4px 0 20px;border:1px solid #1e293b;word-break:break-all}.link-box a{font-size:13px;color:#a3e635;text-decoration:none;font-family:monospace}.footer{font-size:12px;color:#64748b;text-align:center;padding:18px;border-top:1px solid #1e293b}.footer a{color:#a3e635;text-decoration:none}</style></head>
<body><div class="container"><div class="header"><h1>Your exclusive content is unlocked</h1></div>
<div class="content"><p>Thank you for your purchase on <strong>Exclu</strong>. Your premium content is now available.</p>
<p>Click the button below to access it instantly:</p>
<a href="${accessUrl}" class="button">Open my content</a>
<p style="font-size:13px;color:#94a3b8;margin-bottom:8px;">Or copy this link in your browser:</p>
<div class="link-box"><a href="${accessUrl}">${accessUrl}</a></div>
<p style="margin-top:20px;font-size:13px;color:#94a3b8;">If you didn't make this purchase, you can safely ignore this email.</p></div>
<div class="footer">&copy; 2026 Exclu &mdash; All rights reserved<br><a href="${siteUrl}">exclu</a></div></div></body></html>`;
}
