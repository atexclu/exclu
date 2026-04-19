-- 148_wallet_adjustments.sql
--
-- Audit trail for every programmatic wallet correction, plus an idempotent
-- RPC used by the UG reconciliation script (scripts/reconcile-ugp.ts).
--
-- The RPC:
--   - short-circuits if an identical (source_table, source_id, reason) row
--     already exists (makes the reconciliation script safe to re-run),
--   - logs the adjustment in `wallet_adjustments`,
--   - applies the delta to profiles.wallet_balance_cents (allowed to go negative
--     to reflect reality),
--   - decrements total_earned_cents floored at 0 (that counter is a lifetime
--     "money earned", not a wallet).
--
-- Reversal of content access / emails / referral commissions is handled
-- separately (out of scope here).

create table if not exists wallet_adjustments (
  id              uuid primary key default gen_random_uuid(),
  creator_id      uuid not null references profiles(id) on delete cascade,
  amount_cents    int  not null,                -- negative = debit, positive = credit
  reason          text not null,
  source_table    text,
  source_id       uuid,
  source_txn_id   text,
  source_state    text,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  constraint wallet_adjustments_unique unique (source_table, source_id, reason)
);

create index if not exists wallet_adjustments_creator_idx on wallet_adjustments(creator_id);
create index if not exists wallet_adjustments_created_at_idx on wallet_adjustments(created_at desc);

alter table wallet_adjustments enable row level security;

-- Only service role can read/write (no RLS policies granted to authenticated).
-- Admin UI (if added later) will go through SECURITY DEFINER RPCs.

create or replace function apply_wallet_adjustment(
  p_creator_id    uuid,
  p_amount_cents  int,
  p_reason        text,
  p_source_table  text,
  p_source_id     uuid,
  p_source_txn_id text default null,
  p_source_state  text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adj_id uuid;
begin
  -- Idempotency — silently skip if already applied.
  if exists (
    select 1 from wallet_adjustments
    where source_table = p_source_table
      and source_id    = p_source_id
      and reason       = p_reason
  ) then
    return null;
  end if;

  insert into wallet_adjustments(
    creator_id, amount_cents, reason,
    source_table, source_id, source_txn_id, source_state
  )
  values (
    p_creator_id, p_amount_cents, p_reason,
    p_source_table, p_source_id, p_source_txn_id, p_source_state
  )
  returning id into v_adj_id;

  update profiles
  set wallet_balance_cents = coalesce(wallet_balance_cents, 0) + p_amount_cents,
      total_earned_cents   = greatest(0, coalesce(total_earned_cents, 0) + p_amount_cents)
  where id = p_creator_id;

  return v_adj_id;
end;
$$;

revoke all on function apply_wallet_adjustment(uuid, int, text, text, uuid, text, text) from public, anon, authenticated;
