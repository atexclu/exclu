-- 185_wallet_tx_matured_at.sql
--
-- Defense-in-depth on the maturation cron.
--
-- Problem: mature_wallet_transactions(p_now) currently relies entirely on the
-- platform_settings.maturity_frontier_at marker to know which rows still need
-- to mature. That works as long as the frontier always advances — which is
-- the contract of the daily cron. But anything that REWINDS the frontier
-- (admin tooling, test harness, manual rollback) causes the same row to be
-- re-summed and the projection columns to be double-decremented from pending
-- and double-incremented on wallet.
--
-- Fix: track maturation per-row via a `matured_at` column. The cron now sets
-- matured_at on every row it sweeps and only considers rows where
-- matured_at IS NULL. The frontier marker stays as a fast-path scan boundary
-- but the row-level state is the source of truth — re-running with the same
-- p_now becomes a no-op even if the frontier is rewound.
--
-- Backfill: every credit row with available_at <= the current frontier was
-- already swept by an earlier run, so we mark those matured_at = available_at.
-- Rows past the frontier are still in flight and stay NULL.

alter table wallet_transactions
  add column if not exists matured_at timestamptz;

-- Backfill: rows whose available_at is at or before the existing frontier
-- have already been processed by a previous run, so they're treated as
-- matured. Anything past the frontier is still pending and stays NULL.
update wallet_transactions wt
   set matured_at = wt.available_at
  from platform_settings ps
 where ps.key = 'maturity_frontier_at'
   and wt.direction = 'credit'
   and wt.matured_at is null
   and wt.available_at is not null
   and wt.available_at <= coalesce((ps.value->>'ts')::timestamptz, 'epoch'::timestamptz);

-- Partial index: cron iterates rows that still need maturation.
create index if not exists wallet_tx_unmatured_idx
  on wallet_transactions (available_at)
  where direction = 'credit'
    and matured_at is null
    and available_at is not null;

comment on column wallet_transactions.matured_at is
  'Set by mature_wallet_transactions when it transfers a credit from pending to current. NULL means the row has not been matured yet. Row-level idempotency for the cron — re-running with the same p_now is a no-op.';

-- ============================================================
-- Replace mature_wallet_transactions to use the per-row marker
-- ============================================================

create or replace function mature_wallet_transactions(p_now timestamptz default now())
returns table(creator_id uuid, moved_cents bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_frontier timestamptz;
begin
  select coalesce((value->>'ts')::timestamptz, 'epoch'::timestamptz)
    into v_frontier
    from platform_settings
   where key = 'maturity_frontier_at';

  if v_frontier is null then
    v_frontier := 'epoch'::timestamptz;
  end if;

  -- Stamp matured_at on every credit row whose maturity has come due AND
  -- which has not been processed yet. Returning the affected ids lets us
  -- aggregate per-creator deltas WITHOUT re-querying.
  return query
  with newly_matured as (
    update wallet_transactions wt
       set matured_at = p_now
     where wt.owner_kind   = 'creator'
       and wt.direction    = 'credit'
       and wt.matured_at   is null
       and wt.available_at is not null
       and wt.available_at >  v_frontier
       and wt.available_at <= p_now
    returning wt.owner_id as creator_id, wt.amount_cents
  ),
  per_creator as (
    select creator_id, sum(amount_cents)::bigint as delta
      from newly_matured
     group by creator_id
  ),
  applied as (
    update profiles p
       set pending_balance_cents = coalesce(p.pending_balance_cents, 0) - pc.delta,
           wallet_balance_cents  = coalesce(p.wallet_balance_cents, 0)  + pc.delta
      from per_creator pc
     where p.id = pc.creator_id
    returning p.id, pc.delta
  )
  select id, delta from applied;

  -- Advance the frontier (still useful as a fast-path scan boundary).
  update platform_settings
     set value = jsonb_build_object('ts', to_char(p_now at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
         updated_at = now()
   where key = 'maturity_frontier_at';
end;
$$;

grant execute on function mature_wallet_transactions(timestamptz) to service_role;
