// supabase/functions/admin-simulate-payment/index.ts
//
// Admin-only test harness for the pending-balance + maturation flow.
//
// Why this exists:
//   When QuickPay test cards are not available, we still need a way to
//   exercise the rolling-7-day pending balance and the daily maturation cron.
//   This function lets the admin (a) credit any creator via the ledger and
//   (b) simulate the cron by calling mature_wallet_transactions with a
//   forward-shifted clock. The platform-wide frontier is snapshotted and
//   restored around the maturation call, so legitimate cron runs are not
//   skewed by these tests.
//
// Body shape:
//   { action: 'credit',           creator_id: uuid, amount_cents: int, note?: string }
//   { action: 'mature',           forward_days?: int }   // default 8
//   { action: 'snapshot',         creator_id: uuid }
//   { action: 'preview_maturity', creator_id?: uuid, simulated_account_age_days?: int }
//   { action: 'inspect_tx',       tx_id: uuid }
//   { action: 'set_available_at', tx_id: uuid, days_from_now: number } // simulated rows only
//   { action: 'reset_simulated_tx', tx_id: uuid } // clears matured_at — for re-testing
//   { action: 'mark_all_simulated_matured', creator_id?: uuid } // safety net: stamps matured_at on every simulated row to prevent surprise re-sweeps
//   { action: 'repair_balance', creator_id: uuid, wallet_delta_cents?: int, pending_delta_cents?: int } // direct projection write — repair only
//
// Auth: admin (profiles.is_admin = true).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { applyWalletTransaction } from '../_shared/ledger.ts';

const sb = createClient(Deno.env.get('PROJECT_URL')!, Deno.env.get('SERVICE_ROLE_KEY')!);

