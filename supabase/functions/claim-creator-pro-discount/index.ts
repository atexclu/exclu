/**
 * claim-creator-pro-discount
 *
 * Grants a one-time 50% retention discount on the next monthly rebill for a
 * Creator Pro monthly subscriber. Offered when the user attempts to cancel
 * their subscription OR delete their account. Annual plans excluded.
 *
 * Auth: requires the user's JWT. Chatters / agencies / fans / admins acting
 * on behalf of someone else CANNOT claim — auth.uid() must equal the profile
 * being discounted (this is implicit because we always claim for the JWT
 * user, never an arbitrary id).
 *
 * Atomicity + idempotency:
 *   - The RPC `claim_creator_pro_retention_discount` runs all preconditions
 *     and the grant insert in one transaction.
 *   - The unique index on creator_pro_discount_grants(user_id) plus the
 *     profiles.creator_pro_discount_used_at check guarantee one grant ever.
 *
 * Sentinels mapped to HTTP status:
 *   EXCLU_DISCOUNT_NOT_MONTHLY        → 409
 *   EXCLU_DISCOUNT_ALREADY_USED       → 409
 *   EXCLU_DISCOUNT_SUSPENDED          → 409
 *   EXCLU_DISCOUNT_ACCOUNT_DELETED    → 410
 *   EXCLU_DISCOUNT_NOT_FOUND          → 404
 *   EXCLU_DISCOUNT_BAD_CONTEXT        → 400
 *   23505 (unique violation)          → 409 (already used race)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface RequestBody {
  context?: 'cancel_attempt' | 'delete_attempt';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl =
    Deno.env.get('SUPABASE_URL') ??
    Deno.env.get('PROJECT_URL') ??
    Deno.env.get('VITE_SUPABASE_URL');
  const supabaseAnonKey =
    Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('VITE_SUPABASE_ANON_KEY');
  const supabaseServiceKey =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    console.error('[claim-creator-pro-discount] Missing Supabase env');
    return jsonResponse({ error: 'Server misconfigured' }, 500);
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) return jsonResponse({ error: 'Missing authorization' }, 401);

    const authClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authErr } = await authClient.auth.getUser(jwt);
    if (authErr || !user) return jsonResponse({ error: 'Unauthorized' }, 401);

    let body: RequestBody;
    try {
      body = (await req.json()) as RequestBody;
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const context = body.context;
    if (context !== 'cancel_attempt' && context !== 'delete_attempt') {
      return jsonResponse({ error: 'Invalid context' }, 400);
    }

    const svc = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await svc.rpc('claim_creator_pro_retention_discount', {
      p_user_id: user.id,
      p_context: context,
    });

    if (error) {
      const msg = (error as { message?: string }).message ?? '';
      const code = (error as { code?: string }).code ?? '';

      if (msg.includes('EXCLU_DISCOUNT_NOT_MONTHLY')) {
        return jsonResponse({ error: 'Discount only available on monthly Pro plans', sentinel: 'NOT_MONTHLY' }, 409);
      }
      if (msg.includes('EXCLU_DISCOUNT_ALREADY_USED') || code === '23505') {
        return jsonResponse({ error: 'You have already claimed this one-time discount', sentinel: 'ALREADY_USED' }, 409);
      }
      if (msg.includes('EXCLU_DISCOUNT_SUSPENDED')) {
        return jsonResponse({ error: 'Subscription suspended — resolve billing first', sentinel: 'SUSPENDED' }, 409);
      }
      if (msg.includes('EXCLU_DISCOUNT_ACCOUNT_DELETED')) {
        return jsonResponse({ error: 'Account already deleted', sentinel: 'ACCOUNT_DELETED' }, 410);
      }
      if (msg.includes('EXCLU_DISCOUNT_NOT_FOUND')) {
        return jsonResponse({ error: 'Profile not found', sentinel: 'NOT_FOUND' }, 404);
      }
      if (msg.includes('EXCLU_DISCOUNT_BAD_CONTEXT')) {
        return jsonResponse({ error: 'Invalid context', sentinel: 'BAD_CONTEXT' }, 400);
      }
      console.error('[claim-creator-pro-discount] RPC error', error);
      return jsonResponse({ error: 'Internal error' }, 500);
    }

    return jsonResponse(data ?? { success: true }, 200);
  } catch (e) {
    console.error('[claim-creator-pro-discount] unexpected error', e);
    return jsonResponse({ error: 'Internal error' }, 500);
  }
});
