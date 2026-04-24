-- 171_increment_total_withdrawn.sql
-- Payout success increments the total-withdrawn tracker on the creator's
-- profile. This is a cumulative stat, independent of the wallet ledger.
-- (The wallet debit happened at payout_hold time in request-withdrawal.)

create or replace function increment_total_withdrawn(
  p_user_id uuid,
  p_amount_cents bigint
) returns void
language sql
security definer
set search_path = public
as $$
  update profiles
    set total_withdrawn_cents = coalesce(total_withdrawn_cents, 0) + p_amount_cents
    where id = p_user_id;
$$;

grant execute on function increment_total_withdrawn(uuid, bigint) to service_role;