const siteUrl = (Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at').replace(/\/$/, '');
const allowedOrigins = [
  siteUrl,
  'http://localhost:8080', 'http://localhost:8081', 'http://localhost:8082',
  'http://localhost:8083', 'http://localhost:8084', 'http://localhost:5173',
];
function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  const allowed = (allowedOrigins.includes(origin) ||
    /^https:\/\/exclu-[a-z0-9-]+-atexclus-projects\.vercel\.app$/.test(origin)) ? origin : siteUrl;
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function jsonOk(data: unknown, cors: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
function jsonError(message: string, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

async function readBalances(creatorId: string) {
  const { data, error } = await sb
    .from('profiles')
    .select('id, wallet_balance_cents, pending_balance_cents, total_earned_cents')
    .eq('id', creatorId)
    .single();
  if (error || !data) throw new Error(`profile not found: ${creatorId}`);
  return data;
}

async function readFrontier(): Promise<string | null> {
  const { data } = await sb
    .from('platform_settings')
    .select('value')
    .eq('key', 'maturity_frontier_at')
    .maybeSingle();
  return ((data?.value as { ts?: string } | null)?.ts) ?? null;
}

async function writeFrontier(ts: string) {
  await sb
    .from('platform_settings')
    .upsert({ key: 'maturity_frontier_at', value: { ts }, updated_at: new Date().toISOString() });
}

serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return jsonError('Method not allowed', 405, cors);

  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '').trim() ?? '';
    if (!token) return jsonError('Authentication required', 401, cors);
    const { data: { user }, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !user) return jsonError('Authentication required', 401, cors);

    const { data: adminProfile } = await sb
      .from('profiles')
      .select('id, is_admin')
      .eq('id', user.id)
      .single();
    if (!adminProfile?.is_admin) return jsonError('Admin access required', 403, cors);

    const body = await req.json().catch(() => null) as
      | { action?: string; creator_id?: string; amount_cents?: number; note?: string; forward_days?: number }
      | null;

    const action = body?.action?.trim();
    if (!action) return jsonError('Missing action', 400, cors);

    // ── action: snapshot ─────────────────────────────────────────
    if (action === 'snapshot') {
      const creatorId = body?.creator_id?.trim();
      if (!creatorId) return jsonError('Missing creator_id', 400, cors);
      const balances = await readBalances(creatorId);
      const frontier = await readFrontier();
      return jsonOk({ ok: true, balances, maturity_frontier_at: frontier }, cors);
    }

    // ── action: credit ───────────────────────────────────────────
    if (action === 'credit') {
      const creatorId = body?.creator_id?.trim();
      const amountCents = Math.trunc(Number(body?.amount_cents));
      if (!creatorId) return jsonError('Missing creator_id', 400, cors);
      if (!Number.isInteger(amountCents) || amountCents <= 0) {
        return jsonError('amount_cents must be a positive integer', 400, cors);
      }
      const note = (body?.note ?? `simulate-payment by admin ${user.id}`).slice(0, 500);

      const before = await readBalances(creatorId);
      const txId = await applyWalletTransaction(sb, {
        ownerId: creatorId,
        ownerKind: 'creator',
        direction: 'credit',
        amountCents,
        sourceType: 'manual_adjustment',
        sourceId: null,
        sourceTransactionId: `simulate-${crypto.randomUUID()}`,
        adminNotes: note,
        metadata: { simulated: true, by_admin: user.id },
      });
      const after = await readBalances(creatorId);

      return jsonOk({
        ok: true,
        action,
        tx_id: txId,
        creator_id: creatorId,
        amount_cents: amountCents,
        balances: { before, after, delta: {
          wallet:  Number(after.wallet_balance_cents) - Number(before.wallet_balance_cents),
          pending: Number(after.pending_balance_cents) - Number(before.pending_balance_cents),
        } },
      }, cors);
    }

    // ── action: mature ───────────────────────────────────────────
    // Snapshot the frontier, run mature_wallet_transactions with a forward-
    // shifted clock, then restore the frontier so the legitimate daily cron
    // sweeps the same window tomorrow as if nothing happened.
    if (action === 'mature') {
      const forwardDays = Math.max(1, Math.min(60, Math.trunc(Number(body?.forward_days ?? 8))));
      const futureNow = new Date(Date.now() + forwardDays * 24 * 60 * 60 * 1000).toISOString();
      const oldFrontier = await readFrontier();

      const { data: rows, error: matureErr } = await sb.rpc('mature_wallet_transactions', { p_now: futureNow });
      if (matureErr) {
        console.error('[admin-simulate-payment] mature RPC failed', matureErr);
        return jsonError(`mature RPC failed: ${matureErr.message}`, 500, cors);
      }

      // Restore the frontier exactly as it was, so tomorrow's cron starts
      // from the same point and processes everything in the same window.
      if (oldFrontier) await writeFrontier(oldFrontier);

      const total = (rows ?? []).reduce(
        (sum: number, r: any) => sum + Number(r.moved_cents ?? 0),
        0,
      );
      return jsonOk({
        ok: true,
        action,
        forward_days: forwardDays,
        simulated_now: futureNow,
        creators_swept: rows?.length ?? 0,
        total_cents_moved: total,
        rows,
        frontier_restored_to: oldFrontier,
      }, cors);
    }

    // ── action: preview_maturity ────────────────────────────────
    // Pure read — proves the maturity formula for either a real user or a
    // hypothetical "account that would be N days old today". Used to verify
    // both 21-day-hold and 7-day-rolling paths without waiting.
    if (action === 'preview_maturity') {
      const creatorId = body?.creator_id?.trim() || null;
      const ageDays = body && 'simulated_account_age_days' in (body as any)
        ? Math.trunc(Number((body as any).simulated_account_age_days))
        : null;
      const simulatedCreatedAt = ageDays !== null && Number.isFinite(ageDays)
        ? new Date(Date.now() - ageDays * 86400000).toISOString()
        : null;

      const { data, error } = await sb.rpc('compute_credit_available_at', {
        p_owner_id: creatorId,
        p_simulated_account_created_at: simulatedCreatedAt,
      });
      if (error) return jsonError(`preview RPC failed: ${error.message}`, 500, cors);

      const availableAt = data as string;
      const daysFromNow = (new Date(availableAt).getTime() - Date.now()) / 86400000;
      const branch = daysFromNow > 7.5 ? 'initial_21d_hold' : 'rolling_7d';
      return jsonOk({
        ok: true,
        action,
        creator_id: creatorId,
        simulated_account_created_at: simulatedCreatedAt,
        available_at: availableAt,
        days_from_now: Number(daysFromNow.toFixed(2)),
        branch,
      }, cors);
    }

    // ── action: inspect_tx ──────────────────────────────────────
    if (action === 'inspect_tx') {
      const txId = body?.tx_id?.trim();
      if (!txId) return jsonError('Missing tx_id', 400, cors);
      const { data, error } = await sb
        .from('wallet_transactions')
        .select('id, owner_id, owner_kind, direction, amount_cents, source_type, available_at, created_at, metadata')
        .eq('id', txId)
        .maybeSingle();
      if (error || !data) return jsonError('Transaction not found', 404, cors);
      const availableAt = data.available_at as string | null;
      const daysFromNow = availableAt
        ? (new Date(availableAt).getTime() - Date.now()) / 86400000
        : null;
      return jsonOk({
        ok: true,
        action,
        tx: data,
        available_at_days_from_now: daysFromNow !== null ? Number(daysFromNow.toFixed(2)) : null,
      }, cors);
    }

    // ── action: set_available_at ────────────────────────────────
    // Move the maturity timestamp on a SIMULATED row only (metadata.simulated
    // = true). This lets us emulate a "21-day-old credit on a fresh account"
    // without actually waiting 21 days. Refuses to touch real production rows.
    if (action === 'set_available_at') {
      const txId = body?.tx_id?.trim();
      const daysFromNow = Number((body as any)?.days_from_now);
      if (!txId) return jsonError('Missing tx_id', 400, cors);
      if (!Number.isFinite(daysFromNow)) return jsonError('Invalid days_from_now', 400, cors);

      const { data: existing, error: fetchErr } = await sb
        .from('wallet_transactions')
        .select('id, metadata')
        .eq('id', txId)
        .maybeSingle();
      if (fetchErr || !existing) return jsonError('Transaction not found', 404, cors);
      const isSimulated = (existing.metadata as any)?.simulated === true;
      if (!isSimulated) {
        return jsonError('Refusing to mutate non-simulated row', 403, cors);
      }

      const newAvailableAt = new Date(Date.now() + daysFromNow * 86400000).toISOString();
      const { error: updateErr } = await sb
        .from('wallet_transactions')
        .update({ available_at: newAvailableAt })
        .eq('id', txId);
      if (updateErr) return jsonError(`update failed: ${updateErr.message}`, 500, cors);

      return jsonOk({
        ok: true,
        action,
        tx_id: txId,
        new_available_at: newAvailableAt,
        days_from_now: daysFromNow,
      }, cors);
    }

    // ── action: reset_simulated_tx ──────────────────────────────
    // Clear matured_at on a simulated row so the next mature() call sweeps it
    // again. Useful for re-running 21-day-path tests on the same row.
    if (action === 'reset_simulated_tx') {
      const txId = body?.tx_id?.trim();
      if (!txId) return jsonError('Missing tx_id', 400, cors);
      const { data: existing, error: fetchErr } = await sb
        .from('wallet_transactions')
        .select('id, metadata')
        .eq('id', txId)
        .maybeSingle();
      if (fetchErr || !existing) return jsonError('Transaction not found', 404, cors);
      if ((existing.metadata as any)?.simulated !== true) {
        return jsonError('Refusing to mutate non-simulated row', 403, cors);
      }
      const { error: updateErr } = await sb
        .from('wallet_transactions')
        .update({ matured_at: null })
        .eq('id', txId);
      if (updateErr) return jsonError(`reset failed: ${updateErr.message}`, 500, cors);
      return jsonOk({ ok: true, action, tx_id: txId }, cors);
    }

    // ── action: mark_all_simulated_matured ─────────────────────
    // Stamp matured_at on every simulated credit so the daily cron never
    // sweeps them again. Run this at the end of a test session to make sure
    // the wallet figures stay clean tomorrow morning.
    if (action === 'mark_all_simulated_matured') {
      const creatorId = body?.creator_id?.trim() || null;
      let q = sb
        .from('wallet_transactions')
        .update({ matured_at: new Date().toISOString() })
        .is('matured_at', null)
        .eq('direction', 'credit')
        .filter('metadata->>simulated', 'eq', 'true');
      if (creatorId) q = q.eq('owner_id', creatorId);
      const { data, error } = await q.select('id');
      if (error) return jsonError(`mark failed: ${error.message}`, 500, cors);
      return jsonOk({ ok: true, action, marked_count: (data ?? []).length, ids: (data ?? []).map((r: any) => r.id) }, cors);
    }

    // ── action: repair_balance ──────────────────────────────────
    // Last-resort projection-level adjustment when test methodology has put a
    // creator's balances out of sync with the ledger truth. Writes deltas
    // directly to profiles (bypassing the ledger) so this should NEVER be
    // used outside of test-bench cleanup. The ledger discipline CI flags
    // direct writes — this code path is intentionally tagged ledger-exempt.
    if (action === 'repair_balance') {
      const creatorId = body?.creator_id?.trim();
      const walletDelta = Math.trunc(Number((body as any)?.wallet_delta_cents ?? 0));
      const pendingDelta = Math.trunc(Number((body as any)?.pending_delta_cents ?? 0));
      if (!creatorId) return jsonError('Missing creator_id', 400, cors);
      if (!Number.isFinite(walletDelta) || !Number.isFinite(pendingDelta)) {
        return jsonError('Invalid deltas', 400, cors);
      }
      if (walletDelta === 0 && pendingDelta === 0) {
        return jsonError('At least one delta must be non-zero', 400, cors);
      }

      const before = await readBalances(creatorId);
      // ledger-exempt: this is the only authorised direct projection write.
      const newWallet  = Number(before.wallet_balance_cents)  + walletDelta;   // ledger-exempt
      const newPending = Number(before.pending_balance_cents) + pendingDelta;  // ledger-exempt
      const { error: updateErr } = await sb
        .from('profiles')
        .update({ wallet_balance_cents: newWallet, pending_balance_cents: newPending })  // ledger-exempt
        .eq('id', creatorId);
      if (updateErr) return jsonError(`repair failed: ${updateErr.message}`, 500, cors);
      const after = await readBalances(creatorId);
      return jsonOk({ ok: true, action, creator_id: creatorId, deltas: { wallet: walletDelta, pending: pendingDelta }, balances: { before, after } }, cors);
    }

    return jsonError('Unknown action', 400, cors);
  } catch (err: any) {
    console.error('[admin-simulate-payment] uncaught', err);
    return jsonError(err?.message ?? 'Internal server error', 500, cors);
  }
});
