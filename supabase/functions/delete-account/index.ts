/**
 * delete-account — User-initiated account soft-delete orchestrator.
 *
 * Orchestration order (DO NOT REORDER):
 *   1. Verify auth (JWT) and confirmation token (handle for creator/agency,
 *      email for fan/chatter, case-insensitive).
 *   2. Call RPC `soft_delete_account` (atomic — DB consistent on success).
 *   3. Best-effort: ban the auth user (3x retry w/ backoff) so they cannot
 *      log back in while the soft-delete propagates.
 *   4. Best-effort fire-and-forget: enqueue confirmation email, fan
 *      notification email (creator/agency only), and a support alert if
 *      the auth ban failed.
 *
 * Failure semantics:
 *   - Hard blocks raised by the RPC (`EXCLU_BLOCK_*`) and the
 *     already-deleted sentinel (`EXCLU_NOT_FOUND_OR_ALREADY_DELETED`) map
 *     to 409 Conflict so the frontend can re-fetch pre-delete-check.
 *   - Other RPC errors → 500.
 *   - Auth ban / email failures NEVER roll back the DB soft-delete.
 *     They are logged and (for ban failures) reported via support alert.
 *
 * Auth: required. JWT in `Authorization: Bearer <token>`.
 * Verified manually (`verify_jwt = false` in config.toml — Exclu convention).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type AccountType = 'creator' | 'agency' | 'fan' | 'chatter';

interface DeleteAccountRequest {
  confirmation: string;
}

interface SoftDeleteResult {
  audit_id: string;
  fan_subs_canceled: number;
  creator_profiles_deleted: number;
  wallet_forfeited_cents: number;
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isBlockError(message: string): boolean {
  return (
    message.includes('EXCLU_BLOCK_') ||
    message.includes('EXCLU_NOT_FOUND_OR_ALREADY_DELETED')
  );
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', Allow: 'POST, OPTIONS' },
    });
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
    console.error('[delete-account] Missing Supabase env vars');
    return jsonResponse({ error: 'Server misconfigured' }, 500);
  }

  try {
    // --- 1. Auth gate ---
    const authHeader =
      req.headers.get('Authorization') ?? req.headers.get('authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) return jsonResponse({ error: 'Missing authorization' }, 401);

    const authClient = createClient(supabaseUrl, supabaseAnonKey);
    const {
      data: { user },
      error: authErr,
    } = await authClient.auth.getUser(jwt);
    if (authErr || !user) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!user.email) return jsonResponse({ error: 'User has no email on file' }, 400);

    // --- 2. Parse + validate body ---
    let body: DeleteAccountRequest;
    try {
      body = (await req.json()) as DeleteAccountRequest;
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const confirmation = (body?.confirmation ?? '').trim();
    if (!confirmation) {
      return jsonResponse({ error: 'Confirmation is required' }, 400);
    }

    const svc = createClient(supabaseUrl, supabaseServiceKey);

    // --- 3. Look up role ---
    const { data: profile, error: profileErr } = await svc
      .from('profiles')
      .select('role, deleted_at')
      .eq('id', user.id)
      .maybeSingle();

    if (profileErr) {
      console.error('[delete-account] profile lookup error', profileErr);
      return jsonResponse({ error: 'Profile lookup failed' }, 500);
    }
    if (!profile) return jsonResponse({ error: 'Profile not found' }, 404);
    if (profile.deleted_at) return jsonResponse({ error: 'Account already deleted' }, 410);

    const accountType = profile.role as AccountType;
    const validRoles: AccountType[] = ['creator', 'agency', 'fan', 'chatter'];
    if (!validRoles.includes(accountType)) {
      return jsonResponse({ error: `Unsupported account type: ${profile.role}` }, 400);
    }

    // --- 4. Confirmation validation ---
    const normalized = confirmation.toLowerCase();
    if (accountType === 'creator' || accountType === 'agency') {
      const stripped = normalized.startsWith('@') ? normalized.slice(1) : normalized;
      const { data: cp, error: cpErr } = await svc
        .from('creator_profiles')
        .select('username')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (cpErr) {
        console.error('[delete-account] creator_profiles lookup error', cpErr);
        return jsonResponse({ error: 'Handle lookup failed' }, 500);
      }
      if (!cp?.username) {
        return jsonResponse(
          { error: 'No handle found for this account. Contact support.' },
          400,
        );
      }
      if (cp.username.toLowerCase() !== stripped) {
        return jsonResponse({ error: 'Confirmation does not match' }, 400);
      }
    } else {
      // fan or chatter — confirm via email
      if (user.email.toLowerCase() !== normalized) {
        return jsonResponse({ error: 'Confirmation does not match' }, 400);
      }
    }

    // --- 5. Call the atomic RPC ---
    const { data: rpcData, error: rpcErr } = await svc.rpc('soft_delete_account', {
      p_user_id: user.id,
      p_reason: 'user_self_delete',
      p_actor_id: user.id,
      p_email_snapshot: user.email,
    });

    if (rpcErr) {
      const msg = rpcErr.message || 'soft_delete_account failed';
      console.error('[delete-account] RPC error', rpcErr);
      if (isBlockError(msg)) {
        return jsonResponse({ error: msg }, 409);
      }
      return jsonResponse({ error: msg }, 500);
    }

    const result = (rpcData ?? {}) as Partial<SoftDeleteResult>;

    // --- 6. Post-DB-success: best-effort auth ban + emails ---
    // 6a. Auth ban with retries (DB stays consistent regardless of outcome)
    let banSuccess = false;
    let banLastError: unknown = null;
    for (let attempt = 0; attempt < 3 && !banSuccess; attempt++) {
      try {
        const { error: banErr } = await svc.auth.admin.updateUserById(user.id, {
          ban_duration: '876000h',
          password: crypto.randomUUID() + crypto.randomUUID(),
        });
        if (banErr) {
          banLastError = banErr;
          console.warn(
            `[delete-account] auth ban attempt ${attempt + 1} failed`,
            banErr,
          );
          if (attempt < 2) await sleep(500 * (attempt + 1));
        } else {
          banSuccess = true;
        }
      } catch (e) {
        banLastError = e;
        console.warn(`[delete-account] auth ban attempt ${attempt + 1} threw`, e);
        if (attempt < 2) await sleep(500 * (attempt + 1));
      }
    }

    if (!banSuccess) {
      console.error('[delete-account] auth ban failed after retries', banLastError);
    }

    // 6b. Confirmation email (fire-and-forget)
    try {
      await svc.functions.invoke('send-account-deleted-email', {
        body: {
          user_id: user.id,
          email: user.email,
          account_type: accountType,
        },
      });
    } catch (e) {
      console.warn('[delete-account] send-account-deleted-email invoke failed', e);
    }

    // 6c. Fan notification email (creator/agency only, fire-and-forget)
    if (accountType === 'creator' || accountType === 'agency') {
      try {
        await svc.functions.invoke('notify-fans-creator-deleted', {
          body: { user_id: user.id },
        });
      } catch (e) {
        console.warn(
          '[delete-account] notify-fans-creator-deleted invoke failed',
          e,
        );
      }
    }

    // 6d. Support alert if ban failed (fire-and-forget)
    if (!banSuccess) {
      try {
        await svc.functions.invoke('send-account-deleted-email', {
          body: {
            email: 'atexclu@gmail.com',
            template: 'support_alert',
            metadata: {
              user_id: user.id,
              ban_error: String(banLastError),
            },
          },
        });
      } catch (e) {
        console.warn('[delete-account] support alert invoke failed', e);
      }
    }

    // --- 7. Success response ---
    return jsonResponse(
      {
        success: true,
        audit_id: result.audit_id,
        fan_subs_canceled: result.fan_subs_canceled ?? 0,
        creator_profiles_deleted: result.creator_profiles_deleted ?? 0,
        wallet_forfeited_cents: result.wallet_forfeited_cents ?? 0,
      },
      200,
    );
  } catch (e) {
    console.error('[delete-account] unexpected error', e);
    return jsonResponse({ error: 'Internal error' }, 500);
  }
});
