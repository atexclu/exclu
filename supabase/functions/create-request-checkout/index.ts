/**
 * create-request-checkout — UGPayments QuickPay (Sale model).
 *
 * QuickPay (hosted checkout) processes a Sale at submission — UG's API
 * does not expose pre-auth toggles to merchants on this MID, so the fan's
 * card is charged immediately. If the creator declines or the request
 * expires, manage-request issues a full refund via the REST API.
 *
 * Account creation is OPTIONAL:
 *   - With fan_password (>=6 chars): the fan signs up at checkout. fan_id
 *     is set to the new auth user.
 *   - Without password: pure guest. fan_id stays NULL on the row;
 *     fan_email is the only handle to reach them. If they later sign up
 *     with the same email, claim_guest_custom_requests reattaches the
 *     historical rows.
 *
 * Request body: { creator_id, profile_id?, description, proposed_amount_cents, fan_email?, fan_password? }
 * Auth: Optional.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { routeMidForCountry, getMidCredentials } from '../_shared/ugRouting.ts';

const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
const siteUrl = (Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at').replace(/\/$/, '');

if (!supabaseUrl || !supabaseServiceRoleKey) throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY');

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
const normalizedSiteOrigin = siteUrl;

const allowedOrigins = [
  normalizedSiteOrigin,
  'http://localhost:8080', 'http://localhost:8081', 'http://localhost:8082',
  'http://localhost:8083', 'http://localhost:8084', 'http://localhost:5173',
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  const allowed = (allowedOrigins.includes(origin) || /^https:\/\/exclu-[a-z0-9-]+-atexclus-projects\.vercel\.app$/.test(origin)) ? origin : normalizedSiteOrigin;
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
    const country = typeof body?.country === 'string' ? body.country.toUpperCase() : null;
    const midKey = routeMidForCountry(country);
    const creds = getMidCredentials(midKey);

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

    // ── 3. Resolve fan identity ─────────────────────────────────────────
    // Three paths:
    //   (a) authenticated: fanUserId = current user
    //   (b) email matches an existing account: fanUserId = that account
    //   (c) email is new + password supplied: create the account now
    //   (d) email is new + no password: pure guest, fanUserId = null
    let fanUserId: string | null = null;
    let isNewAccount = false;

    if (authenticatedUserId) {
      fanUserId = authenticatedUserId;
    } else {
      const { data: existingUserId } = await supabase.rpc('get_user_id_by_email', { input_email: fanEmail! });

      if (existingUserId) {
        fanUserId = existingUserId;
      } else if (fanPassword && fanPassword.length >= 6) {
        // Fan opted in: create the real account with their password.
        const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
          email: fanEmail!,
          password: fanPassword,
          email_confirm: false,
          user_metadata: {
            is_creator: false,
            favorite_creator: creatorId,
            created_via: 'custom_request',
          },
        });

        if (createErr || !newUser?.user) {
          console.error('Error creating fan account:', createErr);
          return jsonError('Failed to create your account. The email may already be in use.', 400, corsHeaders);
        }

        fanUserId = newUser.user.id;
        isNewAccount = true;

        await supabase.from('profiles').upsert({ id: fanUserId, is_creator: false }, { onConflict: 'id' });
      }
      // else: pure guest — fanUserId stays null; fan_email carries identity.
    }

    if (fanUserId && fanUserId === creatorId) {
      return jsonError('You cannot send a request to yourself', 400, corsHeaders);
    }

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

    // Fans can submit multiple requests to the same creator (no limit)

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
        ugp_mid: midKey,
      })
      .select('id')
      .single();

    if (insertErr || !requestRecord) {
      console.error('Error inserting custom request:', insertErr);
      return jsonError('Failed to create request', 500, corsHeaders);
    }

    // ── 6. Build QuickPay form fields (Sale model) ────────────────────
    const fanProcessingFeeCents = Math.round(proposedAmountCents * 0.15);
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
      QuickPayToken: creds.quickPayToken,
      SiteID: creds.siteId,
      AmountTotal: amountDecimal,
      CurrencyID: 'USD',
      'ItemName[0]': `Custom request for ${(creator.display_name || creatorHandle).slice(0, 200)}`,
      'ItemQuantity[0]': '1',
      'ItemAmount[0]': amountDecimal,
      'ItemDesc[0]': 'Custom content request on Exclu (includes 15% processing fee). Refunded in full if the creator declines or does not respond within 6 days.',
      AmountShipping: '0.00',
      ShippingRequired: 'false',
      MembershipRequired: 'false',
      ApprovedURL: `${siteUrl}/request-success?${successParams.toString()}`,
      ConfirmURL: `${siteUrl}/api/ugp-confirm`,
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
