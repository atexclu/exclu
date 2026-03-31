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

    // Send email
    if (purchase.buyer_email && link?.slug) {
      const accessUrl = `${siteUrl}/l/${encodeURIComponent(link.slug)}?ref=link_${purchaseId}`;
      await sendBrevoEmail({
        to: purchase.buyer_email,
        subject: `Your access to "${link.title || 'exclusive content'}" on Exclu`,
        htmlContent: `<p>Your content is unlocked. <a href="${accessUrl}">Click here to access it</a>.</p>`,
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
