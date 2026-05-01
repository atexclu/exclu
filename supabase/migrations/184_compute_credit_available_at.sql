-- 184_compute_credit_available_at.sql
--
-- Read-only helper exposed to the admin test harness so we can verify both
-- maturity branches (rolling-7d for established accounts, initial-21d hold
-- for accounts younger than 21 days) without waiting in real time.
--
-- The function mirrors the exact logic that lives inside
-- apply_wallet_transaction so a passing preview here is a true proxy for
-- the production behaviour. Pure function — no side effects.

create or replace function compute_credit_available_at(
  p_owner_id uuid default null,
  p_simulated_account_created_at timestamptz default null,
  p_now timestamptz default now()
) returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_created_at timestamptz;
  v_available_at timestamptz;
begin
  -- Caller can pass either a real user id (we read auth.users.created_at)
  -- or a synthetic timestamp for what-if checks.
  if p_simulated_account_created_at is not null then
    v_account_created_at := p_simulated_account_created_at;
  elsif p_owner_id is not null then
    select created_at into v_account_created_at
      from auth.users
     where id = p_owner_id;
  end if;

  if v_account_created_at is not null
     and v_account_created_at + interval '21 days' > p_now then
    -- Initial hold window: every credit unlocks together at day 21.
    v_available_at := v_account_created_at + interval '21 days';
  else
    -- Standard rolling 7-day window.
    v_available_at := p_now + interval '7 days';
  end if;

  return v_available_at;
end;
$$;

grant execute on function compute_credit_available_at(uuid, timestamptz, timestamptz) to service_role;

comment on function compute_credit_available_at(uuid, timestamptz, timestamptz) is
  'Read-only mirror of the maturity branch inside apply_wallet_transaction. Used by the admin test harness to prove both paths (rolling-7d, initial-21d) compute the right available_at without waiting in real time.';
