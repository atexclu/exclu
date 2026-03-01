import Stripe from 'npm:stripe';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripeSecretKeyLive = Deno.env.get('STRIPE_SECRET_KEY');
const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');

if (!stripeSecretKeyLive) throw new Error('Missing STRIPE_SECRET_KEY');
if (!supabaseUrl || !supabaseServiceRoleKey) throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY');

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const siteUrl = Deno.env.get('PUBLIC_SITE_URL');
const normalizedSiteOrigin = (siteUrl || 'https://exclu.at').replace(/\/$/, '');
const allowedOrigins = [
  normalizedSiteOrigin,
  'http://localhost:8080',
  'http://localhost:8081',
  'http://localhost:8082',
  'http://localhost:8083',
  'http://localhost:8084',
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
      .select('id, creator_id, fan_id, status, stripe_payment_intent_id, proposed_amount_cents, delivery_link_id')
      .eq('id', requestId)
      .single();

    if (reqErr || !request) return jsonError('Request not found', 404, corsHeaders);
    if (request.creator_id !== user.id) return jsonError('Unauthorized', 403, corsHeaders);
    if (request.status !== 'pending') return jsonError(`Request is not pending (current: ${request.status})`, 400, corsHeaders);
    if (!request.stripe_payment_intent_id) return jsonError('No payment intent found for this request', 400, corsHeaders);

    const stripe = new Stripe(stripeSecretKeyLive!, { apiVersion: '2023-10-16' });

    // ── CAPTURE (creator accepts + delivered content) ────────────────────
    if (action === 'capture') {
      // Verify content was uploaded — delivery_link_id must be set before calling capture
      const linkId = deliveryLinkId || request.delivery_link_id;
      if (!linkId) return jsonError('You must upload content before accepting the request', 400, corsHeaders);

      // Verify the link exists and has content
      const { data: link } = await supabase
        .from('links')
        .select('id, storage_path')
        .eq('id', linkId)
        .single();

      // Also check link_media for library attachments
      const { data: linkMedia } = await supabase
        .from('link_media')
        .select('id')
        .eq('link_id', linkId)
        .limit(1);

      const hasContent = !!(link?.storage_path) || (linkMedia && linkMedia.length > 0);
      if (!hasContent) return jsonError('The content link must have at least one photo or video attached', 400, corsHeaders);

      // Capture the payment
      try {
        await stripe.paymentIntents.capture(request.stripe_payment_intent_id);
      } catch (captureErr: any) {
        console.error('Stripe capture error:', captureErr?.message);
        // If already captured or cancelled, handle gracefully
        if (captureErr?.raw?.code === 'payment_intent_unexpected_state') {
          return jsonError('Payment has already been processed or expired', 400, corsHeaders);
        }
        return jsonError('Failed to capture payment. The authorization may have expired.', 500, corsHeaders);
      }

      // Calculate commission
      const amountCents = request.proposed_amount_cents;
      const fanProcessingFeeCents = Math.round(amountCents * 0.05);

      const { data: creatorProfile } = await supabase
        .from('profiles')
        .select('is_creator_subscribed')
        .eq('id', user.id)
        .single();

      const commissionRate = creatorProfile?.is_creator_subscribed ? 0 : 0.1;
      const platformCommissionCents = Math.round(amountCents * commissionRate);
      const creatorNetCents = amountCents - platformCommissionCents;
      const totalPlatformFee = platformCommissionCents + fanProcessingFeeCents;

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

      return jsonOk({ success: true, status: 'delivered', creator_net_cents: creatorNetCents }, corsHeaders);
    }

    // ── CANCEL (creator declines OR expiry) ─────────────────────────────
    if (action === 'cancel') {
      const newStatus = body?.reason === 'expired' ? 'expired' : 'refused';

      try {
        await stripe.paymentIntents.cancel(request.stripe_payment_intent_id);
      } catch (cancelErr: any) {
        console.error('Stripe cancel error:', cancelErr?.message);
        // If already cancelled/captured, proceed with status update anyway
        if (cancelErr?.raw?.code !== 'payment_intent_unexpected_state') {
          return jsonError('Failed to cancel payment authorization', 500, corsHeaders);
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

      return jsonOk({ success: true, status: newStatus }, corsHeaders);
    }

    return jsonError('Invalid action', 400, corsHeaders);
  } catch (error) {
    console.error('Error in manage-request', error);
    return jsonError('Internal server error', 500, corsHeaders);
  }
});
