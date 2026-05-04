/**
 * UG Payments reconciliation script.
 *
 *   deno run -A scripts/reconcile-ugp.ts           # dry-run (prints plan)
 *   deno run -A scripts/reconcile-ugp.ts --apply   # actually mutates prod DB
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in env.
 *
 * Rules (aligned with UG truth = sales.md + payment_events):
 *
 *   REAL sale = payment_events row where
 *     - transaction_id NOT LIKE 'listener_%'
 *     - processed = true
 *     - transaction_state = 'Sale'
 *     - raw_payload.IsTestCard != '1'  (legacy rows: CardMask does NOT start with 4242)
 *
 *   A purchases/tips/gift_purchases row is LEGIT when
 *     status='succeeded' AND ugp_transaction_id matches a REAL sale.
 *
 *   A custom_requests row is LEGIT when
 *     status IN ('pending','accepted','delivered',...) AND ugp_transaction_id
 *     matches a payment_events row with transaction_state='Authorize'.
 *
 *   Anything else that claims to be succeeded/pending is POLLUTED and must be
 *   reconciled: debit wallet, mark row failed/abandoned/expired, log adjustment.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const APPLY = Deno.args.includes('--apply');
const SUPABASE_URL = 'https://qexnwezetjlbwltyccks.supabase.co';
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY missing');
  Deno.exit(1);
}

const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });

function hr(t = '') {
  console.log('\n' + '═'.repeat(80));
  if (t) console.log(t);
  console.log('═'.repeat(80));
}

// ─── 1. Build the set of REAL (kept) ugp_transaction_ids ─────────────────────
hr('1. Loading UG payment_events — building truth set');

const realSaleTxns = new Set<string>();
const realAuthTxns = new Set<string>();
const polludedTxns = new Map<string, { state: string; cardMask: string | null }>();
const testCardTxns = new Set<string>();

{
  const { data, error } = await sb
    .from('payment_events')
    .select('transaction_id, merchant_reference, transaction_state, raw_payload, processed')
    .not('transaction_id', 'like', 'listener_%');
  if (error) throw error;

  for (const e of data ?? []) {
    const txn = e.transaction_id as string;
    const state = (e.transaction_state ?? '') as string;
    // IsTestCard is the post-scrub flag set by ugp-confirm/ugp-listener
    // (migration 200/201 dropped CardMask from raw_payload to satisfy the
    // merchant guideline #5). Legacy rows from before the scrub still have
    // CardMask, so we fall back to that for them.
    const isTestCardFlag = (e.raw_payload as any)?.IsTestCard;
    const legacyMask = (e.raw_payload as any)?.CardMask ?? null;
    const isTestCard = isTestCardFlag === '1'
      || isTestCardFlag === 1
      || (typeof legacyMask === 'string' && /^4242/.test(legacyMask));
    const status = (e.raw_payload as any)?.TransactionStatus ?? null;

    if (isTestCard) testCardTxns.add(txn);

    // A Sale/Capture with status=Successful and non-test card = real money
    if (e.processed && (state === 'Sale' || state === 'Capture') && !isTestCard && status !== 'Declined') {
      realSaleTxns.add(txn);
    } else if (e.processed && state === 'Authorize' && !isTestCard && status !== 'Declined') {
      realAuthTxns.add(txn);
    } else {
      polludedTxns.set(txn, { state, cardMask: legacyMask });
    }
  }
  console.log(`Real Sales       : ${realSaleTxns.size}`);
  console.log(`Real Authorize   : ${realAuthTxns.size}`);
  console.log(`Test-card txns   : ${testCardTxns.size}`);
  console.log(`Non-actionable   : ${polludedTxns.size}`);
}

// ─── 2. Build reconciliation plan ────────────────────────────────────────────
hr('2. Scanning purchases / tips / gift_purchases / custom_requests');

type Plan = {
  table: 'purchases' | 'tips' | 'gift_purchases' | 'custom_requests';
  id: string;
  creator_id: string;
  chatter_id: string | null;
  creator_net_cents: number;
  chatter_earnings_cents: number;
  current_status: string;
  new_status: string;
  reason: string;
  txn: string | null;
  state: string | null;
};

const plan: Plan[] = [];

async function scan(
  table: Plan['table'],
  amtCol: 'creator_net_cents' | 'proposed_amount_cents',
  succeededStatus: string[],
) {
  const selectCols = [
    'id, status, ugp_transaction_id, created_at',
    amtCol,
    table === 'purchases' ? 'chat_chatter_id, chatter_earnings_cents, link_id' : null,
    table === 'tips' || table === 'gift_purchases' || table === 'custom_requests' ? 'creator_id' : null,
  ].filter(Boolean).join(', ');

  const { data, error } = await sb.from(table).select(selectCols).in('status', succeededStatus);
  if (error) { console.error(`[${table}]`, error); return; }

  // Resolve purchases.creator_id via links
  let linkToCreator = new Map<string, string>();
  if (table === 'purchases' && data?.length) {
    const linkIds = [...new Set((data as any[]).map(p => p.link_id).filter(Boolean))];
    if (linkIds.length) {
      const { data: links } = await sb.from('links').select('id, creator_id').in('id', linkIds);
      (links ?? []).forEach((l: any) => linkToCreator.set(l.id, l.creator_id));
    }
  }

  for (const row of (data ?? []) as any[]) {
    const txn: string | null = row.ugp_transaction_id;
    const creatorId: string | null = table === 'purchases' ? linkToCreator.get(row.link_id) ?? null : row.creator_id;
    if (!creatorId) continue;

    const amt: number = row[amtCol] ?? 0;
    const isAuth = table === 'custom_requests';

    let isLegit = false;
    let reason = '';
    let newStatus = '';

    if (txn && (isAuth ? realAuthTxns.has(txn) : realSaleTxns.has(txn))) {
      isLegit = true;
    } else if (txn && testCardTxns.has(txn)) {
      reason = 'test-card-not-real-money';
      newStatus = isAuth ? 'pending_payment' : 'failed';
    } else if (txn && polludedTxns.has(txn)) {
      const { state } = polludedTxns.get(txn)!;
      reason = `non-actionable-ug-state-${state || 'unknown'}`;
      newStatus = isAuth ? 'pending_payment' : 'failed';
    } else if (!txn) {
      // For custom_requests 'pending', no txn means orphan — flag
      reason = 'no-ugp-transaction-id';
      newStatus = isAuth ? 'pending_payment' : 'failed';
    } else {
      // txn exists but not in any set? => orphan / legacy
      reason = 'ugp-txn-not-in-payment-events';
      newStatus = isAuth ? 'pending_payment' : 'failed';
    }

    if (!isLegit) {
      plan.push({
        table,
        id: row.id,
        creator_id: creatorId,
        chatter_id: row.chat_chatter_id ?? null,
        creator_net_cents: amt,
        chatter_earnings_cents: row.chatter_earnings_cents ?? 0,
        current_status: row.status,
        new_status: newStatus,
        reason,
        txn,
        state: txn ? (polludedTxns.get(txn)?.state ?? null) : null,
      });
    }
  }
}

await scan('purchases',       'creator_net_cents',      ['succeeded']);
await scan('tips',            'creator_net_cents',      ['succeeded']);
await scan('gift_purchases',  'creator_net_cents',      ['succeeded']);
await scan('custom_requests', 'proposed_amount_cents',  ['pending']);

console.log(`Plan items: ${plan.length}`);

// ─── 3. Abandoned checkouts (no debit, just status cleanup) ──────────────────
hr('3. Abandoned checkouts (pre-created, no ConfirmURL, >24h old)');

type Abandoned = { table: string; id: string; amt: number; created_at: string };
const abandoned: Abandoned[] = [];

async function scanAbandoned(table: 'purchases' | 'tips' | 'gift_purchases') {
  const amtCol = 'amount_cents';
  const { data, error } = await sb
    .from(table)
    .select(`id, status, ${amtCol}, ugp_transaction_id, created_at`)
    .eq('status', 'pending')
    .is('ugp_transaction_id', null)
    .lt('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString());
  if (error) { console.error(`[${table} abandoned]`, error); return; }
  for (const r of data ?? []) {
    abandoned.push({ table, id: (r as any).id, amt: (r as any)[amtCol] ?? 0, created_at: (r as any).created_at });
  }
}

await scanAbandoned('purchases');
await scanAbandoned('tips');
await scanAbandoned('gift_purchases');

// Custom requests use 'pending_payment' to mean "never paid"
{
  const { data } = await sb
    .from('custom_requests')
    .select('id, status, proposed_amount_cents, ugp_transaction_id, created_at')
    .eq('status', 'pending_payment')
    .is('ugp_transaction_id', null)
    .lt('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString());
  // Already invisible to creators, no cleanup needed beyond logging
  console.log(`Custom_requests in pending_payment (already invisible): ${data?.length ?? 0}`);
}

console.log(`Abandoned rows to mark: ${abandoned.length}`);

// ─── 4. Test-card subscriptions rollback ─────────────────────────────────────
hr('4. Test-card subscription events');

type SubRollback = { user_id: string; handle: string; display_name: string; txn: string; when: string };
const subsToRollback: SubRollback[] = [];

{
  const { data: testSubEvents } = await sb
    .from('payment_events')
    .select('transaction_id, merchant_reference, created_at, raw_payload')
    .not('transaction_id', 'like', 'listener_%')
    .eq('processed', true)
    .like('merchant_reference', 'sub_%');
  for (const e of testSubEvents ?? []) {
    // Post-scrub: IsTestCard flag is the source of truth. Pre-scrub legacy
    // rows fall back to the CardMask BIN check.
    const flag = (e.raw_payload as any)?.IsTestCard;
    const legacyMask = (e.raw_payload as any)?.CardMask ?? '';
    const isTest = flag === '1' || flag === 1 || /^4242/.test(legacyMask);
    if (!isTest) continue;
    const userId = (e.merchant_reference as string).replace(/^sub_/, '');
    const { data: prof } = await sb.from('profiles').select('id, handle, display_name, is_creator_subscribed').eq('id', userId).maybeSingle();
    if (prof && (prof as any).is_creator_subscribed) {
      subsToRollback.push({
        user_id: (prof as any).id,
        handle: (prof as any).handle ?? '?',
        display_name: (prof as any).display_name ?? '—',
        txn: e.transaction_id as string,
        when: (e.created_at as string)?.slice(0, 19),
      });
    }
  }
}
console.table(subsToRollback);

// ─── 4b. Pending payouts that will become under-funded after debits ──────────
hr('4b. Pending payouts based on polluted balances (adjust, do not reject)');

type PayoutAction = {
  payout_id: string;
  creator_id: string;
  handle: string;
  original_cents: number;
  new_cents: number;
  reduction: number;
  action: 'keep' | 'reduce' | 'reject';
  reason: string;
};
const payoutActions: PayoutAction[] = [];

{
  // Build per-creator pollution debit
  const pollutionByCreator = new Map<string, number>();
  for (const p of plan) {
    if (p.table === 'custom_requests') continue;
    if (p.creator_net_cents <= 0) continue;
    pollutionByCreator.set(p.creator_id, (pollutionByCreator.get(p.creator_id) ?? 0) + p.creator_net_cents);
    if (p.chatter_id && p.chatter_earnings_cents > 0) {
      pollutionByCreator.set(p.chatter_id, (pollutionByCreator.get(p.chatter_id) ?? 0) + p.chatter_earnings_cents);
    }
  }

  const affectedIds = [...pollutionByCreator.keys()];
  const { data: wallets } = await sb
    .from('profiles')
    .select('id, handle, wallet_balance_cents')
    .in('id', affectedIds);
  const walletBefore = new Map((wallets ?? []).map((p: any) => [p.id, p.wallet_balance_cents ?? 0]));
  const handleMap = new Map((wallets ?? []).map((p: any) => [p.id, p.handle ?? '?']));

  // Pending payouts (FIFO)
  const { data: pending } = await sb
    .from('payouts')
    .select('id, creator_id, amount_cents, status, requested_at, created_at')
    .in('creator_id', affectedIds)
    .in('status', ['pending', 'approved', 'processing'])
    .order('created_at', { ascending: true });

  for (const cid of affectedIds) {
    const debit = pollutionByCreator.get(cid) ?? 0;
    let walletAfterDebit = (walletBefore.get(cid) ?? 0) - debit;
    const creatorPayouts = (pending ?? []).filter((p: any) => p.creator_id === cid);

    for (const pay of creatorPayouts) {
      if (walletAfterDebit >= 0) {
        payoutActions.push({
          payout_id: pay.id,
          creator_id: cid,
          handle: handleMap.get(cid) ?? '?',
          original_cents: pay.amount_cents,
          new_cents: pay.amount_cents,
          reduction: 0,
          action: 'keep',
          reason: 'wallet still positive after reconciliation',
        });
        continue;
      }
      // wallet < 0 : this payout is (partially) funded by fake credits
      const excess = -walletAfterDebit;
      const reduction = Math.min(pay.amount_cents, excess);
      const newAmount = pay.amount_cents - reduction;
      walletAfterDebit += reduction; // re-crediting wallet absorbs the excess
      payoutActions.push({
        payout_id: pay.id,
        creator_id: cid,
        handle: handleMap.get(cid) ?? '?',
        original_cents: pay.amount_cents,
        new_cents: newAmount,
        reduction,
        action: newAmount === 0 ? 'reject' : 'reduce',
        reason: 'wallet-reconciliation-2026-04-19',
      });
    }
  }

  console.table(payoutActions.map(p => ({
    handle: '@' + p.handle,
    payout: p.payout_id.slice(0, 8),
    was_usd: (p.original_cents / 100).toFixed(2),
    new_usd: (p.new_cents / 100).toFixed(2),
    reduced_usd: (p.reduction / 100).toFixed(2),
    action: p.action,
  })));
}

// ─── 5. Per-creator impact summary ───────────────────────────────────────────
hr('5. Per-creator impact (what each wallet will change by)');

type Impact = { current: number; debit: number; newBalance: number; rows: number };
const byCreator = new Map<string, Impact>();

// Fetch current wallet balances
const creatorIds = [...new Set(plan.map(p => p.creator_id).concat(plan.map(p => p.chatter_id).filter(Boolean) as string[]))];
const walletMap = new Map<string, { wallet: number; handle: string; name: string }>();
if (creatorIds.length) {
  const { data } = await sb.from('profiles').select('id, handle, display_name, wallet_balance_cents').in('id', creatorIds);
  for (const p of data ?? []) {
    walletMap.set((p as any).id, {
      wallet: (p as any).wallet_balance_cents ?? 0,
      handle: (p as any).handle ?? '?',
      name: (p as any).display_name ?? '—',
    });
  }
}

for (const p of plan) {
  // Main creator debit (skip custom_requests — nothing was credited)
  if (p.table !== 'custom_requests' && p.creator_net_cents > 0) {
    const cur = byCreator.get(p.creator_id) ?? {
      current: walletMap.get(p.creator_id)?.wallet ?? 0,
      debit: 0, newBalance: 0, rows: 0,
    };
    cur.debit += p.creator_net_cents;
    cur.rows += 1;
    cur.newBalance = cur.current - cur.debit;
    byCreator.set(p.creator_id, cur);
  }

  // Chatter debit
  if (p.chatter_id && p.chatter_earnings_cents > 0) {
    const cur = byCreator.get(p.chatter_id) ?? {
      current: walletMap.get(p.chatter_id)?.wallet ?? 0,
      debit: 0, newBalance: 0, rows: 0,
    };
    cur.debit += p.chatter_earnings_cents;
    cur.rows += 1;
    cur.newBalance = cur.current - cur.debit;
    byCreator.set(p.chatter_id, cur);
  }
}

const impactRows = [...byCreator.entries()]
  .map(([cid, v]) => ({
    handle: '@' + (walletMap.get(cid)?.handle ?? '?'),
    name: walletMap.get(cid)?.name ?? '—',
    polluted_rows: v.rows,
    current_usd: (v.current / 100).toFixed(2),
    debit_usd: (v.debit / 100).toFixed(2),
    new_balance_usd: (v.newBalance / 100).toFixed(2),
    negative: v.newBalance < 0 ? 'YES' : '',
  }))
  .sort((a, b) => parseFloat(b.debit_usd) - parseFloat(a.debit_usd));

console.table(impactRows);

const totals = {
  polluted_rows: plan.length,
  abandoned_rows: abandoned.length,
  test_card_subs: subsToRollback.length,
  creators_affected: byCreator.size,
  total_debit_usd: ([...byCreator.values()].reduce((s, v) => s + v.debit, 0) / 100).toFixed(2),
};
console.log('Summary:', totals);

// ─── 6. Apply mode ───────────────────────────────────────────────────────────
if (!APPLY) {
  hr('DRY RUN — no mutations. Re-run with --apply to execute.');
  Deno.exit(0);
}

hr('6. APPLYING — this mutates prod');

let applied = 0;
let skipped = 0;
let failed = 0;

for (const p of plan) {
  // 1. Update row status
  const { error: updErr } = await sb.from(p.table).update({ status: p.new_status }).eq('id', p.id);
  if (updErr) {
    console.error(`[${p.table}] update ${p.id}:`, updErr);
    failed += 1;
    continue;
  }

  // 2. Debit creator wallet (skip custom_requests — never credited)
  if (p.table !== 'custom_requests' && p.creator_net_cents > 0) {
    const { data: adjId, error: rpcErr } = await sb.rpc('apply_wallet_adjustment', {
      p_creator_id: p.creator_id,
      p_amount_cents: -p.creator_net_cents,
      p_reason: p.reason,
      p_source_table: p.table,
      p_source_id: p.id,
      p_source_txn_id: p.txn,
      p_source_state: p.state,
    });
    if (rpcErr) {
      console.error(`[adjust ${p.id}]`, rpcErr);
      failed += 1;
      continue;
    }
    if (adjId === null) skipped += 1; else applied += 1;
  }

  // 3. Debit chatter wallet
  if (p.chatter_id && p.chatter_earnings_cents > 0) {
    const { data: adjId, error: rpcErr } = await sb.rpc('apply_wallet_adjustment', {
      p_creator_id: p.chatter_id,
      p_amount_cents: -p.chatter_earnings_cents,
      p_reason: `${p.reason}-chatter`,
      p_source_table: p.table,
      p_source_id: p.id,
      p_source_txn_id: p.txn,
      p_source_state: p.state,
    });
    if (rpcErr) {
      console.error(`[chatter adjust ${p.id}]`, rpcErr);
      failed += 1;
    }
  }
}

// Abandoned rows — status cleanup, no wallet change.
// Status constraint on purchases/tips/gift_purchases only allows
// pending/succeeded/failed/refunded, so abandoned checkouts go to 'failed'.
for (const a of abandoned) {
  const { error } = await sb.from(a.table).update({ status: 'failed' }).eq('id', a.id);
  if (error) console.error(`[abandoned ${a.table} ${a.id}]`, error);
}

// Test-card subscriptions — deactivate
for (const s of subsToRollback) {
  const { error } = await sb.from('profiles').update({ is_creator_subscribed: false }).eq('id', s.user_id);
  if (error) console.error(`[sub rollback ${s.user_id}]`, error);
}

// Payout adjustments — reduce amount to match real earnings, or reject if 0.
let payoutReduced = 0;
let payoutRejected = 0;
for (const pa of payoutActions) {
  if (pa.action === 'keep') continue;

  // Re-credit wallet by the reduction (excess that was backed by fake credits)
  if (pa.reduction > 0) {
    const { error: rpcErr } = await sb.rpc('apply_wallet_adjustment', {
      p_creator_id: pa.creator_id,
      p_amount_cents: pa.reduction, // positive = credit
      p_reason: 'payout-reduction-from-reconciliation',
      p_source_table: 'payouts',
      p_source_id: pa.payout_id,
      p_source_txn_id: null,
      p_source_state: pa.action,
    });
    if (rpcErr) { console.error(`[payout credit ${pa.payout_id}]`, rpcErr); continue; }

    // Also decrement total_withdrawn_cents by the reduction
    const { data: prof } = await sb
      .from('profiles')
      .select('total_withdrawn_cents')
      .eq('id', pa.creator_id)
      .maybeSingle();
    if (prof) {
      await sb
        .from('profiles')
        .update({ total_withdrawn_cents: Math.max(0, (prof as any).total_withdrawn_cents - pa.reduction) })
        .eq('id', pa.creator_id);
    }
  }

  // Update payout row
  if (pa.action === 'reject') {
    await sb.from('payouts').update({
      status: 'rejected',
      rejection_reason: pa.reason,
      admin_notes: 'Automatic reject from UG reconciliation (2026-04-19)',
      processed_at: new Date().toISOString(),
    }).eq('id', pa.payout_id);
    payoutRejected += 1;
  } else {
    await sb.from('payouts').update({
      amount_cents: pa.new_cents,
      admin_notes: `Amount reduced from $${(pa.original_cents / 100).toFixed(2)} to $${(pa.new_cents / 100).toFixed(2)} — UG reconciliation (2026-04-19)`,
    }).eq('id', pa.payout_id);
    payoutReduced += 1;
  }
}

// Dev account zero-out — @tbtbtb and @tbdevpro are Thomas's dev profiles.
// Reset wallet + earned + withdrawn to 0, reject any pending payouts they have.
const DEV_HANDLES = ['tbtbtb', 'tbdevpro'];
{
  const { data: devs } = await sb
    .from('profiles')
    .select('id, handle')
    .in('handle', DEV_HANDLES);
  for (const d of devs ?? []) {
    await sb.from('profiles').update({
      wallet_balance_cents: 0,
      total_earned_cents: 0,
      total_withdrawn_cents: 0,
    }).eq('id', (d as any).id);
    // Reject any pending/approved/processing payouts
    await sb.from('payouts').update({
      status: 'rejected',
      rejection_reason: 'dev-account-reset-2026-04-19',
      admin_notes: 'Zero-out of dev account during UG reconciliation',
      processed_at: new Date().toISOString(),
    }).eq('creator_id', (d as any).id).in('status', ['pending', 'approved', 'processing']);
    console.log(`[dev-reset] @${(d as any).handle} wallet=0 earned=0 withdrawn=0`);
  }
}

console.log({
  applied, skipped, failed,
  abandoned: abandoned.length,
  subs: subsToRollback.length,
  payout_reduced: payoutReduced,
  payout_rejected: payoutRejected,
  dev_accounts_reset: DEV_HANDLES.length,
});
hr('APPLY complete.');
