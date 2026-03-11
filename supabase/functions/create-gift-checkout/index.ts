import Stripe from 'npm:stripe';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripeSecretKeyLive = Deno.env.get('STRIPE_SECRET_KEY');
const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
const siteUrl = Deno.env.get('PUBLIC_SITE_URL');

if (!stripeSecretKeyLive) throw new Error('Missing STRIPE_SECRET_KEY environment variable');
if (!supabaseUrl || !supabaseServiceRoleKey) throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY environment variables');
if (!siteUrl) throw new Error('Missing PUBLIC_SITE_URL environment variable');

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const normalizedSiteOrigin = siteUrl.replace(/\/$/, '');
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

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const ipHits = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const existing = ipHits.get(ip);
  if (!existing || now - existing.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipHits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  existing.count += 1;
  ipHits.set(ip, existing);
  return existing.count > RATE_LIMIT_MAX_REQUESTS;
}

serve(async (req) => {
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
    // Authenticate fan
    const authHeader = req.headers.get('authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    const { data: { user: fanUser }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !fanUser) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const wishlistItemId = body?.wishlist_item_id as string | undefined;
    const profileId = body?.profile_id as string | undefined;
    const message = typeof body?.message === 'string' ? body.message.slice(0, 500) : null;
    const isAnonymous = body?.is_anonymous === true;

    if (!wishlistItemId || typeof wishlistItemId !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing wishlist_item_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch wishlist item + creator profile in one query via join
    const { data: wishlistItem, error: itemError } = await supabase
      .from('wishlist_items')
      .select(`
        id,
        name,
        price_cents,
        currency,
        max_quantity,
        gifted_count,
        is_visible,
        creator_id,
        profiles!wishlist_items_creator_id_fkey (
          id,
          handle,
          display_name,
          stripe_account_id,
          stripe_connect_status,
          is_creator_subscribed
        )
      `)
      .eq('id', wishlistItemId)
      .single();

    if (itemError || !wishlistItem) {
      return new Response(JSON.stringify({ error: 'Wishlist item not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!wishlistItem.is_visible) {
      return new Response(JSON.stringify({ error: 'This item is no longer available' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check quantity limit
    if (
      wishlistItem.max_quantity !== null &&
      wishlistItem.gifted_count >= wishlistItem.max_quantity
    ) {
      return new Response(JSON.stringify({ error: 'This item has already been gifted the maximum number of times' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Prevent self-gifting
    if (wishlistItem.creator_id === fanUser.id) {
      return new Response(JSON.stringify({ error: 'You cannot gift yourself' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const creator = wishlistItem.profiles as any;
    if (!creator) {
      return new Response(JSON.stringify({ error: 'Creator not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!creator.stripe_account_id || creator.stripe_connect_status !== 'complete') {
      return new Response(JSON.stringify({ error: 'This creator is not ready to receive payments yet' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const amountCents = wishlistItem.price_cents;
    const stripe = new Stripe(stripeSecretKeyLive!, { apiVersion: '2023-10-16' });

    // Create gift_purchases row (pending)
    const { data: giftRecord, error: giftInsertError } = await supabase
      .from('gift_purchases')
      .insert({
        fan_id: fanUser.id,
        creator_id: wishlistItem.creator_id,
        profile_id: profileId || null,
        wishlist_item_id: wishlistItemId,
        amount_cents: amountCents,
        currency: wishlistItem.currency || 'USD',
        message,
        is_anonymous: isAnonymous,
        status: 'pending',
      })
      .select('id')
      .single();

    if (giftInsertError || !giftRecord) {
      console.error('Error inserting gift_purchase record', giftInsertError);
      return new Response(JSON.stringify({ error: 'Failed to create gift record' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Pricing: fan pays +5% processing fee on top of gift price
    const fanProcessingFeeCents = Math.round(amountCents * 0.05);
    const totalFanPaysCents = amountCents + fanProcessingFeeCents;

    // Platform commission: 10% free, 0% premium
    const isSubscribed = creator.is_creator_subscribed === true;
    const commissionRate = isSubscribed ? 0 : 0.1;
    const platformCommissionCents = Math.round(amountCents * commissionRate);
    const applicationFeeAmount = platformCommissionCents + fanProcessingFeeCents;

    const creatorHandle = creator.handle || wishlistItem.creator_id;
    const successUrl = `${normalizedSiteOrigin}/gift-success?item=${encodeURIComponent(wishlistItem.name)}&creator=${encodeURIComponent(creatorHandle)}`;
    const cancelUrl = `${normalizedSiteOrigin}/${encodeURIComponent(creatorHandle)}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: (wishlistItem.currency || 'USD').toLowerCase(),
            unit_amount: totalFanPaysCents,
            product_data: {
              name: `Gift: ${wishlistItem.name}`,
              description: `Gift for ${creator.display_name || creatorHandle} (includes 5% processing fee)`,
            },
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        type: 'gift',
        gift_purchase_id: giftRecord.id,
        wishlist_item_id: wishlistItemId,
        fan_id: fanUser.id,
        creator_id: wishlistItem.creator_id,
        profile_id: profileId ?? '',
      },
      payment_intent_data: {
        application_fee_amount: applicationFeeAmount,
        transfer_data: {
          destination: creator.stripe_account_id,
        },
      },
    });

    // Store session ID on gift record
    await supabase
      .from('gift_purchases')
      .update({ stripe_session_id: session.id })
      .eq('id', giftRecord.id);

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const stripeError = error as any;
    const raw = stripeError?.raw;
    console.error('Error in create-gift-checkout', {
      message: stripeError?.message,
      type: raw?.type,
      code: raw?.code,
      detail: raw?.message,
    });

    if (raw?.type === 'invalid_request_error') {
      const msg: string = raw?.message ?? '';
      if (
        raw?.param === 'payment_intent_data[transfer_data][destination]' ||
        msg.includes('cannot currently make live charges') ||
        msg.includes('charges_enabled') ||
        msg.includes('completing their') ||
        msg.includes('payout')
      ) {
        return new Response(
          JSON.stringify({ error: 'The creator is still completing their payout setup.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    return new Response(JSON.stringify({ error: 'Unable to start gift checkout' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
