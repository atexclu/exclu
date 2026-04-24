-- 172_wallet_drift_rpc.sql
-- Read-only RPC for the reconciliation cron. Returns creators whose
-- profiles.wallet_balance_cents disagrees with the sum of their ledger rows.

create or replace function find_wallet_drift(p_tolerance_cents bigint default 1)
returns table(user_id uuid, projection_cents bigint, ledger_cents bigint)
language sql stable security definer
set search_path = public
as $$
  select p.id,
         coalesce(p.wallet_balance_cents, 0) as projection_cents,
         coalesce((
           select sum(case when direction = 'credit' then amount_cents else -amount_cents end)
             from wallet_transactions wt
            where wt.owner_id = p.id and wt.owner_kind = 'creator'
         ), 0) as ledger_cents
    from profiles p
   where p.is_creator = true
     and abs(coalesce(p.wallet_balance_cents, 0) - coalesce((
           select sum(case when direction = 'credit' then amount_cents else -amount_cents end)
             from wallet_transactions wt
            where wt.owner_id = p.id and wt.owner_kind = 'creator'
         ), 0)) > p_tolerance_cents;
$$;

grant execute on function find_wallet_drift(bigint) to service_role;
