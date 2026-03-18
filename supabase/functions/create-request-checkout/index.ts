import Stripe from 'npm:stripe';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripeSecretKeyLive = Deno.env.get('STRIPE_SECRET_KEY');
const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
const siteUrl = Deno.env.get('PUBLIC_SITE_URL');

if (!stripeSecretKeyLive) throw new Error('Missing STRIPE_SECRET_KEY');
if (!supabaseUrl || !supabaseServiceRoleKey) throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY');
if (!siteUrl) throw new Error('Missing PUBLIC_SITE_URL');

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
const RATE_LIMIT_MAX = 5;
const ipHits = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const existing = ipHits.get(ip);
  if (!existing || now - existing.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipHits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  existing.count += 1;
  return existing.count > RATE_LIMIT_MAX;
}

function jsonError(msg: string, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('cf-connecting-ip') ?? 'unknown';
  if (isRateLimited(ip)) return jsonError('Too many requests', 429, corsHeaders);

  try {
    // ── 1. Auth (optional) ──────────────────────────────────────────────
    const authHeader = req.headers.get('authorization') ?? '';
    const token = authHeader.replace('Bearer ', '').trim();
    let authenticatedUserId: string | null = null;
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) authenticatedUserId = user.id;
    }

    // ── 2. Parse & validate body ────────────────────────────────────────
    const body = await req.json();
    const creatorId = body?.creator_id as string | undefined;
    const profileId = body?.profile_id as string | undefined;
    const description = typeof body?.description === 'string' ? body.description.trim() : '';
    const proposedAmountCents = body?.proposed_amount_cents as number | undefined;
    const fanEmail = typeof body?.fan_email === 'string' ? body.fan_email.trim().toLowerCase() : null;
    const fanPassword = typeof body?.fan_password === 'string' ? body.fan_password : null;

    if (!creatorId || typeof creatorId !== 'string') return jsonError('Missing creator_id', 400, corsHeaders);
    if (!description || description.length < 10) return jsonError('Description must be at least 10 characters', 400, corsHeaders);
    if (description.length > 2000) return jsonError('Description must be under 2000 characters', 400, corsHeaders);
    if (!proposedAmountCents || typeof proposedAmountCents !== 'number' || proposedAmountCents < 2000) {
      return jsonError('Minimum amount is $20.00', 400, corsHeaders);
    }
    if (proposedAmountCents > 100000) return jsonError('Maximum amount is $1,000.00', 400, corsHeaders);

    // Guest must provide email
    if (!authenticatedUserId && !fanEmail) return jsonError('Email is required', 400, corsHeaders);

    // ── 3. Resolve fan identity ─────────────────────────────────────────
    let fanUserId: string;
    let isNewAccount = false;

    if (authenticatedUserId) {
      fanUserId = authenticatedUserId;
    } else {
      // Check if email belongs to existing user
      const { data: existingUserId } = await supabase.rpc('get_user_id_by_email', { input_email: fanEmail! });

      if (existingUserId) {
        fanUserId = existingUserId;
      } else {
        // New account — password required
        if (!fanPassword || fanPassword.length < 6) {
          return jsonError('Password is required (min 6 characters) to create your account', 400, corsHeaders);
        }

        const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
          email: fanEmail!,
          password: fanPassword,
          email_confirm: false,
          user_metadata: { is_creator: false, favorite_creator: creatorId },
        });

        if (createErr || !newUser?.user) {
          console.error('Error creating fan account', createErr);
          return jsonError('Failed to create your account. The email may already be in use.', 400, corsHeaders);
        }

        fanUserId = newUser.user.id;
        isNewAccount = true;

        // Create a fan profile row
        await supabase.from('profiles').upsert({
          id: fanUserId,
          is_creator: false,
        }, { onConflict: 'id' });
      }
    }

    // Prevent self-requests
    if (fanUserId === creatorId) return jsonError('You cannot send a request to yourself', 400, corsHeaders);

    // ── 4. Validate creator ─────────────────────────────────────────────
    const { data: creator, error: creatorErr } = await supabase
      .from('profiles')
      .select('id, handle, display_name, custom_requests_enabled, min_custom_request_cents, stripe_account_id, stripe_connect_status, is_creator_subscribed')
      .eq('id', creatorId)
      .single();

    if (creatorErr || !creator) return jsonError('Creator not found', 404, corsHeaders);
    if (!creator.custom_requests_enabled) return jsonError('This creator does not accept custom requests', 400, corsHeaders);
    if (!creator.stripe_account_id || creator.stripe_connect_status !== 'complete') {
      return jsonError('Creator is not ready to receive payments yet', 400, corsHeaders);
    }

    const minAmount = creator.min_custom_request_cents || 2000;
    if (proposedAmountCents < minAmount) {
      return jsonError(`Minimum amount is $${(minAmount / 100).toFixed(2)}`, 400, corsHeaders);
    }

    // Rate limit: max 1 pending request per fan per creator
    const { data: existingPending } = await supabase
      .from('custom_requests')
      .select('id')
      .eq('fan_id', fanUserId)
      .eq('creator_id', creatorId)
      .in('status', ['pending_payment', 'pending'])
      .limit(1);

    if (existingPending && existingPending.length > 0) {
      return jsonError('You already have a pending request with this creator', 400, corsHeaders);
    }

    // ── 5. Create request row (pending_payment) ─────────────────────────
    const expiresAt = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();

    const { data: requestRecord, error: insertErr } = await supabase
      .from('custom_requests')
      .insert({
        fan_id: fanUserId,
        creator_id: creatorId,
        profile_id: profileId || null,
        description,
        proposed_amount_cents: proposedAmountCents,
        currency: 'USD',
        status: 'pending_payment',
        expires_at: expiresAt,
        fan_email: fanEmail || null,
        is_new_account: isNewAccount,
      })
      .select('id')
      .single();

    if (insertErr || !requestRecord) {
      console.error('Error inserting custom request', insertErr);
      return jsonError('Failed to create request', 500, corsHeaders);
    }

    // ── 6. Create Stripe Checkout (manual capture) ──────────────────────
    const stripe = new Stripe(stripeSecretKeyLive!, { apiVersion: '2023-10-16' });

    const fanProcessingFeeCents = Math.round(proposedAmountCents * 0.05);
    const totalFanPaysCents = proposedAmountCents + fanProcessingFeeCents;

    const isSubscribed = creator.is_creator_subscribed === true;
    const commissionRate = isSubscribed ? 0 : 0.1;
    const platformCommissionCents = Math.round(proposedAmountCents * commissionRate);
    const applicationFeeAmount = platformCommissionCents + fanProcessingFeeCents;

    const creatorHandle = creator.handle || creatorId;
    const successParams = new URLSearchParams({
      status: 'success',
      creator: creatorHandle,
      amount: String(proposedAmountCents),
      ...(isNewAccount ? { new_account: '1' } : {}),
      ...(!authenticatedUserId && !isNewAccount ? { existing_account: '1' } : {}),
    });
    const successUrl = `${normalizedSiteOrigin}/request-success?${successParams.toString()}`;
    const cancelUrl = `${normalizedSiteOrigin}/request-success?status=cancelled&creator=${encodeURIComponent(creatorHandle)}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: totalFanPaysCents,
            product_data: {
              name: `Custom request for ${creator.display_name || creatorHandle}`,
              description: 'Custom content request on Exclu (includes 5% processing fee). Your card will only be charged if the creator accepts.',
            },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        capture_method: 'manual',
        application_fee_amount: applicationFeeAmount,
        transfer_data: {
          destination: creator.stripe_account_id,
        },
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        type: 'request',
        request_id: requestRecord.id,
        fan_id: fanUserId,
        creator_id: creatorId,
        profile_id: profileId || '',
        is_new_account: isNewAccount ? '1' : '0',
        fan_email: fanEmail || '',
      },
    });

    // Store Stripe session ID on the request
    await supabase
      .from('custom_requests')
      .update({ stripe_session_id: session.id })
      .eq('id', requestRecord.id);

    return new Response(JSON.stringify({ url: session.url, request_id: requestRecord.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const stripeError = error as any;
    console.error('Error in create-request-checkout', {
      message: stripeError?.message,
      type: stripeError?.raw?.type,
      code: stripeError?.raw?.code,
    });

    if (stripeError?.raw?.type === 'invalid_request_error') {
      const msg: string = stripeError?.raw?.message ?? '';
      if (msg.includes('cannot currently make live charges') || msg.includes('charges_enabled')) {
        return jsonError('The creator is still completing their payout setup.', 400, corsHeaders);
      }
    }

    return jsonError('Unable to start request checkout', 500, corsHeaders);
  }
});
