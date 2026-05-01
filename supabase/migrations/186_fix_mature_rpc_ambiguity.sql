-- 186_fix_mature_rpc_ambiguity.sql
--
-- Migration 185 introduced an ambiguity error: the inner CTE column was
-- aliased `creator_id` which clashes with the function's OUT parameter of
-- the same name. Postgres refuses to disambiguate inside the GROUP BY.
-- Rename the CTE columns to local-only names; the public return signature
-- stays the same.

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
    returning wt.owner_id as nm_owner, wt.amount_cents as nm_amount
  ),
  per_creator as (
    select nm_owner, sum(nm_amount)::bigint as nm_delta
      from newly_matured
     group by nm_owner
  ),
  applied as (
    update profiles p
       set pending_balance_cents = coalesce(p.pending_balance_cents, 0) - pc.nm_delta,
           wallet_balance_cents  = coalesce(p.wallet_balance_cents, 0)  + pc.nm_delta
      from per_creator pc
     where p.id = pc.nm_owner
    returning p.id as ap_creator, pc.nm_delta as ap_delta
  )
  select ap_creator, ap_delta from applied;

  update platform_settings
     set value = jsonb_build_object('ts', to_char(p_now at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
         updated_at = now()
   where key = 'maturity_frontier_at';
end;
$$;

grant execute on function mature_wallet_transactions(timestamptz) to service_role;
