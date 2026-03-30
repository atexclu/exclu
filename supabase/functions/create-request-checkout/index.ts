/**
 * create-request-checkout — UGPayments QuickPay version with pre-auth.
 *
 * Same request body, same validations, same guest account creation logic.
 * Returns { fields, request_id } for QuickPay form (pre-auth configured server-side).
 *
 * Pre-auth note: UGPayments has configured our account for pre-auth mode.
 * The ConfirmURL callback will receive TransactionState='Authorize' (not 'Sale').
 * The funds are held (not captured) until the creator accepts via manage-request.
 *
 * Request body: { creator_id, profile_id?, description, proposed_amount_cents, fan_email?, fan_password? }
 * Auth: Optional (guests provide email + password to create account)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
const siteUrl = (Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at').replace(/\/$/, '');
const quickPayToken = Deno.env.get('QUICKPAY_TOKEN');
const siteId = Deno.env.get('QUICKPAY_SITE_ID') || '98845';

if (!supabaseUrl || !supabaseServiceRoleKey) throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY');
if (!quickPayToken) throw new Error('Missing QUICKPAY_TOKEN');

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
const normalizedSiteOrigin = siteUrl;

const allowedOrigins = [
  normalizedSiteOrigin,
  'http://localhost:8080', 'http://localhost:8081', 'http://localhost:8082',
  'http://localhost:8083', 'http://localhost:8084', 'http://localhost:5173',
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  const allowed = allowedOrigins.includes(origin) ? origin : normalizedSiteOrigin;
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-auth',
  };
}

function jsonOk(data: Record<string, unknown>, cors: Record<string, string>) {
  return new Response(JSON.stringify(data), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function jsonError(msg: string, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;
const ipHits = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const e = ipHits.get(ip);
  if (!e || now - e.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipHits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  e.count++;
  return e.count > RATE_LIMIT_MAX;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
             req.headers.get('cf-connecting-ip') ?? 'unknown';
  if (isRateLimited(ip)) return jsonError('Too many requests', 429, corsHeaders);

  try {
    // ── 1. Auth (optional — guests provide email) ─────────────────────
    const authHeader = req.headers.get('authorization') ?? '';
    const token = authHeader.replace('Bearer ', '').trim();
    let authenticatedUserId: string | null = null;
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) authenticatedUserId = user.id;
    }

    // ── 2. Parse & validate body ──────────────────────────────────────
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
    if (!authenticatedUserId && !fanEmail) return jsonError('Email is required', 400, corsHeaders);

    // ── 3. Resolve fan identity (same logic as Stripe version) ────────
    let fanUserId: string;
    let isNewAccount = false;

    if (authenticatedUserId) {
      fanUserId = authenticatedUserId;
    } else {
      const { data: existingUserId } = await supabase.rpc('get_user_id_by_email', { input_email: fanEmail! });

      if (existingUserId) {
        fanUserId = existingUserId;
      } else {
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
          console.error('Error creating fan account:', createErr);
          return jsonError('Failed to create your account. The email may already be in use.', 400, corsHeaders);
        }

        fanUserId = newUser.user.id;
        isNewAccount = true;

        await supabase.from('profiles').upsert({ id: fanUserId, is_creator: false }, { onConflict: 'id' });
      }
    }

    if (fanUserId === creatorId) return jsonError('You cannot send a request to yourself', 400, corsHeaders);

    // ── 4. Validate creator ───────────────────────────────────────────
    const { data: creator, error: creatorErr } = await supabase
      .from('profiles')
      .select('id, handle, display_name, custom_requests_enabled, min_custom_request_cents, payout_setup_complete, is_creator_subscribed')
      .eq('id', creatorId)
      .single();

    if (creatorErr || !creator) return jsonError('Creator not found', 404, corsHeaders);
    if (!creator.custom_requests_enabled) return jsonError('This creator does not accept custom requests', 400, corsHeaders);
    // Payout setup NOT required to receive requests — earnings go to wallet

    const minAmount = creator.min_custom_request_cents || 2000;
    if (proposedAmountCents < minAmount) {
      return jsonError(`Minimum amount is $${(minAmount / 100).toFixed(2)}`, 400, corsHeaders);
    }

    // Max 1 pending request per fan per creator
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

    // ── 5. Create request record (pending_payment) ────────────────────
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
      console.error('Error inserting custom request:', insertErr);
      return jsonError('Failed to create request', 500, corsHeaders);
    }

    // ── 6. Build QuickPay form fields (pre-auth active server-side) ───
    const fanProcessingFeeCents = Math.round(proposedAmountCents * 0.05);
    const totalFanPaysCents = proposedAmountCents + fanProcessingFeeCents;
    const amountDecimal = (totalFanPaysCents / 100).toFixed(2);

    const merchantReference = `req_${requestRecord.id}`;
    const creatorHandle = creator.handle || creatorId;

    const successParams = new URLSearchParams({
      status: 'success',
      creator: creatorHandle,
      amount: String(proposedAmountCents),
    });
    if (isNewAccount) successParams.set('new_account', '1');
    if (!authenticatedUserId && !isNewAccount) successParams.set('existing_account', '1');

    const fields: Record<string, string> = {
      QuickPayToken: quickPayToken!,
      SiteID: siteId,
      AmountTotal: amountDecimal,
      CurrencyID: 'USD',
      'ItemName[0]': `Custom request for ${(creator.display_name || creatorHandle).slice(0, 200)}`,
      'ItemQuantity[0]': '1',
      'ItemAmount[0]': amountDecimal,
      'ItemDesc[0]': 'Custom content request on Exclu (includes 5% processing fee). Your card will only be charged if the creator accepts.',
      AmountShipping: '0.00',
      ShippingRequired: 'false',
      MembershipRequired: 'false',
      ApprovedURL: `${siteUrl}/request-success?${successParams.toString()}`,
      ConfirmURL: `${supabaseUrl}/functions/v1/ugp-confirm?apikey=${Deno.env.get('SUPABASE_ANON_KEY') || ''}`,
      DeclinedURL: `${siteUrl}/request-success?status=cancelled&creator=${encodeURIComponent(creatorHandle)}`,
      MerchantReference: merchantReference,
    };

    if (fanEmail) fields.Email = fanEmail;

    // Store merchant ref on request
    await supabase.from('custom_requests').update({
      ugp_merchant_reference: merchantReference,
    }).eq('id', requestRecord.id);

    return jsonOk({ fields, request_id: requestRecord.id }, corsHeaders);

  } catch (error) {
    console.error('Error in create-request-checkout:', error);
    return jsonError('Unable to start request checkout', 500, corsHeaders);
  }
});
