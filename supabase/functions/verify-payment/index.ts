/**
 * verify-payment — Fallback payment verification.
 *
 * Called by the frontend when the ConfirmURL callback hasn't fired
 * but the fan has been redirected back with TransactionID in the URL.
 *
 * This is a safety net: if UGPayments fails to POST to the ConfirmURL,
 * the frontend can call this to verify and finalize the purchase.
 *
 * Request body: { purchase_id, transaction_id }
 * Auth: Not required (anon can verify)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendBrevoEmail, formatUSD } from '../_shared/brevo.ts';

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

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const purchaseId = body?.purchase_id as string;
    const transactionId = body?.transaction_id as string;

    if (!purchaseId || !transactionId) {
      return new Response(JSON.stringify({ error: 'Missing purchase_id or transaction_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load the purchase
    const { data: purchase, error: fetchErr } = await supabase
      .from('purchases')
      .select('id, link_id, amount_cents, status, buyer_email, creator_net_cents, platform_fee_cents, chat_chatter_id, chatter_earnings_cents, chat_conversation_id')
      .eq('id', purchaseId)
      .single();

    if (fetchErr || !purchase) {
      return new Response(JSON.stringify({ error: 'Purchase not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Already succeeded — just return it
    if (purchase.status === 'succeeded') {
      return new Response(JSON.stringify({ verified: true, status: 'succeeded' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Only process pending purchases
    if (purchase.status !== 'pending') {
      return new Response(JSON.stringify({ error: 'Purchase is not pending', status: purchase.status }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // The fan was redirected back with a TransactionID — this means UGPayments
    // processed the payment successfully. Finalize the purchase.
    const accessToken = crypto.randomUUID();

    const { error: updateErr } = await supabase.from('purchases').update({
      status: 'succeeded',
      ugp_transaction_id: transactionId,
      access_token: accessToken,
    }).eq('id', purchaseId);

    if (updateErr) {
      console.error('Error updating purchase in verify-payment:', updateErr);
      return new Response(JSON.stringify({ error: 'Failed to verify purchase' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Credit creator wallet
    const { data: link } = await supabase.from('links').select('creator_id, title, slug').eq('id', purchase.link_id).single();

    if (link && purchase.creator_net_cents > 0) {
      try {
        await supabase.rpc('credit_creator_wallet', {
          p_creator_id: link.creator_id,
          p_amount_cents: purchase.creator_net_cents,
        });
      } catch (err) {
        console.error('Error crediting wallet in verify-payment:', err);
      }
    }

    // Chatter earnings
    if (purchase.chat_chatter_id && purchase.chatter_earnings_cents > 0) {
      try {
        await supabase.rpc('increment_chatter_earnings', {
          p_chatter_id: purchase.chat_chatter_id,
          p_amount_cents: purchase.chatter_earnings_cents,
        });
      } catch (err) {
        console.error('Error incrementing chatter earnings:', err);
      }
    }

    // Conversation revenue
    if (purchase.chat_conversation_id && purchase.amount_cents > 0) {
      try {
        await supabase.rpc('increment_conversation_revenue', {
          p_conversation_id: purchase.chat_conversation_id,
          p_amount_cents: purchase.amount_cents,
        });
      } catch (err) {
        console.error('Error incrementing conversation revenue:', err);
      }
    }

    // Send email with proper access URL and template
    if (purchase.buyer_email && link?.slug) {
      const accessUrl = `${siteUrl}/l/${encodeURIComponent(link.slug)}?payment_success=true&ref=link_${purchaseId}`;
      const linkTitle = link.title || 'exclusive content';
      await sendBrevoEmail({
        to: purchase.buyer_email,
        subject: `Your access to "${linkTitle}" on Exclu`,
        htmlContent: `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>body{margin:0;padding:0;background-color:#020617;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0}.container{max-width:600px;margin:0 auto;background:linear-gradient(135deg,#020617 0%,#0b1120 100%);border-radius:16px;border:1px solid #1e293b;overflow:hidden}.header{padding:28px;border-bottom:1px solid #1e293b}.header h1{font-size:26px;color:#f9fafb;margin:0;font-weight:700}.content{padding:26px 28px 30px}.content p{font-size:15px;line-height:1.7;color:#cbd5e1;margin:0 0 16px}.content strong{color:#fff}.button{display:inline-block;background:linear-gradient(135deg,#bef264,#a3e635,#bbf7d0);color:#020617!important;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:600;font-size:15px;margin:8px 0 20px;box-shadow:0 6px 18px rgba(190,242,100,0.4)}.link-box{background-color:#020617;border-radius:10px;padding:14px 18px;margin:4px 0 20px;border:1px solid #1e293b;word-break:break-all}.link-box a{font-size:13px;color:#a3e635;text-decoration:none;font-family:monospace}.footer{font-size:12px;color:#64748b;text-align:center;padding:18px;border-top:1px solid #1e293b}.footer a{color:#a3e635;text-decoration:none}</style></head>
<body><div class="container"><div class="header"><h1>Your exclusive content is unlocked</h1></div>
<div class="content"><p>Thank you for your purchase on <strong>Exclu</strong>. Your premium content is now available.</p>
<p>Click the button below to access it instantly:</p>
<a href="${accessUrl}" class="button">Open my content</a>
<p style="font-size:13px;color:#94a3b8;margin-bottom:8px;">Or copy this link in your browser:</p>
<div class="link-box"><a href="${accessUrl}">${accessUrl}</a></div>
<p style="margin-top:20px;font-size:13px;color:#94a3b8;">If you didn't make this purchase, you can safely ignore this email.</p></div>
<div class="footer">&copy; 2026 Exclu &mdash; All rights reserved<br><a href="${siteUrl}">exclu</a></div></div></body></html>`,
      });
      await supabase.from('purchases').update({ email_sent: true }).eq('id', purchaseId);
    }

    console.log('verify-payment: purchase confirmed via fallback:', purchaseId, transactionId);

    return new Response(JSON.stringify({ verified: true, status: 'succeeded' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in verify-payment:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
