/**
 * Read-only audit for ugp-confirm Verify-event pollution.
 *
 * Run: deno run -A scripts/audit-ugp-pollution.ts
 *
 * Uses SERVICE_ROLE_KEY and hits the Supabase REST API. Never mutates.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = 'https://qexnwezetjlbwltyccks.supabase.co';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!SERVICE_ROLE) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY in env');
  Deno.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

function hr(t = '') {
  console.log('\n' + '═'.repeat(80));
  if (t) console.log(t);
  console.log('═'.repeat(80));
}

// ── Q1: payment_events by transaction_state (confirm vs listener) ──────────
hr('Q1 — payment_events breakdown by state (ConfirmURL only, excl. listener)');
{
  const { data, error } = await sb
    .from('payment_events')
    .select('transaction_state, processed')
    .not('transaction_id', 'like', 'listener_%');
  if (error) throw error;

  const tally = new Map<string, number>();
  for (const r of data ?? []) {
    const key = `${r.transaction_state ?? '(null)'}  processed=${r.processed}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  const rows = [...tally.entries()].sort();
  console.table(rows.map(([k, v]) => ({ state_processed: k, count: v })));
}

// ── Q2–Q5: *_succeeded joined with payment_events.transaction_state ────────
type SalesTable = 'purchases' | 'tips' | 'gift_purchases' | 'custom_requests';
const tables: Array<{ t: SalesTable; amtCol: string; statusSucc: string }> = [
  { t: 'purchases', amtCol: 'creator_net_cents', statusSucc: 'succeeded' },
  { t: 'tips', amtCol: 'creator_net_cents', statusSucc: 'succeeded' },
  { t: 'gift_purchases', amtCol: 'creator_net_cents', statusSucc: 'succeeded' },
  { t: 'custom_requests', amtCol: 'proposed_amount_cents', statusSucc: 'pending' },
];

type PolRow = {
  id: string;
  status: string;
  amt: number;
  ugp_transaction_id: string | null;
  ugp_state: string | null;
  created_at: string;
  table: SalesTable;
};

const polluted: PolRow[] = [];

for (const cfg of tables) {
  const cols = `id, status, ${cfg.amtCol}, ugp_transaction_id, created_at`;
  // For links, also join link_id -> creator_id later
  const { data, error } = await sb
    .from(cfg.t)
    .select(cols)
    .eq('status', cfg.statusSucc)
    .not('ugp_transaction_id', 'is', null);
  if (error) {
    console.error(`[${cfg.t}] query error:`, error);
    continue;
  }

  const txnIds = [...new Set((data ?? []).map((r: any) => r.ugp_transaction_id))];
  if (!txnIds.length) continue;

  // Batch: fetch payment_events for these txn_ids
  const events = new Map<string, string>();
  const batchSize = 300;
  for (let i = 0; i < txnIds.length; i += batchSize) {
    const batch = txnIds.slice(i, i + batchSize);
    const { data: pe, error: peErr } = await sb
      .from('payment_events')
      .select('transaction_id, transaction_state')
      .in('transaction_id', batch as string[]);
    if (peErr) {
      console.error('payment_events fetch err:', peErr);
      continue;
    }
    for (const e of pe ?? []) {
      events.set(e.transaction_id, e.transaction_state);
    }
  }

  // Expected actionable states per table
  const expected: Record<SalesTable, Set<string>> = {
    purchases: new Set(['Sale']),
    tips: new Set(['Sale']),
    gift_purchases: new Set(['Sale']),
    custom_requests: new Set(['Authorize']),
  };

  for (const r of data ?? []) {
    const st = events.get((r as any).ugp_transaction_id ?? '') ?? '(missing-event)';
    if (!expected[cfg.t].has(st)) {
      polluted.push({
        id: (r as any).id,
        status: (r as any).status,
        amt: (r as any)[cfg.amtCol] ?? 0,
        ugp_transaction_id: (r as any).ugp_transaction_id,
        ugp_state: st,
        created_at: (r as any).created_at,
        table: cfg.t,
      });
    }
  }
}

hr(`Q2 — rows marked succeeded/pending from a NON-actionable TransactionState`);
console.log(`Total polluted rows: ${polluted.length}`);
const byTable = new Map<string, { n: number; cents: number }>();
for (const p of polluted) {
  const k = `${p.table} [state=${p.ugp_state}]`;
  const prev = byTable.get(k) ?? { n: 0, cents: 0 };
  byTable.set(k, { n: prev.n + 1, cents: prev.cents + p.amt });
}
console.table(
  [...byTable.entries()].map(([k, v]) => ({
    table_state: k,
    count: v.n,
    creator_net_usd: (v.cents / 100).toFixed(2),
  })),
);

// ── Q6: polluted credits per creator ───────────────────────────────────────
hr('Q6 — Per-creator impact (purchases + tips + gifts)');
{
  // Resolve creator_id for each polluted row
  const purchaseIds = polluted.filter(p => p.table === 'purchases').map(p => p.id);
  const tipIds = polluted.filter(p => p.table === 'tips').map(p => p.id);
  const giftIds = polluted.filter(p => p.table === 'gift_purchases').map(p => p.id);
  const reqIds = polluted.filter(p => p.table === 'custom_requests').map(p => p.id);

  const creatorByRow = new Map<string, string>(); // rowId -> creator_id

  if (purchaseIds.length) {
    const { data } = await sb
      .from('purchases')
      .select('id, link_id')
      .in('id', purchaseIds);
    const linkIds = [...new Set((data ?? []).map((r: any) => r.link_id))];
    const { data: links } = await sb
      .from('links')
      .select('id, creator_id')
      .in('id', linkIds);
    const linkToCreator = new Map((links ?? []).map((l: any) => [l.id, l.creator_id]));
    for (const p of data ?? []) {
      const cid = linkToCreator.get((p as any).link_id);
      if (cid) creatorByRow.set((p as any).id, cid);
    }
  }

  for (const [ids, tbl] of [[tipIds, 'tips'], [giftIds, 'gift_purchases'], [reqIds, 'custom_requests']] as const) {
    if (!ids.length) continue;
    const { data } = await sb.from(tbl).select('id, creator_id').in('id', ids);
    for (const r of data ?? []) creatorByRow.set((r as any).id, (r as any).creator_id);
  }

  const perCreator = new Map<string, { cents: number; rows: number }>();
  for (const p of polluted) {
    const cid = creatorByRow.get(p.id);
    if (!cid) continue;
    const prev = perCreator.get(cid) ?? { cents: 0, rows: 0 };
    // only count credited tables (not pre-auth requests)
    if (p.table !== 'custom_requests') {
      perCreator.set(cid, { cents: prev.cents + p.amt, rows: prev.rows + 1 });
    } else {
      perCreator.set(cid, { cents: prev.cents, rows: prev.rows + 1 });
    }
  }

  const creatorIds = [...perCreator.keys()];
  const handles = new Map<string, string>();
  if (creatorIds.length) {
    const { data } = await sb
      .from('profiles')
      .select('id, handle, display_name, wallet_balance_cents')
      .in('id', creatorIds);
    for (const p of data ?? []) {
      handles.set((p as any).id, `@${(p as any).handle ?? '?'} (${(p as any).display_name ?? '—'}) wallet=$${(((p as any).wallet_balance_cents ?? 0) / 100).toFixed(2)}`);
    }
  }

  const rows = [...perCreator.entries()]
    .map(([cid, v]) => ({
      creator: handles.get(cid) ?? cid,
      polluted_rows: v.rows,
      wallet_overcredit_usd: (v.cents / 100).toFixed(2),
    }))
    .sort((a, b) => parseFloat(b.wallet_overcredit_usd) - parseFloat(a.wallet_overcredit_usd));
  console.table(rows);
}

// ── Q7: Test-card 4242 events that hit our handlers ────────────────────────
hr('Q7 — ConfirmURL events that look like TEST CARDS (IsTestCard flag, fallback to legacy CardMask)');
{
  const { data, error } = await sb
    .from('payment_events')
    .select('transaction_id, merchant_reference, transaction_state, amount_decimal, created_at, raw_payload')
    .not('transaction_id', 'like', 'listener_%')
    .eq('processed', true);
  if (error) {
    console.error(error);
  } else {
    const testCard = (data ?? []).filter((r: any) => {
      const flag = r?.raw_payload?.IsTestCard;
      if (flag === '1' || flag === 1) return true;
      const legacyMask = r?.raw_payload?.CardMask ?? '';
      return /^4242/.test(String(legacyMask));
    });
    console.log(`Test-card events processed as real sales: ${testCard.length}`);
    console.table(
      testCard.slice(0, 30).map((r: any) => ({
        when: r.created_at?.slice(0, 19),
        state: r.transaction_state,
        ref: r.merchant_reference,
        amt: r.amount_decimal,
      })),
    );
  }
}

// ── Q8: bellabad-specific summary ──────────────────────────────────────────
hr('Q8 — bellabad detailed view');
{
  const { data: prof } = await sb
    .from('profiles')
    .select('id, handle, display_name, wallet_balance_cents, total_earned_cents, total_withdrawn_cents')
    .eq('handle', 'bellabad')
    .maybeSingle();
  if (!prof) {
    console.log('No profile with handle=bellabad');
  } else {
    console.log('Profile:', prof);
    const pollBella = polluted.filter(p => {
      // quickly look up via earlier polluted map
      return true; // filter later per creator-id if needed
    });
    // Direct query: custom_requests by creator
    const { data: reqs } = await sb
      .from('custom_requests')
      .select('id, status, proposed_amount_cents, ugp_transaction_id, created_at')
      .eq('creator_id', (prof as any).id)
      .order('created_at', { ascending: false });
    console.log(`custom_requests (${reqs?.length ?? 0}):`);
    console.table((reqs ?? []).map((r: any) => ({
      id: r.id.slice(0, 8),
      status: r.status,
      usd: (r.proposed_amount_cents / 100).toFixed(2),
      txn: r.ugp_transaction_id ?? '—',
      when: r.created_at?.slice(0, 19),
    })));

    // Links → purchases
    const { data: links } = await sb
      .from('links')
      .select('id, slug, price_cents')
      .eq('creator_id', (prof as any).id);
    const linkIds = (links ?? []).map((l: any) => l.id);
    if (linkIds.length) {
      const { data: purs } = await sb
        .from('purchases')
        .select('id, status, amount_cents, creator_net_cents, ugp_transaction_id, created_at, link_id')
        .in('link_id', linkIds)
        .order('created_at', { ascending: false });
      console.log(`purchases (${purs?.length ?? 0}):`);
      console.table((purs ?? []).slice(0, 30).map((r: any) => ({
        id: r.id.slice(0, 8),
        status: r.status,
        usd_amt: (r.amount_cents / 100).toFixed(2),
        usd_net: (r.creator_net_cents / 100).toFixed(2),
        txn: r.ugp_transaction_id ?? '—',
        when: r.created_at?.slice(0, 19),
      })));
    }

    // Tips
    const { data: tips } = await sb
      .from('tips')
      .select('id, status, amount_cents, creator_net_cents, ugp_transaction_id, created_at')
      .eq('creator_id', (prof as any).id)
      .order('created_at', { ascending: false });
    console.log(`tips (${tips?.length ?? 0}):`);
    console.table((tips ?? []).slice(0, 30).map((r: any) => ({
      id: r.id.slice(0, 8),
      status: r.status,
      usd_amt: (r.amount_cents / 100).toFixed(2),
      usd_net: (r.creator_net_cents / 100).toFixed(2),
      txn: r.ugp_transaction_id ?? '—',
      when: r.created_at?.slice(0, 19),
    })));

    // Gifts
    const { data: gifts } = await sb
      .from('gift_purchases')
      .select('id, status, amount_cents, creator_net_cents, ugp_transaction_id, created_at')
      .eq('creator_id', (prof as any).id)
      .order('created_at', { ascending: false });
    console.log(`gifts (${gifts?.length ?? 0}):`);
    console.table((gifts ?? []).slice(0, 30).map((r: any) => ({
      id: r.id.slice(0, 8),
      status: r.status,
      usd_amt: (r.amount_cents / 100).toFixed(2),
      usd_net: (r.creator_net_cents / 100).toFixed(2),
      txn: r.ugp_transaction_id ?? '—',
      when: r.created_at?.slice(0, 19),
    })));
  }
}

hr('Audit complete.');
